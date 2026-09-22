document.addEventListener('DOMContentLoaded', () => {
    let rawProductsData = [];
    let insightCardsData = {};
    let activeCategory = 'all';
    let activePage = 'page-overview';
    let selectedDate = ''; // '' = 최신 날짜

    let ipChartInstance = null;
    let brandChartInstance = null;
    let trendChartInstance = null;
    let ipTrendsData = {};
    let trendMetric = 'share';
    let trendSelectedIps = null; // null이면 기본(상위 5개) 사용

    const refreshBtn = document.getElementById('refresh-btn');
    const searchBox = document.getElementById('search-box');
    const mainNavMenu = document.getElementById('main-nav-menu');
    const dateSelector = document.getElementById('date-selector');

    // Sidebar Page Tab Switching
    mainNavMenu.addEventListener('click', (e) => {
        const btn = e.target.closest('.nav-item');
        if (!btn) return;

        document.querySelectorAll('#main-nav-menu .nav-item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        activePage = btn.getAttribute('data-page');
        document.querySelectorAll('.page-view').forEach(view => {
            if (view.id === activePage) {
                view.classList.add('active');
            } else {
                view.classList.remove('active');
            }
        });

        renderDashboard();
    });

    // Category Filter Bar Listener (Overview, B2B & Table Views)
    document.addEventListener('click', (e) => {
        const tabBtn = e.target.closest('.cat-tab');
        if (!tabBtn) return;

        const parentContainer = tabBtn.closest('.category-tabs');
        if (parentContainer) {
            parentContainer.querySelectorAll('.cat-tab').forEach(b => b.classList.remove('active'));
            tabBtn.classList.add('active');
        }

        activeCategory = tabBtn.getAttribute('data-cat');
        
        // Sync active class across all category tab containers
        document.querySelectorAll('.cat-tab').forEach(b => {
            if (b.getAttribute('data-cat') === activeCategory) {
                b.classList.add('active');
            } else {
                b.classList.remove('active');
            }
        });

        renderDashboard();
    });

    // GitHub Pages 등 정적 호스팅은 JSON 파일에 캐시 헤더를 걸어두는 경우가 많아,
    // 강력 새로고침을 해도 브라우저가 예전 응답을 재사용하는 문제가 있었음.
    // 정적 파일 fetch에는 항상 캐시 무효화 파라미터를 붙여 항상 최신 파일을 받아오도록 함.
    function noCacheUrl(url) {
        const sep = url.includes('?') ? '&' : '?';
        return `${url}${sep}_=${Date.now()}`;
    }
    function fetchFresh(url) {
        return fetch(noCacheUrl(url), { cache: 'no-store' });
    }

    async function loadAvailableDates() {
        try {
            let dates = [];
            try {
                const res = await fetch('/api/dates');
                if (res.ok) {
                    dates = await res.json();
                } else {
                    throw new Error('API server not available');
                }
            } catch (err) {
                // GitHub Pages 등 정적 서버 fallback
                const staticRes = await fetchFresh('dates.json');
                if (staticRes.ok) {
                    dates = await staticRes.json();
                }
            }
            
            if (dates && dates.length > 0) {
                dateSelector.innerHTML = `<option value="">최신 데이터 (${dates[0].label})</option>`;
                dates.forEach((d, idx) => {
                    if (idx === 0) return; // 최신은 이미 default
                    const opt = document.createElement('option');
                    opt.value = d.date_key;
                    opt.textContent = d.label;
                    dateSelector.appendChild(opt);
                });
            }
        } catch (e) {
            console.warn('날짜 목록 로드 실패:', e);
        }
    }

    async function loadData() {
        try {
            let resJson;
            const url = selectedDate ? `/api/data?date=${selectedDate}` : '/api/data';
            try {
                const response = await fetch(url);
                if (response.ok) {
                    resJson = await response.json();
                } else {
                    throw new Error('API fetch failed');
                }
            } catch (err) {
                // 정적 배포(GitHub Pages) 환경 Fallback
                const staticFile = selectedDate ? `data_${selectedDate}.json` : 'data.json';
                let fallbackResponse = await fetchFresh(staticFile);
                if (!fallbackResponse.ok && selectedDate) {
                    fallbackResponse = await fetchFresh('data.json');
                }
                if (fallbackResponse.ok) {
                    resJson = await fallbackResponse.json();
                }
            }

            if (Array.isArray(resJson)) {
                rawProductsData = resJson;
            } else if (resJson && resJson.records) {
                rawProductsData = resJson.records;
                insightCardsData = resJson.cards || {};
            } else {
                rawProductsData = [];
            }

            // Fetch cards specifically.
            // 과거 날짜(selectedDate)를 조회 중일 때는 그 날짜 파일 안의 cards를 그대로 써야
            // 날짜별로 B2B 인사이트 카드가 실제로 바뀐다. insight_cards.json은 "오늘자" 카드만
            // 담고 있으므로, 최신 데이터를 볼 때(=selectedDate 없음) 또는 위에서 cards를 못 받아온
            // 경우에만 보조로 사용한다.
            if (!selectedDate) {
                try {
                    const cardsRes = await fetch('/api/cards');
                    if (cardsRes.ok) {
                        insightCardsData = await cardsRes.json();
                    } else if (!insightCardsData || Object.keys(insightCardsData).length === 0) {
                        const cardsFallback = await fetchFresh('insight_cards.json');
                        if (cardsFallback.ok) {
                            insightCardsData = await cardsFallback.json();
                        }
                    }
                } catch (err) {}
            }
        } catch (e) {
            console.warn('Data fetch failed, trying local data.json', e);
            try {
                const res = await fetchFresh('data.json');
                const resJson = await res.json();
                if (Array.isArray(resJson)) {
                    rawProductsData = resJson;
                } else if (resJson && resJson.records) {
                    rawProductsData = resJson.records;
                    insightCardsData = resJson.cards || {};
                }
            } catch (err) {
                console.error('Data load error:', err);
                return;
            }
        }

        // ip_trends.json은 날짜 선택과 무관하게 항상 전체 누적 시계열이므로 매번 최신으로 가져온다.
        try {
            const trendsRes = await fetchFresh('ip_trends.json');
            if (trendsRes.ok) {
                ipTrendsData = await trendsRes.json();
            }
        } catch (err) {
            console.warn('ip_trends.json fetch failed', err);
        }

        // 사이드바 날짜 표시 업데이트
        const sidebarLabel = document.getElementById('sidebar-date-label');
        if (sidebarLabel) {
            if (selectedDate) {
                sidebarLabel.textContent = `${selectedDate.slice(0,4)}-${selectedDate.slice(4,6)}-${selectedDate.slice(6,8)}`;
            } else {
                const firstDate = rawProductsData[0]?.scraped_at?.slice(0, 10) || '최신';
                sidebarLabel.textContent = firstDate;
            }
        }

        renderDashboard();
    }

    // 날짜 선택 변경 이벤트
    dateSelector.addEventListener('change', (e) => {
        selectedDate = e.target.value;
        loadData();
    });

    function getFilteredProducts() {
        if (activeCategory === 'all') {
            return rawProductsData;
        }
        return rawProductsData.filter(p => (p.category || '리빙 전체') === activeCategory);
    }

    function renderDashboard() {
        const products = getFilteredProducts();
        if (!products) return;

        const lastUpdated = rawProductsData[0]?.scraped_at || new Date().toLocaleString('ko-KR');
        document.getElementById('last-updated').textContent = `최근 수집 시각: ${lastUpdated}`;
        
        const summary = DashboardMetrics.summarize(products);
        const categoryCount = new Set(rawProductsData.map(p => p.category || '리빙 전체')).size;
        const catLabelText = activeCategory === 'all' ? `전체 ${categoryCount}개 카테고리 (${products.length}건)` : activeCategory;
        document.getElementById('ov-cards-label').textContent = catLabelText;
        document.getElementById('table-view-title').textContent = catLabelText;
        document.querySelectorAll('.cat-tab').forEach(button => {
            const cat = button.getAttribute('data-cat');
            const rows = cat === 'all' ? rawProductsData : rawProductsData.filter(p => (p.category || '리빙 전체') === cat);
            button.textContent = `${cat === 'all' ? '전체 통합' : cat.replace(' (IP핵심)', '')} (${rows.length}건)`;
            button.classList.toggle('active', cat === activeCategory);
        });
        document.getElementById('scope-note').textContent =
            `${catLabelText} · 랭킹 노출 ${summary.total}건 / 식별된 고유 상품 ${summary.uniqueCount}개` +
            (summary.unidentifiedCount ? ` / 상품 ID 미확인 ${summary.unidentifiedCount}건` : '') +
            ' · 동일 상품의 카테고리별 노출을 각각 집계합니다. IP 비중은 개별 IP명이 분류된 기록 기준이며, 미분류는 제외합니다. 매출·시장 점유율이 아닙니다.';

        const brandCounts = {};
        products.forEach(p => {
            if (p.brand) brandCounts[p.brand] = (brandCounts[p.brand] || 0) + 1;
        });
        const sortedIps = Object.entries(summary.ipCounts).sort((a, b) => b[1] - a[1]);
        document.getElementById('ov-ip-share').textContent = `${summary.share} %`;
        document.getElementById('ov-ip-sub').textContent = `${summary.total}건 중 IP 분류 ${summary.ipCount}건 · 미분류 ${summary.pendingCount}건`;
        document.getElementById('ov-top-ip').textContent = sortedIps[0]?.[0] || '분류된 IP 없음';
        document.getElementById('ov-top-ip-sub').textContent = sortedIps.length ? `${sortedIps[0][1]}건 노출 · 미분류 제외` : 'IP 분류 검토 필요';
        document.getElementById('ov-avg-price').textContent = summary.avgIpPrice === null ? '가격 정보 없음' : `${summary.avgIpPrice.toLocaleString()} 원`;
        document.getElementById('ov-total-count').textContent = `${summary.total} 건`;
        document.getElementById('ov-total-sub').textContent = `식별된 고유 상품 ${summary.uniqueCount}개`;

        // Render Page 1 Components
        try { renderIpChart(sortedIps.slice(0, 8)); } catch (e) { console.warn('ipChart err:', e); }
        try {
            const sortedBrands = Object.entries(brandCounts).sort((a, b) => b[1] - a[1]);
            renderBrandChart(sortedBrands.slice(0, 6));
        } catch (e) { console.warn('brandChart err:', e); }
        try { renderTopCards(products.slice(0, 6)); } catch (e) { console.warn('topCards err:', e); }

        // Render B2B Insights Cards Component
        try { renderB2BCards(); } catch (e) { console.error('B2B Cards rendering error:', e); }

        // Render Page 2 Components (IP Strategy Hub)
        try { renderIpStrategyPage(products, sortedIps); } catch (e) { console.warn('ipStrategy err:', e); }
        try { renderTrendChart(); } catch (e) { console.warn('trendChart err:', e); }

        // Render Page 3 Table Components
        try { renderTable(products); } catch (e) { console.warn('table err:', e); }
    }

    function calculateClientCards(products, categoryName) {
        if (!products || products.length === 0) return {};

        const totalCnt = products.length;
        const ipShare = `${DashboardMetrics.summarize(products).share}%`;

        let pkgCount = 0, engCount = 0, excCount = 0, totalPrice = 0;
        const brandCounts = {};
        const tierCounts = {
            '1만원 미만': { count: 0, totalPrice: 0, brands: {} },
            '1만원대': { count: 0, totalPrice: 0, brands: {} },
            '2만원대': { count: 0, totalPrice: 0, brands: {} },
            '3만원대': { count: 0, totalPrice: 0, brands: {} },
            '4만원대': { count: 0, totalPrice: 0, brands: {} },
            '5만원 이상': { count: 0, totalPrice: 0, brands: {} }
        };

        const top30Tokens = [];
        const top31_100Tokens = [];
        const risingStars = [];

        products.forEach(p => {
            if (p.has_packaging) pkgCount++;
            if (p.has_engraving) engCount++;
            if (p.is_exclusive) excCount++;

            const priceNum = p.price_num || parseInt((p.price || '').replace(/[^0-9]/g, ''), 10) || 0;
            totalPrice += priceNum;

            if (p.brand) brandCounts[p.brand] = (brandCounts[p.brand] || 0) + 1;

            let tier = p.price_tier;
            if (!tier) {
                if (priceNum < 10000) tier = '1만원 미만';
                else if (priceNum < 20000) tier = '1만원대';
                else if (priceNum < 30000) tier = '2만원대';
                else if (priceNum < 40000) tier = '3만원대';
                else if (priceNum < 50000) tier = '4만원대';
                else tier = '5만원 이상';
            }

            if (tierCounts[tier]) {
                tierCounts[tier].count++;
                tierCounts[tier].totalPrice += priceNum;
                if (p.brand) tierCounts[tier].brands[p.brand] = (tierCounts[tier].brands[p.brand] || 0) + 1;
            }

            // Keyword tokenization - 필수 추천 상품명 키워드 (품목 명사, 브랜드 세부 모델명 제외)
            const noiseNouns = [
                '텀블러', '머그', '머그컵', '바디필로우', '쿠션', '인형', '베개', '수건', '타올', '타월',
                '그릇', '접시', '앞접시', '디퓨저', '오일', '사쉐', '괄사', '키링', '파우치', '필통',
                '손목패드', '마우스패드', '볼', '스푼', '시리얼볼', '룸슈즈', '발매트', '방석', '소품',
                '방향제', '차량용', '스피커', '조명', '액자', '거울', '컵', '식기', '수저', '냄비',
                '2p', '3p', '4p', '5p', '1p', 'set', 'h2', '887ml', '591ml', '360ml', '450ml', '400ml',
                '퀜처', '플로우스테이트', '루프', '플립', '스트로', '트래블', '고블렛', '세트', '옵션', '상품', '제품', '선물세트'
            ];
            const tokens = (p.product_name || '').replace(/\[.*?\]|\(.*?\)|[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(t => t.length >= 2 && !['선물', '추천', '선택', '1', '2', '3', '종', '택'].includes(t) && !noiseNouns.includes(t.toLowerCase()));
            top30Tokens.push(...tokens);

            if (p.is_new_entry || (p.rank_delta && p.rank_delta >= 10)) {
                risingStars.push({
                    rank: p.rank,
                    url: p.url,
                    brand: p.brand || '-',
                    product_name: p.product_name,
                    price: p.price,
                    rank_delta: p.is_new_entry ? 'NEW' : p.rank_delta,
                    is_new_entry: !!p.is_new_entry,
                    character_ip: p.character_ip || '일반/비IP 상품'
                });
            }
        });

        // Price Tier Matrix
        const tierMatrix = {};
        Object.entries(tierCounts).forEach(([t, data]) => {
            const topB = Object.entries(data.brands).sort((a, b) => b[1] - a[1]).slice(0, 3).map(b => b[0]);
            tierMatrix[t] = {
                count: data.count,
                share: roundToOneDecimal((data.count / totalCnt) * 100),
                avg_price: data.count > 0 ? Math.round(data.totalPrice / data.count) : 0,
                top_brands: topB
            };
        });

        const getMostCommon = (arr, num) => {
            const counts = {};
            arr.forEach(x => counts[x] = (counts[x] || 0) + 1);
            return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, num).map(x => x[0]);
        };

        const sortedBrands = Object.entries(brandCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([b, c]) => ({ brand: b, count: c, share: `${roundToOneDecimal((c / totalCnt) * 100)}%` }));
        const essentialKw = getMostCommon(top30Tokens, 10);

        return {
            category: categoryName,
            analyzed_count: totalCnt,
            card_1_sov: {
                total_count: totalCnt,
                top_ip_share: ipShare,
                brand_ranks: sortedBrands
            },
            card_2_price_and_usp: {
                avg_price: Math.round(totalPrice / totalCnt),
                packaging_ratio: roundToOneDecimal((pkgCount / totalCnt) * 100),
                engraving_ratio: roundToOneDecimal((engCount / totalCnt) * 100),
                exclusive_ratio: roundToOneDecimal((excCount / totalCnt) * 100),
                price_tier_matrix: tierMatrix
            },
            card_3_recommended_keywords: {
                essential_title_keywords: essentialKw,
                stable_keywords_top30: essentialKw.slice(0, 5),
                rising_keywords_top31_100: essentialKw.slice(5, 10),
                top_options: ['선물포장', '각인', '단독구성'],
                by_type: {
                    attributes: ['단독', '선물포장', '각인', '쇼핑백', '전용패키지'],
                    target_season: ['생일', '집들이', '응원', '답례품', '기념일'],
                    concept: ['귀여운', '감성', '신박한', '쓸데없는', '인테리어']
                }
            },
            card_4_rising_stars: risingStars
        };
    }

    function renderB2BCards() {
        const container = document.getElementById('b2b-cards-container');
        if (!container) return;

        const targetCat = (activeCategory === 'all') ? '전체' : activeCategory;
        let cardData = insightCardsData[targetCat];

        if (!cardData || !cardData.card_1_sov) {
            const filteredProds = getFilteredProducts();
            if (filteredProds && filteredProds.length > 0) {
                cardData = calculateClientCards(filteredProds, targetCat);
            }
        }

        if (!cardData || !cardData.card_1_sov) {
            container.innerHTML = `<div class="card" style="padding:20px; text-align:center; color:#94A3B8;">인사이트 카드 데이터를 불러오는 중...</div>`;
            return;
        }

        const summary = DashboardMetrics.summarize(getFilteredProducts());
        const sov = { top_ip_share: `${summary.share}%` };
        const priceUsp = cardData.card_2_price_and_usp || {};
        const kw = cardData.card_3_recommended_keywords || {};
        const rising = cardData.card_4_rising_stars || [];

        const tierMatrix = priceUsp.price_tier_matrix || {};
        const kwTypes = kw.by_type || {};

        container.innerHTML = `
            <div class="metrics-grid" style="grid-template-columns: repeat(4, 1fr); margin-bottom: 20px;">
                <div class="card metric-card">
                    <div class="card-icon icon-yellow"><i class="fa-solid fa-face-smile"></i></div>
                    <div class="metric-info">
                        <span class="metric-label">개별 IP 분류 상품 비중</span>
                        <h3 class="metric-value">${sov.top_ip_share || '0%'}</h3>
                        <span class="metric-sub">${summary.total}건 중 IP 분류 ${summary.ipCount}건 · 미분류 ${summary.pendingCount}건</span>
                    </div>
                </div>
                <div class="card metric-card">
                    <div class="card-icon icon-rose"><i class="fa-solid fa-gift"></i></div>
                    <div class="metric-info">
                        <span class="metric-label">선물 포장 비중</span>
                        <h3 class="metric-value">${priceUsp.packaging_ratio || 0}%</h3>
                        <span class="metric-sub">선물포장/쇼핑백/파우치 등</span>
                    </div>
                </div>
                <div class="card metric-card">
                    <div class="card-icon icon-cyan"><i class="fa-solid fa-pen-nib"></i></div>
                    <div class="metric-info">
                        <span class="metric-label">각인/메시지 옵션 비중</span>
                        <h3 class="metric-value">${priceUsp.engraving_ratio || 0}%</h3>
                        <span class="metric-sub">각인/메시지카드 포함</span>
                    </div>
                </div>
                <div class="card metric-card">
                    <div class="card-icon icon-indigo"><i class="fa-solid fa-star"></i></div>
                    <div class="metric-info">
                        <span class="metric-label">단독/기획 구성 비중</span>
                        <h3 class="metric-value">${priceUsp.exclusive_ratio || 0}%</h3>
                        <span class="metric-sub">단독/1+1/세트/기획</span>
                    </div>
                </div>
            </div>

            <div class="charts-grid" style="margin-bottom: 20px;">
                <!-- Price Tier White Space Matrix Card -->
                <div class="card">
                    <div class="card-title">
                        <h3><i class="fa-solid fa-chart-simple highlight-yellow"></i> 가격대별 랭킹 노출 분포</h3>
                        <span>평균 가격: ${(priceUsp.avg_price || 0).toLocaleString()}원</span>
                    </div>
                    <div class="table-container" style="margin-top: 15px;">
                        <table class="custom-table">
                            <thead>
                                <tr>
                                    <th>가격대 구간</th>
                                    <th>상품 수</th>
                                    <th>점유율(%)</th>
                                    <th>평균 가격</th>
                                    <th>TOP 3 브랜드</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${Object.entries(tierMatrix).map(([tier, info]) => `
                                    <tr>
                                        <td><strong style="color:#FEE500;">${tier}</strong></td>
                                        <td>${info.count}개</td>
                                        <td><span style="color:#6366F1; font-weight:700;">${info.share}%</span></td>
                                        <td>${(info.avg_price || 0).toLocaleString()}원</td>
                                        <td>${(info.top_brands || []).join(', ') || '-'}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Recommended Keywords Card -->
                <div class="card">
                    <div class="card-title">
                        <h3><i class="fa-solid fa-key highlight-rose"></i> 상위 상품의 IP·키워드 참고</h3>
                        <span>빈도 참고용 · 상품과 관련된 표현만 사용</span>
                    </div>
                    <div style="margin-top: 15px; display: flex; flex-direction: column; gap: 12px;">
                        <div style="background: rgba(255,255,255,0.03); padding: 14px; border-radius: 10px; border-left: 4px solid #FEE500;">
                            <div style="font-weight: 700; color: #FEE500; font-size: 14px; margin-bottom: 8px;">상위 상품의 IP·표현</div>
                            <div style="font-size: 13px; color: #E2E8F0; display: flex; flex-wrap: wrap; gap: 6px;">
                                ${(kw.essential_title_keywords || kw.stable_keywords_top30 || []).map(k => `<span class="badge-brand" style="font-size:13px; padding: 4px 10px;">#${k}</span>`).join(' ')}
                            </div>
                        </div>
                        <div style="background: rgba(255,255,255,0.03); padding: 12px; border-radius: 8px;">
                            <div style="font-weight: 700; color: #A5B4FC; font-size: 12px; margin-bottom: 6px;">상품명 작성 참고 예시 (빈도 순위 아님)</div>
                            <div style="font-size: 12px; color: #94A3B8; line-height: 1.8;">
                                <div><strong>[속성/혜택]</strong>: ${(kwTypes.attributes || []).join(', ')}</div>
                                <div><strong>[타깃/시즌]</strong>: ${(kwTypes.target_season || []).join(', ')}</div>
                                <div><strong>[콘셉트/스타일]</strong>: ${(kwTypes.concept || []).join(', ')}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Card 4: Rising Stars Alert -->
            <div class="card">
                <div class="card-title">
                    <h3><i class="fa-solid fa-bolt highlight-cyan"></i> Card 4: 급상승 라이징 스타 (Rising Star Alert)</h3>
                    <span>직전 수집일 대비 10계단 이상 상승 또는 이전 수집 범위 내 신규 진입 상품 · 상품명 클릭 시 카카오 선물하기 이동</span>
                </div>
                <div class="table-container" style="margin-top: 15px;">
                    <table class="custom-table">
                        <thead>
                            <tr>
                                <th style="width: 70px;">순위</th>
                                <th style="width: 100px;">변동폭</th>
                                <th style="width: 130px;">캐릭터 IP</th>
                                <th style="width: 120px;">브랜드</th>
                                <th>상품명</th>
                                <th style="width: 110px;">가격</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rising.length > 0 ? rising.map(r => `
                                <tr>
                                    <td class="badge-rank">${r.rank}위</td>
                                    <td>
                                        ${r.is_new_entry ? `<span style="background:#EF4444; color:#FFF; font-size:10px; padding:2px 6px; border-radius:4px; font-weight:700;">NEW</span>` : `<span style="color:#10B981; font-weight:700;"><i class="fa-solid fa-caret-up"></i> +${r.rank_delta}</span>`}
                                    </td>
                                    <td><span style="background:rgba(254,229,0,0.1); color:#FEE500; padding:2px 6px; border-radius:4px; font-size:11px;">${r.character_ip || '일반/비IP'}</span></td>
                                    <td><span class="badge-brand">${r.brand}</span></td>
                                    <td style="font-weight:500;">
                                        ${r.url ? `<a href="${r.url}" target="_blank" rel="noopener noreferrer" style="color:#A5B4FC; text-decoration:none; font-weight:600; transition:color 0.2s;" onmouseover="this.style.color='#818CF8'" onmouseout="this.style.color='#A5B4FC'">${r.product_name} <i class="fa-solid fa-arrow-up-right-from-square" style="font-size:10px; opacity:0.7;"></i></a>` : `<span style="color:#F8FAFC;">${r.product_name}</span>`}
                                    </td>
                                    <td style="color:#FEE500; font-weight:600;">${r.price}</td>
                                </tr>
                            `).join('') : `<tr><td colspan="6" style="text-align:center; padding:15px; color:#94A3B8;">감지된 라이징 아이템이 없습니다.</td></tr>`}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    function roundToOneDecimal(num) {
        return Math.round(num * 10) / 10;
    }

    function renderIpStrategyPage(allProducts, sortedIps) {
        const strategyBox = document.getElementById('ip-strategy-box');
        
        // Category IP Share Calculation
        const catShareList = [];
        const categories = ["리빙 전체", "팬시/문구/취미 (IP핵심)", "침구/패브릭", "주방/식기"];
        
        categories.forEach(c => {
            const catProds = rawProductsData.filter(p => (p.category || '리빙 전체') === c);
            const summary = DashboardMetrics.summarize(catProds);
            catShareList.push({ category: c, total: summary.total, ipCount: summary.ipCount, pending: summary.pendingCount, ratio: summary.share });
        });

        strategyBox.innerHTML = `
            <div class="insight-item">
                <h4><i class="fa-solid fa-fire"></i> 카테고리별 개별 IP 분류 비중</h4>
                <ul>
                    ${catShareList.map(c => `<li><strong>[${c.category}]</strong>: IP 분류 비중 <strong>${c.ratio}%</strong> (${c.total}건 중 ${c.ipCount}건 · 미분류 ${c.pending}건)</li>`).join('')}
                </ul>
            </div>
            <div class="insight-item">
                <h4><i class="fa-solid fa-bullseye"></i> 분류와 비교 기준</h4>
                <ul>
                    <li>기타 캐릭터/팬시 등 미분류 그룹은 개별 IP 순위에서 제외합니다. 자동 분류 결과는 상품 단위 검토가 필요합니다.</li>
                    <li>콜라보 상품은 각 IP에 1건씩 집계하므로 IP별 비중의 합계는 전체 IP 상품 비중과 다를 수 있습니다.</li>
                </ul>
            </div>
            <div class="insight-item">
                <h4><i class="fa-solid fa-lightbulb"></i> 기획 검토 시 확인할 항목</h4>
                <ul>
                    <li>가격은 수집 당시 표시가격입니다. 실제 결제가격이나 소비자 수용 적정가를 의미하지 않습니다.</li>
                    <li>순위 변화와 함께 상품 구성·패키지·프로모션을 확인하세요. 랭킹만으로 출시 성과를 예측할 수 없습니다.</li>
                </ul>
            </div>
        `;

        // IP Summary Table
        const tbody = document.getElementById('ip-summary-tbody');
        tbody.innerHTML = '';

        sortedIps.forEach(([ipName, count]) => {
            const ipProds = allProducts.filter(p => DashboardMetrics.ipNames(p).includes(ipName));
            const bestProduct = ipProds.sort((a, b) => a.rank - b.rank)[0];
            const ratioPct = roundToOneDecimal((count / allProducts.length) * 100);

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong style="color:#FEE500; font-size:14px;">${ipName}</strong></td>
                <td><span class="badge-brand">${count}개</span></td>
                <td><span style="color:#6366F1; font-weight:700;">${ratioPct}%</span></td>
                <td class="badge-rank">${bestProduct ? bestProduct.rank + '위' : '-'}</td>
                <td>${bestProduct ? `[${bestProduct.category}] <strong>[${bestProduct.brand}]</strong> ${bestProduct.product_name} (${bestProduct.price})` : '-'}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    function renderIpChart(ipData) {
        const ctx = document.getElementById('ipChart').getContext('2d');
        if (ipChartInstance) ipChartInstance.destroy();

        if (!ipData || ipData.length === 0) {
            ipData = [['IP 없음', 0]];
        }

        const labels = ipData.map(b => b[0]);
        const counts = ipData.map(b => b[1]);

        ipChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: '노출 상품 수',
                    data: counts,
                    backgroundColor: 'rgba(254, 229, 0, 0.8)',
                    borderColor: '#FEE500',
                    borderWidth: 1,
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { ticks: { color: '#94A3B8' }, grid: { display: false } },
                    y: { ticks: { color: '#94A3B8', stepSize: 1 }, grid: { color: 'rgba(255, 255, 255, 0.05)' } }
                }
            }
        });
    }


    // ── IP 추이(시계열) 차트 ──────────────────────────────────────────────
    const TREND_COLORS = ['#FEE500', '#60A5FA', '#F472B6', '#34D399', '#FB923C', '#A78BFA', '#F87171', '#38BDF8'];

    function formatTrendDate(d) {
        if (!d || d.length !== 8) return d;
        return `${d.slice(4, 6)}/${d.slice(6, 8)}`;
    }

    function getTrendTargetCategory() {
        return (activeCategory === 'all') ? '전체' : activeCategory;
    }

    function renderTrendIpChecklist(entities) {
        const box = document.getElementById('trend-ip-checklist');
        if (!box) return;

        const names = Object.keys(entities).filter(k => k !== '__미분류__');
        names.sort((a, b) => {
            const sumA = entities[a].reduce((s, p) => s + (p.count || 0), 0);
            const sumB = entities[b].reduce((s, p) => s + (p.count || 0), 0);
            return sumB - sumA;
        });

        if (trendSelectedIps === null) {
            trendSelectedIps = new Set(names.slice(0, 5));
        }

        box.innerHTML = '';
        names.forEach(name => {
            const label = document.createElement('label');
            label.style.cssText = 'display:flex; align-items:center; gap:4px; cursor:pointer; padding:4px 8px; border-radius:6px; background:rgba(255,255,255,0.04);';
            label.innerHTML = `<input type="checkbox" ${trendSelectedIps.has(name) ? 'checked' : ''} style="cursor:pointer;"> ${name}`;
            label.querySelector('input').addEventListener('change', (e) => {
                if (e.target.checked) trendSelectedIps.add(name);
                else trendSelectedIps.delete(name);
                renderTrendChart();
            });
            box.appendChild(label);
        });

        if (entities['__미분류__']) {
            const label = document.createElement('label');
            label.style.cssText = 'display:flex; align-items:center; gap:4px; cursor:pointer; padding:4px 8px; border-radius:6px; background:rgba(255,255,255,0.08); opacity:0.85;';
            label.innerHTML = `<input type="checkbox" ${trendSelectedIps.has('__미분류__') ? 'checked' : ''} style="cursor:pointer;"> 미분류 (참고선)`;
            label.querySelector('input').addEventListener('change', (e) => {
                if (e.target.checked) trendSelectedIps.add('__미분류__');
                else trendSelectedIps.delete('__미분류__');
                renderTrendChart();
            });
            box.appendChild(label);
        }
    }

    function renderTrendChart() {
        const canvas = document.getElementById('trendChart');
        if (!canvas || typeof Chart === 'undefined') return;

        const targetCat = getTrendTargetCategory();
        const entities = (ipTrendsData && ipTrendsData[targetCat]) ? ipTrendsData[targetCat] : {};

        const metricSelector = document.getElementById('trend-metric-selector');
        if (metricSelector) trendMetric = metricSelector.value || 'share';

        renderTrendIpChecklist(entities);

        const dateSet = new Set();
        Object.values(entities).forEach(series => series.forEach(p => dateSet.add(p.date)));
        const dates = Array.from(dateSet).sort();

        const metricLabel = { share: '점유율 (%)', avg_price: '평균가 (원)', count: '노출 개수' }[trendMetric] || trendMetric;

        const datasets = [];
        let colorIdx = 0;
        Array.from(trendSelectedIps || []).forEach(name => {
            const series = entities[name];
            if (!series) return;
            const byDate = {};
            series.forEach(p => { byDate[p.date] = p[trendMetric]; });
            const isMisc = name === '__미분류__';
            datasets.push({
                label: isMisc ? '미분류(참고)' : name,
                data: dates.map(d => (byDate[d] !== undefined ? byDate[d] : null)),
                spanGaps: true,
                borderColor: isMisc ? 'rgba(148, 163, 184, 0.7)' : TREND_COLORS[colorIdx % TREND_COLORS.length],
                backgroundColor: 'transparent',
                borderDash: isMisc ? [6, 4] : [],
                borderWidth: isMisc ? 2 : 2.5,
                tension: 0.3,
                pointRadius: 2
            });
            if (!isMisc) colorIdx++;
        });

        if (trendChartInstance) trendChartInstance.destroy();
        trendChartInstance = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: { labels: dates.map(formatTrendDate), datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { labels: { color: '#CBD5E1' } },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y}${trendMetric === 'share' ? '%' : trendMetric === 'avg_price' ? '원' : '개'}`
                        }
                    }
                },
                scales: {
                    x: { ticks: { color: '#94A3B8' }, grid: { display: false } },
                    y: {
                        ticks: { color: '#94A3B8' },
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        title: { display: true, text: metricLabel, color: '#94A3B8' }
                    }
                }
            }
        });
    }

    document.getElementById('trend-metric-selector') && document.getElementById('trend-metric-selector').addEventListener('change', renderTrendChart);

    function renderBrandChart(brandData) {
        const ctx = document.getElementById('brandChart').getContext('2d');
        if (brandChartInstance) brandChartInstance.destroy();

        if (!brandData || brandData.length === 0) {
            brandData = [['데이터 없음', 0]];
        }

        brandChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: brandData.map(b => b[0]),
                datasets: [{
                    data: brandData.map(b => b[1]),
                    backgroundColor: ['#6366F1', '#FEE500', '#06B6D4', '#F43F5E', '#10B981', '#8B5CF6'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'right', labels: { color: '#94A3B8', font: { size: 11 } } }
                },
                cutout: '65%'
            }
        });
    }

    function renderTopCards(topProducts) {
        const container = document.getElementById('top-cards-container');
        container.innerHTML = '';

        if (!topProducts || topProducts.length === 0) {
            container.innerHTML = '<div style="color: #94A3B8; padding: 20px;">수집된 상품이 없습니다.</div>';
            return;
        }

        topProducts.forEach((p, idx) => {
            const rankClass = idx === 0 ? 'rank-1' : (idx === 1 ? 'rank-2' : (idx === 2 ? 'rank-3' : ''));
            const brandStr = p.brand ? p.brand : 'Kakao Gift';
            const catStr = p.category ? p.category : '리빙';
            const ipTagHtml = p.character_ip && p.character_ip !== '일반/비IP 상품' 
                ? `<span style="background: rgba(254, 229, 0, 0.2); color: #FEE500; font-size: 10px; padding: 2px 6px; border-radius: 4px; margin-left: 4px;">${p.character_ip}</span>` 
                : '';
            
            const cardHtml = `
                <div class="rank-card">
                    <div class="rank-badge ${rankClass}">${p.rank}</div>
                    <div class="rank-details">
                        <div class="rank-brand"><span class="badge-cat" style="font-size:10px; margin-right:4px;">${catStr}</span> ${brandStr} ${ipTagHtml}</div>
                        <div class="rank-title" title="${p.product_name}">${p.product_name}</div>
                        <div class="rank-price">${p.price}</div>
                    </div>
                    ${p.url ? `<a href="${p.url}" target="_blank" class="rank-link" title="상품 보기"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>` : ''}
                </div>
            `;
            container.insertAdjacentHTML('beforeend', cardHtml);
        });
    }

    function renderTable(products) {
        const tbody = document.getElementById('ranking-table-body');
        tbody.innerHTML = '';

        if (!products || products.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 20px; color:#94A3B8;">검색 결과가 없습니다.</td></tr>';
            return;
        }

        products.forEach(p => {
            const catStr = p.category ? p.category : '리빙 전체';
            const brandStr = p.brand ? p.brand : '-';
            const ipStr = p.character_ip ? p.character_ip : '일반/비IP 상품';
            const isIpProduct = ipStr !== '일반/비IP 상품';

            // USP & Rank Delta Badges
            let uspBadges = '';
            if (p.is_exclusive) uspBadges += `<span style="background:rgba(99,102,241,0.2); color:#A5B4FC; border:1px solid rgba(99,102,241,0.4); padding:1px 5px; border-radius:3px; font-size:10px; margin-right:3px;">단독</span>`;
            if (p.has_packaging) uspBadges += `<span style="background:rgba(236,72,153,0.2); color:#F472B6; border:1px solid rgba(236,72,153,0.4); padding:1px 5px; border-radius:3px; font-size:10px; margin-right:3px;">포장</span>`;
            if (p.has_engraving) uspBadges += `<span style="background:rgba(16,185,129,0.2); color:#34D399; border:1px solid rgba(16,185,129,0.4); padding:1px 5px; border-radius:3px; font-size:10px; margin-right:3px;">각인</span>`;

            let deltaBadge = '';
            if (p.rank_comparison_status === 'unavailable') {
                deltaBadge = `<span style="color:#94A3B8;font-size:10px;margin-left:4px;" title="이전 수집 범위 또는 상품 식별 정보가 부족합니다.">비교 불가</span>`;
            } else if (p.is_new_entry) {
                deltaBadge = `<span style="background:#EF4444; color:#FFF; font-size:9px; padding:1px 4px; border-radius:3px; margin-left:4px; font-weight:700;">NEW</span>`;
            } else if (p.rank_delta && p.rank_delta > 0) {
                deltaBadge = `<span style="color:#10B981; font-size:10px; font-weight:700; margin-left:4px;"><i class="fa-solid fa-caret-up"></i> ${p.rank_delta}</span>`;
            } else if (p.rank_delta && p.rank_delta < 0) {
                deltaBadge = `<span style="color:#EF4444; font-size:10px; font-weight:700; margin-left:4px;"><i class="fa-solid fa-caret-down"></i> ${Math.abs(p.rank_delta)}</span>`;
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><span class="badge-cat">${catStr}</span></td>
                <td class="badge-rank">${p.rank}위 ${deltaBadge}</td>
                <td>
                    <span style="${isIpProduct ? 'background: rgba(254, 229, 0, 0.15); color: #FEE500; border: 1px solid rgba(254, 229, 0, 0.3);' : 'background: rgba(255, 255, 255, 0.05); color: #94A3B8;'} padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">
                        ${ipStr}
                    </span>
                </td>
                <td><span class="badge-brand">${brandStr}</span></td>
                <td style="font-weight: 500; color: #F8FAFC;">
                    ${uspBadges} ${p.product_name}
                </td>
                <td style="font-weight: 600; color: #FEE500;">
                    ${p.price} <div style="font-size:10px; color:#94A3B8; font-weight:normal;">${p.price_tier || ''}</div>
                </td>
                <td>${p.url ? `<a href="${p.url}" target="_blank" class="product-link-btn">이동 <i class="fa-solid fa-chevron-right" style="font-size:10px;"></i></a>` : '-'}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    // Search Filter
    searchBox.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        const baseProducts = getFilteredProducts();
        const filtered = baseProducts.filter(p => 
            p.product_name.toLowerCase().includes(query) || 
            (p.brand && p.brand.toLowerCase().includes(query)) ||
            (p.character_ip && p.character_ip.toLowerCase().includes(query)) ||
            (p.category && p.category.toLowerCase().includes(query))
        );
        renderTable(filtered);
    });

    refreshBtn.addEventListener('click', () => {
        loadData();
    });

    loadAvailableDates().then(() => loadData());
});
