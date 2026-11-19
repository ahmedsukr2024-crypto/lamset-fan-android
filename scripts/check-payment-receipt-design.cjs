#!/usr/bin/env node
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('www/index.html', 'utf8');
function assert(condition, message) {
  if (!condition) {
    console.error('Payment receipt design check failed: ' + message);
    process.exitCode = 1;
  }
}
const start = html.indexOf('function paymentReceiptAmountWords');
const end = html.indexOf('function previewPaymentReceipt', start);
const receipt = start >= 0 && end > start ? html.slice(start, end) : '';
assert(!!receipt, 'payment receipt renderer and amount-in-words helper exist');
for (const token of [
  '--receipt-blue:#0866FF',
  '--receipt-page:#F0F2F5',
  '--receipt-card:#FFFFFF',
  '--receipt-ink:#050505',
  '--receipt-muted:#65676B',
  '--receipt-line:#CED0D4',
  'font-family:"Tajawal"',
  '@page{size:A5 portrait;margin:10mm}',
  'فاتورة تحصيل عربون',
  'رقم إيصال التحصيل:',
  'رقم الطلب',
  'رقم الفاتورة',
  'المبلغ المستلم بهذه العملية',
  'المحصل قبل هذه الدفعة',
  'إجمالي المحصل بعد الدفعة',
  'المتبقي بعد هذه الدفعة',
  'طريقة الدفع',
  'توقيع المستلم',
  'الختم',
  'function paymentReceiptBalances(payment)',
  'function sharePaymentReceiptWhatsApp(paymentId)'
]) {
  assert(receipt.includes(token) || html.includes(token), 'receipt retains required identity and information: ' + token);
}
assert(receipt.includes('paymentReceiptBalances(payment)'), 'receipt uses the existing payment balance calculation');
assert(receipt.includes('paymentReceiptAmountWords(current)'), 'receipt shows the collected amount in Arabic words');
assert(receipt.includes('payment.receiptNumber||payment.id'), 'printed receipt uses the immutable serial number');
assert(receipt.includes("payment.status==='cancelled'") && receipt.includes('payment.cancelReason'), 'cancelled receipt remains printable with a clear cancellation stamp and reason');
assert(receipt.includes('esc(amountWords)'), 'amount-in-words output is HTML escaped');
assert(!receipt.includes('تكلفة') && !receipt.includes('ربح') && !receipt.includes('مرتجع'), 'receipt does not expose internal costs, profits, or returns');

const serialStart=html.indexOf('function lfNextPaymentReceiptNumber');
const serialEnd=html.indexOf('function renderCollections',serialStart);
const serialSource=serialStart>=0&&serialEnd>serialStart?html.slice(serialStart,serialEnd):'';
assert(serialSource.includes("lfNextSequenceNumber(db.payments||[],'receiptNumber','RCPT')"),'receipt serials use an independent RCPT sequence');
assert(serialSource.includes("seen.has(number)"),'receipt migration detects duplicate serials');
assert(serialSource.includes("payment.receiptNumber=lfNextPaymentReceiptNumber()"),'missing or duplicate legacy serials are repaired');
const paymentStart=html.indexOf('async function recordPayment()');
const paymentEnd=html.indexOf('async function cancelPayment',paymentStart);
const paymentSource=paymentStart>=0&&paymentEnd>paymentStart?html.slice(paymentStart,paymentEnd):'';
assert(paymentSource.includes('receiptNumber:lfNextPaymentReceiptNumber()'),'each new collection receives its own serial');
assert(html.includes("receiptNumber:lfNextPaymentReceiptNumber(),orderId:savedOrder.id")&&html.includes("kind:'deposit',status:'active'"),'new order deposits receive a serial immediately');
assert(html.includes("receiptNumber:lfNextPaymentReceiptNumber(),orderId:order.id")&&html.includes('legacyMigration:true'),'legacy migrated deposits receive a serial when created');
assert(html.includes('lfMigrateLegacyOrderDeposits();lfEnsurePaymentReceiptNumbers();lfMigrateStockReservations(db)'),'startup assigns serials to all legacy receipts before the UI is rendered');
assert(paymentSource.includes('window.__lfPaymentSaving'),'duplicate payment submission is guarded');
assert(paymentSource.includes("payment.status='cancelled'")===false,'new collection action does not silently cancel existing receipts');
const cancelStart=html.indexOf('async function cancelPayment');
const cancelEnd=html.indexOf('function paymentReceiptAmountWords',cancelStart);
const cancelSource=cancelStart>=0&&cancelEnd>cancelStart?html.slice(cancelStart,cancelEnd):'';
assert(cancelSource.includes("payment.status='cancelled'"),'cancellation marks the existing receipt instead of deleting it');
assert(cancelSource.includes('payment.receiptNumber||'), 'cancellation confirmation retains the original receipt number');
assert(html.includes('[p.receiptNumber,p.id,customer,invoice,o?.orderNumber,p.amount,p.method,p.note,p.cancelReason]'),'payment history search includes the receipt serial');
assert(html.includes('previewPaymentReceipt(paymentId)')&&html.includes('onclick=\"lamsetRunButtonAction(this,()=>previewPaymentReceipt('),'receipt history offers viewing and reprinting');

const runtimeSerialStart=html.indexOf('function lfNextSequenceNumber');
const runtimeSerialEnd=html.indexOf('function renderCollections',runtimeSerialStart);
const serialRuntime=runtimeSerialStart>=0&&runtimeSerialEnd>runtimeSerialStart?html.slice(runtimeSerialStart,runtimeSerialEnd):'';
assert(!!serialRuntime,'receipt serial generation and legacy repair helpers can be isolated for runtime testing');
if(serialRuntime){
 const context={db:{payments:[
  {id:'p1',receiptNumber:'RCPT-000001',status:'active'},
  {id:'p2',receiptNumber:'RCPT-000001',status:'cancelled'},
  {id:'p3',status:'active'},
  {id:'p4',receiptNumber:'RCPT-000004',status:'active'},
  {id:'p5',receiptNumber:'BAD-000005',status:'active'}
 ]},save:()=>true,console};
 vm.runInNewContext(serialRuntime+'\nthis.serialApi={lfNextPaymentReceiptNumber,lfEnsurePaymentReceiptNumbers};',context);
 const api=context.serialApi;
 const originalCancelledNumber=context.db.payments[1].receiptNumber;
 const repaired=api.lfEnsurePaymentReceiptNumbers();
 const numbers=context.db.payments.map(x=>x.receiptNumber);
 assert(repaired===true,'legacy missing, malformed, and duplicate receipt serials are repaired and persisted');
 assert(new Set(numbers).size===numbers.length,'all receipt serials are unique after migration');
 assert(context.db.payments[0].receiptNumber==='RCPT-000001','first valid historical serial remains unchanged');
 assert(context.db.payments[1].receiptNumber!==originalCancelledNumber&&context.db.payments[1].status==='cancelled','duplicate cancelled receipt is assigned a new unique serial without being reactivated');
 assert(context.db.payments[3].receiptNumber==='RCPT-000004','later valid historical serial remains unchanged');
 const snapshot=numbers.join(',');
 assert(api.lfEnsurePaymentReceiptNumbers()===false,'repeated receipt migration is idempotent');
 assert(context.db.payments.map(x=>x.receiptNumber).join(',')===snapshot,'reopening history never changes already assigned serials');
 assert(api.lfNextPaymentReceiptNumber()==='RCPT-000008','next receipt sequence follows the highest retained serial, including cancelled receipts');
}
if (process.exitCode) process.exit(process.exitCode);
console.log('Payment receipt design checks passed.');
