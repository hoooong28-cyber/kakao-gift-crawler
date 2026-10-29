"""Calendar-period IP momentum from comparable category ranking observations."""
from collections import defaultdict
from datetime import date, timedelta
from math import ceil
from rank_comparison import positive_integer, product_key

EXCLUDED = {'일반/비IP 상품', '기타 캐릭터/팬시', '캐릭터/팬시-침구',
            '캐릭터/팬시-팬시굿즈', '캐릭터/팬시-주방', '__미분류__', '미분류'}


def classified_names(label):
    if not isinstance(label, str):
        return set()
    return {name.strip() for name in label.split(',')} - EXCLUDED - {''}


def generate_ip_momentum(records, days, end_date, categories):
    end = date.fromisoformat(str(end_date)[:10])
    start = end - timedelta(days=days - 1)
    previous_end = start - timedelta(days=1)
    previous_start = start - timedelta(days=days)
    minimum = ceil(days / 2)
    windows = {'current': defaultdict(dict), 'previous': defaultdict(dict)}
    for record in records:
        try:
            observed = date.fromisoformat(str(record.get('scraped_at', ''))[:10])
        except ValueError:
            continue
        key = product_key(record)
        rank = positive_integer(record.get('rank'))
        if not key or not rank or key[0] not in categories:
            continue
        period = 'current' if start <= observed <= end else (
            'previous' if previous_start <= observed <= previous_end else None)
        if period:
            group = windows[period][(key[0], observed)]
            # Repeated links/snapshots are one product observation per category/day.
            if key[1] not in group or rank < positive_integer(group[key[1]]['rank']):
                group[key[1]] = record

    coverage = {period: {cat: len([1 for category, _ in groups if category == cat])
                         for cat in categories} for period, groups in windows.items()}
    observed_days = {period: len({day for _, day in groups}) for period, groups in windows.items()}
    comparison = dict(status='available', period_days=days,
        current_start_date=start.strftime('%Y%m%d'), current_end_date=end.strftime('%Y%m%d'),
        start_date=previous_start.strftime('%Y%m%d'), end_date=previous_end.strftime('%Y%m%d'),
        current_observed_days=observed_days['current'], observed_days=observed_days['previous'],
        minimum_observed_days=minimum, category_observed_days=coverage,
        rank_depths={}, growth_threshold_percent=10,
        score_method='카테고리별 공통 수집 범위 N에서 (N+1-순위)를 합산하고 해당 카테고리 수집일 수로 나눈 뒤 합계',
        score_unit='수집일당 평균 순위 가중 점수')
    result = dict(comparison=comparison, rising_ips=[], new_entry_ips=[], stable_ips=[], falling_ips=[])
    if not categories or any(count < minimum for counts in coverage.values() for count in counts.values()):
        comparison.update(status='insufficient_data',
            note=f'최근·직전 {days}일의 각 카테고리에 최소 {minimum}일 수집이 필요합니다. '
                 f"현재 {observed_days['current']}일 / 직전 {observed_days['previous']}일 관측.")
        return result

    # Top 100 and Top 50 snapshots must not produce spurious growth/decline.
    for cat in categories:
        daily = [group for groups in windows.values() for (category, _), group in groups.items() if category == cat]
        depth = min(max(positive_integer(row['rank']) for row in group.values()) for group in daily)
        comparison['rank_depths'][cat] = depth
        for group in daily:
            ranks = [positive_integer(row['rank']) for row in group.values()
                     if positive_integer(row['rank']) <= depth]
            if sorted(ranks) != list(range(1, depth + 1)):
                comparison.update(status='insufficient_data', note=f'{cat}의 순위 누락·중복으로 공통 Top {depth} 비교를 할 수 없습니다.')
                return result

    def summarize(period):
        ips = {}
        for (category, observed), group in sorted(windows[period].items()):
            depth = comparison['rank_depths'][category]
            for identity, row in group.items():
                rank = positive_integer(row['rank'])
                if rank > depth:
                    continue
                for ip in classified_names(row.get('character_ip')):
                    stats = ips.setdefault(ip, dict(score=0.0, count=0, dates=set(), top10=0, products={}))
                    stats['score'] += (depth + 1 - rank) / coverage[period][category]
                    stats['count'] += 1
                    stats['dates'].add(observed)
                    stats['top10'] += int(rank <= 10)
                    product = stats['products'].setdefault(identity, dict(dates=set(), best_rank=rank))
                    product['dates'].add(observed)
                    product['best_rank'] = min(product['best_rank'], rank)
                    product['record'] = row  # chronological traversal: latest title/price
        return ips

    current, previous = summarize('current'), summarize('previous')
    for ip in sorted(current.keys() | previous.keys()):
        curr, prev = current.get(ip, {}), previous.get(ip, {})
        curr_score, prev_score = curr.get('score', 0), prev.get('score', 0)
        growth = (curr_score - prev_score) / prev_score * 100 if prev_score else None
        if not prev_score:
            bucket, kind, badge = 'new_entry_ips', 'NEW_ENTRY', '관측상 신규'
        elif curr_score == 0 or growth <= -10 + 1e-9:
            bucket, kind, badge = 'falling_ips', 'FALLING', '하락'
        elif growth >= 10 - 1e-9:
            bucket, kind, badge = 'rising_ips', 'RISING', '상승'
        else:
            bucket, kind, badge = 'stable_ips', 'STABLE', '안정적 강세'
        evidence = curr or prev
        products = []
        for identity, product in sorted(evidence['products'].items(),
                key=lambda pair: (pair[1]['best_rank'], -len(pair[1]['dates']), pair[0]))[:3]:
            products.append(dict(product_id=identity, best_rank=product['best_rank'],
                appearance_days=len(product['dates']),
                **{field: str(product['record'].get(field, '') or '') for field in ['product_name', 'brand', 'price']}))
        result[bucket].append(dict(ip_name=ip, momentum_type=kind, momentum_badge=badge,
            curr_score=round(curr_score, 1), prev_score=round(prev_score, 1),
            score_delta=round(curr_score - prev_score, 1),
            growth_rate=f'{growth:+.1f}%' if growth is not None else '관측상 신규',
            count=curr.get('count', 0), prev_count=prev.get('count', 0),
            appearance_days=len(curr.get('dates', [])), prev_appearance_days=len(prev.get('dates', [])),
            unique_products_count=len(curr.get('products', {})), top10_count=curr.get('top10', 0),
            evidence_period='current' if curr else 'previous', evidence_products=products))
    for bucket in ['rising_ips', 'new_entry_ips', 'stable_ips', 'falling_ips']:
        if bucket == 'falling_ips':
            result[bucket].sort(key=lambda item: (item['score_delta'], item['ip_name']))
        elif bucket == 'rising_ips':
            result[bucket].sort(key=lambda item: (-item['score_delta'], item['ip_name']))
        else:
            result[bucket].sort(key=lambda item: (-item['curr_score'], item['ip_name']))
        result[bucket] = result[bucket][:10]
    comparison['note'] = (
        f'최근 {days}일 ({start:%Y%m%d}~{end:%Y%m%d}, 수집 {observed_days["current"]}일) / '
        f'직전 {days}일 ({previous_start:%Y%m%d}~{previous_end:%Y%m%d}, 수집 {observed_days["previous"]}일). '
        '카테고리별 공통 수집 범위·수집일당 평균으로 비교 · ±10% 기준 · 매출 성장률 아님.')
    return result
