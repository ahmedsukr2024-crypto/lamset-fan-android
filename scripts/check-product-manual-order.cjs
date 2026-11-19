const fs=require('node:fs');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const html=fs.readFileSync('www/index.html','utf8');
const css=fs.readFileSync('www/lamset-theme-polish.css','utf8');
assert.match(html,/<select id="productSort"[\s\S]*?<option value="manual">ترتيب يدوي<\/option>/,'manual sort option must be available');
assert.match(html,/sort==='manual'[\s\S]{0,180}\?\(Number\(a\.sortOrder\?\?db\.products\.indexOf\(a\)\)/,'manual sort must use persisted sortOrder with stable original-order fallback');
assert.match(html,/class="card product-tile" data-product-id="'\+esc\(p\.id\)/,'each product tile must expose its stable product id');
assert.match(html,/const manual=sort==='manual'&&!q&&!design&&stockFilter==='all'/,'drag reorder must be restricted to an unfiltered manual list');
assert.match(html,/lf-product-drag-handle/,'manual reorder affordance missing');
assert.match(html,/lf-product-manual-controls/,'touch-friendly manual ordering controls missing');
assert.match(html,/window\.moveProductManual=function\(productId,direction\)/,'manual move action missing');
assert.match(html,/aria-label="تحريك المنتج لأعلى"/,'accessible move-up control missing');
assert.match(html,/aria-label="تحريك المنتج لأسفل"/,'accessible move-down control missing');
assert.match(html,/list\.classList\.toggle\('lf-manual-product-order',manual\)/,'manual list state class missing');
assert.match(html,/tile\.addEventListener\('dragstart'/,'drag start handler missing');
assert.match(html,/tile\.addEventListener\('drop'/,'drop handler missing');
assert.match(html,/p\.sortOrder=index/,'drop must persist a complete ordering');
assert.match(html,/if\(!save\(\)\)\{db=before/,'failed persistence must roll back the ordering');
assert.match(css,/\.lf-product-drag-handle/,'manual reorder handle styling missing');
assert.match(css,/\.lf-product-drop-target/,'drop target feedback missing');
assert.match(css,/\.lf-product-dragging/,'drag state feedback missing');

assert.match(html,/function toggleProductActive\(pid\)/,'product activation toggle must exist');
assert.match(html,/id="productStatusFilter"[\s\S]*?value="inactive"/,'product list must expose a filter for inactive products');
assert.match(html,/statusFilter==='inactive'\?p\.active===false/,'inactive filter must show only disabled products');
assert.match(html,/p\.active=next/,'activation toggle must update the existing product record');
assert.match(html,/سيختفي من اختيارات الطلبات الجديدة/,'deactivation confirmation must explain impact on new orders');
assert.match(html,/الاحتفاظ بكل الطلبات وسجلات التصنيع السابقة/,'deactivation must preserve historical orders and production records');
assert.match(html,/p\.active===false\?'<div class="muted">هذا المنتج موقوف عن الطلبات الجديدة/,'inactive product must not offer a new-order cart action');
assert.match(html,/class="lf-product-name-line"[\s\S]{0,500}class="pill lf-product-status-badge '\+\(p\.active===false\?'is-inactive':'is-active'\)\+'">'\+\(p\.active===false\?'موقوف':'نشط'\)\+'/,'product activation status must appear beside its name in both states');
assert.match(css,/#productList \.lf-product-status-badge\.is-active[\s\S]*?color:#187A3D/,'active product status must have a distinct readable style');
assert.match(css,/#productList \.lf-product-status-badge\.is-inactive[\s\S]*?color:#B42318/,'inactive product status must have a distinct readable style');
assert.match(css,/html\[data-theme="dark"\] #productList \.lf-product-status-badge\.is-active/,'active product status must remain readable in dark theme');
assert.match(css,/html\[data-theme="dark"\] #productList \.lf-product-status-badge\.is-inactive/,'inactive product status must remain readable in dark theme');
assert.match(html,/function filterOrderProductOptions\(\)[\s\S]{0,260}p\.active!==false/,'inactive products must be excluded from new order choices');


const draftStart=html.indexOf("const LF_PRODUCT_FORM_DRAFT_KEY='lamset_fan_product_form_draft_v1'");
const draftEnd=html.indexOf("document.addEventListener('input',event=>{if(lfOrderDraftFields",draftStart);
assert.ok(draftStart>=0&&draftEnd>draftStart,'product form auto-save and restore helpers must exist');
const draftSource=html.slice(draftStart,draftEnd);
const draftCoreEnd=html.indexOf("document.addEventListener('input',event=>{if(lfProductDraftFields",draftStart);
const draftCore=html.slice(draftStart,draftCoreEnd);
assert.match(draftSource,/document\.addEventListener\('input',event=>\{if\(lfProductDraftFields\.includes\(event\.target\?\.id\)\)lfSaveProductFormDraft\(\)\}\)/,'product form inputs must auto-save drafts');
assert.match(draftSource,/document\.addEventListener\('change',event=>\{if\(lfProductDraftFields\.includes\(event\.target\?\.id\)\)lfSaveProductFormDraft\(\)\}\)/,'product form selections must auto-save drafts');
assert.match(draftSource,/showProductForm=async function\(product\)[\s\S]*?lfRestoreProductFormDraft\(product\?\.id\|\|''\)/,'matching product draft must be restored when opening the form');
assert.match(draftSource,/localStorage\.removeItem\(LF_PRODUCT_FORM_DRAFT_KEY\)/,'successful save or empty form clears its draft');
assert.match(draftSource,/window\.__lfProductDraftImage/,'selected product image preview is retained in the local draft');

if(draftStart>=0&&draftEnd>draftStart){
 const fields=['pId','pName','pCode','pDesign','pCost','pDistributor','pWholesale','pShop','pRetail','pMin','pStock','pSuggestedDistributor','pSuggestedWholesale','pSuggestedShop','pSuggestedRetail','pDesc','pContents','pCartonType','pUnitsPerCarton'];
 const elements=Object.fromEntries(fields.map(id=>[id,{value:id==='pId'?'product-1':id==='pName'?'مسودة منتج':id==='pMin'?'10':id==='pUnitsPerCarton'?'1':'0'}]));
 elements.pImagePreview={innerHTML:'',querySelector:()=>null};
 const storage=new Map(),toasts=[];
 const sandbox={window:{__lfProductDraftImage:'data:image/png;base64,ZmFrZQ==',LamsetUI:{toast:value=>toasts.push(value)}},localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},$:id=>elements[id]||null};
 vm.runInNewContext(draftCore+'\nthis.api={lfSaveProductFormDraft,lfRestoreProductFormDraft,LF_PRODUCT_FORM_DRAFT_KEY};',sandbox);
 assert.equal(sandbox.api.lfSaveProductFormDraft(),true,'product draft saves without failure');
 const saved=JSON.parse(storage.get(sandbox.api.LF_PRODUCT_FORM_DRAFT_KEY));
 assert.equal(saved.productId,'product-1','draft is scoped to the edited product');
 assert.equal(saved.values.pName,'مسودة منتج','draft preserves product fields');
 assert.equal(saved.imageData,'data:image/png;base64,ZmFrZQ==','draft preserves a selected image preview');
 elements.pName.value='قيمة مختلفة';
 elements.pImagePreview.innerHTML='';
 sandbox.api.lfRestoreProductFormDraft('product-1');
 assert.equal(elements.pName.value,'مسودة منتج','matching draft restores entered fields');
 assert.match(elements.pImagePreview.innerHTML,/data:image\/png;base64/,'matching draft restores selected image preview');
 elements.pName.value='لا تستبدل هذه البيانات';
 sandbox.api.lfRestoreProductFormDraft('another-product');
 assert.equal(elements.pName.value,'لا تستبدل هذه البيانات','draft for another product is never applied');
 const textFields=['pName','pCode','pDesign','pDesc','pContents','pCartonType'];
 fields.forEach(id=>{elements[id].value=id==='pId'?'product-1':id==='pMin'?'10':id==='pUnitsPerCarton'?'1':textFields.includes(id)?'':'0'});
 sandbox.window.__lfProductDraftImage='';
 assert.equal(sandbox.api.lfSaveProductFormDraft(),true,'empty form draft cleanup succeeds');
 assert.equal(storage.has(sandbox.api.LF_PRODUCT_FORM_DRAFT_KEY),false,'empty product form removes stale draft');
}

console.log('Manual product ordering and product draft checks passed.');
