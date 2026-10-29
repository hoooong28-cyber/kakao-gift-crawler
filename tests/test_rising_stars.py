import json
from pathlib import Path
import unittest
from rising_stars import select_rising_stars

ROOT = Path(__file__).resolve().parents[1]


class RisingStarsTests(unittest.TestCase):
    def test_deploy_validator_at_saved_collection_date(self):
        from datetime import datetime
        from unittest.mock import patch
        import verify_dashboard
        latest_date = json.loads((ROOT / 'docs/dates.json').read_text(encoding='utf-8'))[0]['date_key']
        with patch('verify_dashboard.datetime') as clock:
            clock.now.return_value = datetime.strptime(latest_date, '%Y%m%d')
            verify_dashboard.main()

    def test_identity_context_threshold_and_order(self):
        def row(pid, rank=1, category='A', delta=10, **kw):
            return dict(product_id=pid, rank=rank, category=category,
                        rank_delta=delta, product_name='same title', **kw)
        rows = [row(1, category='B'), row('1.0'), row(1), row(2),
                row(3, delta=9), row(4, delta='NEW', is_new_entry=True),
                row(5, delta=100, rank_comparison_status='unavailable'),
                row(None), row(7, rank=0),
                row(None, url='https://gift.kakao.com/product/8?tracking=1')]
        result = select_rising_stars(rows)
        self.assertEqual([p['product_id'] for p in result], ['1', '2', '4', '8'])
        self.assertEqual([c['category'] for c in result[0]['ranking_contexts']], ['A', 'B'])
        self.assertEqual(select_rising_stars(list(reversed(rows))), result)
        self.assertEqual(len(select_rising_stars(rows, 2)), 2)

    def test_csv_numeric_string_movement(self):
        rows = [dict(product_id=1, rank=1, category='A', rank_delta='32')]
        self.assertEqual(select_rising_stars(rows)[0]['ranking_contexts'][0]['rank_delta'], '32')
        for value in ['NEW', '', 'NaN', 'Infinity', True]:
            self.assertEqual(select_rising_stars([dict(rows[0], rank_delta=value)]), [])

    def test_saved_snapshots_match_and_preserve_category_observations(self):
        for path in (ROOT / 'docs').glob('data*.json'):
            snapshot = json.loads(path.read_text(encoding='utf-8'))
            rows = snapshot if isinstance(snapshot, list) else snapshot['records']
            cards = {} if isinstance(snapshot, list) else snapshot.get('cards', {})
            for category, card in cards.items():
                if not card:
                    continue
                subset = rows if category == '전체' else [r for r in rows if r['category'] == category]
                result = select_rising_stars(subset)
                self.assertEqual(card['card_4_rising_stars'], result, f'{path.name}/{category}')
                ids = [r['product_id'] for r in result]
                self.assertEqual(len(ids), len(set(ids)))
                for product in result:
                    for context in product['ranking_contexts']:
                        self.assertTrue(any(str(r.get('product_id')) == product['product_id'] and
                                            all(r.get(k) == v for k, v in context.items()) for r in subset))


if __name__ == '__main__':
    unittest.main()
