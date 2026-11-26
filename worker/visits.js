/**
 * Власний облік відвідувань сайту (без cookie, без сторонніх лічильників, без персональних даних).
 *
 * Кожен перегляд сторінки вітрини — один рядок у таблиці visits (D1).
 * Відвідувач = хеш (IP + браузер + дата + секретна «сіль»), обрізаний до 16 символів.
 * Хеш щодня інший, тож людину не можна відстежити між днями, а IP ніде не зберігається
 * (як у Plausible / Cloudflare Web Analytics). Тому «відвідувачі» = унікальні за кожен день.
 *
 * Візит = перегляд, на який людина прийшла ззовні (не з іншої сторінки нашого сайту).
 * Джерело візиту береться з utm_source, міток реклами (gclid/fbclid/ttclid) або з Referer.
 * Боти, попередні завантаження браузера й адмін (з cookie входу) не рахуються.
 */
import { isAuthed } from './auth.js';

export const VISITS_TABLE = [
  `CREATE TABLE IF NOT EXISTS visits (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, day TEXT NOT NULL, vid TEXT NOT NULL,
     path TEXT NOT NULL, entry INTEGER DEFAULT 0, src TEXT DEFAULT '', ref TEXT DEFAULT '', device TEXT DEFAULT '', country TEXT DEFAULT '', city TEXT DEFAULT '')`,
  `CREATE INDEX IF NOT EXISTS visits_day ON visits(day)`,
];

const BOT = /bot|crawl|spider|slurp|scrap|fetch|preview|facebookexternalhit|meta-externalagent|whatsapp|telegram|viber|skype|curl|wget|python|java\/|go-http|okhttp|axios|node-fetch|headless|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|semrush|ahrefs|mj12|dotbot|petal|bytespider|yandex|bingpreview|google-inspectiontool|apis-google|mediapartners|adsbot|feedfetcher|chrome-lighthouse|gptbot|claude|anthropic|perplexity|ccbot/i;

/** Дата в часовому поясі Києва (YYYY-MM-DD). */
export const kyivDay = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

const SOURCES = [
  [/(^|\.)google\./, 'google'], [/(^|\.)(facebook|fb)\.(com|me)$|(^|\.)fb\.watch$/, 'facebook'], [/(^|\.)instagram\.com$/, 'instagram'],
  [/(^|\.)tiktok\.com$/, 'tiktok'], [/(^|\.)(t\.me|telegram\.(org|me))$/, 'telegram'], [/(^|\.)viber\.com$/, 'viber'],
  [/(^|\.)youtube\.com$|(^|\.)youtu\.be$/, 'youtube'], [/(^|\.)bing\.com$/, 'bing'], [/(^|\.)duckduckgo\.com$/, 'duckduckgo'],
  [/(^|\.)prom\.ua$/, 'prom'], [/(^|\.)rozetka\.com\.ua$/, 'rozetka'], [/(^|\.)olx\.ua$/, 'olx'], [/(^|\.)pinterest\./, 'pinterest'],
];
const UTM = { fb: 'facebook', ig: 'instagram', tg: 'telegram', tt: 'tiktok', yt: 'youtube' };

/** Звідки прийшли: [джерело, домен-реферер]. Порожнє джерело = зайшли напряму (закладка, набрали адресу). */
export function sourceOf(url, referer) {
  let host = '';
  try { host = referer ? new URL(referer).hostname.replace(/^www\.|^m\.|^l\.|^lm\./, '') : ''; } catch { host = ''; }
  const q = url.searchParams;
  const utm = (q.get('utm_source') || '').toLowerCase().trim().slice(0, 40);
  if (utm) return [UTM[utm] || utm.replace(/[^a-z0-9._-]/g, '') || 'інше', host];
  if (q.has('gclid') || q.has('gbraid') || q.has('wbraid')) return ['google', host];
  if (q.has('fbclid')) return [host.includes('instagram') ? 'instagram' : 'facebook', host];
  if (q.has('ttclid')) return ['tiktok', host];
  if (!host) return ['', ''];
  for (const [re, name] of SOURCES) if (re.test(host)) return [name, host];
  return [host, host];
}

const deviceOf = (ua) => (/ipad|tablet|(android(?!.*mobile))/i.test(ua) ? 'tablet' : /mobi|iphone|android/i.test(ua) ? 'mobile' : 'desktop');

let saltP = null;
function salt(db) {
  if (!saltP) saltP = (async () => {
    const rnd = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24))));
    await db.prepare(`INSERT OR IGNORE INTO secrets (key, value) VALUES ('visit_salt', ?)`).bind(rnd).run();
    const r = await db.prepare(`SELECT value FROM secrets WHERE key='visit_salt'`).first();
    return r.value;
  })().catch((e) => { saltP = null; throw e; });
  return saltP;
}

async function visitorId(db, day, ip, ua) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${await salt(db)}|${day}|${ip}|${ua}`));
  return [...new Uint8Array(buf).slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Записати перегляд сторінки (викликається через ctx.waitUntil, щоб не гальмувати сайт). */
export async function trackView(request, env, url, status) {
  if (request.method !== 'GET' || status !== 200) return;
  const h = request.headers;
  const ua = h.get('user-agent') || '';
  if (!ua || BOT.test(ua)) return;
  const purpose = (h.get('sec-purpose') || h.get('purpose') || h.get('x-moz') || '').toLowerCase();
  if (purpose.includes('prefetch') || purpose.includes('prerender')) return;
  if (h.get('sec-fetch-dest') && h.get('sec-fetch-dest') !== 'document') return;
  if (await isAuthed(request, env)) return; // власник магазину в адмінці
  const db = env.DB;
  const ref = h.get('referer') || '';
  let internal = false;
  try { internal = !!ref && new URL(ref).hostname === url.hostname; } catch { internal = false; }
  const [src, refHost] = internal ? ['', ''] : sourceOf(url, ref);
  const now = new Date();
  const day = kyivDay(now);
  const vid = await visitorId(db, day, h.get('cf-connecting-ip') || '', ua);
  const cf = request.cf || {};
  await db.prepare(`INSERT INTO visits (ts, day, vid, path, entry, src, ref, device, country, city) VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .bind(now.toISOString(), day, vid, decodeURIComponent(url.pathname).slice(0, 200), internal ? 0 : 1, src, refHost.slice(0, 100),
      deviceOf(ua), String(cf.country || '').slice(0, 2), String(cf.city || '').slice(0, 60)).run();
}

// ---------------- Звіт для адмінки ----------------
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const addDays = (day, n) => { const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** Межі періоду в UTC для порівняння з created_at замовлень (Київ = UTC+2/+3). */
function kyivStartUtc(day) {
  for (const off of [2, 3]) {
    const t = new Date(Date.parse(day + 'T00:00:00Z') - off * 3600e3);
    if (kyivDay(t) === day && kyivDay(new Date(t - 1)) !== day) return t.toISOString();
  }
  return new Date(Date.parse(day + 'T00:00:00Z') - 2 * 3600e3).toISOString();
}

export async function visitsReport(db, url, S) {
  const today = kyivDay();
  let to = url.searchParams.get('to'), from = url.searchParams.get('from');
  if (!DAY_RE.test(to || '')) to = today;
  if (!DAY_RE.test(from || '')) from = addDays(to, -6);
  if (from > to) [from, to] = [to, from];
  if (from < addDays(to, -400)) from = addDays(to, -400);
  const W = `day >= ? AND day <= ?`;
  const b = (st) => st.bind(from, to);
  const [tot, daily, pages, srcs, refs, dev, geo, ord] = await db.batch([
    b(db.prepare(`SELECT COUNT(*) AS views, COUNT(DISTINCT day || vid) AS visitors, COALESCE(SUM(entry),0) AS visits FROM visits WHERE ${W}`)),
    b(db.prepare(`SELECT day, COUNT(*) AS views, COUNT(DISTINCT vid) AS visitors FROM visits WHERE ${W} GROUP BY day ORDER BY day`)),
    b(db.prepare(`SELECT path, COUNT(*) AS views, COUNT(DISTINCT day || vid) AS visitors FROM visits WHERE ${W} GROUP BY path ORDER BY views DESC LIMIT 15`)),
    b(db.prepare(`SELECT src, COUNT(*) AS visits, COUNT(DISTINCT day || vid) AS visitors FROM visits WHERE ${W} AND entry=1 GROUP BY src ORDER BY visits DESC LIMIT 15`)),
    b(db.prepare(`SELECT ref, COUNT(*) AS visits FROM visits WHERE ${W} AND entry=1 AND ref != '' GROUP BY ref ORDER BY visits DESC LIMIT 10`)),
    b(db.prepare(`SELECT device, COUNT(DISTINCT day || vid) AS visitors FROM visits WHERE ${W} GROUP BY device ORDER BY visitors DESC`)),
    b(db.prepare(`SELECT country, city, COUNT(DISTINCT day || vid) AS visitors FROM visits WHERE ${W} GROUP BY country, city ORDER BY visitors DESC LIMIT 10`)),
    db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(total),0) AS sum FROM orders WHERE created_at >= ? AND created_at < ? AND status != 'cancelled'`).bind(kyivStartUtc(from), kyivStartUtc(addDays(to, 1))),
  ]);
  // Чистимо дані, старші за 13 місяців, щоб база не росла безкінечно.
  await db.prepare(`DELETE FROM visits WHERE day < ?`).bind(addDays(today, -400)).run();
  const title = (p) => {
    let m = /^\/tovar\/([a-z0-9-]+)/.exec(p); if (m && S) { const x = S.bySlug.get(m[1]); if (x) return x.title; }
    m = /^\/kategoriya\/([a-z0-9-]+)/.exec(p); if (m && S) { const x = S.catBySlug.get(m[1]); if (x) return x.name; }
    const c = p.replace(/^\/|\/$|\.html$/g, '');
    if (!c || c === 'index') return 'Головна';
    if (c === 'katalog') return 'Каталог'; if (c === 'koshyk') return 'Кошик'; if (c === 'kabinet') return 'Кабінет';
    if (S) { const pg = S.pageBySlug.get(c); if (pg) return pg.title; }
    return '';
  };
  const byDay = new Map(daily.results.map((r) => [r.day, r]));
  const days = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(byDay.get(d) || { day: d, views: 0, visitors: 0 });
  return {
    from, to, today, total: tot.results[0], days,
    pages: pages.results.map((r) => ({ ...r, title: title(r.path) })),
    sources: srcs.results, referrers: refs.results, devices: dev.results, geo: geo.results, orders: ord.results[0],
  };
}
