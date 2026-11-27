'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const html=fs.readFileSync('www/index.html','utf8');
const css=fs.readFileSync('www/lamset-theme-v3.css','utf8');
const expected=['appearance','products','security','business','branding','notifications'];
assert.match(html,/id="lfSettingsHome" class="lf-settings-home-grid"/,'settings should open on a compact category landing screen');
assert.match(html,/id="lfSettingsDetail" class="lf-settings-detail" hidden/,'settings details should be hidden until a category is selected');
for(const key of expected){
 assert.match(html,new RegExp('data-settings-pane="'+key+'"'),'missing settings category '+key);
 assert.match(html,new RegExp("openLamsetSettingsGroup\\('"+key+"'\\)"),'missing settings tile '+key);
}
assert.match(html,/function\(\)\{'use strict';[\s\S]*window\.openLamsetSettingsGroup=function\(group\)/,'settings category navigation function missing');
assert.match(html,/window\.closeLamsetSettingsGroup=function\(\)/,'settings back navigation missing');
for(const id of ['appearanceMode','uiFontScale','uiDensity','uiSpacing','uiButtonShape','uiButtonEffect','uiCardDensity','reduceMotionSetting','lfProductTypeList','lockAppSetting','protectCostsSetting','bizName','bizAddress','bizPhone','brandAppLogo','brandInvoiceLogo','brandCatalogLogo','brandLauncherIcon','phoneNotifications'])assert.match(html,new RegExp('id="'+id+'"'),'existing setting control missing: '+id);
assert.match(html,/document\.body\.appendChild\(backdrop\);document\.body\.appendChild\(drawer\);/,'drawer and backdrop must be moved outside the app wrapper stacking context');
assert.match(html,/backdrop\.classList\.add\('is-visible'\);drawer\.classList\.add\('is-open'\)/,'drawer open state must still activate both overlay layers');
assert.match(css,/\.lf-drawer-backdrop\{z-index:2147483000!important\}/,'drawer backdrop must overlay application pages');
assert.match(css,/\.lf-side-drawer\{z-index:2147483001!important/,'drawer must render above its backdrop');
assert.match(css,/\.lf-settings-home-grid\{display:grid/,'settings home must use compact category cards');
assert.match(css,/\.lf-settings-pane\[hidden\].*display:none!important/,'inactive settings groups must stay hidden');
console.log('Compact settings navigation, preservation of existing settings, and drawer overlay stacking checks passed.');
