/* Бек-офіс «Дім і Ремонт»: односторінковий інтерфейс над /api/admin/* */
(function () {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (v) => String(Math.round(+v || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₴';
  const view = $('#view');
  const STATUS = { new: 'Нове', confirmed: 'Підтверджене', paid: 'Оплачене', shipped: 'Відправлене', done: 'Виконане', cancelled: 'Скасоване' };
  const DELIV = { np: 'Нова пошта', np_courier: 'Кур’єр НП', up: 'Укрпошта', pickup: 'Самовивіз' };
  const PAY = { cod: 'Накладений платіж', card: 'На рахунок / картку', cash: 'Готівкою при самовивозі' };
  const FLAGS = { gift: 'З подарунком', new: 'Новинка', sale: 'Зі знижкою', stock: 'В наявності' };
  const TR = { а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z', и: 'y', і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ю: 'iu', я: 'ia', ы: 'y', э: 'e', ё: 'io', ъ: '' };
  const slugify = (s) => String(s || '').toLowerCase().replace(/[’']/g, '').split('').map((c) => (c in TR ? TR[c] : c)).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  const fmtDate = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }); };
  const pill = (s) => `<span class="pill st-${esc(s)}">${esc(STATUS[s] || s)}</span>`;

  // ---------- API ----------
  async function api(method, path, body, raw) {
    const opt = { method, headers: { 'x-admin': '1' }, credentials: 'same-origin' };
    if (raw) { opt.body = raw.body; opt.headers['content-type'] = raw.type; if (raw.name) opt.headers['x-file-name'] = encodeURIComponent(raw.name); }
    else if (body !== undefined) { opt.body = JSON.stringify(body); opt.headers['content-type'] = 'application/json'; }
    const r = await fetch('/api/admin/' + path, opt);
    let d = null; try { d = await r.json(); } catch (e) {}
    if (r.status === 401 && path !== 'login') { showLogin(d && d.configured === false); throw new Error('Потрібно увійти'); }
    if (!r.ok) throw new Error((d && (d.message || d.error)) || 'Помилка ' + r.status);
    return d;
  }
  let toastT;
  function toast(msg, bad) {
    const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (bad ? ' bad' : ''); t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, bad ? 6000 : 2500);
  }
  const fail = (e) => toast(e.message || String(e), true);
  let dirty = false;
  window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  function watchDirty(root) { root.addEventListener('input', () => { dirty = true; }); root.addEventListener('change', () => { dirty = true; }); }

  // ---------- вхід ----------
  function showLogin(notConfigured) {
    $('#app').hidden = true; $('#login').hidden = false;
    const err = $('#login-err');
    if (notConfigured) { err.textContent = 'Пароль адмінки ще не задано. Додайте секрет ADMIN_PASSWORD у Cloudflare (Worker dimiremont → Settings → Variables and Secrets).'; err.hidden = false; }
  }
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#login-err'); err.hidden = true;
    try {
      await api('POST', 'login', { password: e.target.password.value });
      e.target.reset(); $('#login').hidden = true; boot();
    } catch (ex) { err.textContent = ex.message === 'bad_password' ? 'Невірний пароль' : ex.message; err.hidden = false; }
  });
  $('#logout').addEventListener('click', async () => { await api('POST', 'logout').catch(() => {}); showLogin(); });

  // ---------- маршрутизація ----------
  const routes = [
    [/^\/$/, dashboard], [/^\/orders$/, orders], [/^\/orders\/(.+)$/, orderEdit],
    [/^\/products$/, products], [/^\/products\/(new|\d+)$/, productEdit],
    [/^\/categories$/, categories], [/^\/categories\/(new|\d+)$/, categoryEdit],
    [/^\/attributes$/, attributes], [/^\/pages$/, pages], [/^\/pages\/home$/, homeEdit], [/^\/pages\/(new|\d+)$/, pageEdit],
    [/^\/settings$/, settings], [/^\/reviews$/, reviews],
  ];
  let lastHash = location.hash;
  async function route() {
    if (dirty && !confirm('Є незбережені зміни. Вийти без збереження?')) { history.replaceState(null, '', lastHash || '#/'); return; }
    dirty = false; lastHash = location.hash;
    const [path, qs] = (location.hash.slice(1) || '/').split('?');
    const q = new URLSearchParams(qs || '');
    $$('#nav a').forEach((a) => { const h = a.getAttribute('href').slice(1); a.classList.toggle('on', h === '/' ? path === '/' : path.startsWith(h)); });
    for (const [re, fn] of routes) {
      const m = re.exec(path);
      if (m) {
        view.innerHTML = '<p class="muted">Завантаження…</p>';
        try { await fn(m[1], q); } catch (e) { if (e.message !== 'Потрібно увійти') view.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
        window.scrollTo(0, 0);
        return;
      }
    }
    view.innerHTML = '<div class="empty">Сторінку не знайдено</div>';
  }
  window.addEventListener('hashchange', route);
  const go = (h) => { dirty = false; location.hash = h; };

  async function refreshBadge() {
    try { const d = await api('GET', 'dashboard'); const n = d.byStatus.new || 0; const b = $('#new-count'); b.textContent = n; b.hidden = !n; const rp = (d.counts && d.counts.reviews_pending) || 0, rb = $('#rev-count'); if (rb) { rb.textContent = rp; rb.hidden = !rp; } return d; } catch (e) { return null; }
  }
  async function boot() {
    try { await api('GET', 'me'); } catch (e) { return; }
    $('#app').hidden = false; $('#login').hidden = true;
    refreshBadge();
    route();
  }

  // ---------- кешовані довідники ----------
  const cache = {};
  async function ref(name, force) { if (force || !cache[name]) cache[name] = await api('GET', name); return cache[name]; }
  const drop = (...n) => n.forEach((k) => delete cache[k]);

  // ---------- спільні елементи форм ----------
  function field(label, name, value, opts = {}) {
    const t = opts.type || 'text';
    const hint = opts.hint ? `<small>${esc(opts.hint)}</small>` : '';
    const cls = opts.span ? ' class="span2"' : '';
    if (t === 'textarea') return `<label${cls}>${esc(label)}${hint}<textarea name="${name}" rows="${opts.rows || 3}" ${opts.ph ? `placeholder="${esc(opts.ph)}"` : ''}>${esc(value)}</textarea></label>`;
    if (t === 'checkbox') return `<label class="check"><input type="checkbox" name="${name}" ${value ? 'checked' : ''}> ${esc(label)}</label>`;
    if (t === 'select') return `<label${cls}>${esc(label)}${hint}<select name="${name}">${opts.options.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
    return `<label${cls}>${esc(label)}${hint}<input type="${t}" name="${name}" value="${esc(value)}" ${opts.ph ? `placeholder="${esc(opts.ph)}"` : ''} ${opts.attrs || ''}></label>`;
  }
  function formData(form) {
    const o = {};
    $$('[name]', form).forEach((el) => {
      if (el.closest('[data-skip]')) return;
      o[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    });
    return o;
  }

  // Завантаження картинки: стискаємо в браузері до 1600 px WebP і кладемо в базу.
  async function uploadImage(file) {
    if (!file) return null;
    let blob = file, type = file.type;
    if (/^image\/(jpeg|png|webp)$/.test(type)) {
      try {
        const bmp = await createImageBitmap(file);
        const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
        const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
        c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
        const out = await new Promise((res) => c.toBlob(res, 'image/webp', 0.85));
        if (out && out.type === 'image/webp') { blob = out; type = 'image/webp'; }
      } catch (e) { /* лишаємо оригінал */ }
    }
    const r = await api('POST', 'media', undefined, { body: blob, type, name: file.name });
    return r.url;
  }
  function imgPick(name, value, small) {
    return `<div class="imgpick${small ? ' sm' : ''}" data-imgpick>${value ? `<img src="${esc(value)}" alt="">` : '<span class="ph">немає</span>'}
      <input type="text" name="${name}" value="${esc(value)}" placeholder="/img/... або завантажте" ${small ? 'hidden' : ''}>
      <label class="btn ghost sm" title="Завантажити фото">Фото<input type="file" accept="image/*" hidden></label>
      ${value ? '<button type="button" class="icon" data-clear title="Прибрати фото">×</button>' : ''}</div>`;
  }
  function bindImgPicks(root, onChange) {
    root.addEventListener('change', async (e) => {
      const box = e.target.closest('[data-imgpick]');
      if (!box || e.target.type !== 'file') return;
      const f = e.target.files[0]; if (!f) return;
      try {
        toast('Завантажуємо фото…');
        const url = await uploadImage(f);
        setImg(box, url); onChange && onChange(box, url); toast('Фото завантажено');
      } catch (ex) { fail(ex); }
      e.target.value = '';
    });
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-clear]'); if (!b) return;
      const box = b.closest('[data-imgpick]'); setImg(box, ''); onChange && onChange(box, '');
    });
    root.addEventListener('input', (e) => {
      const box = e.target.closest('[data-imgpick]');
      if (box && e.target.type === 'text') { const im = $('img', box); if (im) im.src = e.target.value; }
    });
  }
  function setImg(box, url) {
    const inp = $('input[type=text]', box); inp.value = url; dirty = true;
    const old = box.firstElementChild; const neu = document.createElement(url ? 'img' : 'span');
    if (url) neu.src = url; else { neu.className = 'ph'; neu.textContent = 'немає'; }
    box.replaceChild(neu, old);
    let clr = $('[data-clear]', box);
    if (url && !clr) { clr = document.createElement('button'); clr.type = 'button'; clr.className = 'icon'; clr.dataset.clear = ''; clr.title = 'Прибрати фото'; clr.textContent = '×'; box.appendChild(clr); }
    if (!url && clr) clr.remove();
  }

  // Простий візуальний редактор тексту з перемиканням на HTML.
  function rte(name, html) {
    return `<div class="rte" data-rte="${name}"><div class="rte-bar">
      <button type="button" data-cmd="formatBlock" data-arg="H2">Заголовок</button><button type="button" data-cmd="formatBlock" data-arg="H3">Підзаголовок</button>
      <button type="button" data-cmd="formatBlock" data-arg="P">Абзац</button><button type="button" data-cmd="bold"><b>Ж</b></button><button type="button" data-cmd="italic"><i>К</i></button>
      <button type="button" data-cmd="insertUnorderedList">• Список</button><button type="button" data-cmd="insertOrderedList">1. Список</button>
      <button type="button" data-cmd="createLink">Посилання</button><button type="button" data-cmd="image">Фото</button>
      <button type="button" data-cmd="removeFormat">Очистити</button><button type="button" data-cmd="html">HTML</button></div>
      <div class="rte-area" contenteditable="true">${html || ''}</div><textarea hidden spellcheck="false"></textarea></div>`;
  }
  function bindRte(root) {
    $$('[data-rte]', root).forEach((box) => {
      const area = $('.rte-area', box), ta = $('textarea', box);
      box.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-cmd]'); if (!b) return;
        const cmd = b.dataset.cmd; dirty = true;
        if (cmd === 'html') {
          if (ta.hidden) { ta.value = area.innerHTML; ta.hidden = false; area.hidden = true; } else { area.innerHTML = ta.value; ta.hidden = true; area.hidden = false; }
          return;
        }
        area.focus();
        if (cmd === 'createLink') { const u = prompt('Адреса посилання (наприклад /katalog.html або https://...)'); if (u) document.execCommand('createLink', false, u); return; }
        if (cmd === 'image') {
          const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
          const sel = window.getSelection(); const range = sel.rangeCount ? sel.getRangeAt(0) : null;
          inp.onchange = async () => {
            try { const url = await uploadImage(inp.files[0]); area.focus(); if (range) { sel.removeAllRanges(); sel.addRange(range); } document.execCommand('insertImage', false, url); } catch (ex) { fail(ex); }
          };
          inp.click(); return;
        }
        document.execCommand(cmd, false, b.dataset.arg || null);
      });
    });
  }
  const rteValue = (root, name) => { const box = $(`[data-rte="${name}"]`, root); const ta = $('textarea', box); return ta.hidden ? $('.rte-area', box).innerHTML : ta.value; };

  // =====================================================================
  // Огляд
  async function dashboard() {
    const d = await refreshBadge() || await api('GET', 'dashboard');
    const c = d.counts;
    view.innerHTML = `<div class="head"><h1>Огляд</h1></div>
    <div class="stats">
      <a class="stat" href="#/orders?status=new"><b>${d.byStatus.new || 0}</b><span>нових замовлень</span></a>
      <div class="stat"><b>${d.day.n}</b><span>замовлень за добу · ${money(d.day.sum)}</span></div>
      <div class="stat"><b>${d.month.n}</b><span>замовлень за 30 днів · ${money(d.month.sum)}</span></div>
      <a class="stat" href="#/products"><b>${c.active}</b><span>товарів на сайті з ${c.products} · ${c.variants} артикулів</span></a>
      <a class="stat" href="#/products?state=nophoto"><b>${c.no_photo}</b><span>товарів без фото</span></a>
    </div>
    <div class="card"><div class="head"><h2>Останні замовлення</h2><a href="#/orders" class="btn ghost sm">Усі замовлення</a></div>
    ${d.recent.length ? `<div class="tbl-wrap"><table class="tbl"><tr><th>№</th><th>Дата</th><th>Клієнт</th><th>Телефон</th><th class="num">Сума</th><th>Статус</th></tr>
    ${d.recent.map((o) => `<tr class="click" data-href="#/orders/${esc(o.id)}"><td>${esc(o.id)}</td><td>${fmtDate(o.created_at)}</td><td>${esc(o.name)}</td><td>${esc(o.phone)}</td><td class="num">${money(o.total)}</td><td>${pill(o.status)}</td></tr>`).join('')}
    </table></div>` : '<p class="muted">Замовлень ще немає. Щойно покупець оформить кошик на сайті, замовлення з’явиться тут.</p>'}</div>`;
    clickRows(view);
  }
  function clickRows(root) {
    root.addEventListener('click', (e) => {
      if (e.target.closest('input,button,a,select,label')) return;
      const tr = e.target.closest('tr[data-href]'); if (tr) go(tr.dataset.href);
    });
  }

  // =====================================================================
  // Відгуки: модерація
  async function reviews(_, q) {
    const status = q.get('status') || 'pending';
    const d = await api('GET', 'reviews?status=' + status);
    const L = { pending: 'На перевірці', approved: 'Опубліковані', rejected: 'Відхилені', all: 'Усі' };
    const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
    view.innerHTML = `<div class="head"><h1>Відгуки</h1></div>
    <p class="hint">На сайті й у Google показуються лише опубліковані відгуки. Нові відгуки чекають тут на вашу перевірку.</p>
    <div class="tabs">${Object.keys(L).map((s) => `<button type="button" data-st="${s}" class="${s === status ? 'on' : ''}">${L[s]} <span class="muted">${s === 'all' ? Object.values(d.counts).reduce((a, b) => a + b, 0) : d.counts[s] || 0}</span></button>`).join('')}</div>
    ${d.items.length ? d.items.map((r) => `<div class="card" style="margin-top:12px" data-id="${r.id}">
      <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap"><div><b style="color:#d69e2e;letter-spacing:1px">${stars(r.rating)}</b> <b>${esc(r.name)}</b> <span class="muted">· ${fmtDate(r.created_at)}</span></div>
      <a href="/tovar/${esc(r.slug || '')}.html" target="_blank" class="muted">${esc(r.title || 'Товар видалено')}</a></div>
      <p style="white-space:pre-wrap;margin:10px 0">${esc(r.text)}</p>
      <div class="toolbar">${r.status !== 'approved' ? '<button type="button" class="btn sm" data-act="approved">Опублікувати</button>' : ''}
      ${r.status !== 'rejected' ? '<button type="button" class="btn ghost sm" data-act="rejected">Відхилити</button>' : ''}
      <button type="button" class="btn ghost sm" data-act="remove">Видалити</button>${status === 'all' ? ` <span class="muted">${L[r.status] || r.status}</span>` : ''}</div></div>`).join('')
      : `<div class="card empty">${status === 'pending' ? 'Нових відгуків немає' : 'Тут поки порожньо'}</div>`}`;
    $$('[data-st]').forEach((b) => b.addEventListener('click', () => go('#/reviews?status=' + b.dataset.st)));
    $$('[data-act]').forEach((b) => b.addEventListener('click', async () => {
      const id = b.closest('[data-id]').dataset.id, act = b.dataset.act;
      try {
        if (act === 'remove') { if (!confirm('Видалити відгук назавжди?')) return; await api('DELETE', 'reviews/' + id); }
        else await api('PATCH', 'reviews/' + id, { status: act });
        toast(act === 'approved' ? 'Опубліковано' : act === 'rejected' ? 'Відхилено' : 'Видалено');
        reviews(_, q); refreshBadge();
      } catch (ex) { fail(ex); }
    }));
  }

  // Замовлення
  async function orders(_, q) {
    const status = q.get('status') || '', search = q.get('q') || '', from = q.get('from') || '', to = q.get('to') || '', page = +q.get('page') || 1;
    const qs = new URLSearchParams({ status, q: search, from, to, page }).toString();
    const [d, dash] = await Promise.all([api('GET', 'orders?' + qs), api('GET', 'dashboard')]);
    const counts = dash.byStatus; const all = Object.values(counts).reduce((a, b) => a + b, 0);
    const setQ = (k, v) => { const p = new URLSearchParams({ status, q: search, from, to }); p.set(k, v); if (k !== 'page') p.delete('page'); go('#/orders?' + p.toString()); };
    const pages = Math.ceil(d.total / d.per);
    view.innerHTML = `<div class="head"><h1>Замовлення</h1><a class="btn ghost" href="/api/admin/orders/export.csv?${esc(qs)}">Завантажити CSV</a></div>
    <div class="tabs">${[['', 'Усі', all], ...Object.keys(STATUS).map((s) => [s, STATUS[s], counts[s] || 0])].map(([s, l, n]) => `<button type="button" data-st="${s}" class="${s === status ? 'on' : ''}">${l} <span class="muted">${n}</span></button>`).join('')}</div>
    <form class="toolbar" id="of"><input type="search" name="q" value="${esc(search)}" placeholder="Номер, ім’я, телефон, артикул, ТТН">
    <label class="check">з <input type="date" name="from" value="${esc(from)}"></label><label class="check">по <input type="date" name="to" value="${esc(to)}"></label>
    <button class="btn ghost">Знайти</button></form>
    ${d.items.length ? `<div class="tbl-wrap"><table class="tbl"><tr><th>№</th><th>Дата</th><th>Клієнт</th><th>Телефон</th><th>Доставка</th><th class="num">Товарів</th><th class="num">Сума</th><th>Статус</th></tr>
    ${d.items.map((o) => `<tr class="click" data-href="#/orders/${esc(o.id)}"><td>${esc(o.id)}</td><td>${fmtDate(o.created_at)}</td><td>${esc(o.name)}</td><td>${esc(o.phone)}</td>
      <td>${esc(DELIV[o.delivery.method] || '')}${o.delivery.city ? ', ' + esc(o.delivery.city.split(',')[0]) : ''}${o.ttn ? `<br><small class="muted">ТТН ${esc(o.ttn)}</small>` : ''}</td>
      <td class="num">${o.count}</td><td class="num">${money(o.total)}</td><td>${pill(o.status)}</td></tr>`).join('')}</table></div>` : '<div class="card empty">Замовлень не знайдено</div>'}
    ${pages > 1 ? `<div class="toolbar" style="margin-top:12px">${Array.from({ length: pages }, (_, i) => `<button type="button" class="btn ${i + 1 === d.page ? '' : 'ghost'} sm" data-page="${i + 1}">${i + 1}</button>`).join('')}</div>` : ''}`;
    $$('[data-st]').forEach((b) => b.addEventListener('click', () => setQ('status', b.dataset.st)));
    $$('[data-page]').forEach((b) => b.addEventListener('click', () => setQ('page', b.dataset.page)));
    $('#of').addEventListener('submit', (e) => {
      e.preventDefault(); const f = formData(e.target);
      go('#/orders?' + new URLSearchParams({ status, q: f.q, from: f.from, to: f.to }).toString());
    });
    clickRows(view);
  }

  async function orderEdit(id) {
    const o = await api('GET', 'orders/' + encodeURIComponent(id));
    const d = o.delivery || {};
    const tel = (o.phone || '').replace(/[^+\d]/g, '');
    const itemRow = (i, n) => `<tr data-i="${n}"><td><input name="sku" value="${esc(i.sku)}" style="width:120px"></td><td><input name="title" value="${esc(i.title)}"><input name="opt" value="${esc(i.opt)}" placeholder="варіант" style="margin-top:4px"></td>
      <td><input name="qty" type="number" min="1" value="${i.qty}" style="width:70px"></td><td><input name="price" type="number" min="0" step="0.01" value="${i.price}" style="width:100px"></td>
      <td class="num" data-sum>${money(i.qty * i.price)}</td><td><button type="button" class="icon" data-rm title="Видалити">×</button></td></tr>`;
    view.innerHTML = `<div class="head"><a href="#/orders" class="btn ghost sm">← Замовлення</a><h1>Замовлення №${esc(o.id)}</h1>${pill(o.status)}<button type="button" class="btn ghost no-print" onclick="print()">Друк</button></div>
    <form id="ord"><div class="cols"><div>
      <div class="card"><h2>Товари</h2><div class="tbl-wrap"><table class="tbl edit" id="items"><tr><th>Артикул</th><th>Назва / варіант</th><th>К-сть</th><th>Ціна</th><th class="num">Сума</th><th></th></tr>
      ${o.items.map(itemRow).join('')}</table></div>
      <div class="toolbar" style="margin-top:10px"><button type="button" class="btn ghost sm" data-add>+ Додати позицію</button><span class="grow"></span><b>Разом: <span id="total">${money(o.total)}</span></b></div></div>
      <div class="card"><h2>Покупець і доставка</h2><div class="grid2">
        ${field('Ім’я та прізвище', 'name', o.name)}${field('Телефон', 'phone', o.phone)}${field('Email', 'email', o.email)}
        ${field('Спосіб доставки', 'd_method', d.method, { type: 'select', options: Object.entries(DELIV) })}
        ${field('Місто', 'd_city', d.city)}${field('Відділення', 'd_branch', d.branch)}${field('Адреса (кур’єр)', 'd_address', d.address)}
      </div>
      <dl class="dl" style="margin-top:12px"><dt>Оплата</dt><dd>${esc(PAY[o.payment] || o.payment)}</dd>
      <dt>Дзвінок</dt><dd>${o.call_me ? 'Подзвонити для підтвердження' : 'Просить не дзвонити, якщо все в наявності'}</dd>
      ${o.comment ? `<dt>Коментар</dt><dd>${esc(o.comment)}</dd>` : ''}
      <dt>Telegram</dt><dd>${o.telegram_ok ? 'Сповіщення надіслано' : 'Сповіщення не надіслано'}</dd><dt>Створено</dt><dd>${fmtDate(o.created_at)}</dd></dl></div>
    </div><div>
      <div class="card"><h2>Обробка</h2><div class="rows">
        ${field('Статус', 'status', o.status, { type: 'select', options: Object.entries(STATUS) })}
        ${field('Номер ТТН', 'ttn', o.ttn, { ph: '20450000000000' })}
        ${field('Нотатка менеджера', 'admin_note', o.admin_note, { type: 'textarea', rows: 5, hint: 'Бачите лише ви' })}
      </div>
      <div class="toolbar" style="margin-top:12px">${tel ? `<a class="btn ghost sm" href="tel:${esc(tel)}">Подзвонити</a><a class="btn ghost sm" href="viber://chat?number=${esc(encodeURIComponent(tel))}">Viber</a>` : ''}</div></div>
    </div></div>
    <div class="savebar"><button class="btn">Зберегти</button><span class="grow"></span><button type="button" class="btn danger" data-del>Видалити замовлення</button></div></form>`;
    const form = $('#ord'); watchDirty(form);
    const tbl = $('#items');
    const recalc = () => {
      let t = 0;
      $$('tr[data-i]', tbl).forEach((tr) => { const s = (+$('[name=qty]', tr).value || 0) * (+$('[name=price]', tr).value || 0); t += s; $('[data-sum]', tr).textContent = money(s); });
      $('#total').textContent = money(t);
    };
    tbl.addEventListener('input', recalc);
    tbl.addEventListener('click', (e) => { if (e.target.closest('[data-rm]')) { e.target.closest('tr').remove(); recalc(); dirty = true; } });
    $('[data-add]', form).addEventListener('click', () => { tbl.insertAdjacentHTML('beforeend', itemRow({ sku: '', title: '', opt: '', qty: 1, price: 0 }, Date.now())); });
    $('[data-del]', form).addEventListener('click', async () => {
      if (!confirm('Видалити замовлення назавжди?')) return;
      try { await api('DELETE', 'orders/' + encodeURIComponent(id)); toast('Видалено'); refreshBadge(); go('#/orders'); } catch (e) { fail(e); }
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = formData(form);
      const items = $$('tr[data-i]', tbl).map((tr) => ({ sku: $('[name=sku]', tr).value, title: $('[name=title]', tr).value, opt: $('[name=opt]', tr).value, qty: +$('[name=qty]', tr).value, price: +$('[name=price]', tr).value }));
      try {
        await api('PATCH', 'orders/' + encodeURIComponent(id), {
          status: f.status, ttn: f.ttn, admin_note: f.admin_note, name: f.name, phone: f.phone, email: f.email, items,
          delivery: { method: f.d_method, city: f.d_city, branch: f.d_branch, address: f.d_address },
        });
        dirty = false; toast('Збережено'); refreshBadge(); orderEdit(id);
      } catch (ex) { fail(ex); }
    });
  }

  // =====================================================================
  // Товари
  async function products(_, q) {
    const cats = await ref('categories', true);
    const cat = q.get('category') || '', search = q.get('q') || '', state = q.get('state') || '';
    const list = await api('GET', 'products?' + new URLSearchParams({ category: cat, q: search, state }));
    const catName = Object.fromEntries(cats.map((c) => [c.id, c.name]));
    view.innerHTML = `<div class="head"><h1>Товари</h1><a class="btn" href="#/products/new">+ Додати товар</a></div>
    <form class="toolbar" id="pf"><input type="search" name="q" value="${esc(search)}" placeholder="Назва або артикул">
    <select name="category"><option value="">Усі категорії</option>${cats.map((c) => `<option value="${c.id}" ${String(c.id) === cat ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
    <select name="state"><option value="">Усі</option><option value="hidden" ${state === 'hidden' ? 'selected' : ''}>Приховані</option><option value="nophoto" ${state === 'nophoto' ? 'selected' : ''}>Без фото</option></select>
    <button class="btn ghost">Знайти</button><span class="muted">${list.length} товарів</span></form>
    <div class="toolbar" id="bulk" hidden><b id="bn"></b>
      <button type="button" class="btn ghost sm" data-b="show">Показати на сайті</button><button type="button" class="btn ghost sm" data-b="hide">Приховати</button>
      <select id="bcat"><option value="">Перенести в категорію…</option>${cats.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
      <button type="button" class="btn ghost sm" data-b="price">Змінити ціни на %</button><button type="button" class="btn danger sm" data-b="delete">Видалити</button></div>
    ${list.length ? `<div class="tbl-wrap"><table class="tbl"><tr><th><input type="checkbox" id="all" aria-label="Обрати всі"></th><th></th><th>Назва</th><th>Категорія</th><th class="num">Варіантів</th><th class="num">Ціна</th><th>Позначки</th></tr>
    ${list.map((p) => `<tr class="click${p.active ? '' : ' off'}" data-href="#/products/${p.id}"><td><input type="checkbox" data-id="${p.id}" aria-label="Обрати"></td>
      <td>${p.cover ? `<img class="th" src="${esc(p.cover)}" alt="" loading="lazy">` : '<span class="pill">без фото</span>'}</td>
      <td><b>${esc(p.title)}</b><br><small class="muted">/tovar/${esc(p.slug)}.html</small></td><td>${esc(catName[p.category_id] || '—')}</td>
      <td class="num">${p.variants}</td><td class="num">${p.min === p.max ? money(p.min) : money(p.min) + ' – ' + money(p.max)}</td>
      <td>${p.active ? '' : '<span class="pill">приховано</span> '}${p.is_new ? '<span class="pill st-done">новинка</span> ' : ''}${p.is_hit ? '<span class="pill st-shipped">хіт</span>' : ''}</td></tr>`).join('')}</table></div>` : '<div class="card empty">Нічого не знайдено</div>'}`;
    $('#pf').addEventListener('submit', (e) => { e.preventDefault(); go('#/products?' + new URLSearchParams(formData(e.target))); });
    $('#pf').addEventListener('change', (e) => { if (e.target.tagName === 'SELECT') $('#pf').requestSubmit(); });
    clickRows(view);
    const sel = () => $$('[data-id]:checked').map((x) => +x.dataset.id);
    const upd = () => { const n = sel().length; $('#bulk').hidden = !n; $('#bn').textContent = 'Обрано: ' + n; };
    view.addEventListener('change', (e) => { if (e.target.id === 'all') $$('[data-id]').forEach((x) => { x.checked = e.target.checked; }); if (e.target.matches('[data-id],#all')) upd(); });
    const bulk = async (body, msg) => { try { await api('POST', 'products/bulk', { ids: sel(), ...body }); toast(msg); products(_, q); } catch (e) { fail(e); } };
    $$('[data-b]').forEach((b) => b.addEventListener('click', () => {
      const a = b.dataset.b;
      if (a === 'price') { const p = prompt('На скільки відсотків змінити ціни? Наприклад 10 (дорожче) або -15 (дешевше)'); if (p && !isNaN(+p)) bulk({ action: 'price', percent: +p }, 'Ціни оновлено'); return; }
      if (a === 'delete' && !confirm(`Видалити ${sel().length} товарів назавжди?`)) return;
      bulk({ action: a }, 'Готово');
    }));
    const bc = $('#bcat'); if (bc) bc.addEventListener('change', () => { if (bc.value) bulk({ action: 'move', category_id: +bc.value }, 'Перенесено'); });
  }

  async function productEdit(id) {
    const isNew = id === 'new';
    const [cats, attrs, p] = await Promise.all([ref('categories'), ref('attributes', true),
      isNew ? Promise.resolve({ title: '', slug: '', category_id: '', active: 1, features: [], variants: [{ sku: '', price: 0, old_price: 0, options: {}, image: '', size: '', in_stock: 1 }], attrs: {}, description: '', sort: 0 }) : api('GET', 'products/' + id)]);
    let optNames = [];
    p.variants.forEach((v) => Object.keys(v.options).forEach((k) => { if (!optNames.includes(k)) optNames.push(k); }));
    const attrInput = (a) => {
      const v = p.attrs[a.id] || '';
      const lab = esc(a.name) + (a.unit ? ` <small>(${esc(a.unit)})</small>` : '');
      if (a.type === 'select') return `<label>${lab}<select name="attr_${a.id}"><option value=""></option>${a.options.map((o) => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}${v && !a.options.includes(v) ? `<option selected>${esc(v)}</option>` : ''}</select></label>`;
      return `<label>${lab}<input name="attr_${a.id}" value="${esc(v)}" ${a.type === 'number' ? 'inputmode="decimal"' : ''}></label>`;
    };
    view.innerHTML = `<div class="head"><a href="#/products" class="btn ghost sm">← Товари</a><h1>${isNew ? 'Новий товар' : esc(p.title)}</h1>${isNew ? '' : `<a class="btn ghost sm" href="/tovar/${esc(p.slug)}.html" target="_blank" rel="noopener">На сайті ↗</a>`}</div>
    <form id="pe"><div class="cols"><div>
      <div class="card"><div class="grid2">
        ${field('Назва', 'title', p.title, { span: true })}
        ${field('Адреса сторінки (slug)', 'slug', p.slug, { hint: 'латиницею; порожньо — створиться з назви', ph: 'krislo-naduvne' })}
        ${field('Категорія', 'category_id', p.category_id, { type: 'select', options: [['', '— оберіть —'], ...cats.map((c) => [c.id, c.name])] })}
        ${field('Примітка до ціни', 'price_note', p.price_note, { span: true, ph: 'Напр.: ціна залежить від розміру' })}
        ${field('Акція / подарунок', 'gift', p.gift, { span: true, ph: 'Напр.: насос у подарунок' })}
      </div></div>
      <div class="card"><h2>Варіанти (артикули)</h2>
        <p class="hint">Опції — це те, що покупець обирає на сторінці товару (Колір, Розмір, Дизайн…). Кожен рядок — окремий артикул зі своєю ціною і фото.</p>
        <div class="toolbar"><span>Опції:</span><span class="chips" id="optnames"></span><button type="button" class="btn ghost sm" id="addopt">+ Опція</button></div>
        <div class="tbl-wrap"><table class="tbl edit" id="vt"></table></div>
        <div class="toolbar" style="margin-top:10px"><button type="button" class="btn ghost sm" id="addv">+ Варіант</button><button type="button" class="btn ghost sm" id="dupv">Копіювати останній</button>
        <button type="button" class="btn ghost sm" id="allprice">Одна ціна для всіх</button></div></div>
      <div class="card"><h2>Опис</h2><p class="hint">Порожній опис — сайт складе стандартний текст з назви та категорії.</p>${rte('description', p.description)}
        <label style="margin-top:12px">Переваги <small>(кожна з нового рядка — список з галочками)</small><textarea name="features" rows="6">${esc((p.features || []).join('\n'))}</textarea></label></div>
      <div class="card"><h2>Характеристики</h2>${attrs.length ? `<div class="grid2">${attrs.map(attrInput).join('')}</div>` : ''}<p class="hint">Список характеристик налаштовується в розділі <a href="#/attributes">Характеристики</a>.</p></div>
      <div class="card"><h2>SEO</h2><div class="grid2">${field('Заголовок сторінки (title)', 'seo_title', p.seo_title, { span: true, hint: 'порожньо — автоматично' })}${field('Опис для Google (description)', 'seo_desc', p.seo_desc, { type: 'textarea', span: true, rows: 2 })}</div></div>
    </div><div>
      <div class="card"><h2>Показ</h2><div class="rows">${field('Показувати на сайті', 'active', p.active, { type: 'checkbox' })}${field('Новинка', 'is_new', p.is_new, { type: 'checkbox' })}${field('Хіт продажів (на головній)', 'is_hit', p.is_hit, { type: 'checkbox' })}
        ${field('Порядок у категорії', 'sort', p.sort, { type: 'number', hint: 'менше число — вище' })}</div></div>
      <div class="card"><h2>Головне фото</h2><p class="hint">Порожньо — береться фото першого варіанту.</p>${imgPick('image', p.image)}</div>
    </div></div>
    <div class="savebar"><button class="btn">Зберегти</button>${isNew ? '' : '<button type="button" class="btn ghost" id="copy">Створити копію</button>'}<span class="grow"></span>${isNew ? '' : '<button type="button" class="btn danger" id="del">Видалити товар</button>'}</div></form>`;
    const form = $('#pe'); watchDirty(form); bindRte(form); bindImgPicks(form);
    const vt = $('#vt');
    const readVariants = () => $$('tr[data-v]', vt).map((tr) => {
      const options = {};
      optNames.forEach((n, i) => { const x = $(`[data-o="${i}"]`, tr).value.trim(); if (x) options[n] = x; });
      return { sku: $('[name=v_sku]', tr).value.trim(), price: +$('[name=v_price]', tr).value || 0, old_price: +$('[name=v_old]', tr).value || 0, size: $('[name=v_size]', tr).value, image: $('[name=v_img]', tr).value, in_stock: $('[name=v_stock]', tr).checked ? 1 : 0, options };
    });
    function drawVariants(vs) {
      $('#optnames').innerHTML = optNames.map((n, i) => `<span class="chip">${esc(n)}<button type="button" data-ren="${i}" title="Перейменувати">✎</button><button type="button" data-delopt="${i}" title="Прибрати опцію">×</button></span>`).join('') || '<span class="muted">немає (один варіант)</span>';
      vt.innerHTML = `<tr><th>Артикул</th>${optNames.map((n) => `<th>${esc(n)}</th>`).join('')}<th>Ціна, ₴</th><th>Стара ціна</th><th>Розмір</th><th>Фото</th><th title="В наявності">Є</th><th></th></tr>` +
        vs.map((v, i) => `<tr data-v="${i}"><td><input name="v_sku" value="${esc(v.sku)}" style="width:130px" required></td>
        ${optNames.map((n, j) => `<td><input data-o="${j}" value="${esc(v.options[n] || '')}" list="dl-${j}" style="min-width:110px"></td>`).join('')}
        <td><input name="v_price" type="number" min="0" step="0.01" value="${v.price}" style="width:90px"></td><td><input name="v_old" type="number" min="0" step="0.01" value="${v.old_price || ''}" style="width:90px" placeholder="—"></td>
        <td><input name="v_size" value="${esc(v.size)}" style="width:110px"></td><td>${imgPick('v_img', v.image, true)}</td>
        <td><input type="checkbox" name="v_stock" ${v.in_stock ? 'checked' : ''}></td>
        <td style="white-space:nowrap"><button type="button" class="icon" data-up="${i}" title="Вище">↑</button><button type="button" class="icon" data-rmv="${i}" title="Видалити">×</button></td></tr>`).join('') +
        optNames.map((n, j) => `<datalist id="dl-${j}">${[...new Set(vs.map((v) => v.options[n]).filter(Boolean))].map((x) => `<option value="${esc(x)}">`).join('')}</datalist>`).join('');
    }
    drawVariants(p.variants);
    $('#addopt').addEventListener('click', () => { const n = (prompt('Назва опції, напр. Колір, Розмір, Дизайн') || '').trim(); if (n && !optNames.includes(n)) { const vs = readVariants(); optNames.push(n); drawVariants(vs); dirty = true; } });
    $('#optnames').addEventListener('click', (e) => {
      const r = e.target.closest('[data-ren]'), d = e.target.closest('[data-delopt]');
      const vs = readVariants();
      if (r) { const i = +r.dataset.ren; const n = (prompt('Нова назва опції', optNames[i]) || '').trim(); if (n && !optNames.includes(n)) { vs.forEach((v) => { if (optNames[i] in v.options) { v.options[n] = v.options[optNames[i]]; delete v.options[optNames[i]]; } }); optNames[i] = n; } }
      if (d) { const i = +d.dataset.delopt; if (!confirm(`Прибрати опцію «${optNames[i]}» з усіх варіантів?`)) return; vs.forEach((v) => delete v.options[optNames[i]]); optNames.splice(i, 1); }
      if (r || d) { drawVariants(vs); dirty = true; }
    });
    vt.addEventListener('click', (e) => {
      const up = e.target.closest('[data-up]'), rm = e.target.closest('[data-rmv]');
      if (!up && !rm) return;
      const vs = readVariants();
      if (rm) { if (vs.length < 2) return toast('Має лишитися хоча б один варіант', true); vs.splice(+rm.dataset.rmv, 1); }
      if (up) { const i = +up.dataset.up; if (i > 0) [vs[i - 1], vs[i]] = [vs[i], vs[i - 1]]; }
      drawVariants(vs); dirty = true;
    });
    $('#addv').addEventListener('click', () => { const vs = readVariants(); vs.push({ sku: '', price: vs.length ? vs[vs.length - 1].price : 0, old_price: 0, options: {}, image: '', size: '', in_stock: 1 }); drawVariants(vs); dirty = true; });
    $('#dupv').addEventListener('click', () => { const vs = readVariants(); const l = vs[vs.length - 1]; vs.push({ ...l, sku: '', options: { ...l.options } }); drawVariants(vs); dirty = true; });
    $('#allprice').addEventListener('click', () => { const x = prompt('Ціна для всіх варіантів, ₴'); if (x && !isNaN(+x)) { $$('[name=v_price]', vt).forEach((i) => { i.value = +x; }); dirty = true; } });
    const titleIn = $('[name=title]', form), slugIn = $('[name=slug]', form);
    if (isNew) titleIn.addEventListener('input', () => { if (!slugIn.dataset.touched) slugIn.value = slugify(titleIn.value); });
    slugIn.addEventListener('input', () => { slugIn.dataset.touched = '1'; });
    const collect = () => {
      const f = formData(form);
      const attrsOut = {};
      attrs.forEach((a) => { attrsOut[a.id] = f['attr_' + a.id] || ''; });
      return { title: f.title, slug: f.slug, category_id: +f.category_id, price_note: f.price_note, gift: f.gift, description: rteValue(form, 'description'),
        features: f.features.split('\n'), seo_title: f.seo_title, seo_desc: f.seo_desc, active: f.active, is_new: f.is_new, is_hit: f.is_hit, sort: +f.sort || 0,
        image: f.image, variants: readVariants(), attrs: attrsOut };
    };
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const r = await api(isNew ? 'POST' : 'PUT', isNew ? 'products' : 'products/' + id, collect());
        dirty = false; toast('Збережено'); if (isNew) go('#/products/' + r.id); else productEdit(id);
      } catch (ex) { fail(ex); }
    });
    if (!isNew) {
      $('#del').addEventListener('click', async () => { if (!confirm('Видалити товар назавжди?')) return; try { await api('DELETE', 'products/' + id); toast('Видалено'); go('#/products'); } catch (e) { fail(e); } });
      $('#copy').addEventListener('click', async () => {
        const d = collect(); d.title += ' (копія)'; d.slug = ''; d.active = false;
        d.variants = d.variants.map((v) => ({ ...v, sku: v.sku + '-copy' }));
        try { const r = await api('POST', 'products', d); toast('Копію створено (прихована). Змініть артикули.'); go('#/products/' + r.id); } catch (e) { fail(e); }
      });
    }
  }

  // =====================================================================
  // Категорії, групи та фільтри
  async function categories() {
    const [cats, groups] = await Promise.all([ref('categories', true), ref('groups', true)]);
    const gName = Object.fromEntries(groups.map((g) => [g.id, g.name]));
    view.innerHTML = `<div class="head"><h1>Категорії і фільтри</h1><a class="btn" href="#/categories/new">+ Додати категорію</a></div>
    <div class="cols"><div><div class="tbl-wrap"><table class="tbl"><tr><th>Назва</th><th>Розділ</th><th class="num">Товарів</th><th class="num">Порядок</th><th></th></tr>
    ${cats.map((c) => `<tr class="click${c.active ? '' : ' off'}" data-href="#/categories/${c.id}"><td><b>${esc(c.name)}</b><br><small class="muted">/kategoriya/${esc(c.slug)}.html</small></td>
      <td>${esc(gName[c.group_id] || '—')}</td><td class="num"><a href="#/products?category=${c.id}">${c.products}</a></td><td class="num">${c.sort}</td><td>${c.active ? '' : '<span class="pill">приховано</span>'}</td></tr>`).join('')}</table></div>
    <p class="hint">Порядок категорій у меню сайту — за полем «Порядок». Фільтри для кожної категорії налаштовуються всередині категорії.</p></div>
    <div class="card"><h2>Розділи головної</h2><p class="hint">Групи категорій, які показуються блоками на головній сторінці.</p>
      <div class="rows" id="groups">${groups.map((g) => `<div class="row" data-g="${g.id}"><input value="${esc(g.name)}" data-gn><input type="number" value="${g.sort}" data-gs class="fixed" style="width:64px" title="Порядок"><button type="button" class="icon" data-gsave title="Зберегти">✓</button><button type="button" class="icon" data-gdel title="Видалити">×</button></div>`).join('')}</div>
      <div class="row" style="margin-top:8px"><input id="gnew" placeholder="Новий розділ"><button type="button" class="btn ghost sm" id="gadd">Додати</button></div></div></div>`;
    clickRows(view);
    $('#gadd').addEventListener('click', async () => { const n = $('#gnew').value.trim(); if (!n) return; try { await api('POST', 'groups', { name: n, sort: groups.length }); drop('groups'); categories(); } catch (e) { fail(e); } });
    $('#groups').addEventListener('click', async (e) => {
      const row = e.target.closest('[data-g]'); if (!row) return; const gid = row.dataset.g;
      try {
        if (e.target.closest('[data-gsave]')) { await api('PUT', 'groups/' + gid, { name: $('[data-gn]', row).value, sort: +$('[data-gs]', row).value }); toast('Збережено'); drop('groups'); }
        if (e.target.closest('[data-gdel]') && confirm('Видалити розділ? Категорії залишаться, але без розділу.')) { await api('DELETE', 'groups/' + gid); drop('groups'); categories(); }
      } catch (ex) { fail(ex); }
    });
  }

  async function categoryEdit(id) {
    const isNew = id === 'new';
    const [groups, attrs, options, c] = await Promise.all([ref('groups'), ref('attributes', true), ref('options', true),
      isNew ? Promise.resolve({ name: '', slug: '', group_id: '', blurb: '', description: '', image: '', active: 1, sort: 0, filters: [{ kind: 'price', key: '', label: 'Ціна' }] }) : api('GET', 'categories/' + id)]);
    const keyOptions = (kind, key) => {
      if (kind === 'option') return Object.keys(options).map((o) => [o, o]);
      if (kind === 'attr') return attrs.map((a) => [String(a.id), a.name]);
      if (kind === 'flag') return Object.entries(FLAGS);
      return [];
    };
    const fRow = (f) => {
      const ko = keyOptions(f.kind);
      return `<div class="row" data-f><select data-k class="fixed" style="width:170px"><option value="price" ${f.kind === 'price' ? 'selected' : ''}>Ціна (від–до)</option><option value="option" ${f.kind === 'option' ? 'selected' : ''}>Опція варіанту</option><option value="attr" ${f.kind === 'attr' ? 'selected' : ''}>Характеристика</option><option value="flag" ${f.kind === 'flag' ? 'selected' : ''}>Позначка</option></select>
      <select data-key ${f.kind === 'price' ? 'hidden' : ''}>${ko.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(f.key) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
      <input data-label value="${esc(f.label)}" placeholder="Підпис на сайті"><button type="button" class="icon" data-fup title="Вище">↑</button><button type="button" class="icon" data-fdel title="Прибрати">×</button></div>`;
    };
    view.innerHTML = `<div class="head"><a href="#/categories" class="btn ghost sm">← Категорії</a><h1>${isNew ? 'Нова категорія' : esc(c.name)}</h1>${isNew ? '' : `<a class="btn ghost sm" href="/kategoriya/${esc(c.slug)}.html" target="_blank" rel="noopener">На сайті ↗</a>`}</div>
    <form id="ce"><div class="cols"><div>
      <div class="card"><div class="grid2">${field('Назва', 'name', c.name)}${field('Адреса (slug)', 'slug', c.slug, { hint: 'латиницею; порожньо — з назви' })}
        ${field('Розділ головної', 'group_id', c.group_id || '', { type: 'select', options: [['', '— без розділу —'], ...groups.map((g) => [g.id, g.name])] })}
        ${field('Порядок у меню', 'sort', c.sort, { type: 'number' })}
        ${field('Короткий опис (під заголовком)', 'blurb', c.blurb, { type: 'textarea', span: true, rows: 2 })}</div></div>
      <div class="card"><h2>Фільтри на сторінці категорії</h2>
        <p class="hint">Покупець бачить фільтри збоку від товарів. «Опція варіанту» — Колір/Розмір/Дизайн з варіантів; «Характеристика» — з розділу Характеристики; «Позначка» — з подарунком, новинка, знижка, в наявності. Фільтр без різних значень на сайті не показується.</p>
        <div class="rows" id="flts">${(c.filters || []).map(fRow).join('')}</div>
        <button type="button" class="btn ghost sm" id="addf" style="margin-top:8px">+ Фільтр</button></div>
      <div class="card"><h2>Текст під товарами</h2><p class="hint">SEO-текст унизу сторінки категорії. Можна лишити порожнім.</p>${rte('description', c.description)}</div>
      <div class="card"><h2>SEO</h2><div class="grid2">${field('Заголовок сторінки (title)', 'seo_title', c.seo_title, { span: true, hint: 'порожньо — автоматично' })}${field('Опис для Google', 'seo_desc', c.seo_desc, { type: 'textarea', span: true, rows: 2 })}</div></div>
    </div><div>
      <div class="card"><h2>Показ</h2>${field('Показувати на сайті', 'active', c.active, { type: 'checkbox' })}</div>
      <div class="card"><h2>Фото плитки</h2><p class="hint">Для плитки на головній. Порожньо — фото першого товару.</p>${imgPick('image', c.image)}</div>
    </div></div>
    <div class="savebar"><button class="btn">Зберегти</button><span class="grow"></span>${isNew ? '' : '<button type="button" class="btn danger" id="del">Видалити категорію</button>'}</div></form>`;
    const form = $('#ce'); watchDirty(form); bindRte(form); bindImgPicks(form);
    const flts = $('#flts');
    $('#addf').addEventListener('click', () => { flts.insertAdjacentHTML('beforeend', fRow({ kind: 'option', key: Object.keys(options)[0] || '', label: Object.keys(options)[0] || '' })); dirty = true; });
    flts.addEventListener('change', (e) => {
      const row = e.target.closest('[data-f]');
      if (e.target.matches('[data-k]')) {
        const kind = e.target.value, ko = keyOptions(kind), ks = $('[data-key]', row);
        ks.hidden = kind === 'price'; ks.innerHTML = ko.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('');
        $('[data-label]', row).value = kind === 'price' ? 'Ціна' : (ko[0] ? ko[0][1] : '');
      } else if (e.target.matches('[data-key]')) $('[data-label]', row).value = e.target.selectedOptions[0].textContent;
    });
    flts.addEventListener('click', (e) => {
      const row = e.target.closest('[data-f]'); if (!row) return;
      if (e.target.closest('[data-fdel]')) { row.remove(); dirty = true; }
      if (e.target.closest('[data-fup]') && row.previousElementSibling) { flts.insertBefore(row, row.previousElementSibling); dirty = true; }
    });
    const nameIn = $('[name=name]', form), slugIn = $('[name=slug]', form);
    if (isNew) nameIn.addEventListener('input', () => { if (!slugIn.dataset.touched) slugIn.value = slugify(nameIn.value); });
    slugIn.addEventListener('input', () => { slugIn.dataset.touched = '1'; });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = formData(form);
      const filters = $$('[data-f]', flts).map((r) => ({ kind: $('[data-k]', r).value, key: $('[data-k]', r).value === 'price' ? '' : $('[data-key]', r).value, label: $('[data-label]', r).value }));
      try {
        const r = await api(isNew ? 'POST' : 'PUT', isNew ? 'categories' : 'categories/' + id, { ...f, group_id: f.group_id ? +f.group_id : null, sort: +f.sort || 0, description: rteValue(form, 'description'), filters });
        dirty = false; drop('categories'); toast('Збережено'); if (isNew) go('#/categories/' + r.id); else categoryEdit(id);
      } catch (ex) { fail(ex); }
    });
    if (!isNew) $('#del').addEventListener('click', async () => { if (!confirm('Видалити категорію?')) return; try { await api('DELETE', 'categories/' + id); drop('categories'); toast('Видалено'); go('#/categories'); } catch (e) { fail(e); } });
  }

  // =====================================================================
  // Характеристики (+ кольори опцій)
  async function attributes() {
    const [list, options, st] = await Promise.all([ref('attributes', true), ref('options', true), api('GET', 'settings')]);
    const colors = st.colors || {};
    const TYPES = [['text', 'Текст'], ['number', 'Число'], ['select', 'Список значень']];
    const card = (a) => `<div class="card" data-a="${a.id || ''}"><div class="grid4">
      <label>Назва<input data-n value="${esc(a.name)}" placeholder="Напр. Матеріал"></label><label>Одиниця<input data-u value="${esc(a.unit)}" placeholder="мм, кг…"></label>
      <label>Тип<select data-t>${TYPES.map(([v, l]) => `<option value="${v}" ${a.type === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label>Порядок<input data-s type="number" value="${a.sort || 0}"></label>
      <label class="span2" ${a.type === 'select' ? '' : 'hidden'} data-optbox>Можливі значення <small>(кожне з нового рядка)</small><textarea data-o rows="3">${esc((a.options || []).join('\n'))}</textarea></label></div>
      <div class="toolbar" style="margin:10px 0 0"><button type="button" class="btn sm" data-save>Зберегти</button>${a.id ? `<span class="muted">заповнено в ${a.used} товарах</span><span class="grow"></span><button type="button" class="btn danger sm" data-del>Видалити</button>` : ''}</div></div>`;
    const colorNames = [...new Set([...Object.keys(colors), ...(options['Колір'] || [])])];
    view.innerHTML = `<div class="head"><h1>Характеристики</h1><button type="button" class="btn" id="adda">+ Додати характеристику</button></div>
    <p class="hint">Характеристики показуються в таблиці на сторінці товару і можуть бути фільтрами в категоріях. Значення для кожного товару заповнюються в картці товару.</p>
    <div id="alist">${list.map(card).join('')}</div>
    <div class="card"><h2>Опції варіантів</h2><p class="hint">Це назви, за якими покупець обирає варіант товару. Їх задають у картці товару.</p>
      <div class="chips">${Object.entries(options).map(([k, v]) => `<span class="chip" style="padding-right:10px">${esc(k)} <small class="muted">${v.length} знач.</small></span>`).join('')}</div></div>
    <div class="card"><h2>Кольори</h2><p class="hint">Відтінок кружечка для кольору на сторінці товару та у фільтрі.</p>
      <div class="rows" id="colors">${colorNames.map((n) => `<div class="row"><input value="${esc(n)}" data-cn><input type="color" value="${esc(colors[n] || '#999999')}" data-cv class="fixed"><button type="button" class="icon" data-cdel>×</button></div>`).join('')}</div>
      <div class="toolbar" style="margin-top:8px"><button type="button" class="btn ghost sm" id="addc">+ Колір</button><button type="button" class="btn sm" id="savec">Зберегти кольори</button></div></div>`;
    const alist = $('#alist');
    $('#adda').addEventListener('click', () => { alist.insertAdjacentHTML('afterbegin', card({ name: '', unit: '', type: 'text', sort: list.length, options: [] })); $('[data-n]', alist).focus(); });
    alist.addEventListener('change', (e) => { if (e.target.matches('[data-t]')) $('[data-optbox]', e.target.closest('[data-a]')).hidden = e.target.value !== 'select'; });
    alist.addEventListener('click', async (e) => {
      const box = e.target.closest('[data-a]'); if (!box) return; const aid = box.dataset.a;
      try {
        if (e.target.closest('[data-save]')) {
          const body = { name: $('[data-n]', box).value, unit: $('[data-u]', box).value, type: $('[data-t]', box).value, sort: +$('[data-s]', box).value || 0, options: $('[data-o]', box).value.split('\n') };
          await api(aid ? 'PUT' : 'POST', aid ? 'attributes/' + aid : 'attributes', body); toast('Збережено'); drop('attributes'); attributes();
        }
        if (e.target.closest('[data-del]') && confirm('Видалити характеристику? Її значення зникнуть з усіх товарів, а фільтри за нею — з категорій.')) { await api('DELETE', 'attributes/' + aid); drop('attributes'); attributes(); }
      } catch (ex) { fail(ex); }
    });
    const cl = $('#colors');
    $('#addc').addEventListener('click', () => cl.insertAdjacentHTML('beforeend', '<div class="row"><input data-cn placeholder="Назва кольору"><input type="color" value="#999999" data-cv class="fixed"><button type="button" class="icon" data-cdel>×</button></div>'));
    cl.addEventListener('click', (e) => { if (e.target.closest('[data-cdel]')) e.target.closest('.row').remove(); });
    $('#savec').addEventListener('click', async () => {
      const out = {}; $$('.row', cl).forEach((r) => { const n = $('[data-cn]', r).value.trim(); if (n) out[n] = $('[data-cv]', r).value; });
      try { await api('PUT', 'settings', { colors: out }); toast('Кольори збережено'); } catch (e) { fail(e); }
    });
  }

  // =====================================================================
  // Сторінки
  async function pages() {
    const list = await api('GET', 'pages');
    view.innerHTML = `<div class="head"><h1>Сторінки</h1><a class="btn" href="#/pages/new">+ Нова сторінка</a></div>
    <div class="tbl-wrap"><table class="tbl"><tr><th>Сторінка</th><th>Адреса</th><th>Де посилання</th><th></th></tr>
    <tr class="click" data-href="#/pages/home"><td><b>Головна сторінка</b><br><small class="muted">банер, акції, хіти, тексти</small></td><td>/</td><td>—</td><td></td></tr>
    ${list.map((p) => `<tr class="click${p.active ? '' : ' off'}" data-href="#/pages/${p.id}"><td><b>${esc(p.title)}</b></td><td>/${esc(p.slug)}.html</td>
      <td>${[p.in_menu ? 'меню' : '', p.in_footer ? 'підвал' : ''].filter(Boolean).join(', ') || '—'}</td><td>${p.active ? '' : '<span class="pill">приховано</span>'}</td></tr>`).join('')}</table></div>
    <p class="hint">Каталог, категорії, товари та кошик будуються автоматично з товарів. Тексти категорій і товарів редагуються у відповідних розділах.</p>`;
    clickRows(view);
  }

  async function pageEdit(id) {
    const isNew = id === 'new';
    const p = isNew ? { title: '', slug: '', content: '', in_menu: 0, in_footer: 1, active: 1, sort: 0 } : await api('GET', 'pages/' + id);
    view.innerHTML = `<div class="head"><a href="#/pages" class="btn ghost sm">← Сторінки</a><h1>${isNew ? 'Нова сторінка' : esc(p.title)}</h1>${isNew ? '' : `<a class="btn ghost sm" href="/${esc(p.slug)}.html" target="_blank" rel="noopener">На сайті ↗</a>`}</div>
    <form id="pg"><div class="cols"><div>
      <div class="card"><div class="grid2">${field('Заголовок', 'title', p.title)}${field('Адреса (slug)', 'slug', p.slug, { hint: 'сторінка буде на /адреса.html' })}</div></div>
      <div class="card"><h2>Текст сторінки</h2>${rte('content', p.content)}</div>
      <div class="card"><h2>SEO</h2><div class="grid2">${field('Заголовок (title)', 'seo_title', p.seo_title, { span: true, hint: 'порожньо — автоматично' })}${field('Опис для Google', 'seo_desc', p.seo_desc, { type: 'textarea', span: true, rows: 2 })}</div></div>
    </div><div><div class="card"><h2>Показ</h2><div class="rows">${field('Показувати на сайті', 'active', p.active, { type: 'checkbox' })}${field('Посилання у верхньому меню', 'in_menu', p.in_menu, { type: 'checkbox' })}
      ${field('Посилання в підвалі сайту', 'in_footer', p.in_footer, { type: 'checkbox' })}${field('Порядок', 'sort', p.sort, { type: 'number' })}</div></div></div></div>
    <div class="savebar"><button class="btn">Зберегти</button><span class="grow"></span>${isNew ? '' : '<button type="button" class="btn danger" id="del">Видалити сторінку</button>'}</div></form>`;
    const form = $('#pg'); watchDirty(form); bindRte(form);
    const t = $('[name=title]', form), s = $('[name=slug]', form);
    if (isNew) t.addEventListener('input', () => { if (!s.dataset.touched) s.value = slugify(t.value); });
    s.addEventListener('input', () => { s.dataset.touched = '1'; });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = formData(form);
      try { const r = await api(isNew ? 'POST' : 'PUT', isNew ? 'pages' : 'pages/' + id, { ...f, sort: +f.sort || 0, content: rteValue(form, 'content') }); dirty = false; toast('Збережено'); if (isNew) go('#/pages/' + r.id); else pageEdit(id); } catch (ex) { fail(ex); }
    });
    if (!isNew) $('#del').addEventListener('click', async () => { if (!confirm('Видалити сторінку?')) return; try { await api('DELETE', 'pages/' + id); toast('Видалено'); go('#/pages'); } catch (e) { fail(e); } });
  }

  async function homeEdit() {
    const [h, prods] = await Promise.all([api('GET', 'home'), api('GET', 'products')]);
    const hero = h.hero || {};
    const bySlug = Object.fromEntries(prods.map((p) => [p.slug, p]));
    let hits = (h.hits || []).slice();
    const promoRow = (p) => `<div class="card" data-promo style="margin:0"><div class="grid2">${field('Мітка', 'p_tag', p.tag, { ph: '−20% або Подарунок' })}${field('Заголовок', 'p_title', p.title)}
      ${field('Текст', 'p_text', p.text)}${field('Посилання', 'p_url', p.url, { ph: '/kategoriya/...' })}</div><div class="toolbar" style="margin:8px 0 0"><button type="button" class="icon" data-pup>↑ вище</button><button type="button" class="icon" data-pdel>× прибрати</button></div></div>`;
    view.innerHTML = `<div class="head"><a href="#/pages" class="btn ghost sm">← Сторінки</a><h1>Головна сторінка</h1><a class="btn ghost sm" href="/" target="_blank" rel="noopener">На сайті ↗</a></div>
    <form id="hm">
      <div class="card"><h2>Банер</h2><div class="grid2">${field('Надзаголовок', 'eyebrow', hero.eyebrow, { ph: 'Акція місяця' })}${field('Заголовок', 'h_title', hero.title)}
        ${field('Текст', 'h_text', hero.text, { type: 'textarea', span: true })}
        ${field('Кнопка: текст', 'btn_text', hero.btn_text)}${field('Кнопка: посилання', 'btn_url', hero.btn_url)}
        ${field('Друга кнопка: текст', 'btn2_text', hero.btn2_text)}${field('Друга кнопка: посилання', 'btn2_url', hero.btn2_url)}
        <div><label>Фото банера</label>${imgPick('h_image', hero.image)}</div>${field('Посилання з фото', 'image_url', hero.image_url)}${field('Опис фото (alt)', 'image_alt', hero.image_alt, { span: true })}</div></div>
      <div class="card"><h2>Акції</h2>${field('Заголовок блоку', 'promos_title', h.promos_title)}<div class="rows" id="promos" style="margin-top:10px">${(h.promos || []).map(promoRow).join('')}</div>
        <button type="button" class="btn ghost sm" id="addp" style="margin-top:8px">+ Акція</button></div>
      <div class="card"><h2>Хіти продажів</h2>${field('Заголовок блоку', 'hits_title', h.hits_title)}
        <p class="hint">Товари в цьому порядку. Також додаються товари з позначкою «Хіт» у картці товару.</p><div class="rows" id="hits"></div>
        <div class="row" style="margin-top:8px"><input list="prodlist" id="hitadd" placeholder="Почніть вводити назву товару"><button type="button" class="btn ghost sm fixed" id="hitbtn">Додати</button></div>
        <datalist id="prodlist">${prods.map((p) => `<option value="${esc(p.title)}">`).join('')}</datalist></div>
      <div class="card"><h2>Інші блоки</h2><div class="rows">${field('Показувати плитки категорій за розділами', 'show_groups', h.show_groups !== false, { type: 'checkbox' })}
        ${field('Показувати «Новинки»', 'show_new', h.show_new !== false, { type: 'checkbox' })}${field('Заголовок новинок', 'new_title', h.new_title)}</div></div>
      <div class="card"><h2>SEO-текст унизу</h2>${field('Заголовок', 'seo_heading', h.seo_heading)}<div style="margin-top:10px">${rte('seo_text', h.seo_text)}</div></div>
      <div class="card"><h2>SEO</h2><div class="grid2">${field('Заголовок сторінки (title)', 'seo_title', h.seo_title, { span: true })}${field('Опис для Google', 'seo_desc', h.seo_desc, { type: 'textarea', span: true, rows: 2 })}</div></div>
      <div class="savebar"><button class="btn">Зберегти</button></div></form>`;
    const form = $('#hm'); watchDirty(form); bindRte(form); bindImgPicks(form);
    const drawHits = () => {
      $('#hits').innerHTML = hits.map((s, i) => `<div class="row"><span>${bySlug[s] ? esc(bySlug[s].title) : `<span class="err">не знайдено: ${esc(s)}</span>`}</span><button type="button" class="icon" data-hup="${i}">↑</button><button type="button" class="icon" data-hdel="${i}">×</button></div>`).join('') || '<p class="muted">Порожньо</p>';
    };
    drawHits();
    $('#hits').addEventListener('click', (e) => {
      const u = e.target.closest('[data-hup]'), d = e.target.closest('[data-hdel]');
      if (u && +u.dataset.hup > 0) { const i = +u.dataset.hup; [hits[i - 1], hits[i]] = [hits[i], hits[i - 1]]; }
      if (d) hits.splice(+d.dataset.hdel, 1);
      if (u || d) { drawHits(); dirty = true; }
    });
    $('#hitbtn').addEventListener('click', () => {
      const t = $('#hitadd').value.trim(); const p = prods.find((x) => x.title === t);
      if (!p) return toast('Оберіть товар зі списку', true);
      if (!hits.includes(p.slug)) hits.push(p.slug); $('#hitadd').value = ''; drawHits(); dirty = true;
    });
    const pr = $('#promos');
    $('#addp').addEventListener('click', () => { pr.insertAdjacentHTML('beforeend', promoRow({})); dirty = true; });
    pr.addEventListener('click', (e) => {
      const box = e.target.closest('[data-promo]'); if (!box) return;
      if (e.target.closest('[data-pdel]')) { box.remove(); dirty = true; }
      if (e.target.closest('[data-pup]') && box.previousElementSibling) { pr.insertBefore(box, box.previousElementSibling); dirty = true; }
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = formData(form);
      const promos = $$('[data-promo]', pr).map((b) => ({ tag: $('[name=p_tag]', b).value, title: $('[name=p_title]', b).value, text: $('[name=p_text]', b).value, url: $('[name=p_url]', b).value }));
      const body = {
        seo_title: f.seo_title, seo_desc: f.seo_desc, promos_title: f.promos_title, promos, hits_title: f.hits_title, hits,
        show_groups: f.show_groups, show_new: f.show_new, new_title: f.new_title, seo_heading: f.seo_heading, seo_text: rteValue(form, 'seo_text'),
        hero: { eyebrow: f.eyebrow, title: f.h_title, text: f.h_text, btn_text: f.btn_text, btn_url: f.btn_url, btn2_text: f.btn2_text, btn2_url: f.btn2_url, image: f.h_image, image_url: f.image_url, image_alt: f.image_alt },
      };
      try { await api('PUT', 'home', body); dirty = false; toast('Збережено'); } catch (ex) { fail(ex); }
    });
  }

  // =====================================================================
  // Налаштування
  async function settings() {
    const s = await api('GET', 'settings');
    view.innerHTML = `<div class="head"><h1>Налаштування</h1></div>
    <form id="st"><div class="card"><h2>Магазин</h2><div class="grid2">
      ${field('Назва магазину', 'shop_name', s.shop_name)}${field('Адреса сайту', 'site_url', s.site_url, { hint: 'для Google, sitemap і соцмереж' })}
      ${field('Телефон', 'phone', s.phone)}${field('Email', 'email', s.email)}
      ${field('Telegram (номер або логін)', 'telegram', s.telegram)}${field('Viber (номер без +)', 'viber', s.viber)}
      ${field('Місто / регіон', 'city', s.city)}</div></div>
    <div class="card"><h2>Доставка і оплата</h2><div class="grid2">
      ${field('Доставка (коротко)', 'delivery', s.delivery, { span: true })}${field('Оплата (коротко)', 'payment', s.payment, { span: true })}
      ${field('Безкоштовна доставка від, ₴', 'free_ship_from', s.free_ship_from, { hint: 'порожньо — без безкоштовної доставки' })}${field('Адреса самовивозу', 'pickup_address', s.pickup_address)}${field('Час видачі', 'pickup_hours', s.pickup_hours)}</div></div>
    <div class="savebar"><button class="btn">Зберегти</button></div></form>
    <div class="card" style="margin-top:16px"><h2>Сповіщення в Telegram</h2><p class="hint">Надсилає тестове повідомлення на TELEGRAM_CHAT_ID і показує, що відповів Telegram.</p>
      <button type="button" class="btn ghost" id="tgtest">Надіслати тестове повідомлення</button><div id="tgres" style="margin-top:10px"></div></div>
    <div class="card" style="margin-top:16px"><h2>Резервна копія</h2><p class="hint">Усі товари, категорії, сторінки та замовлення одним файлом JSON. Радимо завантажувати раз на тиждень.</p>
      <a class="btn ghost" href="/api/admin/export">Завантажити резервну копію</a></div>`;
    const form = $('#st'); watchDirty(form);
    form.addEventListener('submit', async (e) => { e.preventDefault(); try { await api('PUT', 'settings', formData(form)); dirty = false; toast('Збережено'); } catch (ex) { fail(ex); } });
    $('#tgtest').addEventListener('click', async () => {
      const out = $('#tgres'); out.innerHTML = '<p class="muted">Надсилаємо…</p>';
      try {
        const r = await api('POST', 'telegram-test', {});
        out.innerHTML = (r.bot ? `<p>Бот: <b>${esc(r.bot)}</b></p>` : '') + r.results.map((x) => x.ok
          ? `<p style="color:var(--ok)">✓ Чат ${esc(x.chat)}: повідомлення надіслано</p>`
          : `<p class="err">✗ ${x.chat ? 'Чат ' + esc(x.chat) + ': ' : ''}${esc(x.error)}</p>`).join('') +
          (r.ok ? '' : '<p class="hint">«chat not found» — неправильний TELEGRAM_CHAT_ID або ви ще не натиснули Start у бота. «bot was blocked» — розблокуйте бота. «Unauthorized» — неправильний токен.</p>');
      } catch (ex) { out.innerHTML = `<p class="err">${esc(ex.message)}</p>`; }
    });
  }

  boot();
})();
