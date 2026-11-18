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
console.log('Order shipping history checks passed.');
