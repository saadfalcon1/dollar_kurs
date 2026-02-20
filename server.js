const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.static('public'));

let cachedData = { banks: [], lastFetch: 0, source: '', cbuRate: null };
const CACHE_DURATION = 60 * 1000;

// ============================================
//  BUGUNGI SANANI OLISH: "20.02.2026" formatda
// ============================================
function getTodayFormatted() {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    return `${day}.${month}.${year}`;
}

// Kechagi sana (agar bugungi topilmasa)
function getYesterdayFormatted() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
}

// ============================================
//  SCRAPE
// ============================================
async function scrapeTelegramChannel() {
    const now = Date.now();

    if (cachedData.banks.length > 0 && (now - cachedData.lastFetch) < CACHE_DURATION) {
        console.log('[CACHE] Keshdan qaytarilmoqda');
        return cachedData;
    }

    const today = getTodayFormatted();
    const yesterday = getYesterdayFormatted();

    console.log(`[SCRAPE] @pulmasalasi dan ma'lumot olinmoqda...`);
    console.log(`[SCRAPE] Qidirilmoqda: "Dollar kursi - ${today}"`);

    try {
        const response = await fetch('https://t.me/s/pulmasalasi');
        const html = await response.text();

        const postTexts = extractPostTexts(html);
        console.log(`[SCRAPE] Jami ${postTexts.length} ta post topildi`);

        // 1-urinish: Bugungi sanani qidirish
        let targetPost = findPostByDate(postTexts, today);
        let foundDate = today;

        // 2-urinish: Kechagi sanani qidirish (dam kunlari yoki kech soatlarda)
        if (!targetPost) {
            console.log(`[SCRAPE] Bugungi (${today}) topilmadi, kechagi (${yesterday}) qidirilmoqda...`);
            targetPost = findPostByDate(postTexts, yesterday);
            foundDate = yesterday;
        }

        // 3-urinish: Umuman "Dollar kursi" so'zi bor oxirgi post
        if (!targetPost) {
            console.log(`[SCRAPE] Kechagi ham topilmadi, oxirgi "Dollar kursi" posti qidirilmoqda...`);
            for (let i = postTexts.length - 1; i >= 0; i--) {
                if (postTexts[i].toLowerCase().includes('dollar kursi')) {
                    targetPost = postTexts[i];
                    // Sanani postdan olish
                    const dm = targetPost.match(/Dollar kursi\s*[-–—]\s*([\d.]+)/i);
                    foundDate = dm ? dm[1] : '?';
                    console.log(`[SCRAPE] Topildi! Sana: ${foundDate}`);
                    break;
                }
            }
        }

        if (!targetPost) {
            console.log('[SCRAPE] ❌ Hech qanday Dollar kursi posti topilmadi');
            console.log('[DEBUG] Oxirgi 3 post:');
            postTexts.slice(-3).forEach((p, i) => {
                console.log(`\n--- POST ${i + 1} ---\n${p}\n--- TUGADI ---`);
            });
            return { banks: [], source: 'not_found', lastFetch: now };
        }

        console.log(`[SCRAPE] ✅ Post topildi: Dollar kursi - ${foundDate}`);

        // Debug: to'liq post matni
        console.log('\n[DEBUG] ═══ POST MATNI ═══');
        console.log(targetPost);
        console.log('[DEBUG] ═══ TUGADI ═══\n');

        const result = parseFullPost(targetPost);
        result.postDate = foundDate;

        cachedData = {
            banks: result.banks,
            cbuRate: result.cbuRate,
            lastFetch: now,
            source: 'telegram_web',
            postDate: result.postDate
        };

        console.log(`[SCRAPE] ✅ CBU: ${result.cbuRate || 'topilmadi'}`);
        console.log(`[SCRAPE] ✅ ${result.banks.length} ta bank topildi:`);
        result.banks.forEach(b => {
            console.log(`    ${b.name}: olish=${b.buy || '—'} | sotish=${b.sell || '—'}`);
        });

        return cachedData;

    } catch (error) {
        console.error('[SCRAPE] Xatolik:', error.message);
        return { banks: [], source: 'error', error: error.message, lastFetch: now };
    }
}

// ============================================
//  ANIQ SANA BO'YICHA POST QIDIRISH
//  "Dollar kursi - 20.02.2026" ni qidiradi
// ============================================
function findPostByDate(posts, dateStr) {
    // Qidiruv uchun variantlar:
    //   "Dollar kursi - 20.02.2026"
    //   "Dollar kursi — 20.02.2026"
    //   "Dollar kursi – 20.02.2026"
    //   "Dollar kursi  20.02.2026"
    for (let i = posts.length - 1; i >= 0; i--) {
        const text = posts[i];
        if (
            text.includes(`Dollar kursi - ${dateStr}`) ||
            text.includes(`Dollar kursi — ${dateStr}`) ||
            text.includes(`Dollar kursi – ${dateStr}`) ||
            text.includes(`Dollar kursi  ${dateStr}`) ||
            text.includes(`dollar kursi - ${dateStr}`) ||
            text.includes(`dollar kursi — ${dateStr}`)
        ) {
            return text;
        }
    }
    return null;
}

// ============================================
//  HTML dan post matnlarini ajratish
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
    const result = {
        banks: [],
        cbuRate: null,
        postDate: null
    };

    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    console.log(`[PARSE] Jami ${lines.length} ta qator:`);
    lines.forEach((line, i) => {
        console.log(`[PARSE] [${i}] "${line}"`);
    });

    // Sana
    const dateMatch = text.match(/Dollar kursi\s*[-–—]\s*([\d.]+)/i);
    if (dateMatch) result.postDate = dateMatch[1];

    // CBU
    const cbuMatch = text.match(/[Mm]arkaziy bank kursi[:\s]*([\d\s]+[.,]?\d*)/);
    if (cbuMatch) {
        result.cbuRate = cbuMatch[1].replace(/\s/g, '').replace(',', '.');
        console.log(`[PARSE] ✅ CBU: ${result.cbuRate}`);
    }

    // Olish va Sotish
    const buyMap = {};
    const sellMap = {};
    let currentSection = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lower = line.toLowerCase();

        // Bo'lim aniqlash
        if (lower.includes('olish kursi') || lower.includes('sotib olish')) {
            currentSection = 'buy';
            console.log(`[PARSE] >>> OLISH bo'limi (qator ${i})`);
            continue;
        }

        if (lower.includes('sotish kursi') && !lower.includes('olish')) {
            currentSection = 'sell';
            console.log(`[PARSE] >>> SOTISH bo'limi (qator ${i})`);
            continue;
        }

        // Bank qatori
        if (currentSection) {
            const parsed = parseBankLine(line);
            if (parsed) {
                const key = normalizeKey(parsed.name);
                if (currentSection === 'buy') {
                    buyMap[key] = { name: parsed.name, buy: parsed.value };
                    console.log(`[PARSE]   ✅ OLISH: ${parsed.name} = ${parsed.value}`);
                } else {
                    sellMap[key] = { name: parsed.name, sell: parsed.value };
                    console.log(`[PARSE]   ✅ SOTISH: ${parsed.name} = ${parsed.value}`);
                }
            }
        }
    }

    // Birlashtirish
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

// ============================================
//  Bank qatori parse
// ============================================
function parseBankLine(line) {
    // Boshidagi "- ", "— " ni olib tashlash
    let cleaned = line.replace(/^\s*[-–—•▪️🔹🔸]\s*/, '').trim();
    if (cleaned.length < 3) return null;

    // USUL 1: "Bank nomi - 12 140"
    const dashMatch = cleaned.match(/^(.+?)\s*[-–—:]\s*([\d][\d\s]*\d)$/);
    if (dashMatch) {
        const name = dashMatch[1].replace(/[🏦💰💵]/g, '').trim();
        const value = parseInt(dashMatch[2].replace(/\s/g, ''));
        if (name.length >= 2 && value >= 1000 && value <= 999999) {
            return { name, value };
        }
    }

    // USUL 2: "Bank nomi 12140" (tiresiz)
    const noSepMatch = cleaned.match(/^(.+?)\s+([\d][\d\s]*\d)\s*$/);
    if (noSepMatch) {
        const name = noSepMatch[1].replace(/[🏦💰💵]/g, '').trim();
        const value = parseInt(noSepMatch[2].replace(/\s/g, ''));
        if (name.length >= 2 && value >= 1000 && value <= 999999 && /^[A-Za-z\u0400-\u04FFOoʻ']/.test(name)) {
            return { name, value };
        }
    }

    return null;
}

// ============================================
//  API
// ============================================
app.get('/api/banks', async (req, res) => {
    const result = await scrapeTelegramChannel();
    res.json({
        success: result.banks.length > 0,
        data: result.banks,
        source: result.source,
        count: result.banks.length,
        cbuFromTelegram: result.cbuRate || null,
        postDate: result.postDate || null,
        lastFetch: new Date(result.lastFetch).toISOString(),
        error: result.error || null
    });
});

app.get('/api/cbu', async (req, res) => {
    try {
        const response = await fetch('https://cbu.uz/uz/arkhiv-kursov-valyut/json/');
        const data = await response.json();
        const usd = data.find(item => item.Ccy === 'USD');
        res.json({ success: true, data: usd });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

app.get('/api/debug/posts', async (req, res) => {
    try {
        const response = await fetch('https://t.me/s/pulmasalasi');
        const html = await response.text();
        const posts = extractPostTexts(html);
        res.json({
            today: getTodayFormatted(),
            yesterday: getYesterdayFormatted(),
            searchingFor: `Dollar kursi - ${getTodayFormatted()}`,
            totalPosts: posts.length,
            lastPosts: posts.slice(-5)
        });
    } catch (error) {
        res.json({ error: error.message });
    }
});

app.get('/api/debug/raw', async (req, res) => {
    try {
        const response = await fetch('https://t.me/s/pulmasalasi');
        const html = await response.text();
        const today = getTodayFormatted();
        const idx = html.toLowerCase().indexOf('dollar kursi');
        if (idx !== -1) {
            const start = Math.max(0, idx - 200);
            const end = Math.min(html.length, idx + 2000);
            res.type('text/plain').send(
                `Bugungi sana: ${today}\nQidirilmoqda: "Dollar kursi - ${today}"\n\n` +
                html.substring(start, end)
            );
        } else {
            res.type('text/plain').send('Dollar kursi topilmadi\nHTML uzunligi: ' + html.length);
        }
    } catch (error) {
        res.json({ error: error.message });
    }
});

app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        today: getTodayFormatted(),
        cache: {
            bankCount: cachedData.banks.length,
            postDate: cachedData.postDate || null,
            lastFetch: cachedData.lastFetch ? new Date(cachedData.lastFetch).toISOString() : null
        }
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('');
    console.log('🚀 Dollar Kursi Server ishga tushdi!');
    console.log(`📡 http://localhost:${PORT}`);
    console.log(`📅 Bugungi sana: ${getTodayFormatted()}`);
    console.log(`🔍 Qidiriladi: "Dollar kursi - ${getTodayFormatted()}"`);
    console.log('');
});