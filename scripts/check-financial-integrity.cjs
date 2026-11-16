#!/usr/bin/env node
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('www/index.html', 'utf8');
function assert(condition, message) {
  if (!condition) {
    console.error('Financial integrity check failed: ' + message);
    process.exitCode = 1;
  }
}
function extract(startMarker, endMarker) {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker, start);
  return start >= 0 && end > start ? html.slice(start, end) : '';
}
const helpers = extract('function lfOrderDepositPayment(o)', 'function lamsetAlertSnoozes');
assert(!!helpers, 'order payment and balance helpers exist');
const receiptBalances = extract('function paymentReceiptBalances(payment)', 'function paymentReceiptHtml(payment)');
assert(!!receiptBalances, 'historical payment receipt balance helper exists');
if (helpers && receiptBalances) {
  const sandbox = { db: { orders: [], payments: [], orderCreditSettlements: [] } };
  vm.runInNewContext(helpers + '\n' + receiptBalances, sandbox);
  const order = { id: 'order-1', total: 300, qty: 1, price: 300, deposit: 100, status: 'جديد' };
  sandbox.db.orders.push(order);
  assert(sandbox.paidOnOrder(order) === 100, 'legacy deposit is counted once when no payment ledger entry exists');
  assert(sandbox.orderDue(order) === 200, 'legacy deposit reduces the outstanding balance');
  const deposit = { id: 'deposit-1', orderId: order.id, amount: 100, kind: 'deposit', date: '2026-11-01T09:00:00.000Z' };
  order.depositPaymentId = deposit.id;
  sandbox.db.payments.push(deposit);
  assert(sandbox.paidOnOrder(order) === 100, 'linked deposit ledger entry replaces, rather than duplicates, legacy deposit field');
  assert(sandbox.orderDue(order) === 200, 'linked deposit leaves the correct outstanding balance');
  const first = { id: 'payment-2', orderId: order.id, amount: 50, date: '2026-11-02T09:00:00.000Z' };
  const second = { id: 'payment-3', orderId: order.id, amount: 150, date: '2026-11-03T09:00:00.000Z' };
  sandbox.db.payments.push(first, second);
  assert(sandbox.paidOnOrder(order) === 300, 'deposit and subsequent collections are summed exactly once');
  assert(sandbox.orderDue(order) === 0, 'fully paid order has no remaining balance');
  const firstReceipt = sandbox.paymentReceiptBalances(deposit);
  assert(firstReceipt.previous === 0 && firstReceipt.current === 100 && firstReceipt.collectedAfter === 100 && firstReceipt.remainingAfter === 200, 'deposit receipt shows balance immediately after the deposit');
  const secondReceipt = sandbox.paymentReceiptBalances(first);
  assert(secondReceipt.previous === 100 && secondReceipt.current === 50 && secondReceipt.collectedAfter === 150 && secondReceipt.remainingAfter === 150, 'partial collection receipt uses chronological balance');
  const finalReceipt = sandbox.paymentReceiptBalances(second);
  assert(finalReceipt.previous === 150 && finalReceipt.current === 150 && finalReceipt.collectedAfter === 300 && finalReceipt.remainingAfter === 0, 'final collection receipt closes the balance');
}
const invoice = extract('function invoiceHtml(o)', 'function ');
assert(html.includes('<span>إجمالي المدفوع</span><strong>\'+money(paid)+\'</strong>'), 'invoice summary displays total paid');
assert(html.includes('<span>المتبقي</span><strong>\'+money(due)+\'</strong>'), 'invoice summary displays remaining balance');
const wa = extract('function shareInvoiceWhatsApp(orderId)', 'function openOrderCollection');
assert(wa.includes("'إجمالي المدفوع: '+money(paidOnOrder(o))") && wa.includes("'المتبقي: '+money(orderDue(o))"), 'WhatsApp invoice includes paid and remaining totals');
const collection = extract('function recordPayment(){', 'function paymentReceiptBalances(payment)');
assert(collection.includes('if(window.__lfPaymentSaving)return;'), 'rapid repeated collection clicks are blocked');
assert(collection.includes('if(amount>due)'), 'collection cannot exceed outstanding balance');
assert(collection.indexOf('paymentCommitted=true;') > collection.indexOf('if(!save()){'), 'collection is marked committed only after persistence succeeds');
const catchBlock = collection.slice(collection.indexOf('}catch(error){'), collection.indexOf(' }finally{'));
assert(catchBlock.includes('if(!paymentCommitted)'), 'rollback is restricted to failures before successful persistence');
assert(catchBlock.includes('لا تعاود تسجيل نفس المبلغ'), 'post-save UI failure warns against entering the same collection twice');
if (process.exitCode) process.exit(process.exitCode);
console.log('Financial integrity checks passed.');
