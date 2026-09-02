document.addEventListener('DOMContentLoaded', () => {
    let rawProductsData = [];
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
    });

    // Category Filter Bar Listener (Overview & Table Views)
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
            const res = await fetch('/api/dates');
            if (!res.ok) return;
            const dates = await res.json();
            
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
            const url = selectedDate ? `/api/data?date=${selectedDate}` : '/api/data';
            const response = await fetch(url);
            if (response.ok) {
                rawProductsData = await response.json();
            } else {
                const fallbackResponse = await fetch('data.json');
                rawProductsData = await fallbackResponse.json();
            }
        } catch (e) {
            console.warn('API fetch failed, trying local data.json', e);
            try {
                const res = await fetch('data.json');
                rawProductsData = await res.json();
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

        products.forEach(p => {
            const ip = p.character_ip || '일반/비IP 상품';
            if (ip !== '일반/비IP 상품') {
                ipProductCount++;
                const rawPrice = parseInt((p.price || '').replace(/[^0-9]/g, ''), 10);
                if (rawPrice) totalIpPrice += rawPrice;

                const ipList = ip.split(', ');
                ipList.forEach(item => {
                    ipCounts[item] = (ipCounts[item] || 0) + 1;
                });
            }

            if (p.brand) {
                brandCounts[p.brand] = (brandCounts[p.brand] || 0) + 1;
            }
        });

        // Overview Metrics
        const ipSharePct = products.length > 0 ? roundToOneDecimal((ipProductCount / products.length) * 100) : 0;
        document.getElementById('ov-ip-share').textContent = `${ipSharePct} %`;
        document.getElementById('ov-ip-sub').textContent = `${products.length}개 항목 중 ${ipProductCount}개 IP 상품`;

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
        renderIpChart(sortedIps.slice(0, 8));
        const sortedBrands = Object.entries(brandCounts).sort((a, b) => b[1] - a[1]);
        renderBrandChart(sortedBrands.slice(0, 6));
        renderTopCards(products.slice(0, 6));

        // Render Page 2 Components (IP Strategy Hub)
        renderIpStrategyPage(rawProductsData, sortedIps);

        // Render Page 3 Table Components
        renderTable(products);
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

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><span class="badge-cat">${catStr}</span></td>
                <td class="badge-rank">${p.rank}위</td>
                <td>
                    <span style="${isIpProduct ? 'background: rgba(254, 229, 0, 0.15); color: #FEE500; border: 1px solid rgba(254, 229, 0, 0.3);' : 'background: rgba(255, 255, 255, 0.05); color: #94A3B8;'} padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">
                        ${ipStr}
                    </span>
                </td>
                <td><span class="badge-brand">${brandStr}</span></td>
                <td style="font-weight: 500; color: #F8FAFC;">${p.product_name}</td>
                <td style="font-weight: 600; color: #FEE500;">${p.price}</td>
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
