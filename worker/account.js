/**
 * Особистий кабінет покупця: /api/account/*.
 * Вхід — телефон або email + пароль, який покупець придумує сам.
 * Пароль зберігається лише як хеш PBKDF2-SHA256 із сіллю; сам пароль ніде не записується.
 * Після входу браузер отримує підписаний cookie (HMAC) на 90 днів. Зміна пароля скасовує старі входи.
 */
import { loadStore } from './db.js';

export const STATUS_LABELS = { new: 'Нове', confirmed: 'Підтверджене', paid: 'Оплачене', shipped: 'Відправлене', done: 'Виконане', cancelled: 'Скасоване' };

const COOKIE = 'dr_c';
const TTL = 90 * 24 * 3600;
const ITER = 100000;
const enc = new TextEncoder();
const now = () => new Date().toISOString();
const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra } });
const parse = (s, d) => { try { return s == null ? d : JSON.parse(s); } catch { return d; } };
const clean = (v, n) => String(v == null ? '' : v).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const b64url = (buf) => b64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** +380XXXXXXXXX або '' */
export function normPhone(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.startsWith('380')) d = d.slice(3); else if (d.startsWith('80')) d = d.slice(2);
  if (d.startsWith('0')) d = d.slice(1);
  return d.length === 9 ? '+380' + d : '';
}
export const normEmail = (v) => {
  const e = String(v || '').trim().toLowerCase().slice(0, 200);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : '';
};

// ---------- паролі ----------
export async function hashPassword(pw, saltB64) {
  const salt = saltB64 ? unb64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITER }, key, 256);
  return `pbkdf2$${ITER}$${b64(salt)}$${b64(bits)}`;
}
async function checkPassword(pw, stored) {
  const [, , salt, hash] = String(stored || '').split('$');
  if (!salt || !hash) return false;
  const got = (await hashPassword(pw, salt)).split('$')[3];
  let d = got.length ^ hash.length;
  for (let i = 0; i < Math.min(got.length, hash.length); i++) d |= got.charCodeAt(i) ^ hash.charCodeAt(i);
  return d === 0;
}

// ---------- сесія ----------
let secretMemo = null;
async function secret(env) {
  if (secretMemo) return secretMemo;
  const db = env.DB;
  const rnd = b64url(crypto.getRandomValues(new Uint8Array(32)));
  await db.prepare(`INSERT OR IGNORE INTO secrets (key, value) VALUES ('customer_session', ?)`).bind(rnd).run();
  const r = await db.prepare(`SELECT value FROM secrets WHERE key='customer_session'`).first();
  secretMemo = (r && r.value) + '|' + (env.SESSION_SECRET || '');
  return secretMemo;
}
async function sign(env, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(await secret(env)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}
const pwv = (c) => String(c.pass_hash || '').slice(-12);
async function sessionCookie(env, c) {
  const exp = Math.floor(Date.now() / 1000) + TTL;
  const sig = await sign(env, `c:${c.id}:${exp}:${pwv(c)}`);
  return `${COOKIE}=${c.id}.${exp}.${sig}; Path=/; Max-Age=${TTL}; HttpOnly; Secure; SameSite=Lax`;
}
const logoutCookie = `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

/** Покупець за cookie або null. */
export async function currentCustomer(request, env) {
  if (!env.DB) return null;
  const m = (request.headers.get('cookie') || '').match(/(?:^|;\s*)dr_c=(\d+)\.(\d+)\.([A-Za-z0-9_-]+)/);
  if (!m || +m[2] < Date.now() / 1000) return null;
  const c = await env.DB.prepare(`SELECT * FROM customers WHERE id = ?`).bind(+m[1]).first();
  if (!c) return null;
  const want = await sign(env, `c:${c.id}:${m[2]}:${pwv(c)}`);
  let d = want.length ^ m[3].length;
  for (let i = 0; i < Math.min(want.length, m[3].length); i++) d |= want.charCodeAt(i) ^ m[3].charCodeAt(i);
  return d === 0 ? c : null;
}

export function publicCustomer(c) {
  return {
    id: c.id, first_name: c.first_name || '', last_name: c.last_name || '', middle_name: c.middle_name || '',
    phone: c.phone || '', email: c.email || '', delivery: parse(c.delivery, null), created_at: c.created_at,
  };
}

// ---------- обмеження спроб ----------
async function tooMany(db, key, limit, windowMs) {
  const since = Date.now() - windowMs;
  const r = await db.prepare(`SELECT COUNT(*) AS n FROM login_attempts WHERE ip = ? AND ts > ?`).bind(key, since).first();
  return r && r.n >= limit;
}
const attempt = (db, key) => db.prepare(`INSERT INTO login_attempts (ip, ts) VALUES (?, ?)`).bind(key, Date.now()).run();

/** Доставка з форми замовлення -> що запам'ятати в профілі (для автозаповнення наступного разу). */
export function deliveryForProfile(d, ref) {
  if (!d || !['np', 'np_courier', 'up', 'pickup'].includes(d.method)) return null;
  const r = ref && typeof ref === 'object' ? ref : {};
  const s = (v, n = 200) => clean(v, n);
  const out = { method: d.method };
  if (d.method !== 'pickup') {
    out.city = { id: s(r.cityId, 60), name: s(r.cityName || d.city), label: s(r.cityLabel || d.city, 300) };
    if (d.method === 'np' || d.method === 'up') out.branch = { id: s(r.branchId, 60), title: s(r.branchTitle || d.branch, 300), sub: s(r.branchSub, 300) };
    if (d.method === 'np_courier') out.address = s(d.address, 300);
  }
  return out;
}

/** Після замовлення від залогіненого покупця: доповнюємо порожні поля профілю й запам'ятовуємо доставку. */
export async function rememberFromOrder(env, c, o) {
  const cust = o.customer || {};
  const phone = c.phone || normPhone(cust.phone);
  const email = c.email || normEmail(cust.email);
  const deliv = deliveryForProfile(o.delivery, o.ref);
  // телефон/email можуть уже належати іншому кабінету — тоді не чіпаємо
  const st = env.DB.prepare(`UPDATE customers SET first_name = COALESCE(NULLIF(first_name,''), ?), last_name = COALESCE(NULLIF(last_name,''), ?),
    phone = CASE WHEN COALESCE(phone,'')='' AND NOT EXISTS (SELECT 1 FROM customers WHERE phone = ? AND id != ?) THEN ? ELSE phone END,
    email = CASE WHEN COALESCE(email,'')='' AND NOT EXISTS (SELECT 1 FROM customers WHERE email = ? AND id != ?) THEN ? ELSE email END,
    delivery = COALESCE(?, delivery), updated_at = ? WHERE id = ?`)
    .bind(clean(cust.firstName, 60), clean(cust.lastName, 60), phone || null, c.id, phone || null, email || null, c.id, email || null,
      deliv ? JSON.stringify(deliv) : null, now(), c.id);
  await st.run().catch((e) => console.log('remember_failed', String(e)));
}

// ---------- API ----------
export async function accountApi(request, env, url) {
  if (!env.DB) return json({ error: 'no_db' }, 503);
  const db = env.DB;
  const path = url.pathname.replace(/^\/api\/account\/?/, '');
  const m = request.method;
  // Захист від підробних запитів з чужих сайтів: зміни лише з нашого JS (власний заголовок).
  if (m !== 'GET' && request.headers.get('x-req') !== '1') return json({ error: 'forbidden' }, 403);
  const body = m === 'POST' || m === 'PUT' ? await request.json().catch(() => ({})) : {};
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';

  if (path === 'register' && m === 'POST') return register(env, body, ip);
  if (path === 'login' && m === 'POST') return login(env, body, ip);
  if (path === 'logout') return json({ ok: true }, 200, { 'set-cookie': logoutCookie });

  const c = await currentCustomer(request, env);
  // «Хто я?» для гостя — звичайна відповідь без помилки (сайт питає це на кожній сторінці)
  if (!c && path === 'me' && m === 'GET') return json({ customer: null });
  if (!c) return json({ error: 'unauthorized' }, 401, { 'set-cookie': logoutCookie });

  if (path === 'me' && m === 'GET') return json({ customer: publicCustomer(c) });
  if (path === 'profile' && m === 'PUT') return saveProfile(db, c, body);
  if (path === 'password' && m === 'PUT') return changePassword(env, c, body);
  if (path === 'orders' && m === 'GET') return myOrders(db, c);
  if (path === 'link-orders' && m === 'POST') return linkOrders(db, c, body, ip);
  if (path === 'wishlist' && m === 'GET') return wishlist(env, c);
  if (path === 'wishlist' && m === 'POST') return toggleWish(env, c, body);
  return json({ error: 'not_found' }, 404);
}

async function register(env, b, ip) {
  const db = env.DB;
  if (await tooMany(db, 'r:' + ip, 10, 3600e3)) return json({ error: 'too_many', message: 'Забагато спроб. Спробуйте пізніше.' }, 429);
  const first = clean(b.first_name, 60), last = clean(b.last_name, 60);
  const phone = b.phone ? normPhone(b.phone) : '', email = b.email ? normEmail(b.email) : '';
  const pw = String(b.password || '');
  const fields = [];
  if (first.length < 2) fields.push('first_name');
  if (b.phone && !phone) fields.push('phone');
  if (b.email && !email) fields.push('email');
  if (!phone && !email) fields.push('login');
  if (pw.length < 6 || pw.length > 200) fields.push('password');
  if (fields.length) return json({ error: 'validation', fields }, 422);
  const dupe = await db.prepare(`SELECT id FROM customers WHERE (phone = ? AND ? != '') OR (email = ? AND ? != '')`).bind(phone, phone, email, email).first();
  if (dupe) return json({ error: 'exists', message: 'Кабінет із таким телефоном або email уже є. Увійдіть або скористайтеся «Забули пароль?».' }, 409);
  await attempt(db, 'r:' + ip);
  const at = now();
  const hash = await hashPassword(pw);
  const r = await db.prepare(`INSERT INTO customers (phone, email, first_name, last_name, pass_hash, created_at, updated_at, last_login) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(phone || null, email || null, first, last, hash, at, at, at).run();
  const c = await db.prepare(`SELECT * FROM customers WHERE id = ?`).bind(r.meta.last_row_id).first();
  return json({ ok: true, customer: publicCustomer(c) }, 200, { 'set-cookie': await sessionCookie(env, c) });
}

async function login(env, b, ip) {
  const db = env.DB;
  if (await tooMany(db, 'c:' + ip, 10, 15 * 60e3)) return json({ error: 'too_many', message: 'Забагато спроб. Спробуйте за 15 хвилин.' }, 429);
  const id = String(b.login || '').trim();
  const phone = id.includes('@') ? '' : normPhone(id), email = id.includes('@') ? normEmail(id) : '';
  const c = phone || email ? await db.prepare(`SELECT * FROM customers WHERE ${phone ? 'phone' : 'email'} = ?`).bind(phone || email).first() : null;
  const ok = c ? await checkPassword(String(b.password || ''), c.pass_hash) : (await hashPassword('x'), false);
  if (!ok) {
    await attempt(db, 'c:' + ip);
    return json({ error: 'bad_login', message: 'Невірний телефон/email або пароль' }, 401);
  }
  await db.prepare(`UPDATE customers SET last_login = ? WHERE id = ?`).bind(now(), c.id).run();
  return json({ ok: true, customer: publicCustomer(c) }, 200, { 'set-cookie': await sessionCookie(env, c) });
}

async function saveProfile(db, c, b) {
  const first = clean(b.first_name, 60), last = clean(b.last_name, 60), mid = clean(b.middle_name, 60);
  const phone = b.phone ? normPhone(b.phone) : '', email = b.email ? normEmail(b.email) : '';
  const fields = [];
  if (first.length < 2) fields.push('first_name');
  if (b.phone && !phone) fields.push('phone');
  if (b.email && !email) fields.push('email');
  if (!phone && !email) fields.push('login');
  if (fields.length) return json({ error: 'validation', fields }, 422);
  const dupe = await db.prepare(`SELECT id FROM customers WHERE id != ? AND ((phone = ? AND ? != '') OR (email = ? AND ? != ''))`).bind(c.id, phone, phone, email, email).first();
  if (dupe) return json({ error: 'exists', message: 'Цей телефон або email уже використовується в іншому кабінеті.' }, 409);
  let delivery = c.delivery;
  if (b.delivery !== undefined) {
    const d = b.delivery;
    delivery = d && typeof d === 'object' ? JSON.stringify(deliveryForProfile(
      { method: d.method, city: d.city && d.city.label, branch: d.branch && d.branch.title, address: d.address },
      { cityId: d.city && d.city.id, cityName: d.city && d.city.name, cityLabel: d.city && d.city.label, branchId: d.branch && d.branch.id, branchTitle: d.branch && d.branch.title, branchSub: d.branch && d.branch.sub },
    )) : null;
  }
  await db.prepare(`UPDATE customers SET first_name=?, last_name=?, middle_name=?, phone=?, email=?, delivery=?, updated_at=? WHERE id=?`)
    .bind(first, last, mid, phone || null, email || null, delivery, now(), c.id).run();
  const nc = await db.prepare(`SELECT * FROM customers WHERE id = ?`).bind(c.id).first();
  return json({ ok: true, customer: publicCustomer(nc) });
}

async function changePassword(env, c, b) {
  if (!(await checkPassword(String(b.old || ''), c.pass_hash))) return json({ error: 'bad_password', message: 'Поточний пароль невірний' }, 401);
  const pw = String(b.password || '');
  if (pw.length < 6 || pw.length > 200) return json({ error: 'validation', fields: ['password'] }, 422);
  const hash = await hashPassword(pw);
  await env.DB.prepare(`UPDATE customers SET pass_hash=?, updated_at=? WHERE id=?`).bind(hash, now(), c.id).run();
  return json({ ok: true }, 200, { 'set-cookie': await sessionCookie(env, { ...c, pass_hash: hash }) });
}

export function customerOrder(r) {
  return {
    id: r.id, created_at: r.created_at, status: r.status, status_label: STATUS_LABELS[r.status] || r.status,
    delivery: parse(r.delivery, {}), payment: r.payment, items: parse(r.items, []), total: r.total, ttn: r.ttn || '', comment: r.comment || '',
  };
}

async function myOrders(db, c) {
  const rows = (await db.prepare(`SELECT id, created_at, status, delivery, payment, items, total, ttn, comment FROM orders WHERE customer_id = ? ORDER BY created_at DESC LIMIT 200`).bind(c.id).all()).results;
  return json({ items: rows.map(customerOrder) });
}

/** Прив'язати раніше оформлені замовлення: потрібен номер замовлення і телефон, з яким його оформлено. */
async function linkOrders(db, c, b, ip) {
  if (await tooMany(db, 'l:' + ip, 30, 3600e3)) return json({ error: 'too_many', message: 'Забагато спроб. Спробуйте пізніше.' }, 429);
  const list = (Array.isArray(b.orders) ? b.orders : [b]).slice(0, 20);
  let linked = 0, failed = 0;
  for (const x of list) {
    const id = String(x.id || '').trim().replace(/^№/, '');
    const phone = normPhone(x.phone || c.phone);
    if (!/^\d{6}-\d{4}$/.test(id) || !phone) { failed++; continue; }
    const r = await db.prepare(`UPDATE orders SET customer_id = ? WHERE id = ? AND phone = ? AND customer_id IS NULL`).bind(c.id, id, phone).run();
    if (r.meta.changes) linked++;
    else {
      const mine = await db.prepare(`SELECT 1 FROM orders WHERE id = ? AND customer_id = ?`).bind(id, c.id).first();
      if (mine) linked++; else { failed++; await attempt(db, 'l:' + ip); }
    }
  }
  return json({ ok: true, linked, failed });
}

// ---------- збережені товари ----------
function productCard(p) {
  return { slug: p.slug, title: p.title, img: p.cover || '', min: p.min, max: p.max, url: `/tovar/${p.slug}.html`, stock: p.variants.some((v) => v.in_stock) };
}
async function wishlist(env, c) {
  const rows = (await env.DB.prepare(`SELECT product_id FROM wishlist WHERE customer_id = ? ORDER BY created_at DESC`).bind(c.id).all()).results;
  const S = await loadStore(env);
  const byId = new Map(S.products.map((p) => [p.id, p]));
  const items = rows.map((r) => byId.get(r.product_id)).filter((p) => p && p.visible).map(productCard);
  return json({ items });
}
async function toggleWish(env, c, b) {
  const S = await loadStore(env);
  const add = (Array.isArray(b.add) ? b.add : []).slice(0, 200).map((s) => S.bySlug.get(String(s))).filter(Boolean);
  const del = (Array.isArray(b.remove) ? b.remove : []).slice(0, 200).map((s) => S.bySlug.get(String(s))).filter(Boolean);
  const db = env.DB, at = now();
  const st = [
    ...add.map((p) => db.prepare(`INSERT OR IGNORE INTO wishlist (customer_id, product_id, created_at) VALUES (?, ?, ?)`).bind(c.id, p.id, at)),
    ...del.map((p) => db.prepare(`DELETE FROM wishlist WHERE customer_id = ? AND product_id = ?`).bind(c.id, p.id)),
  ];
  if (st.length) await db.batch(st);
  return wishlist(env, c);
}

/** Публічно: короткі дані товарів для списку збережених у гостя (без входу). */
export async function productsBySlugs(env, url) {
  const slugs = String(url.searchParams.get('slugs') || '').split(',').filter(Boolean).slice(0, 200);
  const S = await loadStore(env);
  return json({ items: slugs.map((s) => S.bySlug.get(s)).filter((p) => p && p.visible).map(productCard) });
}
