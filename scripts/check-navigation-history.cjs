'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const html = fs.readFileSync('www/index.html', 'utf8');
const bridge = fs.readFileSync('www/mobile-bridge.js', 'utf8');

assert.match(html, /function lfCaptureNavigationSnapshot\(page\)/, 'يجب حفظ حالة الصفحة قبل مغادرتها');
assert.match(html, /function lfRestoreNavigationSnapshot\(page\)/, 'يجب استعادة حالة الصفحة عند الرجوع');
assert.match(html, /lfCaptureNavigationSnapshot\(previous\)/, 'يجب التقاط حالة الصفحة السابقة');
assert.match(html, /lfRestoreNavigationSnapshot\(t\)/, 'يجب استعادة الحالة بعد إعادة عرض الصفحة');
assert.match(html, /history\.pushState\(\{\.\.\.\(history\.state\|\|\{\}\),lamsetPage:t\}/, 'يجب تسجيل كل انتقال صفحة في سجل المتصفح');
assert.match(html, /addEventListener\('popstate',event=>[\s\S]*event\.state\?\.lamsetPage/, 'يجب الرجوع إلى الصفحة المحددة في سجل التنقل');
assert.match(html, /window\.lamsetHandleBack=function\(\)[\s\S]*history\.back\(\)/, 'يجب أن يستخدم زر الرجوع سجل الصفحات');
assert.match(html, /closeTopmostModal\(\)/, 'يجب إغلاق النافذة المنبثقة قبل مغادرة الصفحة');
assert.match(bridge, /window\.lamsetHandleBack\(\)/, 'يجب توصيل زر رجوع Android بالنظام الموحد');
assert.match(html, /dispatchEvent\(new Event\('change',\{bubbles:true\}\)\)/, 'يجب تحديث العروض التابعة بعد استعادة قيم الحقول');
console.log('Smart navigation checks passed.');
