import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch
import pandas as pd
import main


class StaticExportTests(unittest.TestCase):
    def test_existing_historical_snapshot_is_not_rebuilt_from_csv(self):
        today = datetime.now(timezone(timedelta(hours=9)))
        current = today.strftime('%Y%m%d')
        previous = (today-timedelta(days=1)).strftime('%Y%m%d')
        def row(day, name):
            return dict(scraped_at=f'{day[:4]}-{day[4:6]}-{day[6:]} 09:00:00',
                        category='리빙 전체', product_id='1', rank=1,
                        product_name=name, brand='brand', price='10000원', character_ip='일반/비IP 상품')
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            data, docs = root/'data', root/'docs'
            data.mkdir()
            docs.mkdir()
            pd.DataFrame([row(previous,'different CSV title')]).to_csv(data/f'ranking_{previous}.csv',index=False)
            latest = pd.DataFrame([row(current,'current title')])
            latest.to_csv(data/f'ranking_{current}.csv',index=False)
            snapshot = docs/f'data_{previous}.json'
            snapshot.write_text(json.dumps(dict(records=[row(previous,'original snapshot')],cards={})),encoding='utf-8')
            original = snapshot.read_bytes()
            with patch.object(main,'DATA_DIR',str(data)), patch.object(main,'WEB_DIR',str(docs)):
                main.export_static_web_dataset(latest,{})
            self.assertEqual(snapshot.read_bytes(),original)
            self.assertEqual(json.loads((docs/f'data_{current}.json').read_text(encoding='utf-8'))['records'][0]['product_name'],'current title')
