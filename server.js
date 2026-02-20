const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.static('public'));

// ============================================
//  KONFIGURATSIYA
// ============================================
const DATA_FILE = path.join(__dirname, 'data.json');      // Saqlangan ma'lumot
const SCRAPE_INTERVAL = 30 * 60 * 1000;                   // Har 30 daqiqada Telegramdan olish
const MAX_RETRIES = 3;                                     // Necha marta qayta urinish
const RETRY_DELAY = 5000;                                  // Urinishlar orasida kutish (ms)
const FETCH_TIMEOUT = 15000;                               // Telegram so'rov timeout (ms)

// ============================================
//  MA'LUMOTNI FAYLGA SAQLASH / O'QISH
//  Server qayta ishga tushsa ham ma'lumot saqlanadi
// ============================================
function saveData(data) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
        console.log('[FILE] ✅ Ma\'lumot faylga saqlandi');
    } catch (err) {
        console.error('[FILE] ❌ Saqlashda xato:', err.message);
    }
}

function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const raw = fs.readFileSync(DATA_FILE, 'utf8');
            const data = JSON.parse(raw);
            console.log(`[FILE] ✅ Fayldan yuklandi: ${data.banks.length} ta bank, sana: ${data.postDate}`);
            return data;
        }
    } catch (err) {
        console.error('[FILE] ❌ O\'qishda xato:', err.message);
    }
    return null;
}

// Dastur boshlanishida eski ma'lumotni yuklash
let currentData = loadData() || {
    banks: [],
    cbuRate: null,
    postDate: null,
    lastFetch: 0,
    source: 'none'
};

// ============================================
//  SANA FORMATLASH
// ============================================
function getDateFormatted(daysAgo = 0) {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
}

// ============================================
//  XAVFSIZ FETCH — timeout + retry
// ============================================
async function safeFetch(url) {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

            const response = await fetch(url, {
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'uz,ru;q=0.9,en;q=0.8',
                    'Cache-Control': 'no-cache',
                }
            });

            clearTimeout(timeout);

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const text = await response.text();
            console.log(`[FETCH] ✅ Urinish ${attempt}/${MAX_RETRIES} muvaffaqiyatli (${text.length} belgi)`);
            return text;

        } catch (err) {
            console.log(`[FETCH] ⚠️ Urinish ${attempt}/${MAX_RETRIES}: ${err.message}`);

            if (attempt < MAX_RETRIES) {
                const delay = RETRY_DELAY * attempt; // Har safar uzoqroq kutish
                console.log(`[FETCH] ${delay / 1000}s kutilmoqda...`);
                await new Promise(r => setTimeout(r, delay));
            }
        }
    }

    console.log('[FETCH] ❌ Barcha urinishlar muvaffaqiyatsiz');
    return null;
}

// ============================================
//  TELEGRAM DAN MA'LUMOT OLISH
//  Bu funksiya faqat BACKGROUND da ishlaydi
//  Foydalanuvchi so'roviga bog'liq EMAS
// ============================================
async function scrapeAndSave() {
    const today = getDateFormatted(0);
    const yesterday = getDateFormatted(1);
    const twoDaysAgo = getDateFormatted(2);

    console.log('');
    console.log('═══════════════════════════════════════');
    console.log(`[SCRAPE] Boshlanmoqda... (${new Date().toLocaleTimeString()})`);
    console.log(`[SCRAPE] Qidirilmoqda: "Dollar kursi - ${today}"`);

    const html = await safeFetch('https://t.me/s/pulmasalasi');

    if (!html) {
        console.log('[SCRAPE] ❌ Telegram ga ulanib bo\'lmadi — eski ma\'lumot saqlanadi');
        console.log('═══════════════════════════════════════\n');
        return false;
    }

    const postTexts = extractPostTexts(html);
    console.log(`[SCRAPE] ${postTexts.length} ta post topildi`);

    // Sana bo'yicha qidirish
    let targetPost = null;
    let foundDate = null;

    for (const dateStr of [today, yesterday, twoDaysAgo]) {
        targetPost = findPostByDate(postTexts, dateStr);
        if (targetPost) {
            foundDate = dateStr;
            break;
        }
    }

    // Oxirgi "Dollar kursi" posti
    if (!targetPost) {
        for (let i = postTexts.length - 1; i >= 0; i--) {
            if (postTexts[i].toLowerCase().includes('dollar kursi')) {
                targetPost = postTexts[i];
                const dm = targetPost.match(/Dollar kursi\s*[-–—]\s*([\d.]+)/i);
                foundDate = dm ? dm[1] : '?';
                break;
            }
        }
    }

    if (!targetPost) {
        console.log('[SCRAPE] ❌ Post topilmadi — eski ma\'lumot saqlanadi');
        console.log('═══════════════════════════════════════\n');
        return false;
    }

    const result = parseFullPost(targetPost);

    if (result.banks.length === 0) {
        console.log('[SCRAPE] ⚠️ Post topildi lekin banklar parse bo\'lmadi');
        console.log('═══════════════════════════════════════\n');
        return false;
    }

    // Yangi ma'lumotni saqlash
    currentData = {
        banks: result.banks,
        cbuRate: result.cbuRate,
        postDate: foundDate,
        lastFetch: Date.now(),
        source: 'telegram_web',
        fetchTime: new Date().toISOString()
    };

    saveData(currentData);

    console.log(`[SCRAPE] ✅ Tayyor! ${result.banks.length} ta bank, sana: ${foundDate}`);
    result.banks.forEach(b => {
        console.log(`    ${b.name}: olish=${b.buy || '—'} | sotish=${b.sell || '—'}`);
    });
    console.log('═══════════════════════════════════════\n');

    return true;
}

// ============================================
//  POST QIDIRISH
// ============================================
function findPostByDate(posts, dateStr) {
    for (let i = posts.length - 1; i >= 0; i--) {
        const text = posts[i];
        if (
            text.includes(`Dollar kursi - ${dateStr}`) ||
            text.includes(`Dollar kursi — ${dateStr}`) ||
            text.includes(`Dollar kursi – ${dateStr}`) ||
            text.includes(`dollar kursi - ${dateStr}`)
        ) {
            return text;
        }
    }
    return null;
}

// ============================================
//  HTML → MATN
// ============================================
function extractPostTexts(html) {
    const posts = [];
    const patterns = [
        /<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
        /<div class="js-message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
        /<div[^>]*class="[^"]*message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    ];

    for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(html)) !== null) {
            let text = cleanHTML(match[1]);
            if (text.length > 20 && !posts.includes(text)) {
                posts.push(text);
            }
        }
    }
    return posts;
}

function cleanHTML(html) {
    return html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/?(b|strong|i|em|u|s|code|pre|a|span)[^>]*>/gi, '')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&laquo;/g, '«')
        .replace(/&raquo;/g, '»')
        .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(parseInt(n)))
        .replace(/&#x([0-9a-fA-F]+);/g, (m, n) => String.fromCharCode(parseInt(n, 16)))
        .trim();
}

// ============================================
//  POST PARSE
// ============================================
function parseFullPost(text) {
    const result = { banks: [], cbuRate: null, postDate: null };
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    const dateMatch = text.match(/Dollar kursi\s*[-–—]\s*([\d.]+)/i);
    if (dateMatch) result.postDate = dateMatch[1];

    const cbuMatch = text.match(/[Mm]arkaziy bank kursi[:\s]*([\d\s]+[.,]?\d*)/);
    if (cbuMatch) result.cbuRate = cbuMatch[1].replace(/\s/g, '').replace(',', '.');

    const buyMap = {};
    const sellMap = {};
    let currentSection = null;

    for (const line of lines) {
        const lower = line.toLowerCase();

        if (lower.includes('olish kursi') || lower.includes('sotib olish')) {
            currentSection = 'buy';
            continue;
        }
        if (lower.includes('sotish kursi') && !lower.includes('olish')) {
            currentSection = 'sell';
            continue;
        }

        if (currentSection) {
            const parsed = parseBankLine(line);
            if (parsed) {
                const key = normalizeKey(parsed.name);
                if (currentSection === 'buy') buyMap[key] = { name: parsed.name, buy: parsed.value };
                else sellMap[key] = { name: parsed.name, sell: parsed.value };
            }
        }
    }

    const allKeys = new Set([...Object.keys(buyMap), ...Object.keys(sellMap)]);
    for (const key of allKeys) {
        result.banks.push({
            name: (buyMap[key] && buyMap[key].name) || (sellMap[key] && sellMap[key].name) || key,
            buy: buyMap[key] ? buyMap[key].buy : null,
            sell: sellMap[key] ? sellMap[key].sell : null
        });
    }

    return result;
}

function normalizeKey(name) {
    return name.toLowerCase().replace(/['`'ʻ]/g, '').replace(/\s+/g, '').trim();
}

function parseBankLine(line) {
    let cleaned = line.replace(/^\s*[-–—•▪️🔹🔸]\s*/, '').trim();
    if (cleaned.length < 3) return null;

    const dashMatch = cleaned.match(/^(.+?)\s*[-–—:]\s*([\d][\d\s]*\d)$/);
    if (dashMatch) {
        const name = dashMatch[1].replace(/[🏦💰💵]/g, '').trim();
        const value = parseInt(dashMatch[2].replace(/\s/g, ''));
        if (name.length >= 2 && value >= 1000 && value <= 999999) return { name, value };
    }

    const noSepMatch = cleaned.match(/^(.+?)\s+([\d][\d\s]*\d)\s*$/);
    if (noSepMatch) {
        const name = noSepMatch[1].replace(/[🏦💰💵]/g, '').trim();
        const value = parseInt(noSepMatch[2].replace(/\s/g, ''));
        if (name.length >= 2 && value >= 1000 && value <= 999999 && /^[A-Za-z\u0400-\u04FFOoʻ']/.test(name)) return { name, value };
    }

    return null;
}

// ============================================
//  API — faqat TAYYOR ma'lumotni beradi
//  Telegram ga BORMAYDI — tezkor va xavfsiz
// ============================================
app.get('/api/banks', (req, res) => {
    res.json({
        success: currentData.banks.length > 0,
        data: currentData.banks,
        source: currentData.source,
        count: currentData.banks.length,
        cbuFromTelegram: currentData.cbuRate || null,
        postDate: currentData.postDate || null,
        lastFetch: currentData.lastFetch ? new Date(currentData.lastFetch).toISOString() : null,
    });
});

app.get('/api/cbu', async (req, res) => {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const response = await fetch('https://cbu.uz/uz/arkhiv-kursov-valyut/json/', { signal: controller.signal });
        clearTimeout(timeout);
        const data = await response.json();
        const usd = data.find(item => item.Ccy === 'USD');
        res.json({ success: true, data: usd });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Qo'lda yangilash (admin uchun)
app.get('/api/refresh', async (req, res) => {
    const ok = await scrapeAndSave();
    res.json({
        success: ok,
        bankCount: currentData.banks.length,
        postDate: currentData.postDate
    });
});

app.get('/api/debug/posts', async (req, res) => {
    try {
        const html = await safeFetch('https://t.me/s/pulmasalasi');
        if (!html) return res.json({ error: 'Telegram ga ulanib bo\'lmadi' });
        const posts = extractPostTexts(html);
        res.json({ today: getDateFormatted(0), totalPosts: posts.length, lastPosts: posts.slice(-5) });
    } catch (error) {
        res.json({ error: error.message });
    }
});

app.get('/api/health', (req, res) => {
    const ageMinutes = currentData.lastFetch
        ? Math.round((Date.now() - currentData.lastFetch) / 60000)
        : null;

    res.json({
        status: 'ok',
        today: getDateFormatted(0),
        bankCount: currentData.banks.length,
        postDate: currentData.postDate || null,
        dataAge: ageMinutes !== null ? `${ageMinutes} daqiqa oldin` : 'ma\'lumot yo\'q',
        nextScrape: `Har ${SCRAPE_INTERVAL / 60000} daqiqada`
    });
});

// ============================================
//  SERVERNI ISHGA TUSHIRISH
// ============================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('');
    console.log('🚀 Dollar Kursi Server');
    console.log(`📡 http://localhost:${PORT}`);
    console.log(`📅 Sana: ${getDateFormatted(0)}`);
    console.log(`⏱️  Telegram scrape: har ${SCRAPE_INTERVAL / 60000} daqiqada`);
    console.log(`💾 Ma'lumot fayli: ${DATA_FILE}`);
    console.log('');

    // 1) Darhol birinchi scrape
    console.log('[STARTUP] Birinchi ma\'lumot olinmoqda...');
    scrapeAndSave();

    // 2) Har 30 daqiqada avtomatik scrape
    setInterval(() => {
        console.log('[TIMER] Avtomatik yangilash boshlanmoqda...');
        scrapeAndSave();
    }, SCRAPE_INTERVAL);
});