"""Rebuild only rising cards; preserve original observations and other analytics."""
import json
from pathlib import Path
from rising_stars import select_rising_stars


def main():
    docs = Path(__file__).resolve().parent / 'docs'
    changed = 0
    for path in sorted(docs.glob('data*.json')):
        snapshot = json.loads(path.read_text(encoding='utf-8'))
        if not isinstance(snapshot, dict):
            continue
        rows = snapshot['records']
        for category, card in snapshot.get('cards', {}).items():
            if card:
                subset = rows if category == '전체' else [r for r in rows if r['category'] == category]
                card['card_4_rising_stars'] = select_rising_stars(subset)
        path.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2, allow_nan=False), encoding='utf-8')
        changed += 1
    latest = json.loads((docs / 'data.json').read_text(encoding='utf-8'))
    (docs / 'insight_cards.json').write_text(json.dumps(latest['cards'], ensure_ascii=False, indent=2, allow_nan=False), encoding='utf-8')
    print(f'Rebuilt rising cards in {changed} snapshots and insight_cards.json')


if __name__ == '__main__':
    main()
