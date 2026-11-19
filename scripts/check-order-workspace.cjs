#!/usr/bin/env node
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const html=fs.readFileSync('www/index.html','utf8');
for(const tab of ['overview','new','history'])assert.match(html,new RegExp('data-orders-tab="'+tab+'"'),'orders workspace tab missing: '+tab);
for(const label of ['نظرة عامة','طلب جديد','سجل الطلبات','الطلبات المفتوحة','أرشيف الطلبات'])assert.ok(html.includes(label),'orders workspace label missing: '+label);
for(const id of ['orderHistorySearch','orderHistoryFrom','orderHistoryTo','orderHistorySort','orderHistoryStatus'])assert.ok(html.includes('id="'+id+'"'),'order history filter missing: '+id);
assert.match(html,/function setOrdersWorkspaceTab\(view\)[\s\S]*?const allowed=\['overview','new','history'\]/,'orders page must use the approved three-tab workspace');
assert.match(html,/function renderOrders\(\)\{[\s\S]*?const openOrders=\(db\.orders\|\|\[\]\)\.filter\(o=>!archived\(o\)\)/,'orders must be separated into open and archived lists');
assert.match(html,/const archivedOrders=\(db\.orders\|\|\[\]\)\.filter\(archived\)/,'archived orders must remain available');
assert.match(html,/sort==='oldest'\?diff:-diff/,'order history must support newest/oldest sorting');
assert.match(html,/orderHistoryFrom[\s\S]{0,200}orderHistoryTo/,'order history must support date range filters');
const archiveStart=html.indexOf('function lfIsArchivedOrder(o)');
const archiveEnd=html.indexOf('\nfunction ',archiveStart);
assert.ok(archiveStart>=0&&archiveEnd>archiveStart,'archive status rule must be isolated');
const archiveFn=html.slice(archiveStart,archiveEnd);
const isArchived=vm.runInNewContext(archiveFn+';lfIsArchivedOrder');
for(const status of ['تم التسليم','تم التسليم للعميل','ملغي','مكتمل','مغلقة','مؤرشف'])assert.equal(isArchived({status}),true,'terminal status must be archived: '+status);
for(const status of ['جديد','قيد التجهيز','جاهز للشحن','تم تسليمه لشركة الشحن'])assert.equal(isArchived({status}),false,'active workflow status must remain open: '+status);
const invoiceStart=html.indexOf('function invoiceHtml(o)');
const invoiceEnd=html.indexOf('\nfunction ',invoiceStart);
const invoice=html.slice(invoiceStart,invoiceEnd);
const whatsStart=html.indexOf('function lfOpenOrderWhatsAppConfirmation(order)');
const whatsEnd=html.indexOf('\nfunction ',whatsStart);
const whats=html.slice(whatsStart,whatsEnd);
assert.ok(invoice&&whats,'invoice and WhatsApp customer message implementations must exist');
for(const term of ['مرتجع','استبدال']){assert.ok(!invoice.includes(term),'sales invoice must not contain returns/exchanges: '+term);assert.ok(!whats.includes(term),'order WhatsApp message must not contain returns/exchanges: '+term);}
console.log('Order workspace, archive, invoice, and no-returns checks passed.');
