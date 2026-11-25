/**
 * Cloudflare Worker магазину «Дім і Ремонт».
 *
 * Вітрина (головна, каталог, категорії, товари, сторінки) збирається з бази D1 (binding DB) на льоту,
 * тож усе, що змінено в адмінці /admin/, одразу видно на сайті. Якщо базу ще не підключено,
 * Worker віддає старі статичні сторінки з папки site/.
 * Статика (/assets/*, /img/*, /admin/*) віддається напряму з site/ без запуску Worker.
 *
 * Секрети (Cloudflare → Worker → Settings → Variables and Secrets):
 *   ADMIN_PASSWORD      — пароль входу в адмінку /admin/ (обов'язково для бек-офісу)
 *   SESSION_SECRET      — необов'язково: додатковий ключ для підпису входу
 *   TELEGRAM_BOT_TOKEN  — токен бота від @BotFather (сповіщення про замовлення)
 *   TELEGRAM_CHAT_ID    — куди слати замовлення: ваш chat id або id групи (можна кілька через кому)
 *   NP_API_KEY          — ключ API Нової пошти (особистий кабінет → Налаштування → Безпека)
 *   UP_TOKEN            — bearer-токен Укрпошти (eCom/PROD_BEARER) для довідника відділень
 */
import { ensureDb, loadStore } from './db.js';
import { adminApi } from './admin-api.js';
import * as R from './render.js';
import cartTpl from './cart.html';

const NP_URL = 'https://api.novaposhta.ua/v2.0/json/';
const UP_URL = 'https://www.ukrposhta.ua/address-classifier-ws';

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...extra },
  });

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (env.DB) await ensureDb(env);
      if (url.pathname.startsWith('/api/admin/')) {
        if (!env.DB) return json({ error: 'no_database', message: 'Базу D1 не підключено (binding DB)' }, 503);
        return await adminApi(request, env, url);
      }
      if (url.pathname.startsWith('/api/')) return await api(request, env, ctx, url);
      if (url.pathname.startsWith('/media/') && env.DB) return await media(env, url);
      if (env.DB && (request.method === 'GET' || request.method === 'HEAD')) return await storefront(request, env, url);
      return env.ASSETS.fetch(request);
    } catch (e) {
      console.log('server_error', e && e.stack || e);
      if (url.pathname.startsWith('/api/')) return json({ error: 'server_error', message: String(e && e.message || e) }, 500);
      return env.ASSETS.fetch(request); // аварійно — стара статична версія сторінки
    }
  },
};

async function api(request, env, ctx, url) {
  if (url.pathname === '/api/order' && request.method === 'POST') return await order(request, env);
  if (url.pathname === '/api/np/cities') return await cached(request, ctx, () => npCities(url, env));
  if (url.pathname === '/api/np/warehouses') return await cached(request, ctx, () => npWarehouses(url, env));
  if (url.pathname === '/api/up/cities') return await cached(request, ctx, () => upCities(url, env));
  if (url.pathname === '/api/up/offices') return await cached(request, ctx, () => upOffices(url, env));
  if (url.pathname === '/api/health') return json({ ok: true, db: !!env.DB, admin: !!env.ADMIN_PASSWORD, telegram: !!env.TELEGRAM_BOT_TOKEN, np: !!env.NP_API_KEY, up: !!env.UP_TOKEN });
  return json({ error: 'not_found' }, 404);
}

// ---------------- Вітрина з бази ----------------
const HTML = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=0, must-revalidate' };

async function storefront(request, env, url) {
  const S = await loadStore(env);
  let p = decodeURIComponent(url.pathname);
  const page = (html, status = 200) => new Response(request.method === 'HEAD' ? null : html, { status, headers: HTML });
  if (S.redirects.has(p)) return Response.redirect(new URL(S.redirects.get(p), url).toString(), 301);
  if (p === '/' || p === '/index.html' || p === '/index') return page(R.homePage(S));
  if (p === '/sitemap.xml') return new Response(R.sitemap(S), { headers: { 'content-type': 'application/xml; charset=utf-8' } });
  if (p === '/robots.txt') return new Response(R.robots(S), { headers: { 'content-type': 'text/plain; charset=utf-8' } });
  // /katalog і /katalog.html — одна сторінка (як було з html_handling auto-trailing-slash)
  const clean = p.replace(/\/$/, '').replace(/\.html$/, '');
  if (clean === '/katalog') return page(R.catalogPage(S));
  if (clean === '/koshyk') return page(R.cartPage(S, cartTpl));
  let m = /^\/tovar\/([a-z0-9-]+)$/.exec(clean);
  if (m) {
    const pr = S.bySlug.get(m[1]);
    if (pr && pr.visible) return page(R.productPage(S, pr));
    return page(R.notFoundPage(S), 404);
  }
  m = /^\/kategoriya\/([a-z0-9-]+)$/.exec(clean);
  if (m) {
    const c = S.catBySlug.get(m[1]);
    if (c && c.active) return page(R.categoryPage(S, c));
    return page(R.notFoundPage(S), 404);
  }
  m = /^\/([a-z0-9-]+)$/.exec(clean);
  if (m) {
    const pg = S.pageBySlug.get(m[1]);
    if (pg && pg.active) return page(R.contentPage(S, pg));
  }
  // Усе інше (зображення, файли) — зі статичних ресурсів; якщо їх немає — 404 з бази.
  const res = await env.ASSETS.fetch(request);
  if (res.status === 404 && !/\.(webp|jpe?g|png|svg|css|js|ico|gif|txt|xml|json)$/i.test(p)) return page(R.notFoundPage(S), 404);
  return res;
}

async function media(env, url) {
  const id = url.pathname.slice(7);
  if (!/^[a-z0-9]{8,40}$/.test(id)) return new Response('not found', { status: 404 });
  const r = await env.DB.prepare(`SELECT mime, data FROM media WHERE id = ?`).bind(id).first();
  if (!r) return new Response('not found', { status: 404 });
  const headers = { 'content-type': r.mime, 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' };
  if (r.mime === 'image/svg+xml') headers['content-security-policy'] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
  return new Response(new Uint8Array(r.data), { headers });
}

// Кеш довідників на 12 годин у кеші Cloudflare, щоб не впиратися в ліміти API.
async function cached(request, ctx, fn) {
  const cache = caches.default;
  const key = new Request(request.url, { method: 'GET' });
  const hit = await cache.match(key);
  if (hit) return hit;
  const res = await fn();
  if (res.status === 200) {
    const copy = new Response(res.body, res);
    copy.headers.set('cache-control', 'public, max-age=43200');
    ctx.waitUntil(cache.put(key, copy.clone()));
    return copy;
  }
  return res;
}

// ---------------- Нова пошта ----------------
async function np(env, modelName, calledMethod, methodProperties) {
  const r = await fetch(NP_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ apiKey: env.NP_API_KEY || '', modelName, calledMethod, methodProperties }),
  });
  const d = await r.json();
  if (!d.success) throw new Error('NP: ' + (d.errors || []).join('; '));
  return d.data;
}

async function npCities(url, env) {
  const q = (url.searchParams.get('q') || '').trim();
  if (q.length < 2) return json({ items: [] });
  const data = await np(env, 'AddressGeneral', 'searchSettlements', { CityName: q, Limit: '20', Page: '1' });
  const list = (data[0] && data[0].Addresses) || [];
  return json({
    items: list
      .filter((a) => a.DeliveryCity)
      .map((a) => ({ id: a.DeliveryCity, name: a.MainDescription, label: a.Present, branches: +a.Warehouses || 0 })),
  });
}

async function npWarehouses(url, env) {
  const city = url.searchParams.get('city') || '';
  if (!/^[0-9a-f-]{36}$/i.test(city)) return json({ items: [] });
  const q = (url.searchParams.get('q') || '').trim();
  const items = [];
  for (let page = 1; page <= 10; page++) {
    const data = await np(env, 'AddressGeneral', 'getWarehouses', {
      CityRef: city, FindByString: q, Limit: '500', Page: String(page), Language: 'UA',
    });
    for (const w of data) {
      items.push({
        id: w.Ref, number: w.Number, name: w.Description, address: w.ShortAddress,
        type: w.CategoryOfWarehouse === 'Postomat' ? 'postomat' : 'branch',
      });
    }
    if (data.length < 500) break;
  }
  items.sort((a, b) => (+a.number || 0) - (+b.number || 0));
  return json({ items });
}

// ---------------- Укрпошта ----------------
async function up(env, path, params) {
  if (!env.UP_TOKEN) throw new Error('UP_TOKEN не задано');
  const r = await fetch(`${UP_URL}/${path}?${new URLSearchParams(params)}`, {
    headers: { Authorization: 'Bearer ' + env.UP_TOKEN, Accept: 'application/json' },
  });
  if (!r.ok) throw new Error('UP HTTP ' + r.status);
  const d = await r.json();
  return (d && d.Entries && d.Entries.Entry) || [];
}

async function upCities(url, env) {
  const q = (url.searchParams.get('q') || '').trim();
  if (q.length < 2) return json({ items: [] });
  if (!env.UP_TOKEN) return json({ items: [], manual: true });
  const rows = await up(env, 'get_city_by_region_id_and_district_id_and_city_ua', { city_ua: q });
  return json({
    items: [].concat(rows).slice(0, 30).map((c) => ({
      // id = код КАТОТТГ (або КОАТУУ), за ним шукаємо відділення
      id: c.CITY_KATOTTG ? 'k:' + c.CITY_KATOTTG : 'o:' + c.CITY_KOATUU,
      name: c.CITY_UA,
      label: [(c.CITYTYPE_UA ? c.CITYTYPE_UA + ' ' : '') + c.CITY_UA, c.DISTRICT_UA && c.DISTRICT_UA + ' р-н', c.REGION_UA && c.REGION_UA + ' обл.']
        .filter(Boolean).join(', '),
    })),
  });
}

async function upOffices(url, env) {
  const city = url.searchParams.get('city') || '';
  const m = /^(k|o):([A-Za-z0-9]{5,30})$/.exec(city);
  if (!m) return json({ items: [] });
  if (!env.UP_TOKEN) return json({ items: [], manual: true });
  const rows = await up(env, 'get_postoffices_by_postcode_cityid_cityvpzid', m[1] === 'k' ? { city_katottg: m[2] } : { city_koatuu: m[2] });
  const items = [].concat(rows)
    .filter((o) => !o.LOCK_CODE || String(o.LOCK_CODE) === '0')
    .map((o) => ({
      id: String(o.POSTOFFICE_ID || o.POSTCODE), number: o.POSTCODE || o.POSTINDEX,
      name: 'Відділення ' + (o.POSTCODE || o.POSTINDEX),
      address: [o.STREET_UA_VPZ, o.HOUSENUMBER].filter(Boolean).join(', '),
    }));
  items.sort((a, b) => String(a.number).localeCompare(String(b.number)));
  return json({ items });
}

// ---------------- Замовлення ----------------
const esc = (s) => String(s == null ? '' : s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
const money = (v) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' грн';

async function order(request, env) {
  if (!env.DB && (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID)) return json({ error: 'not_configured' }, 503);
  let o;
  try { o = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
  if (o.website) return json({ ok: true, id: 'x' }); // пастка для ботів
  const c = o.customer || {}, d = o.delivery || {}, raw = Array.isArray(o.items) ? o.items.slice(0, 100) : [];
  const phone = String(c.phone || '').replace(/[^\d+]/g, '');
  const errors = [];
  if (!c.firstName || String(c.firstName).length > 60) errors.push('firstName');
  if (!c.lastName || String(c.lastName).length > 60) errors.push('lastName');
  if (!/^\+?380\d{9}$/.test(phone)) errors.push('phone');
  if (!raw.length) errors.push('items');
  if (!['np', 'np_courier', 'up', 'pickup'].includes(d.method)) errors.push('delivery');
  if (d.method !== 'pickup' && !d.city) errors.push('city');
  if ((d.method === 'np' || d.method === 'up') && !d.branch) errors.push('branch');
  if (d.method === 'np_courier' && !d.address) errors.push('address');
  if (errors.length) return json({ error: 'validation', fields: errors }, 422);

  const cut = (v, n = 300) => String(v == null ? '' : v).slice(0, n);
  let items = raw.map((i) => ({
    sku: cut(i.sku, 40), title: cut(i.title), opt: cut(i.opt),
    qty: Math.max(1, Math.min(9999, parseInt(i.qty, 10) || 1)), price: Math.max(0, +i.price || 0),
  }));
  // Ціну беремо з бази, а не з браузера покупця.
  if (env.DB) {
    const S = await loadStore(env);
    const bySku = new Map();
    for (const p of S.products) for (const v of p.variants) bySku.set(v.sku, [p, v]);
    items = items.map((i) => {
      const hit = bySku.get(i.sku);
      if (!hit) return i;
      const [p, v] = hit;
      return { ...i, title: p.title, opt: Object.entries(v.options).map(([k, x]) => k + ': ' + x).join(', ') || i.opt, price: +v.price };
    });
  }
  const id = new Date().toISOString().slice(2, 10).replace(/-/g, '') + '-' + Math.floor(1000 + Math.random() * 9000);
  const total = items.reduce((s, i) => s + i.qty * i.price, 0);
  const name = [c.lastName, c.firstName, c.middleName].filter(Boolean).map((x) => cut(x, 60)).join(' ');
  const delivery = {
    method: d.method, city: cut(d.city), branch: cut(d.branch), address: cut(d.address),
    pickupAddress: d.method === 'pickup' ? cut(d.pickupAddress) : '',
  };
  const comment = cut(o.comment, 1000);

  let saved = false;
  if (env.DB) {
    try {
      const at = new Date().toISOString();
      await env.DB.prepare(`INSERT INTO orders (id, created_at, status, name, phone, email, delivery, payment, comment, call_me, items, total, updated_at)
        VALUES (?, ?, 'new', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(id, at, name, phone, cut(c.email, 200), JSON.stringify(delivery), cut(o.payment, 40), comment, o.callMe === false ? 0 : 1, JSON.stringify(items), total, at).run();
      saved = true;
    } catch (e) { console.log('order_save_failed', String(e)); }
  }

  const tg = await notifyTelegram(env, { id, name, phone, email: c.email, delivery, payment: o.payment, comment, callMe: o.callMe, items, total });
  if (saved && tg.sent) await env.DB.prepare(`UPDATE orders SET telegram_ok = 1 WHERE id = ?`).bind(id).run().catch(() => {});
  if (!saved && !tg.sent) { console.log('order_failed', tg.errors); return json({ error: 'telegram_failed', details: tg.errors }, 502); }
  return json({ ok: true, id, total });
}

async function notifyTelegram(env, o) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return { sent: 0, errors: ['not_configured'] };
  const d = o.delivery;
  const lines = o.items.map((i, n) =>
    `${n + 1}. ${esc(i.title)}${i.opt ? ' (' + esc(i.opt) + ')' : ''}\n   <code>${esc(i.sku)}</code> × ${i.qty} = ${money(i.qty * i.price)}`);
  const method = { np: 'Нова пошта, відділення/поштомат', np_courier: "Нова пошта, кур'єр", up: 'Укрпошта', pickup: 'Самовивіз' }[d.method];
  const pay = { cod: 'Накладений платіж', card: 'Оплата на рахунок / картку', cash: 'Готівкою при самовивозі' }[o.payment] || esc(o.payment);
  const deliv = d.method === 'pickup' ? esc(d.pickupAddress || '') : [esc(d.city), esc(d.branch || d.address)].filter(Boolean).join(', ');
  const text =
    `🛒 <b>Нове замовлення №${o.id}</b>\n\n` +
    `<b>Клієнт:</b> ${esc(o.name)}\n` +
    `<b>Телефон:</b> ${esc(o.phone)}\n` +
    (o.email ? `<b>Email:</b> ${esc(o.email)}\n` : '') +
    `\n<b>Доставка:</b> ${method}\n${deliv}\n` +
    `<b>Оплата:</b> ${pay}\n` +
    (o.comment ? `<b>Коментар:</b> ${esc(o.comment)}\n` : '') +
    (o.callMe === false ? '<i>Клієнт просить не дзвонити для підтвердження</i>\n' : '') +
    `\n<b>Товари:</b>\n${lines.join('\n')}\n\n<b>Разом: ${money(o.total)}</b>`;
  const chats = String(env.TELEGRAM_CHAT_ID).split(',').map((s) => s.trim()).filter(Boolean);
  let sent = 0; const errors = [];
  for (const chat_id of chats) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id, text: text.slice(0, 4000), parse_mode: 'HTML', disable_web_page_preview: true }),
      });
      if (r.ok) sent++;
      else { let x = {}; try { x = await r.json(); } catch {} errors.push(`${r.status} ${x.description || ''}`.trim()); }
    } catch (e) { errors.push(String(e && e.message || e)); }
  }
  return { sent, errors };
}
