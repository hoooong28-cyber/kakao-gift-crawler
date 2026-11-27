document.addEventListener('DOMContentLoaded', () => {
    let rawProductsData = [];
    let insightCardsData = {};
    let activeCategory = '리빙 전체';
    let activeOverviewCategory = '리빙 전체';
    let activePage = 'page-overview';
    let activeB2BCategory = '리빙 전체';
    let selectedDate = ''; // '' = 최신 날짜

    let ipChartInstance = null;
    let brandChartInstance = null;

    const refreshBtn = document.getElementById('refresh-btn');
    const mainNavMenu = document.getElementById('main-nav-menu');
    const dateSelector = document.getElementById('date-selector');

    // Sidebar Page Tab Switching
    mainNavMenu.addEventListener('click', (e) => {
        const btn = e.target.closest('.nav-item');
        if (!btn) return;

        document.querySelectorAll('#main-nav-menu .nav-item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        activePage = btn.getAttribute('data-page');
        if (activePage === 'page-overview') activeCategory = activeOverviewCategory;
        if (activePage === 'page-b2b-insights') activeCategory = activeB2BCategory;
        document.querySelectorAll('.page-view').forEach(view => {
            if (view.id === activePage) {
                view.classList.add('active');
            } else {
                view.classList.remove('active');
            }
        });

        renderDashboard();
    });

    // Category Filter Bar Listener (Overview, B2B, Period & Table Views)
    document.addEventListener('click', (e) => {
        const periodTypeBtn = e.target.closest('#period-type-tabs .cat-tab');
        if (periodTypeBtn) {
            document.querySelectorAll('#period-type-tabs .cat-tab').forEach(b => b.classList.remove('active'));
            periodTypeBtn.classList.add('active');
            activePeriodType = periodTypeBtn.getAttribute('data-period');
            renderPeriodInsights();
            return;
        }

        const periodCatBtn = e.target.closest('#cat-tabs-period .cat-tab');
        if (periodCatBtn) {
            document.querySelectorAll('#cat-tabs-period .cat-tab').forEach(b => b.classList.remove('active'));
            periodCatBtn.classList.add('active');
            activePeriodCat = periodCatBtn.getAttribute('data-cat');
            renderPeriodInsights();
            return;
        }

        const momentumTypeBtn = e.target.closest('#momentum-type-tabs .cat-tab');
        if (momentumTypeBtn) {
            document.querySelectorAll('#momentum-type-tabs .cat-tab').forEach(b => b.classList.remove('active'));
            momentumTypeBtn.classList.add('active');
            activeMomentumType = momentumTypeBtn.getAttribute('data-momentum');
            renderPeriodInsights();
            return;
        }

        const tabBtn = e.target.closest('.cat-tab');
        if (!tabBtn) return;

        const parentContainer = tabBtn.closest('.category-tabs');
        if (parentContainer) {
            parentContainer.querySelectorAll('.cat-tab').forEach(b => b.classList.remove('active'));
            tabBtn.classList.add('active');
        }

        activeCategory = tabBtn.getAttribute('data-cat');
        if (activePage === 'page-overview') activeOverviewCategory = activeCategory;
        if (activePage === 'page-b2b-insights') activeB2BCategory = activeCategory;
        
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

    let weeklyInsightsData = {};
    let monthlyInsightsData = {};
    let activePeriodType = 'weekly';
    let activePeriodCat = 'all';
    let activeMomentumType = 'rising';

    async function loadPeriodInsightsData() {
        try {
            const [resW, resM] = await Promise.all([
                fetchFresh('weekly_insights.json'),
                fetchFresh('monthly_insights.json')
            ]);
            weeklyInsightsData = resW.ok ? await resW.json() : {};
            monthlyInsightsData = resM.ok ? await resM.json() : {};
        } catch (e) {
            console.warn('Period insights load failed:', e);
        }
    }

    async function loadData() {
        await loadPeriodInsightsData();
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

    function periodText(value) {
        return String(value ?? '').replace(/[&<>"']/g, char => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[char]);
    }

    function renderPeriodInsights() {
        const periodData = (activePeriodType === 'weekly') ? weeklyInsightsData : monthlyInsightsData;
        const dateRangeLabel = document.getElementById('period-date-range-label');
        if (dateRangeLabel) {
            dateRangeLabel.textContent = periodData ? (periodData.period_label || '') : '';
        }

        const periodSubtitle = document.getElementById('period-ip-subtitle');
        if (periodSubtitle) {
            const daysText = activePeriodType === 'weekly' ? '주간 (7일)' : '월간 (30일)';
            periodSubtitle.textContent = `${daysText} 랭킹 노출 비중 및 건수 · 최신 수집일 기준 (상단 날짜 선택과 별도)`;
        }

        if (!periodData || !periodData.categories) {
            document.getElementById('period-top-ips-container').textContent = '기간 데이터를 불러올 수 없습니다. 새로고침으로 다시 시도해 주세요.';
            document.getElementById('period-steady-products-container').textContent = '';
            return;
        }

        const catData = periodData.categories[activePeriodCat === 'all' ? '전체' : activePeriodCat] || {};

        // 1. Top IPs Ranking
        const ipContainer = document.getElementById('period-top-ips-container');
        if (ipContainer) {
            const topIps = catData.top_ips || [];
            if (topIps.length === 0) {
                ipContainer.innerHTML = '<p style="color:var(--text-muted); padding:16px; text-align:center;">기간 내 데이터가 없습니다.</p>';
            } else {
                ipContainer.innerHTML = topIps.map((item, idx) => `
                    <div style="margin-bottom:14px; padding:8px 12px; background:rgba(255,255,255,0.02); border-radius:8px; border:1px solid rgba(255,255,255,0.05);">
                        <div class="period-ip-summary">
                            <span><strong style="color:var(--accent-yellow); margin-right:8px; font-size:1.05rem;">${idx + 1}위</strong> <strong style="color:var(--text-primary); font-size:0.95rem;">${periodText(item.ip_name)}</strong></span>
                            <span class="period-ip-stats">${item.share} <span style="color:var(--text-muted); font-weight:400; font-size:0.8rem;">(${item.count}회)</span></span>
                        </div>
                        <div style="width:100%; height:8px; background:rgba(255,255,255,0.1); border-radius:4px; overflow:hidden;">
                            <div style="width:${Math.max(parseFloat(item.share) || 5, 4)}%; height:100%; background:linear-gradient(90deg, #FEE500, #F59E0B); border-radius:4px;"></div>
                        </div>
                    </div>
                `).join('');
            }
        }

        // 2. Steady Long-run Products
        const steadyContainer = document.getElementById('period-steady-products-container');
        if (steadyContainer) {
            const steadyProds = (catData.steady_products || []).filter(item => DashboardMetrics.ipNames(item).length);
            if (steadyProds.length === 0) {
                steadyContainer.innerHTML = '<p style="color:var(--text-muted); padding:16px; text-align:center;">기간 내 개별 IP가 확인된 상품이 없습니다.</p>';
            } else {
                steadyContainer.innerHTML = steadyProds.map((item, idx) => `
                    <div class="period-product">
                        <span class="period-product-rank">${idx + 1}</span>
                        <div class="period-product-info">
                            <div class="period-product-meta">${periodText(item.brand)} | <span>${periodText(item.character_ip)}</span></div>
                            <div class="period-product-name" title="${periodText(item.product_name)}">${periodText(item.product_name)}</div>
                        </div>
                        <div class="period-product-stats">
                            <div class="period-product-price">${periodText(item.price)}</div>
                            <div class="period-product-days"><i class="fa-solid fa-calendar-check"></i> ${item.appearance_days}일 노출</div>
                        </div>
                    </div>
                `).join('');
            }
        }

        // 3. P4: IP Growth/Falling Momentum Cards with Evidence Products
        const momentumContainer = document.getElementById('period-momentum-container');
        if (momentumContainer) {
            const momentum = catData.momentum || {};
            const comparison = momentum.comparison || {};
            const compSubtitle = document.getElementById('period-momentum-subtitle');
            if (compSubtitle) {
                compSubtitle.textContent = comparison.note || comparison.comparison_note || '직전 기간 대비 순위 가중 점수 변동 비교';
            }

            const momentumFields = ['rising_ips', 'new_entry_ips', 'stable_ips', 'falling_ips'];
            if (!['available', 'insufficient_data'].includes(comparison.status) ||
                momentumFields.some(field => !Array.isArray(momentum[field]))) {
                if (compSubtitle) compSubtitle.textContent = '모멘텀 보고서 데이터가 누락되었습니다.';
                momentumContainer.innerHTML = `<p style="padding:24px; text-align:center; color:var(--text-muted);">모멘텀 데이터가 아직 생성되지 않았습니다. 데이터 갱신 후에도 계속되면 보고서 생성 상태를 확인해 주세요.</p>`;
            } else if (comparison.status === 'insufficient_data') {
                momentumContainer.innerHTML = `
                    <div style="padding:24px; text-align:center; background:rgba(239,68,68,0.06); border:1px dashed rgba(239,68,68,0.3); border-radius:8px; color:var(--text-muted);">
                        <i class="fa-solid fa-triangle-exclamation" style="color:#EF4444; font-size:1.4rem; margin-bottom:8px; display:block;"></i>
                        <strong style="color:var(--text-primary); font-size:0.95rem;">비교 데이터 부족으로 산출 불가</strong>
                        <p style="margin-top:4px; font-size:0.85rem;">${periodText(comparison.note || comparison.comparison_note || '직전 기간 수집 데이터가 부족합니다.')}</p>
                    </div>
                `;
            } else {
                let items = [];
                if (activeMomentumType === 'rising') items = momentum.rising_ips || [];
                else if (activeMomentumType === 'new_entry') items = momentum.new_entry_ips || [];
                else if (activeMomentumType === 'stable') items = momentum.stable_ips || [];
                else if (activeMomentumType === 'falling') items = momentum.falling_ips || [];

                if (!items || items.length === 0) {
                    const labels = { rising: '급상승', new_entry: '관측상 신규', stable: '안정적 강세', falling: '하락세' };
                    momentumContainer.innerHTML = `
                        <p style="color:var(--text-muted); padding:24px; text-align:center;">해당 조건(${labels[activeMomentumType] || ''})에 부합하는 IP가 없습니다.</p>
                    `;
                } else {
                    momentumContainer.innerHTML = `
                        <div class="momentum-cards-grid">
                            ${items.map((item, idx) => {
                                const badgeColor = item.momentum_type === 'RISING' ? '#10B981' :
                                                   item.momentum_type === 'NEW_ENTRY' ? '#F59E0B' :
                                                   item.momentum_type === 'STABLE' ? '#3B82F6' : '#EF4444';
                                const badgeBg = item.momentum_type === 'RISING' ? 'rgba(16,185,129,0.15)' :
                                                item.momentum_type === 'NEW_ENTRY' ? 'rgba(245,158,11,0.15)' :
                                                item.momentum_type === 'STABLE' ? 'rgba(59,130,246,0.15)' : 'rgba(239,68,68,0.15)';
                                const scoreDeltaText = item.score_delta > 0 ? `+${item.score_delta}` : `${item.score_delta}`;
                                const evidenceList = (item.evidence_products || []).slice(0, 2);

                                return `
                                    <div class="momentum-card">
                                        <div class="momentum-card-header">
                                            <div style="display:flex; align-items:center; gap:8px;">
                                                <span class="momentum-badge" style="background:${badgeBg}; color:${badgeColor}; border:1px solid ${badgeColor}40;">
                                                    ${periodText(item.momentum_badge || item.momentum_type)}
                                                </span>
                                                <strong class="momentum-ip-title">${idx + 1}. ${periodText(item.ip_name)}</strong>
                                            </div>
                                            <div style="text-align:right;">
                                                <span style="font-weight:700; font-size:1.05rem; color:${badgeColor};">${periodText(item.growth_rate)}</span>
                                                <div style="font-size:0.75rem; color:var(--text-muted);">점수변동: ${scoreDeltaText}p</div>
                                            </div>
                                        </div>
                                        <div class="momentum-card-metrics">
                                            <div class="momentum-metric-box">
                                                <span class="metric-k">수집일당 평균 순위점수</span>
                                                <span class="metric-v" style="color:var(--accent-yellow);">${item.curr_score}점 <small style="color:var(--text-muted); font-size:0.75rem;">(이전 ${item.prev_score}점)</small></span>
                                            </div>
                                            <div class="momentum-metric-box">
                                                <span class="metric-k">노출일수 / Top 10</span>
                                                <span class="metric-v">${item.appearance_days}일 출현 / ${item.top10_count || 0}회</span>
                                            </div>
                                        </div>
                                        ${evidenceList.length > 0 ? `
                                            <div class="momentum-evidence-box">
                                                <div class="evidence-title"><i class="fa-solid fa-bullseye"></i> 대표 관측 상품${item.evidence_period === 'previous' ? ' (직전 기간)' : ''}</div>
                                                ${evidenceList.map(p => `
                                                    <div class="evidence-product-item">
                                                        <div class="evidence-product-name" title="${periodText(p.product_name)}">
                                                            <span class="evidence-rank-pill">최고 ${p.best_rank ? p.best_rank + '위' : '-'}</span>
                                                            <span style="color:var(--text-muted); font-size:0.78rem;">${periodText(p.brand)}</span> ${periodText(p.product_name)}
                                                        </div>
                                                        <div class="evidence-product-price">${periodText(p.price)}</div>
                                                    </div>
                                                `).join('')}
                                            </div>
                                        ` : ''}
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    `;
                }
            }
        }
    }

    function renderDashboard() {
        if (activePage === 'page-period-insights') {
            renderPeriodInsights();
            return;
        }

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
            if (!cat || button.closest('#cat-tabs-period') || button.closest('#momentum-type-tabs') || button.closest('#period-type-tabs')) return;
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
            card_4_rising_stars: DashboardMetrics.risingStars(products)
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
        // Use the selected day's records, including for legacy cached card payloads.
        const rising = DashboardMetrics.risingStars(getFilteredProducts());

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
                    <span>직전 수집일 대비 10계단 이상 상승 또는 수집 범위 내 신규 진입 · 동일 상품은 한 행 · 카테고리 순위 오름차순 최대 5개 · 번호는 표시 순서이며 통합 순위·공동 순위가 아닙니다.</span>
                </div>
                <div class="table-container" style="margin-top: 15px;">
                    <table class="custom-table">
                        <thead>
                            <tr>
                                <th style="width: 70px;">번호</th>
                                <th style="min-width: 240px;">카테고리별 순위 · 변동</th>
                                <th style="width: 130px;">캐릭터 IP</th>
                                <th style="width: 120px;">브랜드</th>
                                <th>상품명</th>
                                <th style="width: 110px;">가격</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rising.length > 0 ? rising.map((r, idx) => `
                                <tr>
                                    <td class="badge-rank">${idx + 1}</td>
                                    <td>
                                        ${r.ranking_contexts.map(c => `<div>${c.category} · ${c.rank}위 <strong style="color:#10B981;">${c.is_new_entry ? 'NEW' : '+' + c.rank_delta}</strong></div>`).join('')}
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

    refreshBtn.addEventListener('click', () => {
        loadData();
    });

    loadAvailableDates().then(() => loadData());
});
