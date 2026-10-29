"""Validate the published date index, current records and matching day snapshot."""
import json
from rising_stars import select_rising_stars
from datetime import datetime
from pathlib import Path

def main():
    root = Path(__file__).resolve().parent / "docs"
    today = datetime.now().strftime("%Y%m%d")
    dates = json.loads((root / "dates.json").read_text(encoding="utf-8"))
    latest = json.loads((root / "data.json").read_text(encoding="utf-8"))
    if not dates or dates[0]["date_key"] != today:
        raise RuntimeError("Dashboard date index is stale")
    if not isinstance(latest, dict) or not latest.get("records") or not latest.get("cards"):
        raise RuntimeError("Dashboard records or analytics are missing")
    for record in latest["records"]:
        if record["scraped_at"][:10].replace("-", "") != today:
            raise RuntimeError("Current dashboard contains records from another date")
    daily = json.loads((root / f"data_{today}.json").read_text(encoding="utf-8"))
    if daily != latest:
        raise RuntimeError("Daily snapshot differs from latest data")
    for category, card in latest['cards'].items():
        if not card:
            continue
        rows = latest['records'] if category == '전체' else [
            row for row in latest['records'] if row['category'] == category]
        if card.get('card_4_rising_stars') != select_rising_stars(rows):
            raise RuntimeError(f"Rising products or category contexts differ: {category}")
    for item in dates:
        if not (root / f"data_{item['date_key']}.json").is_file():
            raise RuntimeError("Date index points to a missing snapshot")
    print(f"Verified {today}: {len(latest['records'])} records and matching date index")

if __name__ == "__main__":
    main()
