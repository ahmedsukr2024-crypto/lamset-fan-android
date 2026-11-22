const fs=require('node:fs'),assert=require('node:assert/strict');
const html=fs.readFileSync('www/index.html','utf8');
const costFn=html.match(/function analyticsOrderCostNet\(o\)\{[^\n]*?\}/)?.[0]||'';
assert.ok(costFn,'historical order-cost helper exists');
assert.ok(costFn.includes('item.productSnapshot?.cost'),'sales cost must come from the order historical snapshot');
assert.ok(!costFn.includes('p?.cost')&&!costFn.includes('db.products.find'),'sales cost must never fall back to current catalog cost');
assert.ok(html.includes('rawCost=it.productSnapshot?.cost'),'missing historical cost is detected from the order snapshot');
assert.ok(html.includes("missingCostUnits?'غير مكتمل':money(cost)"),'cost of goods is marked incomplete when historical cost is missing');
assert.ok(html.includes('الحساب غير مكتمل لوجود'),'profit summary explains missing historical cost');
assert.ok(html.includes("(t==='treasury'||t==='reports')&&!options.ownerPinVerified"),'analytics and treasury require the existing owner PIN gate');
for(const tab of ['overview','sales','products','profits','customers','collections','stock','distribution']){
 assert.ok(html.includes('data-analytics-tab="'+tab+'"'),'missing analytics view '+tab);
}
assert.ok(html.includes('function setAnalyticsView(view)'),'analytics view navigation is wired');
assert.ok(html.includes('function exportAnalyticsCSV()')&&html.includes('function printAnalytics()'),'existing export and print flows remain in place');
assert.ok(!html.includes('analyticsProfitDB')&&!html.includes('analyticsRecords'),'no parallel analytics data store is introduced');
console.log('Analytics center checks passed.');
