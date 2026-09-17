"""Recompute historical comparisons from original dated CSVs without scraping."""
from pathlib import Path
import json
import pandas as pd
from analytics import enrich_dataframe, generate_all_dashboard_cards


def main():
    root = Path(__file__).resolve().parent
    paths = sorted((root / 'data').glob('ranking_????????.csv'))
    if not paths:
        raise RuntimeError('No dated CSV snapshots')
    previous = None
    days = []
    # Calculate and validate everything before writing any output.
    for path in paths:
        date = path.stem.removeprefix('ranking_')
        raw = pd.read_csv(path)
        enriched = enrich_dataframe(raw, previous)
        cards = generate_all_dashboard_cards(enriched)
        payload = {'records': enriched.fillna('').to_dict(orient='records'), 'cards': cards}
        json.dumps(payload, ensure_ascii=False, allow_nan=False)
        days.append((path, date, enriched, payload))
        previous = raw
    master_path = root / 'data/ranking_master_history.csv'
    frames = [day[2] for day in days]
    if master_path.exists():
        master = pd.read_csv(master_path)
        dates = {day[1] for day in days}
        master_dates = master['scraped_at'].astype(str).str[:10].str.replace('-', '')
        frames.insert(0, master[~master_dates.isin(dates)])
    master = pd.concat(frames, ignore_index=True)

    def write_json(path, value):
        path.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False), encoding='utf-8')

    for path, date, enriched, payload in days:
        enriched.to_csv(path, index=False, encoding='utf-8-sig')
        write_json(root / 'docs' / f'data_{date}.json', payload)
    master.to_csv(master_path, index=False, encoding='utf-8-sig')
    write_json(root / 'docs/history.json', master.fillna('').to_dict(orient='records'))
    write_json(root / 'docs/data.json', days[-1][3])
    write_json(root / 'docs/insight_cards.json', days[-1][3]['cards'])
    write_json(root / 'docs/dates.json', [dict(date_key=d, label=f'{d[:4]}-{d[4:6]}-{d[6:]}') for _, d, _, _ in reversed(days)])
    for _, date, frame, _ in days:
        print(date, 'records=', len(frame), 'new=', int(frame.is_new_entry.sum()),
              'unavailable=', int((frame.rank_comparison_status == 'unavailable').sum()))


if __name__ == '__main__':
    main()
