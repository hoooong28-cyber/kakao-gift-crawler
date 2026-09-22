/* Shared dashboard definitions. Counts describe observed ranking rows, not sales. */
(function (root) {
    const unclassified = new Set([
        '기타 캐릭터/팬시', '캐릭터/팬시-침구', '캐릭터/팬시-팬시굿즈',
        '캐릭터/팬시-주방', '__미분류__', '미분류'
    ]);

    function ipNames(product) {
        return [...new Set(String(product.character_ip || '').split(/,\s*/)
            .map(name => name.trim()).filter(name => name &&
                name !== '일반/비IP 상품' && !unclassified.has(name)))];
    }

    function summarize(products) {
        const ipCounts = Object.create(null);
        const ids = new Set();
        let ipCount = 0, pendingCount = 0, unidentifiedCount = 0;
        let priceTotal = 0, pricedIpCount = 0;
        products.forEach(product => {
            const names = ipNames(product);
            const label = String(product.character_ip || '').trim();
            if (names.length) {
                ipCount++;
                names.forEach(name => { ipCounts[name] = (ipCounts[name] || 0) + 1; });
                const value = product.price_numeric ?? product.price_num ?? product.price;
                const price = Number(String(value ?? '').replace(/[^0-9.]/g, ''));
                if (Number.isFinite(price) && price > 0) {
                    priceTotal += price;
                    pricedIpCount++;
                }
            } else if (label !== '일반/비IP 상품') {
                pendingCount++;
            }
            const id = String(product.product_id || '').trim() ||
                String(product.url || '').match(/gift\.kakao\.com\/product\/(\d+)/)?.[1];
            if (id) ids.add(id);
            else unidentifiedCount++;
        });
        return {
            total: products.length, ipCount, pendingCount, ipCounts,
            share: products.length ? Math.round(ipCount / products.length * 1000) / 10 : 0,
            uniqueCount: ids.size, unidentifiedCount,
            avgIpPrice: pricedIpCount ? Math.round(priceTotal / pricedIpCount) : null
        };
    }

    const api = { ipNames, summarize };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.DashboardMetrics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
