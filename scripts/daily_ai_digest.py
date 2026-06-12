"""
Daily AI & Design Research Digest
Runs via GitHub Actions every morning (04:40 UTC, with an 08:40 UTC backup).
Researches 4 topics using the Gemini API + Google Search grounding,
synthesizes findings, and saves a PDF + MD report.

Resilience strategy:
  - Transient API errors (429 quota, 5xx, network) retry up to 5x with
    exponential backoff (30s→60s→120s→240s→480s).
  - Non-retryable API errors (400 invalid request, 401/403 auth) abort the
    entire run immediately with a non-zero exit code so GitHub Actions marks
    the run as failed — retrying these wastes an hour per run.
  - If a single topic fails after retries, it is marked RESEARCH_FAILED and
    skipped (the rest of the topics continue normally).
  - If synthesis fails, a plain-text summary is assembled from the raw findings.
  - If the PDF render fails, the Markdown report is still saved.
  - If NO topic produced content, the script exits 1 without writing a report,
    so empty "RESEARCH_FAILED" digests are never committed to the repo.
"""

import os
import re
import json
import time
import traceback
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from xml.sax.saxutils import escape

from google import genai
from google.genai import types as genai_types
from google.genai import errors as genai_errors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable
from reportlab.lib.enums import TA_CENTER

TODAY = datetime.now(timezone.utc).strftime("%Y-%m-%d")
REPORTS_DIR = Path("reports")
REPORTS_DIR.mkdir(exist_ok=True)

# gemini-3.1-flash-lite: free tier + Google Search grounding. Override via env.
MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.1-flash-lite")

TOPICS = [
    {
        "id": "ai_models",
        "label": "New AI Models",
        "query": (
            "New AI model releases announcements benchmarks papers "
            f"last 24 hours {TODAY} GPT Claude Gemini Llama Mistral"
        ),
    },
    {
        "id": "design_to_code",
        "label": "Design-to-Code",
        "query": (
            f"design to code AI tool release {TODAY} v0 Vercel Locofy "
            "Anima Builder.io Figma plugin component generation"
        ),
    },
    {
        "id": "ui_ux",
        "label": "AI in UI/UX Design",
        "query": (
            f"Figma AI features generative UI design tools update {TODAY} "
            "Framer AI design assistant component automation"
        ),
    },
    {
        "id": "workflows",
        "label": "AI Workflows & Automation",
        "query": (
            f"MCP server AI agent framework automation release {TODAY} "
            "LangGraph CrewAI Claude agents agentic workflow"
        ),
    },
]

# ---------------------------------------------------------------------------
# Seen-items ledger — dedupe across daily runs
# ---------------------------------------------------------------------------
# reports/seen-items.json maps a normalized item title -> first-seen date.
# It lives in reports/ because the workflow already commits that directory,
# so the ledger persists between GitHub Actions runs.

SEEN_PATH = REPORTS_DIR / "seen-items.json"
SEEN_RETENTION_DAYS = 180  # prune old entries so the file stays small
PROMPT_EXCLUDE_DAYS = 7    # titles fed back into the prompt as "already seen"
PROMPT_EXCLUDE_MAX = 50


def load_seen() -> dict:
    if SEEN_PATH.exists():
        try:
            return json.loads(SEEN_PATH.read_text())
        except json.JSONDecodeError:
            print("  [WARN] seen-items.json is corrupt — starting a fresh ledger.")
    return {}


def save_seen(seen: dict) -> None:
    cutoff = (datetime.now(timezone.utc) - timedelta(days=SEEN_RETENTION_DAYS)).strftime("%Y-%m-%d")
    pruned = {k: v for k, v in seen.items() if v >= cutoff}
    SEEN_PATH.write_text(json.dumps(pruned, indent=1, sort_keys=True) + "\n")
    print(f"  Seen-items ledger saved: {len(pruned)} entries")


def item_key(line: str) -> str | None:
    """Normalize a '- Title | date | url | summary' bullet to a dedupe key."""
    text = line.strip().lstrip("-• ").strip()
    if not text:
        return None
    title = text.split(" | ", 1)[0]
    title = re.sub(r"[\[\]*_`]", "", title)  # markdown noise
    key = re.sub(r"[^a-z0-9 ]", "", title.lower())
    key = re.sub(r"\s+", " ", key).strip()
    return key or None


def recent_seen_titles(seen: dict) -> list[str]:
    """Titles first seen in the last PROMPT_EXCLUDE_DAYS, newest first."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=PROMPT_EXCLUDE_DAYS)).strftime("%Y-%m-%d")
    recent = [(k, v) for k, v in seen.items() if v >= cutoff]
    recent.sort(key=lambda kv: kv[1], reverse=True)
    return [k for k, _ in recent[:PROMPT_EXCLUDE_MAX]]


def filter_new_items(text: str, seen: dict) -> str:
    """
    Drop bullet lines whose title was already reported on a previous day and
    register the surviving ones in the ledger. Returns the filtered text, or
    NO_NEW_ITEMS when every bullet was a repeat.
    """
    kept: list[str] = []
    new_count = 0
    dropped = 0
    for line in text.split("\n"):
        if line.strip().startswith(("-", "•")):
            key = item_key(line)
            if key and key in seen and seen[key] != TODAY:
                dropped += 1
                continue
            if key:
                seen[key] = seen.get(key, TODAY)
                new_count += 1
        kept.append(line)

    if dropped:
        print(f"    Dedupe: {dropped} already-seen item(s) dropped, {new_count} new")
    if new_count == 0:
        return "NO_NEW_ITEMS"
    return "\n".join(kept)


# ---------------------------------------------------------------------------
# Retry helper
# ---------------------------------------------------------------------------

class FatalAPIError(Exception):
    """Non-retryable API failure (billing, auth, permissions) — abort the run."""


def api_call_with_retry(fn, label="call", max_retries=5):
    """
    Call fn(). On 429 quota or transient API errors (5xx, network), wait and
    retry with exponential backoff. Returns None after exhausting all retries
    so the caller can decide how to handle partial results.

    Raises FatalAPIError for non-retryable errors (400 invalid request,
    401/403 auth) — these affect every call in the run, so retrying or
    continuing with other topics just burns CI minutes.
    """
    delay = 30
    last_exc = None
    for attempt in range(max_retries):
        try:
            return fn()
        except genai_errors.APIError as e:
            code = getattr(e, "code", None)
            # 429 (free-tier quota) and 5xx are transient — retry
            if code == 429 or (code is not None and code >= 500):
                last_exc = e
                wait = delay * (2 ** attempt)
                print(f"    [WARN] API error {code} on {label}: {e} — waiting {wait}s "
                      f"(attempt {attempt + 1}/{max_retries})...")
                time.sleep(wait)
                continue
            # 400/401/403/404: same error will hit every topic — fail fast
            raise FatalAPIError(f"{label}: {e}") from e
        except (ConnectionError, TimeoutError) as e:
            last_exc = e
            wait = delay * (2 ** attempt)
            print(f"    [WARN] Network error on {label}: {e} — waiting {wait}s "
                  f"(attempt {attempt + 1}/{max_retries})...")
            time.sleep(wait)
        except Exception as e:
            # Unexpected error — log and abort retries immediately
            print(f"    [ERROR] Unexpected error on {label}: {e}")
            traceback.print_exc()
            return None

    print(f"    [ERROR] {label} failed after {max_retries} retries: {last_exc}")
    return None


# ---------------------------------------------------------------------------
# Research
# ---------------------------------------------------------------------------

def research_topic(client: genai.Client, topic: dict, seen: dict) -> str:
    """Research a single topic. Returns finding text or a FAILED sentinel."""
    print(f"  Researching: {topic['label']}...")

    exclude = recent_seen_titles(seen)
    exclude_block = (
        "\n\nThe following items were ALREADY reported in previous digests — "
        "do NOT include them again, even with rephrased titles:\n"
        + "\n".join(f"- {t}" for t in exclude)
        if exclude
        else ""
    )

    def call():
        return client.models.generate_content(
            model=MODEL,
            contents=(
                f"Search for the latest news and releases about: {topic['label']}\n\n"
                f"Search query: {topic['query']}\n\n"
                "Return ONLY concrete, new items from the last 24-48 hours "
                "(actual releases, announcements, papers — not opinion pieces)."
                f"{exclude_block}\n\n"
                "Format each item as:\n"
                "- [Title] | [Date] | [URL] | [1-sentence summary]\n\n"
                "If nothing new was found in the last 48h, say: NO_NEW_ITEMS"
            ),
            config=genai_types.GenerateContentConfig(
                tools=[genai_types.Tool(google_search=genai_types.GoogleSearch())],
                max_output_tokens=2048,
            ),
        )

    response = api_call_with_retry(call, label=topic["label"])
    if response is None:
        return "RESEARCH_FAILED"

    # response.text is None when the answer was blocked or empty
    text = response.text or "NO_NEW_ITEMS"
    if text.strip() == "NO_NEW_ITEMS":
        return "NO_NEW_ITEMS"
    # Drop items the ledger already knows about
    return filter_new_items(text, seen)


# ---------------------------------------------------------------------------
# Synthesis
# ---------------------------------------------------------------------------

def synthesize(client: genai.Client, findings: dict) -> str:
    """Synthesize an executive summary. Falls back to a plain list if API fails."""
    print("  Synthesizing executive summary...")

    # Only pass topics that actually have content
    usable = {
        label: text for label, text in findings.items()
        if text not in ("NO_NEW_ITEMS", "RESEARCH_FAILED")
    }

    if not usable:
        return "No new content was found today across all tracked topics."

    all_findings = "\n\n".join(
        f"=== {label} ===\n{text}" for label, text in usable.items()
    )

    def call():
        return client.models.generate_content(
            model=MODEL,
            contents=(
                f"Based on today's ({TODAY}) AI & Design research findings below, "
                "write a concise Executive Summary of 4-5 bullet points covering "
                "the most important developments. Be specific — mention actual "
                "product names, numbers, and impact.\n\n"
                f"{all_findings}"
            ),
            config=genai_types.GenerateContentConfig(max_output_tokens=1024),
        )

    response = api_call_with_retry(call, label="synthesis")
    if response is not None and response.text:
        return response.text

    # Fallback: build a plain summary from raw findings
    print("    [WARN] Synthesis API failed — using plain-text fallback summary.")
    lines = [f"Research summary for {TODAY} (auto-generated fallback):\n"]
    for label, text in usable.items():
        first_item = next(
            (l.strip() for l in text.split("\n") if l.strip().startswith("-")),
            None,
        )
        if first_item:
            lines.append(f"• {label}: {first_item.lstrip('- ')}")
    return "\n".join(lines) if len(lines) > 1 else "See individual sections for details."


# ---------------------------------------------------------------------------
# Save reports
# ---------------------------------------------------------------------------

def save_markdown(findings: dict, summary: str) -> Path:
    md_path = REPORTS_DIR / f"{TODAY}-digest.md"

    section_numbers = {
        "New AI Models": "1",
        "Design-to-Code": "2",
        "AI in UI/UX Design": "3",
        "AI Workflows & Automation": "4",
    }

    lines = [
        f"# AI & Design Daily Digest — {TODAY}\n",
        "## Executive Summary\n",
        summary,
        "\n---\n",
    ]
    for label, text in findings.items():
        num = section_numbers.get(label, "")
        lines.append(f"\n## Section {num} — {label}\n")
        lines.append(text)

    with open(md_path, "w") as f:
        f.write("\n".join(lines))

    print(f"  Markdown saved: {md_path}")
    return md_path


def save_pdf(findings: dict, summary: str) -> Path | None:
    """Generate PDF. Returns None on error (Markdown is already saved)."""
    pdf_path = REPORTS_DIR / f"{TODAY}-digest.pdf"

    try:
        doc = SimpleDocTemplate(
            str(pdf_path),
            pagesize=letter,
            rightMargin=0.75 * inch,
            leftMargin=0.75 * inch,
            topMargin=0.75 * inch,
            bottomMargin=0.75 * inch,
        )

        styles = getSampleStyleSheet()
        dark = colors.HexColor("#1a1a2e")
        light_bg = colors.HexColor("#f0f4ff")

        title_s = ParagraphStyle("T", parent=styles["Title"],
            fontSize=22, spaceAfter=6, textColor=dark, alignment=TA_CENTER)
        sub_s = ParagraphStyle("S", parent=styles["Normal"],
            fontSize=10, textColor=colors.HexColor("#555555"),
            alignment=TA_CENTER, spaceAfter=12)
        section_s = ParagraphStyle("H", parent=styles["Heading1"],
            fontSize=12, textColor=colors.white, backColor=dark,
            spaceBefore=14, spaceAfter=6, borderPadding=(4, 6, 4, 6))
        body_s = ParagraphStyle("B", parent=styles["Normal"],
            fontSize=9.5, spaceAfter=5, leftIndent=10, leading=14)
        bullet_s = ParagraphStyle("BU", parent=styles["Normal"],
            fontSize=10, spaceAfter=6, leftIndent=16, leading=15,
            backColor=light_bg, borderPadding=4)
        footer_s = ParagraphStyle("F", parent=styles["Normal"],
            fontSize=7.5, textColor=colors.HexColor("#888888"),
            alignment=TA_CENTER)

        story = []
        story.append(Spacer(1, 0.1 * inch))
        story.append(Paragraph("AI &amp; Design Daily Digest", title_s))
        story.append(Paragraph(
            f"{TODAY} &nbsp;|&nbsp; Powered by Gemini API + GitHub Actions", sub_s
        ))
        story.append(HRFlowable(width="100%", thickness=2, color=dark))
        story.append(Spacer(1, 0.12 * inch))

        story.append(Paragraph("EXECUTIVE SUMMARY", section_s))
        story.append(Spacer(1, 4))
        for line in summary.strip().split("\n"):
            line = line.strip().lstrip("•-*").strip()
            if line:
                story.append(Paragraph(f"<bullet>&bull;</bullet> {escape(line)}", bullet_s))
        story.append(Spacer(1, 0.08 * inch))

        section_labels = {
            "New AI Models": "SECTION 1 — NEW AI MODELS",
            "Design-to-Code": "SECTION 2 — DESIGN-TO-CODE",
            "AI in UI/UX Design": "SECTION 3 — AI IN UI/UX DESIGN",
            "AI Workflows & Automation": "SECTION 4 — AI WORKFLOWS &amp; AUTOMATION",
        }

        for label, text in findings.items():
            heading = section_labels.get(label, label.upper())
            story.append(Paragraph(heading, section_s))
            story.append(Spacer(1, 4))
            display_text = text if text not in ("NO_NEW_ITEMS", "RESEARCH_FAILED") else text
            for line in display_text.strip().split("\n"):
                line = line.strip()
                if line and line not in ("NO_NEW_ITEMS", "RESEARCH_FAILED"):
                    if " | " in line:
                        parts = line.lstrip("-• ").split(" | ", 1)
                        formatted = f"<b>{escape(parts[0])}</b> | {escape(parts[1])}"
                    else:
                        formatted = escape(line)
                    story.append(Paragraph(formatted, body_s))
                elif line in ("NO_NEW_ITEMS", "RESEARCH_FAILED"):
                    story.append(Paragraph(
                        f"<i>{'No new items found' if line == 'NO_NEW_ITEMS' else 'Research unavailable today'}</i>",
                        body_s,
                    ))
            story.append(Spacer(1, 0.06 * inch))

        story.append(HRFlowable(width="100%", thickness=1,
                                 color=colors.HexColor("#cccccc")))
        story.append(Spacer(1, 0.08 * inch))
        story.append(Paragraph(
            f"Generated automatically on {TODAY} via GitHub Actions &nbsp;|&nbsp; "
            f"{MODEL} + Google Search grounding",
            footer_s,
        ))

        doc.build(story)
        print(f"  PDF saved: {pdf_path}")
        return pdf_path

    except Exception as e:
        print(f"  [WARN] PDF generation failed: {e} — Markdown report still available.")
        traceback.print_exc()
        return None


# ---------------------------------------------------------------------------
# WhatsApp
# ---------------------------------------------------------------------------

def send_whatsapp(summary: str, today: str) -> None:
    phone = os.environ.get("WHATSAPP_NUMBER")
    id_instance = os.environ.get("GREENAPI_ID_INSTANCE")
    api_token = os.environ.get("GREENAPI_API_TOKEN")

    if not phone or not id_instance or not api_token:
        print("  WhatsApp skipped — credentials not configured.")
        return
    phone = re.sub(r"\D", "", phone)
    if not phone:
        print("  WhatsApp skipped — WHATSAPP_NUMBER has no digits.")
        return

    base_url = f"https://api.green-api.com/waInstance{id_instance}"
    state_url = f"{base_url}/getStateInstance/{api_token}"
    try:
        with urllib.request.urlopen(state_url, timeout=15) as r:
            state = json.loads(r.read().decode())
        if state.get("stateInstance") != "authorized":
            print(
                "  WhatsApp skipped — GREEN-API not authorized "
                f"({state.get('stateInstance', 'unknown')})."
            )
            return
    except Exception as e:
        print(f"  [WARN] WhatsApp state check failed: {e}")
        return

    lines = [f"*AI & Design Digest — {today}*\n"]
    for line in summary.strip().split("\n"):
        clean = line.strip().lstrip("•-*").strip()
        if clean:
            lines.append(f"• {clean}")
    lines.append(f"\n_Full report: github.com/avinro/claude-c/tree/main/reports_")
    message = "\n".join(lines)

    url = f"{base_url}/sendMessage/{api_token}"
    payload = json.dumps({"chatId": f"{phone}@c.us", "message": message}).encode("utf-8")
    req = urllib.request.Request(
        url, data=payload,
        headers={"Content-Type": "application/json"}, method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            print(f"  WhatsApp sent — HTTP {r.status} | {r.read().decode()}")
    except Exception as e:
        print(f"  [WARN] WhatsApp failed: {e}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("[ERROR] GEMINI_API_KEY not set.")
        raise SystemExit(1)

    client = genai.Client(api_key=api_key)
    print(f"\n=== Daily AI & Design Digest — {TODAY} ===\n")

    seen = load_seen()
    print(f"  Seen-items ledger: {len(seen)} previously reported item(s)\n")

    # Phase 1: Research — each topic is independent; failures are isolated
    print("PHASE 1: Researching topics...")
    findings = {}
    failed_topics = []
    for i, topic in enumerate(TOPICS):
        try:
            findings[topic["label"]] = research_topic(client, topic, seen)
        except FatalAPIError as e:
            print(f"\n[FATAL] Non-retryable API error — aborting run: {e}")
            print("        Check billing/credits and API key at aistudio.google.com")
            raise SystemExit(1)
        if findings[topic["label"]] == "RESEARCH_FAILED":
            failed_topics.append(topic["label"])
        # Pause between calls to reduce rate-limit pressure
        if i < len(TOPICS) - 1:
            time.sleep(10)

    successful = [l for l, t in findings.items() if t not in ("NO_NEW_ITEMS", "RESEARCH_FAILED")]
    print(f"\n  Topics researched successfully: {len(successful)}/{len(TOPICS)}")
    if failed_topics:
        print(f"  [WARN] Failed topics (will be skipped): {', '.join(failed_topics)}")

    total_items = sum(
        text.count("\n- ") + (1 if text.strip().startswith("- ") else 0)
        for text in findings.values()
        if text not in ("NO_NEW_ITEMS", "RESEARCH_FAILED")
    )
    print(f"  Total items found: {total_items}")

    if not successful:
        if failed_topics:
            # No placeholder report: committing "RESEARCH_FAILED" digests
            # pollutes repo history and hides the failure. Fail the workflow.
            print("  [FATAL] No content retrieved today — failing the run.")
            raise SystemExit(1)
        # All topics genuinely had nothing new (API worked, dedupe did its
        # job) — a quiet day is a success, not a failure. No report needed.
        print("  Nothing new today across all topics — no report generated.")
        save_seen(seen)
        return

    # Phase 2: Synthesize
    print("\nPHASE 2: Synthesizing...")
    try:
        summary = synthesize(client, findings)
    except FatalAPIError as e:
        print(f"\n[FATAL] Non-retryable API error during synthesis: {e}")
        raise SystemExit(1)

    # Phase 3: Save reports + persist the dedupe ledger
    print("\nPHASE 3: Saving reports...")
    save_markdown(findings, summary)
    save_pdf(findings, summary)
    save_seen(seen)

    # Phase 4: WhatsApp
    print("\nPHASE 4: Sending WhatsApp notification...")
    send_whatsapp(summary, TODAY)

    print(f"\nDone! Reports in reports/{TODAY}-digest.{{md,pdf}}")


if __name__ == "__main__":
    main()
