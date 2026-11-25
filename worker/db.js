/**
 * База D1: схема, первинне наповнення з data/seed.json і завантаження даних для сторінок.
 * Схема створюється сама при першому запиті (CREATE TABLE IF NOT EXISTS), тож окремих міграцій запускати не треба.
 */
import seed from '../data/seed.json';
import photosRemont from '../data/photos_remont.json';

export const SCHEMA_VERSION = '1';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`,
  `CREATE TABLE IF NOT EXISTS cat_groups (id INTEGER PRIMARY KEY, name TEXT NOT NULL, sort INTEGER DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL, group_id INTEGER,
     blurb TEXT DEFAULT '', description TEXT DEFAULT '', image TEXT DEFAULT '', seo_title TEXT DEFAULT '', seo_desc TEXT DEFAULT '',
     sort INTEGER DEFAULT 0, active INTEGER DEFAULT 1)`,
  `CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY, slug TEXT UNIQUE NOT NULL, title TEXT NOT NULL, category_id INTEGER,
     description TEXT DEFAULT '', features TEXT DEFAULT '[]', gift TEXT DEFAULT '', price_note TEXT DEFAULT '', image TEXT DEFAULT '',
     is_new INTEGER DEFAULT 0, is_hit INTEGER DEFAULT 0, active INTEGER DEFAULT 1, sort INTEGER DEFAULT 0,
     seo_title TEXT DEFAULT '', seo_desc TEXT DEFAULT '', updated_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS products_cat ON products(category_id)`,
  `CREATE TABLE IF NOT EXISTS variants (id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL, sku TEXT NOT NULL, price REAL DEFAULT 0,
     old_price REAL DEFAULT 0, options TEXT DEFAULT '{}', image TEXT DEFAULT '', size TEXT DEFAULT '', in_stock INTEGER DEFAULT 1, sort INTEGER DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS variants_prod ON variants(product_id)`,
  `CREATE INDEX IF NOT EXISTS variants_sku ON variants(sku)`,
  `CREATE TABLE IF NOT EXISTS attributes (id INTEGER PRIMARY KEY, name TEXT NOT NULL, unit TEXT DEFAULT '', type TEXT DEFAULT 'text',
     options TEXT DEFAULT '[]', sort INTEGER DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS product_attrs (product_id INTEGER NOT NULL, attribute_id INTEGER NOT NULL, value TEXT,
     PRIMARY KEY (product_id, attribute_id))`,
  `CREATE TABLE IF NOT EXISTS category_filters (id INTEGER PRIMARY KEY, category_id INTEGER NOT NULL, kind TEXT NOT NULL,
     key TEXT DEFAULT '', label TEXT DEFAULT '', sort INTEGER DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS pages (id INTEGER PRIMARY KEY, slug TEXT UNIQUE NOT NULL, title TEXT NOT NULL, content TEXT DEFAULT '',
     seo_title TEXT DEFAULT '', seo_desc TEXT DEFAULT '', in_menu INTEGER DEFAULT 0, in_footer INTEGER DEFAULT 1, sort INTEGER DEFAULT 0,
     active INTEGER DEFAULT 1)`,
  `CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, status TEXT DEFAULT 'new', name TEXT, phone TEXT,
     email TEXT, delivery TEXT, payment TEXT, comment TEXT, call_me INTEGER DEFAULT 1, items TEXT, total REAL DEFAULT 0,
     admin_note TEXT DEFAULT '', ttn TEXT DEFAULT '', telegram_ok INTEGER DEFAULT 0, updated_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS orders_created ON orders(created_at)`,
  `CREATE TABLE IF NOT EXISTS media (id TEXT PRIMARY KEY, mime TEXT, name TEXT, size INTEGER, data BLOB, created_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS redirects (path TEXT PRIMARY KEY, target TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS login_attempts (ip TEXT, ts INTEGER)`,
];

let ready = null;

/** Створює таблиці й заливає початкові дані, якщо база порожня. Викликається один раз на ізолят. */
export function ensureDb(env) {
  if (!ready) ready = init(env).catch((e) => { ready = null; throw e; });
  return ready;
}

async function init(env) {
  const db = env.DB;
  try {
    const r = await db.prepare(`SELECT value FROM settings WHERE key='schema_version'`).first();
    if (r && r.value === SCHEMA_VERSION) { await applyPatches(db); return; }
  } catch { /* таблиці ще немає */ }
  await db.batch(SCHEMA.map((s) => db.prepare(s)));
  const seeded = await db.prepare(`SELECT value FROM settings WHERE key='seeded'`).first();
  if (!seeded) await fillSeed(db);
  await db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('schema_version', ?)`).bind(SCHEMA_VERSION).run();
  await applyPatches(db);
}

/**
 * Разові оновлення даних у вже заповненій базі. Кожне виконується один раз (позначка в settings).
 * photos_remont_v1: фото з PDF-каталогу «Товари для швидкого ремонту» (site/img/SW-*.webp).
 * Фото ставиться лише варіантам без фото, тож завантажене в адмінці не перезаписується.
 */
async function applyPatches(db) {
  const key = 'patch_photos_remont_v1';
  const done = await db.prepare(`SELECT value FROM settings WHERE key=?`).bind(key).first();
  if (done) return;
  const st = photosRemont.map((sku) =>
    db.prepare(`UPDATE variants SET image=? WHERE sku=? AND (image IS NULL OR image='')`).bind(`/img/${sku}.webp`, sku));
  for (let i = 0; i < st.length; i += 100) await db.batch(st.slice(i, i + 100));
  await db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`).bind(key, JSON.stringify(new Date().toISOString())).run();
}

async function fillSeed(db) {
  const st = [];
  const S = (sql, ...a) => st.push(db.prepare(sql).bind(...a));
  for (const [k, v] of Object.entries(seed.settings)) S(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`, k, JSON.stringify(v));
  S(`INSERT OR IGNORE INTO settings (key, value) VALUES ('home', ?)`, JSON.stringify(seed.home));
  for (const g of seed.groups) S(`INSERT OR IGNORE INTO cat_groups (id, name, sort) VALUES (?, ?, ?)`, g.id, g.name, g.sort);
  for (const c of seed.categories)
    S(`INSERT OR IGNORE INTO categories (id, slug, name, group_id, blurb, sort) VALUES (?, ?, ?, ?, ?, ?)`, c.id, c.slug, c.name, c.group_id, c.blurb, c.sort);
  for (const a of seed.attributes)
    S(`INSERT OR IGNORE INTO attributes (id, name, unit, type, sort) VALUES (?, ?, ?, ?, ?)`, a.id, a.name, a.unit, a.type, a.sort);
  // Явні id + OR IGNORE: якщо два перші запити прийдуть одночасно, дублікатів не буде.
  seed.filters.forEach((f, i) =>
    S(`INSERT OR IGNORE INTO category_filters (id, category_id, kind, key, label, sort) VALUES (?, ?, ?, ?, ?, ?)`, i + 1, f.category_id, f.kind, f.key, f.label, f.sort));
  for (const p of seed.pages)
    S(`INSERT OR IGNORE INTO pages (id, slug, title, content, seo_desc, in_menu, in_footer, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      p.id, p.slug, p.title, p.content, p.seo_desc, p.in_menu, p.in_footer, p.sort);
  const now = new Date().toISOString();
  let vid = 0;
  for (const p of seed.products) {
    S(`INSERT OR IGNORE INTO products (id, slug, title, category_id, features, gift, price_note, is_new, sort, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      p.id, p.slug, p.title, p.category_id, JSON.stringify(p.features), p.gift, p.price_note, p.is_new, p.sort, now);
    for (const [aid, val] of Object.entries(p.attrs)) S(`INSERT OR IGNORE INTO product_attrs (product_id, attribute_id, value) VALUES (?, ?, ?)`, p.id, +aid, val);
    p.variants.forEach((v, i) =>
      S(`INSERT OR IGNORE INTO variants (id, product_id, sku, price, options, image, size, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ++vid, p.id, v.sku, v.price, JSON.stringify(v.options), v.image, v.size, i));
  }
  // Пачками: одна транзакція на пачку, позначка seeded — в останній.
  for (let i = 0; i < st.length; i += 400) await db.batch(st.slice(i, i + 400));
  await db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('seeded', ?)`).bind(JSON.stringify(now)).run();
  await bumpVersion(db);
}

// ---------- версія даних: змінюється при кожному збереженні в адмінці ----------
let memo = null; // { v, at, data }

export async function bumpVersion(db) {
  const v = String(Date.now());
  await db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('version', ?)`).bind(JSON.stringify(v)).run();
  memo = null;
  return v;
}

const parse = (s, d) => { try { return s == null ? d : JSON.parse(s); } catch { return d; } };

/** Усі дані вітрини. Кешуються в пам'яті ізоляту, поки не зміниться версія (перевірка не частіше ніж раз на 5 с). */
export async function loadStore(env) {
  const db = env.DB;
  const now = Date.now();
  if (memo && now - memo.at < 5000) return memo.data;
  const vr = await db.prepare(`SELECT value FROM settings WHERE key='version'`).first();
  const v = vr ? vr.value : '0';
  if (memo && memo.v === v) { memo.at = now; return memo.data; }
  const [s, g, c, p, va, at, pa, f, pg, rd] = await db.batch([
    db.prepare(`SELECT key, value FROM settings`),
    db.prepare(`SELECT * FROM cat_groups ORDER BY sort, id`),
    db.prepare(`SELECT * FROM categories ORDER BY sort, id`),
    db.prepare(`SELECT * FROM products ORDER BY sort, id`),
    db.prepare(`SELECT * FROM variants ORDER BY product_id, sort, id`),
    db.prepare(`SELECT * FROM attributes ORDER BY sort, id`),
    db.prepare(`SELECT * FROM product_attrs`),
    db.prepare(`SELECT * FROM category_filters ORDER BY category_id, sort, id`),
    db.prepare(`SELECT * FROM pages ORDER BY sort, id`),
    db.prepare(`SELECT * FROM redirects`),
  ]);
  const settings = {};
  for (const r of s.results) settings[r.key] = parse(r.value, r.value);
  const data = buildStore(settings, g.results, c.results, p.results, va.results, at.results, pa.results, f.results, pg.results, rd.results);
  memo = { v, at: now, data };
  return data;
}

function buildStore(settings, groups, cats, prods, vars, attrs, pattrs, filters, pages, redirects) {
  const catById = new Map(cats.map((c) => [c.id, c]));
  const attrById = new Map(attrs.map((a) => ({ ...a, options: parse(a.options, []) })).map((a) => [a.id, a]));
  const vByP = new Map();
  for (const v of vars) {
    const x = { ...v, options: parse(v.options, {}) };
    if (!vByP.has(v.product_id)) vByP.set(v.product_id, []);
    vByP.get(v.product_id).push(x);
  }
  const aByP = new Map();
  for (const r of pattrs) {
    if (!aByP.has(r.product_id)) aByP.set(r.product_id, {});
    aByP.get(r.product_id)[r.attribute_id] = r.value;
  }
  const products = [];
  for (const p of prods) {
    const cat = catById.get(p.category_id);
    const variants = vByP.get(p.id) || [];
    const x = { ...p, features: parse(p.features, []), variants, attrs: aByP.get(p.id) || {}, cat };
    x.visible = !!(p.active && cat && cat.active && variants.length);
    const prices = variants.map((v) => +v.price || 0);
    x.min = prices.length ? Math.min(...prices) : 0;
    x.max = prices.length ? Math.max(...prices) : 0;
    x.cover = p.image || (variants.find((v) => v.image) || {}).image || '';
    x.oldMin = Math.max(0, ...variants.filter((v) => +v.price === x.min).map((v) => +v.old_price || 0));
    products.push(x);
  }
  const visible = products.filter((p) => p.visible);
  const filtersByCat = new Map();
  for (const f of filters) {
    if (!filtersByCat.has(f.category_id)) filtersByCat.set(f.category_id, []);
    filtersByCat.get(f.category_id).push(f);
  }
  return {
    settings, home: settings.home || {}, groups, cats, catById, catBySlug: new Map(cats.map((c) => [c.slug, c])),
    attrs: [...attrById.values()], attrById, products, visible, bySlug: new Map(products.map((p) => [p.slug, p])),
    filtersByCat, pages, pageBySlug: new Map(pages.map((p) => [p.slug, p])), redirects: new Map(redirects.map((r) => [r.path, r.target])),
  };
}
