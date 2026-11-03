"""Read the same public category ranking data used by gift.kakao.com."""
import json
from datetime import datetime, timedelta, timezone
from urllib.request import Request, urlopen
from rank_comparison import positive_integer

SEARCH_URL = 'https://gift.kakao.com/a/rank/v1/gift-rank/ranking-tab/category-tab/search'


def fetch_page(payload):
    request = Request(SEARCH_URL, data=json.dumps(payload).encode('utf-8'), headers={
        'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json',
        'Content-Type': 'application/json', 'Referer': 'https://gift.kakao.com/ranking/category/5'})
    last_error = None
    for _ in range(3):
        try:
            with urlopen(request, timeout=25) as response:
                return json.load(response)
        except (OSError, ValueError) as error:
            last_error = error
    raise RuntimeError('Category ranking request failed') from last_error


def collect_category(category, top_n, classify, sub_nav_id=None, fetch=fetch_page, observed_at=None):
    if positive_integer(top_n) is None:
        raise ValueError('top_n must be a positive integer')
    timestamp = observed_at or datetime.now(timezone(timedelta(hours=9))).strftime('%Y-%m-%d %H:%M:%S')
    records, seen = [], set()
    page_size = min(top_n, 200)
    updated_at = None
    for page in range(20):
        payload = dict(navId=5, page=page, size=page_size)
        if sub_nav_id is not None:
            payload['subNavId'] = sub_nav_id
        data = fetch(payload)
        products = data.get('products')
        if not isinstance(products, list) or not products:
            break
        if updated_at is not None and data.get('updatedAt') != updated_at:
            raise RuntimeError('Ranking changed during pagination; retry the collection')
        updated_at = data.get('updatedAt')
        for product in products:
            identity = positive_integer(product.get('productId', product.get('id')))
            name = product.get('name')
            brand = product.get('brand', {}).get('name', '')
            price = product.get('price', {}).get('sellingPrice')
            if not identity or not isinstance(name, str) or not name.strip() or not isinstance(price, (int, float)) or isinstance(price, bool) or price < 0:
                raise RuntimeError('Ranking contains invalid product data')
            if identity in seen:
                raise RuntimeError(f'Duplicate ranked product: {identity}')
            seen.add(identity)
            records.append(dict(category=category, rank=len(records) + 1, brand=brand,
                product_name=name.strip(), price=f'{price:,.0f}원',
                character_ip=classify(name, brand), product_id=str(identity),
                url=f'https://gift.kakao.com/product/{identity}', scraped_at=timestamp,
                ranking_updated_at=updated_at or ''))
            if len(records) == top_n:
                return records
        if data.get('last'):
            break
    raise RuntimeError(f'{category}: expected {top_n} ranked products, received {len(records)}')
