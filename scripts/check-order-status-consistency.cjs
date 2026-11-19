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
  const context = vm.createContext({ orderStockLines: () => [] });
  vm.runInContext(statusSource + '\nthis.api={lfOrderStatusKey,lfIsDeliveredOrder,lfIsCancelledOrder,lfIsArchivedOrder,orderWorkflowSnapshot,orderStageTrackerHtml};', context);
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
console.log('Order status consistency checks passed.');
