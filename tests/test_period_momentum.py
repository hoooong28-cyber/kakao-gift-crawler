from datetime import date, timedelta
import unittest
from period_momentum import generate_ip_momentum


def observations(offsets=range(14), depth=10):
    rows = []
    for offset in offsets:
        current = offset >= 7
        names = {1: '성장' if current else '하락', 2: '유지',
                 3: '신규' if current else '일반/비IP 상품',
                 4: '일반/비IP 상품' if current else '소멸',
                 5: '하락' if current else '성장'}
        for rank in range(1, depth + 1):
            rows.append(dict(category='리빙 전체', product_id=str(rank), rank=rank,
                scraped_at=str(date(2026, 10, 15) + timedelta(days=offset)),
                character_ip=names.get(rank, '미분류'), product_name=f'상품 {rank}',
                brand='브랜드', price='10000원'))
    return rows


def momentum(rows, categories=None):
    return generate_ip_momentum(rows, 7, '2026-10-28', categories or ['리빙 전체'])


class MomentumTests(unittest.TestCase):
    def test_windows_growth_decline_new_stable_and_disappearance(self):
        result = momentum(observations())
        self.assertEqual(result['comparison']['start_date'], '20261015')
        self.assertEqual(result['comparison']['end_date'], '20261021')
        self.assertEqual(result['comparison']['current_start_date'], '20261022')
        self.assertEqual(result['comparison']['observed_days'], 7)
        self.assertEqual([r['ip_name'] for r in result['rising_ips']], ['성장'])
        self.assertEqual(result['rising_ips'][0]['curr_score'], 10)
        self.assertEqual(result['rising_ips'][0]['prev_score'], 6)
        self.assertEqual([r['ip_name'] for r in result['new_entry_ips']], ['신규'])
        self.assertEqual([r['ip_name'] for r in result['stable_ips']], ['유지'])
        self.assertEqual({r['ip_name'] for r in result['falling_ips']}, {'하락', '소멸'})
        disappeared = next(r for r in result['falling_ips'] if r['ip_name'] == '소멸')
        self.assertEqual(disappeared['growth_rate'], '-100.0%')
        self.assertEqual(disappeared['appearance_days'], 0)
        self.assertEqual(disappeared['evidence_period'], 'previous')
        self.assertEqual(disappeared['evidence_products'][0]['best_rank'], 4)

    def test_daily_normalization_and_minimum_coverage(self):
        sparse = observations([0, 2, 4, 6, 7, 8, 9, 10, 11, 12, 13])
        result = momentum(sparse)
        stable = result['stable_ips'][0]
        self.assertEqual(stable['curr_score'], stable['prev_score'])
        self.assertEqual(result['comparison']['observed_days'], 4)
        self.assertEqual(momentum(observations([0, 2, 4, 7, 8, 9, 10]))['comparison']['status'], 'insufficient_data')
        self.assertEqual(momentum(observations(range(7, 14)))['comparison']['status'], 'insufficient_data')

    def test_common_depth_removes_artificial_top100_to_top50_decline(self):
        rows = observations(depth=10)
        for row in observations(range(7), depth=20):
            if row['rank'] > 10:
                row['character_ip'] = '과거 확장범위'
                rows.append(row)
        result = momentum(rows)
        self.assertEqual(result['comparison']['rank_depths'], {'리빙 전체': 10})
        self.assertNotIn('과거 확장범위', str(result))

    def test_duplicates_labels_and_collaboration(self):
        rows = observations()
        for row in rows:
            if row['rank'] == 2:
                row['character_ip'] = '유지, 콜라보, 유지, 미분류'
        self.assertEqual(momentum(rows), momentum(rows + rows))
        stable = momentum(rows)['stable_ips']
        self.assertEqual({r['ip_name'] for r in stable}, {'유지', '콜라보'})
        self.assertEqual({r['count'] for r in stable}, {7})

    def test_category_isolation_and_incomplete_rank_range(self):
        self.assertEqual(momentum(observations(), ['리빙 전체', '침구/패브릭'])['comparison']['status'], 'insufficient_data')
        rows = [r for r in observations() if not (r['scraped_at'] == '2026-10-15' and r['rank'] == 5)]
        self.assertEqual(momentum(rows)['comparison']['status'], 'insufficient_data')

    def test_future_observations_are_excluded(self):
        rows = observations()
        future = dict(rows[0], scraped_at='2026-10-29', character_ip='미래')
        self.assertEqual(momentum(rows), momentum(rows + [future]))

    def test_deploy_validator_rejects_dropped_momentum(self):
        import json
        from pathlib import Path
        from verify_dashboard import validate_period_report
        report = json.loads((Path(__file__).resolve().parents[1] / 'docs/weekly_insights.json').read_text(encoding='utf-8'))
        validate_period_report(report, 7, report['end_date'])
        del report['categories']['전체']['momentum']
        with self.assertRaisesRegex(RuntimeError, 'Momentum comparison is missing'):
            validate_period_report(report, 7, report['end_date'])


if __name__ == '__main__':
    unittest.main()
