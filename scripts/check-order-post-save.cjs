#!/usr/bin/env node
const fs = require('node:fs');
const html = fs.readFileSync('www/index.html', 'utf8');
function assert(condition, message) {
  if (!condition) {
    console.error('Post-save safety check failed: ' + message);
    process.exitCode = 1;
  }
}
const start = html.indexOf('function saveOrder(){');
const end = html.indexOf('function orderReturnLines', start);
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
if (process.exitCode) process.exit(process.exitCode);
console.log('Post-save commit safety checks passed.');
