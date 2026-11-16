#!/usr/bin/env node
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('www/index.html', 'utf8');
function assert(condition, message) {
  if (!condition) {
    console.error('Order validation check failed: ' + message);
    process.exitCode = 1;
  }
}
const dateFunction = html.match(/function lfIsValidOrderDate\(value\)\s*\{[\s\S]*?\n\}/)?.[0] || '';
assert(!!dateFunction, 'strict order-date validator exists');
if (dateFunction) {
  const validateDate = vm.runInNewContext(dateFunction + '\nlfIsValidOrderDate');
  assert(validateDate(''), 'empty optional delivery date remains allowed');
  assert(validateDate('2024-02-29'), 'valid leap-day date is accepted');
  assert(validateDate('2026-11-16'), 'valid calendar date is accepted');
  assert(!validateDate('2025-02-29'), 'non-leap February 29 is rejected');
  assert(!validateDate('2026-02-30'), 'impossible calendar day is rejected');
  assert(!validateDate('2026-13-01'), 'invalid month is rejected');
  assert(!validateDate('16-11-2026'), 'incorrect date format is rejected');
}
const saveStart = html.indexOf('function saveOrder()');
const saveEnd = html.indexOf('function lfOrderStatusKey', saveStart);
const saveOrder = saveStart >= 0 && saveEnd > saveStart ? html.slice(saveStart, saveEnd) : '';
assert(!!saveOrder, 'saveOrder function can be inspected');
assert(saveOrder.includes("depositRaw=String($('oDeposit')?.value??'').trim(),deposit=depositRaw===''?0:Number(depositRaw)"), 'deposit is parsed without silently clamping negative values');
assert(saveOrder.includes('!lfIsValidOrderDate(dueValue)'), 'saveOrder applies strict calendar-date validation');
assert(saveOrder.includes('phoneDigits&&(phoneDigits.length<7||phoneDigits.length>15)'), 'entered phone numbers are validated while phone remains optional');
assert(saveOrder.includes('!Number.isSafeInteger(qty)||qty<1'), 'order quantities must be positive safe integers');
assert(saveOrder.includes('!Number.isFinite(price)||price<0'), 'order unit prices must be finite and non-negative');
assert(saveOrder.includes('deposit<0||deposit>total'), 'deposit cannot be negative or exceed the order total');
const existingOrderCheck = saveOrder.indexOf('const existingOrder=editingOrderId?');
const customerMutation = saveOrder.indexOf('let customer=selectedCustomer||phoneOwner||null');
assert(existingOrderCheck >= 0 && customerMutation > existingOrderCheck, 'editing-order existence and eligibility are checked before customer mutation');
const stockPreflight = saveOrder.indexOf('if(existingOrder){for(const line of orderStockLines(existingOrder)){const p=db.products.find(x=>x.id===line.productId);if(!p)return alert');
assert(stockPreflight >= 0 && customerMutation > stockPreflight, 'existing stock references are validated before customer mutation');
if (process.exitCode) process.exit(process.exitCode);
console.log('Order pre-save validation checks passed.');
