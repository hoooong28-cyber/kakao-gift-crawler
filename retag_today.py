import os
import sys
import re
import pandas as pd
from datetime import datetime

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
WEB_DIR = os.path.join(BASE_DIR, "docs")

from crawler import IP_KEYWORDS, BRAND_SUBCATEGORY, detect_character_ip

def retag_today():
    today_str = datetime.now().strftime("%Y%m%d")
    csv_file = os.path.join(DATA_DIR, f"ranking_{today_str}.csv")

    if not os.path.exists(csv_file):
        print(f"❌ 오늘자 CSV 없음: {csv_file}")
        return

    df = pd.read_csv(csv_file)
    before_counts = df['character_ip'].value_counts().to_dict()

    df['character_ip'] = df.apply(lambda r: detect_character_ip(str(r['product_name']), str(r['brand'])), axis=1)

    after_counts = df['character_ip'].value_counts().to_dict()

    # 신규로 분류된 IP들 출력
    newly_tagged = {}
    for ip in after_counts:
        before = before_counts.get(ip, 0)
        after = after_counts.get(ip, 0)
        if after > before and ip not in ["일반/비IP 상품", "기타 캐릭터/팬시"]:
            newly_tagged[ip] = (before, after)

    if newly_tagged:
        print("\n🎉 새로 승격된 IP 태그 목록:")
        for ip, (b, a) in newly_tagged.items():
            items = df[df['character_ip'] == ip]
            print(f"\n  🔥 [{ip}] {b}개 → {a}개 승격:")
            for _, r in items.iterrows():
                print(f"    [{r['category']}] {r['rank']}위 | [{r['brand']}] {r['product_name']} ({r['price']})")

    # 기타 캐릭터/팬시 세분화 결과
    sub_cats = [v for v in after_counts if "캐릭터/팬시-" in str(v)]
    if sub_cats:
        print("\n🗂️  '기타 캐릭터/팬시' 세분화 분류 결과:")
        for sc in sub_cats:
            items = df[df['character_ip'] == sc]
            print(f"  [{sc}]: {len(items)}건")

    print(f"\n📊 전후 통계:")
    print(f"  - '일반/비IP 상품': {before_counts.get('일반/비IP 상품', 0)}개 → {after_counts.get('일반/비IP 상품', 0)}개")
    print(f"  - '기타 캐릭터/팬시': {before_counts.get('기타 캐릭터/팬시', 0)}개 → {after_counts.get('기타 캐릭터/팬시', 0)}개")

    # 저장
    df.to_csv(csv_file, index=False, encoding="utf-8-sig")

    json_file = os.path.join(WEB_DIR, "data.json")
    df.to_json(json_file, orient="records", force_ascii=False, indent=2)

    # 마스터 DB도 재태깅
    master_file = os.path.join(DATA_DIR, "ranking_master_history.csv")
    if os.path.exists(master_file):
        df_master = pd.read_csv(master_file)
        df_master['character_ip'] = df_master.apply(lambda r: detect_character_ip(str(r['product_name']), str(r['brand'])), axis=1)
        df_master.to_csv(master_file, index=False, encoding="utf-8-sig")
        print(f"\n💾 마스터 누적 DB도 재태깅 완료.")

if __name__ == "__main__":
    retag_today()
