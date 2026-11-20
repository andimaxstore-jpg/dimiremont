/**
 * Cloudflare Worker магазину «Дім і Ремонт».
 * Статичні сторінки віддає з папки site/ (binding ASSETS), а маршрути /api/* обробляє тут.
 *
 * Секрети (Cloudflare → Worker → Settings → Variables and Secrets):
 *   TELEGRAM_BOT_TOKEN  — токен бота від @BotFather (обов'язково)
 *   TELEGRAM_CHAT_ID    — куди слати замовлення: ваш chat id або id групи (можна кілька через кому)
 *   NP_API_KEY          — ключ API Нової пошти (особистий кабінет → Налаштування → Безпека)
 *   UP_TOKEN            — bearer-токен Укрпошти (eCom/PROD_BEARER) для довідника відділень
 */

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
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      if (url.pathname === '/api/order' && request.method === 'POST') return await order(request, env);
      if (url.pathname === '/api/np/cities') return await cached(request, ctx, () => npCities(url, env));
      if (url.pathname === '/api/np/warehouses') return await cached(request, ctx, () => npWarehouses(url, env));
      if (url.pathname === '/api/up/cities') return await cached(request, ctx, () => upCities(url, env));
      if (url.pathname === '/api/up/offices') return await cached(request, ctx, () => upOffices(url, env));
      if (url.pathname === '/api/health') return json({ ok: true, telegram: !!env.TELEGRAM_BOT_TOKEN, np: !!env.NP_API_KEY, up: !!env.UP_TOKEN });
      return json({ error: 'not_found' }, 404);
    } catch (e) {
      return json({ error: 'server_error', message: String(e && e.message || e) }, 500);
    }
  },
};

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
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return json({ error: 'not_configured' }, 503);
  let o;
  try { o = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
  if (o.website) return json({ ok: true, id: 'x' }); // пастка для ботів
  const c = o.customer || {}, d = o.delivery || {}, items = Array.isArray(o.items) ? o.items.slice(0, 100) : [];
  const phone = String(c.phone || '').replace(/[^\d+]/g, '');
  const errors = [];
  if (!c.firstName || String(c.firstName).length > 60) errors.push('firstName');
  if (!c.lastName || String(c.lastName).length > 60) errors.push('lastName');
  if (!/^\+?380\d{9}$/.test(phone)) errors.push('phone');
  if (!items.length) errors.push('items');
  if (!['np', 'np_courier', 'up', 'pickup'].includes(d.method)) errors.push('delivery');
  if (d.method !== 'pickup' && !d.city) errors.push('city');
  if ((d.method === 'np' || d.method === 'up') && !d.branch) errors.push('branch');
  if (d.method === 'np_courier' && !d.address) errors.push('address');
  if (errors.length) return json({ error: 'validation', fields: errors }, 422);

  const id = new Date().toISOString().slice(2, 10).replace(/-/g, '') + '-' + Math.floor(1000 + Math.random() * 9000);
  let total = 0;
  const lines = items.map((i, n) => {
    const qty = Math.max(1, Math.min(9999, parseInt(i.qty, 10) || 1));
    const price = Math.max(0, +i.price || 0);
    total += qty * price;
    return `${n + 1}. ${esc(i.title)}${i.opt ? ' (' + esc(i.opt) + ')' : ''}\n   <code>${esc(i.sku)}</code> × ${qty} = ${money(qty * price)}`;
  });
  const method = { np: 'Нова пошта, відділення/поштомат', np_courier: "Нова пошта, кур'єр", up: 'Укрпошта', pickup: 'Самовивіз' }[d.method];
  const pay = { cod: 'Накладений платіж', card: 'Оплата на рахунок / картку', cash: 'Готівкою при самовивозі' }[o.payment] || esc(o.payment);
  const deliv = d.method === 'pickup'
    ? esc(d.pickupAddress || '')
    : [esc(d.city), esc(d.branch || d.address)].filter(Boolean).join(', ');
  const text =
    `🛒 <b>Нове замовлення №${id}</b>\n\n` +
    `<b>Клієнт:</b> ${esc(c.lastName)} ${esc(c.firstName)}${c.middleName ? ' ' + esc(c.middleName) : ''}\n` +
    `<b>Телефон:</b> ${esc(phone)}\n` +
    (c.email ? `<b>Email:</b> ${esc(c.email)}\n` : '') +
    `\n<b>Доставка:</b> ${method}\n${deliv}\n` +
    `<b>Оплата:</b> ${pay}\n` +
    (o.comment ? `<b>Коментар:</b> ${esc(String(o.comment).slice(0, 1000))}\n` : '') +
    (o.callMe === false ? '<i>Клієнт просить не дзвонити для підтвердження</i>\n' : '') +
    `\n<b>Товари:</b>\n${lines.join('\n')}\n\n<b>Разом: ${money(total)}</b>`;

  const chats = String(env.TELEGRAM_CHAT_ID).split(',').map((s) => s.trim()).filter(Boolean);
  let sent = 0; const tgErrors = [];
  for (const chat_id of chats) {
    const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id, text: text.slice(0, 4000), parse_mode: 'HTML', disable_web_page_preview: true }),
    });
    if (r.ok) sent++;
    else { let d = {}; try { d = await r.json(); } catch {} tgErrors.push(`${r.status} ${d.description || ''}`.trim()); }
  }
  if (!sent) { console.log('telegram_failed', tgErrors); return json({ error: 'telegram_failed', details: tgErrors }, 502); }
  return json({ ok: true, id, total });
}
