# Розгортання «Дім і Ремонт» на Cloudflare

Сайт = Cloudflare Worker `dimiremont`: статичні сторінки з `site/` + серверний код `worker/worker.js` (прийом замовлень, довідники НП/Укрпошти).

## Збірка
    python3 build.py          # генерує site/
    npx wrangler deploy       # викладає Worker (потрібен Node.js 18+ і вхід: npx wrangler login)

## Секрети Worker (Cloudflare → Workers & Pages → dimiremont → Settings → Variables and Secrets → Add → Secret)
- ADMIN_PASSWORD     — пароль входу в бек-офіс https://dimiremont.com.ua/admin/ (довгий, 12+ символів)
- TELEGRAM_BOT_TOKEN — токен бота від @BotFather
- TELEGRAM_CHAT_ID   — ваш числовий id (дізнатися: напишіть @userinfobot) або id групи; кілька — через кому
- NP_API_KEY         — ключ API Нової пошти (кабінет НП → Налаштування → Безпека → Ключ API)
- UP_TOKEN           — bearer-токен Укрпошти (видається за договором); без нього клієнт вписує відділення Укрпошти вручну

Перевірка: відкрийте /api/health — побачите, які секрети та база підключені (`db`, `admin`).

## База D1 і бек-офіс
Товари, категорії, характеристики, фільтри, сторінки, налаштування та замовлення зберігаються в базі Cloudflare D1 `dimiremont-db` (binding `DB`).
- Базу створює сам `wrangler deploy` при першому розгортанні (у `wrangler.jsonc` немає `database_id`, тож Wrangler її створить і підв'яже).
  Якщо збірка впаде з помилкою про D1: Cloudflare → Storage & Databases → D1 → Create → назва `dimiremont-db`, скопіюйте Database ID у `wrangler.jsonc` (`"database_id": "..."`) і запустіть збірку ще раз.
- Таблиці створюються, а товари з `data/seed.json` заливаються автоматично при першому запиті до сайту. Далі джерело правди — база, а не файли в репозиторії.
- Фото, завантажені в адмінці, зберігаються в тій самій базі й віддаються за адресою `/media/<id>`.
- Резервна копія: адмінка → Налаштування → «Завантажити резервну копію».
- Якщо базу не підключено, сайт працює як раніше — зі статичних сторінок `site/`.


## Автопублікація
Воркер підключено до GitHub (Cloudflare Workers Builds): кожен push у гілку `main` запускає `npx wrangler deploy`.
Перед комітом запускайте `python3 build.py`, бо `site/` зберігається в репозиторії вже зібраним.
