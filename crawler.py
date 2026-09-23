import os
import sys
import re
import json
import glob
from datetime import datetime, timedelta
import pandas as pd
from playwright.sync_api import sync_playwright

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
WEB_DIR = os.path.join(BASE_DIR, "docs")
DOCS_DIR = WEB_DIR
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(WEB_DIR, exist_ok=True)

MAIN_URL = "https://gift.kakao.com/ranking/category/5"

SUB_TAB_TARGETS = [
    ("리빙 전체", "전체"),
    ("팬시/문구/취미 (IP핵심)", "팬시"),
    ("침구/패브릭", "침구"),
    ("주방/식기", "주방")
]

IP_KEYWORDS = {
    "망그러진 곰/망곰": ["망그러진", "망곰", "망그러진곰", "찌그러진곰"],
    "최고심": ["최고심", "고심이"],
    "블루 아카이브": ["블루 아카이브", "블루아카이브", "블아"],
    "먼작귀/치이카와": ["먼작귀", "치이카와", "가르마", "우사기", "하늘다람쥐", "밤만쥬"],
    "가나디": ["가나디"],
    "리락쿠마": ["리락쿠마"],
    "카카오프렌즈": ["카카오프렌즈", "라이언", "춘식이", "어피치", "무지", "죠르디", "프로도", "네오"],
    "산리오": ["산리오", "헬로키티", "마이멜로디", "쿠로미", "시나모롤", "폼폼푸린", "포차코", "한교동"],
    "포켓몬": ["포켓몬", "피카츄", "메타몽", "파이리", "꼬부기", "잠만보"],
    "잔망루피/뽀로로": ["잔망루피", "뽀로로", "크롱", "패티", "뤂덕", "루피"],
    "빵빵이": ["빵빵이", "옥지"],
    "명탐정 코난": ["명탐정 코난", "명탐정코난", "코난", "괴도 키드", "괴도키드", "남도일", "안기준"],
    "짱구": ["짱구", "흰둥이", "짱구는", "맹구"],
    "스폰지밥": ["스폰지밥", "뚱이", "집게사장", "spongebob", "스폰지 밥"],
    "몬치치": ["몬치치", "monchhichi"],
    "퍼글러": ["퍼글러", "fuggler"],
    "실바니안패밀리": ["실바니안", "sylvanian", "칼리코크리터"],
    "케어베어": ["케어베어", "carebears", "케어 베어"],
    "미피": ["미피", "miffy"],
    "무민": ["무민", "moomin"],
    "에스더버니": ["에스더버니", "estherbunny"],
    "마루는강쥐": ["마루는강쥐", "마루는 강쥐", "마루인형"],
    "호빵맨": ["호빵맨", "세균맨"],
    "톰과제리": ["톰과제리", "톰과 제리"],
    "스누피/피너츠": ["스누피", "피너츠", "찰리브라운", "우드스탁"],
    "미키/디즈니": ["디즈니", "미키", "미니마우스", "푸우", "곰돌이 푸"],
    "지브리/토토로": ["토토로", "가오나시", "지브리", "마녀배달부", "지지"],
    "오구": ["오구", "오구오구", "오구 인형", "오구 바디필로우"],
    "보노보노": ["보노보노", "포로리"],
    "몰랑": ["몰랑이", "몰랑"],
    "라인프렌즈/BT21": ["bt21", "라인프렌즈", "라인 프렌즈", "쿠니", "브라운", "코니", "샐리"],
    "메이플스토리": ["메이플스토리", "메이플 스토리", "메이플", "핑크빈", "주황버섯", "돌정령"],
    "월레스와그로밋": ["월레스", "그로밋", "숀더쉽"],
    "우파루파": ["우파루파"],
}

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
    
    brand_lower = str(brand_name).lower()
    for brand_key, sub_cat in BRAND_SUBCATEGORY.items():
        if brand_key.lower() in brand_lower:
            return sub_cat

    if any(k in text for k in ["캐릭터", "인형", "모찌", "말랑이", "스퀴시"]):
        return "기타 캐릭터/팬시"
        
    return "일반/비IP 상품"

def scrape_current_page_products(page, cat_label, top_n=50):
    products = []
    try:
        # 🔥 50위까지 충분히 수집하도록 스크롤 횟수 확대
        for _ in range(max(8, (top_n + 4) // 5)):
            page.evaluate("window.scrollBy(0, 800);")
            page.wait_for_timeout(350)

        links = page.locator('a[href*="/product/"]').all()
        seen_ids = set()
        rank = 1

        for link in links:
            try:
                href = link.get_attribute("href") or ""
                match = re.search(r'/product/(\d+)', href)
                if not match:
                    continue
                
                product_id = match.group(1)
                if product_id in seen_ids:
                    continue

                card = link.locator("xpath=ancestor::*[contains(@class, 'item') or self::gc-ranking-item or self::app-ranking-item or self::article or self::li][1]")
                if card.count() == 0:
                    card = link

                card_text = card.inner_text()
                card_html = card.inner_html()

                # 광고 상품 완전 배제
                is_ad = (
                    "ⓘ 광고" in card_text 
                    or "광고" in card_text.split()
                    or "ico_ad" in card_html 
                    or "txt_ad" in card_html
                    or "badge_ad" in card_html
                )
                if is_ad:
                    continue

                lines = [line.strip() for line in card_text.split("\n") if line.strip()]

                price = ""
                for line in lines:
                    if "원" in line and any(c.isdigit() for c in line) and "위시" not in line and "담은" not in line:
                        price_match = re.search(r'[\d,]+원', line)
                        if price_match:
                            price = price_match.group(0)
                            break

                if not price:
                    continue

                ignore_exact = [
                    "N", "NEW", "UP", "DOWN", "BEST", "선물하기", "찜하기", "위", "랭킹 홈", "랭킹 분류", 
                    "광고", "MD추천", "단독", "무료배송", "선물포장", "장바구니 담기", "사용안함", "스위치"
                ]

                filtered_lines = []
                for l in lines:
                    if l == price or l.isdigit() or l.endswith("위") or l in ignore_exact:
                        continue
                    if any(kw in l for kw in ["최근 위시", "담은 수", "보는 중", "할인율 :", "판매가 :", "브랜드명 :", "상품명 :", "스위치", "페이지"]):
                        continue
                    filtered_lines.append(l)

                brand = ""
                name = ""
                if len(filtered_lines) >= 2:
                    brand = filtered_lines[0]
                    name = " ".join(filtered_lines[1:])
                elif len(filtered_lines) == 1:
                    name = filtered_lines[0]

                name = re.sub(r'\b\d+(\.\d+)?만\b', '', name)
                name = re.sub(r'\b\d+%\b', '', name)
                for tag in ["무료배송", "선물포장", "장바구니 담기", "사용안함", "위시", "스위치", "증정", "맞춤제작", "카톡발송"]:
                    name = name.replace(tag, "")
                name = re.sub(r'\s+', ' ', name).strip()
                name = re.sub(r'^[,\s]+|[,\s]+$', '', name)

                if not name or len(name) < 2:
                    continue

                seen_ids.add(product_id)
                full_url = "https://gift.kakao.com" + href if not href.startswith("http") else href
                character_ip = detect_character_ip(name, brand)

                products.append({
                    "category": cat_label,
                    "rank": rank,
                    "brand": brand,
                    "product_name": name,
                    "price": price,
                    "character_ip": character_ip,
                    "url": full_url,
                    "product_id": product_id,
                    "scraped_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                })
                rank += 1
                if rank > top_n: # 🔥 기본 50위까지 확장 수집!
                    break
            except Exception:
                continue
    except Exception as e:
        print(f"  ❌ [{cat_label}] 수집 실패: {e}")

    print(f"  ✅ [{cat_label}] {len(products)}개 수집 완료 (기본 Top 50)")
    return products

def scrape_all_categories(top_n=50):
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] 카카오 세부 카테고리 50위 확장 수집 시작...")
    all_products = []
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = context.new_page()

        print(f"메인 카테고리 접속 중: {MAIN_URL}")
        page.goto(MAIN_URL, wait_until="networkidle", timeout=30000)
        page.wait_for_timeout(2500)

        for cat_label, btn_keyword in SUB_TAB_TARGETS:
            try:
                if cat_label != "리빙 전체":
                    buttons = page.locator('button, a').all()
                    clicked = False
                    for btn in buttons:
                        txt = btn.inner_text().strip()
                        if btn_keyword in txt and len(txt) < 15:
                            btn.click(force=True)
                            page.wait_for_timeout(2000)
                            clicked = True
                            break
                    
                    if not clicked:
                        raise RuntimeError(f"Category tab not found: {cat_label}")

                prods = scrape_current_page_products(page, cat_label, top_n=top_n)
                if not prods:
                    raise RuntimeError(f"No products collected: {cat_label}")
                all_products.extend(prods)
            except Exception as e:
                raise RuntimeError(f"Collection failed for {cat_label}") from e

        browser.close()

    return all_products

def update_master_history(df_today):
    master_file = os.path.join(DATA_DIR, "ranking_master_history.csv")
    
    if os.path.exists(master_file):
        try:
            df_master = pd.read_csv(master_file)
            today_date = datetime.now().strftime("%Y-%m-%d")
            df_master['date'] = df_master['scraped_at'].str.slice(0, 10)
            df_master = df_master[df_master['date'] != today_date].drop(columns=['date'], errors='ignore')
            
            df_combined = pd.concat([df_master, df_today], ignore_index=True)
            df_combined.to_csv(master_file, index=False, encoding="utf-8-sig")
            print(f"💾 마스터 누적 DB 업데이트 완료: {master_file} (총 {len(df_combined)}개 레코드)")
        except Exception as e:
            print(f"마스터 DB 업데이트 중 오류: {e}")
            df_today.to_csv(master_file, index=False, encoding="utf-8-sig")
    else:
        df_today.to_csv(master_file, index=False, encoding="utf-8-sig")
        print(f"💾 마스터 누적 DB 신규 생성 완료: {master_file}")

def generate_ip_insights(df_today, today_str):
    print("\n" + "="*60)
    print(f"🎨 [{today_str}] 카카오 세부 카테고리 Top 50 수집 보고서")
    print("="*60)

    for cat_name, _ in SUB_TAB_TARGETS:
        cat_df = df_today[df_today['category'] == cat_name]
        ip_df = cat_df[cat_df['character_ip'] != "일반/비IP 상품"]
        
        total_cnt = len(cat_df)
        ip_cnt = len(ip_df)
        ratio = round((ip_cnt / total_cnt) * 100, 1) if total_cnt > 0 else 0

        print(f"\n📌 [{cat_name}] 캐릭터 IP 점유율: {total_cnt}개 중 {ip_cnt}개 ({ratio}%)")
        if not ip_df.empty:
            for idx, row in ip_df.head(4).iterrows():
                print(f"   - {row['rank']}위 ({row['character_ip']}): [{row['brand']}] {row['product_name']} ({row['price']})")

    print("\n" + "="*60)

def main():
    # Also regenerate date indexes and analytics when invoked directly.
    from main import main as run_pipeline
    run_pipeline()

if __name__ == "__main__":
    main()
