const fs=require('node:fs'),assert=require('node:assert/strict');
const html=fs.readFileSync('www/index.html','utf8');
const costFn=html.match(/function analyticsOrderCostNet\(o\)\{[^\n]*?\}/)?.[0]||'';
assert.ok(costFn,'historical order-cost helper exists');
assert.ok(costFn.includes('item.productSnapshot?.cost'),'sales cost must come from the order historical snapshot');
assert.ok(!costFn.includes('p?.cost')&&!costFn.includes('db.products.find'),'sales cost must never fall back to current catalog cost');
const legacyCostFn=html.match(/function analyticsOrderCost\(o\)\{[^\n]*?\}/)?.[0]||'';
assert.ok(legacyCostFn&&!legacyCostFn.includes('p?.cost'),'secondary historical cost helper must not fall back to catalog cost');
assert.ok(html.includes('rawCost=it.productSnapshot?.cost'),'missing historical cost is detected from the order snapshot');
assert.ok(html.includes("missingCostUnits?'غير مكتمل':money(cost)"),'cost of goods is marked incomplete when historical cost is missing');
assert.ok(html.includes('الحساب غير مكتمل لوجود'),'profit summary explains missing historical cost');
assert.ok(html.includes("(t==='treasury'||t==='reports')&&!options.ownerPinVerified"),'analytics and treasury require the existing owner PIN gate');
for(const tab of ['overview','sales','products','profits','customers','collections','stock','distribution']){
 assert.ok(html.includes('data-analytics-tab="'+tab+'"'),'missing analytics view '+tab);
}
assert.ok(html.includes('function setAnalyticsView(view)')&&html.includes("if(document.getElementById('reports')?.classList.contains('active'))renderReports()"),'analytics views render on demand when opened');
for(const view of ["view==='overview'","view==='sales'","view==='products'","view==='profits'","view==='customers'","view==='collections'","view==='stock'","view==='distribution'"])assert.ok(html.includes(view),'lazy rendering condition missing: '+view);
assert.ok(!html.includes("ربح تقديري '+money(p.sales-p.cost)"),'product ranking must not estimate profit using current catalog cost');
assert.ok(html.includes('function exportAnalyticsCSV()')&&html.includes('function printAnalytics()'),'existing export and print flows remain in place');
assert.ok(!html.includes('analyticsProfitDB')&&!html.includes('analyticsRecords'),'no parallel analytics data store is introduced');
console.log('Analytics center checks passed.');
