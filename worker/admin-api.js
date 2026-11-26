/**
 * API бек-офісу: /api/admin/*. Усе, крім входу, вимагає cookie адміністратора.
 */
import { isAuthed, login, logoutCookie } from './auth.js';
import { bumpVersion, loadStore } from './db.js';
import { visitsReport } from './visits.js';
import { hashPassword, normPhone, normEmail, publicCustomer, customerOrder } from './account.js';
import { checkoutConfig, cleanCheckout } from './checkout.js';
import { loadNotify, cleanNotify, processOrder, testNotify, SMS_PROVIDERS } from './notify.js';

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra } });
const bad = (message, status = 400) => json({ error: 'bad_request', message }, status);
const parse = (s, d) => { try { return s == null ? d : JSON.parse(s); } catch { return d; } };
const str = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
const int = (v, d = 0) => (Number.isFinite(+v) ? Math.round(+v) : d);
const num = (v) => (Number.isFinite(+v) && +v >= 0 ? Math.round(+v * 100) / 100 : 0);
const flag = (v) => (v ? 1 : 0);
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED = new Set(['index', 'katalog', 'koshyk', '404', 'sitemap', 'robots', 'google-feed', 'admin', 'api', 'assets', 'img', 'media', 'tovar', 'kategoriya']);
const now = () => new Date().toISOString();

const TR = { а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z', и: 'y', і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ю: 'iu', я: 'ia', ы: 'y', э: 'e', ё: 'io', ъ: '' };
export const slugify = (s) => String(s || '').toLowerCase().replace(/[’']/g, '').split('').map((c) => (c in TR ? TR[c] : c)).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

const SETTINGS_KEYS = ['site_url', 'shop_name', 'phone', 'telegram', 'viber', 'email', 'city', 'delivery', 'payment', 'pickup_address', 'pickup_hours', 'free_ship_from', 'colors'];
export const ORDER_STATUSES = ['new', 'confirmed', 'paid', 'shipped', 'done', 'cancelled'];

export async function adminApi(request, env, url) {
  const path = url.pathname.replace(/^\/api\/admin\/?/, '');
  const m = request.method;
  if (path === 'login' && m === 'POST') {
    const r = await login(request, env);
    return json(r.body, r.status, r.headers || {});
  }
  if (path === 'logout') return json({ ok: true }, 200, { 'set-cookie': logoutCookie });
  if (!(await isAuthed(request, env))) return json({ error: 'unauthorized', configured: !!env.ADMIN_PASSWORD }, 401);
  // Захист від CSRF: зміни лише з нашого ж інтерфейсу (cookie SameSite=Strict + власний заголовок).
  if (m !== 'GET' && request.headers.get('x-admin') !== '1') return json({ error: 'forbidden' }, 403);

  const db = env.DB;
  const seg = path.split('/').filter(Boolean);
  const [res, id] = seg;
  const body = m === 'POST' || m === 'PUT' || m === 'PATCH' ? (res === 'media' ? null : await request.json().catch(() => ({}))) : null;
  const write = async (fn) => { const out = await fn(); await bumpVersion(db); return out; };

  switch (res) {
    case 'me': return json({ ok: true });
    case 'dashboard': return dashboard(db);
    case 'visits': return json(await visitsReport(db, url, await loadStore(env).catch(() => null)));
    case 'orders':
      if (id === 'export.csv') return ordersCsv(db, url);
      if (!id && m === 'GET') return listOrders(db, url);
      if (id && m === 'GET') return getOrder(db, id);
      if (id && m === 'PATCH') return updateOrder(env, id, body);
      if (id && seg[2] === 'notify' && m === 'POST') return resendNotify(env, id, body);
      if (id && m === 'DELETE') { await db.prepare(`DELETE FROM orders WHERE id = ?`).bind(id).run(); return json({ ok: true }); }
      break;
    case 'settings':
      if (m === 'GET') return getSettings(db);
      if (m === 'PUT') return write(() => putSettings(db, body));
      break;
    case 'notify':
      if (m === 'GET') return getNotify(env, db);
      if (m === 'PUT') return putNotify(env, db, body);
      break;
    case 'notify-test':
      if (m === 'POST') return json(await testNotify(env, db, body || {}).catch((e) => ({ error: e.message })));
      break;
    case 'checkout':
      if (m === 'GET') return getCheckout(db);
      if (m === 'PUT') return write(() => putCheckout(db, body));
      break;
    case 'home':
      if (m === 'GET') return json(parse((await db.prepare(`SELECT value FROM settings WHERE key='home'`).first() || {}).value, {}));
      if (m === 'PUT') return write(async () => {
        await db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('home', ?)`).bind(JSON.stringify(cleanHome(body))).run();
        return json({ ok: true });
      });
      break;
    case 'groups': return m === 'GET' ? crudGroups(db, m) : write(() => crudGroups(db, m, id, body));
    case 'categories':
      if (m === 'GET') return id ? getCategory(db, +id) : listCategories(db);
      return write(() => saveCategory(db, m, id, body));
    case 'attributes':
      if (m === 'GET') return listAttributes(db);
      return write(() => saveAttribute(db, m, id, body));
    case 'options': return listOptions(db);
    case 'products':
      if (m === 'GET') return id ? getProduct(db, +id) : listProducts(db, url);
      if (id === 'bulk' && m === 'POST') return write(() => bulkProducts(db, body));
      return write(() => saveProduct(db, m, id, body));
    case 'pages':
      if (m === 'GET') return id ? getPage(db, +id) : json((await db.prepare(`SELECT id, slug, title, in_menu, in_footer, active, sort FROM pages ORDER BY sort, id`).all()).results);
      return write(() => savePage(db, m, id, body));
    case 'media':
      if (m === 'GET') return json((await db.prepare(`SELECT id, name, mime, size, created_at FROM media ORDER BY created_at DESC LIMIT 500`).all()).results);
      if (m === 'POST') return uploadMedia(db, request);
      if (m === 'DELETE' && id) { await db.prepare(`DELETE FROM media WHERE id = ?`).bind(id).run(); return json({ ok: true }); }
      break;
    case 'reviews':
      if (!id && m === 'GET') {
        const st = url.searchParams.get('status') || 'pending';
        const rows = (await db.prepare(`SELECT r.id, r.name, r.rating, r.text, r.status, r.created_at, p.title, p.slug FROM reviews r
          LEFT JOIN products p ON p.id = r.product_id ${st === 'all' ? '' : 'WHERE r.status = ?'} ORDER BY r.created_at DESC LIMIT 300`)
          .bind(...(st === 'all' ? [] : [st])).all()).results;
        const cnt = (await db.prepare(`SELECT status, COUNT(*) AS n FROM reviews GROUP BY status`).all()).results;
        return json({ items: rows, counts: Object.fromEntries(cnt.map((r) => [r.status, r.n])) });
      }
      if (id && m === 'PATCH') {
        if (!['approved', 'rejected', 'pending'].includes(body.status)) return bad('Невідомий статус');
        return write(async () => { await db.prepare(`UPDATE reviews SET status = ? WHERE id = ?`).bind(body.status, +id).run(); return json({ ok: true }); });
      }
      if (id && m === 'DELETE') return write(async () => { await db.prepare(`DELETE FROM reviews WHERE id = ?`).bind(+id).run(); return json({ ok: true }); });
      break;
    case 'customers':
      if (!id && m === 'GET') return listCustomers(db, url);
      if (id && seg[2] === 'link' && m === 'POST') return linkCustomerOrder(db, +id, body);
      if (id && m === 'GET') return getCustomer(db, +id);
      if (id && m === 'PATCH') return updateCustomer(db, +id, body);
      if (id && m === 'DELETE') {
        await db.batch([db.prepare(`UPDATE orders SET customer_id = NULL WHERE customer_id = ?`).bind(+id), db.prepare(`DELETE FROM wishlist WHERE customer_id = ?`).bind(+id), db.prepare(`DELETE FROM customers WHERE id = ?`).bind(+id)]);
        return json({ ok: true });
      }
      break;
    case 'export': return exportAll(db);
    case 'telegram-test': return telegramTest(env);
  }
  return json({ error: 'not_found' }, 404);
}

// ---------- огляд ----------
async function dashboard(db) {
  const day = new Date(Date.now() - 24 * 3600e3).toISOString();
  const month = new Date(Date.now() - 30 * 24 * 3600e3).toISOString();
  const [st, d1, d30, recent, cnt] = await db.batch([
    db.prepare(`SELECT status, COUNT(*) AS n FROM orders GROUP BY status`),
    db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(total),0) AS sum FROM orders WHERE created_at > ? AND status != 'cancelled'`).bind(day),
    db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(total),0) AS sum FROM orders WHERE created_at > ? AND status != 'cancelled'`).bind(month),
    db.prepare(`SELECT id, created_at, status, name, phone, total FROM orders ORDER BY created_at DESC LIMIT 8`),
    db.prepare(`SELECT (SELECT COUNT(*) FROM products) AS products, (SELECT COUNT(*) FROM products WHERE active=1) AS active,
      (SELECT COUNT(*) FROM variants) AS variants, (SELECT COUNT(*) FROM reviews WHERE status='pending') AS reviews_pending, (SELECT COUNT(*) FROM categories) AS categories, (SELECT COUNT(*) FROM pages) AS pages,
      (SELECT COUNT(*) FROM products p WHERE p.image='' AND NOT EXISTS (SELECT 1 FROM variants v WHERE v.product_id=p.id AND v.image!='')) AS no_photo`),
  ]);
  return json({ byStatus: Object.fromEntries(st.results.map((r) => [r.status, r.n])), day: d1.results[0], month: d30.results[0], recent: recent.results, counts: cnt.results[0] });
}

// ---------- замовлення ----------
function orderRow(r) {
  return { ...r, delivery: parse(r.delivery, {}), items: parse(r.items, []), call_me: !!r.call_me, telegram_ok: !!r.telegram_ok, notify: parse(r.notify || null, {}) || {} };
}

function orderWhere(url) {
  const w = [], a = [];
  const status = url.searchParams.get('status');
  if (status && ORDER_STATUSES.includes(status)) { w.push('status = ?'); a.push(status); }
  const q = str(url.searchParams.get('q'), 100);
  if (q) {
    const digits = q.replace(/\D/g, '');
    w.push(`(id LIKE ? OR name LIKE ? OR email LIKE ? OR ttn LIKE ?${digits.length >= 3 ? ' OR phone LIKE ?' : ''} OR items LIKE ?)`);
    a.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    if (digits.length >= 3) a.push(`%${digits}%`);
    a.push(`%${q}%`);
  }
  const from = url.searchParams.get('from'), to = url.searchParams.get('to');
  if (/^\d{4}-\d\d-\d\d$/.test(from || '')) { w.push('created_at >= ?'); a.push(from); }
  if (/^\d{4}-\d\d-\d\d$/.test(to || '')) { w.push('created_at < ?'); a.push(new Date(Date.parse(to) + 864e5).toISOString().slice(0, 10)); }
  return [w.length ? 'WHERE ' + w.join(' AND ') : '', a];
}

async function listOrders(db, url) {
  const [where, a] = orderWhere(url);
  const page = Math.max(1, int(url.searchParams.get('page'), 1));
  const per = 50;
  const [rows, total] = await db.batch([
    db.prepare(`SELECT id, created_at, status, name, phone, delivery, payment, total, ttn, items, customer_id FROM orders ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).bind(...a, per, (page - 1) * per),
    db.prepare(`SELECT COUNT(*) AS n FROM orders ${where}`).bind(...a),
  ]);
  return json({
    items: rows.results.map((r) => { const o = orderRow(r); o.count = o.items.reduce((s, i) => s + (+i.qty || 0), 0); delete o.items; return o; }),
    total: total.results[0].n, page, per,
  });
}

async function getOrder(db, id) {
  const r = await db.prepare(`SELECT * FROM orders WHERE id = ?`).bind(id).first();
  return r ? json(orderRow(r)) : json({ error: 'not_found' }, 404);
}

async function updateOrder(env, id, b) {
  const db = env.DB;
  const r = await db.prepare(`SELECT * FROM orders WHERE id = ?`).bind(id).first();
  if (!r) return json({ error: 'not_found' }, 404);
  const o = orderRow(r);
  const prev = { status: o.status, ttn: o.ttn };
  if (b.status !== undefined) { if (!ORDER_STATUSES.includes(b.status)) return bad('Невідомий статус'); o.status = b.status; }
  if (b.admin_note !== undefined) o.admin_note = str(b.admin_note, 5000);
  if (b.ttn !== undefined) o.ttn = str(b.ttn, 60);
  if (b.name !== undefined) o.name = str(b.name, 200);
  if (b.phone !== undefined) o.phone = str(b.phone, 30);
  if (b.email !== undefined) o.email = str(b.email, 200);
  if (b.delivery && typeof b.delivery === 'object') o.delivery = { ...o.delivery, ...Object.fromEntries(Object.entries(b.delivery).map(([k, v]) => [k, str(v, 300)])) };
  if (Array.isArray(b.items)) {
    o.items = b.items.slice(0, 200).map((i) => ({ sku: str(i.sku, 40), title: str(i.title, 300), opt: str(i.opt, 300), qty: Math.max(1, int(i.qty, 1)), price: num(i.price) }));
    o.total = o.items.reduce((s, i) => s + i.qty * i.price, 0);
  }
  await db.prepare(`UPDATE orders SET status=?, admin_note=?, ttn=?, name=?, phone=?, email=?, delivery=?, items=?, total=?, updated_at=? WHERE id=?`)
    .bind(o.status, o.admin_note, o.ttn, o.name, o.phone, o.email, JSON.stringify(o.delivery), JSON.stringify(o.items), o.total, now(), id).run();
  // Покупцю: «взято в роботу» / «відправлено, ТТН» — якщо статус чи ТТН щойно змінились.
  let notified = { sent: {}, notes: [] };
  try { notified = await processOrder(env, id, { prev }); } catch (e) { notified.notes.push('Сповіщення не надіслано: ' + String(e && e.message || e)); }
  const fresh = await db.prepare(`SELECT * FROM orders WHERE id = ?`).bind(id).first();
  return json({ ...orderRow(fresh), notified: { sent: notified.sent, notes: notified.notes } });
}

async function resendNotify(env, id, b) {
  const ev = b && b.event;
  if (!['accepted', 'shipped'].includes(ev)) return bad('Невідома подія');
  const r = await processOrder(env, id, { force: [ev] });
  const fresh = await env.DB.prepare(`SELECT * FROM orders WHERE id = ?`).bind(id).first();
  return json({ ...orderRow(fresh), notified: { sent: r.sent, notes: r.notes } });
}

// ---------- сповіщення покупцям ----------
async function getNotify(env, db) {
  const { cfg } = await loadNotify(db);
  return json({ config: cfg, providers: SMS_PROVIDERS, secrets: { email: !!env.RESEND_API_KEY, sms: !!env.SMS_TOKEN } });
}
async function putNotify(env, db, b) {
  let cfg;
  try { cfg = cleanNotify(b); } catch (e) { return bad(e.message); }
  await db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('notify', ?)`).bind(JSON.stringify(cfg)).run();
  return getNotify(env, db);
}

async function ordersCsv(db, url) {
  const [where, a] = orderWhere(url);
  const rows = (await db.prepare(`SELECT * FROM orders ${where} ORDER BY created_at DESC LIMIT 5000`).bind(...a).all()).results.map(orderRow);
  const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const head = ['Номер', 'Дата', 'Статус', 'Клієнт', 'Телефон', 'Email', 'Доставка', 'Місто', 'Відділення/адреса', 'Оплата', 'Сума', 'ТТН', 'Товари', 'Коментар', 'Нотатка'];
  const lines = rows.map((o) => [o.id, o.created_at.slice(0, 16).replace('T', ' '), o.status, o.name, o.phone, o.email, o.delivery.method, o.delivery.city,
    o.delivery.branch || o.delivery.address || o.delivery.pickupAddress, o.payment, o.total, o.ttn,
    o.items.map((i) => `${i.sku} ${i.title}${i.opt ? ' (' + i.opt + ')' : ''} x${i.qty}`).join('; '), o.comment, o.admin_note].map(q).join(';'));
  return new Response('﻿' + [head.map(q).join(';'), ...lines].join('\r\n'), {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="orders-${new Date().toISOString().slice(0, 10)}.csv"`, 'cache-control': 'no-store' },
  });
}

// ---------- налаштування та головна ----------
async function getSettings(db) {
  const rows = (await db.prepare(`SELECT key, value FROM settings`).all()).results;
  const out = {};
  for (const r of rows) if (SETTINGS_KEYS.includes(r.key)) out[r.key] = parse(r.value, r.value);
  return json(out);
}

async function putSettings(db, b) {
  const st = [];
  for (const k of SETTINGS_KEYS) {
    if (b[k] === undefined) continue;
    let v = b[k];
    if (k === 'colors') {
      v = {};
      for (const [n, c] of Object.entries(b.colors || {})) if (str(n) && /^#[0-9a-f]{3,8}$/i.test(c)) v[str(n, 60)] = c;
    } else v = str(v, 1000);
    if (k === 'site_url' && v && !/^https?:\/\//.test(v)) return bad('Адреса сайту має починатися з https://');
    st.push(db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`).bind(k, JSON.stringify(v)));
  }
  if (st.length) await db.batch(st);
  return getSettings(db);
}

// ---------- доставка й оплата в кошику ----------
const CHECKOUT_TEXT = ['free_ship_from', 'pickup_address', 'pickup_hours', 'delivery', 'payment'];
async function getCheckout(db) {
  const rows = (await db.prepare(`SELECT key, value FROM settings`).all()).results;
  const st = {};
  for (const r of rows) st[r.key] = parse(r.value, r.value);
  const cfg = checkoutConfig(st, true);
  return json({ delivery: cfg.delivery, payment: cfg.payment, text: Object.fromEntries(CHECKOUT_TEXT.map((k) => [k, st[k] == null ? '' : st[k]])) });
}

async function putCheckout(db, b) {
  let cfg;
  try { cfg = cleanCheckout(b); } catch (e) { return bad(e.message); }
  const t = b.text || {};
  const free = str(t.free_ship_from, 20).replace(/\s/g, '');
  if (free && !/^\d+$/.test(free)) return bad('Поріг безкоштовної доставки — ціле число гривень');
  const st = [db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('checkout', ?)`).bind(JSON.stringify(cfg))];
  for (const k of CHECKOUT_TEXT) if (t[k] !== undefined)
    st.push(db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`).bind(k, JSON.stringify(k === 'free_ship_from' ? free : str(t[k], 1000))));
  await db.batch(st);
  return getCheckout(db);
}

function cleanHome(b) {
  const h = b.hero || {};
  const t = (v, n = 300) => str(v, n);
  return {
    seo_title: t(b.seo_title), seo_desc: t(b.seo_desc, 500),
    hero: { eyebrow: t(h.eyebrow), title: t(h.title), text: t(h.text, 1000), btn_text: t(h.btn_text), btn_url: t(h.btn_url), btn2_text: t(h.btn2_text), btn2_url: t(h.btn2_url), image: t(h.image), image_alt: t(h.image_alt), image_url: t(h.image_url) },
    promos_title: t(b.promos_title), promos: (Array.isArray(b.promos) ? b.promos : []).slice(0, 12).map((p) => ({ tag: t(p.tag, 60), title: t(p.title), text: t(p.text), url: t(p.url) })),
    show_groups: !!b.show_groups, hits_title: t(b.hits_title), hits: (Array.isArray(b.hits) ? b.hits : []).map((s) => t(s, 120)).filter(Boolean).slice(0, 40),
    show_new: !!b.show_new, new_title: t(b.new_title), seo_heading: t(b.seo_heading), seo_text: str(b.seo_text, 20000),
  };
}

// ---------- групи категорій ----------
async function crudGroups(db, m, id, b) {
  if (m === 'GET') return json((await db.prepare(`SELECT * FROM cat_groups ORDER BY sort, id`).all()).results);
  if (m === 'POST') {
    if (!str(b.name)) return bad('Вкажіть назву');
    const r = await db.prepare(`INSERT INTO cat_groups (name, sort) VALUES (?, ?) RETURNING id`).bind(str(b.name, 120), int(b.sort)).first();
    return json({ id: r.id });
  }
  if (m === 'PUT' && id) { await db.prepare(`UPDATE cat_groups SET name=?, sort=? WHERE id=?`).bind(str(b.name, 120), int(b.sort), +id).run(); return json({ ok: true }); }
  if (m === 'DELETE' && id) {
    await db.batch([db.prepare(`UPDATE categories SET group_id=NULL WHERE group_id=?`).bind(+id), db.prepare(`DELETE FROM cat_groups WHERE id=?`).bind(+id)]);
    return json({ ok: true });
  }
  return json({ error: 'not_found' }, 404);
}

// ---------- категорії та фільтри ----------
async function listCategories(db) {
  const rows = (await db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id=c.id) AS products FROM categories c ORDER BY sort, id`).all()).results;
  return json(rows);
}

async function getCategory(db, id) {
  const [c, f] = await db.batch([
    db.prepare(`SELECT * FROM categories WHERE id=?`).bind(id),
    db.prepare(`SELECT * FROM category_filters WHERE category_id=? ORDER BY sort, id`).bind(id),
  ]);
  if (!c.results[0]) return json({ error: 'not_found' }, 404);
  return json({ ...c.results[0], filters: f.results });
}

const FILTER_KINDS = ['price', 'option', 'attr', 'flag'];

async function saveCategory(db, m, id, b) {
  if (m === 'DELETE') {
    const n = await db.prepare(`SELECT COUNT(*) AS n FROM products WHERE category_id=?`).bind(+id).first();
    if (n.n) return bad(`У категорії ${n.n} товарів. Спершу перенесіть або видаліть їх.`);
    await db.batch([db.prepare(`DELETE FROM category_filters WHERE category_id=?`).bind(+id), db.prepare(`DELETE FROM categories WHERE id=?`).bind(+id)]);
    return json({ ok: true });
  }
  const name = str(b.name, 160);
  if (!name) return bad('Вкажіть назву категорії');
  const slug = str(b.slug, 80) || slugify(name);
  if (!SLUG.test(slug)) return bad('Адреса (slug) може містити лише латинські літери, цифри та дефіс');
  const dup = await db.prepare(`SELECT id FROM categories WHERE slug=? AND id != ?`).bind(slug, int(id, 0)).first();
  if (dup) return bad('Категорія з такою адресою вже існує');
  const vals = [slug, name, b.group_id ? int(b.group_id) : null, str(b.blurb, 1000), str(b.description, 50000), str(b.image), str(b.seo_title, 300), str(b.seo_desc, 500), int(b.sort), flag(b.active)];
  let cid = int(id, 0);
  const st = [];
  if (m === 'POST') {
    const r = await db.prepare(`INSERT INTO categories (slug, name, group_id, blurb, description, image, seo_title, seo_desc, sort, active) VALUES (?,?,?,?,?,?,?,?,?,?) RETURNING id`).bind(...vals).first();
    cid = r.id;
    if (!Array.isArray(b.filters)) b.filters = [{ kind: 'price', key: '', label: 'Ціна' }];
  } else {
    const old = await db.prepare(`SELECT slug FROM categories WHERE id=?`).bind(cid).first();
    if (!old) return json({ error: 'not_found' }, 404);
    st.push(db.prepare(`UPDATE categories SET slug=?, name=?, group_id=?, blurb=?, description=?, image=?, seo_title=?, seo_desc=?, sort=?, active=? WHERE id=?`).bind(...vals, cid));
    if (old.slug !== slug) st.push(...redirect(db, `/kategoriya/${old.slug}.html`, `/kategoriya/${slug}.html`));
  }
  if (Array.isArray(b.filters)) {
    st.push(db.prepare(`DELETE FROM category_filters WHERE category_id=?`).bind(cid));
    b.filters.filter((f) => FILTER_KINDS.includes(f.kind)).slice(0, 30).forEach((f, i) =>
      st.push(db.prepare(`INSERT INTO category_filters (category_id, kind, key, label, sort) VALUES (?,?,?,?,?)`).bind(cid, f.kind, str(f.key, 120), str(f.label, 120), i)));
  }
  if (st.length) await db.batch(st);
  return getCategory(db, cid);
}

function redirect(db, from, to) {
  return [
    db.prepare(`DELETE FROM redirects WHERE path=?`).bind(to),
    db.prepare(`UPDATE redirects SET target=? WHERE target=?`).bind(to, from),
    db.prepare(`INSERT OR REPLACE INTO redirects (path, target) VALUES (?, ?)`).bind(from, to),
  ];
}

// ---------- характеристики ----------
async function listAttributes(db) {
  const rows = (await db.prepare(`SELECT a.*, (SELECT COUNT(*) FROM product_attrs pa WHERE pa.attribute_id=a.id AND pa.value != '') AS used FROM attributes a ORDER BY sort, id`).all()).results;
  return json(rows.map((a) => ({ ...a, options: parse(a.options, []) })));
}

async function saveAttribute(db, m, id, b) {
  if (m === 'DELETE') {
    await db.batch([
      db.prepare(`DELETE FROM product_attrs WHERE attribute_id=?`).bind(+id),
      db.prepare(`DELETE FROM category_filters WHERE kind='attr' AND key=?`).bind(String(+id)),
      db.prepare(`DELETE FROM attributes WHERE id=?`).bind(+id),
    ]);
    return json({ ok: true });
  }
  const name = str(b.name, 120);
  if (!name) return bad('Вкажіть назву характеристики');
  const type = ['text', 'number', 'select'].includes(b.type) ? b.type : 'text';
  const options = JSON.stringify((Array.isArray(b.options) ? b.options : []).map((o) => str(o, 120)).filter(Boolean).slice(0, 300));
  if (m === 'POST') {
    const r = await db.prepare(`INSERT INTO attributes (name, unit, type, options, sort) VALUES (?,?,?,?,?) RETURNING id`).bind(name, str(b.unit, 30), type, options, int(b.sort)).first();
    return json({ id: r.id });
  }
  await db.prepare(`UPDATE attributes SET name=?, unit=?, type=?, options=?, sort=? WHERE id=?`).bind(name, str(b.unit, 30), type, options, int(b.sort), +id).run();
  return json({ ok: true });
}

/** Назви опцій варіантів (Колір, Дизайн…) з усіма значеннями — для налаштування фільтрів і кольорів. */
async function listOptions(db) {
  const rows = (await db.prepare(`SELECT options FROM variants`).all()).results;
  const map = {};
  for (const r of rows) for (const [k, v] of Object.entries(parse(r.options, {}))) {
    map[k] = map[k] || new Set();
    if (map[k].size < 500) map[k].add(v);
  }
  return json(Object.fromEntries(Object.entries(map).map(([k, s]) => [k, [...s].sort((a, b) => a.localeCompare(b, 'uk'))])));
}

// ---------- товари ----------
async function listProducts(db, url) {
  const w = [], a = [];
  const cat = url.searchParams.get('category');
  if (cat) { w.push('p.category_id = ?'); a.push(+cat); }
  const q = str(url.searchParams.get('q'), 100);
  if (q) { w.push(`(p.title LIKE ? OR p.slug LIKE ? OR EXISTS (SELECT 1 FROM variants v WHERE v.product_id=p.id AND v.sku LIKE ?))`); a.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const st = url.searchParams.get('state');
  if (st === 'hidden') w.push('p.active = 0');
  if (st === 'nophoto') w.push(`p.image='' AND NOT EXISTS (SELECT 1 FROM variants v WHERE v.product_id=p.id AND v.image!='')`);
  const rows = (await db.prepare(`SELECT p.id, p.slug, p.title, p.category_id, p.active, p.is_new, p.is_hit, p.sort, p.image,
      (SELECT COUNT(*) FROM variants v WHERE v.product_id=p.id) AS variants,
      (SELECT MIN(price) FROM variants v WHERE v.product_id=p.id) AS min,
      (SELECT MAX(price) FROM variants v WHERE v.product_id=p.id) AS max,
      (SELECT image FROM variants v WHERE v.product_id=p.id AND v.image!='' ORDER BY sort LIMIT 1) AS vimage
    FROM products p ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY p.category_id, p.sort, p.id LIMIT 2000`).bind(...a).all()).results;
  return json(rows.map((r) => ({ ...r, cover: r.image || r.vimage || '' })));
}

async function getProduct(db, id) {
  const [p, v, at] = await db.batch([
    db.prepare(`SELECT * FROM products WHERE id=?`).bind(id),
    db.prepare(`SELECT * FROM variants WHERE product_id=? ORDER BY sort, id`).bind(id),
    db.prepare(`SELECT attribute_id, value FROM product_attrs WHERE product_id=?`).bind(id),
  ]);
  if (!p.results[0]) return json({ error: 'not_found' }, 404);
  return json({
    ...p.results[0], features: parse(p.results[0].features, []),
    variants: v.results.map((x) => ({ ...x, options: parse(x.options, {}) })),
    attrs: Object.fromEntries(at.results.map((r) => [r.attribute_id, r.value])),
  });
}

async function saveProduct(db, m, id, b) {
  let pid = int(id, 0);
  if (m === 'DELETE') {
    await db.batch([
      db.prepare(`DELETE FROM variants WHERE product_id=?`).bind(pid),
      db.prepare(`DELETE FROM product_attrs WHERE product_id=?`).bind(pid),
      db.prepare(`DELETE FROM products WHERE id=?`).bind(pid),
    ]);
    return json({ ok: true });
  }
  const title = str(b.title, 300);
  if (!title) return bad('Вкажіть назву товару');
  const slug = str(b.slug, 80) || slugify(title);
  if (!SLUG.test(slug)) return bad('Адреса (slug) може містити лише латинські літери, цифри та дефіс');
  if (!b.category_id) return bad('Оберіть категорію');
  const dup = await db.prepare(`SELECT id FROM products WHERE slug=? AND id != ?`).bind(slug, pid).first();
  if (dup) return bad('Товар з такою адресою вже існує');
  const variants = (Array.isArray(b.variants) ? b.variants : []).slice(0, 1000).map((v, i) => {
    const options = {};
    for (const [k, val] of Object.entries(v.options || {})) if (str(k) && str(val)) options[str(k, 60)] = str(val, 160);
    return { sku: str(v.sku, 40), price: num(v.price), old_price: num(v.old_price), options, image: str(v.image), size: str(v.size, 120), in_stock: flag(v.in_stock), sort: i };
  });
  if (!variants.length) return bad('Додайте хоча б один варіант (артикул і ціну)');
  if (variants.some((v) => !v.sku)) return bad('У кожного варіанту має бути артикул');
  const skus = new Set();
  for (const v of variants) { if (skus.has(v.sku)) return bad(`Артикул ${v.sku} повторюється`); skus.add(v.sku); }
  const features = (Array.isArray(b.features) ? b.features : String(b.features || '').split('\n')).map((s) => str(s, 300)).filter(Boolean).slice(0, 40);
  const vals = [slug, title, int(b.category_id), str(b.description, 50000), JSON.stringify(features), str(b.gift, 300), str(b.price_note, 300), str(b.image),
    flag(b.is_new), flag(b.is_hit), flag(b.active), int(b.sort), str(b.seo_title, 300), str(b.seo_desc, 500), now()];
  const st = [];
  if (m === 'POST') {
    const r = await db.prepare(`INSERT INTO products (slug, title, category_id, description, features, gift, price_note, image, is_new, is_hit, active, sort, seo_title, seo_desc, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`).bind(...vals).first();
    pid = r.id;
  } else {
    const old = await db.prepare(`SELECT slug FROM products WHERE id=?`).bind(pid).first();
    if (!old) return json({ error: 'not_found' }, 404);
    st.push(db.prepare(`UPDATE products SET slug=?, title=?, category_id=?, description=?, features=?, gift=?, price_note=?, image=?, is_new=?, is_hit=?, active=?, sort=?, seo_title=?, seo_desc=?, updated_at=? WHERE id=?`).bind(...vals, pid));
    if (old.slug !== slug) st.push(...redirect(db, `/tovar/${old.slug}.html`, `/tovar/${slug}.html`));
  }
  st.push(db.prepare(`DELETE FROM variants WHERE product_id=?`).bind(pid));
  for (const v of variants)
    st.push(db.prepare(`INSERT INTO variants (product_id, sku, price, old_price, options, image, size, in_stock, sort) VALUES (?,?,?,?,?,?,?,?,?)`)
      .bind(pid, v.sku, v.price, v.old_price, JSON.stringify(v.options), v.image, v.size, v.in_stock, v.sort));
  st.push(db.prepare(`DELETE FROM product_attrs WHERE product_id=?`).bind(pid));
  for (const [aid, val] of Object.entries(b.attrs || {}))
    if (str(val) && int(aid)) st.push(db.prepare(`INSERT INTO product_attrs (product_id, attribute_id, value) VALUES (?,?,?)`).bind(pid, int(aid), str(val, 1000)));
  await db.batch(st);
  return getProduct(db, pid);
}

async function bulkProducts(db, b) {
  const ids = (Array.isArray(b.ids) ? b.ids : []).map((x) => int(x)).filter(Boolean).slice(0, 2000);
  if (!ids.length) return bad('Не обрано жодного товару');
  // D1 приймає не більше 100 параметрів на запит, тому ділимо на пачки.
  const st = [];
  for (let i = 0; i < ids.length; i += 90) {
    const part = ids.slice(i, i + 90);
    const ph = part.map(() => '?').join(',');
    if (b.action === 'show' || b.action === 'hide') st.push(db.prepare(`UPDATE products SET active=? WHERE id IN (${ph})`).bind(b.action === 'show' ? 1 : 0, ...part));
    else if (b.action === 'move' && int(b.category_id)) st.push(db.prepare(`UPDATE products SET category_id=? WHERE id IN (${ph})`).bind(int(b.category_id), ...part));
    else if (b.action === 'price' && Number.isFinite(+b.percent) && +b.percent !== 0 && Math.abs(+b.percent) <= 90)
      st.push(db.prepare(`UPDATE variants SET price = ROUND(price * ?) WHERE product_id IN (${ph})`).bind(1 + +b.percent / 100, ...part));
    else if (b.action === 'delete')
      st.push(db.prepare(`DELETE FROM variants WHERE product_id IN (${ph})`).bind(...part), db.prepare(`DELETE FROM product_attrs WHERE product_id IN (${ph})`).bind(...part),
        db.prepare(`DELETE FROM products WHERE id IN (${ph})`).bind(...part));
    else return bad('Невідома дія');
  }
  await db.batch(st);
  return json({ ok: true, count: ids.length });
}

// ---------- сторінки ----------
async function getPage(db, id) {
  const r = await db.prepare(`SELECT * FROM pages WHERE id=?`).bind(id).first();
  return r ? json(r) : json({ error: 'not_found' }, 404);
}

async function savePage(db, m, id, b) {
  if (m === 'DELETE') { await db.prepare(`DELETE FROM pages WHERE id=?`).bind(+id).run(); return json({ ok: true }); }
  const title = str(b.title, 200);
  if (!title) return bad('Вкажіть заголовок сторінки');
  const slug = str(b.slug, 80) || slugify(title);
  if (!SLUG.test(slug)) return bad('Адреса (slug) може містити лише латинські літери, цифри та дефіс');
  if (RESERVED.has(slug)) return bad('Ця адреса зайнята системною сторінкою');
  const dup = await db.prepare(`SELECT id FROM pages WHERE slug=? AND id != ?`).bind(slug, int(id, 0)).first();
  if (dup) return bad('Сторінка з такою адресою вже існує');
  const vals = [slug, title, str(b.content, 100000), str(b.seo_title, 300), str(b.seo_desc, 500), flag(b.in_menu), flag(b.in_footer), int(b.sort), flag(b.active)];
  if (m === 'POST') {
    const r = await db.prepare(`INSERT INTO pages (slug, title, content, seo_title, seo_desc, in_menu, in_footer, sort, active) VALUES (?,?,?,?,?,?,?,?,?) RETURNING id`).bind(...vals).first();
    return getPage(db, r.id);
  }
  const old = await db.prepare(`SELECT slug FROM pages WHERE id=?`).bind(+id).first();
  if (!old) return json({ error: 'not_found' }, 404);
  const st = [db.prepare(`UPDATE pages SET slug=?, title=?, content=?, seo_title=?, seo_desc=?, in_menu=?, in_footer=?, sort=?, active=? WHERE id=?`).bind(...vals, +id)];
  if (old.slug !== slug) st.push(...redirect(db, `/${old.slug}.html`, `/${slug}.html`));
  await db.batch(st);
  return getPage(db, +id);
}

// ---------- зображення (зберігаються прямо в D1, до 1,5 МБ кожне) ----------
const MIME = ['image/webp', 'image/jpeg', 'image/png', 'image/gif', 'image/svg+xml', 'image/avif'];
async function uploadMedia(db, request) {
  const mime = (request.headers.get('content-type') || '').split(';')[0].trim();
  if (!MIME.includes(mime)) return bad('Підтримуються зображення WebP, JPEG, PNG, GIF, AVIF, SVG');
  const buf = await request.arrayBuffer();
  if (!buf.byteLength) return bad('Порожній файл');
  if (buf.byteLength > 1.5 * 1024 * 1024) return bad('Файл завеликий (максимум 1,5 МБ після стиснення)');
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 20);
  const name = str(decodeURIComponent(request.headers.get('x-file-name') || ''), 200);
  await db.prepare(`INSERT INTO media (id, mime, name, size, data, created_at) VALUES (?,?,?,?,?,?)`).bind(id, mime, name, buf.byteLength, buf, now()).run();
  return json({ id, url: `/media/${id}` });
}

// ---------- резервна копія ----------
async function exportAll(db) {
  const tables = ['settings', 'cat_groups', 'categories', 'products', 'variants', 'attributes', 'product_attrs', 'category_filters', 'pages', 'orders', 'redirects', 'reviews', 'customers', 'wishlist'];
  // Хеші паролів клієнтів у копію не потрапляють.
  const sel = (t) => (t === 'customers' ? `SELECT id, phone, email, first_name, last_name, middle_name, delivery, admin_note, created_at, updated_at, last_login FROM customers` : `SELECT * FROM ${t}`);
  const res = await db.batch(tables.map((t) => db.prepare(sel(t))));
  const out = { exported_at: now() };
  tables.forEach((t, i) => { out[t] = res[i].results; });
  return new Response(JSON.stringify(out), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="dimiremont-backup-${now().slice(0, 10)}.json"`, 'cache-control': 'no-store' },
  });
}

// ---------- перевірка Telegram: шле тестове повідомлення й повертає точну відповідь Telegram ----------
async function telegramTest(env) {
  if (!env.TELEGRAM_BOT_TOKEN) return json({ ok: false, results: [{ chat: '', error: 'Не задано TELEGRAM_BOT_TOKEN' }] });
  const chats = String(env.TELEGRAM_CHAT_ID || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!chats.length) return json({ ok: false, results: [{ chat: '', error: 'Не задано TELEGRAM_CHAT_ID' }] });
  const token = String(env.TELEGRAM_BOT_TOKEN).trim();
  const results = [];
  let bot = '';
  try {
    const me = await (await fetch(`https://api.telegram.org/bot${token}/getMe`)).json();
    if (!me.ok) return json({ ok: false, results: [{ chat: '', error: 'Токен бота не приймається Telegram: ' + (me.description || 'невідома помилка') }] });
    bot = '@' + me.result.username;
  } catch (e) { return json({ ok: false, results: [{ chat: '', error: 'Немає зв’язку з Telegram: ' + String(e && e.message || e) }] }); }
  for (const chat_id of chats) {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id, text: '✅ Тестове повідомлення з бек-офісу магазину. Сповіщення про замовлення приходитимуть сюди.' }),
    });
    const d = await r.json().catch(() => ({}));
    results.push({ chat: chat_id, ok: !!d.ok, error: d.ok ? '' : (d.description || 'HTTP ' + r.status) });
  }
  return json({ ok: results.every((x) => x.ok), bot, results });
}

// ---------- клієнти (особисті кабінети) ----------
async function listCustomers(db, url) {
  const q = str(url.searchParams.get('q'), 100);
  const w = [], a = [];
  if (q) {
    const digits = q.replace(/\D/g, '');
    w.push(`(c.first_name LIKE ? OR c.last_name LIKE ? OR c.email LIKE ?${digits.length >= 3 ? ' OR c.phone LIKE ?' : ''})`);
    a.push(`%${q}%`, `%${q}%`, `%${q}%`);
    if (digits.length >= 3) a.push(`%${digits}%`);
  }
  const rows = (await db.prepare(`SELECT c.id, c.first_name, c.last_name, c.phone, c.email, c.created_at, c.last_login,
      (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) AS orders, (SELECT COALESCE(SUM(total),0) FROM orders o WHERE o.customer_id = c.id AND o.status != 'cancelled') AS spent,
      (SELECT COUNT(*) FROM wishlist x WHERE x.customer_id = c.id) AS saved
    FROM customers c ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY c.created_at DESC LIMIT 500`).bind(...a).all()).results;
  const total = await db.prepare(`SELECT COUNT(*) AS n FROM customers`).first();
  return json({ items: rows, total: total ? total.n : 0 });
}

async function getCustomer(db, id) {
  const c = await db.prepare(`SELECT * FROM customers WHERE id = ?`).bind(id).first();
  if (!c) return json({ error: 'not_found' }, 404);
  const [orders, maybe, wish] = await db.batch([
    db.prepare(`SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC LIMIT 300`).bind(id),
    // замовлення без кабінету з тим самим телефоном або email — можна прив'язати вручну
    db.prepare(`SELECT * FROM orders WHERE customer_id IS NULL AND ((phone = ? AND ? != '') OR (LOWER(email) = ? AND ? != '')) ORDER BY created_at DESC LIMIT 100`)
      .bind(c.phone || '', c.phone || '', c.email || '', c.email || ''),
    db.prepare(`SELECT p.slug, p.title, w.created_at FROM wishlist w JOIN products p ON p.id = w.product_id WHERE w.customer_id = ? ORDER BY w.created_at DESC`).bind(id),
  ]);
  return json({
    customer: { ...publicCustomer(c), admin_note: c.admin_note || '', last_login: c.last_login, updated_at: c.updated_at },
    orders: orders.results.map(customerOrder), unlinked: maybe.results.map(customerOrder), wishlist: wish.results,
  });
}

async function updateCustomer(db, id, b) {
  const c = await db.prepare(`SELECT * FROM customers WHERE id = ?`).bind(id).first();
  if (!c) return json({ error: 'not_found' }, 404);
  const phone = b.phone !== undefined ? (b.phone ? normPhone(b.phone) : '') : c.phone || '';
  const email = b.email !== undefined ? (b.email ? normEmail(b.email) : '') : c.email || '';
  if (b.phone && !phone) return bad('Невірний телефон: потрібно +380 і 9 цифр');
  if (b.email && !email) return bad('Невірний email');
  if (!phone && !email) return bad('Потрібен телефон або email для входу');
  const dupe = await db.prepare(`SELECT id FROM customers WHERE id != ? AND ((phone = ? AND ? != '') OR (email = ? AND ? != ''))`).bind(id, phone, phone, email, email).first();
  if (dupe) return bad('Цей телефон або email уже має інший клієнт');
  let hash = c.pass_hash;
  if (b.password) {
    if (String(b.password).length < 6) return bad('Пароль має бути щонайменше 6 символів');
    hash = await hashPassword(String(b.password));
  }
  await db.prepare(`UPDATE customers SET first_name=?, last_name=?, middle_name=?, phone=?, email=?, admin_note=?, pass_hash=?, updated_at=? WHERE id=?`)
    .bind(b.first_name !== undefined ? str(b.first_name, 60) : c.first_name, b.last_name !== undefined ? str(b.last_name, 60) : c.last_name,
      b.middle_name !== undefined ? str(b.middle_name, 60) : c.middle_name, phone || null, email || null,
      b.admin_note !== undefined ? str(b.admin_note, 5000) : c.admin_note, hash, now(), id).run();
  return getCustomer(db, id);
}

async function linkCustomerOrder(db, id, b) {
  const oid = str(b.order, 40);
  if (b.unlink) await db.prepare(`UPDATE orders SET customer_id = NULL WHERE id = ? AND customer_id = ?`).bind(oid, id).run();
  else await db.prepare(`UPDATE orders SET customer_id = ? WHERE id = ?`).bind(id, oid).run();
  return getCustomer(db, id);
}
