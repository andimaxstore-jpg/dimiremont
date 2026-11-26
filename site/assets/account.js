/* Особистий кабінет покупця: вхід/реєстрація, замовлення, особисті дані, збережені товари. */
document.addEventListener('DOMContentLoaded', function () {
  'use strict';
  var box = document.querySelector('[data-acc-root]');
  if (!box) return;
  var page = document.querySelector('[data-account]');
  var shopPhone = page.getAttribute('data-phone') || '', shopTel = page.getAttribute('data-tel') || '';
  var DR = window.DR || { wishList: function () { return []; }, setWish: function () {}, sendWish: function () { return Promise.resolve(null); }, setAccount: function () {}, paint: function () {} };
  var STATUS = { new: 'Нове', confirmed: 'Підтверджене', paid: 'Оплачене', shipped: 'Відправлене', done: 'Виконане', cancelled: 'Скасоване' };
  var STEPS = ['new', 'confirmed', 'shipped', 'done'];
  var DELIV = { np: 'Нова пошта, відділення', np_courier: 'Кур’єр Нової пошти', up: 'Укрпошта', pickup: 'Самовивіз' };
  var PAY = { cod: 'Накладений платіж', card: 'На рахунок або картку', cash: 'Готівкою або карткою при самовивозі' };
  var me = null;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function money(v) { return String(Math.round(+v || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₴'; }
  function date(iso) { var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' }); }
  function api(method, path, body) {
    var opt = { method: method, credentials: 'same-origin', headers: { 'x-req': '1' } };
    if (body !== undefined) { opt.body = JSON.stringify(body); opt.headers['content-type'] = 'application/json'; }
    return fetch('/api/' + path, opt).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) { d = d || {}; d._status = r.status; d._ok = r.ok; return d; });
    });
  }
  function normPhone(v) {
    // У полі завжди стоїть +380, тож відкидаємо цей префікс (навіть недописаний, напр. «+38» після стирання),
    // а далі приймаємо номер у будь-якому вигляді: 050…, 380…, +380…
    var s = String(v || '').trim();
    if (s.charAt(0) === '+') s = s.slice(1).replace(/^3?8?0?/, '');
    var d = s.replace(/\D/g, '');
    while (d.length > 9 && d.indexOf('380') === 0) d = d.slice(3);
    if (d.length > 9 && d.indexOf('80') === 0) d = d.slice(2);
    if (d.indexOf('0') === 0) d = d.slice(1);
    return d.slice(0, 9);
  }
  function phoneMask(input, either) {
    // either: поле «телефон або email» — без автопідстановки +380, щоб не заважати вводити email
    if (!either) input.addEventListener('focus', function () { if (!input.value) input.value = '+380 '; });
    input.addEventListener('blur', function () { if (!either && !normPhone(input.value)) input.value = ''; });
    input.addEventListener('input', function (e) {
      var raw = input.value;
      if (raw.indexOf('@') >= 0 || /[a-zа-яіїєґ_]/i.test(raw)) { // це email, не чіпаємо
        if (/^\+380\s*/.test(raw)) input.value = raw.replace(/^\+380\s*/, '');
        return;
      }
      if (either) return; // телефон нормалізуємо під час входу
      var d = normPhone(raw), out = '+380';
      if (!d && e && /^delete/.test(e.inputType || '')) { input.value = ''; return; } // дозволяємо стерти поле повністю
      if (d.length) out += ' ' + d.slice(0, 2);
      if (d.length > 2) out += ' ' + d.slice(2, 5);
      if (d.length > 5) out += ' ' + d.slice(5, 7);
      if (d.length > 7) out += ' ' + d.slice(7, 9);
      input.value = out;
    });
  }
  function fmtPhone(p) { var d = normPhone(p); return d.length === 9 ? '+380 ' + d.slice(0, 2) + ' ' + d.slice(2, 5) + ' ' + d.slice(5, 7) + ' ' + d.slice(7) : p || ''; }
  var FIELD_ERR = {
    first_name: 'Вкажіть ім’я.', phone: 'Перевірте номер телефону: +380 і 9 цифр.', email: 'Перевірте email.',
    login: 'Вкажіть телефон або email, за яким будете входити.', password: 'Пароль має бути щонайменше 6 символів.'
  };
  function errText(d) {
    if (d.fields) return d.fields.map(function (f) { return FIELD_ERR[f] || ''; }).filter(Boolean).join(' ') || 'Перевірте поля форми.';
    return d.message || (d._status === 0 ? 'Немає з’єднання.' : 'Щось пішло не так. Спробуйте ще раз.');
  }
  function busy(btn, on, text) { btn.disabled = on; if (text) btn.textContent = text; }

  // ---------- гість: вхід і реєстрація ----------
  function guest() {
    var reg = location.hash === '#register';
    box.innerHTML = '<div class="acc-auth">' +
      '<div class="acc-tabs" role="tablist"><button type="button" role="tab" data-auth="login" class="' + (reg ? '' : 'on') + '">Вхід</button><button type="button" role="tab" data-auth="register" class="' + (reg ? 'on' : '') + '">Реєстрація</button></div>' +
      '<form class="acc-card" data-form="login"' + (reg ? ' hidden' : '') + ' novalidate>' +
        '<label>Телефон або email<input name="login" autocomplete="username" required placeholder="+380 __ ___ __ __ або email"></label>' +
        '<label>Пароль<input name="password" type="password" autocomplete="current-password" required></label>' +
        '<p class="form-err" data-err hidden></p><button class="btn">Увійти</button>' +
        '<p class="note">Забули пароль? Зателефонуйте нам' + (shopTel ? ' <a href="tel:' + esc(shopTel) + '">' + esc(shopPhone) + '</a>' : '') + ', і менеджер допоможе відновити доступ.</p></form>' +
      '<form class="acc-card" data-form="register"' + (reg ? '' : ' hidden') + ' novalidate>' +
        '<div class="fields"><label>Ім’я<input name="first_name" autocomplete="given-name" required></label><label>Прізвище<input name="last_name" autocomplete="family-name"></label>' +
        '<label>Телефон<input name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+380 __ ___ __ __"></label><label>Email<input name="email" type="email" autocomplete="email"></label>' +
        '<label class="wide">Пароль <small>(щонайменше 6 символів)</small><input name="password" type="password" autocomplete="new-password" minlength="6" required></label></div>' +
        '<p class="note">Вкажіть телефон, email або обидва: за ними ви будете входити.</p>' +
        '<p class="form-err" data-err hidden></p><button class="btn">Створити кабінет</button></form>' +
      '<div class="acc-why"><h2>Що дає кабінет</h2><ul><li>Статус кожного замовлення і номер ТТН</li><li>Дані й адреса доставки підставляються самі</li><li>Збережені товари на будь-якому пристрої</li></ul></div>' +
      '</div><div data-guest-saved></div>';
    box.querySelectorAll('[data-auth]').forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.getAttribute('data-auth');
        box.querySelectorAll('[data-auth]').forEach(function (x) { x.classList.toggle('on', x === b); });
        box.querySelectorAll('[data-form]').forEach(function (f) { f.hidden = f.getAttribute('data-form') !== k; });
        history.replaceState(null, '', k === 'register' ? '#register' : location.pathname + location.search);
      });
    });
    var lf = box.querySelector('[data-form="login"]'), rf = box.querySelector('[data-form="register"]');
    phoneMask(lf.elements.login, true); phoneMask(rf.elements.phone);
    function submit(form, path, data) {
      var err = form.querySelector('[data-err]'), btn = form.querySelector('button.btn'), label = btn.textContent;
      err.hidden = true; busy(btn, true, 'Зачекайте…');
      api('POST', path, data).then(function (d) {
        if (!d._ok) { err.textContent = errText(d); err.hidden = false; return; }
        afterLogin(d.customer);
      }).catch(function () { err.textContent = 'Немає з’єднання. Спробуйте ще раз.'; err.hidden = false; })
        .then(function () { busy(btn, false, label); });
    }
    lf.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = lf.elements.login.value.trim().replace(/^\+380\s*(?=\S*@)/, '');
      submit(lf, 'account/login', { login: v.indexOf('@') >= 0 ? v : '+380' + normPhone(v), password: lf.elements.password.value });
    });
    rf.addEventListener('submit', function (e) {
      e.preventDefault();
      var ph = normPhone(rf.elements.phone.value);
      var err = rf.querySelector('[data-err]');
      var em = rf.elements.email.value.trim();
      var msg = rf.elements.first_name.value.trim().length < 2 ? FIELD_ERR.first_name : (ph && ph.length !== 9) ? FIELD_ERR.phone : (!ph && !em) ? FIELD_ERR.login : rf.elements.password.value.length < 6 ? FIELD_ERR.password : '';
      if (msg) { err.textContent = msg; err.hidden = false; return; }
      submit(rf, 'account/register', { first_name: rf.elements.first_name.value, last_name: rf.elements.last_name.value, phone: ph ? '+380' + ph : '', email: em, password: rf.elements.password.value });
    });
    var saved = DR.wishList();
    if (saved.length) {
      var gs = box.querySelector('[data-guest-saved]');
      gs.innerHTML = '<h2 class="acc-h2">Збережені товари</h2><p class="muted">Увійдіть, щоб вони зберігалися в кабінеті й були доступні з телефона та комп’ютера.</p><div class="grid" data-saved-grid></div>';
      loadSlugs(saved).then(function (items) { drawSaved(gs.querySelector('[data-saved-grid]'), items); });
    }
  }

  function afterLogin(c) {
    me = c; DR.setAccount(c);
    // переносимо в кабінет збережені в цьому браузері товари та замовлення, оформлені тут без входу
    var local = DR.wishList(), jobs = [];
    jobs.push(DR.sendWish(local, []).then(function (d) { if (d && d.items) DR.setWish(d.items.map(function (i) { return i.slug; })); }));
    var mine = []; try { mine = JSON.parse(localStorage.getItem('dr-my-orders')) || []; } catch (e) {}
    if (mine.length) jobs.push(api('POST', 'account/link-orders', { orders: mine }).then(function () { try { localStorage.removeItem('dr-my-orders'); } catch (e) {} }));
    Promise.all(jobs).catch(function () {}).then(function () {
      if (/next=koshyk/.test(location.search)) { location.href = '/koshyk.html'; return; }
      if (location.hash === '#register' || !location.hash) history.replaceState(null, '', location.pathname + '#orders');
      cabinet();
    });
  }

  // ---------- кабінет ----------
  var TABS = [['orders', 'Мої замовлення'], ['profile', 'Особисті дані'], ['saved', 'Збережені товари']];
  function tab() { var h = location.hash.slice(1); return TABS.some(function (t) { return t[0] === h; }) ? h : 'orders'; }
  function cabinet() {
    var t = tab();
    box.innerHTML = '<div class="acc-head"><p>Вітаємо, <b>' + esc(me.first_name || '') + '</b>!</p><button type="button" class="link-btn" data-logout>Вийти</button></div>' +
      '<nav class="acc-tabs" aria-label="Розділи кабінету">' + TABS.map(function (x) { return '<a href="#' + x[0] + '" class="' + (x[0] === t ? 'on' : '') + '">' + x[1] + (x[0] === 'saved' ? ' <span class="muted">' + DR.wishList().length + '</span>' : '') + '</a>'; }).join('') + '</nav>' +
      '<div data-tab><p class="muted">Завантаження…</p></div>';
    box.querySelector('[data-logout]').addEventListener('click', function () {
      api('POST', 'account/logout').then(function () { me = null; DR.setAccount(null); DR.setWish([]); history.replaceState(null, '', location.pathname); guest(); });
    });
    var el = box.querySelector('[data-tab]');
    if (t === 'orders') ordersTab(el); else if (t === 'profile') profileTab(el); else savedTab(el);
  }
  window.addEventListener('hashchange', function () { if (me) cabinet(); else if (location.hash === '#register' || location.hash === '') guest(); });

  function progress(st) {
    if (st === 'cancelled') return '<p class="ord-cancel">Замовлення скасовано</p>';
    var idx = STEPS.indexOf(st === 'paid' ? 'confirmed' : st);
    return '<ol class="ord-steps">' + STEPS.map(function (s, i) { return '<li class="' + (i <= idx ? 'on' : '') + '">' + (s === 'confirmed' && st === 'paid' ? 'Оплачене' : STATUS[s]) + '</li>'; }).join('') + '</ol>';
  }
  function ordersTab(el) {
    api('GET', 'account/orders').then(function (d) {
      if (d._status === 401) return relogin();
      var items = d.items || [];
      var html = items.length ? items.map(function (o) {
        var dv = o.delivery || {};
        var where = dv.method === 'pickup' ? (dv.pickupAddress || '') : [dv.city, dv.branch || dv.address].filter(Boolean).join(', ');
        return '<article class="ord">' +
          '<div class="ord-top"><div><b>Замовлення №' + esc(o.id) + '</b><span class="muted"> від ' + date(o.created_at) + '</span></div><span class="st st-' + esc(o.status) + '">' + esc(o.status_label || STATUS[o.status] || o.status) + '</span></div>' +
          progress(o.status) +
          '<ul class="ord-items">' + o.items.map(function (i) { return '<li><span>' + esc(i.title) + (i.opt ? ' <small class="muted">' + esc(i.opt) + '</small>' : '') + '</span><span class="muted">' + i.qty + ' × ' + money(i.price) + '</span></li>'; }).join('') + '</ul>' +
          '<div class="ord-foot"><div><span class="muted">' + esc(DELIV[dv.method] || '') + '</span>' + (where ? '<br>' + esc(where) : '') +
          (o.ttn ? '<br>ТТН: <a href="https://novaposhta.ua/tracking/?cargo_number=' + encodeURIComponent(o.ttn) + '" target="_blank" rel="noopener">' + esc(o.ttn) + '</a>' : '') +
          (o.payment ? '<br><span class="muted">Оплата: ' + esc(PAY[o.payment] || o.payment) + '</span>' : '') + '</div><b class="ord-total">' + money(o.total) + '</b></div></article>';
      }).join('') : '<div class="acc-card"><p>Замовлень у кабінеті поки немає.</p><p class="muted">Нові замовлення, оформлені після входу, з’являться тут автоматично.</p><a class="btn" href="/katalog.html">Перейти до каталогу</a></div>';
      html += '<details class="acc-card link-ord"><summary>Оформлювали замовлення раніше без кабінету? Додайте його сюди</summary>' +
        '<form data-link novalidate><div class="fields"><label>Номер замовлення<input name="id" placeholder="261126-1234" required></label><label>Телефон, з яким оформлено<input name="phone" type="tel" inputmode="tel" value="' + esc(fmtPhone(me.phone)) + '"></label></div>' +
        '<p class="form-err" data-err hidden></p><button class="btn ghost">Додати замовлення</button></form></details>';
      el.innerHTML = html;
      var f = el.querySelector('[data-link]');
      phoneMask(f.elements.phone);
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        var err = f.querySelector('[data-err]'), btn = f.querySelector('button');
        busy(btn, true);
        api('POST', 'account/link-orders', { id: f.elements.id.value.trim(), phone: '+380' + normPhone(f.elements.phone.value) }).then(function (d) {
          if (d._ok && d.linked) return ordersTab(el);
          err.textContent = d.message || 'Не знайшли замовлення з таким номером і телефоном. Перевірте дані або зателефонуйте нам.'; err.hidden = false;
        }).then(function () { busy(btn, false); });
      });
    });
  }

  // --- автодоповнення міст і відділень (як у кошику)
  function autocomplete(wrap, opts) {
    var input = wrap.querySelector('input'), ul = wrap.querySelector('ul'), items = [], active = -1, timer;
    function close() { ul.hidden = true; active = -1; }
    function show(arr, info) {
      items = arr;
      ul.innerHTML = info ? '<li class="info">' + esc(info) + '</li>' : arr.map(function (it, i) { return '<li data-i="' + i + '">' + esc(it.title) + (it.sub ? '<small>' + esc(it.sub) + '</small>' : '') + '</li>'; }).join('');
      ul.hidden = false;
    }
    function pick(i) { var it = items[i]; if (!it) return; input.value = it.title; close(); opts.onPick(it); }
    ul.addEventListener('mousedown', function (e) { var li = e.target.closest('li[data-i]'); if (li) { e.preventDefault(); pick(+li.getAttribute('data-i')); } });
    input.addEventListener('keydown', function (e) {
      if (ul.hidden) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); active = Math.max(0, Math.min(items.length - 1, active + (e.key === 'ArrowDown' ? 1 : -1)));
        ul.querySelectorAll('li').forEach(function (li, i) { li.setAttribute('aria-selected', i === active ? 'true' : 'false'); });
      } else if (e.key === 'Enter') { e.preventDefault(); pick(active < 0 ? 0 : active); } else if (e.key === 'Escape') close();
    });
    input.addEventListener('blur', function () { setTimeout(close, 150); });
    input.addEventListener('input', function () { opts.onType(); clearTimeout(timer); timer = setTimeout(function () { opts.source(input.value.trim(), show); }, 280); });
    input.addEventListener('focus', function () { if (opts.onFocus) opts.onFocus(input.value.trim(), show); });
    return input;
  }

  function profileTab(el) {
    var d = me.delivery || {};
    var method = d.method || 'np', city = d.city && d.city.id ? d.city : null, branch = d.branch && d.branch.id ? d.branch : null, branches = null;
    el.innerHTML = '<form class="acc-card" data-profile novalidate><h2>Контактні дані</h2><div class="fields">' +
      '<label>Ім’я<input name="first_name" autocomplete="given-name" value="' + esc(me.first_name) + '"></label>' +
      '<label>Прізвище<input name="last_name" autocomplete="family-name" value="' + esc(me.last_name) + '"></label>' +
      '<label>По батькові <small>(необов’язково)</small><input name="middle_name" value="' + esc(me.middle_name) + '"></label>' +
      '<label>Телефон<input name="phone" type="tel" inputmode="tel" autocomplete="tel" value="' + esc(fmtPhone(me.phone)) + '"></label>' +
      '<label class="wide">Email<input name="email" type="email" autocomplete="email" value="' + esc(me.email) + '"></label></div>' +
      '<h2>Доставка за замовчуванням</h2><p class="note">Підставляється в кошик автоматично. Після кожного замовлення оновлюється сама.</p>' +
      '<div class="radios">' + ['np', 'np_courier', 'up', 'pickup'].map(function (m) { return '<label class="radio"><input type="radio" name="method" value="' + m + '"' + (m === method ? ' checked' : '') + '><span><b>' + DELIV[m] + '</b></span></label>'; }).join('') + '</div>' +
      '<div class="fields" data-addr>' +
        '<div class="ac wide" data-ac="city"><label for="p-city">Місто або село</label><input id="p-city" autocomplete="off" placeholder="Почніть вводити назву" value="' + esc(d.city ? d.city.name : '') + '"><ul hidden></ul></div>' +
        '<div class="ac wide" data-ac="branch"><label for="p-branch">Відділення</label><input id="p-branch" autocomplete="off" placeholder="Оберіть відділення" value="' + esc(d.branch ? d.branch.title : '') + '"><ul hidden></ul></div>' +
        '<label class="wide" data-courier>Адреса: вулиця, будинок, квартира<input name="address" value="' + esc(d.address || '') + '"></label></div>' +
      '<p class="form-err" data-err hidden></p><div class="acc-actions"><button class="btn">Зберегти</button><span class="ok-msg" data-ok hidden>Збережено</span></div></form>' +
      '<form class="acc-card" data-pass novalidate><h2>Змінити пароль</h2><div class="fields">' +
      '<label>Поточний пароль<input name="old" type="password" autocomplete="current-password"></label><label>Новий пароль<input name="password" type="password" autocomplete="new-password" minlength="6"></label></div>' +
      '<p class="form-err" data-err hidden></p><div class="acc-actions"><button class="btn ghost">Змінити пароль</button><span class="ok-msg" data-ok hidden>Пароль змінено</span></div></form>';
    var f = el.querySelector('[data-profile]');
    phoneMask(f.elements.phone);
    var cityIn, brIn;
    function src(kind) { return method === 'up' ? (kind === 'city' ? 'up/cities' : 'up/offices') : (kind === 'city' ? 'np/cities' : 'np/warehouses'); }
    function showFor() {
      f.querySelector('[data-addr]').hidden = method === 'pickup';
      f.querySelector('[data-ac="branch"]').hidden = !(method === 'np' || method === 'up');
      f.querySelector('[data-courier]').hidden = method !== 'np_courier';
    }
    f.querySelectorAll('input[name="method"]').forEach(function (r) {
      r.addEventListener('change', function () { method = r.value; city = null; branch = null; branches = null; cityIn.value = ''; brIn.value = ''; showFor(); });
    });
    cityIn = autocomplete(f.querySelector('[data-ac="city"]'), {
      onType: function () { city = null; branch = null; branches = null; brIn.value = ''; },
      source: function (q, show) {
        if (q.length < 2) return show([], 'Введіть щонайменше 2 літери');
        fetch('/api/' + src('city') + '?q=' + encodeURIComponent(q)).then(function (r) { return r.json(); }).then(function (d) {
          if (d.manual) return show([], 'Довідник недоступний, впишіть вручну');
          show((d.items || []).map(function (c) { return { title: c.name, sub: c.label, id: c.id, label: c.label }; }), (d.items || []).length ? '' : 'Нічого не знайдено');
        }).catch(function () { show([], 'Довідник недоступний, впишіть вручну'); });
      },
      onPick: function (c) { city = { id: c.id, name: c.title, label: c.label }; branch = null; branches = null; brIn.value = ''; }
    });
    function brSource(q, show) {
      if (!city) return show([], 'Спершу оберіть місто зі списку');
      var go = function (all) {
        var w = q.toLowerCase().split(/\s+/).filter(Boolean);
        var res = all.filter(function (b) { var t = (b.name + ' ' + b.address).toLowerCase(); return w.every(function (x) { return t.indexOf(x) >= 0; }); }).slice(0, 60);
        show(res.map(function (b) { return { title: b.name, sub: b.address, id: b.id }; }), res.length ? '' : 'Нічого не знайдено');
      };
      if (branches) return go(branches);
      fetch('/api/' + src('branch') + '?city=' + encodeURIComponent(city.id)).then(function (r) { return r.json(); })
        .then(function (d) { branches = d.items || []; go(branches); }).catch(function () { show([], 'Довідник недоступний, впишіть вручну'); });
    }
    brIn = autocomplete(f.querySelector('[data-ac="branch"]'), {
      onType: function () { branch = null; }, source: brSource, onFocus: brSource,
      onPick: function (b) { branch = { id: b.id, title: b.title, sub: b.sub }; }
    });
    showFor();
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var err = f.querySelector('[data-err]'), ok = f.querySelector('[data-ok]'), btn = f.querySelector('button');
      err.hidden = true; ok.hidden = true;
      var ph = normPhone(f.elements.phone.value);
      var cityTxt = cityIn.value.trim(), brTxt = brIn.value.trim();
      var delivery = { method: method };
      if (method !== 'pickup') {
        delivery.city = city ? { id: city.id, name: city.name, label: city.label } : (cityTxt ? { id: '', name: cityTxt, label: cityTxt } : null);
        if (method === 'np' || method === 'up') delivery.branch = branch ? branch : (brTxt ? { id: '', title: brTxt, sub: '' } : null);
        if (method === 'np_courier') delivery.address = f.elements.address.value.trim();
      }
      busy(btn, true);
      api('PUT', 'account/profile', {
        first_name: f.elements.first_name.value, last_name: f.elements.last_name.value, middle_name: f.elements.middle_name.value,
        phone: ph ? '+380' + ph : '', email: f.elements.email.value.trim(), delivery: delivery
      }).then(function (d) {
        if (d._status === 401) return relogin();
        if (!d._ok) { err.textContent = errText(d); err.hidden = false; return; }
        me = d.customer; DR.setAccount(me); ok.hidden = false;
        var hb = box.querySelector('.acc-head b'); if (hb) hb.textContent = me.first_name;
      }).catch(function () { err.textContent = 'Немає з’єднання.'; err.hidden = false; }).then(function () { busy(btn, false); });
    });
    var pf = el.querySelector('[data-pass]');
    pf.addEventListener('submit', function (e) {
      e.preventDefault();
      var err = pf.querySelector('[data-err]'), ok = pf.querySelector('[data-ok]'), btn = pf.querySelector('button');
      err.hidden = true; ok.hidden = true;
      if (pf.elements.password.value.length < 6) { err.textContent = FIELD_ERR.password; err.hidden = false; return; }
      busy(btn, true);
      api('PUT', 'account/password', { old: pf.elements.old.value, password: pf.elements.password.value }).then(function (d) {
        if (!d._ok) { err.textContent = errText(d); err.hidden = false; return; }
        pf.reset(); ok.hidden = false;
      }).then(function () { busy(btn, false); });
    });
  }

  // --- збережені товари
  function loadSlugs(slugs) {
    if (!slugs.length) return Promise.resolve([]);
    return fetch('/api/products?slugs=' + encodeURIComponent(slugs.join(','))).then(function (r) { return r.json(); }).then(function (d) { return d.items || []; }).catch(function () { return []; });
  }
  var HEART = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.5 8 3.6 4.5 7.1 4.5c2 0 3.5 1.1 4.9 2.9 1.4-1.8 2.9-2.9 4.9-2.9 3.5 0 5.6 3.5 4.4 6.8-1.8 4.6-9.3 9.2-9.3 9.2z"/></svg>';
  function drawSaved(grid, items) {
    if (!items.length) { grid.outerHTML = '<div class="acc-card"><p>Тут з’являться товари, які ви збережете сердечком ♡ на картці товару.</p><a class="btn" href="/katalog.html">Перейти до каталогу</a></div>'; return; }
    grid.innerHTML = items.map(function (p) {
      var pic = p.img ? '<img src="' + esc(p.img) + '" alt="' + esc(p.title) + '" loading="lazy" width="400" height="400">' : '<span class="ph-box"></span>';
      return '<article class="card" data-slug="' + esc(p.slug) + '"><a href="' + esc(p.url) + '" class="card-img">' + pic + (p.stock ? '' : '<span class="badges"><span class="badge out">Немає в наявності</span></span>') + '</a>' +
        '<button type="button" class="wish on" data-wish="' + esc(p.slug) + '" aria-pressed="true" aria-label="Прибрати зі збережених" title="Прибрати зі збережених">' + HEART + '</button>' +
        '<div class="card-body"><h3><a href="' + esc(p.url) + '">' + esc(p.title) + '</a></h3><div class="card-foot"><span class="price">' + (p.min !== p.max ? 'від ' : '') + money(p.min) + '</span><a class="btn-sm" href="' + esc(p.url) + '">Обрати</a></div></div></article>';
    }).join('');
  }
  function savedTab(el) {
    el.innerHTML = '<div class="grid" data-saved-grid></div>';
    api('GET', 'account/wishlist').then(function (d) {
      if (d._status === 401) return relogin();
      var items = d.items || [];
      DR.setWish(items.map(function (i) { return i.slug; }));
      drawSaved(el.querySelector('[data-saved-grid]'), items);
    });
  }
  // прибрали сердечко на сторінці «Збережені» — прибираємо картку
  document.addEventListener('dr:wish', function (e) {
    if (e.detail.on) return;
    var c = box.querySelector('.card[data-slug="' + (window.CSS && CSS.escape ? CSS.escape(e.detail.slug) : e.detail.slug) + '"]');
    if (c) c.remove();
    var cnt = box.querySelector('.acc-tabs a[href="#saved"] .muted'); if (cnt) cnt.textContent = DR.wishList().length;
  });

  function relogin() { me = null; DR.setAccount(null); guest(); }

  // ---------- старт ----------
  api('GET', 'account/me').then(function (d) {
    if (d._ok && d.customer) {
      me = d.customer; DR.setAccount(me);
      // підтягуємо збережене на сервері (з інших пристроїв) і додаємо збережене тут
      DR.sendWish(DR.wishList(), []).then(function (w) { if (w && w.items) DR.setWish(w.items.map(function (i) { return i.slug; })); });
      cabinet();
    } else { DR.setAccount(null); guest(); }
  }).catch(function () { box.innerHTML = '<p class="form-err">Немає з’єднання з сервером. Оновіть сторінку.</p>'; });
});
