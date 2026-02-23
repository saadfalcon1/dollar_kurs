const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.static('public'));

const DATA_FILE = path.join(__dirname, 'data.json');
const SCRAPE_INTERVAL = 30 * 60 * 1000;
const PORT = process.env.PORT || 3000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36';

// ============================================
//  KURS ORALIG'I
// ============================================
const USD_MIN = 10000;
const USD_MAX = 13500;

// ============================================
//  31 TA BANK
//  js: false → fetch (tez, ~1s)
//  js: true  → puppeteer (sekin, ~5s)
//  wait: ms  → qo'shimcha kutish
//  altUrl    → asosiy URL ishlamasa alternativa
// ============================================
const BANKS = [
  // ── FETCH (tez) ────────────────────────────────
  { name: 'Ipoteka Bank',        url: 'https://www.ipotekabank.uz/currency/',                js: false },
  { name: 'KDB Bank Uzbekistan', url: 'https://kdb.uz/ru/interactive-services/exchange-rates', js: false },
  { name: 'Microcreditbank',     url: 'https://mkbank.uz/ru/services/exchange-rates/',        js: false },
  { name: 'Octobank',            url: 'https://octobank.uz/o-banke/kurs-valyut',             js: false },
  { name: 'Poytaxt Bank',        url: 'https://poytaxtbank.uz/ru/services/exchange-rates/',   js: false },
  { name: 'Orient Finans Bank',  url: 'https://ofb.uz/about/kurs-obmena-valyut/',             js: false },
  { name: 'TBC Bank',            url: 'https://tbcbank.uz/ru/currencies/',                   js: false }, // fetch bilan ishlaydi
  { name: 'Trastbank',           url: 'https://trustbank.uz/ru/services/exchange-rates/',     js: false },

  // ── PUPPETEER ───────────────────────────────────
  { name: 'Agrobank',            url: 'https://agrobank.uz/ru/person/exchange_rates',          js: true  },
  { name: 'AloqaBank',           url: 'https://aloqabank.uz/ru/services/exchange-rates/',      js: true  },
  { name: 'ANOR BANK',           url: 'https://anorbank.uz/about/exchange-rates/',             js: true  },
  { name: 'APEXBANK',            url: 'https://www.apexbank.uz/ru/about/exchange-rates/',      js: true  },
  { name: 'Asakabank',           url: 'https://asakabank.uz/ru/physical-persons/home',         js: true, wait: 7000 },
  // Asia Alliance Bank — to'g'ri URL (courses emas, exchange-rates)
  { name: 'Asia Alliance Bank',  url: 'https://aab.uz/ru/exchange-rates/',                    js: true,
    altUrl: 'https://aab.uz/ru/about/exchange-rates/'  },
  { name: 'BRB',                 url: 'https://brb.uz/',                                       js: true  },
  { name: 'DavrBank',            url: 'https://davrbank.uz/ru/exchange-rate',                   js: true  },
  { name: 'Garant Bank',         url: 'https://garantbank.uz/ru/exchange-rates',                js: true  },
  { name: 'Hamkorbank',          url: 'https://hamkorbank.uz/exchange-rate/',                   js: true  },
  { name: 'Hayot Bank',          url: 'https://hayotbank.uz/main/exchange-rate',                js: true  },
  { name: 'InFinBank',           url: 'https://www.infinbank.com/ru/private/exchange-rates/',   js: true  },
  { name: "Ipak Yo'li Banki",    url: 'https://ipakyulibank.uz/physical/valyuta-ayirboshlash', js: true  },
  { name: 'Kapitalbank',         url: 'https://www.kapitalbank.uz/uz/services/exchange-rates/', js: true  },
  { name: 'Madad Invest Bank',   url: 'https://www.madadinvestbank.uz/',                       js: true  },
  { name: 'Tenge Bank',          url: 'https://tengebank.uz/exchange-rates',                    js: true  },
  { name: 'Turon Bank',          url: 'https://turonbank.uz/ru/services/exchange-rates/',       js: true  },
  { name: 'Universalbank',       url: 'https://universalbank.uz/currency',                     js: true, wait: 7000 },
  { name: 'SaderatBank',         url: 'https://saderatbank.uz/',                               js: true  },
  { name: 'SanoatQurilishBank',  url: 'https://sqb.uz/uz/individuals/exchange-money/',         js: true  },
  { name: 'Ziraat Bank',         url: 'https://ziraatbank.uz/ru/exchange-rates',                js: true  },
  { name: 'NBU (UzNatsbank)',    url: 'https://nbu.uz/ru/fizicheskim-litsam-kursy-valyut',     js: true  },
  { name: 'Xalq Banki',          url: 'https://xb.uz/page/valyuta-ayirboshlash',               js: true  },
];

// ============================================
//  NOM MAPPING (Telegram → standart)
// ============================================
const NAME_MAP = {
  'garant bank': 'Garant Bank', 'garantbank': 'Garant Bank',
  'anorbank': 'ANOR BANK', 'anor bank': 'ANOR BANK',
  'infinbank': 'InFinBank', 'infin bank': 'InFinBank',
  'asakabank': 'Asakabank', 'asaka bank': 'Asakabank',
  'brb': 'BRB',
  'hamkorbank': 'Hamkorbank', 'hamkor bank': 'Hamkorbank',
  'poytaxt bank': 'Poytaxt Bank', 'poytaxtbank': 'Poytaxt Bank',
  'turon bank': 'Turon Bank', 'turonbank': 'Turon Bank',
  'ziraat bank': 'Ziraat Bank', 'ziraat bank uzbekiston': 'Ziraat Bank',
  'hayot bank': 'Hayot Bank', 'hayotbank': 'Hayot Bank',
  'orient finans bank': 'Orient Finans Bank', 'orient finansbank': 'Orient Finans Bank',
  'mkbank': 'Microcreditbank', 'microcreditbank': 'Microcreditbank', 'mikrokreditbank': 'Microcreditbank',
  'asia alliance bank': 'Asia Alliance Bank',
  "o'zsanoatqurilishbank": 'SanoatQurilishBank', 'sqb': 'SanoatQurilishBank', 'sanoatqurilishbank': 'SanoatQurilishBank',
  "ipak yo'li bank": "Ipak Yo'li Banki", "ipak yuli bank": "Ipak Yo'li Banki", "ipakyulibank": "Ipak Yo'li Banki",
  'octobank': 'Octobank',
  'aloqabank': 'AloqaBank', 'aloqa bank': 'AloqaBank',
  'xalq banki': 'Xalq Banki', 'xalqbank': 'Xalq Banki',
  'ipoteka bank': 'Ipoteka Bank', 'ipotekabank': 'Ipoteka Bank',
  'kdb bank uzbekiston': 'KDB Bank Uzbekistan', 'kdb bank uzbekistan': 'KDB Bank Uzbekistan', 'kdb': 'KDB Bank Uzbekistan',
  'agrobank': 'Agrobank',
  'trastbank': 'Trastbank', 'trast bank': 'Trastbank', 'trustbank': 'Trastbank',
  'kapitalbank': 'Kapitalbank', 'kapital bank': 'Kapitalbank',
  'tenge bank': 'Tenge Bank', 'tengebank': 'Tenge Bank',
  'davrbank': 'DavrBank', 'davr bank': 'DavrBank',
  'apexbank': 'APEXBANK', 'apex bank': 'APEXBANK',
  'nbu': 'NBU (UzNatsbank)', "o'zbekiston milliy banki": 'NBU (UzNatsbank)',
  'saderat bank': 'SaderatBank', 'saderatbank': 'SaderatBank',
  'universalbank': 'Universalbank', 'universal bank': 'Universalbank',
  'madad invest bank': 'Madad Invest Bank', 'madadinvestbank': 'Madad Invest Bank',
  'tbc bank': 'TBC Bank', 'tbcbank': 'TBC Bank',
};

function normName(raw) {
  const key = (raw || '').toLowerCase().trim().replace(/[''`ʻ]/g, "'").replace(/\s+/g, ' ');
  return NAME_MAP[key] || raw.trim();
}

// ============================================
//  PUPPETEER
// ============================================
let puppeteerLib = null;
let browser = null;

async function getBrowser() {
  if (!browser || !browser.isConnected()) {
    if (!puppeteerLib) puppeteerLib = require('puppeteer');
    browser = await puppeteerLib.launch({
      headless: 'new',
      args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage',
             '--disable-gpu','--disable-extensions','--disable-background-networking',
             '--window-size=1366,768'],
    });
    console.log('[BROWSER] ✅ Ishga tushdi');
  }
  return browser;
}

async function newPage() {
  const br = await getBrowser();
  const page = await br.newPage();
  await page.setUserAgent(UA);
  await page.setViewport({ width: 1366, height: 768 });
  await page.setDefaultNavigationTimeout(22000);
  return page;
}

// ============================================
//  FILE
// ============================================
function saveData(d) {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2), 'utf8'); }
  catch (e) { console.error('[FILE]', e.message); }
}
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const d = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      console.log(`[FILE] ✅ ${d.banks?.length || 0} ta bank yuklandi`);
      return d;
    }
  } catch (e) { console.error('[FILE]', e.message); }
  return null;
}
let currentData = loadData() || { banks: [], postDate: null, lastFetch: 0, source: 'none' };

function getDateFormatted(daysAgo = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
}

// ============================================
//  RATE PARSE + VALIDATSIYA
// ============================================
function parseRate(str) {
  if (!str && str !== 0) return null;
  const c = String(str)
    .replace(/so'm|сум|сўм|uzs/gi,'')
    .replace(/[\s\u00a0\u202f'`]/g,'')
    .replace(',','.');
  const v = parseFloat(c);
  if (isNaN(v) || v < USD_MIN || v > USD_MAX) return null;
  return Math.round(v);
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g,' ').replace(/&[a-z#\d]+;/gi,' ').replace(/\s+/g,' ').trim();
}

// buy < sell bo'lishi kerak. Agar buy > sell → almashtirish
function validateAndFix(name, buy, sell) {
  let b = buy, s = sell;
  if (b && (b < USD_MIN || b > USD_MAX)) b = null;
  if (s && (s < USD_MIN || s > USD_MAX)) s = null;
  if (b && s && b > s) {
    [b, s] = [s, b];
    console.log(`  🔧 [${name}] buy↔sell almashtirildi (${b}↔${s})`);
  }
  return { buy: b, sell: s };
}

// ============================================
//  DOM EXTRACT — kengaytirilgan
//  Ko'proq tabel strukturalari va matn formatlari
// ============================================
const DOM_EXTRACT_FN = `(function() {
  function num(s) {
    var c = String(s).replace(/so'm|сум|uzs/gi,'').replace(/[\\s\\u00a0']/g,'').replace(',','.');
    var v = parseFloat(c);
    return (isNaN(v)||v<10000||v>13500)?null:Math.round(v);
  }
  var UR = [/^USD$/i,/^840$/,/доллар\\s*сша/i,/^доллар$/i,/^dollar$/i,/us\\s*dollar/i,/aqsh.*dollar/i,/американский/i];
  function isU(t){return UR.some(function(p){return p.test((t||'').trim());});}
  var BUY  = /buy|покупк|sotib.*olish|olish kursi|sotib ol/i;
  var SELL = /sell|продаж|sotish kursi|реализ/i;

  // 1. TABLE — header orqali
  for(var tbl of document.querySelectorAll('table')){
    var rows=[...tbl.querySelectorAll('tr')], bc=-1, sc=-1;
    for(var row of rows){
      var cells=[...row.querySelectorAll('td,th')].map(function(c){return c.innerText.trim();});
      var j=cells.join(' ');
      if(BUY.test(j)&&SELL.test(j)){
        cells.forEach(function(c,i){if(BUY.test(c)&&bc<0)bc=i;if(SELL.test(c)&&sc<0)sc=i;});
        continue;
      }
      if(cells.some(isU)){
        var b=null,s=null;
        if(bc>=0&&sc>=0){b=num(cells[bc]);s=num(cells[sc]);}
        else{
          // Headerda topilmagan — barcha raqamlarni olish
          var ns=cells.map(num).filter(Boolean);
          if(ns.length>=2){b=ns[0];s=ns[ns.length-1];}
          else if(ns.length===1){b=ns[0];}
        }
        if(b||s)return{buy:b,sell:s,src:'table'};
      }
    }
  }

  // 2. TEXT LINES — USD so'zi topilgandan keyingi raqamlar
  var lines=document.body.innerText.split('\\n').map(function(l){return l.trim();}).filter(Boolean);
  for(var i=0;i<lines.length;i++){
    if(isU(lines[i])){
      var ns=[], context=[];
      // Oldingi va keyingi satrlarga qarash
      for(var j=Math.max(0,i-2);j<Math.min(i+12,lines.length);j++){
        if(j===i)continue;
        var n=num(lines[j]);
        if(n!==null){ns.push(n);context.push({line:lines[j],val:n});}
      }
      if(ns.length>=2)return{buy:ns[0],sell:ns[1],src:'lines'};
      if(ns.length===1)return{buy:ns[0],sell:null,src:'lines'};
    }
  }

  // 3. Buy/Sell bloklarini qidirish (header → value pattern)
  var buyVal=null, sellVal=null;
  for(var i=0;i<lines.length;i++){
    if(BUY.test(lines[i])&&!SELL.test(lines[i])){
      for(var j=i+1;j<Math.min(i+5,lines.length);j++){
        var n=num(lines[j]);
        if(n!==null&&buyVal===null){buyVal=n;break;}
      }
    }
    if(SELL.test(lines[i])&&!BUY.test(lines[i])){
      for(var j=i+1;j<Math.min(i+5,lines.length);j++){
        var n=num(lines[j]);
        if(n!==null&&sellVal===null){sellVal=n;break;}
      }
    }
  }
  if(buyVal||sellVal)return{buy:buyVal,sell:sellVal,src:'headers'};

  // 4. JSON ma'lumotlar (script tag ichida yoki data atribut)
  var scripts=document.querySelectorAll('script:not([src])');
  for(var sc of scripts){
    var txt=sc.textContent||'';
    var bm=txt.match(/"(?:buy|purchase|покупка|olish)[_\w]*"\s*:\s*"?([\d.,]+)"?/i);
    var sm=txt.match(/"(?:sell|sale|продажа|sotish)[_\w]*"\s*:\s*"?([\d.,]+)"?/i);
    var b=bm?num(bm[1]):null, s=sm?num(sm[1]):null;
    if(b||s)return{buy:b,sell:s,src:'json'};
  }

  return{buy:null,sell:null};
})()`;

// ============================================
//  FETCH PARSER (sodda HTML saytlar uchun)
// ============================================
const USD_RE_LIST = [/^USD$/i,/^840$/,/доллар\s*сша/i,/us\s*dollar/i,/aqsh.*dollari/i,/^доллар$/i,/^dollar$/i];
const BUY_RE  = /buy|sotib.*olish|olish kursi|покупк|purchase/i;
const SELL_RE = /sell|sotish kursi|продаж|sale/i;
function isUSD(t) { return USD_RE_LIST.some(p => p.test((t||'').trim())); }

function parseTableHTML(html) {
  const tableRe = /<table[\s\S]*?<\/table>/gi;
  let tm;
  while ((tm = tableRe.exec(html)) !== null) {
    const rows = [];
    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rm;
    while ((rm = rowRe.exec(tm[0])) !== null) {
      const cells = [];
      const cr = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
      let cm;
      while ((cm = cr.exec(rm[1])) !== null) cells.push(stripTags(cm[1]).trim());
      if (cells.length) rows.push(cells);
    }
    let bc=-1, sc=-1;
    for (const row of rows) {
      const low = row.join(' ');
      if (BUY_RE.test(low) && SELL_RE.test(low)) {
        row.forEach((c,i) => { if(BUY_RE.test(c)&&bc<0) bc=i; if(SELL_RE.test(c)&&sc<0) sc=i; });
        continue;
      }
      if (row.some(c => isUSD(c))) {
        let buy=null, sell=null;
        if (bc>=0&&sc>=0) { buy=parseRate(row[bc]); sell=parseRate(row[sc]); }
        else {
          const ns=row.map(c=>parseRate(c)).filter(v=>v!==null);
          if(ns.length>=2){buy=ns[0];sell=ns[ns.length-1];}
          else if(ns.length===1){buy=ns[0];}
        }
        if(buy||sell) return{buy,sell};
      }
    }
  }
  return {buy:null,sell:null};
}

function regexFallback(html) {
  const jB=html.match(/"(?:buy|purchase|покупка|olish)[_\w]*"\s*:\s*"?([\d.,\s]+)"?/i);
  const jS=html.match(/"(?:sell|sale|продажа|sotish)[_\w]*"\s*:\s*"?([\d.,\s]+)"?/i);
  const buy=jB?parseRate(jB[1]):null;
  const sell=jS?parseRate(jS[1]):null;
  if(buy||sell) return{buy,sell};
  for(const term of ['USD','Доллар США','Доллар','Dollar']){
    const re=new RegExp(term+'[\\s\\S]{0,400}','gi');
    let m;
    while((m=re.exec(html))!==null){
      const ns=[...stripTags(m[0]).matchAll(/\b(1[01]\d{3})\b/g)]
        .map(x=>parseRate(x[1])).filter(v=>v!==null);
      if(ns.length>=2) return{buy:ns[0],sell:ns[ns.length-1]};
    }
  }
  return{buy:null,sell:null};
}

// ============================================
//  FETCH (sodda HTML)
// ============================================
async function doFetch(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': UA, Accept: 'text/html,*/*', 'Accept-Language': 'ru,uz;q=0.9' },
    });
    clearTimeout(t);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally { clearTimeout(t); }
}

// ============================================
//  PUPPETEER (JS saytlar)
// ============================================
async function doPuppeteer(bank) {
  const page = await newPage();
  try {
    await page.setRequestInterception(true);
    page.on('request', req => {
      const t = req.resourceType();
      if(t==='image'||t==='media'||t==='font'||t==='stylesheet') req.abort();
      else req.continue();
    });

    await page.goto(bank.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await new Promise(r => setTimeout(r, bank.wait || 3000));

    return await page.evaluate(DOM_EXTRACT_FN);
  } finally {
    try { await page.close(); } catch(_){}
  }
}

// ============================================
//  BITTA BANK SCRAPE
//  - Asosiy URL ishlamasa altUrl sinash
// ============================================
async function scrapeOneBank(bank) {
  try {
    let result = { buy: null, sell: null };

    if (!bank.js) {
      // FETCH
      try {
        const html = await doFetch(bank.url);
        result = parseTableHTML(html);
        if (!result.buy && !result.sell) result = regexFallback(html);
      } catch (e) {
        if (bank.altUrl) {
          const html = await doFetch(bank.altUrl);
          result = parseTableHTML(html);
          if (!result.buy && !result.sell) result = regexFallback(html);
        } else throw e;
      }
    } else {
      // PUPPETEER
      result = await doPuppeteer(bank);

      // Topilmasa altUrl sinash
      if (!result.buy && !result.sell && bank.altUrl) {
        console.log(`  🔄 [${bank.name}] altUrl sinilmoqda...`);
        const altBank = { ...bank, url: bank.altUrl, altUrl: null };
        result = await doPuppeteer(altBank);
      }

      // Hali ham bo'sh bo'lsa HTML parse sinash
      if (!result.buy && !result.sell) {
        try {
          const html = await doFetch(bank.url);
          const r2 = parseTableHTML(html);
          if (r2.buy || r2.sell) result = r2;
        } catch(_) {}
      }
    }

    const fixed = validateAndFix(bank.name, result.buy, result.sell);

    if (fixed.buy || fixed.sell) {
      console.log(`  ✅ ${bank.name.padEnd(22)} buy=${(fixed.buy?.toLocaleString()||'—').padStart(7)} sell=${(fixed.sell?.toLocaleString()||'—').padStart(7)}`);
      return { name: bank.name, ...fixed, source: 'own' };
    }

    console.log(`  ⚠️  ${bank.name} — topilmadi`);
    return { name: bank.name, buy: null, sell: null, source: 'none' };
  } catch (err) {
    console.log(`  ❌ ${bank.name} — ${err.message.substring(0,60)}`);
    return { name: bank.name, buy: null, sell: null, source: 'error' };
  }
}

// ============================================
//  TELEGRAM @dollar_saad
// ============================================
async function scrapeTelegram() {
  const today     = getDateFormatted(0);
  const yesterday = getDateFormatted(1);
  const twoDaysAgo = getDateFormatted(2);

  console.log(`\n[TELEGRAM] @dollar_saad → "${today}" qidirilmoqda...`);
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch('https://t.me/s/dollar_saad', {
      signal: ctrl.signal,
      headers: { 'User-Agent': UA, 'Accept-Language': 'uz,ru;q=0.9' },
    });
    clearTimeout(t);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    const posts = [];
    const regex = /<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
    let match;
    while ((match = regex.exec(html)) !== null) {
      let text = match[1]
        .replace(/<br\s*\/?>/gi,'\n')
        .replace(/<\/?(b|strong|i|em|u|s|code|pre|a|span)[^>]*>/gi,'')
        .replace(/<[^>]+>/g,'')
        .replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
        .replace(/&quot;/g,'"').replace(/&laquo;/g,'«').replace(/&raquo;/g,'»')
        .replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(parseInt(n)))
        .replace(/&#x([0-9a-fA-F]+);/g,(_,n)=>String.fromCharCode(parseInt(n,16)))
        .trim();
      if (text.length > 20) posts.push(text);
    }

    console.log(`[TELEGRAM] ${posts.length} ta post`);

    let targetPost = null, foundDate = null;
    for (const dateStr of [today, yesterday, twoDaysAgo]) {
      for (let i = posts.length-1; i >= 0; i--) {
        const p = posts[i];
        if (p.includes(`Dollar kursi - ${dateStr}`) ||
            p.includes(`Dollar kursi — ${dateStr}`) ||
            p.includes(`Dollar kursi – ${dateStr}`) ||
            p.includes(`dollar kursi - ${dateStr}`)) {
          targetPost = p; foundDate = dateStr; break;
        }
      }
      if (targetPost) break;
    }
    if (!targetPost) {
      for (let i = posts.length-1; i >= 0; i--) {
        if (posts[i].toLowerCase().includes('dollar kursi')) {
          targetPost = posts[i];
          const dm = targetPost.match(/[Dd]ollar kursi\s*[-–—]\s*([\d.]+)/);
          foundDate = dm ? dm[1] : '?';
          break;
        }
      }
    }
    if (!targetPost) { console.log('[TELEGRAM] ❌ Post topilmadi'); return {}; }

    console.log(`[TELEGRAM] ✅ Post: ${foundDate}`);

    const lines = targetPost.split('\n').map(l=>l.trim()).filter(l=>l.length>0);
    const buyMap={}, sellMap={};
    let section = null;

    for (const line of lines) {
      const lower = line.toLowerCase();
      if (lower.includes('olish kursi')||lower.includes('sotib olish')||lower==='olish:'||lower==='olish') {
        section='buy'; continue;
      }
      if ((lower.includes('sotish kursi')||lower==='sotish:'||lower==='sotish')&&!lower.includes('olish')) {
        section='sell'; continue;
      }
      if (!section) continue;

      if (line.startsWith('-')||line.startsWith('–')||line.startsWith('—')||line.startsWith('•')) {
        const cleaned = line.replace(/^\s*[-–—•]\s*/,'').trim();
        const dashIdx  = cleaned.lastIndexOf(' - ');
        const emDashIdx= cleaned.lastIndexOf(' — ');
        const enDashIdx= cleaned.lastIndexOf(' – ');
        const sepIdx   = Math.max(dashIdx, emDashIdx, enDashIdx);
        if (sepIdx === -1) continue;

        const rawName  = cleaned.substring(0, sepIdx).trim();
        const valueStr = cleaned.substring(sepIdx+3).trim();
        const value    = parseInt(valueStr.replace(/[\s.,']/g,''));

        if (rawName.length >= 2 && value >= USD_MIN && value <= USD_MAX) {
          const stdName = normName(rawName);
          if (section==='buy')  buyMap[stdName]=value;
          else                  sellMap[stdName]=value;
        }
      }
    }

    const results = {};
    new Set([...Object.keys(buyMap),...Object.keys(sellMap)]).forEach(name => {
      const buy=buyMap[name]||null, sell=sellMap[name]||null;
      if(buy||sell) results[name]={buy,sell};
    });

    console.log(`[TELEGRAM] ✅ ${Object.keys(results).length} ta bank topildi`);
    for(const [name,r] of Object.entries(results)) {
      console.log(`  [TG] ${name.padEnd(22)} olish=${(r.buy?.toLocaleString()||'—').padStart(7)} sotish=${(r.sell?.toLocaleString()||'—').padStart(7)}`);
    }
    return results;
  } catch(err) {
    console.error('[TELEGRAM] ❌', err.message);
    return {};
  }
}

// ============================================
//  ASOSIY SCRAPE — 2 BOSQICH
//
//  1) O'z saytdan — PARALLEL x5
//     (fetch banklar hammasi bir vaqtda,
//      puppeteer banklar 5 ta parallel)
//  2) Topilmagan/qisman/noto'g'ri → TELEGRAM
//
//  MUHIM: TG tuzatgandan keyin qayta validate!
// ============================================
async function scrapeAndSave() {
  const startTime = Date.now();
  const line = '═'.repeat(56);
  console.log(`\n${line}\n[SCRAPE] ${new Date().toLocaleString()}\n${line}`);

  const results = {};

  const getMissing    = ()=>BANKS.filter(b=>!results[b.name]?.buy&&!results[b.name]?.sell).map(b=>b.name);
  const getIncomplete = ()=>BANKS.filter(b=>{const r=results[b.name];return r&&((r.buy&&!r.sell)||(!r.buy&&r.sell));}).map(b=>b.name);
  const getBad        = ()=>BANKS.filter(b=>{
    const r=results[b.name];
    if(!r) return false;
    // buy > sell yoki juda katta/kichik
    return (r.buy&&r.sell&&r.buy>r.sell)||(r.buy&&r.buy>USD_MAX)||(r.sell&&r.sell>USD_MAX);
  }).map(b=>b.name);

  // ─── 1-QADAM: O'Z SAYTIDAN — PARALLEL ───
  const fetchBanks = BANKS.filter(b=>!b.js);
  const puppBanks  = BANKS.filter(b=>b.js);
  console.log(`\n[1-QADAM] Fetch: ${fetchBanks.length} | Puppeteer: ${puppBanks.length} | Parallel: x5\n`);

  // Fetch banklari — hammasi parallel (tez, ~1s)
  const fetchRes = await Promise.all(fetchBanks.map(scrapeOneBank));
  fetchRes.forEach(r => { results[r.name]={buy:r.buy,sell:r.sell,source:r.source}; });

  // Puppeteer banklari — 5 ta parallel
  const BATCH = 5;
  for (let i=0; i<puppBanks.length; i+=BATCH) {
    const batch = puppBanks.slice(i, i+BATCH);
    const bRes  = await Promise.all(batch.map(scrapeOneBank));
    bRes.forEach(r => { results[r.name]={buy:r.buy,sell:r.sell,source:r.source}; });
  }

  const miss1 = getMissing();
  const inc1  = getIncomplete();
  const bad1  = getBad();

  console.log(`\n[1-QADAM] ✅ ${BANKS.length-miss1.length}/${BANKS.length} topildi`);
  if(miss1.length) console.log(`  ❌ Yo'q:    ${miss1.join(', ')}`);
  if(inc1.length)  console.log(`  ⚠️  Qisman:  ${inc1.join(', ')}`);
  if(bad1.length)  console.log(`  🔴 Noto'g'ri: ${bad1.join(', ')}`);

  // ─── 2-QADAM: TELEGRAM ───
  const tgNeeded = [...new Set([...miss1,...inc1,...bad1])];

  if (tgNeeded.length > 0) {
    console.log(`\n[2-QADAM] ${tgNeeded.length} bank uchun Telegram...`);
    const tg = await scrapeTelegram();

    // A) To'liq yo'q banklar
    for (const name of getMissing()) {
      if (tg[name]) {
        const fixed = validateAndFix(name, tg[name].buy, tg[name].sell);
        if (fixed.buy||fixed.sell) {
          results[name]={...fixed,source:'telegram'};
          console.log(`  📥 [${name}] Telegram: buy=${fixed.buy?.toLocaleString()||'—'} sell=${fixed.sell?.toLocaleString()||'—'}`);
        }
      }
    }

    // B) Qisman — kamchilikni TG dan to'ldirish
    for (const name of getIncomplete()) {
      if (!tg[name]) continue;
      const ex=results[name];
      if (!ex.buy&&tg[name].buy&&tg[name].buy>=USD_MIN&&tg[name].buy<=USD_MAX) {
        ex.buy=tg[name].buy; ex.source+='|tg';
        console.log(`  🔧 [${name}] buy TG: ${tg[name].buy.toLocaleString()}`);
      }
      if (!ex.sell&&tg[name].sell&&tg[name].sell>=USD_MIN&&tg[name].sell<=USD_MAX) {
        ex.sell=tg[name].sell; ex.source+='|tg';
        console.log(`  🔧 [${name}] sell TG: ${tg[name].sell.toLocaleString()}`);
      }
    }

    // C) Noto'g'ri qiymatlar — TG dan tuzatish yoki o'chirish
    for (const name of getBad()) {
      const r=results[name], tgr=tg[name];
      // buy > sell holatini tuzatish
      if(r.buy&&r.sell&&r.buy>r.sell){
        if(tgr?.buy&&tgr.buy<tgr.sell){
          r.buy=tgr.buy; r.sell=tgr.sell; r.source+='|tg-fix';
          console.log(`  🔧 [${name}] TG dan almashtir: buy=${r.buy} sell=${r.sell}`);
        } else {
          // TG ham yo'q → almashtirib ko'r
          [r.buy,r.sell]=[r.sell,r.buy];
          r.source+='|swap';
          console.log(`  🔧 [${name}] swap: buy=${r.buy} sell=${r.sell}`);
        }
      }
      if(r.buy&&r.buy>USD_MAX){
        r.buy=tgr?.buy||null; r.source+='|tg-fix';
        console.log(`  🔧 [${name}] buy o'chirildi (>${USD_MAX})`);
      }
      if(r.sell&&r.sell>USD_MAX){
        r.sell=tgr?.sell||null; r.source+='|tg-fix';
        console.log(`  🔧 [${name}] sell o'chirildi (>${USD_MAX})`);
      }
    }

    // ⚠️ TG tuzatgandan keyin QAYTA VALIDATE qilish
    for (const name of tgNeeded) {
      if (!results[name]) continue;
      const r=results[name];
      if(r.buy&&r.sell&&r.buy>r.sell){
        [r.buy,r.sell]=[r.sell,r.buy];
        r.source+='|re-fix';
        console.log(`  🔁 [${name}] qayta fix: buy=${r.buy} sell=${r.sell}`);
      }
    }
  }

  // ─── NATIJA ───
  const banks = BANKS.map(b => ({
    name:   b.name,
    buy:    results[b.name]?.buy   || null,
    sell:   results[b.name]?.sell  || null,
    source: results[b.name]?.source || 'none',
  }));

  const successCount = banks.filter(b=>b.buy||b.sell).length;
  const fullCount    = banks.filter(b=>b.buy&&b.sell).length;
  const partialCount = banks.filter(b=>(b.buy&&!b.sell)||(!b.buy&&b.sell)).length;
  const ownCount     = banks.filter(b=>b.source?.startsWith('own')).length;
  const tgCount      = banks.filter(b=>b.source==='telegram').length;
  const mixedCount   = banks.filter(b=>b.source?.includes('|')||b.source?.includes('+')).length;
  const failedBanks  = banks.filter(b=>!b.buy&&!b.sell).map(b=>b.name);
  const elapsed      = ((Date.now()-startTime)/1000).toFixed(1);

  console.log(`\n${line}`);
  console.log(`[NATIJA] ✅ ${successCount}/${BANKS.length} | To'liq:${fullCount} Qisman:${partialCount} ⏱${elapsed}s`);
  console.log(`         O'z sayt:${ownCount} | TG:${tgCount} | Aralash:${mixedCount}`);
  if(failedBanks.length) console.log(`         ❌ ${failedBanks.join(', ')}`);

  console.log('\n  Bank nomi              olish     sotish  [manba]');
  console.log('  ' + '─'.repeat(53));
  banks.forEach(b => {
    const st = (b.buy&&b.sell)?'✅':(b.buy||b.sell)?'⚠️ ':'❌';
    console.log(`  ${st} ${b.name.padEnd(22)} ${(b.buy?.toLocaleString()||'—').padStart(7)} ${(b.sell?.toLocaleString()||'—').padStart(7)}  [${b.source}]`);
  });
  console.log(line);

  if(successCount<3){ console.log('[SAVE] ⚠️  Kam'); return false; }

  currentData = {
    banks, postDate:getDateFormatted(0), lastFetch:Date.now(),
    source:`own:${ownCount} tg:${tgCount} mixed:${mixedCount}`,
    fetchTime:new Date().toISOString(), successCount, fullCount, partialCount,
    totalCount:BANKS.length, ownCount, tgCount, mixedCount, elapsed:elapsed+'s',
  };

  saveData(currentData);
  console.log(`[SAVE] ✅ Saqlandi! ${elapsed}s\n`);
  return true;
}

// ============================================
//  API
// ============================================
app.get('/api/banks', (req,res) => res.json({
  success: currentData.banks?.length > 0,
  data:    currentData.banks || [],
  source:  currentData.source,
  count:   currentData.banks?.length || 0,
  successCount: currentData.successCount || 0,
  fullCount:    currentData.fullCount || 0,
  totalCount:   currentData.totalCount || BANKS.length,
  postDate:     currentData.postDate || null,
  lastFetch:    currentData.lastFetch ? new Date(currentData.lastFetch).toISOString() : null,
}));

app.get('/api/cbu', async (req,res) => {
  try {
    const ctrl=new AbortController();
    const t=setTimeout(()=>ctrl.abort(),10000);
    const r=await fetch('https://cbu.uz/uz/arkhiv-kursov-valyut/json/',{signal:ctrl.signal});
    clearTimeout(t);
    res.json({success:true, data:(await r.json()).find(i=>i.Ccy==='USD')});
  } catch(e){ res.json({success:false,error:e.message}); }
});

app.get('/api/refresh', async (req,res) => {
  const ok=await scrapeAndSave();
  res.json({success:ok, successCount:currentData.successCount, fullCount:currentData.fullCount, postDate:currentData.postDate});
});

app.get('/api/health', (req,res) => {
  const age=currentData.lastFetch?Math.round((Date.now()-currentData.lastFetch)/60000):null;
  res.json({
    status:'ok', today:getDateFormatted(0), postDate:currentData.postDate,
    successCount:currentData.successCount, fullCount:currentData.fullCount, totalCount:currentData.totalCount,
    dataAge:age!==null?`${age} daqiqa`:"yo'q", source:currentData.source, elapsed:currentData.elapsed,
  });
});

app.get('/api/banks/list', (req,res) =>
  res.json(BANKS.map((b,i)=>({index:i, name:b.name, url:b.url, method:b.js?'puppeteer':'fetch'})))
);

// Debug: bitta bank nomi bo'yicha
app.get('/api/debug/bank/:name', async (req,res) => {
  const name = decodeURIComponent(req.params.name);
  const bank = BANKS.find(b=>b.name.toLowerCase().includes(name.toLowerCase()));
  if (!bank) return res.json({error:'Topilmadi', available:BANKS.map(b=>b.name)});
  const r = await scrapeOneBank(bank);

  // Qo'shimcha: raw text snippet
  let snippet = '';
  try {
    if (!bank.js) {
      const html = await doFetch(bank.url);
      snippet = stripTags(html).substring(0,2000);
    } else {
      const page = await newPage();
      await page.setRequestInterception(true);
      page.on('request', req2=>{if(['image','media','font'].includes(req2.resourceType()))req2.abort();else req2.continue();});
      await page.goto(bank.url,{waitUntil:'domcontentloaded',timeout:20000});
      await new Promise(x=>setTimeout(x,bank.wait||3000));
      snippet = await page.evaluate(()=>document.body.innerText.substring(0,2000));
      await page.close();
    }
  } catch(_){}

  res.json({bank:bank.name, url:bank.url, method:bank.js?'puppeteer':'fetch', result:r, snippet});
});

// Debug: telegram
app.get('/api/debug/telegram', async (req,res) => {
  const tg=await scrapeTelegram();
  res.json({count:Object.keys(tg).length, data:tg});
});

// ============================================
//  START
// ============================================
app.listen(PORT, async () => {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log("║  💱 Dollar Kursi v8 — O'z sayt (x5) + Telegram backup  ║");
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log(`📡 http://localhost:${PORT}  |  🏦 ${BANKS.length} bank`);
  console.log(`📅 Sana: ${getDateFormatted(0)}`);
  console.log(`⏱️  Har ${SCRAPE_INTERVAL/60000} daqiqada yangilanadi`);
  console.log('');
  console.log('📌 Mantiq:');
  console.log("   1) O'z saytidan: fetch(x8 parallel) + puppeteer(x5 parallel)");
  console.log("   2) Topilmagan/qisman/noto'g'ri → Telegram @dollar_saad");
  console.log("   3) TG tuzatgandan keyin qayta validate (buy<sell tekshiruv)");
  console.log('');
  console.log('📌 API:');
  console.log('   /api/banks              — Barcha kurslar');
  console.log('   /api/cbu               — CBU rasmiy kurs');
  console.log('   /api/refresh           — Yangilash');
  console.log('   /api/health            — Holat');
  console.log('   /api/debug/bank/Xalq   — Bank debug');
  console.log('   /api/debug/telegram    — TG debug');
  console.log('');

  try { await getBrowser(); } catch(e){ console.warn('[BROWSER]', e.message); }
  await scrapeAndSave();
  setInterval(()=>scrapeAndSave(), SCRAPE_INTERVAL);
});

process.on('exit',   ()=>{ try{browser?.close();}catch(_){} });
process.on('SIGINT', ()=>{ try{browser?.close();}catch(_){} process.exit(); });