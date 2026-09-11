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
WEB_DIR = os.path.join(BASE_DIR, "web")

# 최신 IP_KEYWORDS (crawler.py와 완전 동기화)
IP_KEYWORDS = {
    "먼작귀/치이카와": ["먼작귀", "치이카와", "가르마", "토끼", "해달", "하늘다람쥐", "밤만쥬"],
    "가나디": ["가나디"],
    "리락쿠마": ["리락쿠마"],
    "카카오프렌즈": ["카카오프렌즈", "라이언", "춘식이", "어피치", "무지", "죠르디"],
    "산리오": ["산리오", "헬로키티", "마이멜로디", "쿠로미", "시나모롤", "폼폼푸린", "포차코", "한교동"],
    "포켓몬": ["포켓몬", "피카츄", "메타몽", "파이리", "꼬부기", "잠만보"],
    "잔망루피/뽀로로": ["루피", "잔망루피", "뽀로로", "크롱", "패티", "뤂덕"],
    "빵빵이": ["빵빵이", "옥지"],
    "명탐정 코난": ["명탐정 코난", "명탐정코난", "코난", "괴도 키드", "괴도키드", "남도일", "안기준"],
    "짱구": ["짱구", "흰둥이", "짱구는"],
    "스폰지밥": ["스폰지밥", "뚱이", "집게사장", "spongebob", "스폰지 밥"],
    "몬치치": ["몬치치", "monchhichi"],
    "퍼글러": ["퍼글러", "fuggler"],
    "실바니안패밀리": ["실바니안", "sylvanian", "칼리코크리터"],
    "케어베어": ["케어베어", "carebears", "케어 베어"],
    "미피": ["미피", "miffy"],
    "무민": ["무민", "moomin"],
    "에스더버니": ["에스더버니", "estherbunny"],
    "마루는강쥐": ["마루는강쥐", "마루는 강쥐"],
    "호빵맨": ["호빵맨", "세균맨"],
    "톰과제리": ["톰과제리", "톰과 제리"],
    "스누피/피너츠": ["스누피", "피너츠", "찰리브라운"],
    "미키/디즈니": ["디즈니", "미키", "미니마우스", "푸우", "곰돌이 푸"],
    "지브리/토토로": ["토토로", "가오나시", "지브리", "마녀배달부"],
    "오구": ["오구오구", " 오구 "],
    "보노보노": ["보노보노", "포로리"],
    "몰랑": ["몰랑이", "몰랑"],
    "라인프렌즈/BT21": ["bt21", "라인프렌즈", "프로도", "네오", "쿠니"],
    "메이플스토리": ["메이플", "핑크빈", "주황버섯"],
    "월레스와그로밋": ["월레스", "그로밋", "숀더쉽"],
}

# 기타 캐릭터/팬시 분류 시 제조사 이름으로 세분화 가능한 패턴
BRAND_SUBCATEGORY = {
    "캐릭터침구": "캐릭터/팬시-침구",
    "캐릭터주방": "캐릭터/팬시-주방",
    "캐릭터패브릭": "캐릭터/팬시-패브릭",
    "프로젝트슬립": "캐릭터/팬시-침구",
    "제이블룸": "캐릭터/팬시-팬시굿즈",
}

def detect_character_ip(product_name, brand_name):
    text = f"{brand_name} {product_name}".lower()
    detected_ips = []
    for ip_name, keywords in IP_KEYWORDS.items():
        for kw in keywords:
            if kw.lower() in text:
                detected_ips.append(ip_name)
                break
    if detected_ips:
        return ", ".join(detected_ips)
    
    # 기타 캐릭터/팬시: 브랜드명 기반 세분화 시도
    brand_lower = str(brand_name).lower()
    for brand_key, sub_cat in BRAND_SUBCATEGORY.items():
        if brand_key.lower() in brand_lower:
            return sub_cat
    
    # 캐릭터 관련 키워드가 있지만 특정 IP는 모를 경우
    if any(k in text for k in ["캐릭터", "인형", "모찌", "말랑이", "스퀴시"]):
        return "기타 캐릭터/팬시"
    
    return "일반/비IP 상품"

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
