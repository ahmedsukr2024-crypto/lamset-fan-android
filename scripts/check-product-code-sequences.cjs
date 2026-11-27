const fs=require('node:fs');
const assert=require('node:assert/strict');
const html=fs.readFileSync('www/index.html','utf8');
const packageJson=JSON.parse(fs.readFileSync('package.json','utf8'));

for(const marker of [
 "id:'product-type-figurines',name:'مجسمات',prefix:'LF-3M'",
 "id:'product-type-no-figures',name:'بدون مجسمات',prefix:'LF-ART'",
 'id="pProductType"',
 'id="lfProductTypeSettingsCard"',
 'id="lfProductTypeList"',
 'id="lfProductTypeName"',
 'id="lfProductTypePrefix"',
])assert(html.includes(marker),'missing product type marker '+marker);

for(const fn of [
 'lfDefaultProductTypes','lfGetProductTypes','lfMaxSequenceForPrefix',
 'lfEffectiveProductTypeLastNumber','lfNextProductNumber','lfFormatProductCode',
 'lfEnsureProductTypes','renderProductTypeOptions','handleProductTypeChange',
 'renderProductTypeSettings','editProductType','cancelProductTypeEdit',
 'saveProductType','toggleProductType'
])assert(html.includes('function '+fn+'('),'missing product type function '+fn);

assert(html.includes("function lfFormatProductCode(type,number){return String(type?.prefix||'').trim().toUpperCase()+'-'+String(number).padStart(3,'0')}"),'code format must use a three-digit minimum sequence');
assert(html.includes("type.lastNumber=lfEffectiveProductTypeLastNumber(type)"),'stored counters must never move below existing codes');
assert(html.includes("if(!editingProduct&&productTypeId)"),'only new products should receive an automatically generated code');
assert(html.includes("sequenceType.lastNumber=Math.max(Number(sequenceType.lastNumber)||0,nextProductTypeNumber)"),'the sequence counter must advance in the same product save');
assert(html.includes("productTypeId,design:$('pDesign').value.trim()"),'product type identity must be saved on the existing product record');
assert(html.includes("const lfProductDraftFields=['pId','pName','pProductType','pCode'"),'product type must be included in product draft recovery');
assert(html.includes("function toggleProductType(typeId){")&&html.includes("target.active=target.active===false"),'types must be disabled/reactivated without deleting their sequence');
assert(html.includes("function handleProductTypeChange(){")&&html.includes("code.readOnly=true"),'automatic codes should be protected from accidental edits on new products');
assert(html.includes('كود يدوي / بدون نوع'),'manual legacy code entry must remain available');

const deletionStart=html.indexOf('function deleteProduct(pid){');
const deletionEnd=html.indexOf('\nfunction ',deletionStart+10);
const deletionBody=html.slice(deletionStart,deletionEnd<0?html.length:deletionEnd);
assert(deletionStart>=0&&!deletionBody.includes('productTypes')&&!deletionBody.includes('lastNumber'),'deleting a product must not reset its type sequence');
assert(packageJson.scripts['check:all'].includes('check-product-code-sequences.cjs'),'product code sequence test must be part of check:all');
console.log('Product type management, independent code sequences, legacy compatibility, draft recovery and deletion persistence checks passed.');
