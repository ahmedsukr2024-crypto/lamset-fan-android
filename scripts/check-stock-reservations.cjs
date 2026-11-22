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
    db: { products: [] },
    lfIsArchivedOrder: o => ['تم التسليم', 'تم التسليم للعميل', 'ملغي', 'مكتمل', 'مغلقة'].includes(String(o?.status || ''))
  });
  vm.runInContext(helpers + '\nthis.api={orderStockLines,lfOrderHasShipped,lfOrderReservedUnits,lfMigrateStockReservations};', context);
  const api = context.api;
  const data = {
    products: [{ id: 'p1', stock: 12 }, { id: 'p2', stock: 4 }],
    orders: [
      { id: 'active', status: 'قيد التجهيز', items: [{ productId: 'p1', stockUnits: 10, stockDeductedUnits: 3, productionFulfilledUnits: 2, productionPendingUnits: 5 }] },
      { id: 'shipped', status: 'تم تسليمه لشركة الشحن', shippedAt: '2026-11-17T10:00:00Z', items: [{ productId: 'p1', stockUnits: 2, stockDeductedUnits: 2 }] },
      { id: 'partial', status: 'قيد التجهيز', stockIssuedAt: '2026-11-18T10:00:00Z', stockIssuedUnits: 2, shipments: [{ lines: [{ itemIndex: 0, productId: 'p1', qty: 2 }] }], items: [{ productId: 'p1', stockUnits: 6, stockDeductedUnits: 6 }] },
      { id: 'cancelled', status: 'ملغي', items: [{ productId: 'p2', stockUnits: 2, stockDeductedUnits: 2 }] }
    ]
  };
  context.db = data;
  assert(api.lfMigrateStockReservations(data), 'legacy reservation migration runs once');
  assert(data.products.find(p => p.id === 'p1').reservedStock === 9, 'active and partially shipped orders reserve only their remaining unshipped quantities');
  assert(data.products.find(p => p.id === 'p2').reservedStock === 0, 'cancelled orders do not retain reservations');
  assert(data.products.find(p => p.id === 'p1').stock === 12, 'migration preserves existing available stock without inventing a stock movement');
  assert(data.orders.find(o => o.id === 'shipped').stockIssueMigrated === true, 'legacy shipped orders are marked as already issued');
  assert(!api.lfMigrateStockReservations(data), 'migration is idempotent');
  assert(api.lfOrderReservedUnits(data.orders[0]) === 5, 'active order reservation helper returns the correct quantity');
  assert(api.lfOrderReservedUnits(data.orders[1]) === 0, 'fully shipped order is no longer reserved');
  assert(api.lfOrderReservedUnits(data.orders[2]) === 4, 'partially shipped order retains reservations only for its remaining unshipped units');
}
assert(html.includes('p.reservedStock=Math.max(0,Number(p.reservedStock)||0)+toDeduct'), 'saving an order records its stock reservation');
assert(html.includes("movementType:'order_reserve'"), 'order reservation is written to the central stock movement ledger');
assert(html.includes("movementType:'order_ship'"), 'shipping converts reservations into issued stock exactly once');
assert(html.includes('!o.stockIssuedAt&&!o.stockIssueMigrated'), 'shipping issue conversion is idempotent and protects legacy shipped orders');
assert(html.includes('p.reservedStock=Math.max(0,Number(p.reservedStock)||0)+allocation.allocated'), 'production allocated to orders is recorded as reserved');
assert(html.includes('reservedDelta:-returned'), 'cancelling an order releases its reserved stock');
assert(html.includes('reservedDelta:-allocated'), 'cancelling a production batch reverses its reserved allocation');
assert(html.includes('id="lfHomeStockAlert"'), 'home dashboard contains a dedicated low-stock alert section');
assert(html.includes("function renderHomeStockAlert(alerts)"), 'home low-stock alert reuses the existing alert records');
assert(html.includes("x.title==='نفاد المخزون'||x.title==='مخزون منخفض'"), 'home low-stock alert excludes watch-only stock warnings above the threshold');
assert(html.includes('renderHomeStockAlert(allAlerts)'), 'dashboard refreshes the dedicated stock alert from current stock alerts');
assert(html.includes('releaseByProduct.set(line.productId'), 'order cancellation validates aggregate reservations when the same product appears on multiple lines');
assert(html.includes('deleteReleaseByProduct.set(line.productId'), 'order deletion validates aggregate reservations before releasing stock');

const homeAlertStart = html.indexOf('function renderHomeStockAlert(alerts)');
const homeAlertEnd = html.indexOf('\\nfunction renderDash', homeAlertStart);
const homeAlertSource = homeAlertStart >= 0 && homeAlertEnd > homeAlertStart ? html.slice(homeAlertStart, homeAlertEnd) : '';
assert(!!homeAlertSource, 'home stock alert renderer can be isolated for behavior checks');
if (homeAlertSource) {
  const hosts = {
    lfHomeStockAlert: { hidden: true },
    lfHomeStockAlertList: { innerHTML: '' },
    lfHomeStockAlertCount: { textContent: '' }
  };
  const context = vm.createContext({
    $: id => hosts[id],
    esc: value => String(value ?? ''),
    window: {}
  });
  vm.runInContext(homeAlertSource + '\\nthis.renderHomeStockAlert=renderHomeStockAlert;', context);
  context.renderHomeStockAlert([
    { category: 'المخزون', title: 'نفاد المخزون', level: 'danger', body: 'منتج صفر — المتاح صفر قطعة' },
    { category: 'المخزون', title: 'مخزون منخفض', level: 'warning', body: 'منتج قليل — المتاح 2 قطعة · حد التنبيه 3' },
    { category: 'المخزون', title: 'مخزون يحتاج متابعة', level: 'info', body: 'منتج مراقبة — المتاح 4 قطع · حد التنبيه 3' },
    { category: 'التحصيل', title: 'مستحق', level: 'warning', body: 'عميل — باقي' }
  ]);
  assert(hosts.lfHomeStockAlert.hidden === false, 'home stock alert appears when stock reaches or falls below its threshold');
  assert(hosts.lfHomeStockAlertCount.textContent === '2', 'home stock alert count includes only out-of-stock and low-stock products');
  assert(hosts.lfHomeStockAlertList.innerHTML.includes('منتج صفر') && hosts.lfHomeStockAlertList.innerHTML.includes('منتج قليل'), 'home stock alert renders both zero and low stock products');
  assert(!hosts.lfHomeStockAlertList.innerHTML.includes('منتج مراقبة'), 'home stock alert excludes above-threshold watch notices');
  context.renderHomeStockAlert([]);
  assert(hosts.lfHomeStockAlert.hidden === true && hosts.lfHomeStockAlertList.innerHTML === '', 'home stock alert hides and clears when no products remain below threshold');
}

if (process.exitCode) process.exit(process.exitCode);
console.log('Stock reservation, migration, shipment, and production checks passed.');
