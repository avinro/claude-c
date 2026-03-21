/**
 * Envía los borradores de rechazo QA identificados
 * Uso: node scripts/send-qa-rejections.mjs
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '../.env.local');
const envContent = readFileSync(envPath, 'utf-8');

const getEnvVar = (key) => {
  const match = envContent.match(new RegExp(`^${key}=(.+)$`, 'm'));
  return match ? match[1].trim() : null;
};

const CLIENT_ID = getEnvVar('GOOGLE_CLIENT_ID');
const CLIENT_SECRET = getEnvVar('GOOGLE_CLIENT_SECRET');
const REFRESH_TOKEN = getEnvVar('GOOGLE_REFRESH_TOKEN');
const DRY_RUN = process.argv.includes('--dry-run');

const QA_REJECTION_DRAFTS = [
  // Page 2
  { id: 'r4413781192656311285',  name: 'Sapana',        to: 'sapana.bhosale233@gmail.com' },
  { id: 'r3448752717056299467',  name: 'Yashu',         to: 'chagantiyashu@gmail.com' },
  { id: 'r-612690863179759921',  name: 'Kumar',         to: 'kskartikey@gmail.com' },
  { id: 'r-1972273156515864882', name: 'Tejasvini',     to: 'tejasvinipujari123456@gmail.com' },
  { id: 'r3067151050073608020',  name: 'Ashish2',       to: 'nalageashish83@gmail.com' },
  { id: 'r-3173160844847896339', name: 'Gowthami',      to: 'gowthamikolukuluri3@gmail.com' },
  { id: 'r-1491917174859817908', name: 'Raja',          to: 'rajaalukunta765@gmail.com' },
  { id: 'r3402158146534725808',  name: 'Shivani',       to: 'shivanirajakak6777@gmail.com' },
  { id: 'r-4921040345229112108', name: 'Priya',         to: 'priya.cse30@gmail.com' },
  { id: 'r-5072544448295932523', name: 'Vishwajeet',    to: 'vishwajeetpujari143@gmail.com' },
  { id: 'r8469580691853151462',  name: 'Nikitha',       to: 'nikithakasa@gmail.com' },
  { id: 'r6184391804435322445',  name: 'Anjali',        to: 'anjalidhyani67@gmail.com' },
  { id: 'r5943184353706169712',  name: 'Suraj',         to: 'surajnavgire092@gmail.com' },
  { id: 'r4423127667142270190',  name: 'Nithin',        to: 'surojunithin@gmail.com' },
  { id: 'r-7534470245863682413', name: 'Ankit',         to: 'ankit971999@gmail.com' },
  { id: 'r8741421179617453642',  name: 'Mohd Nadeem',   to: 'mn7119281@gmail.com' },
  { id: 'r1841635046695490671',  name: 'Sneha',         to: 'snehamahajan502@gmail.com' },
  { id: 'r-8702420154959088589', name: 'Sai',           to: 'saisau199@gmail.com' },
  { id: 'r4338320584451486269',  name: 'Swati',         to: 'swatighanwat5@gmail.com' },
  { id: 'r5164259250593769594',  name: 'Neha',          to: 'nehashahjuly10@gmail.com' },
  { id: 'r-1076133061994176894', name: 'Shashidhar',    to: 'shashidhar149@gmail.com' },
  { id: 'r6181032175848398067',  name: 'Karthik',       to: 'kkarthikhn@gmail.com' },
  { id: 'r-7687916678343446735', name: 'Surbhi',        to: 'surbhiraghuwanshi13@gmail.com' },
  { id: 'r2784621784877674194',  name: 'Priyanka',      to: 'piyuhire48@gmail.com' },
  { id: 'r4481504436881776845',  name: 'Madhu',         to: 'madhumanchalkar@gmail.com' },
  { id: 'r20053805268493339',    name: 'Rohini',        to: 'rohininakade1@gmail.com' },
  { id: 'r-3760195846539753255', name: 'Akshata',       to: 'akshatapardule24@gmail.com' },
  { id: 'r-3856522885656627306', name: 'Satyam',        to: 'sk27kol@gmail.com' },
  { id: 'r8249718082661682434',  name: 'Reddi Mohan',   to: 'reddimohanbabu2018@gmail.com' },
  { id: 'r2208777001747227001',  name: 'Aaditya',       to: 'aadityanew2025@gmail.com' },
  { id: 'r-6551055627145644998', name: 'Monika',        to: 'monikatsalokhe20@gmail.com' },
  { id: 'r-6004119973126996424', name: 'Amit',          to: 'amitpednekar26490@gmail.com' },
  { id: 'r-2671647497525691912', name: 'Divya',         to: 'divya.it30@gmail.com' },
  { id: 'r-517047514050154663',  name: 'Sameerkhan',    to: 'sameerkhanpathan922@gmail.com' },
  { id: 'r3598416367299781587',  name: 'Nilesh',        to: 'nileshwalzade2001@gmail.com' },
  { id: 'r-2856979098240496798', name: 'Mounika',       to: 'mounikasadaali@gmail.com' },
  { id: 'r-5596277224137408150', name: 'Yogesh',        to: 'kumbhareyogesh17@gmail.com' },
  { id: 'r5830882740239045394',  name: 'Ajinkya',       to: 'ajinkyakhalkar7@gmail.com' },
  { id: 'r3948537394039359547',  name: 'Smrity',        to: 'smritydubey9@gmail.com' },
  { id: 'r-8435114673294091035', name: 'Aditya',        to: 'adityajain260193@gmail.com' },
  { id: 'r-4291516340732956758', name: 'Krutika',       to: 'krutikachalikwar@gmail.com' },
  { id: 'r3403998891401322706',  name: 'Prasad',        to: 'prasadtester04@gmail.com' },
  { id: 'r-5922306312147484390', name: 'Mariya',        to: 'mariyaabisha11@gmail.com' },
  { id: 'r-1013076260450652612', name: 'Sachin',        to: 'haldusachinkumar@gmail.com' },
  { id: 'r-3620992382534540559', name: 'Kavya',         to: 'kavya11.work@gmail.com' },
  { id: 'r-2558250092119585121', name: 'Asif',          to: 'asifmd024@gmail.com' },
  { id: 'r520371270304333708',   name: 'Priyanka2',     to: 'priyankakale887@gmail.com' },
  { id: 'r8900981302554884452',  name: 'Sanjiwani',     to: 'sanjiwanikandekar6776@gmail.com' },
  { id: 'r4363699783825511241',  name: 'Hasheem',       to: 'hasheemakbar32@gmail.com' },
  { id: 'r847807438342751739',   name: 'Jeevesh',       to: 'jeeveshnaidudabbara0687@gmail.com' },
  // Page 3
  { id: 'r-7430081456396057279', name: 'Jhansi',        to: 'jhansimunagala9@gmail.com' },
  { id: 'r-7312845346409414308', name: 'Priyanka3',     to: 'pri21smruti@gmail.com' },
  { id: 'r-1950506468621193049', name: 'Ayesha',        to: 'ayeshaqayyum104@gmail.com' },
  { id: 'r-61352168576140158',   name: 'Komal',         to: 'choudharykomal274@gmail.com' },
  { id: 'r4833729453829142973',  name: 'Ahmed',         to: 'ahmed234mohamed1998@gmail.com' },
  { id: 'r6146797026612426289',  name: 'Muhammad',      to: 'adil.hanif255@gmail.com' },
  { id: 'r-3380598420210664767', name: 'Ruchitha',      to: 'kalluriruchitha.123@gmail.com' },
  { id: 'r3560067740850886457',  name: 'Aeman',         to: 'aemanakram745@gmail.com' },
  { id: 'r3631772330951370384',  name: 'Hamza',         to: 'hamzaali528@gmail.com' },
  { id: 'r-8462540784088040107', name: 'Mayada',        to: 'mayada2gamal@gmail.com' },
  { id: 'r8888341281353031133',  name: 'Muneeb',        to: 'muneebullahkhan922@gmail.com' },
  { id: 'r9126749057540679220',  name: 'Solomon',       to: 'adidelas04@gmail.com' },
  { id: 'r1256490978571338559',  name: 'Sadhana',       to: 'sadhanasingh3012@gmail.com' },
  { id: 'r-6726268946764499772', name: 'Pradnya',       to: 'pradnyaaraut02@gmail.com' },
  { id: 'r5366484179538770871',  name: 'Kunal',         to: 'kunalgupta9165@gmail.com' },
  { id: 'r-6187733695492434664', name: 'Mohamed',       to: 'eng_mohamed_mahmoud@hotmail.com' },
  { id: 'r-5863469807786693710', name: 'Mayuri',        to: 'torawanemayuri61@gmail.com' },
  { id: 'r4407597400547433610',  name: 'Sri Harsha',    to: 'nannamsriharsha24@gmail.com' },
  { id: 'r6296117148166849793',  name: 'Vicky',         to: 'vt76322@gmail.com' },
  { id: 'r-3710214413112407133', name: 'Nishad',        to: 'nishadparekh1996@gmail.com' },
  { id: 'r-4092467165733334984', name: 'Mohamad',       to: 'mohamad55elnagar@gmail.com' },
  { id: 'r1276514025467419815',  name: 'Fazle',         to: 'fazleyazdan345@gmail.com' },
  { id: 'r-887164310897856246',  name: 'Mehrab',        to: 'mehrabyaseen697@gmail.com' },
  { id: 'r-7457088129234976547', name: 'Arti',          to: 'artig7790@gmail.com' },
  { id: 'r8714428761105515617',  name: 'Haider',        to: 'haidernaseem821@gmail.com' },
  { id: 'r-572080361252849438',  name: 'Uma',           to: 'pdeepikauma@gmail.com' },
  { id: 'r-2067367462591886310', name: 'Rohith',        to: 'rohithjayashankar77@gmail.com' },
  { id: 'r-1058619069407168610', name: 'Usman',         to: 'usmanabbas7400@gmail.com' },
  { id: 'r-7071982457966968412', name: 'Aryan',         to: 'aryandubey9584@gmail.com' },
  { id: 'r7635865795457642893',  name: 'Noman',         to: 'nomanshahid878@gmail.com' },
  { id: 'r4069693667360752070',  name: 'Nagesh',        to: 'somanini69@gmail.com' },
  { id: 'r-3502592503456750667', name: 'Ahsan',         to: 'ahsanch7733@gmail.com' },
  { id: 'r-423161055355422523',  name: 'Amr',           to: 'amr.samir.87.2016@gmail.com' },
  { id: 'r4006267834501335427',  name: 'Mazen',         to: 'mazenemad95@gmail.com' },
  { id: 'r-8127131809831740372', name: 'Ahmed2',        to: 'ahmedalaazidan2002@gmail.com' },
  { id: 'r-8985238663362312037', name: 'Jaylan',        to: 'ginakhaled_2011@hotmail.com' },
  { id: 'r7393212871388076887',  name: 'Alif',          to: 'ashidiqramadhan@gmail.com' },
  { id: 'r-3174694067877409771', name: 'Noreen',        to: 'noreenhashimkhan@gmail.com' },
  { id: 'r-4050955735713585154', name: 'Shamal',        to: 'shamalchaudhari@gmail.com' },
  { id: 'r6772207542418058963',  name: 'Fahad',         to: 'raofahad194@gmail.com' },
  { id: 'r5592480802808351182',  name: 'Junaid',        to: 'junaidahmed.it@gmail.com' },
  { id: 'r8046636935775638684',  name: 'Zohaib',        to: 'zohaibhassan666777@gmail.com' },
  { id: 'r2996781740911113764',  name: 'Alfiya',        to: 'alfiya500505@gmail.com' },
  { id: 'r-8305317793703362764', name: 'Sondos',        to: 'alsokary@rocketmail.com' },
  { id: 'r-2214978017904321122', name: 'Syeda',         to: 'syedazehra4407@gmail.com' },
  { id: 'r-5184956028380635006', name: 'Mazen2',        to: 'mazenmamdouh220@gmail.com' },
  { id: 'r7421291101372772370',  name: 'Sherif',        to: 'sherif.makii@gmail.com' },
  { id: 'r5392397262923731088',  name: 'Karthik2',      to: 'karthikpandrangi9131@gmail.com' },
  { id: 'r-5391511517482658866', name: 'Manu',          to: 'manu.saxena729@gmail.com' },
  { id: 'r-7883510099072521620', name: 'Ali',           to: 'alifadel1937@gmail.com' },
  { id: 'r-6704074943095281767', name: 'Muhammad2',     to: 'uk617454@gmail.com' },
  { id: 'r3548020435150662417',  name: 'Swati2',        to: 'swatimeshram468@gmail.com' },
  { id: 'r7533674223650653453',  name: 'Misleidys',     to: 'milita9188@gmail.com' },
  { id: 'r-1518280885485002951', name: 'Suleidy',       to: 'suleidyc87@gmail.com' },
  { id: 'r-1110880475560136797', name: 'Surbhi2',       to: 'kd1809sur@gmail.com' },
  { id: 'r-8516654376237987910', name: 'Digambar',      to: 'digambarg5791@gmail.com' },
  { id: 'r6045835345757386045',  name: 'Rakshita',      to: 'rakshitayadalli82@gmail.com' },
  { id: 'r7918990668533534816',  name: 'Mohammed',      to: 'abdulhameedfazaz@gmail.com' },
  { id: 'r-1810750411747290721', name: 'Manvitha',      to: 'manvithanunna21@gmail.com' },
  { id: 'r136337102956073578',   name: 'Anupam',        to: 'anupamkashid@gmail.com' },
  { id: 'r-8568412212184817945', name: 'Purnima',       to: 'purnimaratnala101@gmail.com' },
  { id: 'r-5162597871943237950', name: 'Rounak',        to: 'rounakpal902@gmail.com' },
  { id: 'r4359896671822881934',  name: 'Tasnim',        to: 'tasnim.ibrahim@iono-tech.com' },
  { id: 'r-1715588505544276998', name: 'Nitin',         to: 'nitin.dahatonde.10@gmail.com' },
  { id: 'r5475391297985519614',  name: 'Govind',        to: 'govindrudra9@gmail.com' },
  { id: 'r4707419516839793805',  name: 'Sanket',        to: 'mulaysanket2000@gmail.com' },
  { id: 'r6774778779299999328',  name: 'Sandesh',       to: 'sandeshshinde3908@gmail.com' },
  { id: 'r-2690467677729438552', name: 'Dipali',        to: 'dipam2110@gmail.com' },
  { id: 'r-2396970501155173873', name: 'Suraj2',        to: 'suraj.13paw@gmail.com' },
  { id: 'r6045953131560852548',  name: 'Ranjitsingh',   to: 'ranjitsolanke30@gmail.com' },
  { id: 'r5658131766114420437',  name: 'Balwant',       to: 'qa.balwant@gmail.com' },
  { id: 'r2589548752700105444',  name: 'Leena',         to: 'sakshi2751@gmail.com' },
  { id: 'r-6596589066609186308', name: 'Urmila',        to: 'urmilachikhalge595@gmail.com' },
  { id: 'r-6106234186159436794', name: 'Avinash',       to: 'avinashpagare992@gmail.com' },
  { id: 'r3189318165033643504',  name: 'Mayur',         to: 'mj495327@gmail.com' },
  { id: 'r5049359678255345767',  name: 'Neha2',         to: 'nehajoshi151194@gmail.com' },
  { id: 'r-986142481712234455',  name: 'Soumyaranjan',  to: 'soumyaranjansahu232@gmail.com' },
  { id: 'r-8243121461775829063', name: 'Jayant',        to: 'jayant.sinha60@gmail.com' },
  { id: 'r7623784186164265850',  name: 'Amruta',        to: 'amruta.vibhande@gmail.com' },
  { id: 'r-1896367706238168317', name: 'Nitin2',        to: 'nitin.gajul2022@gmail.com' },
  { id: 'r8465641846381090854',  name: 'Raj',           to: 'rajkkumar1868@gmail.com' },
  { id: 'r4003486221092440706',  name: 'Vaishnavi',     to: 'vaishnavikalshetti2002@gmail.com' },
  { id: 'r7752947769815091928',  name: 'Sunita',        to: 'sunita1991soy@gmail.com' },
  { id: 'r7569858138992955290',  name: 'Virendra2',     to: 'aryaviru555@gmail.com' },
  { id: 'r8918974408674548951',  name: 'Maisam',        to: 'maisamkhawaja110@gmail.com' },
  { id: 'r-1175607669712933184', name: 'Yash2',         to: 'yash08official@gmail.com' },
  { id: 'r-5083780612080994402', name: 'Shivani2',      to: 'schauhan9703@gmail.com' },
  { id: 'r3082521181849596968',  name: 'Hussain',       to: 'hussainshaikh5199@gmail.com' },
  { id: 'r-4613563282161893455', name: 'Sethu',         to: 'sethurajini1@gmail.com' },
  { id: 'r-8984574323800436021', name: 'Tejas',         to: 'tejaspatil0552@gmail.com' },
  { id: 'r5601806448881869458',  name: 'Akshay',        to: 'shendgeakshay.as@gmail.com' },
  { id: 'r-5651282965371034401', name: 'Suraj3',        to: 'surajnavgire092@gmail.com' },
];

// Obtener access token fresco usando el refresh token
async function getAccessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Error obteniendo token: ${JSON.stringify(data)}`);
  return data.access_token;
}

// Listar todos los borradores
async function listDrafts(token) {
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts?maxResults=50', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return data.drafts || [];
}

// Obtener detalle de un borrador
async function getDraft(token, draftId) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/drafts/${draftId}?format=full`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

// Enviar un borrador
async function sendDraft(token, draftId) {
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id: draftId }),
  });
  return res.json();
}

// Decodificar header de mensaje
function getHeader(headers, name) {
  return headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';
}

// Main
async function main() {
  console.log(`\n📧 Enviando ${QA_REJECTION_DRAFTS.length} rechazos QA... ${DRY_RUN ? '(DRY RUN)' : ''}\n`);

  const token = await getAccessToken();

  if (DRY_RUN) {
    QA_REJECTION_DRAFTS.forEach(d => console.log(`  → ${d.name} <${d.to}>`));
    console.log('\n🔍 DRY RUN — no se enviaron correos.');
    return;
  }

  let sent = 0, failed = 0;

  for (const draft of QA_REJECTION_DRAFTS) {
    try {
      const result = await sendDraft(token, draft.id);
      if (result.id) {
        console.log(`  ✅ ${draft.name} <${draft.to}>`);
        sent++;
      } else {
        console.log(`  ❌ ${draft.name}: ${JSON.stringify(result)}`);
        failed++;
      }
    } catch (err) {
      console.log(`  ❌ ${draft.name}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n✨ Listo: ${sent} enviados, ${failed} fallidos.\n`);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
