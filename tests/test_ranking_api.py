import unittest
from ranking_api import collect_category


def product(identity):
    return dict(id=identity, name=f'상품 {identity}', brand={'name':'브랜드'},
                price={'sellingPrice':10000})


class ApiRankingTests(unittest.TestCase):
    def test_living_200_and_subcategory_request(self):
        payloads = []
        def fetch(payload):
            payloads.append(payload)
            return dict(updatedAt='11.03 14:00', last=False, products=[product(i) for i in range(1, 201)])
        rows = collect_category('리빙 전체', 200, lambda name, brand:'일반/비IP 상품', fetch=fetch)
        self.assertEqual(len(rows), 200)
        self.assertEqual([r['rank'] for r in rows], list(range(1,201)))
        self.assertEqual(len({r['product_id'] for r in rows}), 200)
        self.assertEqual(payloads, [dict(navId=5,page=0,size=200)])
        payloads.clear()
        rows = collect_category('주방/식기',50,lambda n,b:'IP',110,fetch=fetch)
        self.assertEqual(len(rows),50)
        self.assertEqual(payloads[0],dict(navId=5,page=0,size=50,subNavId=110))

    def test_pagination_does_not_renumber_duplicate_products(self):
        def fetch(payload):
            return dict(updatedAt='same', last=False, products=[product(1),product(2)])
        with self.assertRaisesRegex(RuntimeError,'Duplicate'):
            collect_category('리빙 전체',4,lambda n,b:'IP',fetch=fetch)

    def test_partial_or_changed_rankings_are_not_published(self):
        with self.assertRaisesRegex(RuntimeError,'expected 200'):
            collect_category('리빙 전체',200,lambda n,b:'IP',fetch=lambda p:dict(last=True,products=[product(1)]))
        def fetch(payload):
            return dict(updatedAt=str(payload['page']),last=False,products=[product(payload['page']+1)])
        with self.assertRaisesRegex(RuntimeError,'changed during'):
            collect_category('리빙 전체',2,lambda n,b:'IP',fetch=fetch)

    def test_invalid_product_or_depth_fails(self):
        for depth in [0,-1,True,None]:
            with self.assertRaises(ValueError):
                collect_category('리빙 전체',depth,lambda n,b:'IP')
        with self.assertRaisesRegex(RuntimeError,'invalid product'):
            collect_category('리빙 전체',1,lambda n,b:'IP',fetch=lambda p:dict(products=[dict(product(1),price={})]))


if __name__ == '__main__':
    unittest.main()
