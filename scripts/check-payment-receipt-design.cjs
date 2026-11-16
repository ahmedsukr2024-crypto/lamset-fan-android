#!/usr/bin/env node
const fs = require('node:fs');
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
  'رقم السند:',
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
assert(receipt.includes('esc(amountWords)'), 'amount-in-words output is HTML escaped');
assert(!receipt.includes('تكلفة') && !receipt.includes('ربح') && !receipt.includes('مرتجع'), 'receipt does not expose internal costs, profits, or returns');
if (process.exitCode) process.exit(process.exitCode);
console.log('Payment receipt design checks passed.');
