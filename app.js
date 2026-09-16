document.addEventListener('DOMContentLoaded', () => {
    const select = document.getElementById('dateSelect');
    const tbody = document.getElementById('rankingTable');

    fetch('dates.json?t=' + Date.now())
        .then(res => res.json())
        .then(data => {
            const dates = data.dates || data.history || data;
            if (!dates || dates.length === 0) return;
            
            select.innerHTML = dates.map(d => `<option value="${d}">${d}</option>`).join('');
            loadHistory(dates[0]);

            select.addEventListener('change', (e) => {
                loadHistory(e.target.value);
            });
        })
        .catch(err => {
            if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="loading">날짜 목록을 불러오지 못했습니다.</td></tr>';
        });

    function loadHistory(dateStr) {
        const cleanDate = dateStr.replace(/-/g, '');
        
        fetch(`history/history_${cleanDate}.json?t=` + Date.now())
            .then(res => res.json())
            .then(json => {
                const items = json.items || json.data || json;
                renderTable(items);
            })
            .catch(() => {
                fetch(`history/history_${dateStr}.json?t=` + Date.now())
                    .then(res => res.json())
                    .then(json => renderTable(json.items || json.data || json))
                    .catch(() => {
                        if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="loading">해당 날짜의 데이터가 없습니다.</td></tr>';
                    });
            });
    }

    function renderTable(items) {
        if (!tbody) return;
        if (!items || items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="loading">표시할 데이터가 없습니다.</td></tr>';
            return;
        }

        tbody.innerHTML = items.map((item, idx) => {
            const rank = item.rank || item.ranking || (idx + 1);
            const brand = item.brand || item.brand_name || item.company || '-';
            const name = item.product_name || item.name || item.title || item.item_name || '상품명 없음';
            const price = item.price || item.price_num ? Number(item.price || item.price_num).toLocaleString() + '원' : '-';
            const cat = item.category || item.category_name || '-';

            return `<tr>
                <td style="text-align: center;">${rank}</td>
                <td>${brand}</td>
                <td><b>${name}</b></td>
                <td style="text-align: right;">${price}</td>
                <td style="text-align: center;">${cat}</td>
            </tr>`;
        }).join('');
    }
});