"""Unique rising products; ranks and movements remain category observations."""
from numbers import Real
from rank_comparison import product_key, positive_integer


def select_rising_stars(records, limit=5):
    candidates = []
    for row in records:
        key = product_key(row)
        rank = positive_integer(row.get('rank'))
        delta = row.get('rank_delta')
        if not key or not rank or row.get('rank_comparison_status') == 'unavailable':
            continue
        if row.get('is_new_entry') is True or (isinstance(delta, Real) and not isinstance(delta, bool) and delta >= 10):
            candidates.append((rank, key[0], key[1], row))
    candidates.sort(key=lambda item: item[:3])
    products = {}
    for rank, category, identity, row in candidates:
        if identity not in products:
            products[identity] = {field: row.get(field, '') for field in (
                'brand', 'product_name', 'price', 'character_ip', 'url',
                'rank_delta', 'is_new_entry')}
            products[identity].update(product_id=identity, rank=rank, category=category,
                                      ranking_contexts=[])
        contexts = products[identity]['ranking_contexts']
        # A repeated card/link in the same category is not another observation.
        if not any(context['category'] == category for context in contexts):
            contexts.append(dict(category=category, rank=rank,
                                 rank_delta=row.get('rank_delta'),
                                 is_new_entry=row.get('is_new_entry') is True))
    return list(products.values())[:limit]
