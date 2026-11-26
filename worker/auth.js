/**
 * Вхід в адмінку: один пароль із секрету ADMIN_PASSWORD.
 * Після входу браузер отримує підписаний cookie (HMAC-SHA256) на 14 днів.
 * Зміна пароля (або SESSION_SECRET) одразу робить недійсними всі старі входи.
 */
const COOKIE = 'dr_adm';
const TTL = 14 * 24 * 3600;
const DAY = 24 * 3600 * 1000;
const enc = new TextEncoder();

async function hmac(env, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode('adm|' + (env.ADMIN_PASSWORD || '') + '|' + (env.SESSION_SECRET || '')),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Порівняння без витоку часу: порівнюємо HMAC від обох рядків. */
async function safeEqual(env, a, b) {
  const [x, y] = await Promise.all([hmac(env, 'cmp:' + a), hmac(env, 'cmp:' + b)]);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.min(x.length, y.length); i++) d |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return d === 0;
}

function readCookie(req, name) {
  const m = (req.headers.get('cookie') || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? m[1] : '';
}

export async function isAuthed(req, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const v = readCookie(req, COOKIE);
  const [exp, sig] = v.split('.');
  if (!exp || !sig || +exp < Date.now() / 1000) return false;
  return safeEqual(env, sig, await hmac(env, 'session:' + exp));
}

const clientIp = (req) => req.headers.get('cf-connecting-ip') || 'unknown';

export async function login(req, env) {
  if (!env.ADMIN_PASSWORD) return { status: 503, body: { error: 'not_configured' } };
  const ip = clientIp(req);
  const since = Date.now() - 15 * 60 * 1000;
  const db = env.DB;
  // Ліміти невдалих спроб з однієї адреси: 10 за 15 хвилин і 30 за добу (підбір пароля стає безнадійно довгим).
  const r = await db.prepare(`SELECT SUM(ts > ?) AS n, COUNT(*) AS day FROM login_attempts WHERE ip = ? AND ts > ?`).bind(since, ip, Date.now() - DAY).first();
  if (r && (r.n >= 10 || r.day >= 30)) return { status: 429, body: { error: 'too_many', message: r.day >= 30 ? 'Забагато невдалих спроб. Спробуйте завтра.' : 'Забагато спроб. Спробуйте за 15 хвилин.' } };
  let body = {};
  try { body = await req.json(); } catch {}
  const ok = await safeEqual(env, String(body.password || ''), env.ADMIN_PASSWORD);
  if (!ok) {
    await db.batch([
      db.prepare(`INSERT INTO login_attempts (ip, ts) VALUES (?, ?)`).bind(ip, Date.now()),
      // Старі записи прибираємо лише після 2 діб: таблицю ділять і інші ліміти (кабінет, замовлення) з довшими вікнами.
      db.prepare(`DELETE FROM login_attempts WHERE ts < ?`).bind(Date.now() - 2 * DAY),
    ]);
    return { status: 401, body: { error: 'bad_password', message: 'Невірний пароль' } };
  }
  await db.prepare(`DELETE FROM login_attempts WHERE ip = ?`).bind(ip).run();
  const exp = Math.floor(Date.now() / 1000) + TTL;
  const cookie = `${COOKIE}=${exp}.${await hmac(env, 'session:' + exp)}; Path=/; Max-Age=${TTL}; HttpOnly; Secure; SameSite=Strict`;
  return { status: 200, body: { ok: true }, headers: { 'set-cookie': cookie } };
}

export const logoutCookie = `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
