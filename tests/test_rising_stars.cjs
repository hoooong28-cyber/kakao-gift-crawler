const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const metrics = require('../docs/metrics.js');

test('CSV numeric string movement remains eligible without treating invalid values as rising', () => {
    const row = {product_id:1, category:'A', rank:1, rank_delta:'32'};
    assert.equal(metrics.risingStars([row])[0].ranking_contexts[0].rank_delta, '32');
    for (const value of ['NEW', '', 'NaN', 'Infinity', true])
        assert.equal(metrics.risingStars([{...row, rank_delta:value}]).length, 0);
});

test('stable identity, category context, thresholds, missing IDs and cap', () => {
    const row = (id, category = 'A', delta = 10) => ({product_id: id, category,
        rank: 1, rank_delta: delta, product_name: 'same title'});
    const rows = [row(1, 'B'), row('1.0'), row(1), row(2), row(3, 'A', 9),
        {...row(4), rank_delta: 'NEW', is_new_entry: true},
        {...row(5), rank_comparison_status: 'unavailable'}, row(null),
        {...row(null), url: 'https://gift.kakao.com/product/8?x=1'}];
    const result = metrics.risingStars(rows);
    assert.deepEqual(result.map(p => p.product_id), ['1', '2', '4', '8']);
    assert.deepEqual(result[0].ranking_contexts.map(c => c.category), ['A', 'B']);
    assert.equal(metrics.risingStars(rows, 2).length, 2);
    assert.equal(metrics.productId({url: 'https://example.org/product/1'}), null);
});

test('all historical cards agree with Python selection, including category filters', () => {
    const docs = path.join(__dirname, '../docs');
    for (const file of fs.readdirSync(docs).filter(f => /^data(?:_\d{8})?\.json$/.test(f))) {
        const snapshot = JSON.parse(fs.readFileSync(path.join(docs, file)));
        if (!snapshot.cards) continue;
        for (const [category, card] of Object.entries(snapshot.cards)) {
            if (!card.card_4_rising_stars) continue;
            const rows = category === '전체' ? snapshot.records : snapshot.records.filter(p => p.category === category);
            const result = metrics.risingStars(rows);
            const project = p => ({product_id: p.product_id, rank: p.rank, ranking_contexts: p.ranking_contexts});
            assert.deepEqual(result.map(project), card.card_4_rising_stars.map(project), `${file}/${category}`);
        }
    }
});
