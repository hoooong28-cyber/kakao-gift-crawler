document.addEventListener('DOMContentLoaded', () => {
    let rawProductsData = [];
    let insightCardsData = {};
    let activeCategory = 'all';
    let activePage = 'page-overview';
    let selectedDate = ''; // '' = 최신 날짜

    let ipChartInstance = null;
    let brandChartInstance = null;

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
                const staticRes = await fetch('dates.json');
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
                let fallbackResponse = await fetch(staticFile);
                if (!fallbackResponse.ok && selectedDate) {
                    fallbackResponse = await fetch('data.json');
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

            // Fetch cards specifically
            try {
                const cardsRes = await fetch('/api/cards');
                if (cardsRes.ok) {
                    insightCardsData = await cardsRes.json();
                } else {
                    const cardsFallback = await fetch('insight_cards.json');
                    if (cardsFallback.ok) {
                        insightCardsData = await cardsFallback.json();
                    }
                }
            } catch (err) {}
        } catch (e) {
            console.warn('Data fetch failed, trying local data.json', e);
            try {
                const res = await fetch('data.json');
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
        
        const catLabelText = activeCategory === 'all' ? '전체 4개 카테고리 (200개)' : activeCategory;
        if (document.getElementById('ov-cards-label')) document.getElementById('ov-cards-label').textContent = catLabelText;
        if (document.getElementById('table-view-title')) document.getElementById('table-view-title').textContent = catLabelText;

        // Aggregations
        const ipCounts = {};
        const brandCounts = {};
        let ipProductCount = 0;
        let totalIpPrice = 0;

        const nonPureTags = ['일반/비IP 상품', '기타 캐릭터/팬시', '캐릭터/팬시-침구', '캐릭터/팬시-팬시굿즈', '캐릭터/팬시-주방'];

        products.forEach(p => {
            const ip = p.character_ip || '일반/비IP 상품';
            if (ip !== '일반/비IP 상품') {
                const ipList = ip.split(', ');
                const isGenericFancy = ipList.every(item => nonPureTags.includes(item));
                
                if (!isGenericFancy) {
                    ipProductCount++;
                    const rawPrice = parseInt((p.price || '').replace(/[^0-9]/g, ''), 10);
                    if (rawPrice) totalIpPrice += rawPrice;

                    ipList.forEach(item => {
                        if (!nonPureTags.includes(item)) {
                            ipCounts[item] = (ipCounts[item] || 0) + 1;
                        }
                    });
                }
            }

            if (p.brand) {
                brandCounts[p.brand] = (brandCounts[p.brand] || 0) + 1;
            }
        });

        // Overview Metrics
        const ipSharePct = products.length > 0 ? roundToOneDecimal((ipProductCount / products.length) * 100) : 0;
        document.getElementById('ov-ip-share').textContent = `${ipSharePct} %`;
        document.getElementById('ov-ip-sub').textContent = `${products.length}개 항목 중 ${ipProductCount}개 명확한 IP 상품`;

        const sortedIps = Object.entries(ipCounts).sort((a, b) => b[1] - a[1]);
        if (sortedIps.length > 0) {
            document.getElementById('ov-top-ip').textContent = sortedIps[0][0];
            document.getElementById('ov-top-ip-sub').textContent = `선택 영역 내 ${sortedIps[0][1]}개 노출 중`;
        } else {
            document.getElementById('ov-top-ip').textContent = 'IP 없음';
            document.getElementById('ov-top-ip-sub').textContent = '일반 상품 위주';
        }

        const avgIpPrice = ipProductCount > 0 ? Math.round(totalIpPrice / ipProductCount) : 0;
        document.getElementById('ov-avg-price').textContent = `${avgIpPrice.toLocaleString()} 원`;
        document.getElementById('ov-total-count').textContent = `${products.length} 개`;

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
        try { renderIpStrategyPage(rawProductsData, sortedIps); } catch (e) { console.warn('ipStrategy err:', e); }

        // Render Page 3 Table Components
        try { renderTable(products); } catch (e) { console.warn('table err:', e); }
    }

    function calculateClientCards(products, categoryName) {
        if (!products || products.length === 0) return {};

        const totalCnt = products.length;
        const nonPureTags = ['일반/비IP 상품', '기타 캐릭터/팬시', '캐릭터/팬시-침구', '캐릭터/팬시-팬시굿즈', '캐릭터/팬시-주방'];
        const ipProds = products.filter(p => p.character_ip && !nonPureTags.includes(p.character_ip));
        const ipShare = `${roundToOneDecimal((ipProds.length / totalCnt) * 100)}%`;

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
            const tokens = (p.product_name || '').replace(/\[.*?\]|\(.*?\)|[^\w\s]/g, ' ').split(/\s+/).filter(t => t.length >= 2 && !['선물', '추천', '선택', '1', '2', '3', '종', '택'].includes(t) && !noiseNouns.includes(t.toLowerCase()));
            top30Tokens.push(...tokens);

            if (p.is_new_entry || (p.rank_delta && p.rank_delta >= 10)) {
                risingStars.push({
                    rank: p.rank,
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

        const targetCat = (activeCategory === 'all') ? '리빙 전체' : activeCategory;
        let cardData = insightCardsData[targetCat] || insightCardsData['리빙 전체'];

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

        const sov = cardData.card_1_sov || {};
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
                        <span class="metric-label">Card 1: IP 점유율 (SOV)</span>
                        <h3 class="metric-value">${sov.top_ip_share || '0%'}</h3>
                        <span class="metric-sub">분석 대상: ${cardData.analyzed_count || 0}개 상품</span>
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
                        <h3><i class="fa-solid fa-chart-simple highlight-yellow"></i> Card 2: 가격대별 Market White Space 매트릭스</h3>
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
                        <h3><i class="fa-solid fa-key highlight-rose"></i> Card 3: 노출 추천 상품명 키워드</h3>
                        <span>카테고리 전체 통합 필수 포함 추천 키워드</span>
                    </div>
                    <div style="margin-top: 15px; display: flex; flex-direction: column; gap: 12px;">
                        <div style="background: rgba(255,255,255,0.03); padding: 14px; border-radius: 10px; border-left: 4px solid #FEE500;">
                            <div style="font-weight: 700; color: #FEE500; font-size: 14px; margin-bottom: 8px;">🔑 카테고리 필수 추천 상품명 키워드 (Top 10)</div>
                            <div style="font-size: 13px; color: #E2E8F0; display: flex; flex-wrap: wrap; gap: 6px;">
                                ${(kw.essential_title_keywords || kw.stable_keywords_top30 || []).map(k => `<span class="badge-brand" style="font-size:13px; padding: 4px 10px;">#${k}</span>`).join(' ')}
                            </div>
                        </div>
                        <div style="background: rgba(255,255,255,0.03); padding: 12px; border-radius: 8px;">
                            <div style="font-weight: 700; color: #A5B4FC; font-size: 12px; margin-bottom: 6px;">🎯 키워드 성격별 추천 Top 5</div>
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
                    <span>전날 대비(24시간) 순위 변동 +10 이상 또는 신규 진입 상품 · 상품명 클릭 시 카카오 선물하기 이동</span>
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
            const catProds = allProducts.filter(p => p.category === c);
            const ipProds = catProds.filter(p => p.character_ip && p.character_ip !== '일반/비IP 상품');
            const pct = catProds.length > 0 ? roundToOneDecimal((ipProds.length / catProds.length) * 100) : 0;
            catShareList.push({ category: c, total: catProds.length, ipCount: ipProds.length, ratio: pct });
        });

        strategyBox.innerHTML = `
            <div class="insight-item">
                <h4><i class="fa-solid fa-fire"></i> 세부 카테고리별 IP 침투 밀도 현황</h4>
                <ul>
                    ${catShareList.map(c => `<li><strong>[${c.category}]</strong>: IP 점유율 <strong>${c.ratio}%</strong> (${c.total}개 중 ${c.ipCount}개)</li>`).join('')}
                </ul>
            </div>
            <div class="insight-item">
                <h4><i class="fa-solid fa-bullseye"></i> 굿즈 제조사 핵심 추천 구역</h4>
                <ul>
                    <li><strong>침구/패브릭 (70.0%)</strong> & <strong>팬시/문구 (56.7%)</strong> 카테고리가 IP 상품의 최다 유입 구역입니다.</li>
                    <li>바디필로우, 핸드워머 쿠션, 마우스패드, 파우치 폼팩터 출시 시 즉각적인 소비자 반응 촉발.</li>
                </ul>
            </div>
            <div class="insight-item">
                <h4><i class="fa-solid fa-lightbulb"></i> 가격 & 단독 패키징 셀링 포인트</h4>
                <ul>
                    <li>소비자 구매 결제 평균 적정가: <strong>18,000원 ~ 34,800원</strong></li>
                    <li>상품 타이틀 <code>[단독/선런칭]</code> 및 <code>사은품 증정</code> 세팅 필수.</li>
                </ul>
            </div>
        `;

        // IP Summary Table
        const tbody = document.getElementById('ip-summary-tbody');
        tbody.innerHTML = '';

        sortedIps.forEach(([ipName, count]) => {
            const ipProds = allProducts.filter(p => p.character_ip && p.character_ip.includes(ipName));
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
            if (p.is_new_entry) {
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
