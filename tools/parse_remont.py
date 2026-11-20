"""Розбирає текст каталогу 'Товари для швидкого ремонту' у список товарів з варіантами.

Кожен абзац у файлі = сторінка каталогу. Сторінки з однаковою назвою та ціною РРЦ
об'єднуються в одну картку, а артикули стають варіантами (дизайн / колір).
"""
import re, json, sys

SRC, OUT = sys.argv[1], sys.argv[2]
text = open(SRC, encoding='utf8').read()

# назва (як у каталозі) -> категорія
TITLES = {
    '3D ПАНЕЛІ "ЦЕГЛА" САМОКЛЕЮЧІ': 'stinovi-paneli',
    '3D ПАНЕЛІ САМОКЛЕЮЧІ "КЛАДКА"': 'stinovi-paneli',
    '3D ПАНЕЛІ САМОКЛЕЮЧІ "ЦЕГЛА КАТЕРИНОСЛАВСЬКА"': 'stinovi-paneli',
    '3D ПАНЕЛІ "КОЛЬОРОВІ" САМОКЛЕЮЧІ': 'stinovi-paneli',
    '3D ПАНЕЛІ "ЦЕГЛА З ДЕКОРОМ" САМОКЛЕЮЧІ': 'stinovi-paneli',
    '3D ПАНЕЛІ "МАРМУР" САМОКЛЕЮЧІ': 'stinovi-paneli',
    '3D ПАНЕЛІ "ДЕРЕВО" САМОКЛЕЮЧІ': 'stinovi-paneli',
    '3D ПАНЕЛІ "БАМБУК" САМОКЛЕЮЧІ': 'stinovi-paneli',
    '3D ПАНЕЛІ "КАМІННЯ" САМОКЛЕЮЧІ': 'stinovi-paneli',
    '3D ПАНЕЛІ САМОКЛЕЮЧІ "ДЕКОР"': 'stinovi-paneli',
    '3D ПАНЕЛІ У РУЛОНІ САМОКЛЕЮЧІ': 'stinovi-paneli',
    '3D ПАНЕЛІ "ДИТЯЧІ" САМОКЛЕЮЧІ': 'stinovi-paneli',
    '3D ПАНЕЛЬ-РЕЙКА САМОКЛЕЮЧА': 'reiky-moldyngy',
    'РЕЙКИ WPС СТІНОВІ ДЕКОРАТИВНІ': 'reiky-moldyngy',
    'РЕЙКИ PS СТІНОВІ ДЕКОРАТИВНІ': 'reiky-moldyngy',
    'ПЛИТА ПВХ ДЕКОРАТИВНА': 'dekoratyvni-plyty',
    'ПАНЕЛІ ВЕЛЮРОВІ САМОКЛЕЮЧІ В РУЛОНІ': 'dekoratyvni-plyty',
    'ЗВУКОІЗОЛЯЦІЙНІ ПАНЕЛІ САМОКЛЕЮЧІ': 'dekoratyvni-plyty',
    'ПАНЕЛІ ПЛАСТИКОВІ ДЕКОРАТИВНІ': 'dekoratyvni-plyty',
    'ГНУЧКА ШТУКАТУРКА САМОКЛЕЮЧА В РУЛОНІ': 'dekoratyvni-plyty',
    'ГНУЧКА ШОВКОВА ШТУКАТУРКА САМОКЛЕЮЧА В РУЛОНІ': 'dekoratyvni-plyty',
    'ГНУЧКА ШТУКАТУРКА САМОКЛЕЮЧА': 'dekoratyvni-plyty',
    'ПАНЕЛІ ІНТЕР’ЄРНІ САМОКЛЕЮЧІ ПІД ШКІРУ В РУЛОНІ': 'dekoratyvni-plyty',
    'ПАНЕЛІ ІНТЕР’ЄРНІ САМОКЛЕЮЧІ ПІД ШКІРУ': 'dekoratyvni-plyty',
    'ПОКРИТТЯ ВІНІЛОВЕ САМОКЛЕЮЧЕ 3D РЕЙКИ': 'reiky-moldyngy',
    'ВІНІЛОВІ 3D РЕЙКИ САМОКЛЕЮЧІ В РУЛОНІ': 'reiky-moldyngy',
    'ПЛИТКА ВІНІЛОВА У РУЛОНІ САМОКЛЕЮЧА': 'plytka',
    'ПЛИТКА ВІНІЛОВА "ЛАМІНАТ" САМОКЛЕЮЧА': 'pidloga',
    'ПЛИТКА ВІНІЛОВА САМОКЛЕЮЧА': 'plytka',
    'КАРТИНА ВІНІЛОВА САМОКЛЕЮЧА': 'dekoratyvni-plyty',
    'РЕТ ПЛИТКА У РУЛОНІ САМОКЛЕЮЧА': 'plytka',
    'РЕТ ПЛИТКА САМОКЛЕЮЧА': 'plytka',
    'ШПАЛЕРИ САМОКЛЕЮЧІ З ТЕРМОІЗОЛЯЦІЄЮ': 'dekoratyvni-plyty',
    'ПЛИТКА МОЗАЇКА З ДЕКОРАТИВНОГО СКЛА САМОКЛЕЮЧА': 'plytka',
    'ПЛИТКА МОЗАЇКА': 'plytka',
    'ПЛИТКА АЛЮМІНІЄВА САМОКЛЕЮЧА': 'plytka',
    'ПЛИТКА ПОЛІУРЕТАНОВА САМОКЛЕЮЧА': 'plytka',
    'ЕКОШКІРА У РУЛОНІ САМОКЛЕЮЧА': 'dekoratyvni-plyty',
    'ПЛІВКА ДЗЕРКАЛЬНА СОНЦЕЗАХИСНА ДЛЯ ВІКОН': 'plivky',
    'ПЛІВКА ВІКОННА': 'plivky',
    'ПЛІВКА САМОКЛЕЮЧА': 'plivky',
    'ФАСАДНІ ПАНЕЛІ': 'dekoratyvni-plyty',
    'ПРОФІЛІ МОНТАЖНІ ДЛЯ ФАСАДНИХ ПАНЕЛЕЙ': 'dekoratyvni-plyty',
    'ПЛИТКА КОМПОЗИТНА ДПК': 'pidloga',
    'ПЛИТКА LVT ПІДЛОГОВА САМОКЛЕЮЧА': 'pidloga',
    'ПОКРИТТЯ ПІДЛОГОВЕ ВІНІЛОВЕ САМОКЛЕЮЧЕ У РУЛОНІ': 'pidloga',
    'ПОКРИТТЯ ПІДЛОГОВЕ ВІНІЛОВЕ': 'pidloga',
    'ПЛИТКА КОВРОЛІНОВА У РУЛОНІ САМОКЛЕЮЧА': 'pidloga',
    'ПЛИТКА КОВРОЛІНОВА САМОКЛЕЮЧА': 'pidloga',
    'ПЛИТКА КОВРОЛІНОВА': 'pidloga',
    'КОВРОЛІН В ПЛИТКАХ': 'pidloga',
    'ПОКРИТТЯ ТЕПЛЕ ПІДЛОГОВЕ «ПАЗЛИ ПЛЮШЕВІ»': 'pidloga',
    'ПОКРИТТЯ ТЕПЛЕ ПІДЛОГОВЕ «ПАЗЛИ»': 'pidloga',
    'ПОКРИТТЯ ТЕПЛЕ ПІДЛОГОВЕ': 'pidloga',
    'ПЛИТКА ПВХ ДЕКОРАТИВНА САМОКЛЕЮЧА': 'plytka',
    'ПЛІНТУСИ ПОЛІПРОПІЛЕНОВІ САМОКЛЕЮЧІ': 'reiky-moldyngy',
    'МОЛДИНГИ ВІНІЛОВІ САМОКЛЕЮЧІ': 'reiky-moldyngy',
    'МОЛДИНГИ ДЕКОРАТИВНІ САМОКЛЕЮЧІ': 'reiky-moldyngy',
    'МОЛДИНГ D-ПОДІБНИЙ САМОКЛЕЮЧИЙ': 'reiky-moldyngy',
    'МОЛДИНГ ПРЯМИЙ САМОКЛЕЮЧИЙ': 'reiky-moldyngy',
}
ORDER = sorted(TITLES, key=len, reverse=True)

FEATURES = ['Легкий монтаж', 'Стійкість до вологи', 'Легкість догляду', 'Легкість у догляді',
            'Різноманітність кольорів', 'Різноманітність дизайнів', 'Ізоляційні властивості',
            'Тривалість експлуатації', 'Екологічність', 'Гнучкість та міцність', 'Зносостійкість',
            'Негорючість', 'Удароміцність', 'Водостійкість', 'Довговічність', 'Безпека',
            'Термо- та звукоізоляція', 'Можна різати ножицями', 'Антистатичний ефект',
            'Амортизація ударів', 'Підвищена зносостійкість', 'Захист від плісняви',
            'Стійкість до температурних коливань', 'Повна імітація натуральних матеріалів',
            'Універсальність використання', 'Міцність та стійкість']

def norm(s):
    return re.sub(r'\s+', ' ', s.replace('х', '×').replace('x', '×')).strip()

SIZE_RE = re.compile(r'\d[\d,]*\s*×\s*\d[\d,]*(?:\s*×\s*\d[\d,]*)?\s*(?:мм|см)')
SKU_RE = re.compile(r'SW-(\d{8})(?:\s*\(([^)]+)\))?')
PRICE_RE = re.compile(r'(?<!ДРОП/)(?<!ГУРТ)РРЦ\s*(\d[\d\s]*)')

pages = [p for p in re.split(r'\n\s*\n', text) if p.strip()]
products = []
pending_title = None
last = None
for pno, page in enumerate(pages, 1):
    flat = norm(page.replace('\n', ' '))
    title = next((t for t in ORDER if norm(t) in flat), None)
    skus = []
    seen = set()
    for m in SKU_RE.finditer(page.replace('\n', ' ')):
        sku = 'SW-' + m.group(1)
        if sku in seen: continue
        seen.add(sku); skus.append((sku, (m.group(2) or '').strip()))
    prices = [int(re.sub(r'\s', '', p)) for p in PRICE_RE.findall(flat)]
    if 'ДРОП/ГУРТ' in flat and not skus:
        continue  # сторінка з цінами для дропшипінгу, товарів немає
    sizes = []
    for s in SIZE_RE.findall(flat):
        s = re.sub(r'\s*×\s*', '×', s).replace(' мм', 'мм').replace(' см', 'см')
        if s not in sizes: sizes.append(s)
    if not skus:
        if title: pending_title = (title, sizes, prices)
        continue
    if not title:
        if pending_title: title = pending_title[0]; sizes = sizes or pending_title[1]; prices = prices or pending_title[2]
        elif last: title = last['raw_title']
    pending_title = None
    if not prices and last and last['raw_title'] == title:
        prices = [last['price']]
    if not title or not prices:
        print('SKIP page', pno, title, prices, skus[:3], file=sys.stderr); continue
    feats = [f for f in FEATURES if norm(f).lower() in flat.lower()]
    key = (title, prices[0])
    prod = next((p for p in products if p['key'] == key), None)
    if not prod:
        prod = dict(key=key, raw_title=title, category=TITLES[title], price=prices[0],
                    sizes=[], prices=[], features=[], variants=[], pages=[], multi_price=False)
        products.append(prod)
    prod['pages'].append(pno)
    if len(set(prices)) > 1: prod['multi_price'] = True
    for pr in prices:
        if pr not in prod['prices']: prod['prices'].append(pr)
    for s in sizes:
        if s not in prod['sizes']: prod['sizes'].append(s)
    for f in feats:
        if f not in prod['features']: prod['features'].append(f)
    have = {v['sku'] for v in prod['variants']}
    for sku, code in skus:
        if sku not in have:
            prod['variants'].append(dict(sku=sku, code=code, size=sizes[0] if len(sizes) == 1 else ''))
    last = prod

for p in products:
    del p['key']
json.dump(products, open(OUT, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
print(len(products), 'products,', sum(len(p['variants']) for p in products), 'variants', file=sys.stderr)
for p in products:
    print(f"{p['category']:18} {p['price']:>6} {len(p['variants']):>3}{' !' if p['multi_price'] else '  '} {p['raw_title']} | {', '.join(p['sizes'][:4])}", file=sys.stderr)
