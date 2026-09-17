import unittest
from rank_comparison import compare_rankings


def row(pid=1, rank=1, category='A', name='title', **kwargs):
    return dict(product_id=pid, rank=rank, category=category, product_name=name, **kwargs)


class RankingTests(unittest.TestCase):
    def compare(self, current, previous):
        return compare_rankings([current], previous)[0]

    def test_title_change_and_numeric_id(self):
        value = self.compare(row('123.0', 1, name='title 1366'), [row(123, 1, name='title 1110')])
        self.assertEqual(value['rank_delta'], 0)
        self.assertFalse(value['is_new_entry'])

    def test_rise_and_fall(self):
        self.assertEqual(self.compare(row(1, 4), [row(1, 34)])['rank_delta'], 30)
        self.assertEqual(self.compare(row(1, 34), [row(1, 4)])['rank_delta'], -30)

    def test_distinct_id_same_title_is_new(self):
        self.assertTrue(self.compare(row(2), [row(1)])['is_new_entry'])

    def test_category_isolation(self):
        self.assertEqual(self.compare(row(1, category='B'), [row(1)])['rank_comparison_status'], 'unavailable')

    def test_url_fallback(self):
        self.assertEqual(self.compare(row(None, url='https://gift.kakao.com/product/12?x=1'), [row(12)])['rank_delta'], 0)

    def test_missing_id_not_new(self):
        self.assertEqual(self.compare(row(None), [row(1)])['rank_comparison_status'], 'unavailable')

    def test_range_expansion(self):
        previous = [row(n, n) for n in range(1, 51)]
        self.assertEqual(self.compare(row(80, 80), previous)['rank_comparison_status'], 'unavailable')
        self.assertTrue(self.compare(row(80, 10), previous)['is_new_entry'])

    def test_partial_or_duplicate_previous(self):
        for previous in ([row(1, 2)], [row(1), row(1, 2)], [row(None)]):
            self.assertEqual(self.compare(row(2), previous)['rank_comparison_status'], 'unavailable')
        self.assertEqual(self.compare(row(1), [row(1), row(1, 2)])['rank_comparison_status'], 'unavailable')

    def test_no_baseline_or_invalid_rank(self):
        for previous in ([], None):
            self.assertEqual(self.compare(row(), previous)['rank_comparison_status'], 'unavailable')
        self.assertEqual(self.compare(row(rank=0), [row()])['rank_comparison_status'], 'unavailable')

    def test_cards_threshold(self):
        import pandas as pd
        from analytics import enrich_dataframe, generate_all_dashboard_cards
        records = [row(n, n, category='리빙 전체', price='10000', brand='test', character_ip='일반/비IP 상품') for n in range(1, 13)]
        old = [dict(r) for r in records]
        old[0]['rank'], old[10]['rank'] = 11, 1
        old[1]['rank'], old[2]['rank'] = 3, 2
        enriched = enrich_dataframe(pd.DataFrame(records), pd.DataFrame(old))
        cards = generate_all_dashboard_cards(enriched)
        self.assertEqual([r['rank'] for r in cards['리빙 전체']['card_4_rising_stars']], [1])


if __name__ == '__main__':
    unittest.main()
