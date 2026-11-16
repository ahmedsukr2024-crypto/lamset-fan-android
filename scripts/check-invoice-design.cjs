#!/usr/bin/env node
const fs = require('node:fs');
const html = fs.readFileSync('www/index.html', 'utf8');
function assert(condition, message) {
  if (!condition) {
    console.error('Invoice design check failed: ' + message);
    process.exitCode = 1;
  }
}
const invoiceStart = html.indexOf('function invoiceHtml(o)');
const invoiceEnd = html.indexOf('function ensureInvoiceSnapshot(o)', invoiceStart);
const invoice = invoiceStart >= 0 && invoiceEnd > invoiceStart ? html.slice(invoiceStart, invoiceEnd) : '';
assert(!!invoice, 'sales invoice renderer exists');
for (const token of [
  '--lf-primary:#0866FF',
  '--lf-page:#F0F2F5',
  '--lf-card:#FFFFFF',
  '--lf-text:#050505',
  '--lf-muted:#65676B',
  '--lf-line:#CED0D4',
  'font-family:"Tajawal"',
  '@page{size:A4;margin:12mm}',
  '.invoice .items th{background:var(--lf-primary)!important;color:#fff!important',
  '.invoice .foot{margin-top:22px;padding:14px 16px;background:var(--lf-primary)!important',
  'إجمالي المدفوع',
  'المتبقي',
  'سجل الدفعات',
  'function previewInvoice'
]) {
  assert(invoice.includes(token) || (token === 'function previewInvoice' && html.includes(token)), 'invoice retains approved design and core content: ' + token);
}
assert(!invoice.includes('#f3bd36') && !invoice.includes('"Cairo"'), 'legacy gold accent and Cairo font are removed from the sales invoice');
if (process.exitCode) process.exit(process.exitCode);
console.log('Invoice design checks passed.');
