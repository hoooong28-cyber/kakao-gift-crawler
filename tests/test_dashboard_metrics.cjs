const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const metrics = require('../docs/metrics.js');
const docs = path.join(__dirname, '../docs');

function dashboard(snapshot) {
    const elements = new Map();
    const errors = [];
    function element() {
        return { textContent: '', innerHTML: '', value: '', children: [],
            classList: { add() {}, remove() {}, toggle() {} },
            addEventListener() {}, appendChild(child) { this.children.push(child); },
            insertAdjacentHTML(position, html) { this.innerHTML += html; },
            getContext() { return {}; }, querySelector() { return element(); } };
    }
    const categories = ['all', '리빙 전체', '팬시/문구/취미 (IP핵심)', '침구/패브릭', '주방/식기'];
    const tabs = categories.map(cat => ({ ...element(), getAttribute: () => cat, closest: () => null }));
    const callbacks = {};
    const document = {
        getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
        querySelectorAll(selector) { return selector === '.cat-tab' ? tabs : []; },
        createElement: element,
        addEventListener(name, callback) { callbacks[name] = callback; }
    };
    const context = vm.createContext({ document, DashboardMetrics: metrics, Date, Set,
        console: { warn: (...args) => errors.push(args), error: (...args) => errors.push(args) },
        Chart: function () { this.destroy = () => {}; },
        fetch: async url => ({ ok: true, json: async () => {
            if (url.includes('dates')) return [];
            if (url.includes('ip_trends')) return {};
            if (url.includes('cards')) return snapshot.cards || {};
            return snapshot;
        } })
    });
    vm.runInContext(fs.readFileSync(path.join(docs, 'app.js'), 'utf8'), context);
    callbacks.DOMContentLoaded();
    return { elements, errors, select(cat) {
        const tab = tabs.find(t => t.getAttribute() === cat);
        callbacks.click({ target: { closest: () => tab } });
    } };
}

test('separates specific IPs, unclassified labels, missing labels and non-IP', () => {
    const result = metrics.summarize([
        { character_ip: '산리오, 카카오프렌즈, 산리오', price: '20,000원' },
        { character_ip: '기타 캐릭터/팬시' }, { character_ip: '캐릭터/팬시-침구' },
        { character_ip: '일반/비IP 상품' }, {}
    ]);
    assert.equal(result.ipCount, 1);
    assert.equal(result.pendingCount, 3);
    assert.equal(result.share, 20);
    assert.equal(result.ipCounts['산리오'], 1);
    assert.equal(result.ipCounts['카카오프렌즈'], 1);
    assert.equal(result.avgIpPrice, 20000);
});

test('deduplicates product identity across categories and excludes unknown prices', () => {
    const result = metrics.summarize([
        { product_id: '42', character_ip: '산리오', price: '10,000원' },
        { url: 'https://gift.kakao.com/product/42?foo=1', character_ip: '산리오', price: '-' },
        { product_id: '43', character_ip: '산리오', price_numeric: 20000 }, {}
    ]);
    assert.equal(result.total, 4);
    assert.equal(result.uniqueCount, 2);
    assert.equal(result.unidentifiedCount, 1);
    assert.equal(result.avgIpPrice, 15000);
    assert.equal(metrics.summarize([]).avgIpPrice, null);
});

test('September 22 regression: 400 observations, 339 products, bedding 39% plus 38 pending', () => {
    const records = JSON.parse(fs.readFileSync(path.join(docs, 'data_20260922.json'))).records;
    const all = metrics.summarize(records);
    assert.equal(all.total, 400);
    assert.equal(all.uniqueCount, 339);
    const bedding = metrics.summarize(records.filter(p => p.category === '침구/패브릭'));
    assert.equal(bedding.share, 39);
    assert.equal(bedding.pendingCount, 38);
});

test('every saved date and category renders matching overview, B2B and strategy denominators', async () => {
    const files = fs.readdirSync(docs).filter(name => /^data_\d{8}\.json$/.test(name));
    assert.ok(files.length >= 18);
    for (const file of files) {
        const snapshot = JSON.parse(fs.readFileSync(path.join(docs, file)));
        const rows = Array.isArray(snapshot) ? snapshot : snapshot.records;
        const app = dashboard(snapshot);
        await new Promise(resolve => setImmediate(resolve));
        for (const cat of ['all', ...new Set(rows.map(p => p.category))]) {
            app.select(cat);
            const products = cat === 'all' ? rows : rows.filter(p => p.category === cat);
            const expected = metrics.summarize(products);
            assert.equal(app.elements.get('ov-ip-share').textContent, `${expected.share} %`, `${file}/${cat}`);
            assert.equal(app.elements.get('ov-total-count').textContent, `${expected.total} 건`);
            const cards = app.elements.get('b2b-cards-container').innerHTML;
            assert.ok(cards.includes(`>${expected.share}%</h3>`), `${file}/${cat}: B2B share`);
            assert.ok(cards.includes(`${expected.total}건 중 IP 분류 ${expected.ipCount}건`));
            if (cat !== 'all') {
                assert.ok(app.elements.get('ip-strategy-box').innerHTML.includes(
                    `[${cat}]</strong>: IP 분류 비중 <strong>${expected.share}%</strong>`));
            }
            assert.notEqual(app.elements.get('ov-top-ip').textContent, '기타 캐릭터/팬시');
        }
        assert.deepEqual(app.errors, [], file);
    }
});
