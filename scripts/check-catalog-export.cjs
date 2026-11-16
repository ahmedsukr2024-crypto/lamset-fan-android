#!/usr/bin/env node
const fs = require('node:fs');
const html = fs.readFileSync('www/index.html', 'utf8');
const bridge = fs.readFileSync('www/mobile-bridge.js', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
function assert(condition, message) {
  if (!condition) { console.error('Catalog export check failed: ' + message); process.exitCode = 1; }
}
const allowlist = html.match(/function catalogCustomerRows\(rows\)\s*\{([\s\S]*?)\n\}/)?.[1] || '';
assert(!!allowlist, 'customer output allowlist exists');
for (const field of ['name','code','desc','contents','cartonType','image','units','buy','buyCarton','suggest','suggestCarton','showSuggested']) {
  assert(new RegExp('\\b' + field + '\\s*:').test(allowlist), 'allowlist includes ' + field);
}
for (const forbidden of ['cost','unitProfit','profit','margin','suggestedResale','productId']) {
  assert(!new RegExp('\\b' + forbidden + '\\s*:').test(allowlist), 'allowlist excludes ' + forbidden);
}
assert(html.includes('catalogCustomerRows(ready)') && html.includes('catalogCustomerRows(rows)'), 'preview, new edition, and saved editions sanitize rows');
assert(html.includes('lastCatalogPdfHtml=catalogHtml(customerRows'), 'PDF uses sanitized customer HTML');
assert(html.includes('makeInteractiveCatalog(lastCatalogPdfHtml,customerRows,bp)'), 'interactive catalog is built from sanitized rows');
assert(html.includes('id="lamsetCatalogPdfButton"') && html.includes('shareCatalogPdf()'), 'PDF share action is wired');assert(html.includes('window.lamsetShareInteractiveCatalog(lastCatalogInteractiveHtml'), 'interactive catalog uses dedicated native sharing');
assert(bridge.includes('window.lamsetShareInteractiveCatalog = async'), 'dedicated interactive catalog share bridge exists');
assert(bridge.includes("mimeType: 'text/html'") && bridge.includes("dialogTitle: 'مشاركة الكتالوج التفاعلي'"), 'interactive catalog is shared as an HTML attachment');
assert(bridge.includes('اختر واتساب من قائمة المشاركة'), 'sharing guidance tells the user to select WhatsApp');
assert(bridge.includes("import html2pdf from 'html2pdf.js'"), 'PDF renderer is bundled');
assert(bridge.includes("mimeType: 'application/pdf'") && bridge.includes("encoding: 'base64'"), 'PDF is written as a binary PDF attachment');
assert(pkg.dependencies && pkg.dependencies['html2pdf.js'], 'PDF dependency is declared');
if (process.exitCode) process.exit(process.exitCode);
console.log('Catalog customer-data allowlist and PDF export checks passed.');
