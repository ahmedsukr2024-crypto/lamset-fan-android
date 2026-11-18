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
console.log('Order cancellation ledger checks passed.');
