from playwright.sync_api import sync_playwright
import json

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto('https://gift.kakao.com/ranking/category/5', wait_until='networkidle')
    page.wait_for_timeout(3000)

    # DOM 탐색: 상품 카드의 정확한 셀렉터 및 구조 파악
    # 1. 랭킹 아이템 타겟팅
    items = page.evaluate("""() => {
        const results = [];
        // 카카오 선물하기 랭킹 아이템 셀렉터 탐색
        const cardElements = document.querySelectorAll('gc-ranking-item, app-ranking-item, .list_product > li, article, .thumb_prd');
        
        cardElements.forEach((el, idx) => {
            const text = el.innerText || '';
            const html = el.outerHTML || '';
            const isAd = text.includes('광고') || html.includes('광고') || el.querySelector('.ico_ad, .txt_ad, [class*="ad"]') !== null;
            const hasRankBadge = el.querySelector('[class*="rank"], [class*="num"], .num_rank') !== null;
            
            // a 태그 링크
            const aTag = el.querySelector('a');
            const href = aTag ? aTag.getAttribute('href') : '';
            
            results.push({
                index: idx,
                tagName: el.tagName,
                className: el.className,
                isAd: isAd,
                hasRankBadge: hasRankBadge,
                textSnippet: text.substring(0, 150).replace(/\n/g, ' | '),
                href: href
            });
        });
        return results;
    }""")
    
    print(f"Total found items: {len(items)}")
    for item in items[:10]:
        print(json.dumps(item, ensure_ascii=False, indent=2))
        
    browser.close()
