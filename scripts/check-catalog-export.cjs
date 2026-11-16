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
function sectionBetween(start, end) {
  const from = html.indexOf(start);
  const to = html.indexOf(end, from + start.length);
  return from >= 0 && to > from ? html.slice(from, to) : '';
}
const createCatalog = sectionBetween('async function printCatalog()', 'function renderCatalogHistory()');
const renderHistory = sectionBetween('function renderCatalogHistory()', 'async function reprintCatalog(');
const reopenCatalog = sectionBetween('async function reprintCatalog(cid)', 'function renderConsignment()');
assert(!!createCatalog && !!renderHistory && !!reopenCatalog, 'catalog history create, list, and reopen functions exist');
assert(/rows\s*,/.test(createCatalog) && /db\.catalogHistory\.unshift\(record\)/.test(createCatalog), 'new catalog history stores a snapshot of the selected rows');
assert(/x\.rows\s*\|\|\s*\[\]/.test(reopenCatalog), 'saved catalog is rebuilt from its stored row snapshot');
assert(/catalogCustomerRows\(rows\)/.test(reopenCatalog), 'reopened catalog rows pass through the customer-data allowlist');
assert(/catalogHtml\(customerRows\s*,\s*x\.type\s*,\s*x\.template\s*,\s*x\.subtitle\s*,\s*bp\)/.test(reopenCatalog), 'reopened HTML/PDF uses the saved catalog type, template, subtitle, and business profile');
assert(/makeInteractiveCatalog\(lastCatalogPdfHtml\s*,\s*customerRows\s*,\s*bp\)/.test(reopenCatalog), 'reopened interactive catalog uses sanitized snapshot rows');
assert(renderHistory.includes('reprintCatalog') && renderHistory.includes('x.id'), 'history entries reopen by saved catalog id');
assert(/catalogCustomerRows\(ready\)/.test(createCatalog), 'new catalog output is sanitized before it is rendered');
assert(html.includes('lastCatalogPdfHtml=catalogHtml(customerRows'), 'PDF uses sanitized customer HTML');
assert(html.includes('makeInteractiveCatalog(lastCatalogPdfHtml,customerRows,bp)'), 'interactive catalog is built from sanitized rows');
assert(html.includes('id="lamsetCatalogPdfButton"') && html.includes('shareCatalogPdf()'), 'PDF share action is wired');assert(html.includes('window.lamsetShareInteractiveCatalog(lastCatalogInteractiveHtml'), 'interactive catalog uses dedicated native sharing');
assert(bridge.includes('window.lamsetShareInteractiveCatalog = async'), 'dedicated interactive catalog share bridge exists');
assert(bridge.includes("mimeType: 'text/html'") && bridge.includes("dialogTitle: 'مشاركة الكتالوج التفاعلي'"), 'interactive catalog is shared as an HTML attachment');
assert(bridge.includes('اختر واتساب من قائمة المشاركة'), 'sharing guidance tells the user to select WhatsApp');
assert(bridge.includes("import html2pdf from 'html2pdf.js'"), 'PDF renderer is bundled');
assert(bridge.includes("mimeType: 'application/pdf'") && bridge.includes("encoding: 'base64'"), 'PDF is written as a binary PDF attachment');
assert(pkg.dependencies && pkg.dependencies['html2pdf.js'], 'PDF dependency is declared');
const priceKeyFunction = html.match(/function catalogPriceKey\(type\)\s*\{([^}]+)\}/)?.[1] || '';
assert(!!priceKeyFunction, 'central customer price-key mapper exists');
assert(/type\s*===\s*'online'\s*\?\s*'retail'/.test(priceKeyFunction), 'online customers use the retail product price');
assert(/type\s*===\s*'trader'\s*\?\s*'wholesale'/.test(priceKeyFunction), 'trader pricing remains mapped to wholesale');
assert(/type\s*===\s*'distributor'\s*\?\s*'distributor'/.test(priceKeyFunction), 'distributor pricing remains mapped to distributor');
assert(/type\s*===\s*'retail'\s*\?\s*'retail'/.test(priceKeyFunction), 'retail pricing remains mapped to retail');
const orderPriceSuggestion = html.slice(html.indexOf('function suggestOrderPrice()'), html.indexOf('function refreshOrderCustomerPricing()'));
const orderPriceRefresh = html.slice(html.indexOf('function refreshOrderCustomerPricing()'), html.indexOf('function addOrderItem()'));
assert(orderPriceSuggestion.includes('catalogPriceKey(type)'), 'order price suggestion uses the central customer price mapping');
assert(orderPriceRefresh.includes('catalogPriceKey(type)'), 'existing order cart refresh uses the central customer price mapping');
assert(/let priceKey=catalogPriceKey\(customerType\)/.test(html), 'WhatsApp order import uses the central customer price mapping');
assert(/id="oDepositMethod"/.test(html) && /<option value="نقدي" selected>نقدي<\/option>/.test(html), 'order form has a cash-default deposit payment method');
assert(/function lfOrderDepositPayment\(o\)/.test(html), 'deposit payment lookup is centralized');
assert(/function paidOnOrder\(o\)\{return \(lfOrderDepositPayment\(o\)\?0:/.test(html), 'legacy deposit is excluded after a matching ledger entry exists');
assert(/function lfMigrateLegacyOrderDeposits\(\)/.test(html) && /legacyMigration:true/.test(html), 'legacy deposits migrate to the unified ledger with an audit marker');
assert(/order\.depositMethod\):'غير محدد'/.test(html), 'legacy deposits without a recorded method are not falsely labeled as cash');
assert(/if\(lamsetDataReady\)lfMigrateLegacyOrderDeposits\(\)/.test(html), 'legacy deposit migration runs after successful data load');
assert(/kind:'deposit'/.test(html) && /savedOrder\.depositPaymentId=depositPayment\.id/.test(html), 'new order deposits create a linked ledger payment');
assert(/lfOrderDepositPayment\(o\)\?0:Math\.max\(0,Number\(o\.deposit\)\|\|0\)/.test(html), 'payment receipt balances avoid counting migrated deposits twice');
assert(/payment\.kind==='deposit'\?'إيصال عربون':'إيصال تحصيل'/.test(html), 'deposit receipts are identified separately');
assert(/p\.kind==='deposit'\?'العربون':'الدفعة'/.test(html), 'WhatsApp deposit receipt identifies the deposit amount');
assert(/lfOrderDraftFields=\[[^\]]*oDepositMethod/.test(html), 'deposit method is included in draft recovery and form events');
if (process.exitCode) process.exit(process.exitCode);
console.log('Catalog customer-data allowlist, saved-history, and PDF export checks passed.');
