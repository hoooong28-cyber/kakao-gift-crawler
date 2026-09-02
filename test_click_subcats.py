from playwright.sync_api import sync_playwright
import re

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto('https://gift.kakao.com/ranking/category/5', wait_until='networkidle')
    page.wait_for_timeout(2000)

    # 모든 서브 카테고리 버튼 찾기
    buttons = page.locator('button, a').all()
    target_cats = ["전체", "팬시", "침구", "주방"]

    for cat_name in target_cats:
        print(f"\n--- Tab Target: {cat_name} ---")
        for btn in buttons:
            try:
                txt = btn.inner_text().strip()
                if cat_name in txt and len(txt) < 15:
                    print(f"Clicking button: '{txt}'")
                    btn.click()
                    page.wait_for_timeout(2000)

                    # /product/ 링크 수집
                    links = page.locator('a[href*="/product/"]').all()
                    print(f"Found {len(links)} product links after click")
                    break
            except Exception:
                continue

    browser.close()
