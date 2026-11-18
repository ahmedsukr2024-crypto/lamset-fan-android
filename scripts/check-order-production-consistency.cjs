#!/usr/bin/env node
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('www/index.html', 'utf8');
function assert(condition, message) {
  if (!condition) {
    console.error('Order production consistency check failed: ' + message);
    process.exitCode = 1;
  }
}
const statusStart = html.indexOf('function lfOrderStatusKey(o)');
const workflowStart = html.indexOf('function orderWorkflowSnapshot(o)', statusStart);
const stockStart = html.indexOf('function orderStockLines(o)');
const pendingStart = html.indexOf('function orderPendingProductionUnits(o)', stockStart);
const needsStart = html.indexOf('function renderProductionNeeds()', pendingStart);
const planStart = html.indexOf('function lfProductionAllocationPlan(productId,quantity)');
const allocateStart = html.indexOf('function lfAllocateProduction(productId,quantity)');
const recordStart = html.indexOf('window.recordProduction=function()', allocateStart);
assert(statusStart >= 0 && workflowStart > statusStart, 'canonical order status helpers exist');
assert(stockStart >= 0 && pendingStart > stockStart, 'order stock and pending helpers exist');
assert(needsStart > pendingStart && planStart >= 0 && allocateStart > planStart && recordStart > allocateStart, 'production needs, editable allocation plan, and allocator functions exist');
if (process.exitCode) process.exit(process.exitCode);
const statusSource = html.slice(statusStart, workflowStart);
const stockSource = html.slice(stockStart, pendingStart);
const pendingSource = html.slice(pendingStart, needsStart);
const allocationSource = html.slice(planStart, recordStart);
const context = vm.createContext({
  window: {},
  lfOrderNumber: o => o?.orderNumber || o?.id || '',
  db: { orders: [
    { id: 'late', due: '2026-12-20', date: '2026-11-01', status: 'جديد', items: [{ productId: 'p1', stockUnits: 4, productionPendingUnits: 4, productionFulfilledUnits: 0 }] },
    { id: 'early', due: '2026-11-18', date: '2026-11-10', status: 'قيد التجهيز', items: [{ productId: 'p1', stockUnits: 3, productionPendingUnits: 3, productionFulfilledUnits: 0 }] },
    { id: 'archived', due: '2026-11-16', status: 'مكتمل', items: [{ productId: 'p1', stockUnits: 5, productionPendingUnits: 5, productionFulfilledUnits: 0 }] },
    { id: 'cancelled', due: '2026-11-16', status: 'ملغي', items: [{ productId: 'p1', stockUnits: 2, productionPendingUnits: 2, productionFulfilledUnits: 0 }] },
    { id: 'no-due', date: '2026-11-02', status: 'جديد', items: [{ productId: 'p1', stockUnits: 2, productionPendingUnits: 2, productionFulfilledUnits: 0 }] }
  ]}
});
vm.runInContext(statusSource + stockSource + pendingSource + allocationSource + '\nthis.api={lfIsArchivedOrder,orderPendingProductionUnits,lfAllocateProduction};', context);
const api = context.api;
const result = api.lfAllocateProduction('p1', 8);
assert(result.allocated === 8 && result.remaining === 0, 'only open orders receive the produced quantity');
assert(result.allocationLines[0]?.orderId === 'early' && result.allocationLines[0]?.qty === 3, 'earliest due order receives production first');
assert(result.allocationLines[1]?.orderId === 'late' && result.allocationLines[1]?.qty === 4, 'later due order receives production after earlier due');
assert(result.allocationLines[2]?.orderId === 'no-due' && result.allocationLines[2]?.qty === 1, 'orders without a due date are prioritized last');
assert(api.lfIsArchivedOrder(context.db.orders.find(o => o.id === 'archived')), 'legacy completed order is archived');
assert(api.orderPendingProductionUnits(context.db.orders.find(o => o.id === 'archived')) === 0, 'archived order has no active production pending count');
assert(context.db.orders.find(o => o.id === 'archived').items[0].productionPendingUnits === 5, 'archived historical production quantities are not mutated');
assert(context.db.orders.find(o => o.id === 'cancelled').items[0].productionPendingUnits === 2, 'cancelled order is not mutated');
context.db.orders = [
  { id: 'early', due: '2026-11-18', status: 'قيد التجهيز', items: [{ productId: 'p1', stockUnits: 3, productionPendingUnits: 3, productionFulfilledUnits: 0 }] },
  { id: 'late', due: '2026-12-20', status: 'جديد', items: [{ productId: 'p1', stockUnits: 4, productionPendingUnits: 4, productionFulfilledUnits: 0 }] }
];
context.window.__lfProductionAllocationDraft = { productId: 'p1', quantity: 5, lines: [{ orderId: 'early', itemIndex: 0, qty: 1 }, { orderId: 'late', itemIndex: 0, qty: 4 }] };
const manual = api.lfAllocateProduction('p1', 5);
assert(manual.allocated === 5 && manual.remaining === 0, 'manual production distribution respects the produced quantity');
assert(manual.allocationLines[0]?.orderId === 'early' && manual.allocationLines[0]?.qty === 1, 'manual allocation can override the default oldest-order quantity');
assert(manual.allocationLines[1]?.orderId === 'late' && manual.allocationLines[1]?.qty === 4, 'manual allocation applies the user-entered quantity to another order');
const needsRenderStart = html.indexOf('function renderProductionNeeds()');
const needsRenderEnd = html.indexOf('\nfunction ', needsRenderStart + 10);
const needsSource = needsRenderStart >= 0 ? html.slice(needsRenderStart, needsRenderEnd > needsRenderStart ? needsRenderEnd : needsRenderStart + 5000) : '';
assert(needsSource.includes('!lfIsArchivedOrder(o)'), 'renderProductionNeeds excludes archived orders');
assert(!html.includes('id="prodDamaged"'), 'production form no longer records scrap quantities');
assert(!html.includes('id="wastePct"'), 'cost study no longer applies a waste percentage');
assert(!html.includes('function productionMaterialNeeds'), 'raw-material requirement tracking is removed');
assert(!html.includes('function consumeProductionMaterials'), 'production no longer consumes raw-material inventory');
assert(html.includes('function lfRemoveLegacyMaterialData(data)'), 'legacy raw-material and scrap data migration exists');
const productionStart = html.indexOf('window.recordProduction=function()');
const productionEnd = html.indexOf('window.cancelProductionBatch=function()', productionStart);
const productionSource = productionStart >= 0 ? html.slice(productionStart, productionEnd > productionStart ? productionEnd : productionStart + 12000) : '';
assert(productionSource.includes('net=gross'), 'full recorded production quantity is treated as usable output');
assert(productionSource.includes('manualLines') && productionSource.includes('__lfProductionAllocationDraft'), 'production confirmation uses the reviewed manual allocation draft');
assert(html.includes('id="productionAllocationPreview"'), 'production form provides an editable allocation preview');
assert(!productionSource.includes('damaged') && !productionSource.includes('materialUse'), 'new production batches contain no scrap or raw-material deductions');
const reportStart = html.indexOf('function printProductionNeedsReport()');
const reportEnd = html.indexOf('\nfunction ', reportStart + 10);
assert(html.slice(reportStart, reportEnd).includes('!lfIsArchivedOrder(o)'), 'printed production report excludes archived orders');
if (process.exitCode) process.exit(process.exitCode);
console.log('Order production consistency checks passed.');
