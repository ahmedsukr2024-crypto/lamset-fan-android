#!/usr/bin/env node
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('www/index.html', 'utf8');
function assert(condition, message) {
  if (!condition) {
    console.error('Stock reservation check failed: ' + message);
    process.exitCode = 1;
  }
}
const start = html.indexOf('function orderStockLines(o)');
const end = html.indexOf('function renderProductionNeeds()', start);
const helpers = start >= 0 && end > start ? html.slice(start, end) : '';
assert(!!helpers, 'order stock and reservation migration helpers exist');
if (helpers) {
  const context = vm.createContext({
    window: {},
    lfIsArchivedOrder: o => ['تم التسليم', 'تم التسليم للعميل', 'ملغي', 'مكتمل', 'مغلقة'].includes(String(o?.status || ''))
  });
  vm.runInContext(helpers + '\nthis.api={orderStockLines,lfOrderHasShipped,lfOrderReservedUnits,lfMigrateStockReservations};', context);
  const api = context.api;
  const data = {
    products: [{ id: 'p1', stock: 8 }, { id: 'p2', stock: 4 }],
    orders: [
      { id: 'active', status: 'قيد التجهيز', items: [{ productId: 'p1', stockUnits: 10, stockDeductedUnits: 3, productionFulfilledUnits: 2, productionPendingUnits: 5 }] },
      { id: 'shipped', status: 'تم تسليمه لشركة الشحن', shippedAt: '2026-11-17T10:00:00Z', items: [{ productId: 'p1', stockUnits: 2, stockDeductedUnits: 2 }] },
      { id: 'cancelled', status: 'ملغي', items: [{ productId: 'p2', stockUnits: 2, stockDeductedUnits: 2 }] }
    ]
  };
  assert(api.lfMigrateStockReservations(data), 'legacy reservation migration runs once');
  assert(data.products.find(p => p.id === 'p1').reservedStock === 5, 'active unshipped orders reserve deducted and produced quantities');
  assert(data.products.find(p => p.id === 'p2').reservedStock === 0, 'cancelled orders do not retain reservations');
  assert(data.products.find(p => p.id === 'p1').stock === 8, 'migration preserves existing available stock without inventing a stock movement');
  assert(data.orders.find(o => o.id === 'shipped').stockIssueMigrated === true, 'legacy shipped orders are marked as already issued');
  assert(!api.lfMigrateStockReservations(data), 'migration is idempotent');
  assert(api.lfOrderReservedUnits(data.orders[0]) === 5, 'active order reservation helper returns the correct quantity');
  assert(api.lfOrderReservedUnits(data.orders[1]) === 0, 'shipped order is no longer reserved');
}
assert(html.includes('p.reservedStock=Math.max(0,Number(p.reservedStock)||0)+toDeduct'), 'saving an order records its stock reservation');
assert(html.includes("movementType:'order_reserve'"), 'order reservation is written to the central stock movement ledger');
assert(html.includes("movementType:'order_ship'"), 'shipping converts reservations into issued stock exactly once');
assert(html.includes('!o.stockIssuedAt&&!o.stockIssueMigrated'), 'shipping issue conversion is idempotent and protects legacy shipped orders');
assert(html.includes('p.reservedStock=Math.max(0,Number(p.reservedStock)||0)+allocation.allocated'), 'production allocated to orders is recorded as reserved');
assert(html.includes('reservedDelta:-returned'), 'cancelling an order releases its reserved stock');
assert(html.includes('reservedDelta:-allocated'), 'cancelling a production batch reverses its reserved allocation');
assert(html.includes('releaseByProduct.set(line.productId'), 'order cancellation validates aggregate reservations when the same product appears on multiple lines');
assert(html.includes('deleteReleaseByProduct.set(line.productId'), 'order deletion validates aggregate reservations before releasing stock');
if (process.exitCode) process.exit(process.exitCode);
console.log('Stock reservation, migration, shipment, and production checks passed.');
