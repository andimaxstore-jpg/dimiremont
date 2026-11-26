(function () {
  'use strict';
  var KEY = 'shop-cart-v1';
  var rel = document.body.getAttribute('data-rel') || '';
  function money(v) { return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₴'; }
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } }
  function save(c) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} updCount(); }
  function updCount() {
    var n = load().reduce(function (s, i) { return s + i.qty; }, 0);
    document.querySelectorAll('[data-cart-count]').forEach(function (el) { el.textContent = n; });
  }
  updCount();

  // ---------- картка товару ----------
  var prodEl = document.querySelector('[data-product]');
  if (prodEl) {
    var V = JSON.parse(prodEl.getAttribute('data-product'));
    var opts = [];
    V.forEach(function (v) { Object.keys(v.o).forEach(function (k) { if (opts.indexOf(k) < 0) opts.push(k); }); });
    var sel = Object.assign({}, V[0].o);
    var h = decodeURIComponent(location.hash.slice(1));
    V.forEach(function (v) { if (v.sku === h) sel = Object.assign({}, v.o); });
    var btns = prodEl.querySelectorAll('.sw');
    function match(s) { return V.filter(function (v) { return opts.every(function (k) { return !s[k] || v.o[k] === s[k]; }); }); }
    function current() { return match(sel)[0] || V[0]; }
    function render() {
      var v = current();
      btns.forEach(function (b) {
        var k = b.getAttribute('data-opt'), val = b.getAttribute('data-val');
        b.setAttribute('aria-pressed', sel[k] === val ? 'true' : 'false');
      });
      prodEl.querySelectorAll('[data-opt-label]').forEach(function (l) { l.textContent = sel[l.getAttribute('data-opt-label')] || ''; });
      document.querySelectorAll('[data-sku]').forEach(function (el) { el.textContent = v.sku; });
      var vs = prodEl.querySelector('[data-vsize]'); if (vs) vs.textContent = v.size || '';
      prodEl.querySelector('[data-price]').textContent = money(v.price);
      var oldEl = prodEl.querySelector('[data-old]');
      if (oldEl) { oldEl.hidden = !(v.old > v.price); oldEl.textContent = v.old > v.price ? money(v.old) : ''; }
      var stEl = prodEl.querySelector('[data-stock]');
      if (stEl && 'stock' in v) { stEl.textContent = v.stock ? 'В наявності' : 'Немає в наявності — під замовлення'; stEl.className = 'stock ' + (v.stock ? 'in' : 'out'); }
      var img = prodEl.querySelector('[data-main]');
      if (v.img && img.getAttribute('src') !== v.img) { img.src = v.img; img.classList.remove('ph'); }
      if (history.replaceState) { try { history.replaceState(null, '', '#' + v.sku); } catch (e) {} }
    }
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.getAttribute('data-opt'), val = b.getAttribute('data-val');
        sel[k] = val;
        if (!match(sel).length) { // підібрати найближчий існуючий варіант
          var c = V.filter(function (v) { return v.o[k] === val; })[0]; if (c) sel = Object.assign({}, c.o);
        }
        prodEl.querySelector('[data-added]').hidden = true;
        render();
      });
    });
    var q = prodEl.querySelector('#qty');
    prodEl.querySelectorAll('[data-qty]').forEach(function (b) {
      b.addEventListener('click', function () { q.value = Math.max(1, (parseInt(q.value, 10) || 1) + parseInt(b.getAttribute('data-qty'), 10)); });
    });
    prodEl.querySelector('[data-add]').addEventListener('click', function () {
      var v = current(), cart = load(), qty = Math.max(1, parseInt(q.value, 10) || 1);
      var ex = cart.filter(function (i) { return i.sku === v.sku; })[0];
      if (ex) ex.qty += qty;
      else cart.push({ sku: v.sku, qty: qty, price: v.price, title: document.querySelector('h1').textContent,
        opt: Object.keys(v.o).map(function (k) { return k + ': ' + v.o[k]; }).join(', '),
        img: v.img ? v.img.replace(/^\.\.\//, '') : '', url: location.pathname.split('/').slice(-2).join('/') });
      save(cart);
      prodEl.querySelector('[data-added]').hidden = false;
    });
    render();
  }

  // ---------- каталог і категорії: фільтри, пошук, сортування ----------
  var cat = document.querySelector('[data-catalog]');
  if (cat) {
    var cards = Array.prototype.slice.call(cat.children);
    var facetsOf = cards.map(function (c) { try { return JSON.parse(c.getAttribute('data-f') || '{}'); } catch (e) { return {}; } });
    var params = new URLSearchParams(location.search);
    var qv = (params.get('q') || '').toLowerCase().trim();
    var f = '';
    var qi = document.getElementById('q'); if (qi && qv) qi.value = params.get('q');
    var panel = document.querySelector('[data-filters]');
    function selected() {
      var s = { price: [0, Infinity], sets: {} };
      if (!panel) return s;
      panel.querySelectorAll('[data-flt]').forEach(function (fs) {
        var k = fs.getAttribute('data-flt');
        if (k === 'price') {
          var lo = parseFloat(fs.querySelector('[data-min]').value), hi = parseFloat(fs.querySelector('[data-max]').value);
          s.price = [isNaN(lo) ? 0 : lo, isNaN(hi) ? Infinity : hi];
          return;
        }
        var vals = [];
        fs.querySelectorAll('input:checked').forEach(function (i) { vals.push(i.value); });
        if (vals.length) s.sets[k] = vals;
      });
      return s;
    }
    function apply() {
      var n = 0, s = selected(), keys = Object.keys(s.sets);
      cards.forEach(function (c, idx) {
        var price = +c.getAttribute('data-price'), fc = facetsOf[idx];
        var ok = (!f || c.getAttribute('data-cat') === f) &&
          (!qv || qv.split(/\s+/).every(function (w) { return c.getAttribute('data-title').toLowerCase().indexOf(w) >= 0; })) &&
          price >= s.price[0] && price <= s.price[1] &&
          keys.every(function (k) { var have = fc[k] || []; return s.sets[k].some(function (v) { return have.indexOf(v) >= 0; }); });
        c.hidden = !ok; if (ok) n++;
      });
      var found = document.querySelector('[data-found]'); if (found) found.textContent = 'Знайдено: ' + n;
      document.querySelector('[data-empty]').hidden = n > 0;
      var reset = panel && panel.querySelector('[data-reset]');
      if (reset) reset.hidden = !(keys.length || s.price[0] > 0 || s.price[1] < Infinity);
    }
    document.querySelectorAll('[data-filter]').forEach(function (b) {
      b.addEventListener('click', function () {
        f = b.getAttribute('data-filter');
        document.querySelectorAll('[data-filter]').forEach(function (x) { x.classList.toggle('on', x === b); });
        apply();
      });
    });
    if (panel) {
      panel.addEventListener('change', apply);
      panel.addEventListener('input', function (e) { if (e.target.type === 'number') apply(); });
      panel.querySelectorAll('[data-more]').forEach(function (b) {
        b.addEventListener('click', function () { var fs = b.closest('.flt'); fs.classList.toggle('open'); b.textContent = fs.classList.contains('open') ? 'Згорнути' : 'Показати всі'; });
      });
      panel.querySelector('[data-reset]').addEventListener('click', function () {
        panel.querySelectorAll('input').forEach(function (i) { if (i.type === 'checkbox') i.checked = false; else i.value = ''; });
        apply();
      });
      var opener = document.querySelector('[data-flt-open]');
      if (opener) opener.addEventListener('click', function () { panel.classList.toggle('open'); opener.setAttribute('aria-expanded', panel.classList.contains('open')); });
    }
    var sortEl = document.getElementById('sort');
    if (sortEl) sortEl.addEventListener('change', function (e) {
      var s = e.target.value, arr = cards.slice();
      if (s) arr.sort(function (a, b) { var d = a.getAttribute('data-price') - b.getAttribute('data-price'); return s === 'asc' ? d : -d; });
      arr.forEach(function (c) { cat.appendChild(c); });
    });
    apply();
  }

  // ---------- кошик та оформлення ----------
  var checkout = document.querySelector('[data-checkout]');
  if (checkout) {
    var form = document.getElementById('order-form');
    var list = document.querySelector('[data-cart-list]');
    var API = '/api/';
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    function total() { return load().reduce(function (s, i) { return s + i.price * i.qty; }, 0); }
    function drawCart() {
      var cart = load();
      document.querySelector('[data-cart-empty]').hidden = cart.length > 0;
      checkout.hidden = cart.length === 0;
      var html = '';
      cart.forEach(function (i, n) {
        html += '<div class="cart-row">' + (i.img ? '<img src="' + esc(i.img) + '" alt="">' : '<span></span>') +
          '<div class="t"><a href="' + esc(i.url) + '">' + esc(i.title) + '</a><small>' + esc(i.opt) + ' · ' + esc(i.sku) + '</small><small>' + money(i.price) + ' × ' + i.qty + ' = <b>' + money(i.price * i.qty) + '</b></small></div>' +
          '<div class="qty"><button type="button" data-d="' + n + '" data-v="-1" aria-label="Менше">−</button><input id="cq' + n + '" value="' + i.qty + '" readonly aria-label="Кількість"><button type="button" data-d="' + n + '" data-v="1" aria-label="Більше">+</button></div>' +
          '<button type="button" class="rm" data-rm="' + n + '" aria-label="Видалити">×</button></div>';
      });
      list.innerHTML = html;
      document.querySelector('[data-total]').textContent = money(total());
      shipText();
      list.querySelectorAll('[data-d]').forEach(function (b) {
        b.addEventListener('click', function () { var c = load(), k = +b.getAttribute('data-d'); c[k].qty = Math.max(1, c[k].qty + +b.getAttribute('data-v')); save(c); drawCart(); });
      });
      list.querySelectorAll('[data-rm]').forEach(function (b) {
        b.addEventListener('click', function () { var c = load(); c.splice(+b.getAttribute('data-rm'), 1); save(c); drawCart(); });
      });
    }

    // --- телефон: маска +380 XX XXX XX XX
    var phone = document.getElementById('o-phone');
    function normPhone(v) {
      var d = v.replace(/\D/g, '');
      while (d.length > 9 && d.indexOf('380') === 0) d = d.slice(3); // +380 вже є в полі, а людина вводить номер ще раз з +380
      if (d.length > 9 && d.indexOf('80') === 0) d = d.slice(2);
      if (d.indexOf('0') === 0) d = d.slice(1);
      return d.slice(0, 9);
    }
    phone.addEventListener('focus', function () { if (!phone.value) phone.value = '+380 '; });
    phone.addEventListener('input', function () {
      var d = normPhone(phone.value), out = '+380';
      if (d.length) out += ' ' + d.slice(0, 2);
      if (d.length > 2) out += ' ' + d.slice(2, 5);
      if (d.length > 5) out += ' ' + d.slice(5, 7);
      if (d.length > 7) out += ' ' + d.slice(7, 9);
      phone.value = out;
    });

    // --- спосіб доставки
    var method = 'np', city = null, branch = null, manual = false;
    function shipText() {
      var free = +document.body.getAttribute('data-free-ship') || 0;
      var el = document.querySelector('[data-ship]');
      if (!el) return;
      if (method === 'pickup' || (free && total() >= free)) el.textContent = 'безкоштовно';
      else el.textContent = 'за тарифами перевізника' + (free ? ' (безкоштовно від ' + money(free) + ')' : '');
    }
    function setMethod(m) {
      method = m;
      checkout.querySelectorAll('[data-for]').forEach(function (el) { el.hidden = el.getAttribute('data-for').split(' ').indexOf(m) < 0; });
      var pickup = m === 'pickup';
      checkout.querySelector('[data-pay="cod"]').hidden = pickup;
      checkout.querySelector('[data-pay="cash"]').hidden = !pickup;
      var pay = form.querySelector('input[name="payment"]:checked');
      if (pay && pay.closest('label').hidden) form.querySelector('input[name="payment"][value="' + (pickup ? 'cash' : 'cod') + '"]').checked = true;
      shipText();
      resetCity();
    }
    form.querySelectorAll('input[name="method"]').forEach(function (r) { r.addEventListener('change', function () { setMethod(r.value); }); });

    // --- автодоповнення
    function autocomplete(box, opts) {
      var input = box.querySelector('input'), ul = box.querySelector('ul'), items = [], active = -1, timer;
      function close() { ul.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; }
      function show(arr, info) {
        items = arr;
        ul.innerHTML = info ? '<li class="info">' + esc(info) + '</li>' : arr.map(function (it, i) {
          return '<li role="option" id="' + input.id + '-o' + i + '" data-i="' + i + '">' + esc(it.title) + (it.sub ? '<small>' + esc(it.sub) + '</small>' : '') + '</li>';
        }).join('');
        ul.hidden = false; input.setAttribute('aria-expanded', 'true');
      }
      function pick(i) { var it = items[i]; if (!it) return; input.value = it.value || it.title; close(); opts.onPick(it); }
      ul.addEventListener('mousedown', function (e) { var li = e.target.closest('li[data-i]'); if (li) { e.preventDefault(); pick(+li.getAttribute('data-i')); } });
      input.addEventListener('keydown', function (e) {
        if (ul.hidden) return;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault(); active = Math.max(0, Math.min(items.length - 1, active + (e.key === 'ArrowDown' ? 1 : -1)));
          ul.querySelectorAll('li').forEach(function (li, i) { li.setAttribute('aria-selected', i === active ? 'true' : 'false'); if (i === active) li.scrollIntoView({ block: 'nearest' }); });
        } else if (e.key === 'Enter') { e.preventDefault(); pick(active < 0 ? 0 : active); } else if (e.key === 'Escape') close();
      });
      input.addEventListener('blur', function () { setTimeout(close, 150); });
      input.addEventListener('input', function () {
        opts.onType && opts.onType();
        clearTimeout(timer);
        timer = setTimeout(function () { opts.source(input.value.trim(), show); }, opts.delay || 250);
      });
      input.addEventListener('focus', function () { if (opts.onFocus) opts.onFocus(input.value.trim(), show); });
      return { input: input, close: close };
    }
    function getJSON(url) { return fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }

    var manualNote = checkout.querySelector('[data-manual]');
    function setManual(on) { manual = on; manualNote.hidden = !on; brAc.input.disabled = !city && !on; brAc.input.placeholder = on ? 'Номер або індекс відділення' : (city ? 'Оберіть або введіть номер' : 'Спершу оберіть місто'); }
    var cityAc = autocomplete(checkout.querySelector('[data-ac="city"]'), {
      delay: 300,
      onType: function () { city = null; branch = null; branches = null; brAc.input.value = ''; if (!manual) brAc.input.disabled = true; },
      source: function (q, show) {
        if (q.length < 2) return show([], 'Введіть щонайменше 2 літери');
        var src = method === 'up' ? 'up/cities' : 'np/cities';
        getJSON(API + src + '?q=' + encodeURIComponent(q)).then(function (d) {
          if (d.manual) { setManual(true); return show([], 'Довідник недоступний, впишіть вручну'); }
          setManual(false);
          show(d.items.map(function (c) { return { title: c.name, sub: c.label, value: c.name, id: c.id, label: c.label }; }), d.items.length ? '' : 'Нічого не знайдено');
        }).catch(function () { setManual(true); show([], 'Довідник недоступний, впишіть вручну'); });
      },
      onPick: function (c) { city = c; branch = null; branches = null; brAc.input.value = ''; brAc.input.disabled = false; brAc.input.placeholder = 'Оберіть або введіть номер'; cityAc.input.classList.remove('invalid'); if (method !== 'np_courier') { brAc.input.focus(); } }
    });
    var branches = null;
    function loadBranches(cb) {
      if (branches) return cb(branches);
      var src = method === 'up' ? 'up/offices' : 'np/warehouses';
      getJSON(API + src + '?city=' + encodeURIComponent(city.id)).then(function (d) {
        if (d.manual) { setManual(true); branches = []; return cb([]); }
        branches = d.items; cb(branches);
      }).catch(function () { setManual(true); branches = []; cb([]); });
    }
    function filterBranches(q, show) {
      if (!city) return show([], 'Спершу оберіть місто');
      loadBranches(function (all) {
        if (manual) return;
        var w = q.toLowerCase().split(/\s+/).filter(Boolean);
        var res = all.filter(function (b) { var t = (b.name + ' ' + b.address).toLowerCase(); return w.every(function (x) { return t.indexOf(x) >= 0; }); }).slice(0, 60);
        show(res.map(function (b) { return { title: b.name, sub: b.address, value: b.name, id: b.id }; }), res.length ? '' : (all.length ? 'Нічого не знайдено' : 'У цьому місті немає відділень'));
      });
    }
    var brAc = autocomplete(checkout.querySelector('[data-ac="branch"]'), {
      delay: 120, source: filterBranches, onFocus: filterBranches,
      onType: function () { branch = null; },
      onPick: function (b) { branch = b; brAc.input.classList.remove('invalid'); }
    });
    function resetCity() { city = null; branch = null; branches = null; cityAc.input.value = ''; brAc.input.value = ''; setManual(false); }

    // --- відправка
    var err = document.querySelector('[data-err]');
    var submitBtn = document.querySelector('[data-submit]');
    function orderText(o) {
      var t = 'Замовлення з сайту\n\n';
      o.items.forEach(function (i) { t += '• ' + i.title + ' (' + i.opt + ', ' + i.sku + ') × ' + i.qty + ' = ' + money(i.price * i.qty) + '\n'; });
      t += '\nРазом: ' + money(total()) + '\n\n' + o.customer.lastName + ' ' + o.customer.firstName + '\nТелефон: ' + o.customer.phone +
        '\nДоставка: ' + ({ np: 'Нова пошта', np_courier: 'Кур’єр НП', up: 'Укрпошта', pickup: 'Самовивіз' }[o.delivery.method]) +
        (o.delivery.city ? ', ' + o.delivery.city : '') + (o.delivery.branch ? ', ' + o.delivery.branch : '') + (o.delivery.address ? ', ' + o.delivery.address : '') +
        (o.comment ? '\nКоментар: ' + o.comment : '');
      return t;
    }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var bad = [];
      form.querySelectorAll('.invalid').forEach(function (x) { x.classList.remove('invalid'); });
      function need(el, ok) { if (!ok) { el.classList.add('invalid'); bad.push(el); } }
      var f = new FormData(form);
      need(document.getElementById('o-last'), (f.get('lastName') || '').trim().length > 1);
      need(document.getElementById('o-first'), (f.get('firstName') || '').trim().length > 1);
      need(phone, normPhone(phone.value).length === 9);
      var cityName = cityAc.input.value.trim(), brName = brAc.input.value.trim();
      if (method !== 'pickup') need(cityAc.input, manual ? cityName.length > 1 : !!city);
      if (method === 'np' || method === 'up') need(brAc.input, manual ? brName.length > 0 : !!branch);
      if (method === 'np_courier') need(document.getElementById('o-addr'), (f.get('address') || '').trim().length > 4);
      if (bad.length) { err.textContent = 'Перевірте виділені поля.'; err.hidden = false; bad[0].focus(); return; }
      err.hidden = true;
      var o = {
        website: f.get('website'),
        customer: { lastName: f.get('lastName').trim(), firstName: f.get('firstName').trim(), phone: '+380' + normPhone(phone.value), email: (f.get('email') || '').trim() },
        delivery: {
          method: method,
          city: method === 'pickup' ? '' : (city ? (city.label || city.title) : cityName),
          branch: (method === 'np' || method === 'up') ? (branch ? branch.title + (method === 'up' && branch.sub ? ', ' + branch.sub : '') : brName) : '',
          address: method === 'np_courier' ? f.get('address').trim() : '',
          pickupAddress: method === 'pickup' ? checkout.querySelector('.pickup b').textContent : ''
        },
        payment: f.get('payment'),
        comment: (f.get('comment') || '').trim(),
        callMe: !f.get('nocall'),
        items: load().map(function (i) { return { sku: i.sku, title: i.title, opt: i.opt, qty: i.qty, price: i.price }; }),
        // Для автозаповнення наступного замовлення з кабінету
        ref: {
          cityId: city ? city.id : '', cityName: city ? city.title : cityName, cityLabel: city ? (city.label || city.title) : cityName,
          branchId: branch ? branch.id : '', branchTitle: branch ? branch.title : brName, branchSub: branch ? (branch.sub || '') : ''
        }
      };
      submitBtn.disabled = true; submitBtn.textContent = 'Надсилаємо…';
      fetch(API + 'order', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(o) })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (res) {
          if (!res.ok || !res.d.ok) throw new Error((res.d && res.d.error || 'http') + (res.d && res.d.details ? ': ' + res.d.details.join('; ') : ''));
          document.querySelector('[data-order-id]').textContent = res.d.id;
          document.querySelector('[data-order-phone]').textContent = o.customer.phone;
          save([]); checkout.hidden = true; document.querySelector('[data-done]').hidden = false; scrollTo(0, 0);
          var accCta = document.querySelector('[data-done-acc]');
          if (loggedIn) { if (accCta) accCta.innerHTML = 'Статус замовлення можна переглядати в <a href="/kabinet.html#orders">особистому кабінеті</a>.'; }
          else {
            // запам'ятовуємо номер, щоб після реєстрації це замовлення само з'явилося в кабінеті
            try { var mo = JSON.parse(localStorage.getItem('dr-my-orders')) || []; mo.unshift({ id: res.d.id, phone: o.customer.phone }); localStorage.setItem('dr-my-orders', JSON.stringify(mo.slice(0, 20))); } catch (e) {}
            if (accCta) accCta.innerHTML = '<a href="/kabinet.html#register">Створіть особистий кабінет</a>, щоб стежити за статусом замовлення. Це замовлення з’явиться там автоматично.';
          }
          if (accCta) accCta.hidden = false;
        })
        .catch(function (ex) {
          var t = orderText(o);
          var ec = document.querySelector('[data-err-code]'); if (ec) ec.textContent = 'Код помилки: ' + (ex && ex.message || 'network');
          document.querySelector('[data-order-text]').textContent = t;
          var tg = document.querySelector('[data-tg]'); if (tg) tg.href = tg.href.split('?')[0] + '?text=' + encodeURIComponent(t);
          checkout.hidden = true; document.querySelector('[data-fallback]').hidden = false; scrollTo(0, 0);
        })
        .then(function () { submitBtn.disabled = false; submitBtn.textContent = 'Підтвердити замовлення'; });
    });
    var cp = document.querySelector('[data-copy]');
    cp.addEventListener('click', function () {
      var pre = document.querySelector('[data-order-text]');
      var p = navigator.clipboard ? navigator.clipboard.writeText(pre.textContent) : Promise.reject();
      p.then(function () { cp.textContent = 'Скопійовано'; }).catch(function () {
        var r = document.createRange(); r.selectNodeContents(pre); var s = getSelection(); s.removeAllRanges(); s.addRange(r);
      });
    });
    setMethod('np');
    drawCart();

    // --- кабінет: підставляємо дані покупця та останню доставку
    var accNote = document.querySelector('[data-acc-note]');
    var loggedIn = false;
    function prefill(cu) {
      function put(id, v) { var el = document.getElementById(id); if (el && !el.value && v) el.value = v; }
      put('o-last', cu.last_name); put('o-first', cu.first_name); put('o-email', cu.email);
      if (cu.phone && normPhone(phone.value).length < 9) { phone.value = cu.phone; phone.dispatchEvent(new Event('input')); }
      var d = cu.delivery;
      if (!d || !d.method) return;
      var r = form.querySelector('input[name="method"][value="' + d.method + '"]');
      if (!r) return;
      r.checked = true; setMethod(d.method);
      if (d.city && d.city.name) {
        cityAc.input.value = d.city.name;
        if (d.city.id) { city = { title: d.city.name, value: d.city.name, id: d.city.id, label: d.city.label }; brAc.input.disabled = false; brAc.input.placeholder = 'Оберіть або введіть номер'; }
        else setManual(true);
      }
      if (d.branch && d.branch.title) {
        brAc.input.value = d.branch.title;
        if (d.branch.id && city) branch = { title: d.branch.title, sub: d.branch.sub, id: d.branch.id, value: d.branch.title };
        else setManual(true);
      }
      if (d.address) put('o-addr', d.address);
    }
    var hasAcc = false; try { hasAcc = !!localStorage.getItem('dr-acc'); } catch (e) {}
    if (hasAcc) {
      fetch('/api/account/me', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
        if (!d || !d.customer) { if (window.DR) window.DR.setAccount(null); throw 0; }
        loggedIn = true; prefill(d.customer);
        if (accNote) { accNote.innerHTML = 'Дані підставлено з вашого <a href="/kabinet.html#profile">кабінету</a>. Замовлення збережеться в історії.'; accNote.hidden = false; }
      }).catch(function () { guestNote(); });
    } else guestNote();
    function guestNote() {
      if (!accNote) return;
      accNote.innerHTML = 'Маєте кабінет? <a href="/kabinet.html?next=koshyk">Увійдіть</a>, і дані підставляться самі, а замовлення збережеться в історії.';
      accNote.hidden = false;
    }
  }
})();

// Відгук: надсилаємо на модерацію
(function () {
  var f = document.querySelector('[data-review]');
  if (!f) return;
  f.addEventListener('submit', function (e) {
    e.preventDefault();
    var err = f.querySelector('[data-rev-err]'), btn = f.querySelector('button');
    var r = f.querySelector('input[name="rating"]:checked');
    var data = { product: f.getAttribute('data-review'), rating: r ? +r.value : 0, name: f.elements.name.value.trim(), text: f.elements.text.value.trim(), website: f.elements.website.value };
    var msg = !data.rating ? 'Оберіть оцінку від 1 до 5 зірок.' : data.name.length < 2 ? 'Вкажіть ваше ім’я.' : data.text.length < 5 ? 'Напишіть кілька слів про товар.' : '';
    if (msg) { err.textContent = msg; err.hidden = false; return; }
    err.hidden = true; btn.disabled = true;
    fetch('/api/review', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) })
      .then(function (res) { return res.json().then(function (j) { return [res.status, j]; }); })
      .then(function (x) {
        if (x[1].ok) { f.hidden = true; document.querySelector('[data-rev-ok]').hidden = false; return; }
        err.textContent = x[0] === 429 ? 'Забагато відгуків за годину. Спробуйте пізніше.' : 'Перевірте поля форми і спробуйте ще раз.'; err.hidden = false;
      })
      .catch(function () { err.textContent = 'Немає з’єднання. Спробуйте ще раз.'; err.hidden = false; })
      .then(function () { btn.disabled = false; });
  });
})();

// Меню «Каталог»: закривати по кліку поза ним і по Esc
(function () {
  var mm = document.querySelector('.mm');
  if (!mm) return;
  document.addEventListener('click', function (e) { if (mm.open && !mm.contains(e.target)) mm.open = false; });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && mm.open) { mm.open = false; mm.querySelector('summary').focus(); } });
})();

// Збережені товари (сердечко) і кабінет у шапці. Гість — список у браузері; після входу — ще й у кабінеті на сервері.
(function () {
  var WK = 'shop-wish-v1', AK = 'dr-acc';
  function wl() { try { return JSON.parse(localStorage.getItem(WK)) || []; } catch (e) { return []; } }
  function acc() { try { return JSON.parse(localStorage.getItem(AK)); } catch (e) { return null; } }
  function paint() {
    var a = wl(), me = acc();
    document.querySelectorAll('[data-wish-count]').forEach(function (el) { el.textContent = a.length; el.hidden = !a.length; });
    document.querySelectorAll('[data-wish]').forEach(function (b) {
      var on = a.indexOf(b.getAttribute('data-wish')) >= 0;
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.title = on ? 'Прибрати зі збережених' : 'Зберегти';
      var l = b.querySelector('[data-wish-label]'); if (l) l.textContent = on ? 'Збережено' : 'Зберегти';
    });
    document.querySelectorAll('[data-acc-name]').forEach(function (el) { el.textContent = me && me.name ? me.name : 'Увійти'; });
  }
  function setWl(a) { try { localStorage.setItem(WK, JSON.stringify(a.slice(0, 200))); } catch (e) {} paint(); }
  function setAcc(c) {
    try { if (c) localStorage.setItem(AK, JSON.stringify({ name: c.first_name || 'Кабінет' })); else localStorage.removeItem(AK); } catch (e) {}
    paint();
  }
  function send(add, remove) {
    if (!acc()) return Promise.resolve(null);
    return fetch('/api/account/wishlist', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-req': '1' }, body: JSON.stringify({ add: add, remove: remove }) })
      .then(function (r) { if (r.status === 401) { setAcc(null); return null; } return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }
  function toggle(slug) {
    var a = wl(), i = a.indexOf(slug);
    if (i >= 0) { a.splice(i, 1); send([], [slug]); } else { a.unshift(slug); send([slug], []); }
    setWl(a);
    document.dispatchEvent(new CustomEvent('dr:wish', { detail: { slug: slug, on: i < 0 } }));
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-wish]');
    if (!b) return;
    e.preventDefault(); toggle(b.getAttribute('data-wish'));
  });
  window.addEventListener('storage', function (e) { if (e.key === WK || e.key === AK) paint(); });
  window.DR = { wishList: wl, setWish: setWl, sendWish: send, account: acc, setAccount: setAcc, paint: paint };
  paint();
  // Раз за візит підтягуємо збережене в кабінеті (наприклад, з іншого пристрою)
  var synced = false; try { synced = !!sessionStorage.getItem('dr-wsync'); sessionStorage.setItem('dr-wsync', '1'); } catch (e) {}
  if (acc() && !synced && !document.querySelector('[data-account]')) {
    send(wl(), []).then(function (d) { if (d && d.items) setWl(d.items.map(function (i) { return i.slug; })); });
  }
})();
