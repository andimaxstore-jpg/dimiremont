/**
 * Сторінки вітрини, які Worker збирає з бази D1 на льоту (раніше це робив build.py).
 * Розмітка та класи збігаються зі старим статичним сайтом, тому style.css і app.js ті самі.
 */

export const E = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' }[c]));
export const money = (v) => String(Math.round(+v || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
import { checkoutConfig, activeDelivery, paymentsFor, freeShipFrom, thresholdCarrier, CITY_KINDS, BRANCH_KINDS, ADDRESS_KINDS } from './checkout.js';

const jsonLd = (o) => JSON.stringify(o).replace(/</g, '\\u003c');
const lowerFirst = (s) => (s ? s[0].toLowerCase() + s.slice(1) : '');
const stripTags = (s) => String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
/** Безпечне посилання: лише відносні, http(s), tel:, viber:, mailto:. */
const href = (u) => { u = String(u || '').trim(); return /^(\/|https?:|tel:|mailto:|viber:|#)/i.test(u) ? u : '/' + u.replace(/^\.?\/*/, ''); };
const img = (u) => (u ? href(u) : '');

export const HEART = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.5 8 3.6 4.5 7.1 4.5c2 0 3.5 1.1 4.9 2.9 1.4-1.8 2.9-2.9 4.9-2.9 3.5 0 5.6 3.5 4.4 6.8-1.8 4.6-9.3 9.2-9.3 9.2z"/></svg>';
const USER_ICO = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 20.5c.8-4 4-6 8-6s7.2 2 8 6"/></svg>';

const FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&family=Unbounded:wght@500;700&display=swap">';

// Соцмережі в підвалі: посилання задаються в адмінці (Налаштування → Соцмережі), порожні не показуються.
// Значки намальовані простими лініями (24×24), колір бере від тексту підвалу.
const IC = (d) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const SOCIALS = [
  ['facebook', 'Facebook', IC('<path d="M14 21v-8h3l.5-3.5H14V7.8c0-1 .4-1.8 1.9-1.8H17.6V3c-.4-.1-1.6-.2-2.9-.2-2.9 0-4.7 1.7-4.7 4.9v1.8H7V13h3v8"/>')],
  ['instagram', 'Instagram', IC('<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r=".6" fill="currentColor"/>')],
  ['tiktok', 'TikTok', IC('<path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5"/><path d="M14 3c.4 2.6 2.2 4.4 5 4.6"/>')],
  ['telegram', 'Telegram', IC('<path d="M21 4 3 11l6 2.2L18 7l-7 7.5V20l3.2-3.6L18 19z"/>')],
  ['viber', 'Viber', IC('<path d="M12 3c5 0 8.5 2.3 8.5 7.5S17 18 12 18c-.8 0-1.5 0-2.2-.2L6 21v-4C4 15.6 3.5 13 3.5 10.5 3.5 5.3 7 3 12 3z"/><path d="M9.3 7.6c.4-.3.9-.2 1.1.2l.7 1.3c.2.4.1.8-.2 1l-.4.4c.4 1 1.2 1.8 2.2 2.2l.4-.4c.3-.3.7-.4 1-.2l1.3.7c.4.2.5.7.2 1.1-.6.9-1.6 1.3-2.6.8a8 8 0 0 1-4.1-4.1c-.5-1 0-2 .4-3z"/>')],
  ['youtube', 'YouTube', IC('<rect x="2.5" y="5" width="19" height="14" rx="4"/><path d="m10 9 5 3-5 3z" fill="currentColor"/>')],
  ['pinterest', 'Pinterest', IC('<circle cx="12" cy="12" r="9"/><path d="M10.5 20.5 12.6 12M9.6 14.4c-.8-.9-1-2-.8-3.1.4-2 2.2-3.3 4.2-3.1 2 .2 3.3 1.8 3.1 3.9-.2 2.4-1.7 4-3.4 3.8-1-.1-1.6-.8-1.3-1.9"/>')],
  ['threads', 'Threads', IC('<path d="M16.5 11.2c-.6-2.4-2.4-3.4-4.4-3.4-2.6 0-4.1 1.8-4.1 4.3 0 2.7 1.4 4.6 4.4 4.6 2.2 0 4-1.2 4-3.2 0-2.3-2.6-2.8-4.3-2.6-1.7.2-2.6 1.2-2.4 2.3.2 1.1 1.4 1.6 2.7 1.4 2.4-.4 3.2-2.6 3-5.3"/><path d="M19.5 8.5C18.3 5 15.6 3 12 3 6.8 3 3.5 6.6 3.5 12S6.8 21 12 21c3.8 0 6.6-2 7.6-5"/>')],
];

function socialBlock(st) {
  const links = SOCIALS.filter(([k]) => /^https:\/\//i.test(String(st['social_' + k] || ''))).map(([k, name, icon]) =>
    `<a class="soc" href="${E(st['social_' + k])}" target="_blank" rel="noopener" aria-label="${name}" title="${name}">${icon}</a>`);
  return links.length ? `<div class="socials"><h3>Підписуйтесь на нас</h3><div class="soc-row">${links.join('')}</div></div>` : '';
}

// Лічильник відвідувань: шле позначку лише справжній браузер, що виконав JavaScript
// (роботи соцмереж, які лише читають сторінку для прев'ю, і автоматизовані браузери не рахуються).
const BEACON = `<script>(function(){if(navigator.webdriver)return;var d=document,sent=0;function s(){if(sent||d.visibilityState!=='visible')return;sent=1;try{var b=JSON.stringify({p:location.pathname,q:location.search,r:d.referrer});if(!(navigator.sendBeacon&&navigator.sendBeacon('/api/v',b)))fetch('/api/v',{method:'POST',body:b,keepalive:true})}catch(e){}}s();if(!sent)d.addEventListener('visibilitychange',s)})();</script>`;

export function layout(S, { path, title, desc, body, ld = [], ogImage = '', robots = 'index,follow' }) {
  const st = S.settings;
  const site = String(st.site_url || '').replace(/\/$/, '');
  const url = site + (path === 'index.html' ? '/' : '/' + path);
  const cats = S.cats.filter((c) => c.active);
  const menuPages = S.pages.filter((p) => p.active && p.in_menu);
  const footPages = S.pages.filter((p) => p.active && p.in_footer);
  const cnt = new Map();
  for (const p of S.visible || []) cnt.set(p.category_id, (cnt.get(p.category_id) || 0) + 1);
  const link = (c) => `<a href="/kategoriya/${E(c.slug)}.html"><span>${E(c.name)}</span><small>${cnt.get(c.id) || 0}</small></a>`;
  const cols = [];
  for (const g of S.groups || []) {
    const cs = cats.filter((c) => c.group_id === g.id);
    if (cs.length) cols.push(`<div class="mm-col"><h3>${E(g.name)}</h3>${cs.map(link).join('')}</div>`);
  }
  const loose = cats.filter((c) => !(S.groups || []).some((g) => g.id === c.group_id));
  if (loose.length) cols.push(`<div class="mm-col"><h3>Інше</h3>${loose.map(link).join('')}</div>`);
  if (menuPages.length) cols.push(`<div class="mm-col mm-info"><h3>Покупцям</h3>${menuPages.map((p) => `<a href="/${E(p.slug)}.html"><span>${E(p.title)}</span></a>`).join('')}</div>`);
  const nav = `<details class="mm"><summary class="mm-btn"><span class="mm-ico" aria-hidden="true"></span>Каталог</summary>
<nav class="mm-panel" aria-label="Каталог товарів"><div class="wrap mm-in"><a class="mm-all" href="/katalog.html">Усі товари →</a><div class="mm-cols">${cols.join('')}</div></div></nav></details>`;
  const phone = E(st.phone || '');
  const tel = String(st.phone || '').replace(/[^+0-9]/g, '');
  const og = ogImage ? `<meta property="og:image" content="${E(/^https?:/.test(ogImage) ? ogImage : site + href(ogImage))}">` : '';
  return `<!doctype html>
<html lang="uk"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${E(title)}</title>
<meta name="description" content="${E(desc)}">
<meta name="robots" content="${robots}">
<link rel="canonical" href="${E(url)}">
<meta property="og:type" content="website"><meta property="og:locale" content="uk_UA">
<meta property="og:title" content="${E(title)}"><meta property="og:description" content="${E(desc)}"><meta property="og:url" content="${E(url)}">${og}
<meta name="theme-color" content="#1f2a44">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
${FONTS}
<link rel="stylesheet" href="/assets/style.css">
${ld.map((j) => `<script type="application/ld+json">${jsonLd(j)}</script>`).join('')}
</head><body data-rel="/"${freeShipFrom(st) ? ` data-free-ship="${freeShipFrom(st)}"` : ''}>
<header class="top"><div class="wrap top-in">
<a class="logo" href="/"><span class="logo-mark" aria-hidden="true"></span>${E(st.shop_name)}</a>
${nav}
<form class="search" action="/katalog.html" role="search"><label for="q" class="sr">Пошук товарів</label><input id="q" name="q" type="search" placeholder="Пошук: цегла, килимок, стелаж…"></form>
${tel ? `<a class="phone" href="tel:${E(tel)}">${phone}</a>` : ''}
<a class="ico-link wish-link" href="/kabinet.html#saved" title="Збережені товари" aria-label="Збережені товари">${HEART}<span class="ico-count" data-wish-count hidden>0</span></a>
<a class="ico-link acc-link" href="/kabinet.html" title="Особистий кабінет" aria-label="Особистий кабінет">${USER_ICO}<span class="acc-name" data-acc-name>Увійти</span></a>
<a class="cart-link" href="/koshyk.html">Кошик <span class="cart-count" data-cart-count>0</span></a>
</div>
</header>
<main>${body}</main>
<footer class="foot"><div class="wrap foot-in">
<div><div class="logo">${E(st.shop_name)}</div><p>Товари для дому та швидкого ремонту. ${E(st.delivery)}.</p>${socialBlock(st)}</div>
<div><h3>Покупцям</h3><a href="/katalog.html">Каталог</a>${footPages.map((p) => `<a href="/${E(p.slug)}.html">${E(p.title)}</a>`).join('')}<a href="/koshyk.html">Кошик</a></div>
<div><h3>Контакти</h3><p>${phone}</p>${st.email ? `<p>${E(st.email)}</p>` : ''}<p>${E(st.city)}</p></div>
</div><div class="wrap copy">© ${new Date().getFullYear()} ${E(st.shop_name)}. Ціни вказані в гривнях.</div></footer>
${path === '404.html' ? '' : BEACON}
<script src="/assets/app.js" defer></script>
</body></html>`;
}

const crumbs = (S, items) => {
  const site = String(S.settings.site_url || '').replace(/\/$/, '');
  const li = items.map(([t, h]) => (h ? `<li><a href="${E(h)}">${E(t)}</a></li>` : `<li aria-current="page">${E(t)}</li>`)).join('');
  const ld = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: items.map(([t, h], i) => ({ '@type': 'ListItem', position: i + 1, name: t, ...(h ? { item: site + h } : {}) })),
  };
  return [`<nav class="crumbs wrap" aria-label="Навігація"><ol>${li}</ol></nav>`, ld];
};

const phImg = (p) => `/img/ph-${p.cat ? p.cat.slug : 'x'}.svg`;

/** Дані для фільтрів категорії: які значення має товар. */
function facets(p) {
  const f = {};
  for (const v of p.variants) for (const [k, val] of Object.entries(v.options)) {
    const key = 'o:' + k;
    (f[key] = f[key] || []).includes(val) || f[key].push(val);
  }
  for (const [aid, val] of Object.entries(p.attrs)) if (val !== '' && val != null) f['a:' + aid] = [String(val)];
  if (p.gift) f['f:gift'] = ['1'];
  if (p.is_new) f['f:new'] = ['1'];
  if (p.variants.some((v) => +v.old_price > +v.price)) f['f:sale'] = ['1'];
  if (p.variants.some((v) => v.in_stock)) f['f:stock'] = ['1'];
  return f;
}

export function card(p) {
  const u = `/tovar/${E(p.slug)}.html`;
  const pic = p.cover
    ? `<img src="${E(img(p.cover))}" alt="${E(p.title)}" loading="lazy" width="400" height="400">`
    : `<img src="${phImg(p)}" alt="" loading="lazy" width="400" height="400" class="ph">`;
  const price = (p.min !== p.max || p.price_note ? 'від ' : '') + money(p.min) + ' ₴';
  const old = p.oldMin > p.min ? `<s class="old">${money(p.oldMin)} ₴</s> ` : '';
  const n = p.variants.length;
  let badges = '';
  if (p.oldMin > p.min) badges += '<span class="badge sale">Знижка</span>';
  if (p.gift) badges += '<span class="badge gift">Подарунок</span>';
  if (p.is_new) badges += '<span class="badge new">Новинка</span>';
  if (!p.variants.some((v) => v.in_stock)) badges += '<span class="badge out">Немає в наявності</span>';
  let sw = '';
  const withImg = p.variants.filter((v) => v.image);
  if (p.cover && n > 1 && withImg.length) {
    sw = '<div class="mini-sw">' + withImg.slice(0, 5).map((v) => `<img src="${E(img(v.image))}" alt="" loading="lazy" width="28" height="28">`).join('') +
      (n > 5 ? `<span>+${n - 5}</span>` : '') + '</div>';
  } else if (n > 1) sw = `<div class="mini-sw"><span class="nv">${n} варіантів</span></div>`;
  const search = (p.title.toLowerCase() + ' ' + p.variants.slice(0, 80).map((v) => v.sku).join(' '));
  return `<article class="card" data-slug="${E(p.slug)}" data-cat="${E(p.cat ? p.cat.slug : '')}" data-price="${p.min}" data-sort="${p.sort}" data-title="${E(search)}" data-f="${E(JSON.stringify(facets(p)))}">
<a href="${u}" class="card-img">${pic}<span class="badges">${badges}</span></a>
<button type="button" class="wish" data-wish="${E(p.slug)}" aria-pressed="false" aria-label="Зберегти товар" title="Зберегти">${HEART}</button>
<div class="card-body"><h3><a href="${u}">${E(p.title)}</a></h3>
${sw}<div class="card-foot"><span class="price">${old}${price}</span><a class="btn-sm" href="${u}">Обрати</a></div></div></article>`;
}

// ---------- фільтри на сторінці категорії ----------
function filterPanel(S, list, filters) {
  if (!filters.length || !list.length) return '';
  const out = [];
  for (const f of filters) {
    const label = E(f.label || '');
    if (f.kind === 'price') {
      const lo = Math.min(...list.map((p) => p.min)), hi = Math.max(...list.map((p) => p.max));
      if (lo === hi) continue;
      out.push(`<fieldset class="flt" data-flt="price"><legend>${label || 'Ціна'}, ₴</legend><div class="flt-range">
<input type="number" inputmode="numeric" min="0" placeholder="${money(lo)}" data-min aria-label="Ціна від"><span>—</span><input type="number" inputmode="numeric" min="0" placeholder="${money(hi)}" data-max aria-label="Ціна до"></div></fieldset>`);
      continue;
    }
    if (f.kind === 'flag') {
      const cnt = list.filter((p) => (facets(p)['f:' + f.key] || []).length).length;
      if (!cnt) continue;
      out.push(`<fieldset class="flt" data-flt="f:${E(f.key)}"><legend class="sr">${label}</legend><label class="chk"><input type="checkbox" value="1"> ${label} <small>${cnt}</small></label></fieldset>`);
      continue;
    }
    const key = (f.kind === 'option' ? 'o:' : 'a:') + f.key;
    const counts = new Map();
    for (const p of list) for (const val of facets(p)[key] || []) counts.set(val, (counts.get(val) || 0) + 1);
    if (counts.size < 2) continue;
    const attr = f.kind === 'attr' ? S.attrById.get(+f.key) : null;
    const unit = attr && attr.unit ? ' ' + attr.unit : '';
    const vals = [...counts.entries()].sort((a, b) => {
      const na = parseFloat(a[0]), nb = parseFloat(b[0]);
      return !isNaN(na) && !isNaN(nb) ? na - nb : a[0].localeCompare(b[0], 'uk');
    });
    const colors = S.settings.colors || {};
    const many = vals.length > 8 ? ' many' : '';
    out.push(`<fieldset class="flt${many}" data-flt="${E(key)}"><legend>${label || E(attr ? attr.name : f.key)}</legend><div class="flt-vals">` +
      vals.map(([v, n]) => `<label class="chk"><input type="checkbox" value="${E(v)}">${colors[v] ? `<i class="dot" style="background:${E(colors[v])}"></i>` : ''} ${E(v)}${E(unit)} <small>${n}</small></label>`).join('') +
      `</div>${vals.length > 8 ? '<button type="button" class="flt-more" data-more>Показати всі</button>' : ''}</fieldset>`);
  }
  if (!out.length) return '';
  return `<aside class="flt-panel" data-filters><div class="flt-head"><b>Фільтри</b><button type="button" class="flt-reset" data-reset hidden>Скинути</button></div>${out.join('')}</aside>`;
}

const sortTools = `<div class="tools"><label for="sort">Сортувати</label><select id="sort"><option value="">За замовчуванням</option><option value="asc">Спершу дешевші</option><option value="desc">Спершу дорожчі</option></select><span class="muted" data-found></span></div>`;

// ---------- сторінки ----------
const plural = (n, one, few, many) => {
  const a = n % 10, b = n % 100;
  return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many;
};

export function productPage(S, p) {
  const cat = p.cat;
  const opts = [];
  for (const v of p.variants) for (const k of Object.keys(v.options)) if (!opts.includes(k)) opts.push(k);
  const n = p.variants.length;
  const v0 = p.variants.find((v) => v.in_stock) || p.variants[0];
  const colors = S.settings.colors || {};
  let selectors = '';
  for (const o of opts) {
    const vals = [];
    for (const v of p.variants) {
      const val = v.options[o];
      if (val && !vals.some((x) => x[0] === val)) vals.push([val, v]);
    }
    const isImg = vals.every(([, v]) => v.image) && opts.length === 1 && vals.length > 1;
    const items = vals.map(([val, v]) => {
      if (isImg) return `<button type="button" class="sw sw-img" data-opt="${E(o)}" data-val="${E(val)}" title="${E(val)} · ${E(v.sku)}"><img src="${E(img(v.image))}" alt="${E(val)}" loading="lazy" width="64" height="64"></button>`;
      if (colors[val]) return `<button type="button" class="sw sw-col" data-opt="${E(o)}" data-val="${E(val)}"><i style="background:${E(colors[val])}"></i>${E(val)}</button>`;
      return `<button type="button" class="sw sw-txt" data-opt="${E(o)}" data-val="${E(val)}">${E(val)}</button>`;
    }).join('');
    if (vals.length > 1 || n > 1)
      selectors += `<fieldset class="opt"><legend>${E(o)}: <b data-opt-label="${E(o)}"></b> <span class="cnt">(${vals.length})</span></legend><div class="sws${vals.length > 24 ? ' many' : ''}">${items}</div></fieldset>`;
  }
  const vjson = JSON.stringify(p.variants.map((v) => ({ sku: v.sku, price: +v.price, old: +v.old_price || 0, o: v.options, img: img(v.image), size: v.size, stock: v.in_stock ? 1 : 0 })));
  const feats = p.features.map((f) => `<li>${E(f)}</li>`).join('');
  const parts = [`${p.title} — ${lowerFirst(cat.blurb || cat.name)}`.replace(/[.\s]+$/, '')];
  if (n > 1) parts.push(`${n} варіантів на вибір`);
  parts.push(`Ціна від ${money(p.min)} грн`);
  const metaDesc = p.seo_desc || parts.join('. ') + '. Доставка по Україні.';
  let longDesc = p.description;
  if (!stripTags(longDesc)) {
    longDesc = `<p>${E(p.title)} з категорії «${E(cat.name)}». ${E(cat.blurb)}</p>`;
    if (n > 1) longDesc += `<p>У цій картці зібрано ${n} варіантів. Оберіть потрібний вище, і ми покажемо артикул та ціну саме для нього.</p>`;
  }
  let specs = `<tr><th>Категорія</th><td><a href="/kategoriya/${E(cat.slug)}.html">${E(cat.name)}</a></td></tr>`;
  for (const a of S.attrs) {
    const val = p.attrs[a.id];
    if (val !== undefined && val !== '') specs += `<tr><th>${E(a.name)}</th><td>${E(val)}${a.unit ? ' ' + E(a.unit) : ''}</td></tr>`;
  }
  specs += `<tr><th>Варіантів</th><td>${n}</td></tr><tr><th>Артикул</th><td data-sku>${E(v0.sku)}</td></tr>`;
  const gift = p.gift ? `<div class="gift-box"><b>Акція:</b> ${E(p.gift)}</div>` : '';
  const note = p.price_note ? `<p class="note">${E(p.price_note)}</p>` : '';
  const cover = img(v0.image || p.cover);
  const noPhoto = p.cover ? '' : '<p class="note">Фото кожного дизайну додамо найближчим часом. Менеджер надішле фото обраного варіанту перед відправкою.</p>';
  const site = String(S.settings.site_url || '').replace(/\/$/, '');
  const [cr, crld] = crumbs(S, [['Головна', '/'], [cat.name, `/kategoriya/${cat.slug}.html`], [p.title, '']]);
  // Розмітка для Google (Merchant listings). Доставка/повернення — як на сторінці «Доставка і оплата».
  const shipping = {
    '@type': 'OfferShippingDetails',
    shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'UA' },
    deliveryTime: {
      '@type': 'ShippingDeliveryTime',
      handlingTime: { '@type': 'QuantitativeValue', minValue: 0, maxValue: 1, unitCode: 'DAY' },
      transitTime: { '@type': 'QuantitativeValue', minValue: 1, maxValue: 3, unitCode: 'DAY' },
    },
  };
  // Вартість — за тарифами перевізника; від порогу free_ship_from — безкоштовно (тоді вказуємо 0 ₴).
  const freeFrom = freeShipFrom(S.settings);
  const shipFor = (v) => (freeFrom && +v.price >= freeFrom
    ? { ...shipping, shippingRate: { '@type': 'MonetaryAmount', value: '0', currency: 'UAH' } } : shipping);
  const retUrl = returnsUrl(S);
  const returns = {
    '@type': 'MerchantReturnPolicy', applicableCountry: 'UA', returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
    merchantReturnDays: 14, returnMethod: 'https://schema.org/ReturnByMail', returnFees: 'https://schema.org/ReturnFeesCustomerResponsibility',
    ...(retUrl ? { merchantReturnLink: site + retUrl } : {}),
  };
  const offer = (v) => ({
    '@type': 'Offer', price: String(+v.price), priceCurrency: 'UAH', itemCondition: 'https://schema.org/NewCondition',
    availability: v.in_stock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', url: `${site}/tovar/${p.slug}.html#${v.sku}`,
    shippingDetails: shipFor(v), hasMerchantReturnPolicy: returns,
  });
  // Опції варіантів -> властивості schema.org, які приймає Google (color / size / pattern).
  const propOf = (o) => (o === 'Колір' ? 'color' : ['Розмір', 'Яруси'].includes(o) ? 'size' : 'pattern');
  const vprops = (v) => {
    const r = {};
    for (const o of opts) if (v.options[o]) { const k = propOf(o); r[k] = r[k] ? `${r[k]}, ${v.options[o]}` : String(v.options[o]); }
    return r;
  };
  const groupId = `SW-G${p.id}`;
  const brand = { '@type': 'Brand', name: S.settings.shop_name };
  const variantLd = (v) => ({
    '@type': 'Product', sku: v.sku, name: `${p.title} — ${Object.values(v.options).join(', ') || v.sku}`, description: metaDesc,
    ...vprops(v), ...(v.image ? { image: site + img(v.image) } : {}), offers: offer(v),
  });
  const prodLd = n > 1 && opts.length ? {
    '@context': 'https://schema.org', '@type': 'ProductGroup', name: p.title, description: metaDesc, productGroupID: groupId,
    url: `${site}/tovar/${p.slug}.html`, brand,
    variesBy: [...new Set(opts.map((o) => 'https://schema.org/' + propOf(o)))],
    hasVariant: p.variants.map(variantLd),
  } : {
    '@context': 'https://schema.org', ...variantLd(v0), name: p.title, url: `${site}/tovar/${p.slug}.html`, brand,
  };
  if (p.cover) prodLd.image = site + img(p.cover);
  if (p.reviewCount) {
    prodLd.aggregateRating = { '@type': 'AggregateRating', ratingValue: String(p.rating), reviewCount: p.reviewCount, bestRating: '5', worstRating: '1' };
    prodLd.review = p.reviews.slice(0, 10).map((r) => ({
      '@type': 'Review', author: { '@type': 'Person', name: r.name }, datePublished: String(r.created_at).slice(0, 10),
      reviewBody: r.text, reviewRating: { '@type': 'Rating', ratingValue: String(r.rating), bestRating: '5', worstRating: '1' },
    }));
  }
  const starsHtml = (v) => `<span class="stars" style="--r:${(v / 5) * 100}%" aria-hidden="true">★★★★★</span>`;
  const revList = (p.reviews || []).map((r) => `<article class="rev"><div class="rev-h">${starsHtml(r.rating)}<b>${E(r.name)}</b><time datetime="${E(String(r.created_at).slice(0, 10))}">${E(new Date(r.created_at).toLocaleDateString('uk-UA'))}</time></div><p>${E(r.text)}</p></article>`).join('');
  const reviewsHtml = `<section class="wrap block reviews" id="vidguky"><h2>Відгуки${p.reviewCount ? ` <span class="muted">(${p.reviewCount})</span>` : ''}</h2>
<div class="rev-in"><div>${p.reviewCount ? `<div class="rev-sum">${starsHtml(p.rating)}<b>${String(p.rating).replace('.', ',')}</b><span class="muted">з 5 · ${p.reviewCount} ${plural(p.reviewCount, 'відгук', 'відгуки', 'відгуків')}</span></div>${revList}` : '<p class="muted">Відгуків ще немає. Купували цей товар? Розкажіть іншим покупцям.</p>'}</div>
<form class="rev-form" data-review="${E(p.slug)}" novalidate><h3>Залишити відгук</h3>
<fieldset class="rate"><legend>Ваша оцінка</legend><div class="rate-in">${[5, 4, 3, 2, 1].map((n) => `<input type="radio" name="rating" value="${n}" id="r${n}"><label for="r${n}" title="${n}">★</label>`).join('')}</div></fieldset>
<label>Ваше ім’я<input name="name" maxlength="60" autocomplete="given-name" required></label>
<label>Відгук<textarea name="text" rows="4" maxlength="2000" required></textarea></label>
<input name="website" tabindex="-1" autocomplete="off" class="hp" aria-hidden="true">
<p class="err" data-rev-err hidden></p>
<button class="btn">Надіслати відгук</button>
<p class="note">Відгук з’явиться після перевірки модератором.</p></form>
<p class="rev-ok" data-rev-ok hidden>Дякуємо! Ваш відгук з’явиться на сайті після перевірки.</p></div></section>`;
  const related = S.visible.filter((q) => q.category_id === p.category_id && q.id !== p.id).slice(0, 4);
  const relHtml = related.length ? `<section class="wrap block"><h2>Схожі товари</h2><div class="grid">${related.map(card).join('')}</div></section>` : '';
  const oldTxt = +v0.old_price > +v0.price ? money(v0.old_price) + ' ₴' : '';
  const body = `${cr}
<section class="wrap product" data-product="${E(vjson)}">
<div class="gallery"><div class="main-img"><img data-main src="${E(cover || phImg(p))}" alt="${E(p.title)}" width="720" height="720"${cover ? '' : ' class="ph"'}></div></div>
<div class="info">
<h1>${E(p.title)}</h1>
${p.reviewCount ? `<a class="rate-line" href="#vidguky">${starsHtml(p.rating)} ${String(p.rating).replace('.', ',')} · ${p.reviewCount} ${plural(p.reviewCount, 'відгук', 'відгуки', 'відгуків')}</a>` : ''}
<div class="sku-line">Артикул: <span data-sku>${E(v0.sku)}</span><span data-vsize></span></div>
${gift}
<div class="buy"><div class="price-big"><s class="old" data-old${oldTxt ? '' : ' hidden'}>${oldTxt}</s> <span data-price>${money(v0.price)} ₴</span></div>${note}<p class="stock" data-stock></p>${freeFrom ? `<p class="ship-note">Доставка за тарифами перевізника, <b>безкоштовно від ${money(freeFrom)} ₴</b></p>` : ''}${retUrl ? `<p class="ship-note"><a href="${E(retUrl)}">Повернення та обмін — 14 днів, гарантія</a></p>` : ''}</div>
<form class="variant-form" onsubmit="return false">${selectors}
<div class="buy-row"><div class="qty"><button type="button" data-qty="-1" aria-label="Менше">−</button><input id="qty" type="number" min="1" value="1" inputmode="numeric" aria-label="Кількість"><button type="button" data-qty="1" aria-label="Більше">+</button></div>
<button type="button" class="btn" data-add>Додати в кошик</button>
<button type="button" class="wish wish-big" data-wish="${E(p.slug)}" aria-pressed="false" aria-label="Зберегти товар" title="Зберегти">${HEART}<span data-wish-label>Зберегти</span></button></div>
<p class="added" data-added hidden>Додано в кошик. <a href="/koshyk.html">Оформити замовлення</a></p>
</form>
${noPhoto}
<ul class="feats">${feats}</ul>
${guideLink(S, cat)}
</div></section>
<section class="wrap block about"><h2>Опис і характеристики</h2><div class="about-in"><div class="txt">${longDesc}</div><table class="specs">${specs}</table></div></section>
${reviewsHtml}
${relHtml}`;
  return layout(S, {
    path: `tovar/${p.slug}.html`, title: p.seo_title || `${p.title} — купити, ціна від ${money(p.min)} ₴ | ${S.settings.shop_name}`,
    desc: metaDesc, body, ld: [prodLd, crld], ogImage: p.cover,
  });
}

export function categoryPage(S, c) {
  const items = S.visible.filter((p) => p.category_id === c.id);
  const group = S.groups.find((g) => g.id === c.group_id);
  const [cr, crld] = crumbs(S, [['Головна', '/'], [c.name, '']]);
  const panel = filterPanel(S, items, S.filtersByCat.get(c.id) || []);
  const site = String(S.settings.site_url || '').replace(/\/$/, '');
  const body = `${cr}<section class="wrap block"><div class="cat-head">${group ? `<p class="eyebrow">${E(group.name)}</p>` : ''}<h1>${E(c.name)}</h1><p>${E(c.blurb)}</p><p class="muted">${items.length} товарів, ${items.reduce((s, p) => s + p.variants.length, 0)} артикулів</p>${guideLink(S, c)}</div>
<div class="listing${panel ? ' has-flt' : ''}">${panel ? `<button type="button" class="btn ghost flt-open" data-flt-open>Фільтри</button>` + panel : ''}
<div class="listing-main">${sortTools}<div class="grid" data-catalog data-scope="category">${items.map(card).join('')}</div><p class="empty" data-empty hidden>Нічого не знайшли за цими фільтрами.</p></div></div>
${stripTags(c.description) ? `<div class="seo cat-desc">${c.description}</div>` : ''}</section>`;
  const ld = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: c.name, description: c.blurb, url: `${site}/kategoriya/${c.slug}.html` };
  const lo = items.length ? Math.min(...items.map((p) => p.min)) : 0;
  return layout(S, {
    path: `kategoriya/${c.slug}.html`, title: c.seo_title || `${c.name} — купити в Україні | ${S.settings.shop_name}`,
    desc: c.seo_desc || `${c.name}: ${c.blurb}${items.length ? ` Ціни від ${money(lo)} грн.` : ''}`, body, ld: [ld, crld],
    ogImage: c.image || (items.find((p) => p.cover) || {}).cover || '',
  });
}

export function catalogPage(S) {
  const cats = S.cats.filter((c) => c.active);
  const chips = cats.map((c) => `<button type="button" class="chip" data-filter="${E(c.slug)}">${E(c.name)}</button>`).join('');
  const body = `<section class="wrap block"><h1>Каталог товарів</h1>
<div class="filters"><button type="button" class="chip on" data-filter="">Усі</button>${chips}</div>
${sortTools}
<div class="grid" data-catalog>${S.visible.map(card).join('')}</div><p class="empty" data-empty hidden>Нічого не знайшли. Спробуйте інше слово або артикул.</p></section>`;
  return layout(S, {
    path: 'katalog.html', title: `Каталог товарів для дому та ремонту | ${S.settings.shop_name}`,
    desc: 'Повний каталог: ' + cats.map((c) => lowerFirst(c.name)).join(', ') + '. Доставка по Україні.', body,
  });
}

export function homePage(S) {
  const H = S.home || {};
  const h = H.hero || {};
  const st = S.settings;
  const site = String(st.site_url || '').replace(/\/$/, '');
  const hero = h.title ? `<section class="hero"><div class="wrap hero-in">
<div class="hero-txt">${h.eyebrow ? `<p class="eyebrow">${E(h.eyebrow)}</p>` : ''}<h1>${E(h.title)}</h1>
${h.text ? `<p>${E(h.text)}</p>` : ''}
<div class="hero-cta">${h.btn_text ? `<a class="btn" href="${E(href(h.btn_url))}">${E(h.btn_text)}</a>` : ''}${h.btn2_text ? `<a class="btn ghost" href="${E(href(h.btn2_url))}">${E(h.btn2_text)}</a>` : ''}</div></div>
${h.image ? `<a class="hero-img" href="${E(href(h.image_url || h.btn_url || '/katalog.html'))}"><img src="${E(img(h.image))}" alt="${E(h.image_alt || '')}" width="720" height="380"></a>` : ''}
</div></section>` : '';
  const promos = (H.promos || []).filter((p) => p.title);
  const promoHtml = promos.length ? `<section class="wrap block"><h2>${E(H.promos_title || 'Акції')}</h2><div class="promos">` +
    promos.map((p, i) => `<a class="promo p${(i % 3) + 1}" href="${E(href(p.url))}">${p.tag ? `<span class="tag">${E(p.tag)}</span>` : ''}<b>${E(p.title)}</b><span>${E(p.text)}</span></a>`).join('') +
    '</div></section>' : '';
  let groups = '';
  if (H.show_groups !== false) {
    for (const g of S.groups) {
      const cs = S.cats.filter((c) => c.active && c.group_id === g.id);
      if (!cs.length) continue;
      groups += `<section class="wrap block"><h2>${E(g.name)}</h2><div class="cat-tiles">` + cs.map((c) => {
        const items = S.visible.filter((p) => p.category_id === c.id);
        const im = c.image || (items.find((p) => p.cover) || {}).cover;
        return `<a class="cat-tile" href="/kategoriya/${E(c.slug)}.html"><img src="${E(im ? img(im) : `/img/ph-${c.slug}.svg`)}" alt="" loading="lazy" width="160" height="160"${im ? '' : ' class="ph"'}><span><b>${E(c.name)}</b><small>${items.length} товарів</small></span></a>`;
      }).join('') + '</div></section>';
    }
  }
  const hitSet = new Set(H.hits || []);
  const hits = [...(H.hits || []).map((s) => S.bySlug.get(s)), ...S.visible.filter((p) => p.is_hit && !hitSet.has(p.slug))]
    .filter((p) => p && p.visible).slice(0, 12);
  const news = H.show_new === false ? [] : S.visible.filter((p) => p.is_new).slice(0, 10);
  const nVar = S.visible.reduce((s, p) => s + p.variants.length, 0);
  const body = `${hero}${promoHtml}${groups}
${hits.length ? `<section class="wrap block"><div class="row-head"><h2>${E(H.hits_title || 'Хіти продажів')}</h2><a href="/katalog.html">Усі товари →</a></div><div class="grid">${hits.map(card).join('')}</div></section>` : ''}
${news.length ? `<section class="wrap block"><div class="row-head"><h2>${E(H.new_title || 'Новинки')}</h2></div><div class="grid">${news.map(card).join('')}</div></section>` : ''}
<section class="wrap block perks"><div><b>${S.visible.length} товарів, ${nVar} артикулів</b><span>Кожна картка об’єднує всі кольори й малюнки одного товару</span></div>
<div><b>${freeShipFrom(st) ? `Безкоштовна доставка від ${money(freeShipFrom(st))} ₴` : 'Доставка'}</b><span>${E(st.delivery)}</span></div><div><b>Оплата</b><span>${E(st.payment)}</span></div></section>
${stripTags(H.seo_text) ? `<section class="wrap block seo">${H.seo_heading ? `<h2>${E(H.seo_heading)}</h2>` : ''}${H.seo_text}</section>` : ''}`;
  const org = { '@context': 'https://schema.org', '@type': 'Store', name: st.shop_name, url: site + '/', telephone: st.phone, priceRange: '₴₴', areaServed: 'UA' };
  const siteLd = {
    '@context': 'https://schema.org', '@type': 'WebSite', name: st.shop_name, url: site + '/',
    potentialAction: { '@type': 'SearchAction', target: site + '/katalog.html?q={search_term_string}', 'query-input': 'required name=search_term_string' },
  };
  return layout(S, {
    path: 'index.html', title: H.seo_title || st.shop_name, desc: H.seo_desc || '', body, ld: [org, siteLd], ogImage: h.image || '',
  });
}

/** Активна сторінка умов повернення (за адресою garantiia-ta-povernennia або за назвою зі словом «повернення»). */
export function returnsUrl(S) {
  const pg = S.pages.find((p) => p.active && p.slug === 'garantiia-ta-povernennia')
    || S.pages.find((p) => p.active && p.slug !== 'dostavka' && /поверненн/i.test(p.title));
  return pg ? `/${pg.slug}.html` : null;
}

/** Сторінка-інструкція, де є розділ з id = slug категорії (напр. <h2 id="plytka">). */
export function guideFor(S, cat) {
  if (!cat) return null;
  const pg = S.pages.find((p) => p.active && String(p.content || '').includes(`id="${cat.slug}"`));
  return pg ? `/${pg.slug}.html#${cat.slug}` : null;
}
const guideLink = (S, cat) => { const u = guideFor(S, cat); return u ? `<p class="guide-link"><a href="${E(u)}">Як монтувати: покрокова інструкція →</a></p>` : ''; };

/**
 * Текстова сторінка з адмінки. Якщо в тексті 4+ заголовки H2 — додається зміст.
 * Розділ із заголовком «Часті запитання» (H2), де питання — H3, а відповідь — текст під ним, стає розміткою FAQPage для Google.
 */
export function contentPage(S, pg) {
  const [cr, crld] = crumbs(S, [['Головна', '/'], [pg.title, '']]);
  const site = String(S.settings.site_url || '').replace(/\/$/, '');
  let n = 0;
  const toc = [];
  const content = String(pg.content || '').replace(/<h2(\s[^>]*)?>([\s\S]*?)<\/h2>/gi, (m, attrs = '', inner) => {
    const idm = /\sid="([^"]+)"/i.exec(attrs);
    const id = idm ? idm[1] : `r${++n}`;
    toc.push([id, stripTags(inner)]);
    return idm ? m : `<h2 id="${id}"${attrs}>${inner}</h2>`;
  });
  const tocHtml = toc.length >= 4 ? `<nav class="toc" aria-label="Зміст"><b>Зміст</b><ol>${toc.map(([id, t]) => `<li><a href="#${E(id)}">${E(t)}</a></li>`).join('')}</ol></nav>` : '';
  const first = content.search(/<h2[\s>]/i);
  const html = tocHtml && first >= 0 ? content.slice(0, first) + tocHtml + content.slice(first) : tocHtml + content;
  const ld = [crld];
  const fm = /<h2[^>]*>[^<]*(?:запитан|питання|FAQ)[\s\S]*?<\/h2>([\s\S]*?)(?=<h2[\s>]|$)/i.exec(content);
  if (fm) {
    const qa = [...fm[1].matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>([\s\S]*?)(?=<h3[\s>]|$)/gi)]
      .map(([, q, a]) => [stripTags(q), stripTags(a)]).filter(([q, a]) => q && a);
    if (qa.length >= 2) ld.push({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: qa.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) });
  }
  const desc = pg.seo_desc || stripTags(pg.content).slice(0, 160);
  if (toc.length >= 4) {
    const im = /<img[^>]+src="([^"]+)"/i.exec(content);
    ld.push({ '@context': 'https://schema.org', '@type': 'Article', headline: pg.title, description: desc, inLanguage: 'uk',
      mainEntityOfPage: `${site}/${pg.slug}.html`, ...(im ? { image: site + href(im[1]) } : {}),
      author: { '@type': 'Organization', name: S.settings.shop_name }, publisher: { '@type': 'Organization', name: S.settings.shop_name } });
  }
  const body = `${cr}<section class="wrap block narrow page-content"><h1>${E(pg.title)}</h1>${html}</section>`;
  const og = (/<img[^>]+src="([^"]+)"/i.exec(content) || [])[1] || '';
  return layout(S, {
    path: `${pg.slug}.html`, title: pg.seo_title || `${pg.title} | ${S.settings.shop_name}`,
    desc, body, ld, ogImage: og,
  });
}

export function notFoundPage(S) {
  return layout(S, {
    path: '404.html', title: 'Сторінку не знайдено', desc: 'Сторінку не знайдено', robots: 'noindex',
    body: '<section class="wrap block narrow"><h1>Сторінку не знайдено</h1><p><a href="/katalog.html">Перейти до каталогу</a></p></section>',
  });
}

/** Текст із адмінки -> абзаци (без HTML; посилання http(s) клікабельні). */
const infoHtml = (txt) => String(txt || '').split(/\n{2,}/).map((para) => para.trim()).filter(Boolean)
  .map((para) => `<p>${E(para).replace(/\n/g, '<br>').replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`)}</p>`).join('');

/** Кошик: розмітка форми замовлення та сама, що генерував build.py (на неї спирається app.js). Способи доставки/оплати — з адмінки. */
export function cartPage(S, tpl) {
  const st = S.settings;
  const tg = st.telegram ? `<a class="btn" data-tg href="https://t.me/${E(st.telegram)}" target="_blank" rel="noopener">Надіслати в Telegram</a>` : '';
  const vb = st.viber ? `<a class="btn ghost" href="viber://chat?number=%2B${E(st.viber)}">Написати у Viber</a>` : '';
  const cfg = checkoutConfig(st);
  const dl = activeDelivery(cfg);
  const free = freeShipFrom(st);
  const ids = (kinds) => dl.filter((d) => kinds.includes(d.kind)).map((d) => d.id).join(' ') || '-';
  const radios = dl.map((d, i) => `<label class="radio"><input type="radio" name="method" value="${E(d.id)}" data-kind="${E(d.kind)}" data-title="${E(d.title)}"` +
    ` data-cost="${E(d.free ? 'безкоштовно' : d.cost_note)}"${d.threshold ? ' data-threshold' : ''}${i ? '' : ' checked'}>` +
    `<span><b>${E(d.title)}</b>${d.subtitle ? `<small>${E(d.subtitle)}</small>` : ''}</span></label>`).join('\n');
  const pickupIds = dl.filter((d) => d.kind === 'pickup').map((d) => d.id).join(' ');
  const pickup = pickupIds ? `<div class="pickup" data-for="${E(pickupIds)}"><b data-pickup-addr>${E(st.pickup_address || '')}</b>` +
    `<p>${[st.pickup_hours, st.phone ? `Телефон: ${st.phone}` : ''].filter(Boolean).map(E).join('. ')}</p></div>` : '';
  const dInfo = dl.filter((d) => d.info).map((d) => `<div class="co-info" data-for="${E(d.id)}">${infoHtml(d.info)}</div>`).join('');
  const pays = cfg.payment.filter((p) => p.active && dl.some((d) => paymentsFor(cfg, d.id).includes(p)));
  const payRadios = pays.map((p) => `<label class="radio" data-pay="${E(p.id)}" data-for-d="${E((p.for || []).join(' '))}">` +
    `<input type="radio" name="payment" value="${E(p.id)}" data-title="${E(p.title)}"><span><b>${E(p.title)}</b>${p.subtitle ? `<small>${E(p.subtitle)}</small>` : ''}</span></label>`).join('\n');
  const pInfo = pays.filter((p) => p.info).map((p) => `<div class="co-info" data-pay-info="${E(p.id)}" hidden>${infoHtml(p.info)}</div>`).join('');
  const d0 = dl[0] || {};
  const body = tpl
    .replace('{{DELIVERY_RADIOS}}', radios)
    .replace('{{FOR_CITY}}', E(ids(CITY_KINDS))).replace('{{FOR_BRANCH}}', E(ids(BRANCH_KINDS))).replace('{{FOR_ADDR}}', E(ids(ADDRESS_KINDS)))
    .replace('{{PICKUP_BLOCK}}', pickup).replace('{{DELIVERY_INFO}}', dInfo)
    .replace('{{PAYMENT_RADIOS}}', payRadios).replace('{{PAYMENT_INFO}}', pInfo)
    .replace('{{SHIP_NOTE}}', E(d0.free ? 'безкоштовно' : (d0.cost_note || '') + (d0.threshold && free ? ` (безкоштовно від ${money(free)} ₴)` : '')))
    .replaceAll('{{PHONE}}', E(st.phone))
    .replace('{{TG}}', tg).replace('{{VB}}', vb)
    .replace('{{RETURNS}}', returnsUrl(S) ? ` Умови <a href="${E(returnsUrl(S))}">повернення та гарантії</a>.` : '');
  return layout(S, { path: 'koshyk.html', title: `Оформлення замовлення | ${st.shop_name}`, desc: 'Кошик і оформлення замовлення.', body, robots: 'noindex,follow' });
}

export function sitemap(S) {
  const site = String(S.settings.site_url || '').replace(/\/$/, '');
  const day = new Date().toISOString().slice(0, 10);
  const u = [['', '1.0'], ['katalog.html', '0.9']];
  for (const pg of S.pages) if (pg.active) u.push([`${pg.slug}.html`, '0.3']);
  for (const c of S.cats) if (c.active) u.push([`kategoriya/${c.slug}.html`, '0.9']);
  for (const p of S.visible) u.push([`tovar/${p.slug}.html`, '0.8']);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
    u.map(([x, pr]) => `<url><loc>${E(site)}/${E(x)}</loc><lastmod>${day}</lastmod><priority>${pr}</priority></url>`).join('') + '</urlset>\n';
}

export function robots(S) {
  const site = String(S.settings.site_url || '').replace(/\/$/, '');
  return `User-agent: *\nAllow: /\nDisallow: /koshyk.html\nDisallow: /kabinet.html\nDisallow: /admin/\nDisallow: /api/\n\nSitemap: ${site}/sitemap.xml\n`;
}

/** Особистий кабінет: оболонка сторінки, вміст малює /assets/account.js. */
export function accountPage(S) {
  const st = S.settings;
  const tel = String(st.phone || '').replace(/[^+0-9]/g, '');
  // Назви способів доставки/оплати з адмінки + які з вбудованих увімкнені (для «Доставки за замовчуванням»).
  const cfg = checkoutConfig(st);
  const names = JSON.stringify({
    d: Object.fromEntries(cfg.delivery.map((d) => [d.id, d.title])), p: Object.fromEntries(cfg.payment.map((x) => [x.id, x.title])),
    on: activeDelivery(cfg).filter((d) => ['np', 'np_courier', 'up', 'pickup'].includes(d.id)).map((d) => d.id),
  });
  const body = `<section class="wrap block acc" data-account data-phone="${E(st.phone || '')}" data-tel="${E(tel)}" data-ship-cfg="${E(names)}">
<h1>Особистий кабінет</h1>
<noscript><p>Для кабінету потрібно увімкнути JavaScript у браузері.</p></noscript>
<div data-acc-root><p class="muted">Завантаження…</p></div>
</section>
<script src="/assets/account.js" defer></script>`;
  return layout(S, { path: 'kabinet.html', title: `Особистий кабінет | ${st.shop_name}`, desc: 'Особистий кабінет покупця: замовлення, особисті дані, збережені товари.', body, robots: 'noindex,nofollow' });
}

/**
 * Фід товарів для Google Merchant Center (RSS 2.0 з простором імен g:), /google-feed.xml.
 * Один запис = один варіант (артикул); варіанти однієї картки об'єднані item_group_id (як productGroupID у розмітці).
 * Ціни, наявність і властивості (color/size/pattern) — ті самі, що в JSON-LD на сторінці товару.
 * Варіанти без фото не потрапляють у фід: Google відхиляє товари із заглушкою замість фото.
 */
const GPC = {
  // Категорії таксономії Google лише там, де відповідність однозначна; решту Google визначить сам.
  'Меблі': 'Furniture',
  'Зберігання': 'Home & Garden > Household Supplies > Storage & Organization',
  'Килимки вологопоглинаючі': 'Home & Garden > Decor > Rugs',
  'Дзеркала та дзеркальний декор': 'Home & Garden > Decor > Mirrors',
  'Покриття для підлоги': 'Hardware > Building Materials > Flooring & Carpet',
};
const X = (s) => E(String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ''));
const cut = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s; };

export function googleFeed(S) {
  const st = S.settings;
  const site = String(st.site_url || '').replace(/\/$/, '');
  const abs = (u) => (/^https?:/i.test(u) ? u : site + img(u));
  const freeFrom = freeShipFrom(st), carrier = thresholdCarrier(st);
  const propOf = (o) => (o === 'Колір' ? 'color' : ['Розмір', 'Яруси'].includes(o) ? 'size' : 'pattern');
  // Один артикул постачальника інколи стоїть у двох картках (різні розміри) — тоді id = артикул + номер картки.
  const skuN = new Map();
  for (const p of S.visible) for (const v of p.variants) skuN.set(v.sku, (skuN.get(v.sku) || 0) + 1);
  const items = [];
  for (const p of S.visible) {
    const cat = p.cat;
    const group = S.groups.find((g) => g.id === cat.group_id);
    const desc = cut(stripTags(p.description) || p.seo_desc || `${p.title} — ${lowerFirst(cat.blurb || cat.name)}`.replace(/[.\s]+$/, '') + '.', 5000);
    const multi = p.variants.length > 1;
    for (const v of p.variants) {
      const photo = v.image || p.cover;
      if (!photo || !v.sku || !(+v.price > 0)) continue;
      const vals = Object.values(v.options || {}).filter(Boolean);
      const props = {};
      for (const [o, val] of Object.entries(v.options || {})) if (val) { const k = propOf(o); props[k] = props[k] ? `${props[k]}, ${val}` : String(val); }
      const price = +v.price, old = +v.old_price || 0;
      const f = [
        ['g:id', skuN.get(v.sku) > 1 ? `${v.sku}-${p.id}` : v.sku],
        ['g:title', cut(vals.length ? `${p.title} — ${vals.join(', ')}` : p.title, 150)],
        ['g:description', desc],
        ['g:link', `${site}/tovar/${p.slug}.html${multi ? '#' + v.sku : ''}`],
        ['g:image_link', abs(photo)],
        ...(p.cover && p.cover !== photo ? [['g:additional_image_link', abs(p.cover)]] : []),
        ['g:availability', v.in_stock ? 'in_stock' : 'out_of_stock'],
        ['g:price', `${(old > price ? old : price).toFixed(2)} UAH`],
        ...(old > price ? [['g:sale_price', `${price.toFixed(2)} UAH`]] : []),
        ['g:condition', 'new'],
        ['g:brand', st.shop_name],
        ['g:mpn', v.sku],
        ...(multi ? [['g:item_group_id', `SW-G${p.id}`]] : []),
        ...Object.entries(props).map(([k, val]) => [`g:${k}`, cut(val, 100)]),
        ['g:product_type', [group && group.name, cat.name].filter(Boolean).join(' > ')],
        ...(GPC[cat.name] ? [['g:google_product_category', GPC[cat.name]]] : []),
        ['g:min_handling_time', '0'], ['g:max_handling_time', '1'],
      ];
      // Безкоштовна доставка від порогу; для решти — тарифи перевізника з налаштувань доставки в Merchant Center.
      const ship = freeFrom && price >= freeFrom ? '<g:shipping><g:country>UA</g:country><g:service>${X(carrier)}</g:service><g:price>0.00 UAH</g:price></g:shipping>' : '';
      items.push(`<item>${f.map(([k, val]) => `<${k}>${X(val)}</${k}>`).join('')}${ship}</item>`);
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel>` +
    `<title>${X(st.shop_name)}</title><link>${X(site)}/</link><description>${X(st.shop_name)} — товари для дому та швидкого ремонту</description>\n` +
    items.join('\n') + '\n</channel></rss>\n';
}
