"""
Daily AI & Design Research Digest
Runs via GitHub Actions every day at 7 AM CST.
Researches 4 topics using Claude API + web search,
synthesizes findings, and saves a PDF + MD report.
"""

import os
import json
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path

import anthropic
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, HRFlowable
)
from reportlab.lib.enums import TA_CENTER

TODAY = datetime.utcnow().strftime("%Y-%m-%d")
REPORTS_DIR = Path("reports")
REPORTS_DIR.mkdir(exist_ok=True)

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


def research_topic(client: anthropic.Anthropic, topic: dict) -> str:
    """Research a single topic using Claude with web search."""
    print(f"  Researching: {topic['label']}...")

    response = client.messages.create(
        model="claude-opus-4-6",
        max_tokens=2048,
        tools=[{"type": "web_search_20250305", "name": "web_search"}],
        messages=[
            {
                "role": "user",
                "content": (
                    f"Search for the latest news and releases about: {topic['label']}\n\n"
                    f"Search query: {topic['query']}\n\n"
                    "Return ONLY concrete, new items from the last 24-48 hours "
                    "(actual releases, announcements, papers — not opinion pieces).\n\n"
                    "Format each item as:\n"
                    "- [Title] | [Date] | [URL] | [1-sentence summary]\n\n"
                    "If nothing new was found in the last 48h, say: NO_NEW_ITEMS"
                ),
            }
        ],
    )

    # Extract the final text response
    for block in reversed(response.content):
        if hasattr(block, "text"):
            return block.text

    return "NO_NEW_ITEMS"


def synthesize(client: anthropic.Anthropic, findings: dict) -> str:
    """Use Claude to write an executive summary from all findings."""
    print("  Synthesizing executive summary...")

    all_findings = "\n\n".join(
        f"=== {label} ===\n{text}"
        for label, text in findings.items()
    )

    response = client.messages.create(
        model="claude-opus-4-6",
        max_tokens=1024,
        messages=[
            {
                "role": "user",
                "content": (
                    f"Based on today's ({TODAY}) AI & Design research findings below, "
                    "write a concise Executive Summary of 4-5 bullet points covering "
                    "the most important developments. Be specific — mention actual "
                    "product names, numbers, and impact.\n\n"
                    f"{all_findings}"
                ),
            }
        ],
    )
    return response.content[0].text


def save_markdown(findings: dict, summary: str) -> Path:
    """Save the full digest as a Markdown file."""
    md_path = REPORTS_DIR / f"{TODAY}-digest.md"

    lines = [
        f"# AI & Design Daily Digest — {TODAY}\n",
        "## Executive Summary\n",
        summary,
        "\n---\n",
    ]

    section_numbers = {
        "New AI Models": "1",
        "Design-to-Code": "2",
        "AI in UI/UX Design": "3",
        "AI Workflows & Automation": "4",
    }

    for label, text in findings.items():
        num = section_numbers.get(label, "")
        lines.append(f"\n## Section {num} — {label}\n")
        lines.append(text)

    with open(md_path, "w") as f:
        f.write("\n".join(lines))

    print(f"  Markdown saved: {md_path}")
    return md_path


def save_pdf(findings: dict, summary: str) -> Path:
    """Generate a styled PDF report."""
    pdf_path = REPORTS_DIR / f"{TODAY}-digest.pdf"

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
        f"{TODAY} &nbsp;|&nbsp; Powered by Claude API + GitHub Actions", sub_s
    ))
    story.append(HRFlowable(width="100%", thickness=2, color=dark))
    story.append(Spacer(1, 0.12 * inch))

    # Executive summary
    story.append(Paragraph("EXECUTIVE SUMMARY", section_s))
    story.append(Spacer(1, 4))
    for line in summary.strip().split("\n"):
        line = line.strip().lstrip("•-*").strip()
        if line:
            story.append(Paragraph(f"<bullet>&bull;</bullet> {line}", bullet_s))

    story.append(Spacer(1, 0.08 * inch))

    # Sections
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
        for line in text.strip().split("\n"):
            line = line.strip()
            if line and line != "NO_NEW_ITEMS":
                # Bold the title part before the first " | "
                if " | " in line:
                    parts = line.lstrip("-• ").split(" | ", 1)
                    formatted = f"<b>{parts[0]}</b> | {parts[1]}"
                else:
                    formatted = line
                story.append(Paragraph(formatted, body_s))
        story.append(Spacer(1, 0.06 * inch))

    story.append(HRFlowable(width="100%", thickness=1,
                             color=colors.HexColor("#cccccc")))
    story.append(Spacer(1, 0.08 * inch))
    story.append(Paragraph(
        f"Generated automatically on {TODAY} via GitHub Actions &nbsp;|&nbsp; "
        "claude-opus-4-6 + web_search",
        footer_s,
    ))

    doc.build(story)
    print(f"  PDF saved: {pdf_path}")
    return pdf_path


def send_whatsapp(summary: str, today: str) -> None:
    """Send a WhatsApp summary via GREEN-API."""
    phone = os.environ.get("WHATSAPP_NUMBER")
    id_instance = os.environ.get("GREENAPI_ID_INSTANCE")
    api_token = os.environ.get("GREENAPI_API_TOKEN")

    if not phone or not id_instance or not api_token:
        print("  WhatsApp skipped — GREENAPI_ID_INSTANCE, GREENAPI_API_TOKEN o WHATSAPP_NUMBER no configurados.")
        return

    # Build message (WhatsApp limit ~4096 chars)
    lines = [f"*AI & Design Digest — {today}*\n"]
    for line in summary.strip().split("\n"):
        clean = line.strip().lstrip("•-*").strip()
        if clean:
            lines.append(f"• {clean}")
    lines.append(f"\n_Reporte completo: github.com/avinro/claude-c/tree/main/reports_")
    message = "\n".join(lines)

    # GREEN-API: POST to sendMessage endpoint
    url = f"https://api.green-api.com/waInstance{id_instance}/sendMessage/{api_token}"
    chat_id = f"{phone}@c.us"
    payload = json.dumps({"chatId": chat_id, "message": message}).encode("utf-8")

    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            body = r.read().decode()
            print(f"  WhatsApp enviado via GREEN-API — HTTP {r.status} | {body}")
    except Exception as e:
        print(f"  WhatsApp error: {e}")


def main():
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY environment variable not set.")

    client = anthropic.Anthropic(api_key=api_key)

    print(f"\n=== Daily AI & Design Digest — {TODAY} ===\n")

    # Phase 1: Research all 4 topics
    print("PHASE 1: Researching topics...")
    findings = {}
    for topic in TOPICS:
        findings[topic["label"]] = research_topic(client, topic)

    # Count items
    total = sum(
        text.count("\n- ") + (1 if text.strip().startswith("- ") else 0)
        for text in findings.values()
        if text != "NO_NEW_ITEMS"
    )
    print(f"\n  Total items found: {total}")

    if total < 2:
        print("  No relevant content today — skipping digest.")
        return

    # Phase 2: Synthesize
    print("\nPHASE 2: Synthesizing...")
    summary = synthesize(client, findings)

    # Phase 3: Save reports
    print("\nPHASE 3: Saving reports...")
    save_markdown(findings, summary)
    save_pdf(findings, summary)

    # Phase 4: WhatsApp notification
    print("\nPHASE 4: Sending WhatsApp notification...")
    send_whatsapp(summary, TODAY)

    print(f"\nDone! Reports in reports/{TODAY}-digest.{{md,pdf}}")


if __name__ == "__main__":
    main()
