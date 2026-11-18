#!/usr/bin/env node
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('www/index.html', 'utf8');
const start = html.indexOf('function lfOrderCancellationReleaseUnits(line)');
const end = html.indexOf('\nfunction applyOrderStatusChange', start);
if (start < 0 || end < 0) throw new Error('Order cancellation quantity guard is missing');
const context = vm.createContext({});
vm.runInContext(html.slice(start, end), context);
const check = context.lfOrderCancellationReleaseUnits;
function assert(value, message) { if (!value) throw new Error(message); }
assert(check({units: 100, item: {stockDeductedUnits: 60, productionFulfilledUnits: 40}}) === 100, 'valid stock and produced units are released together');
assert(check({units: 100, item: {stockDeductedUnits: 60}}) === 60, 'legacy line without production fulfills only recorded stock reservation');
assert(check({units: 100, item: {productionFulfilledUnits: 40}}) === 100, 'legacy line without explicit stock deduction excludes already produced units from stock reservation');
for (const line of [
 {units: 100, item: {stockDeductedUnits: 80, productionFulfilledUnits: 30}},
 {units: 100, item: {stockDeductedUnits: -1, productionFulfilledUnits: 0}},
 {units: 100, item: {stockDeductedUnits: 10.5, productionFulfilledUnits: 0}},
 {units: 100, item: {stockDeductedUnits: 10, productionFulfilledUnits: 2.5}},
 {units: 100, item: {stockDeductedUnits: 101, productionFulfilledUnits: 0}}
]) {
 let rejected = false;
 try { check(line); } catch (_) { rejected = true; }
 assert(rejected, 'invalid or overlapping stock/production quantities must block cancellation');
}
assert(html.includes('reserved=lfOrderCancellationReleaseUnits(line)'), 'cancellation prevalidates the exact quantity before changing stock');
assert(html.includes('returned=lfOrderCancellationReleaseUnits(line)'), 'cancellation uses the same validated quantity when returning stock');

const cancelStart=html.indexOf('if(cancelling){if(!Array.isArray(db.stockMovements))');
const cancelEnd=html.indexOf('if(reactivating&&o.stockReturnedOnCancel===true)',cancelStart);
const cancelSource=cancelStart>=0&&cancelEnd>cancelStart?html.slice(cancelStart,cancelEnd):'';
assert(!!cancelSource,'order cancellation release transaction exists');
assert(cancelSource.includes('p.stock=beforeStock+deducted'),'only unproduced reserved units return to regular stock');
assert(cancelSource.includes('p.surplusStock=Math.max(0,Number(p.surplusStock)||0)+fulfilled'),'produced units return to the separate surplus balance');
assert(cancelSource.includes('surplusDelta:fulfilled'),'movement history records surplus separately from ordinary stock');
assert(cancelSource.includes('releasedToSurplusOnOrderCancel')&&cancelSource.includes('batch.surplusUnits'),'cancelled-order surplus remains linked to its original production batch');
assert(cancelSource.includes('o.items.indexOf(item)'),'surplus release is matched to the exact order line');
assert(html.includes('Number(line.releasedToSurplusOnOrderCancel)>0'),'a batch with released surplus cannot be cancelled a second time');

console.log('Order cancellation ledger checks passed.');
