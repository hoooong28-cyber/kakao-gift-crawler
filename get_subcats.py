from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto('https://gift.kakao.com/ranking/category/5', wait_until='networkidle')
    page.wait_for_timeout(2000)

    # 카테고리 탭 탐색
    tab_buttons = page.locator('button, a').all()
    found = []
    for btn in tab_buttons:
        text = btn.inner_text().strip()
        href = btn.get_attribute("href") or ""
        if any(cat in text for cat in ["전체", "수납", "인테리어", "주방", "침구", "캔들", "팬시", "문구", "차량용"]):
            found.append((text, href))
            
    print(f"Found {len(found)} tab links:")
    for text, href in found:
        print(f"Text: '{text}' | Href: '{href}'")
        
    browser.close()
