"""Publish a fresh same-day snapshot without rewriting earlier observations."""
import hashlib
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
import pandas as pd
from analytics import enrich_dataframe, generate_all_dashboard_cards, export_period_insights
from trend_export import export_ip_trends


def main(source):
    root = Path(__file__).resolve().parent
    today = datetime.now(timezone(timedelta(hours=9))).strftime('%Y%m%d')
    docs = root / 'docs'
    before = {path: hashlib.sha256(path.read_bytes()).hexdigest()
              for pattern in ['data_????????.json'] for path in docs.glob(pattern)
              if path.stem != f'data_{today}'}
    raw = pd.DataFrame(json.loads(Path(source).read_text(encoding='utf-8')))
    if not raw['scraped_at'].str[:10].str.replace('-', '').eq(today).all():
        raise RuntimeError('Fresh observations must match today')
    previous_paths = sorted(p for p in (root / 'data').glob('ranking_????????.csv')
                            if p.stem[8:] < today)
    previous = pd.read_csv(previous_paths[-1]) if previous_paths else None
    enriched = enrich_dataframe(raw, previous)
    cards = generate_all_dashboard_cards(enriched)
    payload = dict(records=enriched.fillna('').to_dict(orient='records'), cards=cards)
    json.dumps(payload, allow_nan=False)
    enriched.to_csv(root / f'data/ranking_{today}.csv', index=False, encoding='utf-8-sig')
    master_path = root / 'data/ranking_master_history.csv'
    master = pd.read_csv(master_path)
    master_dates = master['scraped_at'].astype(str).str[:10].str.replace('-', '')
    master = pd.concat([master[master_dates != today], enriched], ignore_index=True)
    master.to_csv(master_path, index=False, encoding='utf-8-sig')

    def save(path, value):
        path.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False), encoding='utf-8')

    save(docs / f'data_{today}.json', payload)
    save(docs / 'data.json', payload)
    save(docs / 'insight_cards.json', cards)
    save(docs / 'history.json', master.fillna('').to_dict(orient='records'))
    dates = [dict(date_key=path.stem[5:], label=f'{path.stem[5:9]}-{path.stem[9:11]}-{path.stem[11:13]}')
             for path in sorted(docs.glob('data_????????.json'), reverse=True)]
    save(docs / 'dates.json', dates)
    export_period_insights(docs)
    export_ip_trends(docs)
    assert all(hashlib.sha256(path.read_bytes()).hexdigest() == digest for path, digest in before.items())
    living = [row for row in payload['records'] if row['category'] == '리빙 전체']
    print(f'Published {today}: living={len(living)}, all observations={len(enriched)}; {len(before)} earlier snapshots unchanged')
    print('Living ranks 51..200 falsely marked NEW:', sum(row['is_new_entry'] for row in living if row['rank'] > 50))


if __name__ == '__main__':
    import sys
    main(sys.argv[1])
