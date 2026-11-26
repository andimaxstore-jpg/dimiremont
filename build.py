"""Генератор статичного сайту магазину.  Запуск:  python3 build.py
Результат — папка site/, яку можна викласти на будь-який хостинг (Cloudflare Pages, Netlify, GitHub Pages).
"""
import json, os, re, shutil, html, datetime
from PIL import Image
import config as C

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, 'site')
E = html.escape
TODAY = datetime.date.today().isoformat()

CATS = {
    'mebli': ('Меблі', 'dim', 'Надувні та модульні меблі, журнальні столики й столики для ноутбука.'),
    'zberigannia': ('Зберігання', 'dim', 'Металеві стелажі, мобільні етажерки, шафи та складні контейнери.'),
    'kylymky': ('Килимки вологопоглинаючі', 'dim', 'Килимки з діатомового мулу: миттєво вбирають вологу і швидко висихають.'),
    'dzerkala-dekor': ('Дзеркала та дзеркальний декор', 'dim', 'Акрилові самоклеючі дзеркала та дзеркальні наліпки — безпечна альтернатива склу.'),
    'stinovi-paneli': ('3D панелі для стін', 'remont', 'Самоклеючі 3D панелі під цеглу, камінь, дерево та мармур — оновлення стін за один вечір.'),
    'dekoratyvni-plyty': ('Декоративні панелі та шпалери', 'remont', 'ПВХ плити, велюрові та звукоізоляційні панелі, гнучка штукатурка, фасадні панелі.'),
    'reiky-moldyngy': ('Рейки, молдинги, плінтуси', 'remont', 'Стінові рейки WPC і PS, вінілові 3D рейки, молдинги та самоклеючі плінтуси.'),
    'plytka': ('Самоклеюча плитка', 'remont', 'Вінілова, PET, алюмінієва плитка та скляна мозаїка для кухні й ванної.'),
    'pidloga': ('Покриття для підлоги', 'remont', 'Плитка LVT і «ламінат», ковролін, ДПК та теплі підлогові пазли.'),
    'plivky': ('Плівки самоклеючі', 'remont', 'Плівки для меблів і стін, вітражні та дзеркальні сонцезахисні плівки для вікон.'),
}
GROUPS = {'dim': 'Товари для дому', 'remont': 'Товари для швидкого ремонту'}

TR = dict(zip('абвгґдеєжзиіїйклмнопрстуфхцчшщьюя', ['a','b','v','h','g','d','e','ie','zh','z','y','i','i','i','k','l','m','n','o','p','r','s','t','u','f','kh','ts','ch','sh','shch','','iu','ia']))
def slugify(s):
    s = s.lower().replace('’', '').replace("'", '')
    s = ''.join(TR.get(ch, ch) for ch in s)
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')

def pretty_title(raw):
    t = raw.replace('WPС', 'WPC').replace('РЕТ ', 'PET ').replace('LVT', 'LVT')
    t = re.sub(r'"([^"]+)"', lambda m: '«' + m.group(1) + '»', t)
    words = t.split(' ')
    out = []
    for i, w in enumerate(words):
        if re.fullmatch(r'(3D|PET|LVT|WPC|PS|ПВХ|ДПК|D-ПОДІБНИЙ)', w):
            out.append(w.replace('ПОДІБНИЙ', 'подібний')); continue
        lw = w.lower()
        if lw.startswith('«'): lw = '«' + lw[1:2].upper() + lw[2:]
        out.append(lw)
    s = ' '.join(out)
    return s[0].upper() + s[1:]

def fmt_size(s):
    return s.replace('мм', ' мм').replace('см', ' см')

def money(v):
    return f'{v:,}'.replace(',', ' ')

# ---------- дані ----------
def load():
    products = []
    dim = json.load(open(os.path.join(ROOT, 'data/dim.json'), encoding='utf8'))
    for p in dim:
        vs = []
        for v in p['variants']:
            vs.append(dict(sku=v['sku'], price=v['price'], options=v['options'], img=f"img/{v['sku']}.webp", size=''))
        products.append(dict(slug=p['slug'], title=p['title'], category=p['category'], size=p.get('size', ''),
                             features=p['features'], materials=p.get('materials', ''), gift=p.get('gift', ''),
                             variants=vs, price_note='', source='dim'))
    rem = json.load(open(os.path.join(ROOT, 'data/remont.json'), encoding='utf8'))
    seen = {}
    for p in rem:
        base = pretty_title(p['raw_title'])
        size = p['sizes'][0] if p['sizes'] else ''
        title = base + (' ' + fmt_size(size) if size else '')
        k = slugify(title)
        seen[k] = seen.get(k, 0) + 1
        slug = k if seen[k] == 1 else f'{k}-seriia-{seen[k]}'
        if seen[k] > 1: title += f' (серія {seen[k]})'
        price = min(p['prices']) if p['prices'] else p['price']
        vs = []
        for v in p['variants']:
            code = v['code']
            if code:
                lab = 'Дизайн ' + (code.split('-')[0] if code.startswith('R') else code)
            else:
                lab = 'Дизайн ' + v['sku'][-4:].lstrip('0')
            vs.append(dict(sku=v['sku'], price=price, options={'Дизайн': lab}, img=(f"img/{v['sku']}.webp" if os.path.exists(os.path.join(ROOT, 'raw_img', v['sku'] + '.jpg')) else ''), size=v['size']))
        # прибрати однакові назви дизайнів
        labs = {}
        for v in vs:
            l = v['options']['Дизайн']; labs[l] = labs.get(l, 0) + 1
            if labs[l] > 1: v['options']['Дизайн'] = f"{l} ({v['sku'][-4:]})"
        products.append(dict(slug=slug, title=title, category=p['category'], size=', '.join(fmt_size(s) for s in p['sizes'][:6]),
                             features=p['features'], materials='', gift='', variants=vs,
                             price_note='Ціна залежить від розміру — точну суму підтвердить менеджер.' if p['multi_price'] else '',
                             source='remont'))
    for p in products:
        prices = [v['price'] for v in p['variants']]
        p['min'] = min(prices); p['max'] = max(prices)
        p['image'] = next((v['img'] for v in p['variants'] if v['img']), '')
        p['new'] = any(int(v['sku'][3:]) >= 3240 for v in p['variants'])
    return products

# ---------- шаблони ----------
FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&family=Unbounded:wght@500;700&display=swap">'

def page(rel, path, title, desc, body, jsonld=None, og_image='', robots='index,follow'):
    url = C.SITE_URL + '/' + path if path != 'index.html' else C.SITE_URL + '/'
    nav = ''.join(f'<a href="{rel}kategoriya/{k}.html">{E(v[0])}</a>' for k, v in CATS.items())
    ld = ''.join(f'<script type="application/ld+json">{json.dumps(j, ensure_ascii=False)}</script>' for j in (jsonld or []))
    ogi = f'<meta property="og:image" content="{C.SITE_URL}/{og_image}">' if og_image else ''
    contacts = E(C.PHONE)
    return f'''<!doctype html>
<html lang="uk"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{E(title)}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="{E(desc)}">
<meta name="robots" content="{robots}">
<link rel="canonical" href="{url}">
<meta property="og:type" content="website"><meta property="og:locale" content="uk_UA">
<meta property="og:title" content="{E(title)}"><meta property="og:description" content="{E(desc)}"><meta property="og:url" content="{url}">{ogi}
<meta name="theme-color" content="#1f2a44">
<link rel="icon" href="{rel}assets/favicon.svg" type="image/svg+xml">
{FONTS}
<link rel="stylesheet" href="{rel}assets/style.css">
{ld}
</head><body data-rel="{rel}">
<header class="top"><div class="wrap top-in">
<a class="logo" href="{rel}index.html"><span class="logo-mark" aria-hidden="true"></span>{E(C.SHOP_NAME)}</a>
<form class="search" action="{rel}katalog.html" role="search"><label for="q" class="sr">Пошук товарів</label><input id="q" name="q" type="search" placeholder="Пошук: цегла, килимок, стелаж…"></form>
<a class="phone" href="tel:{re.sub(r'[^+0-9]', '', C.PHONE)}">{contacts}</a>
<a class="cart-link" href="{rel}koshyk.html">Кошик <span class="cart-count" data-cart-count>0</span></a>
</div>
<nav class="cats wrap" aria-label="Категорії"><a href="{rel}katalog.html" class="all">Усі товари</a>{nav}</nav>
</header>
<main>{body}</main>
<footer class="foot"><div class="wrap foot-in">
<div><div class="logo">{E(C.SHOP_NAME)}</div><p>Товари для дому та швидкого ремонту. {E(C.DELIVERY)}.</p></div>
<div><h3>Покупцям</h3><a href="{rel}katalog.html">Каталог</a><a href="{rel}dostavka.html">Доставка і оплата</a><a href="{rel}koshyk.html">Кошик</a></div>
<div><h3>Контакти</h3><p>{contacts}</p>{f'<p>{E(C.EMAIL)}</p>' if C.EMAIL else ''}<p>{E(C.CITY)}</p></div>
</div><div class="wrap copy">© {datetime.date.today().year} {E(C.SHOP_NAME)}. Ціни вказані в гривнях.</div></footer>
<script src="{rel}assets/app.js" defer></script>
</body></html>'''

def card(p, rel):
    img = f'<img src="{rel}{p["image"]}" alt="{E(p["title"])}" loading="lazy" width="400" height="400">' if p['image'] else \
          f'<img src="{rel}img/ph-{p["category"]}.svg" alt="" loading="lazy" width="400" height="400" class="ph">'
    price = ('від ' if p['min'] != p['max'] or p['price_note'] else '') + money(p['min']) + ' ₴'
    nvar = len(p['variants'])
    badges = ''
    if p['gift']: badges += '<span class="badge gift">Подарунок</span>'
    if p['new']: badges += '<span class="badge new">Новинка</span>'
    swatches = ''
    if p['image'] and nvar > 1:
        sw = [v for v in p['variants'] if v['img']][:5]
        swatches = '<div class="mini-sw">' + ''.join(f'<img src="{rel}{v["img"]}" alt="" loading="lazy" width="28" height="28">' for v in sw) + (f'<span>+{nvar-5}</span>' if nvar > 5 else '') + '</div>'
    elif nvar > 1:
        swatches = f'<div class="mini-sw"><span class="nv">{nvar} дизайнів</span></div>'
    return f'''<article class="card" data-cat="{p['category']}" data-price="{p['min']}" data-title="{E(p['title'].lower())} {' '.join(v['sku'] for v in p['variants'][:80])}">
<a href="{rel}tovar/{p['slug']}.html" class="card-img">{img}<span class="badges">{badges}</span></a>
<div class="card-body"><h3><a href="{rel}tovar/{p['slug']}.html">{E(p['title'])}</a></h3>
{swatches}<div class="card-foot"><span class="price">{price}</span><a class="btn-sm" href="{rel}tovar/{p['slug']}.html">Обрати</a></div></div></article>'''

def crumbs(rel, items):
    li = ''.join((f'<li><a href="{rel}{h}">{E(t)}</a></li>' if h else f'<li aria-current="page">{E(t)}</li>') for t, h in items)
    ld = {'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': [
        {'@type': 'ListItem', 'position': i + 1, 'name': t, **({'item': C.SITE_URL + '/' + h.replace('index.html', '')} if h else {})}
        for i, (t, h) in enumerate(items)]}
    return f'<nav class="crumbs wrap" aria-label="Навігація"><ol>{li}</ol></nav>', ld

# ---------- сторінка «Як працювати з самоклеючими товарами» ----------
GUIDE = dict(
    slug='yak-kleity-samokleiuchi-materialy',
    title='Як працювати з самоклеючими товарами для ремонту',
    seo_title='Як клеїти самоклеючі панелі, плитку, плівку та підлогу: інструкція з монтажу',
    seo_desc='Покрокова інструкція: підготовка стін і побілки, монтаж 3D панелей, плитки, рейок, плівок і підлоги, ванна й кухня, розрахунок кількості, догляд та відповіді на запитання.',
    in_menu=1, in_footer=1, sort=5,
)


def write_guide():
    """data/guide_page.html -> data/guide_page.json (Worker разово додає сторінку в базу, далі її редагують в адмінці)."""
    g = dict(GUIDE, content=open(os.path.join(ROOT, 'data/guide_page.html'), encoding='utf8').read().strip())
    json.dump(g, open(os.path.join(ROOT, 'data/guide_page.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=0)


# ---------- сторінки ----------
def build():
    if os.path.exists(OUT): shutil.rmtree(OUT)
    for d in ('assets', 'img', 'tovar', 'kategoriya'): os.makedirs(os.path.join(OUT, d))
    shutil.copy(os.path.join(ROOT, 'web/style.css'), os.path.join(OUT, 'assets/style.css'))
    shutil.copy(os.path.join(ROOT, 'web/app.js'), os.path.join(OUT, 'assets/app.js'))
    shutil.copy(os.path.join(ROOT, 'web/account.js'), os.path.join(OUT, 'assets/account.js'))
    shutil.copy(os.path.join(ROOT, 'web/favicon.svg'), os.path.join(OUT, 'assets/favicon.svg'))
    shutil.copytree(os.path.join(ROOT, 'web/admin'), os.path.join(OUT, 'admin'))
    for f in os.listdir(os.path.join(ROOT, 'web/ph')):
        shutil.copy(os.path.join(ROOT, 'web/ph', f), os.path.join(OUT, 'img', f))
    for f in os.listdir(os.path.join(ROOT, 'raw_img')):
        if f.endswith('.jpg'):
            im = Image.open(os.path.join(ROOT, 'raw_img', f)).convert('RGB')
            im.thumbnail((720, 720))
            im.save(os.path.join(OUT, 'img', f[:-4] + '.webp'), quality=80, method=6)
    shutil.copytree(os.path.join(ROOT, 'web/guide'), os.path.join(OUT, 'img/guide'))
    write_guide()
    P = load()
    urls = [('index.html', '1.0'), ('katalog.html', '0.9'), ('dostavka.html', '0.3')]
    by_slug = {p['slug']: p for p in P}

    # --- товари
    for p in P:
        rel = '../'
        cat = CATS[p['category']]
        opts = []
        for v in p['variants']:
            for k in v['options']:
                if k not in opts: opts.append(k)
        nvar = len(p['variants'])
        v0 = p['variants'][0]
        main_img = f'../{v0["img"]}' if v0['img'] else f'../img/ph-{p["category"]}.svg'
        selectors = ''
        for o in opts:
            vals = []
            for v in p['variants']:
                val = v['options'].get(o)
                if val and val not in [x[0] for x in vals]: vals.append((val, v))
            is_img = all(v['img'] for _, v in vals) and len(opts) == 1 and len(vals) > 1
            items = ''
            for val, v in vals:
                if is_img:
                    items += f'<button type="button" class="sw sw-img" data-opt="{E(o)}" data-val="{E(val)}" title="{E(val)} · {v["sku"]}"><img src="../{v["img"]}" alt="{E(val)}" loading="lazy" width="64" height="64"></button>'
                elif o == 'Колір':
                    col = {'Бежевий': '#b9a48f', 'Темно-сірий': '#3c3e42', 'Білий': '#f3f3f1', 'Чорний': '#151515'}.get(val, '#999')
                    items += f'<button type="button" class="sw sw-col" data-opt="{E(o)}" data-val="{E(val)}"><i style="background:{col}"></i>{E(val)}</button>'
                else:
                    items += f'<button type="button" class="sw sw-txt" data-opt="{E(o)}" data-val="{E(val)}">{E(val)}</button>'
            if len(vals) > 1 or nvar > 1:
                selectors += f'<fieldset class="opt"><legend>{E(o)}: <b data-opt-label="{E(o)}"></b> <span class="cnt">({len(vals)})</span></legend><div class="sws{" many" if len(vals) > 24 else ""}">{items}</div></fieldset>'
        vjson = json.dumps([{'sku': v['sku'], 'price': v['price'], 'o': v['options'], 'img': ('../' + v['img']) if v['img'] else '', 'size': fmt_size(v['size'])} for v in p['variants']], ensure_ascii=False)
        feats = ''.join(f'<li>{E(f)}</li>' for f in p['features'])
        price_txt = money(p['min']) + ' ₴'
        desc_parts = [f"{p['title']} — {cat[2][0].lower() + cat[2][1:]}"]
        if nvar > 1: desc_parts.append(f'{nvar} варіантів {"кольору та малюнка" if p["source"]=="dim" else "дизайну"} на вибір')
        desc_parts.append(f'Ціна від {money(p["min"])} грн')
        meta_desc = '. '.join(desc_parts) + '. Доставка по Україні.'
        long_desc = f'<p>{E(p["title"])} з категорії «{E(cat[0])}». {E(cat[2])}</p>'
        if nvar > 1: long_desc += f'<p>У цій картці зібрано {nvar} варіантів. Оберіть {"колір, малюнок або розмір" if p["source"]=="dim" else "дизайн"} вище, і ми покажемо артикул та ціну саме для нього.</p>'
        if p['materials']: long_desc += f'<p><b>Будова:</b> {E(p["materials"])}</p>'
        specs = f'<tr><th>Категорія</th><td>{E(cat[0])}</td></tr>'
        if p['size']: specs += f'<tr><th>Розмір</th><td>{E(p["size"])}</td></tr>'
        specs += f'<tr><th>Варіантів</th><td>{nvar}</td></tr><tr><th>Артикул</th><td data-sku>{v0["sku"]}</td></tr>'
        gift = f'<div class="gift-box"><b>Акція:</b> {E(p["gift"])}</div>' if p['gift'] else ''
        note = f'<p class="note">{E(p["price_note"])}</p>' if p['price_note'] else ''
        nophoto = '' if p['image'] else '<p class="note">Фото кожного дизайну додамо найближчим часом. Менеджер надішле фото обраного варіанту перед відправкою.</p>'
        cr, crld = crumbs(rel, [('Головна', 'index.html'), (cat[0], f'kategoriya/{p["category"]}.html'), (p['title'], '')])
        # schema.org ProductGroup + варіанти
        def offer(v):
            return {'@type': 'Offer', 'price': str(v['price']), 'priceCurrency': 'UAH', 'availability': 'https://schema.org/InStock',
                    'url': f'{C.SITE_URL}/tovar/{p["slug"]}.html#{v["sku"]}', 'itemCondition': 'https://schema.org/NewCondition'}
        prod_ld = {'@context': 'https://schema.org', '@type': 'ProductGroup', 'name': p['title'], 'description': meta_desc,
                   'productGroupID': p['slug'], 'url': f'{C.SITE_URL}/tovar/{p["slug"]}.html',
                   'brand': {'@type': 'Brand', 'name': C.SHOP_NAME},
                   'variesBy': ['https://schema.org/color' if o == 'Колір' else 'https://schema.org/pattern' if o in ('Малюнок', 'Дизайн') else 'https://schema.org/size' for o in opts],
                   'hasVariant': [{'@type': 'Product', 'sku': v['sku'], 'name': f'{p["title"]} — {", ".join(v["options"].values()) or v["sku"]}',
                                   **({'image': f'{C.SITE_URL}/{v["img"]}'} if v['img'] else {}), 'offers': offer(v)} for v in p['variants']]}
        if p['image']: prod_ld['image'] = f'{C.SITE_URL}/{p["image"]}'
        related = [q for q in P if q['category'] == p['category'] and q['slug'] != p['slug']][:4]
        rel_html = f'<section class="wrap block"><h2>Схожі товари</h2><div class="grid">{"".join(card(q, rel) for q in related)}</div></section>' if related else ''
        body = f'''{cr}
<section class="wrap product" data-product='{E(vjson)}'>
<div class="gallery"><div class="main-img"><img data-main src="{main_img}" alt="{E(p['title'])}" width="720" height="720"{' class="ph"' if not v0['img'] else ''}></div></div>
<div class="info">
<h1>{E(p['title'])}</h1>
<div class="sku-line">Артикул: <span data-sku>{v0['sku']}</span><span data-vsize></span></div>
{gift}
<div class="buy"><div class="price-big"><span data-price>{price_txt}</span></div>{note}</div>
<form class="variant-form" onsubmit="return false">{selectors}
<div class="buy-row"><div class="qty"><button type="button" data-qty="-1" aria-label="Менше">−</button><input id="qty" type="number" min="1" value="1" inputmode="numeric" aria-label="Кількість"><button type="button" data-qty="1" aria-label="Більше">+</button></div>
<button type="button" class="btn" data-add>Додати в кошик</button></div>
<p class="added" data-added hidden>Додано в кошик. <a href="../koshyk.html">Оформити замовлення</a></p>
</form>
{nophoto}
<ul class="feats">{feats}</ul>
</div></section>
<section class="wrap block about"><h2>Опис і характеристики</h2><div class="about-in"><div class="txt">{long_desc}</div><table class="specs">{specs}</table></div></section>
{rel_html}'''
        open(os.path.join(OUT, 'tovar', p['slug'] + '.html'), 'w', encoding='utf8').write(
            page(rel, f'tovar/{p["slug"]}.html', f'{p["title"]} — купити, ціна від {money(p["min"])} ₴ | {C.SHOP_NAME}', meta_desc, body,
                 [prod_ld, crld], og_image=p['image']))
        urls.append((f'tovar/{p["slug"]}.html', '0.8'))

    # --- категорії
    for k, (name, grp, blurb) in CATS.items():
        items = [p for p in P if p['category'] == k]
        cr, crld = crumbs('../', [('Головна', 'index.html'), (name, '')])
        body = f'''{cr}<section class="wrap block"><div class="cat-head"><p class="eyebrow">{E(GROUPS[grp])}</p><h1>{E(name)}</h1><p>{E(blurb)}</p><p class="muted">{len(items)} товарів, {sum(len(p["variants"]) for p in items)} артикулів</p></div>
<div class="grid">{"".join(card(p, "../") for p in items)}</div></section>'''
        ld = {'@context': 'https://schema.org', '@type': 'CollectionPage', 'name': name, 'description': blurb,
              'url': f'{C.SITE_URL}/kategoriya/{k}.html'}
        open(os.path.join(OUT, 'kategoriya', k + '.html'), 'w', encoding='utf8').write(
            page('../', f'kategoriya/{k}.html', f'{name} — купити в Україні | {C.SHOP_NAME}', f'{name}: {blurb} Ціни від {money(min(p["min"] for p in items))} грн.', body, [ld, crld],
                 og_image=next((p['image'] for p in items if p['image']), '')))
        urls.append((f'kategoriya/{k}.html', '0.9'))

    # --- каталог
    filt = ''.join(f'<button type="button" class="chip" data-filter="{k}">{E(v[0])}</button>' for k, v in CATS.items())
    body = f'''<section class="wrap block"><h1>Каталог товарів</h1>
<div class="filters"><button type="button" class="chip on" data-filter="">Усі</button>{filt}</div>
<div class="tools"><label for="sort">Сортувати</label><select id="sort"><option value="">За замовчуванням</option><option value="asc">Спершу дешевші</option><option value="desc">Спершу дорожчі</option></select><span class="muted" data-found></span></div>
<div class="grid" data-catalog>{"".join(card(p, "") for p in P)}</div><p class="empty" data-empty hidden>Нічого не знайшли. Спробуйте інше слово або артикул.</p></section>'''
    open(os.path.join(OUT, 'katalog.html'), 'w', encoding='utf8').write(
        page('', 'katalog.html', f'Каталог товарів для дому та ремонту | {C.SHOP_NAME}', 'Повний каталог: 3D панелі, самоклеюча плитка, рейки, плівки, покриття для підлоги, меблі, стелажі, килимки та дзеркала. Доставка по Україні.', body))

    # --- головна
    sofa = by_slug['dyvan-naduvnyi']; arm = by_slug['krislo-naduvne']; sets = by_slug['nabir-mebliv-naduvnykh']
    save1 = sofa['min'] + arm['min'] - 25998
    save2 = sofa['min'] + 2 * arm['min'] - 35449
    hits = [by_slug[s] for s in ('krislo-naduvne', 'kylymok-vologopoglynaiuchyi-60x40', 'dzerkalnyi-dekor-akrylovyi', 'stelazh-universalnyi-yarusy')]
    for c in ('stinovi-paneli', 'plytka', 'reiky-moldyngy', 'pidloga', 'plivky', 'dekoratyvni-plyty'):
        hits.append(max((p for p in P if p['category'] == c), key=lambda p: len(p['variants'])))
    hits = hits[:10]
    news = [p for p in P if p['new']][:10]
    def catblock(grp):
        out = ''
        for k, (name, g, blurb) in CATS.items():
            if g != grp: continue
            items = [p for p in P if p['category'] == k]
            im = next((p['image'] for p in items if p['image']), f'img/ph-{k}.svg')
            out += f'<a class="cat-tile" href="kategoriya/{k}.html"><img src="{im}" alt="" loading="lazy" width="160" height="160"{"" if items[0]["image"] else " class=\"ph\""}><span><b>{E(name)}</b><small>{len(items)} товарів</small></span></a>'
        return out
    body = f'''
<section class="hero"><div class="wrap hero-in">
<div class="hero-txt"><p class="eyebrow">Акція місяця</p><h1>Надувні меблі з насосом у подарунок</h1>
<p>До кожного крісла, дивана чи набору — електронасос, гофрований шланг і 5 насадок. Набір «диван + крісло» дешевший за окрему покупку на {money(save1)} ₴.</p>
<div class="hero-cta"><a class="btn" href="tovar/nabir-mebliv-naduvnykh.html">Обрати набір</a><a class="btn ghost" href="katalog.html">Увесь каталог</a></div></div>
<a class="hero-img" href="tovar/nabir-mebliv-naduvnykh.html"><img src="img/SW-00002656.webp" alt="Набір надувних меблів: диван і крісло" width="720" height="380"></a>
</div></section>
<section class="wrap block"><h2>Акції та вигідні пропозиції</h2><div class="promos">
<a class="promo p1" href="tovar/nabir-mebliv-naduvnykh.html"><span class="tag">−{money(save2)} ₴</span><b>Диван + 2 крісла</b><span>{money(35449)} ₴ замість {money(sofa["min"] + 2 * arm["min"])} ₴ при окремій покупці</span></a>
<a class="promo p2" href="tovar/krislo-naduvne.html"><span class="tag">Подарунок</span><b>Насос і 5 насадок</b><span>До будь-яких надувних меблів</span></a>
<a class="promo p3" href="kategoriya/stinovi-paneli.html"><span class="tag">від {money(min(p["min"] for p in P if p["category"]=="stinovi-paneli"))} ₴</span><b>3D панелі для стін</b><span>Понад {sum(len(p["variants"]) for p in P if p["category"]=="stinovi-paneli")} дизайнів: цегла, камінь, дерево</span></a>
</div></section>
<section class="wrap block"><h2>{GROUPS["dim"]}</h2><div class="cat-tiles">{catblock("dim")}</div></section>
<section class="wrap block"><h2>{GROUPS["remont"]}</h2><div class="cat-tiles">{catblock("remont")}</div></section>
<section class="wrap block"><div class="row-head"><h2>Хіти продажів</h2><a href="katalog.html">Усі товари →</a></div><div class="grid">{"".join(card(p, "") for p in hits)}</div></section>
<section class="wrap block"><div class="row-head"><h2>Новинки</h2></div><div class="grid">{"".join(card(p, "") for p in news)}</div></section>
<section class="wrap block perks"><div><b>{len(P)} товарів, {sum(len(p["variants"]) for p in P)} артикулів</b><span>Кожна картка об’єднує всі кольори й малюнки одного товару</span></div>
<div><b>Доставка</b><span>{E(C.DELIVERY)}</span></div><div><b>Оплата</b><span>{E(C.PAYMENT)}</span></div></section>
<section class="wrap block seo"><h2>Товари для дому та швидкого ремонту</h2><p>{E(C.SHOP_NAME)} — інтернет-магазин самоклеючих 3D панелей, плитки, рейок, плівок і покриттів для підлоги, а також меблів, стелажів, килимків і дзеркал. Оновіть кухню, ванну чи вітальню без пилу та майстрів: більшість товарів монтується на клейовий шар за кілька хвилин.</p></section>'''
    org = {'@context': 'https://schema.org', '@type': 'Store', 'name': C.SHOP_NAME, 'url': C.SITE_URL + '/', 'telephone': C.PHONE,
           'priceRange': '₴₴', 'areaServed': 'UA'}
    site_ld = {'@context': 'https://schema.org', '@type': 'WebSite', 'name': C.SHOP_NAME, 'url': C.SITE_URL + '/',
               'potentialAction': {'@type': 'SearchAction', 'target': C.SITE_URL + '/katalog.html?q={search_term_string}', 'query-input': 'required name=search_term_string'}}
    open(os.path.join(OUT, 'index.html'), 'w', encoding='utf8').write(
        page('', 'index.html', f'{C.SHOP_NAME} — товари для дому та швидкого ремонту', '3D панелі, самоклеюча плитка, рейки, плівки, підлогові покриття, надувні та модульні меблі, стелажі, килимки й дзеркала. Акції щомісяця, доставка по Україні.', body, [org, site_ld], og_image='img/SW-00002656.webp'))

    # --- кошик
    tg = f'<a class="btn" data-tg href="https://t.me/{E(C.TELEGRAM)}" target="_blank" rel="noopener">Надіслати в Telegram</a>' if C.TELEGRAM else ''
    vb = f'<a class="btn ghost" href="viber://chat?number=%2B{E(C.VIBER)}">Написати у Viber</a>' if C.VIBER else ''
    body = f"""<section class="wrap block cart"><h1>Оформлення замовлення</h1>
<p class="empty" data-cart-empty hidden>Кошик порожній. <a href="katalog.html">Перейти до каталогу</a></p>
<div class="checkout" data-checkout hidden>
<form class="co-form" id="order-form" data-order novalidate>
<input type="text" name="website" tabindex="-1" autocomplete="off" class="hp" aria-hidden="true">
<fieldset class="co-step"><legend><span class="n">1</span>Контактні дані</legend>
<div class="fields">
<label for="o-last">Прізвище<input id="o-last" name="lastName" required autocomplete="family-name"></label>
<label for="o-first">Ім’я<input id="o-first" name="firstName" required autocomplete="given-name"></label>
<label for="o-phone">Телефон<input id="o-phone" name="phone" type="tel" required autocomplete="tel" inputmode="tel" placeholder="+380 __ ___ __ __"></label>
<label for="o-email"><span>Email <small>(необов’язково)</small></span><input id="o-email" name="email" type="email" autocomplete="email"></label>
</div></fieldset>

<fieldset class="co-step"><legend><span class="n">2</span>Доставка</legend>
<div class="radios" role="radiogroup">
<label class="radio"><input type="radio" name="method" value="np" checked><span><b>Нова пошта</b><small>Відділення або поштомат</small></span></label>
<label class="radio"><input type="radio" name="method" value="np_courier"><span><b>Кур’єр Нової пошти</b><small>Доставка на адресу</small></span></label>
<label class="radio"><input type="radio" name="method" value="up"><span><b>Укрпошта</b><small>Відділення Укрпошти</small></span></label>
<label class="radio"><input type="radio" name="method" value="pickup"><span><b>Самовивіз</b><small>{E(C.PICKUP_ADDRESS)}, безкоштовно</small></span></label>
</div>
<div class="fields" data-for="np np_courier up">
<div class="ac wide" data-ac="city"><label for="o-city">Місто або село</label><input id="o-city" autocomplete="off" placeholder="Почніть вводити назву, напр. Київ" role="combobox" aria-expanded="false" aria-controls="o-city-list"><ul id="o-city-list" role="listbox" hidden></ul></div>
<div class="ac wide" data-ac="branch" data-for="np up"><label for="o-branch">Відділення</label><input id="o-branch" autocomplete="off" placeholder="Спершу оберіть місто" disabled role="combobox" aria-expanded="false" aria-controls="o-branch-list"><ul id="o-branch-list" role="listbox" hidden></ul></div>
<label for="o-addr" class="wide" data-for="np_courier">Адреса: вулиця, будинок, квартира<input id="o-addr" name="address" autocomplete="street-address"></label>
<p class="note wide" data-manual hidden>Довідник тимчасово недоступний. Впишіть місто та номер або індекс відділення вручну.</p>
</div>
<div class="pickup" data-for="pickup"><b>{E(C.PICKUP_ADDRESS)}</b><p>{E(C.PICKUP_HOURS)}. Телефон: {E(C.PHONE)}</p></div>
</fieldset>

<fieldset class="co-step"><legend><span class="n">3</span>Оплата</legend>
<div class="radios">
<label class="radio" data-pay="cod"><input type="radio" name="payment" value="cod" checked><span><b>Накладений платіж</b><small>Оплата при отриманні</small></span></label>
<label class="radio" data-pay="card"><input type="radio" name="payment" value="card"><span><b>На рахунок або картку</b><small>Реквізити надішле менеджер після підтвердження</small></span></label>
<label class="radio" data-pay="cash" hidden><input type="radio" name="payment" value="cash"><span><b>Готівкою або карткою</b><small>При самовивозі</small></span></label>
</div></fieldset>

<fieldset class="co-step"><legend><span class="n">4</span>Коментар</legend>
<label for="o-note" class="sr">Коментар до замовлення</label><textarea id="o-note" name="comment" rows="3" placeholder="Побажання щодо замовлення або доставки"></textarea>
<label class="check"><input type="checkbox" id="o-nocall" name="nocall"> Не телефонуйте мені для підтвердження, якщо все в наявності</label>
</fieldset>
<p class="form-err" data-err role="alert" hidden></p>
</form>

<aside class="co-sum"><h2>Ваше замовлення</h2><div data-cart-list></div>
<div class="sum-row"><span>Доставка</span><span data-ship>за тарифами перевізника</span></div>
<div class="sum-row total"><span>Разом</span><span data-total></span></div>
<button class="btn wide-btn" type="submit" form="order-form" data-submit>Підтвердити замовлення</button>
<p class="note">Натискаючи кнопку, ви погоджуєтесь, що менеджер зв’яжеться з вами для підтвердження.</p></aside>
</div>

<div class="done" data-done hidden><h2>Дякуємо! Замовлення №<span data-order-id></span> прийнято</h2>
<p>Менеджер зв’яжеться з вами найближчим часом за номером <b data-order-phone></b>, щоб підтвердити наявність і доставку.</p>
<a class="btn" href="katalog.html">Повернутися до каталогу</a></div>

<div class="done" data-fallback hidden><h2>Не вдалося надіслати замовлення автоматично</h2><p>Будь ласка, надішліть цей текст нам у месенджер або зателефонуйте {E(C.PHONE)}.</p>
<pre data-order-text></pre><p class="note" data-err-code></p><div class="hero-cta"><button type="button" class="btn" data-copy>Скопіювати текст</button>{tg}{vb}</div></div>
</section>"""
    open(os.path.join(OUT, 'koshyk.html'), 'w', encoding='utf8').write(page('', 'koshyk.html', f'Оформлення замовлення | {C.SHOP_NAME}', 'Кошик і оформлення замовлення.', body, robots='noindex,follow'))
    body = f'''<section class="wrap block narrow"><h1>Доставка і оплата</h1><h2>Доставка</h2><p>{E(C.DELIVERY)}. Відправляємо після підтвердження замовлення менеджером.</p>
<h2>Оплата</h2><p>{E(C.PAYMENT)}.</p><h2>Повернення</h2><p>Повернення та обмін — протягом 14 днів відповідно до Закону України «Про захист прав споживачів», якщо товар не був у використанні.</p>
<h2>Контакти</h2><p>Телефон: {E(C.PHONE)}</p></section>'''
    open(os.path.join(OUT, 'dostavka.html'), 'w', encoding='utf8').write(page('', 'dostavka.html', f'Доставка і оплата | {C.SHOP_NAME}', f'Умови доставки та оплати: {C.DELIVERY}. {C.PAYMENT}.', body))
    open(os.path.join(OUT, '404.html'), 'w', encoding='utf8').write(page('/', '404.html', 'Сторінку не знайдено', 'Сторінку не знайдено', '<section class="wrap block narrow"><h1>Сторінку не знайдено</h1><p><a href="/katalog.html">Перейти до каталогу</a></p></section>', robots='noindex'))

    # --- SEO-файли
    sm = ''.join(f'<url><loc>{C.SITE_URL}/{"" if u == "index.html" else u}</loc><lastmod>{TODAY}</lastmod><priority>{pr}</priority></url>' for u, pr in urls)
    open(os.path.join(OUT, 'sitemap.xml'), 'w', encoding='utf8').write(f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{sm}</urlset>\n')
    open(os.path.join(OUT, 'robots.txt'), 'w').write(f'User-agent: *\nAllow: /\nDisallow: /koshyk.html\n\nSitemap: {C.SITE_URL}/sitemap.xml\n')
    json.dump([{'slug': p['slug'], 'title': p['title'], 'category': p['category'], 'variants': [{'sku': v['sku'], 'price': v['price'], **v['options']} for v in p['variants']]} for p in P],
              open(os.path.join(ROOT, 'data/products_all.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    export_seed(P)
    print(f'{len(P)} товарів, {sum(len(p["variants"]) for p in P)} артикулів, {len(urls)} URL у sitemap')

# ---------- головна: пріоритет — товари для швидкого ремонту ----------
def home_remont(P, save2):
    """Блоки головної. Ці ж hero/promos/hits/seo_* worker/db.js дописує в уже наявну базу (patch_home_remont_v1)."""
    def cat(c): return [p for p in P if p['category'] == c]
    def lo(c): return money(min(v['price'] for p in cat(c) for v in p['variants']))
    def n(c): return sum(len(p['variants']) for p in cat(c))
    return {
        'seo_title': f'{C.SHOP_NAME} — 3D панелі, самоклеюча плитка, рейки та товари для швидкого ремонту',
        'seo_desc': 'Самоклеючі 3D панелі, плитка для кухні та ванної, стінові рейки, покриття для підлоги та плівки. Ремонт без пилу і майстрів. Доставка по Україні.',
        'hero': {'eyebrow': 'Швидкий ремонт без пилу', 'title': 'Оновіть стіни й підлогу за один вечір',
                 'text': f'Самоклеючі 3D панелі, плитка, рейки та покриття для підлоги: знімаєте плівку, притискаєте до стіни — і готово. 3D панелі від {lo("stinovi-paneli")} ₴ за штуку.',
                 'btn_text': 'Обрати 3D панелі', 'btn_url': '/kategoriya/stinovi-paneli.html', 'btn2_text': 'Увесь каталог', 'btn2_url': '/katalog.html',
                 'image': '/img/hero-remont.webp', 'image_alt': '3D панелі під цеглу, рейки та покриття під дерево', 'image_url': '/kategoriya/stinovi-paneli.html'},
        'promos_title': 'Популярне для ремонту',
        'promos': [
            {'tag': f'від {lo("stinovi-paneli")} ₴', 'title': '3D панелі для стін', 'text': f'Понад {n("stinovi-paneli")} дизайнів: цегла, камінь, дерево', 'url': '/kategoriya/stinovi-paneli.html'},
            {'tag': f'від {lo("plytka")} ₴', 'title': 'Самоклеюча плитка', 'text': 'Фартух кухні та ванна без плиткаря і затирки', 'url': '/kategoriya/plytka.html'},
            {'tag': f'від {lo("pidloga")} ₴', 'title': 'Покриття для підлоги', 'text': 'Вінілова плитка «ламінат», LVT і ковролін', 'url': '/kategoriya/pidloga.html'}],
        'show_groups': True, 'hits_title': 'Хіти продажів', 'show_new': True, 'new_title': 'Новинки',
        'seo_heading': 'Товари для швидкого ремонту та дому',
        'seo_text': f'<p>{E(C.SHOP_NAME)} — інтернет-магазин товарів для швидкого ремонту: самоклеючих 3D панелей, плитки для кухні та ванної, стінових рейок і молдингів, покриття для підлоги та самоклеючих плівок. Усе це монтується без пилу, клею й майстрів, тому оновити кімнату можна за вихідні.</p>'
                    f'<p>Також у каталозі є товари для дому: надувні та модульні меблі, стелажі, вологопоглинаючі килимки та акрилові дзеркала. Доставляємо Новою поштою та Укрпоштою по всій Україні.</p>',
    }

# ---------- початкові дані для бази D1 (бек-офіс) ----------
def export_seed(P):
    """Пише data/seed.json. Worker заливає його в порожню базу D1 при першому запуску.
    Після цього джерело правди — база, а редагування йде через /admin/."""
    by_slug = {p['slug']: p for p in P}
    groups = [{'id': i + 1, 'key': k, 'name': v, 'sort': 0 if k == 'remont' else 1} for i, (k, v) in enumerate(GROUPS.items())]  # ремонт — першим
    gid = {g['key']: g['id'] for g in groups}
    seo = json.load(open(os.path.join(ROOT, 'data/seo_cats.json'), encoding='utf8'))
    cats = [{'id': i + 1, 'slug': k, 'name': v[0], 'group_id': gid[v[1]], 'blurb': v[2], 'sort': i, **seo.get(k, {})} for i, (k, v) in enumerate(CATS.items())]
    cid = {c['slug']: c['id'] for c in cats}
    attrs = [{'id': 1, 'name': 'Розмір', 'unit': '', 'type': 'text', 'sort': 0},
             {'id': 2, 'name': 'Будова / матеріал', 'unit': '', 'type': 'text', 'sort': 1}]
    prods = []
    for i, p in enumerate(P):
        av = {}
        if p['size']: av['1'] = p['size']
        if p['materials']: av['2'] = p['materials']
        prods.append({'id': i + 1, 'slug': p['slug'], 'title': p['title'], 'category_id': cid[p['category']],
                      'features': p['features'], 'gift': p['gift'], 'price_note': p['price_note'],
                      'is_new': 1 if p['new'] else 0, 'sort': i, 'attrs': av,
                      'variants': [{'sku': v['sku'], 'price': v['price'], 'options': v['options'],
                                    'image': '/' + v['img'] if v['img'] else '', 'size': fmt_size(v['size'])} for v in p['variants']]})
    filters = []
    for c in cats:
        items = [p for p in P if p['category'] == c['slug']]
        filters.append({'category_id': c['id'], 'kind': 'price', 'key': '', 'label': 'Ціна', 'sort': 0})
        names = []
        for p in items:
            for v in p['variants']:
                for k in v['options']:
                    if k not in names and k != 'Дизайн': names.append(k)
        for n, k in enumerate(names):
            filters.append({'category_id': c['id'], 'kind': 'option', 'key': k, 'label': k, 'sort': n + 1})
        if any(p['gift'] for p in items):
            filters.append({'category_id': c['id'], 'kind': 'flag', 'key': 'gift', 'label': 'З подарунком', 'sort': 9})
    sofa = by_slug['dyvan-naduvnyi']; arm = by_slug['krislo-naduvne']
    save1 = sofa['min'] + arm['min'] - 25998
    save2 = sofa['min'] + 2 * arm['min'] - 35449
    hits = []
    for c in ('stinovi-paneli', 'plytka', 'pidloga', 'reiky-moldyngy', 'plivky', 'dekoratyvni-plyty'):
        hits.append(max((p for p in P if p['category'] == c), key=lambda p: len(p['variants']))['slug'])
    hits += ['krislo-naduvne', 'kylymok-vologopoglynaiuchyi-60x40', 'dzerkalnyi-dekor-akrylovyi', 'stelazh-universalnyi-yarusy']
    home = home_remont(P, save2)
    home['hits'] = hits[:10]
    pages = [{'id': 1, 'slug': 'dostavka', 'title': 'Доставка і оплата', 'in_footer': 1, 'in_menu': 0, 'sort': 0,
              'seo_desc': f'Умови доставки та оплати: {C.DELIVERY}. {C.PAYMENT}.',
              'content': f'<h2>Доставка</h2><p>{E(C.DELIVERY)}. Відправляємо після підтвердження замовлення менеджером.</p>'
                         f'<h2>Оплата</h2><p>{E(C.PAYMENT)}.</p><h2>Повернення</h2><p>Повернення та обмін — протягом 14 днів відповідно до Закону України «Про захист прав споживачів», якщо товар не був у використанні.</p>'
                         f'<h2>Контакти</h2><p>Телефон: {E(C.PHONE)}</p>'}]
    settings = {'site_url': C.SITE_URL, 'shop_name': C.SHOP_NAME, 'phone': C.PHONE, 'telegram': C.TELEGRAM, 'viber': C.VIBER,
                'email': C.EMAIL, 'city': C.CITY, 'delivery': C.DELIVERY, 'payment': C.PAYMENT,
                'pickup_address': C.PICKUP_ADDRESS, 'pickup_hours': C.PICKUP_HOURS, 'free_ship_from': '5000',
                'colors': {'Бежевий': '#b9a48f', 'Темно-сірий': '#3c3e42', 'Білий': '#f3f3f1', 'Чорний': '#151515'}}
    seed = {'settings': settings, 'home': home, 'groups': [{k: g[k] for k in ('id', 'name', 'sort')} for g in groups],
            'categories': cats, 'attributes': attrs, 'products': prods, 'filters': filters, 'pages': pages}
    json.dump(seed, open(os.path.join(ROOT, 'data/seed.json'), 'w', encoding='utf8'), ensure_ascii=False, separators=(',', ':'))

if __name__ == '__main__':
    build()
