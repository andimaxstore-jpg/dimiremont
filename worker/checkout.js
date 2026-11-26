/**
 * Способи доставки й оплати в кошику. Редагуються в адмінці (розділ «Доставка й оплата»), зберігаються в settings.checkout.
 *
 * Доставка: { id, kind, active, title, subtitle, info, cost_note, free, threshold }
 *   kind визначає, які поля просить форма:
 *     np         — місто + відділення/поштомат Нової пошти (довідник НП)
 *     np_courier — місто (довідник НП) + адреса
 *     up         — місто + відділення Укрпошти (довідник Укрпошти)
 *     pickup     — нічого, показуємо адресу й час самовивозу
 *     address    — власний спосіб: місто + адреса
 *     none       — власний спосіб: без адреси (лише текст-підказка)
 *   free      — завжди безкоштовно; threshold — діє «Безкоштовна доставка від …».
 * Оплата: { id, active, title, subtitle, info, for: [id доставки] } — порожній for = для всіх.
 * Вбудовані способи (np, np_courier, up, pickup; cod, card, cash) не видаляються, лише вимикаються.
 */
export const KINDS = ['np', 'np_courier', 'up', 'pickup', 'address', 'none'];
export const CITY_KINDS = ['np', 'np_courier', 'up', 'address'];
export const BRANCH_KINDS = ['np', 'up'];
export const ADDRESS_KINDS = ['np_courier', 'address'];

const CARRIER = 'за тарифами перевізника';
export const DELIVERY_DEFAULTS = [
  { id: 'np', kind: 'np', active: true, title: 'Нова пошта', subtitle: 'Відділення або поштомат', info: '', cost_note: CARRIER, free: false, threshold: true },
  { id: 'np_courier', kind: 'np_courier', active: true, title: 'Кур’єр Нової пошти', subtitle: 'Доставка на адресу', info: '', cost_note: CARRIER, free: false, threshold: true },
  { id: 'up', kind: 'up', active: true, title: 'Укрпошта', subtitle: 'Відділення Укрпошти', info: '', cost_note: CARRIER, free: false, threshold: true },
  { id: 'pickup', kind: 'pickup', active: true, title: 'Самовивіз', subtitle: '', info: '', cost_note: '', free: true, threshold: false },
];
export const PAYMENT_DEFAULTS = [
  { id: 'cod', active: true, title: 'Накладений платіж', subtitle: 'Оплата при отриманні', info: '', for: ['np', 'np_courier', 'up'] },
  { id: 'cash', active: true, title: 'Готівкою або карткою', subtitle: 'При самовивозі', info: '', for: ['pickup'] },
  { id: 'card', active: true, title: 'На рахунок або картку', subtitle: 'Реквізити надішле менеджер після підтвердження', info: '', for: [] },
];
const BUILTIN_D = DELIVERY_DEFAULTS.map((d) => d.id);
const BUILTIN_P = PAYMENT_DEFAULTS.map((p) => p.id);
export const isBuiltin = (id) => BUILTIN_D.includes(id) || BUILTIN_P.includes(id);

const s = (v, n = 300) => String(v == null ? '' : v).replace(/\r/g, '').trim().slice(0, n);
const okId = (v) => /^[a-z][a-z0-9_]{0,30}$/.test(String(v || ''));

/** Очищає дані з адмінки. Повертає { delivery, payment } або кидає Error з текстом для менеджера. */
export function cleanCheckout(b) {
  const seen = new Set();
  const delivery = [];
  for (const x of Array.isArray(b && b.delivery) ? b.delivery.slice(0, 30) : []) {
    if (!x || !okId(x.id) || seen.has(x.id)) continue;
    seen.add(x.id);
    const def = DELIVERY_DEFAULTS.find((d) => d.id === x.id);
    const kind = def ? def.kind : (['address', 'none'].includes(x.kind) ? x.kind : 'none');
    const title = s(x.title, 80) || (def && def.title);
    if (!title) throw new Error('Вкажіть назву для кожного способу доставки');
    delivery.push({ id: x.id, kind, active: !!x.active, title, subtitle: s(x.subtitle, 200), info: s(x.info, 1500),
      cost_note: s(x.cost_note, 120), free: !!x.free, threshold: !x.free && !!x.threshold });
  }
  for (const d of DELIVERY_DEFAULTS) if (!seen.has(d.id)) delivery.push({ ...d, active: false });
  const dIds = delivery.map((d) => d.id);
  const payment = [];
  for (const x of Array.isArray(b && b.payment) ? b.payment.slice(0, 30) : []) {
    if (!x || !okId(x.id) || seen.has(x.id)) continue;
    seen.add(x.id);
    const def = PAYMENT_DEFAULTS.find((p) => p.id === x.id);
    const title = s(x.title, 80) || (def && def.title);
    if (!title) throw new Error('Вкажіть назву для кожного способу оплати');
    const f = (Array.isArray(x.for) ? x.for : []).filter((id) => dIds.includes(id));
    payment.push({ id: x.id, active: !!x.active, title, subtitle: s(x.subtitle, 200), info: s(x.info, 1500), for: f.length === dIds.length ? [] : f });
  }
  for (const p of PAYMENT_DEFAULTS) if (!seen.has(p.id)) payment.push({ ...p, active: false });
  const on = delivery.filter((d) => d.active);
  if (!on.length) throw new Error('Увімкніть хоча б один спосіб доставки');
  for (const d of on) if (!payment.some((p) => p.active && (!p.for.length || p.for.includes(d.id))))
    throw new Error(`Для «${d.title}» немає жодного увімкненого способу оплати`);
  return { delivery, payment };
}

/** Налаштування з бази + значення за замовчуванням (поки менеджер нічого не зберігав — як було раніше). */
export function checkoutConfig(settings, raw = false) {
  const st = settings || {};
  const c = st.checkout && typeof st.checkout === 'object' ? st.checkout : null;
  let delivery = c && Array.isArray(c.delivery) ? c.delivery : DELIVERY_DEFAULTS;
  let payment = c && Array.isArray(c.payment) ? c.payment : PAYMENT_DEFAULTS;
  for (const d of DELIVERY_DEFAULTS) if (!delivery.some((x) => x.id === d.id)) delivery = [...delivery, d];
  for (const p of PAYMENT_DEFAULTS) if (!payment.some((x) => x.id === p.id)) payment = [...payment, p];
  if (!raw) delivery = delivery.map((d) => ({ ...d, subtitle: d.subtitle || autoSubtitle(d, st) }));
  return { delivery, payment };
}

/** Підпис під назвою, якщо менеджер його не задав. Для самовивозу — адреса (без «, безкоштовно» з порожньою адресою). */
function autoSubtitle(d, st) {
  if (d.kind !== 'pickup') return '';
  const addr = s(st.pickup_address, 200);
  return addr ? `${addr}, безкоштовно` : 'Безкоштовно';
}

export const activeDelivery = (cfg) => cfg.delivery.filter((d) => d.active);
export const paymentsFor = (cfg, deliveryId) => cfg.payment.filter((p) => p.active && (!(p.for || []).length || p.for.includes(deliveryId)));
export const deliveryTitle = (cfg, id) => (cfg.delivery.find((d) => d.id === id) || {}).title || id || '';
export const paymentTitle = (cfg, id) => (cfg.payment.find((p) => p.id === id) || {}).title || id || '';

/** Поріг безкоштовної доставки, лише якщо є увімкнений спосіб, на який він діє (для кошика, розмітки й фіду Google). */
export function freeShipFrom(settings) {
  const free = +(settings && settings.free_ship_from) || 0;
  if (!free) return 0;
  return activeDelivery(checkoutConfig(settings)).some((d) => d.threshold) ? free : 0;
}

/** Назва перевізника для фіду Google: перший увімкнений спосіб із безкоштовною доставкою від порогу. */
export function thresholdCarrier(settings) {
  const d = activeDelivery(checkoutConfig(settings)).find((x) => x.threshold);
  return d ? d.title : '';
}
