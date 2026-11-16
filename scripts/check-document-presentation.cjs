#!/usr/bin/env node
const fs = require('node:fs');
const html = fs.readFileSync('www/index.html', 'utf8');
function assert(condition, message) {
  if (!condition) {
    console.error('Document presentation check failed: ' + message);
    process.exitCode = 1;
  }
}
function sectionBetween(start, end) {
  const from = html.indexOf(start);
  const to = html.indexOf(end, from + start.length);
  return from >= 0 && to > from ? html.slice(from, to) : '';
}
const invoice = sectionBetween('function invoiceHtml(o)', 'function ensureInvoiceSnapshot(o)');
const receipt = sectionBetween('function paymentReceiptHtml(payment)', 'function previewPaymentReceipt');
const factory = sectionBetween('function factoryOrderHtml(o)', 'function showFactoryOrderSheet');
const catalog = sectionBetween('function catalogHtml(rows', 'function openCatalogDocument');
assert(!!invoice && !!receipt && !!factory && !!catalog, 'all document renderers exist');
assert(!invoice.includes('window.print()') && !/<div class="no-print"[^>]*>[\s\S]*?<button/i.test(invoice), 'sales invoice PDF contains no embedded print button');
assert(!factory.includes('window.print()') && !/<div class="no-print"[^>]*>[\s\S]*?<button/i.test(factory), 'factory PDF contains no embedded print button');
assert(!catalog.includes('window.print()') && !/<p class="no-print"[^>]*>[\s\S]*?<button/i.test(catalog), 'catalog PDF contains no embedded print button');
assert(invoice.includes('إجمالي المدفوع') && invoice.includes('المتبقي'), 'sales invoice keeps payment totals');
assert(receipt.includes("title=payment.kind==='deposit'?'فاتورة تحصيل عربون':'فاتورة تحصيل'"), 'collection document has the collection invoice title');
assert(receipt.includes('money(current)') && receipt.includes('money(collectedAfter)') && receipt.includes('money(remainingAfter)'), 'collection invoice shows payment, cumulative collected, and remaining balance');
assert(receipt.includes('paymentReceiptBalances(payment)'), 'collection invoice uses the existing balance calculation');
assert(html.includes("showDocumentPreview(html,p.kind==='deposit'?'فاتورة تحصيل عربون':'فاتورة تحصيل',false,false,()=>sharePaymentReceiptWhatsApp(paymentId))"), 'collection invoice preview wires WhatsApp to the matching payment');
const genericModal = sectionBetween('<div id="lamsetDocumentPreview"', "const KEY='lamset_fan_business_manager_v1'");
assert(genericModal.indexOf('id="lamsetDocumentFrame"') >= 0 && genericModal.indexOf('id="lamsetDocumentFrame"') < genericModal.indexOf('class="lf-document-footer"'), 'generic document actions are below the document');
assert(genericModal.includes('id="lfDocumentWhatsAppButton"') && genericModal.includes('onclick="printDocumentPreview()"'), 'generic preview has working print and conditional WhatsApp actions');
const invoiceModal = genericModal.slice(genericModal.indexOf('<div id="invoicePreview"'));
assert(invoiceModal.indexOf('id="invoicePreviewFrame"') >= 0 && invoiceModal.indexOf('id="invoicePreviewFrame"') < invoiceModal.indexOf('class="preview-footer"'), 'sales invoice actions are below the invoice');
assert(invoiceModal.includes('id="invoicePreviewPrint"') && invoiceModal.includes('id="invoicePreviewWhatsApp"'), 'sales invoice has print and WhatsApp actions');
assert(html.includes("$('invoicePreviewPrint').onclick=()=>printInvoice(orderId)") && html.includes("$('invoicePreviewWhatsApp').onclick=()=>shareInvoiceWhatsApp(orderId)"), 'sales invoice actions remain wired to their handlers');
assert(html.includes("const interactiveButton=$('lamsetInteractiveCatalogButton')") && html.includes("const whatsAppButton=$('lfDocumentWhatsAppButton')"), 'document preview only exposes actions relevant to the current document');
assert(catalog.includes('font-family:"Tajawal",Tahoma,Arial,sans-serif') && catalog.includes('#0866FF') && catalog.includes('#F0F2F5') && catalog.includes('#65676B'), 'catalog uses the approved Facebook-inspired palette and Tajawal');
assert(html.includes('إصدار الكتالوج') && html.includes('فتح الكتالوج'), 'catalog actions use clear labels');
const allowlist = html.match(/function catalogCustomerRows\(rows\)\s*\{([\s\S]*?)\n\}/)?.[1] || '';
assert(!!allowlist && !/\b(?:cost|unitProfit|profit|margin|productId)\s*:/.test(allowlist), 'catalog customer output excludes internal costs and identifiers');
if (process.exitCode) process.exit(process.exitCode);
console.log('Collection invoice, catalog theme, and document action checks passed.');
