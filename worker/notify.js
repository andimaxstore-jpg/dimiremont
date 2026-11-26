/**
 * Сповіщення покупцям про замовлення: email (Resend) і SMS (TurboSMS або SMSClub).
 *
 * Дві події:
 *  - accepted — «Дякуємо, замовлення взято в роботу»: одразу після оформлення або коли менеджер ставить «Підтверджене»/«Оплачене»;
 *  - shipped  — «Відправлено, ТТН …»: статус «Відправлене» і заповнений номер ТТН.
 *
 * Налаштування (вмикачі й шаблони) — у D1 settings key `notify`, редагуються в адмінці.
 * Ключі доступу — секрети Worker: RESEND_API_KEY (email), SMS_TOKEN (SMS). У базу їх не пишемо.
 * Що й коли надіслано — у колонці orders.notify (JSON), щоб не слати двічі.
 */

export const EVENTS = ['accepted', 'shipped'];
export const SMS_PROVIDERS = { turbosms: 'TurboSMS', smsclub: 'SMSClub' };

export const NOTIFY_DEFAULTS = {
  email: { enabled: false, from_name: 'Дім і Ремонт', from_email: 'zamovlennia@dimiremont.com.ua', reply_to: '' },
  sms: { enabled: false, provider: 'turbosms', sender: '' },
  accepted: {
    when: 'confirmed', email: true, sms: true,
    subject: 'Замовлення №{order} прийнято в роботу',
    email_text: 'Вітаємо, {name}!\n\nДякуємо за замовлення №{order} на суму {total}. Ми взяли його в роботу і повідомимо номер ТТН, щойно відправимо посилку.\n\nЯкщо маєте запитання, телефонуйте: {phone}.',
    sms_text: 'Дякуємо! Замовлення №{order} прийнято в роботу.',
  },
  shipped: {
    email: true, sms: true,
    subject: 'Замовлення №{order} відправлено, ТТН {ttn}',
    email_text: 'Вітаємо, {name}!\n\nВаше замовлення №{order} відправлено службою {carrier}.\nНомер ТТН: {ttn}\nВідстежити посилку: {track}\n\nДякуємо, що обрали нас!',
    sms_text: 'Замовлення №{order} відправлено. ТТН {ttn}',
  },
};

const s = (v, n = 1000) => String(v == null ? '' : v).trim().slice(0, n);
const parse = (v, d) => { try { return v == null ? d : (typeof v === 'string' ? JSON.parse(v) : v); } catch { return d; } };
const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (v) => String(Math.round(+v || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' грн';
const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

/** Конфіг з бази, доповнений значеннями за замовчуванням. */
export function notifyConfig(raw) {
  const c = parse(raw, {}) || {};
  const out = {};
  for (const [k, def] of Object.entries(NOTIFY_DEFAULTS)) out[k] = { ...def, ...(c[k] && typeof c[k] === 'object' ? c[k] : {}) };
  for (const ev of EVENTS) if (!out[ev].email_html) out[ev].email_html = textToHtml(out[ev].email_text);
  return out;
}

/** Перевірка й очищення того, що прийшло з адмінки. */
export function cleanNotify(b) {
  const c = notifyConfig(b || {});
  const e = c.email, m = c.sms;
  const out = {
    email: { enabled: !!e.enabled, from_name: s(e.from_name, 80), from_email: s(e.from_email, 120).toLowerCase(), reply_to: s(e.reply_to, 120) },
    sms: { enabled: !!m.enabled, provider: SMS_PROVIDERS[m.provider] ? m.provider : 'turbosms', sender: s(m.sender, 11) },
  };
  if (out.email.from_email && !EMAIL_RE.test(out.email.from_email)) throw new Error('Адреса відправника email виглядає неправильно');
  if (out.email.reply_to && !EMAIL_RE.test(out.email.reply_to)) throw new Error('Адреса для відповідей виглядає неправильно');
  if (out.email.enabled && !out.email.from_email) throw new Error('Вкажіть адресу відправника email');
  if (out.sms.enabled && !out.sms.sender) throw new Error('Вкажіть ім’я відправника SMS (альфа-ім’я, як зареєстровано в SMS-сервісі)');
  for (const ev of EVENTS) {
    const x = c[ev];
    const html = sanitizeHtml(x.email_html != null && String(x.email_html).trim() ? x.email_html : textToHtml(x.email_text || NOTIFY_DEFAULTS[ev].email_text));
    out[ev] = { email: !!x.email, sms: !!x.sms, subject: s(x.subject, 200), email_html: html || textToHtml(NOTIFY_DEFAULTS[ev].email_text), sms_text: s(x.sms_text, 480) };
    out[ev].email_text = htmlToText(out[ev].email_html).slice(0, 4000);
    if (ev === 'accepted') out[ev].when = x.when === 'new' ? 'new' : 'confirmed';
    if (!out[ev].subject) out[ev].subject = NOTIFY_DEFAULTS[ev].subject;
    if (!out[ev].sms_text) out[ev].sms_text = NOTIFY_DEFAULTS[ev].sms_text;
  }
  return out;
}

export async function loadNotify(db) {
  const rows = (await db.prepare(`SELECT key, value FROM settings WHERE key IN ('notify', 'shop_name', 'phone', 'site_url', 'email')`).all()).results;
  const st = {};
  for (const r of rows) st[r.key] = parse(r.value, r.value);
  return { cfg: notifyConfig(st.notify), shop: { name: s(st.shop_name) || 'Дім і Ремонт', phone: s(st.phone), site: s(st.site_url) || 'https://dimiremont.com.ua', email: s(st.email) } };
}

// ---------- шаблони ----------
function carrierOf(d) {
  if (!d) return { name: 'Нова пошта', track: (t) => `https://novaposhta.ua/tracking/?cargo_number=${encodeURIComponent(t)}` };
  const m = String(d.method || '');
  if (m === 'up' || /укрпошт/i.test(d.title || '')) return { name: 'Укрпошта', track: (t) => `https://track.ukrposhta.ua/tracking_UA.html?barcode=${encodeURIComponent(t)}` };
  return { name: 'Нова пошта', track: (t) => `https://novaposhta.ua/tracking/?cargo_number=${encodeURIComponent(t)}` };
}

/** Значення для {змінних} у шаблонах. */
export function vars(o, shop) {
  const parts = s(o.name).split(/\s+/).filter(Boolean);
  const car = carrierOf(o.delivery);
  const ttn = s(o.ttn).replace(/\s+/g, '');
  return {
    name: parts[1] || parts[0] || 'покупцю', fullname: s(o.name), order: o.id, total: money(o.total),
    ttn, carrier: car.name, track: ttn ? car.track(ttn) : '', shop: shop.name, phone: shop.phone, site: shop.site,
  };
}
export const fill = (tpl, v) => String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m));

/** Скільки SMS займе текст: кирилиця — 70 символів (67 у складеному), латиниця — 160 (153). */
export function smsParts(text) {
  const t = String(text || '');
  if (!t) return 0;
  const gsm = /^[\x20-\x7E\n\r]*$/.test(t);
  const one = gsm ? 160 : 70, multi = gsm ? 153 : 67;
  return t.length <= one ? 1 : Math.ceil(t.length / multi);
}


// ---------- HTML листа з візуального редактора ----------
const TAGS = new Set(['p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'span', 'font', 'a', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'div', 'blockquote', 'hr', 'sub', 'sup']);
const CSS_OK = new Set(['color', 'background-color', 'font-size', 'font-family', 'font-weight', 'font-style', 'text-decoration', 'text-decoration-line', 'text-align', 'line-height']);
const cleanStyle = (st) => String(st || '').split(';').map((d) => {
  const i = d.indexOf(':'); if (i < 0) return '';
  const k = d.slice(0, i).trim().toLowerCase(), v = d.slice(i + 1).trim().replace(/"/g, "'");
  if (!CSS_OK.has(k) || !v || v.length > 120 || /url\(|expression|javascript:|[<>\\]/i.test(v)) return '';
  return `${k}: ${v}`;
}).filter(Boolean).join('; ');
const unent = (x) => x.replace(/&quot;/g, '"').replace(/&#0*39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const attrOf = (tag, name) => { const m = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag); return m ? unent(m[2] ?? m[3] ?? m[4] ?? '') : null; };
const SAFE_HREF = /^(https?:\/\/|mailto:|tel:|\{(track|site)\})/i;

/** Лишає тільки безпечне форматування: теги з білого списку, стилі кольору/шрифту/розміру, посилання http(s)/mailto/tel. */
export function sanitizeHtml(html) {
  let h = String(html || '').slice(0, 30000).replace(/<(script|style|iframe|object|embed|head|title)[\s\S]*?<\/\1\s*>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  return h.replace(/<\/?([a-z0-9]+)\b[^>]*>/gi, (tag, nm) => {
    const name = nm.toLowerCase();
    if (!TAGS.has(name)) return '';
    if (tag[1] === '/') return name === 'br' || name === 'hr' ? '' : `</${name}>`;
    if (name === 'br' || name === 'hr') return `<${name}>`;
    const at = [];
    const st = cleanStyle(attrOf(tag, 'style'));
    if (st) at.push(`style="${esc(st)}"`);
    if (name === 'font') {
      const c = attrOf(tag, 'color'), f = attrOf(tag, 'face'), z = attrOf(tag, 'size');
      if (c && /^#?[0-9a-z]{3,20}$/i.test(c)) at.push(`color="${esc(c)}"`);
      if (f && /^[\w\s,'-]{1,80}$/.test(f)) at.push(`face="${esc(f)}"`);
      if (z && /^[1-7]$/.test(z)) at.push(`size="${z}"`);
    }
    if (name === 'a') { const u = (attrOf(tag, 'href') || '').trim(); if (SAFE_HREF.test(u)) at.push(`href="${esc(u)}"`, 'target="_blank"'); }
    const al = attrOf(tag, 'align'); if (al && /^(left|center|right|justify)$/i.test(al)) at.push(`align="${al.toLowerCase()}"`);
    return `<${name}${at.length ? ' ' + at.join(' ') : ''}>`;
  }).replace(/<(?!\/?[a-z0-9]+[\s>])/gi, '&lt;').trim();
}
/** Звичайний текст (старі шаблони) -> HTML абзаців. */
export const textToHtml = (text) => String(text || '').split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
/** HTML -> текст для поштових програм без HTML. */
export const htmlToText = (html) => String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|h[1-3]|li|blockquote)>/gi, '\n\n').replace(/<li[^>]*>/gi, '• ')
  .replace(/<a [^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (m, u, x) => (x.includes(u) ? x : `${x} (${u})`)).replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\n{3,}/g, '\n\n').trim();
/** Підставляє {змінні} у HTML: значення екрануються, {track} і {site} стають посиланнями, якщо стоять у тексті. */
export function fillHtml(html, v) {
  return String(html || '').replace(/(href=")?\{(\w+)\}/g, (m, href, k) => {
    if (!(k in v)) return m;
    const val = String(v[k]);
    if (href) return href + esc(val);
    if (/^https?:\/\//.test(val)) return `<a href="${esc(val)}" target="_blank" style="color:#1f6f5c">${esc(val)}</a>`;
    return esc(val);
  });
}

function emailHtml(ev, o, shop, html) {
  const link = (u) => `<a href="${esc(u)}" style="color:#1f6f5c">${esc(u)}</a>`;
  const body = `<div style="font-size:15px;line-height:1.5">${String(html).replace(/<p>/g, '<p style="margin:0 0 14px">')}</div>`;
  let extra = '';
  if (ev === 'accepted' && Array.isArray(o.items) && o.items.length) {
    const rows = o.items.map((i) => `<tr><td style="padding:6px 0;border-bottom:1px solid #eee">${esc(i.title)}${i.opt ? `<br><small style="color:#777">${esc(i.opt)}</small>` : ''}</td>
      <td style="padding:6px 0 6px 10px;border-bottom:1px solid #eee;white-space:nowrap;text-align:right">${i.qty} × ${money(i.price)}</td></tr>`).join('');
    extra = `<table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px;margin:6px 0 16px">${rows}
      <tr><td style="padding:8px 0"><b>Разом</b></td><td style="padding:8px 0;text-align:right"><b>${money(o.total)}</b></td></tr></table>`;
  }
  if (ev === 'shipped') {
    const v = vars(o, shop);
    if (v.track) extra = `<p style="margin:4px 0 18px"><a href="${esc(v.track)}" style="display:inline-block;background:#1f6f5c;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px">Відстежити посилку</a></p>`;
  }
  const foot = [shop.phone && `Телефон: ${esc(shop.phone)}`, link(shop.site)].filter(Boolean).join(' · ');
  return `<!doctype html><html lang="uk"><body style="margin:0;background:#f4f4f2;font-family:Arial,Helvetica,sans-serif;color:#222;font-size:15px;line-height:1.5">
<div style="max-width:560px;margin:0 auto;padding:24px 16px"><div style="background:#fff;border-radius:8px;padding:24px">
<p style="margin:0 0 18px;font-size:18px;font-weight:bold">${esc(shop.name)}</p>${body}${extra}</div>
<p style="font-size:12px;color:#777;text-align:center;margin:14px 0 0">${foot}</p></div></body></html>`;
}

// ---------- відправка ----------
export async function sendEmail(env, cfg, { to, subject, html, text }) {
  if (!env.RESEND_API_KEY) return { ok: false, error: 'Не задано секрет RESEND_API_KEY' };
  if (!cfg.email.from_email) return { ok: false, error: 'Не вказано адресу відправника' };
  const from = cfg.email.from_name ? `${cfg.email.from_name.replace(/[<>"]/g, '')} <${cfg.email.from_email}>` : cfg.email.from_email;
  const body = { from, to: [to], subject, html, text };
  if (cfg.email.reply_to) body.reply_to = cfg.email.reply_to;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { authorization: 'Bearer ' + String(env.RESEND_API_KEY).trim(), 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d.id) return { ok: true, id: d.id };
    return { ok: false, error: d.message || d.error || 'HTTP ' + r.status };
  } catch (e) { return { ok: false, error: 'Немає зв’язку з Resend: ' + String(e && e.message || e) }; }
}

export async function sendSms(env, cfg, { to, text }) {
  if (!env.SMS_TOKEN) return { ok: false, error: 'Не задано секрет SMS_TOKEN' };
  if (!cfg.sms.sender) return { ok: false, error: 'Не вказано ім’я відправника SMS' };
  const phone = String(to || '').replace(/\D/g, '').replace(/^0/, '380');
  if (!/^380\d{9}$/.test(phone)) return { ok: false, error: 'Номер не схожий на український: ' + to };
  const auth = { authorization: 'Bearer ' + String(env.SMS_TOKEN).trim(), 'content-type': 'application/json' };
  try {
    if (cfg.sms.provider === 'smsclub') {
      const r = await fetch('https://im.smsclub.mobi/sms/send', { method: 'POST', headers: auth, body: JSON.stringify({ phone: [phone], message: text, src_addr: cfg.sms.sender }) });
      const d = await r.json().catch(() => ({}));
      const info = d.success_request && d.success_request.info;
      if (info && Object.keys(info).length) return { ok: true, id: Object.keys(info)[0] };
      const codes = { 400: 'дані не пройшли перевірку (номер, текст або альфа-ім’я)', 401: 'неправильний токен SMS_TOKEN', 429: 'забагато запитів', 453: 'таке саме SMS уже надіслано 2 хв тому' };
      const er = d.error_request || d;
      return { ok: false, error: codes[r.status] || (er && (er.info ? JSON.stringify(er.info) : er.message)) || 'HTTP ' + r.status };
    }
    const r = await fetch('https://api.turbosms.ua/message/send.json', { method: 'POST', headers: auth, body: JSON.stringify({ recipients: [phone], sms: { sender: cfg.sms.sender, text } }) });
    const d = await r.json().catch(() => ({}));
    const one = Array.isArray(d.response_result) ? d.response_result[0] : null;
    if (one && one.message_id) return { ok: true, id: one.message_id };
    return { ok: false, error: (one && one.response_status) || d.response_status || 'HTTP ' + r.status };
  } catch (e) { return { ok: false, error: 'Немає зв’язку з SMS-сервісом: ' + String(e && e.message || e) }; }
}

/**
 * Які події треба надіслати. prev — статус і ТТН до збереження в адмінці: шлемо лише коли вони змінились,
 * щоб правка старого замовлення (напр. нотатки) не розсилала повідомлення заднім числом.
 */
export function dueEvents(cfg, o, log, { justCreated = false, prev = null } = {}) {
  const due = [];
  const ttn = s(o.ttn).replace(/\s+/g, '');
  const statusChanged = !prev || prev.status !== o.status;
  if (!log.accepted && o.status !== 'cancelled') {
    if (justCreated) { if (cfg.accepted.when === 'new') due.push('accepted'); }
    else if (statusChanged && ['confirmed', 'paid'].includes(o.status)) due.push('accepted');
  }
  const ttnChanged = !prev || s(prev.ttn).replace(/\s+/g, '') !== ttn;
  if (o.status === 'shipped' && ttn && (statusChanged || ttnChanged) && (!log.shipped || log.shipped.ttn !== ttn)) due.push('shipped');
  return due;
}

/** Надсилає одну подію покупцю за всіма увімкненими каналами. Повертає запис для журналу. */
export async function sendEvent(env, cfg, shop, ev, o) {
  const e = cfg[ev], v = vars(o, shop);
  const rec = { at: new Date().toISOString() };
  if (ev === 'shipped') rec.ttn = v.ttn;
  if (cfg.email.enabled && e.email) {
    const to = s(o.email);
    if (!to) rec.email = { ok: false, skipped: true, error: 'Покупець не вказав email' };
    else if (!EMAIL_RE.test(to)) rec.email = { ok: false, skipped: true, error: 'Неправильний email: ' + to };
    else {
      const body = fillHtml(e.email_html, v);
      rec.email = { to, ...(await sendEmail(env, cfg, { to, subject: fill(e.subject, v), text: htmlToText(body), html: emailHtml(ev, o, shop, body) })) };
    }
  }
  if (cfg.sms.enabled && e.sms) {
    const to = s(o.phone);
    rec.sms = to ? { to, ...(await sendSms(env, cfg, { to, text: fill(e.sms_text, v) })) } : { ok: false, skipped: true, error: 'Немає телефону' };
  }
  return rec;
}

/**
 * Перевіряє замовлення і надсилає належні сповіщення. Викликається після оформлення і після кожного збереження в адмінці.
 * force: ['accepted'|'shipped'] — надіслати повторно вручну (кнопка в замовленні).
 * Повертає { sent: {подія: запис}, notes: [пояснення для менеджера] }.
 */
export async function processOrder(env, id, { justCreated = false, force = null, prev = null } = {}) {
  const db = env.DB;
  const r = await db.prepare(`SELECT * FROM orders WHERE id = ?`).bind(id).first();
  if (!r) return { sent: {}, notes: [] };
  const o = { ...r, delivery: parse(r.delivery, {}), items: parse(r.items, []) };
  const log = parse(r.notify, {}) || {};
  const { cfg, shop } = await loadNotify(db);
  const notes = [];
  if (!cfg.email.enabled && !cfg.sms.enabled) {
    if (force) notes.push('Email і SMS вимкнені в розділі «Сповіщення покупцям»');
    return { sent: {}, notes, log };
  }
  const events = force ? force.filter((x) => EVENTS.includes(x)) : dueEvents(cfg, o, log, { justCreated, prev });
  if (!force && !justCreated && o.status === 'shipped' && !s(o.ttn) && !log.shipped && (cfg.shipped.email || cfg.shipped.sms)) notes.push('Статус «Відправлене», але ТТН порожній: покупцю нічого не надіслано. Додайте ТТН і збережіть.');
  if (events.includes('shipped') && !s(o.ttn)) { events.splice(events.indexOf('shipped'), 1); notes.push('Щоб надіслати «Відправлено», спершу вкажіть ТТН'); }
  const sent = {};
  for (const ev of events) {
    const e = cfg[ev];
    if (!((cfg.email.enabled && e.email) || (cfg.sms.enabled && e.sms))) continue;
    sent[ev] = await sendEvent(env, cfg, shop, ev, o);
    log[ev] = sent[ev];
  }
  if (Object.keys(sent).length) await db.prepare(`UPDATE orders SET notify = ? WHERE id = ?`).bind(JSON.stringify(log), id).run();
  return { sent, notes, log };
}

/** Тестове повідомлення з адмінки на вказані email/телефон, на прикладі вигаданого замовлення. */
export async function testNotify(env, db, b) {
  const { shop } = await loadNotify(db);
  const cfg = cleanNotify(b.config || {});
  const ev = EVENTS.includes(b.event) ? b.event : 'accepted';
  const o = {
    id: '261126-1234', name: 'Петренко Олена', total: 1250, ttn: ev === 'shipped' ? '20450012345678' : '',
    delivery: { method: 'np', title: 'Нова пошта' }, items: [{ title: 'Самоклеюча плитка ПВХ (приклад)', opt: 'Колір: білий мармур', qty: 5, price: 250 }],
  };
  const v = vars(o, shop), e = cfg[ev], out = {};
  if (s(b.email)) {
    const body = fillHtml(e.email_html, v);
    out.email = EMAIL_RE.test(s(b.email))
      ? { to: s(b.email), ...(await sendEmail(env, cfg, { to: s(b.email), subject: '[Тест] ' + fill(e.subject, v), text: htmlToText(body), html: emailHtml(ev, o, shop, body) })) }
      : { ok: false, error: 'Неправильний email' };
  }
  if (s(b.phone)) out.sms = { to: s(b.phone), ...(await sendSms(env, cfg, { to: s(b.phone), text: fill(e.sms_text, v) })) };
  return out;
}
