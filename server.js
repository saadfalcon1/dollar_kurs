const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.static('public'));

const DATA_FILE       = path.join(__dirname, 'data.json');
const SCRAPE_INTERVAL = 30 * 60 * 1000;
const PORT = process.env.PORT || 3000;
const UA   = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36';

const USD_MIN = 12000;
const USD_MAX = 13200;

// ============================================
//  31 TA BANK
// ============================================
const BANKS = [

  // ════════════════════════════════════════
  //  FETCH — oddiy HTML
  // ════════════════════════════════════════

  { name: 'Ipoteka Bank',
    url: 'https://www.ipotekabank.uz/currency/',
    js: false },

  { name: 'KDB Bank Uzbekistan',
    url: 'https://kdb.uz/ru/interactive-services/exchange-rates',
    js: false },

  { name: 'Microcreditbank',
    url: 'https://mkbank.uz/ru/services/exchange-rates/',
    js: false },

  { name: 'Orient Finans Bank',
    url: 'https://ofb.uz/about/kurs-obmena-valyut/',
    js: false },

  { name: 'Poytaxt Bank',
    url: 'https://poytaxtbank.uz/ru/services/exchange-rates/',
    js: false },

  // TBC Bank — SPA (Tailwind), puppeteer kerak
  { name: 'TBC Bank',
    url: 'https://tbcbank.uz/ru/currencies/',
    js: true, wait: 5000,
    tbcMode: true },

  { name: 'Trastbank',
    url: 'https://trustbank.uz/ru/services/exchange-rates/',
    js: false },

  // ════════════════════════════════════════
  //  PUPPETEER — JS render kerak
  // ════════════════════════════════════════

  { name: 'Agrobank',
    url: 'https://agrobank.uz/ru/person/exchange_rates',
    js: true, wait: 4000 },

  { name: 'AloqaBank',
    url: 'https://aloqabank.uz/ru/services/exchange-rates/',
    js: true, wait: 4000 },

  { name: 'ANOR BANK',
    url: 'https://anorbank.uz/about/exchange-rates/',
    js: true, wait: 7000 },

  { name: 'APEXBANK',
    url: 'https://www.apexbank.uz/ru/about/exchange-rates/',
    js: true, wait: 4000 },

  // Asakabank — yangi URL, maxsus extractor
  { name: 'Asakabank',
    url: 'https://asakabank.uz/uz/physical-persons/home',
    js: true, wait: 8000,
    asakaMode: true,
    altUrl: 'https://asakabank.uz/ru/exchange-rates' },

  { name: 'Asia Alliance Bank',
    url: 'https://aab.uz/ru/exchange-rates/',
    js: true, wait: 4000 },

  { name: 'BRB',
    url: 'https://brb.uz/',
    js: true, wait: 8000, brbMode: true },

  { name: 'DavrBank',
    url: 'https://davrbank.uz/ru/exchange-rate',
    js: true, wait: 4000 },

  { name: 'Garant Bank',
    url: 'https://garantbank.uz/ru/exchange-rates',
    js: true, wait: 6000 },

  // Hamkorbank — maxsus extractor (CB kursini skip qiladi)
  { name: 'Hamkorbank',
    url: 'https://hamkorbank.uz/exchange-rate/',
    js: true, wait: 8000,
    hamkorMode: true },

  { name: 'Hayot Bank',
    url: 'https://hayotbank.uz/main/exchange-rate',
    js: true, wait: 7000,
    hayotMode: true },

  { name: 'InFinBank',
    url: 'https://www.infinbank.com/ru/private/exchange-rates/',
    js: true, wait: 8000,
    altUrl: 'https://www.infinbank.com/ru/exchange-rates/' },

  { name: "Ipak Yo'li Banki",
    url: 'https://ipakyulibank.uz/physical/valyuta-ayirboshlash',
    js: true, wait: 7000,
    ipakyuliMode: true },

  { name: 'Kapitalbank',
    url: 'https://www.kapitalbank.uz/uz/services/exchange-rates/',
    js: true, wait: 4000 },

  { name: 'Madad Invest Bank',
    url: 'https://www.madadinvestbank.uz/',
    js: true, wait: 4000 },

  { name: 'Octobank',
    url: 'https://octobank.uz/o-banke/kurs-valyut',
    js: true, wait: 5000 },

  { name: 'SaderatBank',
    url: 'https://saderatbank.uz/',
    js: true, wait: 4000 },

  { name: 'SanoatQurilishBank',
    url: 'https://sqb.uz/uz/individuals/exchange-money/?srsltid=AfmBOopAZyD9yCp6lcgY2Lak3i4yylTM0jzFyhJW4YgaySFijg6rEcg5',
    js: true, wait: 6000,
    altUrl: 'https://sqb.uz/ru/individuals/currency-rates/' },

  { name: 'Tenge Bank',
    url: 'https://tengebank.uz/exchange-rates',
    js: true, wait: 6000 },

  { name: 'Turon Bank',
    url: 'https://turonbank.uz/ru/services/exchange-rates/',
    js: true, wait: 4000 },

  { name: 'Universalbank',
    url: 'https://universalbank.uz/currency',
    js: true, wait: 7000,
    altUrl: 'https://universalbank.uz/' },

  { name: 'Ziraat Bank',
    url: 'https://ziraatbank.uz/ru/exchange-rates',
    js: true, wait: 4000 },

  { name: 'NBU (UzNatsbank)',
    url: 'https://nbu.uz/ru/fizicheskim-litsam-kursy-valyut',
    js: true, wait: 4000 },

  { name: 'Xalq Banki',
    url: 'https://xb.uz/page/valyuta-ayirboshlash',
    js: true, wait: 8000 },
];

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
      executablePath: '/usr/bin/chromium-browser',
      args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage',
             '--disable-gpu','--disable-extensions','--window-size=1366,768'],
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
  await page.setDefaultNavigationTimeout(25000);
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
//  RATE PARSE + VALIDATE
// ============================================
function parseRate(str) {
  if (!str && str !== 0) return null;
  const c = String(str)
    .replace(/so'm|сум|сўм|uzs|сумов/gi, '')
    .replace(/[\s\u00a0\u202f\u2009'`]/g, '')
    .replace(',', '.');
  const v = parseFloat(c);
  // decimal bo'lsa (CB kurs: 12236.13) → butun son bo'lishi kerak, lekin Math.round ham qilmaylik
  // Agar virguldan keyin raqam bo'lsa va qiymat range ichida bo'lsa — CB kurs bo'lishi mumkin
  // Lekin parseRate asosan integer uchun, shuning uchun ok
  if (isNaN(v) || v < USD_MIN || v > USD_MAX) return null;
  return Math.round(v);
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/&[a-z#\d]+;/gi, ' ').replace(/\s+/g, ' ').trim();
}

function validateAndFix(name, buy, sell) {
  let b = buy, s = sell;
  if (b && (b < USD_MIN || b > USD_MAX)) b = null;
  if (s && (s < USD_MIN || s > USD_MAX)) s = null;
  if (b && s && b > s) {
    [b, s] = [s, b];
    console.log(`  🔧 [${name}] buy↔sell almashtirildi`);
  }
  return { buy: b, sell: s };
}

// ============================================
//  HAMKORBANK MAXSUS EXTRACTOR
//  Jadval: ВАЛЮТА | ПОКУПКА | ПРОДАЖА | КУРС ЦБ РУЗ
//  CB kursini (decimal: 12236,13) aniq skip qiladi
// ============================================
const HAMKOR_FN = `(function(){
  var MIN=${USD_MIN}, MAX=${USD_MAX};

  // CB kursini aniqlash: FAQAT "12 236,13" — 2 ta decimal raqam
  // "12,140" → minglik ajratgich (3 raqam) → CB EMAS
  // "12 180.0" → ".0" → CB EMAS
  function isCBRate(s) {
    var clean = String(s).replace(/[\\s\\u00a0]/g, '');
    // Verguldan/nuqtadan keyin ANIQ 2 raqam: xx,13 yoki xx.86
    var m = clean.match(/^[\\d]+[.,](\\d{2})$/);
    if (!m) return false;
    if (/^0+$/.test(m[1])) return false; // ",00" → CB emas
    var v = parseFloat(clean.replace(',','.'));
    return !isNaN(v) && v !== Math.round(v);
  }

  function n(s) {
    if (!s) return null;
    if (isCBRate(s)) return null;
    var c = String(s)
      .replace(/so'm|сум|uzs/gi, '')
      .replace(/[\\s\\u00a0,]/g, '')
      .replace(/\\.0+$/, '')   // "12180.0" → "12180"
      .replace('.', '');
    if (c.length > 7) return null;
    var v = parseInt(c, 10);
    return (isNaN(v) || v < MIN || v > MAX) ? null : v;
  }

  // USD hujayrasini aniqlash — keng pattern
  function isUSDcell(t) {
    return /USD|Доллар\\s*США|доллар\\s*сша|АҚШ\\s*доллари/i.test((t||'').trim());
  }

  // ── 1. JADVAL: ПОКУПКА / ПРОДАЖА ustunlari ──
  for (var tbl of document.querySelectorAll('table')) {
    var rows = [...tbl.querySelectorAll('tr')];
    var bc = -1, sc = -1;

    for (var row of rows) {
      var cells = [...row.querySelectorAll('td,th')].map(function(x){ return x.innerText.trim(); });
      var joined = cells.join('|');

      // Header qator
      if (/покупка|купить/i.test(joined) && /продажа|продать/i.test(joined)) {
        cells.forEach(function(c, i) {
          if (/покупка|купить/i.test(c) && bc < 0) bc = i;
          if (/продажа|продать/i.test(c) && sc < 0) sc = i;
        });
        continue;
      }

      // USD qatori — keng pattern
      if (cells.some(isUSDcell)) {
        if (bc >= 0 && sc >= 0) {
          var bVal = n(cells[bc]);
          var sVal = n(cells[sc]);
          if (bVal || sVal) return { buy: bVal, sell: sVal, src: 'hamkor-table' };
        }
        // Fallback: CB kursini skip, integer raqamlar
        var ns = [];
        cells.forEach(function(c) {
          if (isCBRate(c)) return;
          var v = n(c);
          if (v !== null) ns.push(v);
        });
        if (ns.length >= 2) return { buy: ns[0], sell: ns[1], src: 'hamkor-ns' };
        if (ns.length === 1) return { buy: ns[0], sell: null, src: 'hamkor-1' };
      }
    }
  }

  // ── 2. MATN: "Купить" / "Продать" yoki "ПОКУПКА" / "ПРОДАЖА" ──
  var lines = document.body.innerText.split('\\n').map(function(l){ return l.trim(); }).filter(Boolean);
  var buyVal = null, sellVal = null;

  for (var i = 0; i < lines.length; i++) {
    // "Купить" yoki "ПОКУПКА" → keyingi qatorda raqam
    if (/^(купить|покупка)$/i.test(lines[i])) {
      for (var j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        if (isCBRate(lines[j])) continue;
        var v = n(lines[j]);
        if (v !== null && buyVal === null) { buyVal = v; break; }
      }
    }
    // "Продать" yoki "ПРОДАЖА" → keyingi qatorda raqam
    if (/^(продать|продажа)$/i.test(lines[i])) {
      for (var j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        if (isCBRate(lines[j])) continue;
        var v = n(lines[j]);
        if (v !== null && sellVal === null) { sellVal = v; break; }
      }
    }
  }
  if (buyVal || sellVal) return { buy: buyVal, sell: sellVal, src: 'hamkor-text' };

  // ── 3. INLINE: "Купить 12,130 Продать 12,260" ──
  var fullText = document.body.innerText;
  var m = fullText.match(/купить[\\s\\n]+([\\d][\\d\\s,]+)[\\s\\S]{0,30}продать[\\s\\n]+([\\d][\\d\\s,]+)/i);
  if (m) {
    var b2 = n(m[1].trim()), s2 = n(m[2].trim());
    if (b2 || s2) return { buy: b2, sell: s2, src: 'hamkor-inline' };
  }

  // ── 4. USD yaqinidagi raqamlar (CB skip) ──
  var usdPos = fullText.search(/\\bUSD\\b/i);
  if (usdPos >= 0) {
    var chunk = fullText.substring(Math.max(0, usdPos - 50), usdPos + 300);
    var chunkLines = chunk.split('\\n');
    var ns3 = [];
    for (var i = 0; i < chunkLines.length; i++) {
      var cl = chunkLines[i].trim();
      if (isCBRate(cl)) continue;
      var nums = cl.match(/\\b(1[012][\\d]{3})\\b/g);
      if (nums) nums.forEach(function(x){ var v=n(x); if(v!==null&&ns3.indexOf(v)<0) ns3.push(v); });
      if (ns3.length >= 2) break;
    }
    if (ns3.length >= 2) return { buy: ns3[0], sell: ns3[1], src: 'hamkor-scan' };
    if (ns3.length === 1) return { buy: ns3[0], sell: null, src: 'hamkor-scan' };
  }

  return { buy: null, sell: null };
})()`;

// ============================================
//  ASAKABANK MAXSUS EXTRACTOR
//  Saytda: "Sotib olish" / "Sotish" bloklari
//  "-0.00" kabi shovqin raqamlarni skip qiladi
//  USD qatorida: 12,200 / -0.00 / 12,280 / -0.00
// ============================================
const ASAKA_FN = `(function(){
  var MIN=${USD_MIN}, MAX=${USD_MAX};

  function isNoise(s) {
    // "-0.00", "0.00", "-0", "+0.00" kabi shovqin
    return /^[\\-+]?0[\\.\\,]?0*$/.test(String(s).replace(/[\\s\\u00a0]/g,''));
  }

  function n(s) {
    if (!s || isNoise(s)) return null;
    var c = String(s).replace(/[\\s\\u00a0,]/g,'').replace('.','');
    if (c.length > 7) return null;
    var v = parseInt(c, 10);
    return (isNaN(v) || v < MIN || v > MAX) ? null : v;
  }

  // 1. innerText dan qidirish: USD qatorida raqamlar
  var lines = document.body.innerText.split('\\n')
    .map(function(l){ return l.trim(); }).filter(Boolean);

  // "Sotib olish" / "Sotish" sarlavhalarini topib, USD qatoridagi
  // to'g'ri raqamlarni olamiz
  var buyIdx = -1, sellIdx = -1;
  for (var i = 0; i < lines.length; i++) {
    if (/^sotib\\s*olish$/i.test(lines[i]) && buyIdx < 0)  buyIdx  = i;
    if (/^sotish$/i.test(lines[i])           && sellIdx < 0) sellIdx = i;
  }

  // USD qatorini topish
  var usdIdx = -1;
  for (var i = 0; i < lines.length; i++) {
    if (/^USD$/.test(lines[i])) { usdIdx = i; break; }
  }

  if (usdIdx >= 0) {
    // USD qatoridan keyingi raqamlar ichida buy/sell pozitsiyasiga qarab
    // Yoki shunchaki noise-free raqamlarni yig'amiz
    var ns = [];
    for (var j = usdIdx + 1; j < Math.min(usdIdx + 10, lines.length); j++) {
      if (/^(EUR|RUB|GBP|JPY|CNY|KZT)$/i.test(lines[j])) break; // boshqa valyuta
      if (isNoise(lines[j])) continue;
      var v = n(lines[j]);
      if (v !== null && ns.indexOf(v) < 0) ns.push(v);
      if (ns.length >= 2) break;
    }
    if (ns.length >= 2) return { buy: ns[0], sell: ns[1], src: 'asaka-lines' };
    if (ns.length === 1) return { buy: ns[0], sell: null, src: 'asaka-lines' };
  }

  // 2. "Sotib olish/Sotish" blokidan keyingi USD raqami
  if (buyIdx >= 0 || sellIdx >= 0) {
    var buyVal = null, sellVal = null;
    var ref = buyIdx >= 0 ? buyIdx : sellIdx;
    // USD qatori shu blokdan oldin yoki keyinda bo'ladi
    for (var i = ref; i < Math.min(ref + 20, lines.length); i++) {
      if (/^USD$/i.test(lines[i])) {
        // USD dan keyin noise-free raqamlar
        for (var j = i + 1; j < Math.min(i + 8, lines.length); j++) {
          if (/^(EUR|RUB|GBP)$/i.test(lines[j])) break;
          if (isNoise(lines[j])) continue;
          var v = n(lines[j]);
          if (v !== null) {
            if (buyVal === null) buyVal = v;
            else if (sellVal === null && v !== buyVal) { sellVal = v; break; }
          }
        }
        break;
      }
    }
    if (buyVal || sellVal) return { buy: buyVal, sell: sellVal, src: 'asaka-block' };
  }

  // 3. Full text regex: "USD\\n12,200\\n-0.00\\n12,280"
  var fullText = document.body.innerText;
  var m = fullText.match(/USD[^\\d]{0,20}(1[012][\\d\\s,]{3,8})[^\\d]{0,30}(1[012][\\d\\s,]{3,8})/);
  if (m) {
    var b = n(m[1].replace(/[\\s,]/g,'')), s = n(m[2].replace(/[\\s,]/g,''));
    if (b || s) return { buy: b, sell: s, src: 'asaka-regex' };
  }

  return { buy: null, sell: null };
})()`;

// ============================================
//  HAYOT BANK / IPAK YO'LI — umumiy kengaytirilgan extractor
//  Ko'proq kutib, barcha strategiyalar
// ============================================
const GENERIC_EXTENDED_FN = `(function(){
  var MIN=${USD_MIN}, MAX=${USD_MAX};

  function n(s) {
    if (!s) return null;
    var c = String(s).replace(/so'm|сум|сўм|uzs/gi,'')
      .replace(/[\\s\\u00a0,]/g,'').replace('.','');
    if (c.length > 7) return null;
    var v = parseInt(c, 10);
    return (isNaN(v)||v<MIN||v>MAX)?null:v;
  }
  function isUSD(t){ return /^USD$|доллар\\s*(США|сша)|us\\s*dollar|aqsh\\s*dollar|АҚШ/i.test((t||'').trim()); }
  var BUY  = /\\b(buy|sotib[\\s-]*olish|olish|покупка|xarid|purchase|buying)\\b/i;
  var SELL = /\\b(sell|sotish|sotuv|продажа|sale|selling)\\b/i;

  // 1. TABLE
  for (var tbl of document.querySelectorAll('table')) {
    var rows = [...tbl.querySelectorAll('tr')];
    var bc=-1, sc=-1;
    for (var row of rows) {
      var cells = [...row.querySelectorAll('td,th')].map(function(x){return x.innerText.trim();});
      var joined = cells.join('|');
      if (BUY.test(joined) && SELL.test(joined)) {
        cells.forEach(function(c,i){ if(BUY.test(c)&&bc<0)bc=i; if(SELL.test(c)&&sc<0)sc=i; });
        continue;
      }
      if (cells.some(isUSD)) {
        var b=bc>=0?n(cells[bc]):null, s=sc>=0?n(cells[sc]):null;
        if (!b&&!s) {
          var ns=cells.map(n).filter(Boolean);
          if(ns.length>=2){b=ns[0];s=ns[1];}
          else if(ns.length===1) b=ns[0];
        }
        if (b||s) return {buy:b,sell:s,src:'ext-table'};
      }
    }
  }

  // 2. Lines
  var lines = document.body.innerText.split('\\n').map(function(l){return l.trim();}).filter(Boolean);
  for (var i=0;i<lines.length;i++) {
    if (isUSD(lines[i])) {
      var ns=[];
      var mm=lines[i].match(/\\b(1[012]\\d{3})\\b/g);
      if(mm) mm.forEach(function(x){var v=n(x);if(v!==null)ns.push(v);});
      if(ns.length>=2) return {buy:ns[0],sell:ns[1],src:'ext-inline'};
      for(var j=i+1;j<Math.min(i+15,lines.length);j++){
        if(/^(EUR|RUB|GBP|CNY|JPY|KZT)$/i.test(lines[j])) break;
        var v=n(lines[j]);
        if(v!==null&&ns.indexOf(v)<0){ns.push(v);if(ns.length>=2)break;}
        var mm2=lines[j].match(/\\b(1[012]\\d{3})\\b/g);
        if(mm2) mm2.forEach(function(x){var v=n(x);if(v!==null&&ns.indexOf(v)<0&&ns.length<2)ns.push(v);});
        if(ns.length>=2) break;
      }
      if(ns.length>=2) return {buy:ns[0],sell:ns[1],src:'ext-lines'};
      if(ns.length===1) return {buy:ns[0],sell:null,src:'ext-lines'};
    }
  }

  // 3. Blocks
  var bv=null,sv=null;
  for(var i=0;i<lines.length;i++){
    if(BUY.test(lines[i])&&!SELL.test(lines[i])){
      for(var j=i+1;j<Math.min(i+8,lines.length);j++){
        var v=n(lines[j]);if(v!==null&&bv===null){bv=v;break;}
        var mm=lines[j].match(/\\b(1[012]\\d{3})\\b/g);
        if(mm){for(var k=0;k<mm.length;k++){var vv=n(mm[k]);if(vv!==null&&bv===null){bv=vv;break;}}}
        if(bv!==null)break;
      }
    }
    if(SELL.test(lines[i])&&!BUY.test(lines[i])){
      for(var j=i+1;j<Math.min(i+8,lines.length);j++){
        var v=n(lines[j]);if(v!==null&&sv===null){sv=v;break;}
        var mm=lines[j].match(/\\b(1[012]\\d{3})\\b/g);
        if(mm){for(var k=0;k<mm.length;k++){var vv=n(mm[k]);if(vv!==null&&sv===null){sv=vv;break;}}}
        if(sv!==null)break;
      }
    }
  }
  if(bv||sv) return {buy:bv,sell:sv,src:'ext-blocks'};

  // 4. JSON scripts
  for(var sc of document.querySelectorAll('script:not([src])')){
    var txt=sc.textContent||'';
    if(!txt.includes('USD')&&!txt.includes('usd')) continue;
    var bm=txt.match(/"(?:buy|purchase|покупка|sotib|olish)[_\\w]*"\\s*:\\s*"?([\\d.]+)"?/i);
    var sm=txt.match(/"(?:sell|sale|продажа|sotish|sotuv)[_\\w]*"\\s*:\\s*"?([\\d.]+)"?/i);
    var bv2=bm?n(bm[1]):null, sv2=sm?n(sm[1]):null;
    if(bv2||sv2) return {buy:bv2,sell:sv2,src:'ext-json'};
  }

  // 5. Scan
  var ft=document.body.innerText;
  var up=ft.search(/\\bUSD\\b/i);
  if(up>=0){
    var chunk=ft.substring(Math.max(0,up-100),up+600);
    var ns2=[];
    (chunk.match(/\\b(1[012]\\d{3})\\b/g)||[]).forEach(function(x){
      var v=n(x);if(v!==null&&ns2.indexOf(v)<0)ns2.push(v);
    });
    if(ns2.length>=2) return {buy:ns2[0],sell:ns2[1],src:'ext-scan'};
    if(ns2.length===1) return {buy:ns2[0],sell:null,src:'ext-scan'};
  }
  return {buy:null,sell:null};
})()`;


//  Sayt SPA (Tailwind), "Sotib olish"/"Sotish" yoki
//  "Покупка"/"Продажа" div/span ichida
// ============================================

// ============================================
//  HAYOT BANK MAXSUS EXTRACTOR
//  Format: "AQSH dollari (USD)\t12 180.0\t12 260.0\t12 236.13"
//  Tab bilan ajratilgan, ".0" format
// ============================================
const HAYOT_FN = `(function(){
  var MIN=${USD_MIN}, MAX=${USD_MAX};

  function n(s) {
    if (!s) return null;
    var c = String(s).replace(/[\\s\\u00a0]/g,'');
    // ".0" yoki ".00" tugasa → butun son sifatida qabul qilamiz
    c = c.replace(/\\.0+$/, '');
    // Hali decimal bo'lsa (.13 kabi) → CB kurs, skip
    if (/\\.\\d+$/.test(c)) {
      var fv = parseFloat(c);
      if (!isNaN(fv) && fv !== Math.round(fv)) return null;
      c = c.replace(/\\..*$/, '');
    }
    c = c.replace(/,/g,'');
    var v = parseInt(c, 10);
    return (isNaN(v) || v < MIN || v > MAX) ? null : v;
  }

  // Tab bilan ajratilgan qatorlarni qidirish
  var lines = document.body.innerText.split('\\n');
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (/USD|AQSH\\s*dollari/i.test(line)) {
      // Tab bilan: "AQSH dollari (USD)\t12 180.0\t12 260.0\t12 236.13"
      var parts = line.split('\\t').map(function(p){ return p.trim(); });
      var nums = [];
      for (var j = 0; j < parts.length; j++) {
        var v = n(parts[j]);
        if (v !== null && nums.indexOf(v) < 0) nums.push(v);
        if (nums.length >= 2) break;
      }
      if (nums.length >= 2) return { buy: nums[0], sell: nums[1], src: 'hayot-tab' };

      // Tab yo'q bo'lsa — regex
      var ms = line.match(/\\b(1[012][\\d\\s]{3,6})(?:\\.\\d+)?/g);
      if (ms && ms.length >= 2) {
        var b = n(ms[0]), s = n(ms[1]);
        if (b || s) return { buy: b, sell: s, src: 'hayot-regex' };
      }

      // Keyingi qatorlarda
      var ns2 = [];
      for (var j = i + 1; j < Math.min(i + 10, lines.length); j++) {
        if (/^(EUR|RUB|GBP|JPY|CHF|KZT)/i.test(lines[j].trim())) break;
        var pp = lines[j].split('\\t');
        for (var k = 0; k < pp.length; k++) {
          var v = n(pp[k].trim());
          if (v !== null && ns2.indexOf(v) < 0) { ns2.push(v); }
        }
        var v2 = n(lines[j].trim());
        if (v2 !== null && ns2.indexOf(v2) < 0) ns2.push(v2);
        if (ns2.length >= 2) break;
      }
      if (ns2.length >= 2) return { buy: ns2[0], sell: ns2[1], src: 'hayot-lines' };
      if (ns2.length === 1) return { buy: ns2[0], sell: null, src: 'hayot-lines' };
    }
  }

  // Jadval fallback
  for (var tbl of document.querySelectorAll('table')) {
    var rows = [...tbl.querySelectorAll('tr')];
    var bc=-1, sc=-1;
    for (var row of rows) {
      var cells = [...row.querySelectorAll('td,th')].map(function(x){ return x.innerText.trim(); });
      var joined = cells.join('|');
      if (/(sotib\\s*oladi|покупка)/i.test(joined) && /(sotadi|продажа)/i.test(joined)) {
        cells.forEach(function(c,i){
          if (/(sotib\\s*oladi|покупка)/i.test(c) && bc<0) bc=i;
          if (/(sotadi|продажа)/i.test(c) && sc<0) sc=i;
        });
        continue;
      }
      if (cells.some(function(c){ return /USD|AQSH/i.test(c); })) {
        var b=bc>=0?n(cells[bc]):null, s=sc>=0?n(cells[sc]):null;
        if (!b&&!s) {
          var ns3=cells.map(n).filter(Boolean);
          if(ns3.length>=2){b=ns3[0];s=ns3[1];}
        }
        if (b||s) return {buy:b,sell:s,src:'hayot-table'};
      }
    }
  }
  return { buy: null, sell: null };
})()`;

const TBC_FN = `(function(){
  var MIN=${USD_MIN}, MAX=${USD_MAX};

  function n(s) {
    if (!s) return null;
    var c = String(s).replace(/[\\s\\u00a0,]/g,'').replace('.','');
    if (c.length > 7) return null;
    var v = parseInt(c, 10);
    return (isNaN(v) || v < MIN || v > MAX) ? null : v;
  }

  // 1. Jadvaldan qidirish
  for (var tbl of document.querySelectorAll('table')) {
    var rows = [...tbl.querySelectorAll('tr')];
    var bc = -1, sc = -1;
    for (var row of rows) {
      var cells = [...row.querySelectorAll('td,th')].map(function(x){ return x.innerText.trim(); });
      var joined = cells.join('|');
      if (/(sotib\\s*olish|покупка|buy)/i.test(joined) && /(sotish|продажа|sell)/i.test(joined)) {
        cells.forEach(function(c, i) {
          if (/(sotib\\s*olish|покупка|buy)/i.test(c) && bc < 0) bc = i;
          if (/(sotish|продажа|sell)/i.test(c) && sc < 0) sc = i;
        });
        continue;
      }
      if (cells.some(function(c){ return /^USD$|доллар\\s*США|us\\s*dollar/i.test(c.trim()); })) {
        var bVal = bc >= 0 ? n(cells[bc]) : null;
        var sVal = sc >= 0 ? n(cells[sc]) : null;
        if (!bVal && !sVal) {
          var ns = cells.map(n).filter(Boolean);
          if (ns.length >= 2) return { buy: ns[0], sell: ns[1], src: 'tbc-table' };
        }
        if (bVal || sVal) return { buy: bVal, sell: sVal, src: 'tbc-table' };
      }
    }
  }

  // 2. DOM elementlardan: data-currency="USD" yoki aria-label
  var els = document.querySelectorAll('[data-currency="USD"],[data-code="USD"],[data-ccy="USD"]');
  if (els.length) {
    for (var el of els) {
      var buy = n(el.getAttribute('data-buy') || el.getAttribute('data-purchase'));
      var sell = n(el.getAttribute('data-sell') || el.getAttribute('data-sale'));
      if (buy || sell) return { buy, sell, src: 'tbc-data' };
    }
  }

  // 3. innerText dan: "Sotib olish" / "Sotish" bloklari
  var lines = document.body.innerText.split('\\n').map(function(l){ return l.trim(); }).filter(Boolean);
  var buyVal = null, sellVal = null;
  var usdFound = false;

  for (var i = 0; i < lines.length; i++) {
    // USD qatorini topish
    if (/^USD$|доллар\\s*(США|сша)|us\\s*dollar/i.test(lines[i])) {
      usdFound = true;
      // Bir qatorda 2 ta raqam?
      var mm = lines[i].match(/\\b(1[012]\\d{3})\\b/g);
      if (mm && mm.length >= 2) {
        var v1 = n(mm[0]), v2 = n(mm[1]);
        if (v1 && v2) return { buy: v1, sell: v2, src: 'tbc-inline' };
      }
    }

    if (/(sotib\\s*olish|покупка|buying\\s*rate|olish)/i.test(lines[i]) && !/(sotish|продажа)/i.test(lines[i])) {
      for (var j = i + 1; j < Math.min(i + 6, lines.length); j++) {
        var v = n(lines[j]);
        if (v !== null && buyVal === null) { buyVal = v; break; }
        var mm2 = lines[j].match(/\\b(1[012]\\d{3})\\b/g);
        if (mm2) { for (var k=0;k<mm2.length;k++) { var vv=n(mm2[k]); if(vv!==null&&buyVal===null){buyVal=vv;break;} } }
        if (buyVal !== null) break;
      }
    }
    if (/(sotish|продажа|selling\\s*rate)/i.test(lines[i]) && !/(sotib\\s*olish|покупка)/i.test(lines[i])) {
      for (var j = i + 1; j < Math.min(i + 6, lines.length); j++) {
        var v = n(lines[j]);
        if (v !== null && sellVal === null) { sellVal = v; break; }
        var mm3 = lines[j].match(/\\b(1[012]\\d{3})\\b/g);
        if (mm3) { for (var k=0;k<mm3.length;k++) { var vv=n(mm3[k]); if(vv!==null&&sellVal===null){sellVal=vv;break;} } }
        if (sellVal !== null) break;
      }
    }
  }
  if (buyVal || sellVal) return { buy: buyVal, sell: sellVal, src: 'tbc-text' };

  // 4. JSON script ichida
  for (var sc of document.querySelectorAll('script:not([src])')) {
    var txt = sc.textContent || '';
    if (!txt.includes('USD') && !txt.includes('usd')) continue;
    var bm = txt.match(/"(?:buy[_\\w]*|purchase[_\\w]*|покупка[_\\w]*)"\s*:\s*"?([\\d.]+)"?/i);
    var sm = txt.match(/"(?:sell[_\\w]*|sale[_\\w]*|продажа[_\\w]*)"\s*:\s*"?([\\d.]+)"?/i);
    var bv = bm ? n(bm[1]) : null;
    var sv = sm ? n(sm[1]) : null;
    if (bv || sv) return { buy: bv, sell: sv, src: 'tbc-json' };
  }

  // 5. Full scan
  var fullText = document.body.innerText;
  var usdPos = fullText.search(/\\bUSD\\b/i);
  if (usdPos >= 0) {
    var chunk = fullText.substring(Math.max(0, usdPos - 100), usdPos + 500);
    var ns2 = [];
    var scMatches = chunk.match(/\\b(1[012]\\d{3})\\b/g) || [];
    scMatches.forEach(function(x){ var v=n(x); if(v!==null&&ns2.indexOf(v)<0) ns2.push(v); });
    if (ns2.length >= 2) return { buy: ns2[0], sell: ns2[1], src: 'tbc-scan' };
    if (ns2.length === 1) return { buy: ns2[0], sell: null, src: 'tbc-scan' };
  }

  return { buy: null, sell: null };
})()`;

// ============================================
//  BRB_FN — "BRB mobile" qatorini skip
// ============================================
const BRB_FN = `(function(){
  var MIN=${USD_MIN}, MAX=${USD_MAX};

  function n(s) {
    if (!s) return null;
    var c = String(s).replace(/[\\s\\u00a0,]/g,'').replace('.','');
    if (c.length > 7) return null;
    var v = parseInt(c, 10);
    return (isNaN(v) || v < MIN || v > MAX) ? null : v;
  }

  // 1. Jadvaldan qidirish — "BRB mobile" ni skip qilib, oddiy USD oladi
  for (var tbl of document.querySelectorAll('table')) {
    var rows = [...tbl.querySelectorAll('tr')];
    var bc = -1, sc = -1;
    var foundUSD = false;
    
    for (var row of rows) {
      var cells = [...row.querySelectorAll('td,th')].map(function(x){ return x.innerText.trim(); });
      var joined = cells.join('|');
      
      // Sarlavha qatori — ustun indekslarini topish
      if (/(sotib\\s*olish|покупка|buy)/i.test(joined) && /(sotish|продажа|sell)/i.test(joined)) {
        cells.forEach(function(c, i) {
          if (/(sotib\\s*olish|покупка|buy)/i.test(c) && bc < 0) bc = i;
          if (/(sotish|продажа|sell)/i.test(c) && sc < 0) sc = i;
        });
        continue;
      }
      
      // BRB mobile — skip
      if (/BRB\\s*mobile|мобиль|app/i.test(cells.join('|'))) continue;
      
      // USD qatori — faqat birinchi topilgan oddiy USD (BRB mobile emas)
      if (cells.some(function(c){ return /^USD$|доллар\\s*США|us\\s*dollar/i.test(c.trim()); })) {
        if (!foundUSD) {
          foundUSD = true;
          var bVal = bc >= 0 ? n(cells[bc]) : null;
          var sVal = sc >= 0 ? n(cells[sc]) : null;
          if (bVal || sVal) return { buy: bVal, sell: sVal, src: 'brb-table' };
        }
      }
    }
  }

  // 2. Text qidirish — "BRB mobile" bloknini o'chirib, oddiy USD raqamlarini oladi
  var fullText = document.body.innerText;
  var textNoMobile = fullText.replace(/BRB\\s*mobile[^\\n]*?\\d+[^\\n]*?\\d+/gi, '');
  
  var usdPos = textNoMobile.search(/USD/i);
  if (usdPos >= 0) {
    var chunk = textNoMobile.substring(Math.max(0, usdPos - 100), usdPos + 500);
    var ns = [];
    var matches = chunk.match(/\\b(1[012]\\d{3})\\b/g) || [];
    matches.forEach(function(x){ var v=n(x); if(v!==null&&ns.indexOf(v)<0) ns.push(v); });
    if (ns.length >= 2) return { buy: ns[0], sell: ns[1], src: 'brb-text' };
  }

  return { buy: null, sell: null };
})()`;

// ============================================
//  DOM EXTRACT FN — umumiy (kengaytirilgan)
// ============================================
const DOM_EXTRACT_FN = `(function() {
  var MIN = ${USD_MIN}, MAX = ${USD_MAX};

  function num(s) {
    if (s===null||s===undefined) return null;
    var c = String(s)
      .replace(/so'm|сум|сўм|uzs|сумов/gi,'')
      .replace(/[\\s\\u00a0\\u202f\\u2009'\\u00b0]/g,'')
      .replace(',','.');
    var v = parseFloat(c);
    return (isNaN(v)||v<MIN||v>MAX) ? null : Math.round(v);
  }

  // CB kurs: FAQAT 2 decimal raqam (12236,13) — "12,140" (3 raqam=minglik) EMAS
  function isCBRate(s) {
    var clean = String(s).replace(/[\\s\\u00a0]/g, '');
    var m = clean.match(/^[\\d]+[.,](\\d{2})$/);
    if (!m) return false;
    if (/^0+$/.test(m[1])) return false; // ",00" CB emas
    var v = parseFloat(clean.replace(',','.'));
    return !isNaN(v) && v !== Math.round(v);
  }

  var USD_PATTERNS = [
    /^USD$/i, /^840$/, /^долл?\\./i,
    /доллар\\s*(США|сша)/i, /^доллар$/i,
    /^dollar$/i, /us\\s*dollar/i,
    /aqsh\\s*dollari/i, /aqsh\\s*dollar/i,
    /американский/i, /АҚШ\\s*доллари/i,
    /^\\$$/
  ];
  function isUSD(t) {
    var s = (t||'').trim();
    return USD_PATTERNS.some(function(p){ return p.test(s); });
  }

  var BUY_RE  = /\\b(buy|purchase|sotib[\\s-]*olish|olish\\s*kursi|sotib\\s*ol|xarid|xarid\\s*kursi|покупка|покупк|курс\\s*покупки|sotib|buying|pb|alish)\\b/i;
  var SELL_RE = /\\b(sell|sale|sotish|sotish\\s*kursi|sotuv|sotuv\\s*kursi|sotadi|продажа|продаж|курс\\s*продажи|реализ|selling|ps|berish)\\b/i;

  // ── 1. TABLE ──
  for (var tbl of document.querySelectorAll('table')) {
    var rows = [...tbl.querySelectorAll('tr')];
    var bc = -1, sc = -1;

    for (var row of rows) {
      var cells = [...row.querySelectorAll('td,th')].map(function(c){ return c.innerText.trim(); });
      var joined = cells.join('|||');

      if (BUY_RE.test(joined) && SELL_RE.test(joined)) {
        cells.forEach(function(c, i) {
          if (BUY_RE.test(c)  && bc < 0) bc = i;
          if (SELL_RE.test(c) && sc < 0) sc = i;
        });
        continue;
      }

      if (cells.some(isUSD)) {
        var b = null, s = null;
        if (bc >= 0 && sc >= 0) {
          // CB kursini skip
          if (!isCBRate(cells[bc])) b = num(cells[bc]);
          if (!isCBRate(cells[sc])) s = num(cells[sc]);
        } else {
          var ns = [];
          cells.forEach(function(c) {
            if (isCBRate(c)) return; // CB kursini o'tkazib yuborish
            var m = c.match(/\\b(1[012]\\d{3})\\b/g);
            if (m) m.forEach(function(x){ var v=num(x); if(v!==null) ns.push(v); });
          });
          if (ns.length >= 2) { b = ns[0]; s = ns[1]; }
          else if (ns.length === 1) { b = ns[0]; }
        }
        if (b || s) return {buy:b, sell:s, src:'table'};
      }
    }
  }

  // ── 2. INLINE ──
  var lines = document.body.innerText.split('\\n').map(function(l){ return l.trim(); }).filter(Boolean);

  for (var i = 0; i < lines.length; i++) {
    if (isUSD(lines[i])) {
      var sameLineNums = [];
      var matches = lines[i].match(/\\b(1[012]\\d{3})\\b/g);
      if (matches) matches.forEach(function(x){ var v=num(x); if(v!==null) sameLineNums.push(v); });
      if (sameLineNums.length >= 2) return {buy:sameLineNums[0], sell:sameLineNums[1], src:'inline'};

      var ns = [];
      for (var j = Math.max(0, i-2); j < Math.min(i+20, lines.length); j++) {
        if (j === i) continue;
        if (isCBRate(lines[j])) continue; // CB kursini skip
        var n2 = num(lines[j]);
        if (n2 !== null && ns.indexOf(n2) < 0) { ns.push(n2); if (ns.length >= 2) break; }
        var mm = lines[j].match(/\\b(1[012]\\d{3})\\b/g);
        if (mm) {
          mm.forEach(function(x){ var v=num(x); if(v!==null&&ns.indexOf(v)<0&&ns.length<2) ns.push(v); });
          if (ns.length >= 2) break;
        }
      }
      if (ns.length >= 2) return {buy:ns[0], sell:ns[1], src:'lines'};
      if (ns.length === 1) return {buy:ns[0], sell:null, src:'lines'};
    }
  }

  // ── 3. BLOCKS ──
  var buyVal = null, sellVal = null;
  for (var i = 0; i < lines.length; i++) {
    var l = lines[i];

    if (BUY_RE.test(l) && !SELL_RE.test(l)) {
      for (var j = i+1; j < Math.min(i+8, lines.length); j++) {
        if (isCBRate(lines[j])) continue;
        var n3 = num(lines[j]);
        if (n3 !== null && buyVal === null) { buyVal = n3; break; }
        var mm = lines[j].match(/\\b(1[012]\\d{3})\\b/g);
        if (mm) {
          for (var k=0; k<mm.length; k++) {
            var v = num(mm[k]);
            if (v !== null && buyVal === null) { buyVal = v; break; }
          }
          if (buyVal !== null) break;
        }
      }
    }

    if (SELL_RE.test(l) && !BUY_RE.test(l)) {
      for (var j = i+1; j < Math.min(i+8, lines.length); j++) {
        if (isCBRate(lines[j])) continue;
        var n4 = num(lines[j]);
        if (n4 !== null && sellVal === null) { sellVal = n4; break; }
        var mm = lines[j].match(/\\b(1[012]\\d{3})\\b/g);
        if (mm) {
          for (var k=0; k<mm.length; k++) {
            var v = num(mm[k]);
            if (v !== null && sellVal === null) { sellVal = v; break; }
          }
          if (sellVal !== null) break;
        }
      }
    }
  }
  if (buyVal || sellVal) return {buy:buyVal, sell:sellVal, src:'blocks'};

  // ── 4. LABEL ──
  var fullText = document.body.innerText;
  var labelBuy  = fullText.match(/(?:sotib\\s*olish|покупка|olish\\s*kursi|xarid)\\s*[:\\-–]?\\s*([\\d][\\d\\s]{3,7})/i);
  var labelSell = fullText.match(/(?:sotish|продажа|sotuv|sotish\\s*kursi)\\s*[:\\-–]?\\s*([\\d][\\d\\s]{3,7})/i);
  var lbv = labelBuy  ? num(labelBuy[1].replace(/\\s/g,''))  : null;
  var lsv = labelSell ? num(labelSell[1].replace(/\\s/g,'')) : null;
  if (lbv || lsv) return {buy:lbv, sell:lsv, src:'label'};

  // ── 5. JSON ──
  for (var sc of document.querySelectorAll('script:not([src])')) {
    var txt = sc.textContent || '';
    var bm = txt.match(/"(?:buy[_\\w]*|purchase[_\\w]*|покупка[_\\w]*|olish[_\\w]*|sotib[_\\w]*)"\s*:\s*"?([\\d.,]+)"?/i);
    var sm = txt.match(/"(?:sell[_\\w]*|sale[_\\w]*|продажа[_\\w]*|sotish[_\\w]*|sotuv[_\\w]*)"\s*:\s*"?([\\d.,]+)"?/i);
    var bv2 = bm ? num(bm[1]) : null;
    var sv2 = sm ? num(sm[1]) : null;
    if (bv2 || sv2) return {buy:bv2, sell:sv2, src:'json'};

    var dataEl = document.querySelector('[data-buy],[data-purchase],[data-sell],[data-sale]');
    if (dataEl) {
      var db = num(dataEl.dataset.buy || dataEl.dataset.purchase);
      var ds = num(dataEl.dataset.sell || dataEl.dataset.sale);
      if (db || ds) return {buy:db, sell:ds, src:'data-attr'};
    }
  }

  // ── 6. FULL SCAN ──
  var usdPos = fullText.search(/\\bUSD\\b/i);
  if (usdPos >= 0) {
    var chunk = fullText.substring(Math.max(0, usdPos-200), usdPos+800);
    var ns5 = [];
    var scMatches = chunk.match(/\\b(1[012]\\d{3})\\b/g) || [];
    scMatches.forEach(function(x){ var v=num(x); if(v!==null&&ns5.indexOf(v)<0) ns5.push(v); });
    if (ns5.length >= 2) return {buy:ns5[0], sell:ns5[1], src:'scan'};
    if (ns5.length === 1) return {buy:ns5[0], sell:null, src:'scan'};
  }

  return {buy:null, sell:null};
})()`;

// ============================================
//  HTML PARSERS (fetch uchun)
// ============================================
const USD_HTML_RE = [
  /^USD$/i, /^840$/, /доллар\s*(США|сша)/i, /us\s*dollar/i,
  /aqsh\s*dollar/i, /^доллар$/i, /^dollar$/i, /американский/i,
];
const BUY_HTML  = /\b(buy|purchase|sotib[\s-]*olish|olish\s*kursi|xarid|покупка|покупк|курс\s*покупки|sotib)\b/i;
const SELL_HTML = /\b(sell|sale|sotish|sotish\s*kursi|sotuv|продажа|продаж|курс\s*продажи|реализ)\b/i;
function isUSDCell(t) { return USD_HTML_RE.some(p => p.test((t||'').trim())); }

// CB kurs: FAQAT 2 decimal (12236.13) — "12,140" (minglik) EMAS
function isCBRateHTML(s) {
  const clean = String(s).replace(/[\s\u00a0]/g, '');
  const m = clean.match(/^[\d]+[.,](\d{2})$/);
  if (!m) return false;
  if (/^0+$/.test(m[1])) return false;
  const v = parseFloat(clean.replace(',', '.'));
  return !isNaN(v) && v !== Math.round(v);
}

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
    let bc = -1, sc = -1;
    for (const row of rows) {
      const joined = row.join('|||');
      if (BUY_HTML.test(joined) && SELL_HTML.test(joined)) {
        row.forEach((c,i) => { if(BUY_HTML.test(c)&&bc<0) bc=i; if(SELL_HTML.test(c)&&sc<0) sc=i; });
        continue;
      }
      if (row.some(c => isUSDCell(c))) {
        let buy=null, sell=null;
        if (bc>=0&&sc>=0) {
          if (!isCBRateHTML(row[bc])) buy = parseRate(row[bc]);
          if (!isCBRateHTML(row[sc])) sell = parseRate(row[sc]);
        } else {
          const ns = [];
          row.forEach(c => {
            if (isCBRateHTML(c)) return; // CB kursini skip
            const m = c.match(/\b(1[012]\d{3})\b/g);
            if (m) m.forEach(x => { const v=parseRate(x); if(v!==null) ns.push(v); });
            else { const v=parseRate(c); if(v!==null) ns.push(v); }
          });
          if (ns.length>=2) { buy=ns[0]; sell=ns[ns.length-1]; }
          else if (ns.length===1) { buy=ns[0]; }
        }
        if (buy||sell) return{buy,sell};
      }
    }
  }
  return {buy:null, sell:null};
}

function parseTextHTML(html) {
  const plain = stripTags(html);

  const bm = plain.match(/(?:sotib\s*olish|покупка|olish\s*kursi|xarid)\s*[:\-–]?\s*([\d][\d\s]{3,7})/i);
  const sm = plain.match(/(?:sotish|продажа|sotuv|sotish\s*kursi)\s*[:\-–]?\s*([\d][\d\s]{3,7})/i);
  const bv = bm ? parseRate(bm[1].replace(/\s/g,'')) : null;
  const sv = sm ? parseRate(sm[1].replace(/\s/g,'')) : null;
  if (bv||sv) return{buy:bv,sell:sv};

  const jB=html.match(/"(?:buy|purchase|покупка|olish|sotib)[_\w]*"\s*:\s*"?([\d.,]+)"?/i);
  const jS=html.match(/"(?:sell|sale|продажа|sotish|sotuv)[_\w]*"\s*:\s*"?([\d.,]+)"?/i);
  const jBuy=jB?parseRate(jB[1]):null, jSell=jS?parseRate(jS[1]):null;
  if (jBuy||jSell) return{buy:jBuy,sell:jSell};

  for (const term of ['USD','Доллар США','Dollar','АҚШ доллари','Доллар']) {
    const re = new RegExp(term+'[\\s\\S]{0,600}', 'gi');
    let m;
    while ((m=re.exec(html))!==null) {
      const stripped = stripTags(m[0]);
      const ns = [...stripped.matchAll(/\b(1[012]\d{3})\b/g)]
        .map(x=>parseRate(x[1])).filter(v=>v!==null);
      if (ns.length>=2) return{buy:ns[0],sell:ns[1]};
    }
  }
  return{buy:null,sell:null};
}

// ============================================
//  FETCH
// ============================================
async function doFetch(url) {
  const ctrl = new AbortController();
  const t = setTimeout(()=>ctrl.abort(), 13000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,*/*;q=0.9',
        'Accept-Language': 'ru-RU,ru;q=0.9,uz;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
      },
    });
    clearTimeout(t);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally { clearTimeout(t); }
}

// ============================================
//  PUPPETEER — page
// ============================================
async function doPuppeteer(bank) {
  const page = await newPage();
  try {
    await page.setRequestInterception(true);
    page.on('request', req => {
      const t = req.resourceType();
      if (t==='image'||t==='media'||t==='font'||t==='stylesheet') req.abort();
      else req.continue();
    });
    await page.goto(bank.url, { waitUntil: 'domcontentloaded', timeout: 22000 });
    await new Promise(r => setTimeout(r, bank.wait || 4000));

    // Maxsus extractorlar
    let fn = DOM_EXTRACT_FN;
    if (bank.hamkorMode)    fn = HAMKOR_FN;
    else if (bank.tbcMode)  fn = TBC_FN;
    else if (bank.asakaMode)     fn = ASAKA_FN;
    else if (bank.hayotMode)     fn = HAYOT_FN;
    else if (bank.brbMode)  fn = BRB_FN;
    else if (bank.ipakyuliMode)  fn = GENERIC_EXTENDED_FN;

    return await page.evaluate(fn);
  } finally {
    try { await page.close(); } catch(_){}
  }
}

// ============================================
//  BITTA BANK SCRAPE
// ============================================
async function scrapeOneBank(bank) {
  try {
    let result = {buy:null, sell:null};

    if (!bank.js) {
      const html = await doFetch(bank.url).catch(async e => {
        if (bank.altUrl) return doFetch(bank.altUrl);
        throw e;
      });
      result = parseTableHTML(html);
      if (!result.buy && !result.sell) result = parseTextHTML(html);

    } else {
      result = await doPuppeteer(bank).catch(()=>({buy:null,sell:null}));

      if (!result.buy && !result.sell && bank.altUrl) {
        console.log(`  🔄 [${bank.name}] altUrl...`);
        result = await doPuppeteer({...bank, url:bank.altUrl, altUrl:null, wait: bank.wait||4000})
          .catch(()=>({buy:null,sell:null}));
      }

      if (!result.buy && !result.sell) {
        const html = await doFetch(bank.url).catch(()=>'');
        if (html) {
          const r2 = parseTableHTML(html);
          if (r2.buy||r2.sell) { result=r2; }
          else { const r3=parseTextHTML(html); if(r3.buy||r3.sell) result=r3; }
        }
      }
    }

    const fixed = validateAndFix(bank.name, result.buy, result.sell);

    if (fixed.buy || fixed.sell) {
      console.log(`  ✅ ${bank.name.padEnd(22)} buy=${(fixed.buy?.toLocaleString()||'—').padStart(7)} sell=${(fixed.sell?.toLocaleString()||'—').padStart(7)}`);
      return { name:bank.name, ...fixed, source:'own' };
    }

    console.log(`  ⚠️  ${bank.name} — topilmadi`);
    return { name:bank.name, buy:null, sell:null, source:'none' };

  } catch (err) {
    console.log(`  ❌ ${bank.name} — ${err.message.substring(0,60)}`);
    return { name:bank.name, buy:null, sell:null, source:'error' };
  }
}

// ============================================
//  ASOSIY SCRAPE
// ============================================
async function scrapeAndSave() {
  const t0 = Date.now();
  const line = '═'.repeat(56);
  console.log(`\n${line}\n[SCRAPE] ${new Date().toLocaleString()}\n${line}`);

  const results = {};

  const fetchBanks = BANKS.filter(b => !b.js);
  const puppBanks  = BANKS.filter(b =>  b.js);
  console.log(`\n[SCRAPE] Fetch:${fetchBanks.length} (parallel) | Puppeteer:${puppBanks.length} (x5)\n`);

  (await Promise.all(fetchBanks.map(scrapeOneBank)))
    .forEach(r => { results[r.name] = {buy:r.buy,sell:r.sell,source:r.source}; });

  const BATCH = 5;
  for (let i=0; i<puppBanks.length; i+=BATCH) {
    const res = await Promise.all(puppBanks.slice(i,i+BATCH).map(scrapeOneBank));
    res.forEach(r => { results[r.name] = {buy:r.buy,sell:r.sell,source:r.source}; });
  }

  // Yakuniy validate
  for (const b of BANKS) {
    const r = results[b.name];
    if (!r) continue;
    if (r.buy  && (r.buy  < USD_MIN || r.buy  > USD_MAX)) r.buy  = null;
    if (r.sell && (r.sell < USD_MIN || r.sell > USD_MAX)) r.sell = null;
    if (r.buy && r.sell && r.buy > r.sell) {
      [r.buy, r.sell] = [r.sell, r.buy];
      console.log(`  🔁 [${b.name}] yakuniy fix: buy=${r.buy} sell=${r.sell}`);
    }
  }

  const banks = BANKS.map(b => ({
    name:   b.name,
    buy:    results[b.name]?.buy   || null,
    sell:   results[b.name]?.sell  || null,
    source: results[b.name]?.source || 'none',
  }));

  const successCount = banks.filter(b=>b.buy||b.sell).length;
  const fullCount    = banks.filter(b=>b.buy&&b.sell).length;
  const partialCount = banks.filter(b=>(b.buy||b.sell)&&!(b.buy&&b.sell)).length;
  const failedBanks  = banks.filter(b=>!b.buy&&!b.sell).map(b=>b.name);
  const elapsed      = ((Date.now()-t0)/1000).toFixed(1);

  console.log(`\n${line}`);
  console.log(`[NATIJA] ✅ ${successCount}/${BANKS.length} | To'liq:${fullCount} Qisman:${partialCount} ⏱${elapsed}s`);
  if (failedBanks.length) console.log(`         ❌ ${failedBanks.join(', ')}`);

  console.log('\n  Bank nomi                  olish    sotish  [src]');
  console.log('  ' + '─'.repeat(55));
  banks.forEach(b => {
    const st = (b.buy&&b.sell)?'✅':(b.buy||b.sell)?'⚠️ ':'❌';
    console.log(`  ${st} ${b.name.padEnd(24)} ${(b.buy?.toLocaleString()||'—').padStart(7)} ${(b.sell?.toLocaleString()||'—').padStart(7)}  [${b.source}]`);
  });
  console.log(line);

  if (successCount < 3) { console.log('[SAVE] ⚠️  Kam'); return false; }

  currentData = {
    banks,
    postDate:     getDateFormatted(0),
    lastFetch:    Date.now(),
    source:       'web-only',
    fetchTime:    new Date().toISOString(),
    successCount, fullCount, partialCount,
    totalCount:   BANKS.length,
    elapsed:      elapsed+'s',
  };

  saveData(currentData);
  console.log(`[SAVE] ✅ Saqlandi! ${elapsed}s\n`);
  return true;
}

// ============================================
//  API
// ============================================
app.get('/api/banks', (req,res) => res.json({
  success:      currentData.banks?.length > 0,
  data:         currentData.banks || [],
  source:       currentData.source,
  count:        currentData.banks?.length || 0,
  successCount: currentData.successCount || 0,
  fullCount:    currentData.fullCount || 0,
  totalCount:   currentData.totalCount || BANKS.length,
  postDate:     currentData.postDate || null,
  lastFetch:    currentData.lastFetch ? new Date(currentData.lastFetch).toISOString() : null,
}));

app.get('/api/cbu', async (req,res) => {
  try {
    const ctrl=new AbortController();
    setTimeout(()=>ctrl.abort(),10000);
    const r=await fetch('https://cbu.uz/uz/arkhiv-kursov-valyut/json/',{signal:ctrl.signal});
    res.json({success:true, data:(await r.json()).find(i=>i.Ccy==='USD')});
  } catch(e){ res.json({success:false,error:e.message}); }
});

app.get('/api/refresh', async (req,res) => {
  const ok=await scrapeAndSave();
  res.json({success:ok, successCount:currentData.successCount, fullCount:currentData.fullCount});
});

app.get('/api/health', (req,res) => {
  const age=currentData.lastFetch?Math.round((Date.now()-currentData.lastFetch)/60000):null;
  res.json({
    status:'ok', today:getDateFormatted(0),
    successCount:currentData.successCount, fullCount:currentData.fullCount, totalCount:currentData.totalCount,
    dataAge:age!==null?`${age} daqiqa`:"yo'q",
    source:currentData.source, elapsed:currentData.elapsed,
  });
});

app.get('/api/banks/list', (req,res) =>
  res.json(BANKS.map((b,i)=>({index:i, name:b.name, url:b.url, method:b.js?'puppeteer':'fetch'})))
);

app.get('/api/debug/bank/:name', async (req,res) => {
  const name = decodeURIComponent(req.params.name);
  const bank = BANKS.find(b=>b.name.toLowerCase().includes(name.toLowerCase()));
  if (!bank) return res.json({error:'Topilmadi', banks:BANKS.map(b=>b.name)});

  const r = await scrapeOneBank(bank);
  let textSnippet='', htmlSnippet='';

  try {
    if (!bank.js) {
      const html = await doFetch(bank.url);
      textSnippet = stripTags(html).substring(0,3000);
      htmlSnippet = html.substring(0,4000);
    } else {
      const page = await newPage();
      await page.setRequestInterception(true);
      page.on('request',r2=>{ if(['image','media','font'].includes(r2.resourceType()))r2.abort(); else r2.continue(); });
      await page.goto(bank.url,{waitUntil:'domcontentloaded',timeout:22000});
      await new Promise(x=>setTimeout(x, bank.wait||4000));
      textSnippet = await page.evaluate(()=>document.body.innerText.substring(0,3000));
      htmlSnippet = (await page.content()).substring(0,4000);
      await page.close();
    }
  } catch(e){ textSnippet='ERROR: '+e.message; }

  res.json({
    bank:bank.name, url:bank.url,
    method: bank.js?'puppeteer':'fetch',
    result: r,
    textSnippet,
    htmlSnippet,
  });
});

// ============================================
//  START
// ============================================
app.listen(PORT, async () => {
  console.log('\n╔═════════════════════════════════════════════════════╗');
  console.log("║  💱 Dollar Kursi v15 — Web scraping only             ║");
  console.log('╚═════════════════════════════════════════════════════╝');
  console.log(`📡 http://localhost:${PORT}  |  🏦 ${BANKS.length} bank`);
  console.log(`📅 ${getDateFormatted(0)}  |  USD: ${USD_MIN.toLocaleString()}–${USD_MAX.toLocaleString()}`);
  console.log(`⏱️  Har ${SCRAPE_INTERVAL/60000} daqiqada yangilanadi`);
  console.log('');
  console.log('📌 v15 tuzatishlar:');
  console.log('   Hamkorbank      : isCBRate "12,140"=minglik, faqat 2-decimal=CB ✅');
  console.log('   isCBRate barcha : \\d{{2}} pattern — minglik ajratgich skip ✅');
  console.log('   SanoatQurilish  : yangi URL /currency-rates/ ✅');
  console.log('');
  console.log('📌 API:');
  console.log('   /api/banks              — kurslar');
  console.log('   /api/refresh            — qayta yuklash');
  console.log('   /api/debug/bank/Hamkor  — HTML + text snippet');
  console.log('');

  try { await getBrowser(); } catch(e){ console.warn('[BROWSER]', e.message); }
  await scrapeAndSave();
  setInterval(()=>scrapeAndSave(), SCRAPE_INTERVAL);
});

process.on('exit',   ()=>{ try{browser?.close();}catch(_){} });
process.on('SIGINT', ()=>{ try{browser?.close();}catch(_){} process.exit(); });
