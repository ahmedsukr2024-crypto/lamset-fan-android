#!/usr/bin/env node
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('www/index.html', 'utf8');
function assert(condition, message) {
  if (!condition) {
    console.error('Post-save safety check failed: ' + message);
    process.exitCode = 1;
  }
}
const start = html.indexOf('async function saveOrder(){');
const end = html.indexOf('function lfOrderStatusKey', start);
const body = start >= 0 && end > start ? html.slice(start, end) : '';
assert(!!body, 'saveOrder implementation exists');
const persisted = body.indexOf("if(!save()){db=before;return alert('تعذر حفظ الطلب");
const committed = body.indexOf('orderCommitted=true;window.__lfLastSavedOrderId=savedOrder.id');
const catchStart = body.indexOf('}catch(err){');
const catchBody = catchStart >= 0 ? body.slice(catchStart, body.indexOf(' finally{', catchStart)) : '';
assert(persisted >= 0 && committed > persisted, 'commit marker is set only after persistent save succeeds');
assert(catchBody.includes('if(before&&!orderCommitted){db=before;save();'), 'rollback is restricted to failures before persistence succeeds');
assert(catchBody.includes('else if(orderCommitted){'), 'post-commit failures preserve the saved order');
assert(catchBody.includes('لم يتم التراجع عن البيانات المحفوظة'), 'post-commit recovery tells the user data remains saved');
assert(body.includes("existingOrder?'تم تعديل الطلب وحفظ التغييرات بنجاح.':'تم تسجيل الطلب الجديد بنجاح.'"), 'success message distinguishes creating from editing');
const wrapper = html.slice(html.indexOf('const lfOriginalSaveOrder=saveOrder;'), html.indexOf('function lfMigrateLegacyOrderDeposits'));
assert(wrapper.includes('window.__lfLastSavedOrderId') && wrapper.includes('localStorage.removeItem(LF_ORDER_FORM_DRAFT_KEY)'), 'local order draft is cleared after either successful create or update');
assert(!wrapper.includes('beforeCount'), 'draft clearing no longer depends only on an increased order count');
const priceHelperStart = html.indexOf('function lfOrderPriceChanges(existingOrder,nextItems)');
const priceHelperEnd = html.indexOf('async function saveOrder()', priceHelperStart);
assert(priceHelperStart >= 0 && priceHelperEnd > priceHelperStart, 'order price comparison helper exists');
const priceContext = vm.createContext({});
vm.runInContext(html.slice(priceHelperStart, priceHelperEnd) + '\nthis.priceChanges=lfOrderPriceChanges;', priceContext);
const previousOrder = { items: [
  { productId: 'p1', unitType: 'piece', productName: 'منتج أول', price: 10 },
  { productId: 'p2', unitType: 'carton', productName: 'منتج ثان', price: 25 }
] };
assert(priceContext.priceChanges(previousOrder, [
  { productId: 'p1', unitType: 'piece', price: 10 },
  { productId: 'p2', unitType: 'carton', price: 25 }
]).length === 0, 'unchanged order prices do not trigger owner approval');
const changedPrices = priceContext.priceChanges(previousOrder, [
  { productId: 'p1', unitType: 'piece', productName: 'منتج أول', price: 12 },
  { productId: 'p2', unitType: 'carton', productName: 'منتج ثان', price: 25 },
  { productId: 'p3', unitType: 'piece', productName: 'منتج جديد', price: 30 }
]);
assert(changedPrices.length === 1 && changedPrices[0].beforePrice === 10 && changedPrices[0].afterPrice === 12, 'only an existing line price change is detected and recorded');
const singleOrder = { id: 'legacy', productId: 'p1', productName: 'منتج قديم', unitType: 'piece', price: 8 };
assert(priceContext.priceChanges(singleOrder, [{ productId: 'p1', unitType: 'piece', price: 9 }]).length === 1, 'legacy single-product orders retain price-change protection');
assert(body.includes('await window.lamsetRequireOwnerPin') && body.includes('سبب تعديل السعر إلزامي'), 'changed order prices require owner PIN and a reason');
assert(body.includes('savedOrder.priceChangeHistory.push(priceChangeEntry)'), 'authorized price changes append to the order history');
assert(body.includes("lfRecordActivity('تعديل أسعار طلب'"), 'authorized price changes are included in activity history');
assert(body.indexOf('await window.lamsetRequireOwnerPin') < body.indexOf('let customer=selectedCustomer'), 'price authorization happens before customer or stock mutations');

if (process.exitCode) process.exit(process.exitCode);
console.log('Post-save commit safety checks passed.');
