import json
import tempfile
import unittest
from pathlib import Path
import pandas as pd
from analytics import generate_period_insights, export_period_insights


def row(date, pid='1', category='리빙 전체', ip='산리오', **kwargs):
    return dict(scraped_at=date, product_id=pid, category=category, character_ip=ip,
                product_name=kwargs.get('name', '상품'), price=kwargs.get('price', '10000원'), brand='브랜드')


class PeriodInsightsTests(unittest.TestCase):
    def test_sparse_calendar_and_future_exclusion(self):
        frame = pd.DataFrame([row('2026-09-01'), row('2026-10-08'), row('2026-10-09'),
                              row('2026-10-15'), row('2026-10-16'), row('invalid')])
        result = generate_period_insights(frame, 7, '2026-10-15')
        self.assertEqual((result['start_date'], result['end_date']), ('20261009', '20261015'))
        self.assertEqual((result['period_days'], result['observed_days']), (7, 2))
        self.assertEqual(result['categories']['전체']['total_records'], 2)
        monthly = generate_period_insights(frame, 30, '2026-10-15')
        self.assertEqual(monthly['start_date'], '20260916')
        self.assertEqual(monthly['observed_days'], 3)

    def test_leap_year_and_year_boundary(self):
        for end, days, start in [('2024-03-01', 7, '20240224'), ('2026-03-01', 30, '20260131'),
                                 ('2026-01-01', 7, '20251226')]:
            result = generate_period_insights(pd.DataFrame([row(end)]), days)
            self.assertEqual(result['start_date'], start)

    def test_ip_classification_category_and_distinct_product_days(self):
        frame = pd.DataFrame([row('2026-10-09', ip='산리오, 카카오프렌즈, 산리오'),
                              row('2026-10-09', category='침구/패브릭'),
                              row('2026-10-15', name='변경된 이름', price='20000원'),
                              row('2026-10-15', pid='2', ip='미분류'),
                              row('2026-10-15', pid='3', ip='일반/비IP 상품'),
                              row('2026-10-15', pid=None, ip='')])
        result = generate_period_insights(frame, 7)['categories']
        self.assertEqual(result['전체']['top_ips'][0], dict(ip_name='산리오', count=3, share='50.0%'))
        product = result['전체']['steady_products'][0]
        self.assertEqual(product['appearance_days'], 2)
        self.assertEqual(product['product_name'], '변경된 이름')
        self.assertEqual(result['침구/패브릭']['total_records'], 1)
        self.assertEqual(result['주방/식기']['steady_products'], [])

    def test_steady_products_exclude_non_ip_and_unclassified_rows_before_top_five(self):
        labels = ['일반/비IP 상품', '기타 캐릭터/팬시', '캐릭터/팬시-침구',
                  '캐릭터/팬시-팬시굿즈', '캐릭터/팬시-주방', '__미분류__', '미분류', '', None, float('nan')]
        records = [row(date, pid=str(index + 10), ip=label)
                   for index, label in enumerate(labels) for date in ['2026-10-09', '2026-10-15']]
        records += [row('2026-10-15', pid='1', ip='산리오'),
                    row('2026-10-15', pid='2', ip='기타 캐릭터/팬시, 카카오프렌즈')]
        for days in [7, 30]:
            result = generate_period_insights(pd.DataFrame(records), days)['categories']['전체']
            self.assertEqual({item['product_id'] for item in result['steady_products']}, {'1', '2'})
            self.assertEqual({item['appearance_days'] for item in result['steady_products']}, {1})
            self.assertEqual(len(result['top_ips']), 2)
        only_non_ip = generate_period_insights(pd.DataFrame(records[:-2]), 7)
        self.assertEqual(only_non_ip['categories']['전체']['steady_products'], [])

    def test_empty_and_invalid_period(self):
        self.assertEqual(generate_period_insights(pd.DataFrame(), 7), {})
        with self.assertRaises(ValueError):
            generate_period_insights(pd.DataFrame(), 8)

    def test_export_reads_daily_snapshots_without_rewriting_them(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for date in ['2026-09-01', '2026-10-09', '2026-10-15']:
                (root / ('data_' + date.replace('-', '') + '.json')).write_text(json.dumps({'records': [row(date)]}), encoding='utf-8')
            before = {p.name: p.read_bytes() for p in root.iterdir()}
            export_period_insights(root)
            self.assertEqual(before, {name: (root / name).read_bytes() for name in before})
            for label, days in [('weekly', 7), ('monthly', 30)]:
                result = json.loads((root / f'{label}_insights.json').read_text(encoding='utf-8'))
                self.assertEqual(result['period_days'], days)
                self.assertEqual(result['observed_days'], 2)
                for data in result['categories'].values():
                    self.assertIn('momentum', data)
                    self.assertEqual(data['momentum']['comparison']['status'], 'insufficient_data')
            (root / 'data_20261015.json').write_text(json.dumps({'records': [row('2026-10-14')]}), encoding='utf-8')
            with self.assertRaises(ValueError):
                export_period_insights(root)


if __name__ == '__main__':
    unittest.main()
