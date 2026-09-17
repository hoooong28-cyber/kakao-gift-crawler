"""Compare observations using category and stable product identity, never titles."""
import math
import re
from decimal import Decimal, InvalidOperation
from urllib.parse import urlparse


def positive_integer(value):
    if isinstance(value, bool):
        return None
    try:
        number = Decimal(str(value).strip())
        if number.is_finite() and number > 0 and number == number.to_integral_value():
            return int(number)
    except (InvalidOperation, ValueError, TypeError):
        pass
    return None


def product_key(row):
    category = row.get('category')
    if not isinstance(category, str) or not category.strip():
        return None
    product_id = positive_integer(row.get('product_id'))
    if product_id is None:
        parsed = urlparse(str(row.get('url', '')))
        if parsed.hostname == 'gift.kakao.com':
            match = re.fullmatch(r'/product/(\d+)/?', parsed.path)
            if match:
                product_id = positive_integer(match.group(1))
    return (category.strip(), str(product_id)) if product_id else None


def compare_rankings(current, previous=None):
    previous = list(previous or [])
    by_key, groups = {}, {}
    for row in previous:
        key = product_key(row)
        rank = positive_integer(row.get('rank'))
        category = str(row.get('category', '')).strip()
        groups.setdefault(category, []).append((key, rank))
        if key:
            by_key.setdefault(key, []).append(rank)

    # A missing product means NEW only within a complete prior observed range.
    coverage = {}
    for category, rows in groups.items():
        ranks = [rank for _, rank in rows]
        keys = [key for key, _ in rows]
        if (all(keys) and all(ranks) and len(set(keys)) == len(keys)
                and sorted(ranks) == list(range(1, len(rows) + 1))):
            coverage[category] = len(rows)

    results = []
    for row in current:
        key = product_key(row)
        rank = positive_integer(row.get('rank'))
        result = {'rank_delta': '', 'is_new_entry': False,
                  'rank_comparison_status': 'unavailable'}
        if key and rank and previous:
            matches = by_key.get(key, [])
            if len(matches) == 1 and matches[0] is not None:
                result.update(rank_delta=matches[0] - rank,
                              rank_comparison_status='compared')
            elif not matches and rank <= coverage.get(key[0], 0):
                result.update(rank_delta='NEW', is_new_entry=True,
                              rank_comparison_status='new')
        results.append(result)
    return results
