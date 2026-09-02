import re
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto('https://gift.kakao.com/ranking/category/5', wait_until='networkidle')
    page.wait_for_timeout(3000)

    # 스크롤을 내려서 동적 상품 로드
    for _ in range(5):
        page.evaluate("window.scrollBy(0, 800);")
        page.wait_for_timeout(400)

    # product 링크가 있는 앵커 또는 카드 탐색
    links = page.locator('a[href*="/product/"]').all()
    print(f"Total product links found: {len(links)}")

    seen_ids = set()
    cleaned_products = []
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
            
            # 카드 노드(부모 컨테이너) 탐색
            card = link.locator("xpath=ancestor::*[contains(@class, 'item') or self::gc-ranking-item or self::app-ranking-item or self::article or self::li][1]")
            if card.count() == 0:
                card = link

            card_text = card.inner_text()
            card_html = card.inner_html()

            # 🔥 1) 첫 번째 상품 위치에 광고가 있는 경우 및 '광고' 배지/텍스트 완전 제외!
            is_ad = "광고" in card_text or "광고" in card_html or "ico_ad" in card_html or "txt_ad" in card_html or "ad" in card_html.lower()

            # 카카오 선물하기 랭킹 카드 내부 클래스 셀렉터로 정확한 브랜드/상품명/가격 추출
            brand_el = card.locator("[class*='brand'], .txt_brand, strong").first
            title_el = card.locator("[class*='title'], [class*='name'], .txt_prd, .txt_title").first
            price_el = card.locator("[class*='price'], .num_price, .txt_price").first

            # 텍스트 세척
            lines = [line.strip() for line in card_text.split("\n") if line.strip()]
            
            # 광고 배지 검사
            if is_ad or any("광고" in l for l in lines):
                print(f"[광고 제외됨]: {href} (상품 ID: {product_id})")
                continue

            # 가격 추출
            price = ""
            for line in lines:
                if "원" in line and any(c.isdigit() for c in line) and "위시" not in line and "담은" not in line:
                    # '34,800원' 형태만 추출
                    price_match = re.search(r'[\d,]+원', line)
                    if price_match:
                        price = price_match.group(0)
                        break

            if not price:
                continue

            # 브랜드 & 상품명 세척
            # 불필요한 메타 텍스트 제거
            ignore_keywords = [
                "N", "NEW", "UP", "DOWN", "BEST", "선물하기", "찜하기", "위", "랭킹 홈", "랭킹 분류", 
                "광고", "MD추천", "단독", "무료배송", "선물포장", "장바구니 담기", "사용안함", "스위치", 
                "할인율", "판매가", "최혜택가", "담은 수", "보는 중", "현재 페이지", "전체 페이지", "증정"
            ]

            filtered_lines = []
            for l in lines:
                if l == price or l.isdigit() or l.endswith("위") or any(kw == l for kw in ignore_keywords):
                    continue
                if any(kw in l for kw in ["최근 위시", "담은 수", "보는 중", "할인율 :", "판매가 :", "브랜드명 :", "상품명 :", "스위치"]):
                    continue
                filtered_lines.append(l)

            brand = ""
            name = ""
            if len(filtered_lines) >= 2:
                brand = filtered_lines[0]
                name = " ".join(filtered_lines[1:])
            elif len(filtered_lines) == 1:
                name = filtered_lines[0]

            if not name or len(name) < 2:
                continue

            seen_ids.add(product_id)
            full_url = "https://gift.kakao.com" + href if not href.startswith("http") else href

            cleaned_products.append({
                "rank": rank,
                "brand": brand,
                "product_name": name,
                "price": price,
                "url": full_url,
                "product_id": product_id
            })
            print(f"Rank {rank}: [{brand}] {name} ({price})")
            rank += 1
            if rank > 50:
                break
        except Exception as e:
            continue

    browser.close()

    print("\n================ Cleaned Top 5 ================")
    for p in cleaned_products[:5]:
        print(f"{p['rank']}위: [{p['brand']}] {p['product_name']} - {p['price']}")
