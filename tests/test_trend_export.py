import json
import tempfile
from pathlib import Path
import unittest
from trend_export import export_ip_trends


class TrendExportTests(unittest.TestCase):
    def test_share_uses_each_days_observed_depth_without_rewriting_history(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for day, depth in [('20261102',50),('20261103',200)]:
                rows = [dict(category='리빙 전체', character_ip='산리오' if i < 10 else '일반/비IP 상품',
                             price='10,000원') for i in range(depth)]
                (root / f'data_{day}.json').write_text(json.dumps(dict(records=rows)),encoding='utf-8')
            before = {path.name:path.read_bytes() for path in root.glob('data*.json')}
            export_ip_trends(root)
            series = json.loads((root/'ip_trends.json').read_text(encoding='utf-8'))['리빙 전체']['산리오']
            self.assertEqual([(p['count'],p['share'],p['observed_depth']) for p in series], [(10,20.0,50),(10,5.0,200)])
            self.assertEqual(before,{path.name:path.read_bytes() for path in root.glob('data*.json')})
