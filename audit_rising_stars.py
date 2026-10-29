"""Compare saved observations and rising cards with the pre-fix Git revision."""
from collections import Counter
import json
from pathlib import Path
import subprocess
from rank_comparison import product_key


def main():
    root = Path(__file__).resolve().parent
    git = ['git', '-c', f'safe.directory={root.as_posix()}']
    files = sorted((root / 'docs').glob('data_????????.json'))
    repeated_observations = repeated_ranks = old_duplicate_cards = dates = 0
    for path in files:
        rel = path.relative_to(root).as_posix()
        old = json.loads(subprocess.check_output(git + ['show', f'3b378c0:{rel}'], cwd=root))
        new = json.loads(path.read_text(encoding='utf-8'))
        rows = old if isinstance(old, list) else old['records']
        assert rows == (new if isinstance(new, list) else new['records']), rel
        for key, count in Counter(product_key(row) for row in rows).items():
            if key:
                repeated_observations += max(0, count - 1)
        repeated_ranks += sum(max(0, count - 1) for count in Counter(
            (row.get('category'), row.get('rank')) for row in rows).values())
        if not isinstance(old, dict):
            continue
        dates += 1
        for category, card in old.get('cards', {}).items():
            if not card:
                continue
            old_ids = [product_key(r)[1] for r in card.get('card_4_rising_stars', []) if product_key(r)]
            old_duplicate_cards += int(len(old_ids) != len(set(old_ids)))
            fixed = new['cards'][category]['card_4_rising_stars']
            ids = [r['product_id'] for r in fixed]
            assert len(ids) == len(set(ids)), rel
            assert {k: v for k, v in card.items() if k != 'card_4_rising_stars'} == {
                k: v for k, v in new['cards'][category].items() if k != 'card_4_rising_stars'}, rel
    latest = json.loads((root / 'docs/data.json').read_text(encoding='utf-8'))
    print(json.dumps(dict(dated_files=len(files), card_dates=dates,
        duplicate_category_products=repeated_observations,
        duplicate_category_ranks=repeated_ranks,
        old_cards_with_duplicate_products=old_duplicate_cards,
        new_cards_with_duplicate_products=0,
        latest=[dict(product_id=r['product_id'], contexts=r['ranking_contexts'])
                for r in latest['cards']['전체']['card_4_rising_stars']]), ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
