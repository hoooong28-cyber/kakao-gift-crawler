"""Export observed IP series from preserved daily snapshots, including expanded ranks."""
import json
import re
from pathlib import Path
from period_momentum import classified_names


def export_ip_trends(web_dir):
    root = Path(web_dir)
    output = {}
    for path in sorted(root.glob('data_????????.json')):
        payload = json.loads(path.read_text(encoding='utf-8'))
        rows = payload if isinstance(payload, list) else payload['records']
        categories = sorted({r.get('category', '리빙 전체') for r in rows})
        for category in ['전체'] + categories:
            subset = rows if category == '전체' else [r for r in rows if r.get('category', '리빙 전체') == category]
            groups = {}
            for record in subset:
                names = classified_names(record.get('character_ip'))
                if not names and record.get('character_ip') != '일반/비IP 상품':
                    names = {'__미분류__'}
                for name in names:
                    groups.setdefault(name, []).append(record)
            for name, products in groups.items():
                prices = []
                for product in products:
                    value = product.get('price_numeric') or product.get('price_num') or product.get('price', '')
                    try:
                        price = float(re.sub(r'[^0-9.]', '', str(value)))
                        if price > 0:
                            prices.append(price)
                    except ValueError:
                        pass
                output.setdefault(category, {}).setdefault(name, []).append(dict(
                    date=path.stem[5:], count=len(products), share=round(len(products)/len(subset)*100, 1),
                    avg_price=round(sum(prices)/len(prices)) if prices else 0,
                    observed_depth=len(subset)))
    (root / 'ip_trends.json').write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding='utf-8')
