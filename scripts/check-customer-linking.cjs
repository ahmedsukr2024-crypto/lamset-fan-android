#!/usr/bin/env node
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('www/index.html', 'utf8');
let failed = false;
function assert(condition, message) {
  if (!condition) {
    failed = true;
    console.error('Customer linking check failed: ' + message);
  }
}
const helperStart = html.indexOf('function customerPhoneDigits(');
const helperEnd = html.indexOf('function renderCustomers()', helperStart);
const helperSource = helperStart >= 0 && helperEnd > helperStart
  ? html.slice(helperStart, helperEnd)
  : '';
assert(!!helperSource, 'customer phone matching helpers exist');
if (helperSource) {
  const context = vm.createContext({ db: { customers: [], orders: [] } });
  vm.runInContext(helperSource + '\nthis.api={customerPhoneDigits,customerPhoneMatchKey,findUniqueCustomerByPhone,customerOrderMatches,linkLegacyOrdersToCustomer};', context);
  const api = context.api;

  const egyptianVariants = [
    '01012345678',
    '+20 10 1234 5678',
    '0020-10-1234-5678',
    '10 1234 5678'
  ];
  const keys = egyptianVariants.map(value => api.customerPhoneMatchKey(value));
  assert(keys.every(key => key === '201012345678'), 'Egyptian local, international, 00-prefixed and formatted phone variants normalize equally');
  assert(api.customerPhoneMatchKey('+966 50 123 4567') === '966501234567', 'international numbers outside Egypt retain their country code');

  const c1 = { id: 'c1', phone: '+20 10 1234 5678' };
  const c2 = { id: 'c2', phone: '+20 11 1234 5678' };
  context.db.customers = [c1, c2];
  assert(api.findUniqueCustomerByPhone('01012345678')?.id === 'c1', 'unique legacy local phone resolves to the correct customer');
  assert(api.customerOrderMatches({ phone: '0020 10 1234 5678' }, c1), 'legacy order matches a unique customer despite formatting differences');
  assert(!api.customerOrderMatches({ phone: '01012345678', customerId: 'c2' }, c1), 'existing customerId takes precedence over a matching phone');

  context.db.orders = [
    { id: 'legacy', phone: '010 1234 5678' },
    { id: 'already-linked', phone: '01012345678', customerId: 'c2' },
    { id: 'unrelated', phone: '01099999999' }
  ];
  const originalPhone = context.db.orders[0].phone;
  const linked = api.linkLegacyOrdersToCustomer(c1, '01012345678', true);
  assert(linked === 1 && context.db.orders[0].customerId === 'c1', 'unique previous phone links the matching legacy order');
  assert(context.db.orders[0].phone === originalPhone, 'linking never rewrites the historical phone stored on an order');
  assert(context.db.orders[1].customerId === 'c2', 'linking never changes an existing customerId');
  assert(!context.db.orders[2].customerId, 'unrelated legacy orders remain unlinked');

  const ambiguousCustomerA = { id: 'a', phone: '+201012345678' };
  const ambiguousCustomerB = { id: 'b', phone: '010 1234 5678' };
  context.db.customers = [ambiguousCustomerA, ambiguousCustomerB];
  context.db.orders = [{ id: 'ambiguous-legacy', phone: '00201012345678' }];
  assert(api.findUniqueCustomerByPhone('01012345678') === null, 'duplicate normalized phone matches are treated as ambiguous');
  assert(!api.customerOrderMatches(context.db.orders[0], ambiguousCustomerA), 'ambiguous legacy phone is not attributed to either customer');
  ambiguousCustomerA.phone = '+201112345678';
  const ambiguousLinked = api.linkLegacyOrdersToCustomer(ambiguousCustomerA, '01012345678', false);
  assert(ambiguousLinked === 0 && !context.db.orders[0].customerId, 'ambiguous previous phone is never auto-linked after a customer phone edit');

  const newCustomer = { id: 'new', phone: '+20 10 1234 5678' };
  context.db.customers = [newCustomer];
  context.db.orders = [{ id: 'new-phone-legacy', phone: '010-1234-5678' }];
  const currentLinked = api.linkLegacyOrdersToCustomer(newCustomer, '', false);
  assert(currentLinked === 1 && context.db.orders[0].customerId === 'new', 'a unique current phone can link legacy orders when adding a customer');

  const duplicateCurrent = { id: 'duplicate', phone: '01012345678' };
  context.db.customers = [newCustomer, duplicateCurrent];
  context.db.orders = [{ id: 'ambiguous-current', phone: '+201012345678' }];
  const duplicateLinked = api.linkLegacyOrdersToCustomer(newCustomer, '', false);
  assert(duplicateLinked === 0 && !context.db.orders[0].customerId, 'duplicate current phone never triggers automatic linking');
}

const saveCustomerStart = html.indexOf('function saveCustomerForm()');
const saveCustomerEnd = html.indexOf('function cancelCustomerForm()', saveCustomerStart);
const saveCustomer = saveCustomerStart >= 0 && saveCustomerEnd > saveCustomerStart
  ? html.slice(saveCustomerStart, saveCustomerEnd)
  : '';
assert(!!saveCustomer, 'customer form save function exists');
assert(saveCustomer.includes('const previousPhoneOwner=findUniqueCustomerByPhone(previousPhone);'), 'previous phone uniqueness is checked before editing the customer');
assert(saveCustomer.includes('linkLegacyOrdersToCustomer(c,previousPhone,previousPhoneOwner?.id===c.id);'), 'customer save uses guarded legacy-order linking');
assert(!saveCustomer.includes('o.phone===previousPhone'), 'customer save does not rely on exact historical phone string equality');

const orderStart = html.indexOf('function saveOrder()');
const orderEnd = html.indexOf('function orderReturnLines', orderStart);
const saveOrder = orderStart >= 0 && orderEnd > orderStart ? html.slice(orderStart, orderEnd) : '';
assert(saveOrder.includes('customerPhoneMatchKey(enteredPhone)'), 'new order customer lookup uses normalized phone keys');
assert(saveOrder.includes('customerPhoneMatchKey(c.phone)===phoneMatchKey'), 'new order lookup compares normalized customer phone keys');

const startupStart = html.indexOf('const lamsetDataReady=load()');
const startupEnd = html.indexOf('renderAutoBackupSettings()', startupStart);
const startup = startupStart >= 0 && startupEnd > startupStart
  ? html.slice(startupStart, startupEnd)
  : '';
assert(!!startup, 'startup legacy-order migration can be inspected');
assert(startup.includes("if(!o.customerId&&o.phone){let c=findUniqueCustomerByPhone(o.phone);if(c)o.customerId=c.id}"), 'startup links only to a uniquely matched customer phone');
assert(!startup.includes('x.phone===o.phone'), 'startup never selects the first customer by exact phone');
assert(!startup.includes('x.name===o.customer'), 'startup never auto-links an order by customer name alone');
assert(!startup.includes("name:o.customer||'عميل سابق'"), 'startup does not create guessed customer profiles from ambiguous legacy orders');

const invoiceStart = html.indexOf('function ensureInvoiceSnapshot(');
const invoiceEnd = html.indexOf('function previewInvoice(', invoiceStart + 'function ensureInvoiceSnapshot('.length);
const invoice = invoiceStart >= 0 && invoiceEnd > invoiceStart ? html.slice(invoiceStart, invoiceEnd) : '';
assert(invoice.includes('findUniqueCustomerByPhone(phone)'), 'invoice snapshot fallback uses unique customer matching');
assert(invoice.includes('o.customerId?null:findUniqueCustomerByPhone(phone)'), 'invoice snapshot never overrides an existing customerId');

if (failed) process.exit(1);
console.log('Customer linking and historical phone safety checks passed.');
