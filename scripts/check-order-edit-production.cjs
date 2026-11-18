#!/usr/bin/env node
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('www/index.html', 'utf8');
function assert(condition, message) {
  if (!condition) {
    console.error('Order edit production check failed: ' + message);
    process.exitCode = 1;
  }
}
const releaseStart = html.indexOf('function lfReleaseProductionAllocationForOrderEdit');
const editGuardStart = html.indexOf('function lfCanEditOrder(o)', releaseStart);
const editGuardEnd = html.indexOf('\nfunction editOrder(', editGuardStart);
assert(releaseStart >= 0 && editGuardStart > releaseStart && editGuardEnd > editGuardStart, 'production edit helpers exist');
const helperSource = html.slice(releaseStart, editGuardEnd);
const context = vm.createContext({
  db: {
    products: [{ id: 'p1', stock: 0, reservedStock: 10 }],
    productions: [{
      id: 'b1', date: '2026-11-18T10:00:00.000Z', status: 'active',
      allocatedToOrders: 10, addedToStock: 0,
      allocationLines: [{ orderId: 'o1', itemIndex: 0, qty: 10 }]
    }],
    payments: []
  },
  orderStockLines: order => (order.items || []).map(item => ({ item, productId: item.productId, units: item.stockUnits })),
  paidOnOrder: () => 0
});
vm.runInContext(helperSource, context);
const order = { id: 'o1', status: 'قيد التجهيز', items: [{
  productId: 'p1', stockUnits: 10, productionFulfilledUnits: 10,
  productionPendingUnits: 0, stockDeductedUnits: 0
}] };
const reduced = [{ productId: 'p1', stockUnits: 7 }];
const result = context.lfPreserveOrderProductionOnEdit(order, reduced);
assert(result.hasProduction && result.released[0]?.qty === 3, 'reduction releases only the produced surplus');
assert(reduced[0].productionFulfilledUnits === 7, 'fulfilled production remains attached to the reduced order quantity');
assert(context.db.products[0].stock === 3 && context.db.products[0].reservedStock === 7, 'released surplus moves from reserved to available stock');
assert(context.db.productions[0].allocationLines[0].releasedToStockOnOrderEdit === 3, 'original production allocation retains an explicit release audit');
assert(context.db.productions[0].allocationLines[0].orderEditReleases.length === 1, 'release event is recorded without deleting the original allocation');
const increased = [{ productId: 'p1', stockUnits: 12 }];
const increaseResult = context.lfPreserveOrderProductionOnEdit(order, increased);
assert(increaseResult.released.length === 0 && increased[0].productionFulfilledUnits === 10, 'increased quantity preserves the already produced amount');
let rejected = false;
try { context.lfPreserveOrderProductionOnEdit(order, [{ productId: 'p2', stockUnits: 12 }]); } catch (_) { rejected = true; }
assert(rejected, 'changing product identity after production is blocked to protect batch references');
const eligible = context.lfCanEditOrder(order);
assert(eligible, 'an unpaid, uninvoiced, unshipped order remains editable after production');
context.db.payments.push({ orderId: 'o1', amount: 1 });
assert(!context.lfCanEditOrder(order), 'orders with payment history remain protected from editing');
assert(html.includes('alreadyProduced=items.filter') && html.includes('productionFulfilledUnits=fulfilled'), 'save operation preserves fulfilled quantities and subtracts them before stock reservation');
assert(html.includes('releasedToStockOnOrderEdit') && html.includes('const activeQty='), 'production batch cancellation respects quantities released by order edits');
if (process.exitCode) process.exit(process.exitCode);
console.log('Order edit production checks passed.');
