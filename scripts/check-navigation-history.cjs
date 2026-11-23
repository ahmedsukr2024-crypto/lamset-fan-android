'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const html = fs.readFileSync('www/index.html', 'utf8');
const bridge = fs.readFileSync('www/mobile-bridge.js', 'utf8');
const designSystem = fs.readFileSync('www/lamset-design-system.css', 'utf8');

assert.match(html, /function lfCaptureNavigationSnapshot\(page\)/, 'يجب حفظ حالة الصفحة قبل مغادرتها');
assert.match(html, /function lfRestoreNavigationSnapshot\(page\)/, 'يجب استعادة حالة الصفحة عند الرجوع');
assert.match(html, /const lfPageNavigationStack=\[\]/, 'يجب الاحتفاظ بمسار الصفحات السابق مستقلاً عن النوافذ المنبثقة');
assert.match(html, /lfPageNavigationStack\.push\(t\)/, 'يجب إضافة الصفحة الجديدة إلى سجل الرجوع');
assert.match(html, /lfPageNavigationStack\.pop\(\)/, 'يجب استعادة الصفحة السابقة عند ضغط رجوع Android');
assert.match(html, /if\(typeof closeTopmostModal==='function'&&closeTopmostModal\(\)\)return true;[\s\S]*lfPageNavigationStack\.length>1/, 'يجب إغلاق النافذة المنبثقة أولاً ثم الرجوع للصفحة السابقة');
assert.match(html, /if\(lfPageNavigationStack\.length>1\)\{try\{history\.back\(\);return true/, 'يجب ترك popstate ينفذ الرجوع مرة واحدة دون تغيير الصفحة يدوياً قبل الرجوع');
assert.doesNotMatch(html, /tab\(previous,\{fromHistory:true\}\);try\{if\(history\.state\?\.lamsetPage!==previous\)history\.back\(\)/, 'يجب منع ازدواج الرجوع اليدوي مع popstate');
assert.match(html, /lfCaptureNavigationSnapshot\(previous\)/, 'يجب التقاط حالة الصفحة السابقة');
assert.match(html, /lfRestoreNavigationSnapshot\(t\)/, 'يجب استعادة الحالة بعد إعادة عرض الصفحة');
assert.match(html, /history\.pushState\(\{\.\.\.\(history\.state\|\|\{\}\),lamsetPage:t\}/, 'يجب تسجيل كل انتقال صفحة في سجل المتصفح');
assert.match(html, /addEventListener\('popstate',event=>[\s\S]*event\.state\?\.lamsetPage/, 'يجب الرجوع إلى الصفحة المحددة في سجل التنقل');
assert.match(html, /popstate',event=>\{const drawer=document\.getElementById\('lfSideDrawer'\);if\(drawer\?\.classList\.contains\('is-open'\)[\s\S]*closeLamsetDrawer\(true\)/, 'يجب إغلاق القائمة عند الرجوع دون استهلاك خطوة صفحة');
assert.doesNotMatch(html, /history\.pushState\(\{lamsetOverlay:'drawer'/, 'يجب ألا تضيف القائمة الجانبية خطوة زائفة إلى سجل الصفحات');
assert.match(html, /popstate',event=>\{const drawer=document\.getElementById\('lfSideDrawer'\);if\(drawer\?\.classList\.contains\('is-open'\)[\s\S]*closeLamsetDrawer\(true\);const route=event\.state\?\.lamsetPage/, 'يجب إغلاق القائمة ومزامنة مسار الصفحات دون فقدان خطوة');
assert.match(html, /lfPageNavigationStack\.lastIndexOf\(route\)/, 'يجب مزامنة سجل الصفحات مع الرجوع عبر سجل المتصفح');
assert.match(html, /window\.lamsetHandleBack=function\(\)\{if\(closeDrawer\(\)\)return true;[\s\S]*previousBack\(\)/, 'يجب إغلاق القائمة الجانبية قبل تمرير الرجوع إلى سجل الصفحات');
assert.match(html, /closeTopmostModal\(\)/, 'يجب إغلاق النافذة المنبثقة قبل مغادرة الصفحة');
assert.match(html, /const visibleDialog=\[\.\.\.document\.querySelectorAll\('\[role="dialog"\]'\)\]\.reverse\(\)\.find\(el=>!el\.closest\('#lfSideDrawer'\)&&el\.getAttribute\('aria-hidden'\)!=='true'&&!el\.classList\.contains\('hidden'\)&&getComputedStyle\(el\)\.display!=='none'\)/, 'يجب اكتشاف أي نافذة حوار ظاهرة قبل الرجوع حتى لو لم تكن ضمن النوافذ المعروفة');
assert.match(html, /if\(visibleDialog\)\{const closer=visibleDialog\.querySelector\('\[aria-label\*="إغلاق"\],\.lf-modal-close,button\.ghost'\);if\(closer\)\{closer\.click\(\);return true\}\}/, 'يجب إغلاق النافذة الظاهرة عبر زر الإغلاق الخاص بها قبل مغادرة الصفحة');
assert.match(html, /id="lfShipmentModal" class="lf-order-status-overlay" role="dialog"/, 'نافذة تسجيل الشحنة يجب أن تكون معرّفة كنافذة حوار قابلة للإغلاق بزر الرجوع');
assert.match(html, /function closeOrderShipmentModal\(\)/, 'يجب توفير إجراء إغلاق لنافذة تسجيل الشحنة');
assert.match(bridge, /App\.addListener\('backButton'[\s\S]*window\.lamsetHandleBack\(\)/, 'يجب ربط زر الرجوع الفعلي في Android بالنظام الموحد');
assert.match(html, /lf-header-actions[\s\S]*lf-app-brand/, 'يجب وجود مجموعة الأزرار والشعار في الهيدر');
const headerMenu=html.indexOf('id="lfMenuToggle"'),headerSettings=html.indexOf('id="lfHeaderSettings"'),headerAlerts=html.indexOf('id="lfHeaderAlerts"'),headerSearch=html.indexOf('id="lfHeaderSearch"'),headerBrand=html.indexOf('<div class="lf-app-brand">');
assert.ok(headerMenu<headerSettings&&headerSettings<headerAlerts&&headerAlerts<headerSearch&&headerSearch<headerBrand, 'ترتيب الهيدر من اليمين لليسار يجب أن يكون القائمة ثم الإعدادات ثم التنبيهات ثم البحث ثم الشعار');
assert.match(html, /id="lfMenuToggle"[^>]*>[\s\S]*?<svg class="lf-header-svg"/, 'يجب تضمين أيقونة القائمة مباشرة حتى لا تختفي إذا تأخر تحميل الأيقونات');
assert.match(html, /id="lfHeaderSettings"[^>]*>[\s\S]*?<svg class="lf-header-svg"/, 'يجب تضمين أيقونة الإعدادات مباشرة');
assert.match(html, /id="lfHeaderAlerts"[^>]*>[\s\S]*?<svg class="lf-header-svg"/, 'يجب تضمين أيقونة التنبيهات مباشرة');
assert.match(html, /id="lfHeaderSearch"[^>]*>[\s\S]*?<svg class="lf-header-svg"/, 'يجب تضمين أيقونة البحث مباشرة');
assert.match(html, /id="lf-header-final-icons-v6"[\s\S]*?border-radius:0!important[\s\S]*?background:transparent!important[\s\S]*?html\[data-theme="dark"\]/, 'يجب إزالة الدوائر وضبط تباين الأيقونات في الوضعين الفاتح والداكن');
assert.doesNotMatch(html, /lf-drawer-alert-link|id="lfHeaderAlerts"[^>]*class="lf-drawer-link/, 'يجب ألا يكون مركز التنبيهات مخفياً داخل القائمة الجانبية');

assert.equal((html.match(/data-nav-target="production" data-scroll-target="stockDashboard"/g)||[]).length,1,'يجب توفير اختصار مستقل للمخزون داخل المزيد دون إنشاء صفحة مخزون مكررة');
assert.match(html,/data-nav-target="production" data-scroll-target="stockDashboard"[^>]*onclick="setStockView\('overview'\)"/,'اختصار المخزون يجب أن يفتح عرض المخزون الحالي ثم ينتقل إليه داخل صفحة التصنيع');
assert.match(html,/id="stockDashboard"/,'اختصار المخزون يجب أن يشير إلى لوحة المخزون الحالية');
assert.match(html, /id="lfHeaderAlertCount"/, 'يجب الحفاظ على عداد التنبيهات الظاهر');
assert.match(designSystem, /#lfStockAdjustModal,[\s\S]*?#invoicePreview,[\s\S]*?#productDetailModal,[\s\S]*?\.lf-order-status-overlay\s*\{\s*z-index:1000!important;/, 'يجب أن تظهر نوافذ المخزون والفاتورة والمنتج وحالة الطلب فوق الهيدر والشريط السفلي الثابتين');
assert.match(html, /dispatchEvent\(new Event\('change',\{bubbles:true\}\)\)/, 'يجب تحديث العروض التابعة بعد استعادة قيم الحقول');

assert.match(designSystem, /:root\\s*\\{\\s*--lf-z-modal:1000\\s*\\}/, 'يجب تعريف مستوى موحد للنوافذ المنبثقة');
assert.match(designSystem, /\\[role="dialog"\\]\\[aria-modal="true"\\]\\s*\\{\\s*z-index:var\\(--lf-z-modal\\)!important;\\s*\\}/, 'أي نافذة حوار مستقبلية تحمل role=dialog وaria-modal=true ترث مستوى النوافذ الموحد');
assert.match(designSystem, /#lamsetDocumentPreview\\s*\\{\\s*z-index:1200!important;\\s*\\}/, 'يجب أن تظل معاينة المستند أعلى من النوافذ العادية');
assert.match(designSystem, /#lfGlobalSearchModal\\s*\\{\\s*z-index:10000!important;\\s*\\}/, 'يجب الحفاظ على أولوية البحث العام');
assert.match(designSystem, /#lf-system-message\\s*\\{\\s*z-index:2147483647!important;\\s*\\}/, 'يجب الحفاظ على أولوية رسائل النظام');
assert.match(designSystem, /\\.lf-toast-region\\s*\\{\\s*z-index:2147483000!important;\\s*\\}/, 'يجب الحفاظ على طبقة الإشعارات');
assert.match(designSystem, /\\.lf-app-header\\s*\\{[\\s\\S]*?z-index:100!important;/, 'يجب بقاء الهيدر في طبقته الأصلية');
assert.match(designSystem, /\\.nav\\s*\\{[\\s\\S]*?z-index:200!important;/, 'يجب بقاء الشريط السفلي أعلى الهيدر وقبل النوافذ');
for (const id of ['productDetailModal','lfStockAdjustModal','lfOrderStatusModal','lfShipmentModal','lamsetDocumentPreview','invoicePreview']) {
  const root = html.match(new RegExp('<div\\b(?=[^>]*\\bid="'+id+'")[^>]*>', 'i'))?.[0] || '';
  assert.match(root, /role="dialog"/, 'يجب تعريف النافذة '+id+' كحوار');
  assert.match(root, /aria-modal="true"/, 'يجب تعريف النافذة '+id+' كحوار modal');
}
assert.match(html, /id="invoicePreview"[^>]*role="dialog"[^>]*aria-modal="true"/, 'معاينة الفاتورة يجب أن تدخل ضمن نظام الطبقات الموحد');
assert.match(html, /role="dialog" aria-modal="true" aria-labelledby="lfGlobalSearchTitle"/, 'نافذة البحث يجب أن تحتفظ بتعريف الحوار');

console.log('Smart navigation checks passed.');
