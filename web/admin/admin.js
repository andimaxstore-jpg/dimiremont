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
    [/^\/settings$/, settings], [/^\/checkout$/, checkoutEdit], [/^\/notify$/, notifyEdit], [/^\/reviews$/, reviews], [/^\/customers$/, customers], [/^\/customers\/(\d+)$/, customerView],
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
    await loadNames();
    route();
  }

  // Назви способів доставки/оплати — з розділу «Доставка й оплата» (для замовлень і клієнтів).
  async function loadNames() {
    try {
      const c = await api('GET', 'checkout');
      c.delivery.forEach((d) => { DELIV[d.id] = d.title; });
      c.payment.forEach((p) => { PAY[p.id] = p.title; });
    } catch (e) { /* лишаються вбудовані назви */ }
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

  // Клієнти (особисті кабінети)
  async function customers(_, q) {
    const search = q.get('q') || '';
    const d = await api('GET', 'customers?q=' + encodeURIComponent(search));
    view.innerHTML = `<div class="head"><h1>Клієнти</h1><span class="muted">Усього кабінетів: ${d.total}</span></div>
    <p class="hint">Покупці, які створили особистий кабінет на сайті. Паролі зберігаються зашифрованими, їх не бачить ніхто, але ви можете задати клієнту новий пароль.</p>
    <form class="toolbar" id="cf"><input type="search" name="q" value="${esc(search)}" placeholder="Ім’я, телефон або email"><button class="btn ghost">Знайти</button></form>
    ${d.items.length ? `<div class="tbl-wrap"><table class="tbl"><tr><th>Клієнт</th><th>Телефон</th><th>Email</th><th>Зареєстровано</th><th class="num">Замовлень</th><th class="num">Сума покупок</th><th class="num">Збережено</th></tr>
    ${d.items.map((c) => `<tr class="click" data-href="#/customers/${c.id}"><td>${esc([c.last_name, c.first_name].filter(Boolean).join(' '))}</td><td>${esc(c.phone || '')}</td><td>${esc(c.email || '')}</td>
      <td>${fmtDate(c.created_at)}</td><td class="num">${c.orders}</td><td class="num">${money(c.spent)}</td><td class="num">${c.saved}</td></tr>`).join('')}</table></div>` : `<div class="card empty">${search ? 'Нікого не знайдено' : 'Поки ніхто не створив кабінет'}</div>`}`;
    $('#cf').addEventListener('submit', (e) => { e.preventDefault(); go('#/customers?q=' + encodeURIComponent(e.target.q.value.trim())); });
    clickRows(view);
  }

  async function customerView(id) {
    const d = await api('GET', 'customers/' + id);
    const c = d.customer, dv = c.delivery || {};
    const tel = (c.phone || '').replace(/[^+\d]/g, '');
    const ordRows = (list, act) => `<div class="tbl-wrap"><table class="tbl"><tr><th>№</th><th>Дата</th><th class="num">Сума</th><th>Статус</th><th></th></tr>
      ${list.map((o) => `<tr class="click" data-href="#/orders/${esc(o.id)}"><td>${esc(o.id)}</td><td>${fmtDate(o.created_at)}</td><td class="num">${money(o.total)}</td><td>${pill(o.status)}</td>
      <td><button type="button" class="btn ghost sm" data-link="${esc(o.id)}" data-act="${act}">${act === 'link' ? 'Прив’язати' : 'Відв’язати'}</button></td></tr>`).join('')}</table></div>`;
    const delivTxt = !dv.method ? 'Ще не вказано' : dv.method === 'pickup' ? 'Самовивіз'
      : [DELIV[dv.method], dv.city && (dv.city.label || dv.city.name), dv.branch && dv.branch.title, dv.address].filter(Boolean).join(', ');
    view.innerHTML = `<div class="head"><a href="#/customers" class="btn ghost sm">← Клієнти</a><h1>${esc([c.last_name, c.first_name, c.middle_name].filter(Boolean).join(' ') || 'Клієнт')}</h1></div>
    <div class="cols"><div>
      <div class="card"><h2>Замовлення клієнта <span class="muted">${d.orders.length}</span></h2>${d.orders.length ? ordRows(d.orders, 'unlink') : '<p class="muted">Замовлень у кабінеті ще немає.</p>'}</div>
      ${d.unlinked.length ? `<div class="card"><h2>Схожі замовлення без кабінету</h2><p class="hint">Оформлені з тим самим телефоном або email, але без входу в кабінет. Прив’яжіть, якщо це той самий клієнт, і він побачить їх у себе.</p>${ordRows(d.unlinked, 'link')}</div>` : ''}
      <div class="card"><h2>Збережені товари <span class="muted">${d.wishlist.length}</span></h2>${d.wishlist.length ? `<ul>${d.wishlist.map((w) => `<li><a href="/tovar/${esc(w.slug)}.html" target="_blank">${esc(w.title)}</a> <span class="muted">· ${fmtDate(w.created_at)}</span></li>`).join('')}</ul>` : '<p class="muted">Нічого не збережено.</p>'}</div>
    </div><div>
      <form class="card" id="cust"><h2>Особисті дані</h2><div class="rows">
        ${field('Ім’я', 'first_name', c.first_name)}${field('Прізвище', 'last_name', c.last_name)}${field('По батькові', 'middle_name', c.middle_name)}
        ${field('Телефон', 'phone', c.phone, { ph: '+380…' })}${field('Email', 'email', c.email)}
        ${field('Нотатка менеджера', 'admin_note', c.admin_note, { type: 'textarea', rows: 3, hint: 'Бачите лише ви' })}
        ${field('Новий пароль', 'password', '', { hint: 'Заповніть, лише якщо клієнт забув пароль. Повідомте його клієнту.' })}
      </div>
      <dl class="dl" style="margin-top:12px"><dt>Доставка</dt><dd>${esc(delivTxt)}</dd><dt>Зареєстровано</dt><dd>${fmtDate(c.created_at)}</dd><dt>Останній вхід</dt><dd>${c.last_login ? fmtDate(c.last_login) : '—'}</dd></dl>
      <div class="toolbar" style="margin-top:12px"><button class="btn">Зберегти</button>${tel ? `<a class="btn ghost sm" href="tel:${esc(tel)}">Подзвонити</a>` : ''}<span class="grow"></span><button type="button" class="btn danger sm" data-del>Видалити кабінет</button></div></form>
    </div></div>`;
    const form = $('#cust'); watchDirty(form);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = formData(form); if (!f.password) delete f.password;
      try { await api('PATCH', 'customers/' + id, f); dirty = false; toast(f.password ? 'Збережено, пароль змінено' : 'Збережено'); customerView(id); } catch (ex) { fail(ex); }
    });
    $$('[data-link]').forEach((b) => b.addEventListener('click', async () => {
      try { await api('POST', 'customers/' + id + '/link', { order: b.dataset.link, unlink: b.dataset.act === 'unlink' }); toast('Готово'); customerView(id); } catch (ex) { fail(ex); }
    }));
    $('[data-del]', form).addEventListener('click', async () => {
      if (!confirm('Видалити кабінет клієнта? Його замовлення залишаться в розділі «Замовлення».')) return;
      try { await api('DELETE', 'customers/' + id); dirty = false; toast('Кабінет видалено'); go('#/customers'); } catch (ex) { fail(ex); }
    });
    clickRows(view);
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
    ${d.items.map((o) => `<tr class="click" data-href="#/orders/${esc(o.id)}"><td>${esc(o.id)}</td><td>${fmtDate(o.created_at)}</td><td>${esc(o.name)}${o.customer_id ? ' <span title="Має особистий кабінет">👤</span>' : ''}</td><td>${esc(o.phone)}</td>
      <td>${esc(o.delivery.title || DELIV[o.delivery.method] || '')}${o.delivery.city ? ', ' + esc(o.delivery.city.split(',')[0]) : ''}${o.ttn ? `<br><small class="muted">ТТН ${esc(o.ttn)}</small>` : ''}</td>
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
        ${field('Спосіб доставки', 'd_method', d.method, { type: 'select', options: Object.entries(DELIV[d.method] || !d.method ? DELIV : { ...DELIV, [d.method]: d.title || d.method }) })}
        ${field('Місто', 'd_city', d.city)}${field('Відділення', 'd_branch', d.branch)}${field('Адреса (кур’єр)', 'd_address', d.address)}
      </div>
      <dl class="dl" style="margin-top:12px"><dt>Оплата</dt><dd>${esc(d.paymentTitle || PAY[o.payment] || o.payment)}</dd>
      <dt>Дзвінок</dt><dd>${o.call_me ? 'Подзвонити для підтвердження' : 'Просить не дзвонити, якщо все в наявності'}</dd>
      ${o.comment ? `<dt>Коментар</dt><dd>${esc(o.comment)}</dd>` : ''}
      <dt>Кабінет</dt><dd>${o.customer_id ? `<a href="#/customers/${o.customer_id}">Відкрити профіль клієнта</a>` : 'Оформлено без кабінету'}</dd>
      <dt>Telegram</dt><dd>${o.telegram_ok ? 'Сповіщення надіслано' : 'Сповіщення не надіслано'}</dd><dt>Створено</dt><dd>${fmtDate(o.created_at)}</dd></dl></div>
    </div><div>
      <div class="card"><h2>Обробка</h2><div class="rows">
        ${field('Статус', 'status', o.status, { type: 'select', options: Object.entries(STATUS) })}
        ${field('Номер ТТН', 'ttn', o.ttn, { ph: '20450000000000' })}
        ${field('Нотатка менеджера', 'admin_note', o.admin_note, { type: 'textarea', rows: 5, hint: 'Бачите лише ви' })}
      </div>
      <div class="toolbar" style="margin-top:12px">${tel ? `<a class="btn ghost sm" href="tel:${esc(tel)}">Подзвонити</a><a class="btn ghost sm" href="viber://chat?number=${esc(encodeURIComponent(tel))}">Viber</a>` : ''}</div></div>
      ${notifyCard(o)}
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
        const saved = await api('PATCH', 'orders/' + encodeURIComponent(id), {
          status: f.status, ttn: f.ttn, admin_note: f.admin_note, name: f.name, phone: f.phone, email: f.email, items,
          delivery: { method: f.d_method, title: f.d_method === d.method && d.title ? d.title : (DELIV[f.d_method] || f.d_method), city: f.d_city, branch: f.d_branch, address: f.d_address },
        });
        dirty = false; notifyToast(saved.notified, 'Збережено'); refreshBadge(); orderEdit(id);
      } catch (ex) { fail(ex); }
    });
    $$('[data-resend]', view).forEach((b) => b.addEventListener('click', async () => {
      if (dirty && !confirm('Є незбережені зміни в замовленні. Надіслати за збереженими даними?')) return;
      b.disabled = true;
      try { const r = await api('POST', 'orders/' + encodeURIComponent(id) + '/notify', { event: b.dataset.resend }); dirty = false; notifyToast(r.notified, 'Нічого не надіслано'); orderEdit(id); }
      catch (ex) { fail(ex); b.disabled = false; }
    }));
  }

  // ---------- сповіщення покупцю в картці замовлення ----------
  const EV = { accepted: 'Взято в роботу', shipped: 'Відправлено, ТТН' };
  const chLine = (name, x) => !x ? '' : x.ok
    ? `<div style="color:var(--ok)">✓ ${name}: ${esc(x.to || '')}</div>`
    : `<div class="${x.skipped ? 'muted' : 'err'}">${x.skipped ? '–' : '✗'} ${name}: ${esc(x.error || 'не надіслано')}</div>`;
  function notifyCard(o) {
    const log = o.notify || {};
    const rows = Object.keys(EV).map((ev) => {
      const x = log[ev];
      return `<div style="margin-bottom:10px"><b>${EV[ev]}</b>${x ? ` <small class="muted">${fmtDate(x.at)}${x.ttn ? ' · ТТН ' + esc(x.ttn) : ''}</small>` : ' <small class="muted">ще не надсилали</small>'}
        ${x ? chLine('Email', x.email) + chLine('SMS', x.sms) : ''}
        <div style="margin-top:4px"><button type="button" class="btn ghost sm" data-resend="${ev}">${x ? 'Надіслати ще раз' : 'Надіслати зараз'}</button></div></div>`;
    }).join('');
    return `<div class="card no-print"><h2>Сповіщення покупцю</h2>${rows}<p class="hint">Надсилаються самі, коли змінюєте статус або ТТН. Налаштування й тексти: <a href="#/notify">Сповіщення покупцям</a>.</p></div>`;
  }
  function notifyToast(n, fallback) {
    const parts = [], bad = [];
    for (const [ev, x] of Object.entries((n && n.sent) || {})) {
      for (const [ch, name] of [['email', 'email'], ['sms', 'SMS']]) {
        const c = x[ch]; if (!c) continue;
        if (c.ok) parts.push(`${name} «${EV[ev]}» надіслано`); else if (!c.skipped) bad.push(`${name} «${EV[ev]}»: ${c.error}`);
      }
    }
    const notes = (n && n.notes) || [];
    if (bad.length || notes.length) toast([fallback === 'Збережено' ? 'Збережено.' : '', ...parts, ...bad, ...notes].filter(Boolean).join(' · '), true);
    else toast(parts.length ? (fallback === 'Збережено' ? 'Збережено · ' : '') + parts.join(' · ') : fallback, !parts.length && fallback !== 'Збережено');
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
    <div class="card"><h2>Доставка і оплата</h2><p class="hint">Способи доставки й оплати в кошику, адреса самовивозу та безкоштовна доставка тепер у розділі <a href="#/checkout">Доставка й оплата</a>.</p></div>
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

  // =====================================================================
  // Доставка й оплата (кошик)
  const KIND = { np: 'Нова пошта: місто + відділення або поштомат', np_courier: 'Нова пошта: місто + адреса', up: 'Укрпошта: місто + відділення', pickup: 'Самовивіз: адреса магазину',
    address: 'Покупець вказує місто й адресу', none: 'Без адреси (лише ваш текст)' };
  const BUILTIN = ['np', 'np_courier', 'up', 'pickup', 'cod', 'card', 'cash'];
  async function checkoutEdit() {
    const c = await api('GET', 'checkout');
    view.innerHTML = '';
    const root = document.createElement('div'); view.append(root);
    let dl = c.delivery.map((x) => ({ ...x })), pl = c.payment.map((x) => ({ ...x })), tx = { ...c.text };
    const newId = (p) => p + Date.now().toString(36).slice(-6);
    const tools = (kind, i, n, id) => `<span class="grow"></span>
      <button type="button" class="icon" data-mv="${kind}:${i}:-1" title="Вище" ${i ? '' : 'disabled'}>↑</button><button type="button" class="icon" data-mv="${kind}:${i}:1" title="Нижче" ${i < n - 1 ? '' : 'disabled'}>↓</button>
      ${BUILTIN.includes(id) ? '' : `<button type="button" class="icon" data-rm="${kind}:${i}" title="Видалити">×</button>`}`;
    const dCard = (d, i) => `<div class="card co-item${d.active ? '' : ' off'}" data-d="${i}">
      <div class="toolbar" style="margin-bottom:8px"><label class="check"><input type="checkbox" data-k="active" ${d.active ? 'checked' : ''}> <b>${esc(d.title || 'Новий спосіб')}</b></label>
      <span class="pill">${d.active ? 'Увімкнено' : 'Вимкнено'}</span>${tools('d', i, dl.length, d.id)}</div>
      <div class="grid2">
        <label>Назва<input data-k="title" value="${esc(d.title)}"></label>
        <label>Підпис під назвою<small>${d.kind === 'pickup' ? 'порожньо — адреса самовивозу, «безкоштовно»' : 'короткий, в один рядок'}</small><input data-k="subtitle" value="${esc(d.subtitle)}"></label>
        <label class="span2">Інформація, коли обрано<small>Показується покупцю під способами доставки. Порожній рядок — новий абзац.</small><textarea data-k="info" rows="2">${esc(d.info)}</textarea></label>
        ${d.kind === 'pickup' ? `<label>Адреса самовивозу<input data-t="pickup_address" value="${esc(tx.pickup_address)}" placeholder="м. Вишневе, вул. Молодіжна, 1"></label>
        <label>Час видачі<input data-t="pickup_hours" value="${esc(tx.pickup_hours)}"></label>` : ''}
        <label>Вартість у кошику<small>${d.free ? 'покупець бачить «безкоштовно»' : 'напр. «за тарифами перевізника» або «150 ₴»'}</small><input data-k="cost_note" value="${esc(d.cost_note)}" ${d.free ? 'disabled' : ''}></label>
        <div class="rows" style="align-self:end">
          <label class="check"><input type="checkbox" data-k="free" ${d.free ? 'checked' : ''}> Завжди безкоштовно</label>
          <label class="check"><input type="checkbox" data-k="threshold" ${d.threshold && !d.free ? 'checked' : ''} ${d.free ? 'disabled' : ''}> Діє «Безкоштовна доставка від…»</label></div>
        ${BUILTIN.includes(d.id) ? `<p class="hint span2">Поля для покупця: ${esc(KIND[d.kind])}</p>`
          : `<label class="span2">Що просити в покупця<select data-k="kind">${['address', 'none'].map((k) => `<option value="${k}" ${d.kind === k ? 'selected' : ''}>${esc(KIND[k])}</option>`).join('')}</select></label>`}
      </div></div>`;
    const pCard = (p, i) => `<div class="card co-item${p.active ? '' : ' off'}" data-p="${i}">
      <div class="toolbar" style="margin-bottom:8px"><label class="check"><input type="checkbox" data-k="active" ${p.active ? 'checked' : ''}> <b>${esc(p.title || 'Новий спосіб')}</b></label>
      <span class="pill">${p.active ? 'Увімкнено' : 'Вимкнено'}</span>${tools('p', i, pl.length, p.id)}</div>
      <div class="grid2">
        <label>Назва<input data-k="title" value="${esc(p.title)}"></label>
        <label>Підпис під назвою<input data-k="subtitle" value="${esc(p.subtitle)}"></label>
        <label class="span2">Інформація, коли обрано<small>Напр. реквізити або умови передоплати. Порожній рядок — новий абзац.</small><textarea data-k="info" rows="2">${esc(p.info)}</textarea></label>
        <div class="span2"><span class="hint">Доступно для доставки:</span><div class="checks" style="margin-top:4px">${dl.map((d) => `<label class="check"><input type="checkbox" data-for="${esc(d.id)}" ${!(p.for || []).length || p.for.includes(d.id) ? 'checked' : ''}> ${esc(d.title)}</label>`).join('')}</div></div>
      </div></div>`;
    function read() {
      $$('[data-d]', root).forEach((el) => { const d = dl[+el.dataset.d]; $$('[data-k]', el).forEach((x) => { d[x.dataset.k] = x.type === 'checkbox' ? x.checked : x.value; }); });
      $$('[data-p]', root).forEach((el) => { const p = pl[+el.dataset.p]; $$('[data-k]', el).forEach((x) => { p[x.dataset.k] = x.type === 'checkbox' ? x.checked : x.value; });
        const all = $$('[data-for]', el); const on = all.filter((x) => x.checked).map((x) => x.dataset.for); p.for = on.length === all.length ? [] : on; });
      $$('[data-t]', root).forEach((x) => { tx[x.dataset.t] = x.value; });
    }
    function draw() {
      root.innerHTML = `<div class="head"><h1>Доставка й оплата</h1><a class="btn ghost sm" href="/koshyk.html" target="_blank" rel="noopener">Відкрити кошик ↗</a></div>
      <p class="hint" style="margin:-8px 0 16px">Що бачить покупець у кошику. Вимкнений спосіб зникає з сайту, але старі замовлення з ним лишаються.</p>
      <div class="card"><div class="grid2">
        <label>Безкоштовна доставка від, ₴<small>порожньо — без безкоштовної доставки. Діє для способів з позначкою нижче.</small><input data-t="free_ship_from" inputmode="numeric" value="${esc(tx.free_ship_from)}"></label>
        <span></span>
        <label>Доставка (коротко)<small>у підвалі сайту й на сторінці товару</small><input data-t="delivery" value="${esc(tx.delivery)}"></label>
        <label>Оплата (коротко)<small>на сторінці товару</small><input data-t="payment" value="${esc(tx.payment)}"></label></div></div>
      <h2 style="margin:20px 0 10px">Способи доставки</h2>${dl.map(dCard).join('')}
      <button type="button" class="btn ghost" data-add="d">+ Додати спосіб доставки</button>
      <h2 style="margin:24px 0 10px">Способи оплати</h2>${pl.map(pCard).join('')}
      <button type="button" class="btn ghost" data-add="p">+ Додати спосіб оплати</button>
      <div class="savebar" style="margin-top:20px"><button type="button" class="btn" data-save>Зберегти</button><span class="hint">Зміни з’являться в кошику одразу після збереження.</span></div>`;
    }
    draw();
    root.addEventListener('input', () => { dirty = true; });
    root.addEventListener('change', (e) => {
      dirty = true;
      const k = e.target.dataset && e.target.dataset.k;
      if (k === 'active' || k === 'free' || k === 'kind') { read(); draw(); }
    });
    root.addEventListener('click', async (e) => {
      const mv = e.target.closest('[data-mv]'), rm = e.target.closest('[data-rm]'), add = e.target.closest('[data-add]');
      if (mv || rm || add) {
        read();
        if (mv) { const [k, i, s] = mv.dataset.mv.split(':'); const a = k === 'd' ? dl : pl, j = +i + +s; [a[+i], a[j]] = [a[j], a[+i]]; }
        if (rm) { const [k, i] = rm.dataset.rm.split(':'); const a = k === 'd' ? dl : pl; if (!confirm(`Видалити «${a[+i].title}»?`)) return; a.splice(+i, 1); }
        if (add && add.dataset.add === 'd') dl.push({ id: newId('d_'), kind: 'address', active: true, title: '', subtitle: '', info: '', cost_note: 'за тарифами перевізника', free: false, threshold: false });
        if (add && add.dataset.add === 'p') pl.push({ id: newId('p_'), active: true, title: '', subtitle: '', info: '', for: [] });
        dirty = true; draw();
        if (add) { const last = $$(add.dataset.add === 'd' ? '[data-d]' : '[data-p]', root).pop(); last.scrollIntoView({ block: 'center' }); $('[data-k=title]', last).focus(); }
        return;
      }
      if (e.target.closest('[data-save]')) {
        read();
        try {
          const r = await api('PUT', 'checkout', { delivery: dl, payment: pl, text: tx });
          dl = r.delivery; pl = r.payment; tx = r.text; dirty = false; draw(); toast('Збережено');
          r.delivery.forEach((d) => { DELIV[d.id] = d.title; }); r.payment.forEach((p) => { PAY[p.id] = p.title; });
        } catch (ex) { fail(ex); }
      }
    });
  }

  // =====================================================================
  // Сповіщення покупцям (email + SMS)
  const smsParts = (t) => { t = String(t || ''); if (!t) return 0; const g = /^[\x20-\x7E\n\r]*$/.test(t); const one = g ? 160 : 70, mu = g ? 153 : 67; return t.length <= one ? 1 : Math.ceil(t.length / mu); };
  const SAMPLE = { name: 'Олена', fullname: 'Петренко Олена', order: '261126-1234', total: '1 250 грн', ttn: '20450012345678', carrier: 'Нова пошта', track: 'https://novaposhta.ua/tracking/?cargo_number=20450012345678', shop: 'Дім і Ремонт', phone: '+380735671290', site: 'https://dimiremont.com.ua' };
  const fillT = (t, v) => String(t || '').replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));
  const VARS = [['name', 'Ім’я покупця'], ['fullname', 'ПІБ'], ['order', 'Номер замовлення'], ['total', 'Сума'], ['ttn', 'Номер ТТН'], ['carrier', 'Перевізник'], ['track', 'Посилання на відстеження'], ['shop', 'Назва магазину'], ['phone', 'Ваш телефон'], ['site', 'Сайт']];
  const EMOJI = '😊 🙂 😉 😍 🥰 🤗 👍 👏 🙏 🤝 💪 ✌️ 👋 🎉 🎁 🛍️ 🛒 📦 🚚 ✈️ 📬 📮 🏠 🏡 🔨 🛠️ 🎨 🖌️ 🧱 🪟 🛋️ 🛏️ 🕯️ 💡 ✨ ⭐ 🌟 🔥 ❤️ 💚 💙 💛 🧡 ✅ ☑️ ✔️ ❗ ⚡ ⏰ 📅 📞 💬 📧 💳 💰 🏷️ 🔖 🆕 🇺🇦 🌸 🌿 ☀️ ❄️ 🎄 🎅'.split(' ');
  const FONTS = [['Arial, Helvetica, sans-serif', 'Arial'], ['Verdana, Geneva, sans-serif', 'Verdana'], ['Tahoma, Geneva, sans-serif', 'Tahoma'], ['Trebuchet MS, sans-serif', 'Trebuchet'], ['Georgia, serif', 'Georgia'], ['Times New Roman, Times, serif', 'Times New Roman'], ['Courier New, monospace', 'Courier New']];
  const SIZES = [['2', 'Дрібний'], ['3', 'Звичайний'], ['4', 'Більший'], ['5', 'Великий'], ['6', 'Дуже великий'], ['7', 'Величезний']];
  let emoClose = null;
  function emojiPop(btn, onPick) {
    if (emoClose) emoClose();
    const pop = document.createElement('div'); pop.className = 'emo-pop';
    pop.innerHTML = EMOJI.map((e) => `<button type="button">${e}</button>`).join('');
    btn.parentElement.append(pop);
    if (btn.getBoundingClientRect().left > innerWidth * 0.55) { pop.style.left = 'auto'; pop.style.right = '0'; }
    const out = (e) => { if (!pop.contains(e.target) && e.target !== btn) close(); };
    const close = () => { pop.parentElement && pop.parentElement.removeChild(pop); document.removeEventListener('mousedown', out, true); emoClose = null; };
    pop.addEventListener('mousedown', (e) => e.preventDefault());
    pop.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) onPick(b.textContent); });
    setTimeout(() => document.addEventListener('mousedown', out, true));
    emoClose = close;
  }
  function mailRte(html) {
    return `<div class="rte mrte"><div class="rte-bar">
      <select data-mc="fontName" title="Шрифт"><option value="">Шрифт</option>${FONTS.map(([v, l]) => `<option value="${esc(v)}" style="font-family:${esc(v)}">${esc(l)}</option>`).join('')}</select>
      <select data-mc="fontSize" title="Розмір"><option value="">Розмір</option>${SIZES.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select>
      <button type="button" data-mc="bold" title="Жирний"><b>Ж</b></button><button type="button" data-mc="italic" title="Курсив"><i>К</i></button><button type="button" data-mc="underline" title="Підкреслений"><u>П</u></button><button type="button" data-mc="strikeThrough" title="Закреслений"><s>З</s></button>
      <label class="mrte-color" title="Колір тексту">A<input type="color" data-mc="foreColor" value="#c8432f"></label>
      <label class="mrte-color" title="Колір фону (маркер)"><span style="background:#ffe58a;color:#222;padding:0 3px">М</span><input type="color" data-mc="hiliteColor" value="#ffe58a"></label>
      <button type="button" data-mc="justifyLeft" title="Ліворуч">Ліворуч</button><button type="button" data-mc="justifyCenter" title="По центру">Центр</button>
      <button type="button" data-mc="insertUnorderedList" title="Список">• Список</button>
      <button type="button" data-mc="createLink" title="Посилання">Посилання</button>
      <span class="emo-wrap"><button type="button" data-mc="emoji" title="Смайлик">😊</button></span>
      <select data-mc="var" title="Вставити змінну"><option value="">+ Змінна</option>${VARS.map(([k, l]) => `<option value="{${k}}">${esc(l)}</option>`).join('')}</select>
      <button type="button" data-mc="removeFormat" title="Прибрати форматування">Очистити</button></div>
      <div class="rte-area mrte-area" contenteditable="true">${html || ''}</div></div>`;
  }
  function bindMailRte(box) {
    const area = $('.mrte-area', box);
    let saved = null;
    const save = () => { const s = getSelection(); if (s.rangeCount && area.contains(s.anchorNode)) saved = s.getRangeAt(0).cloneRange(); };
    const restore = () => { area.focus(); if (saved) { const s = getSelection(); s.removeAllRanges(); s.addRange(saved); } };
    ['keyup', 'mouseup', 'input'].forEach((ev) => area.addEventListener(ev, save));
    document.addEventListener('selectionchange', save);
    const exec = (cmd, arg) => { restore(); document.execCommand('styleWithCSS', false, true); document.execCommand(cmd, false, arg); save(); dirty = true; area.dispatchEvent(new Event('input', { bubbles: true })); };
    $('.rte-bar', box).addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
    box.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-mc]'); if (!b) return;
      const cmd = b.dataset.mc;
      if (cmd === 'emoji') { emojiPop(b, (em) => exec('insertText', em)); return; }
      if (cmd === 'createLink') { const u = prompt('Адреса посилання (https://... або {track})', 'https://'); if (u && u !== 'https://') exec('createLink', u); return; }
      exec(cmd, null);
    });
    box.addEventListener('change', (e) => {
      const x = e.target.closest('[data-mc]'); if (!x || x.tagName === 'BUTTON') return;
      const v = x.value; if (!v) return;
      if (x.dataset.mc === 'var') exec('insertText', v); else exec(x.dataset.mc, v);
      if (x.tagName === 'SELECT') x.value = '';
    });
  }
  async function notifyEdit() {
    const d = await api('GET', 'notify');
    let c = d.config;
    const sec = (ok, name) => ok ? `<span class="pill" style="color:var(--ok)">ключ ${name} задано</span>` : `<span class="pill" style="color:var(--warn)">немає секрету ${name}</span>`;
    const evCard = (ev, title, hint) => {
      const e = c[ev];
      return `<div class="card" data-ev="${ev}"><h2>${title}</h2><p class="hint" style="margin-top:-6px">${hint}</p>
        ${ev === 'accepted' ? `<div class="grid2" style="margin-bottom:10px"><label>Коли надсилати<select data-k="when">
          <option value="confirmed" ${e.when !== 'new' ? 'selected' : ''}>Коли ставлю статус «Підтверджене» або «Оплачене»</option>
          <option value="new" ${e.when === 'new' ? 'selected' : ''}>Одразу після оформлення замовлення</option></select></label></div>` : ''}
        <div class="checks" style="margin-bottom:10px"><label class="check"><input type="checkbox" data-k="email" ${e.email ? 'checked' : ''}> Email</label><label class="check"><input type="checkbox" data-k="sms" ${e.sms ? 'checked' : ''}> SMS</label></div>
        <div class="rows">
          <label>Тема листа<input data-k="subject" value="${esc(e.subject)}"></label>
          <div><span class="lbl">Текст листа</span> <small class="hint">${ev === 'accepted' ? 'Під текстом лист сам додасть список товарів і суму.' : 'Під текстом лист сам додасть кнопку «Відстежити посилку».'} Виділіть слова й оберіть жирний, шрифт, розмір чи колір.</small>${mailRte(e.email_html)}</div>
          <label>Текст SMS<small data-cnt></small><textarea data-k="sms_text" rows="2">${esc(e.sms_text)}</textarea></label>
          <div class="toolbar" style="gap:6px"><span class="emo-wrap"><button type="button" class="btn ghost sm" data-emo-sms>😊 Смайлик у SMS</button></span><select class="sm" data-var-sms><option value="">+ Змінна</option>${VARS.map(([k, l]) => `<option value="{${k}}">${esc(l)}</option>`).join('')}</select><small class="hint">Смайлик у SMS займає 2 символи; форматування в SMS неможливе.</small></div>
          <div class="hint" data-prev></div>
        </div></div>`;
    };
    function draw() {
      view.innerHTML = `<div class="head"><h1>Сповіщення покупцям</h1></div>
      <p class="hint" style="margin:-8px 0 16px">Покупець отримує два повідомлення: «Дякуємо, взято в роботу» і «Відправлено» з номером ТТН. Вони надсилаються самі, коли ви змінюєте статус замовлення або вписуєте ТТН.</p>
      <form id="nf">
      <div class="card"><div class="toolbar" style="margin-bottom:8px"><label class="check"><input type="checkbox" name="email.enabled" ${c.email.enabled ? 'checked' : ''}> <b>Email</b></label>${sec(d.secrets.email, 'RESEND_API_KEY')}<span class="grow"></span><small class="muted">Resend · 3000 листів на місяць безкоштовно</small></div>
        <div class="grid2">${field('Ім’я відправника', 'email.from_name', c.email.from_name)}${field('Адреса відправника', 'email.from_email', c.email.from_email, { hint: 'на вашому домені, підтвердженому в Resend' })}
        ${field('Відповіді надсилати на', 'email.reply_to', c.email.reply_to, { hint: 'напр. ваша пошта Gmail; порожньо — на адресу відправника', ph: 'shop@gmail.com' })}</div>
        <details style="margin-top:10px"><summary class="hint">Як підключити email</summary><ol class="hint">
          <li>Зареєструйтесь на resend.com, Domains → Add Domain → dimiremont.com.ua.</li>
          <li>Додайте записи DNS, які покаже Resend (у Cloudflare: Websites → dimiremont.com.ua → DNS). Дочекайтесь статусу Verified.</li>
          <li>API Keys → Create API Key (Sending access). Скопіюйте ключ.</li>
          <li>Cloudflare → Workers → dimiremont → Settings → Variables and Secrets → Add → Secret, назва <b>RESEND_API_KEY</b>, значення — ключ.</li>
          <li>Увімкніть Email тут, збережіть і надішліть тест собі.</li></ol></details></div>
      <div class="card"><div class="toolbar" style="margin-bottom:8px"><label class="check"><input type="checkbox" name="sms.enabled" ${c.sms.enabled ? 'checked' : ''}> <b>SMS</b></label>${sec(d.secrets.sms, 'SMS_TOKEN')}<span class="grow"></span><small class="muted">≈1,3 грн за SMS</small></div>
        <div class="grid2">${field('SMS-сервіс', 'sms.provider', c.sms.provider, { type: 'select', options: Object.entries(d.providers) })}
        ${field('Ім’я відправника (альфа-ім’я)', 'sms.sender', c.sms.sender, { hint: 'до 11 латинських символів, точно як погоджено в сервісі', ph: 'DimRemont', attrs: 'maxlength="11"' })}</div>
        <details style="margin-top:10px"><summary class="hint">Як підключити SMS</summary><ol class="hint">
          <li>Зареєструйтесь у TurboSMS (turbosms.ua) або SMSClub (smsclub.mobi), поповніть баланс.</li>
          <li>Подайте заявку на альфа-ім’я (напр. DimRemont). Поки його погоджують, можна тестувати зі спільним ім’ям сервісу.</li>
          <li>Візьміть токен API: TurboSMS — Налаштування → API (HTTP); SMSClub — Профіль → Токен.</li>
          <li>Cloudflare → Workers → dimiremont → Settings → Variables and Secrets → Add → Secret, назва <b>SMS_TOKEN</b>, значення — токен.</li>
          <li>Увімкніть SMS тут, збережіть і надішліть тест на свій номер.</li></ol></details></div>
      ${evCard('accepted', '1. Дякуємо, взято в роботу', 'Один раз на замовлення.')}
      ${evCard('shipped', '2. Відправлено, номер ТТН', 'Коли статус «Відправлене» і заповнено ТТН. Якщо ТТН змінили, надішлеться ще раз з новим номером. Без ТТН не надсилається.')}
      <p class="hint">Змінні в текстах: {name} ім’я покупця, {fullname} ПІБ, {order} номер замовлення, {total} сума, {ttn} номер ТТН, {carrier} перевізник, {track} посилання на відстеження, {shop} назва магазину, {phone} ваш телефон, {site} сайт.</p>
      <div class="savebar"><button class="btn">Зберегти</button></div></form>
      <div class="card" style="margin-top:16px"><h2>Тестове повідомлення</h2><p class="hint">Надсилає приклад з поточними (навіть не збереженими) текстами. Замовлення вигадане.</p>
        <div class="grid3" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px">
          ${field('Подія', 't_event', 'accepted', { type: 'select', options: [['accepted', 'Взято в роботу'], ['shipped', 'Відправлено, ТТН']] })}
          ${field('Email для тесту', 't_email', '', { ph: 'ваша пошта' })}${field('Телефон для тесту', 't_phone', '', { ph: '+380…' })}</div>
        <button type="button" class="btn ghost" id="ntest" style="margin-top:10px">Надіслати тест</button><div id="nres" style="margin-top:10px"></div></div>`;
      $$('[data-ev]').forEach(updPrev);
    }
    function read() {
      const f = $('#nf');
      const out = { email: { ...c.email }, sms: { ...c.sms }, accepted: { ...c.accepted }, shipped: { ...c.shipped } };
      $$('[name]', f).forEach((el) => { const [a, b] = el.name.split('.'); if (b && out[a]) out[a][b] = el.type === 'checkbox' ? el.checked : el.value; });
      $$('[data-ev]', f).forEach((card) => { const e = out[card.dataset.ev]; $$('[data-k]', card).forEach((x) => { e[x.dataset.k] = x.type === 'checkbox' ? x.checked : x.value; }); e.email_html = $('.mrte-area', card).innerHTML; });
      return out;
    }
    function updPrev(card) {
      const t = $('[data-k=sms_text]', card).value, txt = fillT(t, SAMPLE), n = smsParts(txt);
      $('[data-cnt]', card).innerHTML = `${txt.length} символів з підставленими даними · <b style="color:${n > 1 ? 'var(--warn)' : 'var(--ok)'}">${n} SMS</b>${n > 1 ? ' (кожна оплачується окремо; кирилиця — 70 символів на SMS)' : ''}`;
      $('[data-prev]', card).textContent = 'SMS виглядатиме так: ' + txt;
    }
    draw();
    const nf = $('#nf');
    $$('.mrte', nf).forEach(bindMailRte);
    $$('[data-ev]', nf).forEach((card) => {
      const ta = $('[data-k=sms_text]', card);
      const put = (txt) => { const a = ta.selectionStart ?? ta.value.length, b = ta.selectionEnd ?? a; ta.value = ta.value.slice(0, a) + txt + ta.value.slice(b); ta.focus(); ta.selectionStart = ta.selectionEnd = a + txt.length; dirty = true; updPrev(card); };
      const eb = $('[data-emo-sms]', card);
      eb.addEventListener('click', () => emojiPop(eb, put));
      $('[data-var-sms]', card).addEventListener('change', (e) => { if (e.target.value) put(e.target.value); e.target.value = ''; });
    });
    nf.addEventListener('input', (e) => { dirty = true; const card = e.target.closest('[data-ev]'); if (card) updPrev(card); });
    nf.addEventListener('change', () => { dirty = true; });
    nf.addEventListener('submit', async (e) => {
      e.preventDefault();
      try { const r = await api('PUT', 'notify', read()); c = r.config; dirty = false; toast('Збережено'); } catch (ex) { fail(ex); }
    });
    $('#ntest').addEventListener('click', async () => {
      const out = $('#nres'), t = formData($('#ntest').closest('.card'));
      if (!t.t_email.trim() && !t.t_phone.trim()) { out.innerHTML = '<p class="err">Вкажіть email або телефон для тесту</p>'; return; }
      out.innerHTML = '<p class="muted">Надсилаємо…</p>';
      try {
        const r = await api('POST', 'notify-test', { config: read(), event: t.t_event, email: t.t_email, phone: t.t_phone });
        if (r.error) { out.innerHTML = `<p class="err">${esc(r.error)}</p>`; return; }
        out.innerHTML = [['email', 'Email'], ['sms', 'SMS']].filter(([k]) => r[k]).map(([k, n]) => r[k].ok
          ? `<p style="color:var(--ok)">✓ ${n} на ${esc(r[k].to)}: надіслано</p>` : `<p class="err">✗ ${n}: ${esc(r[k].error)}</p>`).join('');
      } catch (ex) { out.innerHTML = `<p class="err">${esc(ex.message)}</p>`; }
    });
  }

  boot();
})();
