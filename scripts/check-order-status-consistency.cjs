#!/usr/bin/env node
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('www/index.html', 'utf8');
function assert(condition, message) {
  if (!condition) {
    console.error('Order status consistency check failed: ' + message);
    process.exitCode = 1;
  }
}
const statusStart = html.indexOf('function lfOrderStatusKey(o)');
const workflowStart = html.indexOf('function orderWorkflowSnapshot(o)', statusStart);
const trackerStart = html.indexOf('function orderStageTrackerHtml(o,flow,late)', workflowStart);
const trackerEnd = html.indexOf('let orderSectionView=', trackerStart);
const statusSource = statusStart >= 0 && trackerEnd > statusStart
  ? html.slice(statusStart, trackerEnd)
  : '';
assert(!!statusSource, 'canonical order status helpers and workflow snapshot exist');
if (statusSource) {
  const shipmentStart = html.indexOf('function lfOrderShipmentState(o)');
  const shipmentEnd = html.indexOf('function lfOrderHasShipped(o)', shipmentStart);
  const shipmentSource = shipmentStart >= 0 && shipmentEnd > shipmentStart ? html.slice(shipmentStart, shipmentEnd) : '';
  assert(!!shipmentSource, 'shipment state helper exists for canonical order workflow');
  const context = vm.createContext({ orderStockLines: () => [], db: { products: [] } });
  vm.runInContext(shipmentSource + '\n' + statusSource + '\nthis.api={lfOrderStatusKey,lfIsDeliveredOrder,lfIsCancelledOrder,lfIsArchivedOrder,orderWorkflowSnapshot,orderStageTrackerHtml};', context);
  const api = context.api;
  for (const status of ['تم التسليم', 'تم التسليم للعميل', 'ملغي', 'مكتمل', 'مكتملة', 'مغلق', 'مغلقة', 'مؤرشف', 'مؤرشفة']) {
    const order = { status };
    assert(api.lfIsArchivedOrder(order), 'legacy/final status is archived: ' + status);
    assert(!api.orderWorkflowSnapshot(order).open, 'archived status is not active in workflow: ' + status);
  }
  for (const status of ['جديد', 'قيد التجهيز', 'جاهز للشحن', 'تم تسليمه لشركة الشحن']) {
    const order = { status };
    assert(!api.lfIsArchivedOrder(order), 'active status remains outside archive: ' + status);
    assert(api.orderWorkflowSnapshot(order).open, 'active status remains open: ' + status);
  }
  assert(api.lfIsCancelledOrder({status:'ملغي'}), 'cancelled status is identified separately');
  assert(api.orderWorkflowSnapshot({status:'ملغي'}).cancelled, 'cancelled workflow state remains distinguishable');
  assert(api.lfIsDeliveredOrder({status:'تم التسليم'}), 'delivered status is identified');
  assert(api.lfIsDeliveredOrder({status:'تم التسليم للعميل'}), 'customer-delivered legacy status is identified');
  assert(api.orderWorkflowSnapshot({status:'مكتمل'}).stage === 'مغلق', 'legacy completed status gets a closed workflow stage');
  assert(api.orderStageTrackerHtml({status:'مغلق'}, api.orderWorkflowSnapshot({status:'مغلق'}), false).includes('الطلب مغلق ومحفوظ في الأرشيف'), 'legacy closed orders do not display a cancellation tracker');
}
const overviewStart = html.indexOf('function renderOrdersOverview()');
const overviewEnd = html.indexOf('function openOrdersOverviewFilter', overviewStart);
const overview = overviewStart >= 0 && overviewEnd > overviewStart ? html.slice(overviewStart, overviewEnd) : '';
assert(overview.includes('orders.filter(o=>!lfIsArchivedOrder(o))'), 'overview active totals exclude every archived status');
assert(overview.includes('orders.filter(lfIsDeliveredOrder).length'), 'delivered count uses the canonical helper');
const renderStart = html.indexOf('function renderOrders(){');
const renderEnd = html.indexOf('function factoryOrderHtml', renderStart);
const render = renderStart >= 0 && renderEnd > renderStart ? html.slice(renderStart, renderEnd) : '';
assert(render.includes('const archived=lfIsArchivedOrder;'), 'open/archive tabs use the same canonical status helper');
assert(render.includes('orderWorkflowSnapshot(o)'), 'order cards use canonical workflow status');
assert(html.includes('سبب إلغاء / إغلاق الطلب (مطلوب):'), 'exceptional order closure requires a reason');
assert(html.includes('o.cancelReason=statusReason'), 'order closure reason is retained with the order');
assert(html.includes('async function correctDeliveryConfirmation(orderId)'), 'owner-only delivery correction action exists');
assert(html.includes("window.lamsetRequireOwnerPin('تصحيح تأكيد تسليم الطلب '+lfOrderNumber(order))"), 'delivery correction requires owner PIN');
assert(html.includes("prompt('سبب تصحيح تأكيد التسليم (مطلوب):','')"), 'delivery correction requires a reason');
assert(html.includes("order.status=waitingStatus;")&&html.includes("order.shippedAt?'تم تسليمه لشركة الشحن':'جاهز للشحن'"), 'delivery correction returns the order to the appropriate waiting state');
assert(html.includes('previousDeliveredAt});'), 'previous delivery confirmation timestamp is retained in correction history');
assert(html.includes("delete order.deliveredAt;")&&html.includes("delete order.closedAt;"), 'correction reopens delivery confirmation without retaining final closure state');
assert(html.includes("lfRecordActivity('تصحيح تأكيد التسليم'"), 'delivery correction is recorded in activity log');
assert(html.includes("تصحيح تأكيد التسليم</button>"), 'delivered orders expose the correction action');
assert(html.includes("لم تتغير الشحنات أو المخزون أو التحصيلات"), 'correction explicitly preserves shipping, stock and collections');

assert(html.includes('...(statusReason?{reason:statusReason}:{})'), 'order status history records the closure reason');
if (process.exitCode) process.exit(process.exitCode);

async function checkDeliveryCorrectionBehavior() {
  const sourceStart = html.indexOf('async function correctDeliveryConfirmation(orderId)');
  const sourceEnd = html.indexOf('function deleteOrder(', sourceStart);
  assert(sourceStart >= 0 && sourceEnd > sourceStart, 'delivery correction implementation can be isolated for behavioral tests');
  if (sourceStart < 0 || sourceEnd <= sourceStart) return;
  const source = html.slice(sourceStart, sourceEnd);
  const original = {
    id: 'delivery-test', status: 'تم التسليم للعميل',
    deliveredAt: '2026-11-18T12:30:00.000Z',
    shippedAt: '2026-11-18T11:00:00.000Z',
    closedAt: '2026-11-18T12:30:00.000Z', closedStatus: 'تم التسليم للعميل',
    shipments: [{ shipmentNumber: 'SH-000123', totalUnits: 4, lines: [{ productId: 'p1', qty: 4 }] }],
    stockIssuedAt: '2026-11-18T11:00:00.000Z', stockIssuedUnits: 4,
    statusHistory: [{ status: 'تم التسليم للعميل', previousStatus: 'تم تسليمه لشركة الشحن', date: '2026-11-18T12:30:00.000Z' }]
  };
  const makeContext = (overrides = {}) => {
    const context = vm.createContext({
      db: { orders: [JSON.parse(JSON.stringify(original))], stockMovements: [{ id: 'stock-1', delta: 0 }], payments: [{ id: 'payment-1', amount: 50 }], activityLog: [] },
      window: { lamsetRequireOwnerPin: async reason => { context.pinReasons.push(reason); return overrides.pinResult !== false; }, LamsetUI: { toast: message => { context.toasts.push(message); } } },
      pinReasons: [], toasts: [], alerts: [], prompts: [], saves: 0, renders: 0,
      prompt: message => { context.prompts.push(message); return overrides.reason === undefined ? 'تصحيح تأكيد تم بالخطأ' : overrides.reason; },
      alert: message => { context.alerts.push(message); },
      save: () => { context.saves++; return overrides.saveResult !== false; },
      renderAll: () => { context.renders++; },
      lfIsDeliveredOrder: order => ['تم التسليم','تم التسليم للعميل'].includes(String(order?.status || '')),
      lfOrderNumber: order => '123',
      lfRecordActivity: (...args) => { context.db.activityLog.unshift({ args }); },
      console: { error: () => {} }
    });
    vm.runInContext(source + '\\nthis.correct=correctDeliveryConfirmation;', context);
    return context;
  };
  const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);

  const success = makeContext();
  const beforeShipments = JSON.stringify(success.db.orders[0].shipments);
  const beforeStock = JSON.stringify(success.db.stockMovements);
  const beforePayments = JSON.stringify(success.db.payments);
  await success.correct('delivery-test');
  const corrected = success.db.orders[0];
  assert(corrected.status === 'تم تسليمه لشركة الشحن', 'successful owner correction returns shipped order to waiting-for-delivery-confirmation');
  assert(!corrected.deliveredAt && !corrected.closedAt && !corrected.closedStatus, 'correction clears only active final-delivery/closure flags');
  assert(corrected.statusHistory.length === 2 && corrected.statusHistory[1].correction === true, 'correction appends a distinct historical event');
  assert(corrected.statusHistory[1].previousDeliveredAt === original.deliveredAt && corrected.statusHistory[1].previousStatus === original.status, 'previous delivery confirmation and status remain auditable');
  assert(corrected.statusHistory[1].reason === 'تصحيح تأكيد تم بالخطأ', 'correction reason is retained');
  assert(same(corrected.shipments, JSON.parse(beforeShipments)) && same(success.db.stockMovements, JSON.parse(beforeStock)) && same(success.db.payments, JSON.parse(beforePayments)), 'correction leaves shipment, stock, and collection records unchanged');
  assert(success.pinReasons.length === 1 && success.saves === 1 && success.renders === 1, 'successful correction verifies owner and saves exactly once');
  assert(success.db.activityLog.length === 1, 'successful correction records an activity entry');

  const duplicate = success.db.orders[0].statusHistory.length;
  await success.correct('delivery-test');
  assert(success.db.orders[0].statusHistory.length === duplicate && success.pinReasons.length === 1, 'duplicate correction attempt is rejected after the order leaves delivered state');

  const denied = makeContext({ pinResult: false });
  await denied.correct('delivery-test');
  assert(denied.db.orders[0].status === original.status && denied.saves === 0, 'incorrect/cancelled owner verification leaves delivery unchanged');

  const noReason = makeContext({ reason: '   ' });
  await noReason.correct('delivery-test');
  assert(noReason.db.orders[0].status === original.status && noReason.pinReasons.length === 0 && noReason.saves === 0, 'missing correction reason is rejected before owner verification or mutation');

  const failedSave = makeContext({ saveResult: false });
  const failedBefore = JSON.stringify(failedSave.db);
  await failedSave.correct('delivery-test');
  assert(failedSave.db.orders[0].status === original.status && !failedSave.db.orders[0].statusHistory.some(x => x.correction), 'failed save rolls back delivery correction and history');
}
checkDeliveryCorrectionBehavior().then(() => {
  if (process.exitCode) process.exit(process.exitCode);
  console.log('Delivery correction behavior checks passed.');
}).catch(error => {
  console.error('Delivery correction behavior check failed:', error);
  process.exitCode = 1;
});

console.log('Order status consistency checks passed.');
