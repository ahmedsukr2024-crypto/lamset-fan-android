#!/usr/bin/env node
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('www/index.html', 'utf8');
function assert(value, message) { if (!value) throw new Error(message); }
const shippedStart = html.indexOf('function lfOrderHasShipped(o)');
const shippedEnd = html.indexOf('function lfOrderReservedUnits', shippedStart);
const editStart = html.indexOf('function lfCanEditOrder(o)');
const editEnd = html.indexOf('function editOrder(', editStart);
assert(shippedStart >= 0 && shippedEnd > shippedStart, 'shared shipped-state helper exists');
assert(editStart >= 0 && editEnd > editStart, 'order edit guard exists');
const context = vm.createContext({ paidOnOrder: () => 0, db: { payments: [] } });
vm.runInContext(html.slice(shippedStart, shippedEnd) + '\n' + html.slice(editStart, editEnd), context);
const editable = { id: 'open', status: 'قيد التجهيز' };
assert(context.lfCanEditOrder(editable), 'ordinary unpaid and unshipped order remains editable');
for (const order of [
  { id: 'issued', status: 'قيد التجهيز', stockIssuedAt: '2026-11-18T10:00:00Z' },
  { id: 'migrated', status: 'قيد التجهيز', stockIssueMigrated: true },
  { id: 'shipped-date', status: 'قيد التجهيز', shippedAt: '2026-11-18T10:00:00Z' },
  { id: 'shipped-status', status: 'تم تسليمه لشركة الشحن' },
  { id: 'delivered-date', status: 'قيد التجهيز', deliveredAt: '2026-11-18T11:00:00Z' }
]) { assert(!context.lfCanEditOrder(order), 'shipped or delivered order cannot be edited: ' + order.id); }
const statusStart = html.indexOf('function applyOrderStatusChange(id,s)');
const statusEnd = html.indexOf('function deleteOrder(', statusStart);
assert(statusStart >= 0 && statusEnd > statusStart, 'order status transition handler exists');
const statusSource = html.slice(statusStart, statusEnd);
assert(statusSource.includes('const wasShipped=lfOrderHasShipped(o)'), 'status transitions consult issued/shipped ledger flags');
assert(statusSource.includes('||o.deliveredAt)return alert'), 'delivered timestamp protects a stale status record');
assert(statusSource.includes("if(wasShipped&&!['تم التسليم للعميل','تم التسليم'].includes(s))return alert"), 'issued orders cannot be cancelled or moved back');
const deleteStart = statusEnd + 1;
const deleteEnd = html.indexOf('function offerProductChanged()', deleteStart);
const deleteSource = html.slice(deleteStart, deleteEnd);
assert(deleteSource.includes('if(lfOrderHasShipped(o)||o.deliveredAt)return alert'), 'delete guard protects migrated and issued shipment history');
assert(html.includes('o.statusHistory.push({status:s,previousStatus:previous,date:statusChangedAt'), 'status history appends instead of replacing prior events');

const reviewStart = html.indexOf('function lfReviewOrderBeforeDelivery(o)');
const reviewEnd = html.indexOf('function orderWorkflowSnapshot(o)', reviewStart);
assert(reviewStart >= 0 && reviewEnd > reviewStart, 'final-delivery review helper exists');
const stockLineStart = html.indexOf('function orderStockLines(o)');
const stockLineEnd = html.indexOf('\\n', stockLineStart);
const stockLineSource = stockLineStart >= 0 ? html.slice(stockLineStart, stockLineEnd > stockLineStart ? stockLineEnd : stockLineStart + 2000) : '';
assert(!!stockLineSource, 'canonical order stock-line helper exists for delivery review');
const reviewContext = vm.createContext({ db: { products: [{ id: 'p1', name: 'منتج 1' }] } });
vm.runInContext(stockLineSource + '\\n' + html.slice(reviewStart, reviewEnd) + '\\nthis.review=lfReviewOrderBeforeDelivery;', reviewContext);
const completeUnpaid = { customer: 'عميل', items: [{ productId: 'p1', productName: 'منتج 1', stockUnits: 5, stockDeductedUnits: 5, productionFulfilledUnits: 0, productionPendingUnits: 0 }] };
assert(reviewContext.review(completeUnpaid).ok, 'fully prepared order can be delivered while payment remains outstanding');
assert(!reviewContext.review({ ...completeUnpaid, items: [{ ...completeUnpaid.items[0], productionPendingUnits: 2, stockDeductedUnits: 3 }] }).ok, 'delivery is blocked while production remains pending');
assert(!reviewContext.review({ ...completeUnpaid, items: [{ ...completeUnpaid.items[0], stockDeductedUnits: 3 }] }).ok, 'delivery is blocked when prepared quantity is below required quantity even if pending field is zero');
assert(!reviewContext.review({ ...completeUnpaid, customer: ' ' }).ok, 'delivery is blocked when customer name is missing');
assert(!reviewContext.review({ ...completeUnpaid, items: [{ ...completeUnpaid.items[0], productId: 'missing' }] }).ok, 'delivery is blocked when an order product reference is missing');
assert(!reviewContext.review({ ...completeUnpaid, items: [{ ...completeUnpaid.items[0], stockUnits: 0 }] }).ok, 'delivery is blocked for zero or invalid item quantity');
assert(!reviewContext.review({ ...completeUnpaid, stockIssuedAt: '2026-11-19T10:00:00Z', stockIssuedUnits: 4 }).ok, 'delivery is blocked when recorded issued quantity differs from order total');
assert(reviewContext.review({ ...completeUnpaid, stockIssuedAt: '2026-11-19T10:00:00Z', stockIssueMigrated: true }).ok, 'legacy migrated issue history remains compatible');
const deliveryReviewCall = statusSource.indexOf('lfReviewOrderBeforeDelivery(o)');
const statusSnapshot = statusSource.indexOf('const before=JSON.parse(JSON.stringify(db))');
assert(deliveryReviewCall >= 0 && statusSnapshot > deliveryReviewCall, 'final-delivery review runs before any order or stock mutation');
const reviewSource = html.slice(reviewStart, reviewEnd);
assert(!reviewSource.includes('paidOnOrder') && !reviewSource.includes('orderDue'), 'final delivery review does not require full payment');

console.log('Order shipping history checks passed.');
