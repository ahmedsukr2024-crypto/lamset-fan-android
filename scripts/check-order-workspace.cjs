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
const statusStart=html.indexOf('function lfOrderStatusKey(o)');
const isArchived=vm.runInNewContext(html.slice(statusStart,archiveEnd)+';lfIsArchivedOrder');
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

const catalogStart=html.indexOf('function catalogHtml(rows,type,template,subtitle,bp)');
const catalogEnd=html.indexOf('function openCatalogDocument',catalogStart);
const catalog=html.slice(catalogStart,catalogEnd);
assert.ok(catalogStart>=0&&catalogEnd>catalogStart,'catalog renderer exists');
for(const token of ['@page{size:A4','كتالوج منتجات مصنع لمسة فن','للطلب والاستفسار واتس'])assert.ok(catalog.includes(token),'catalog output requirement missing: '+token);
for(const template of ['value="all"','value="table"','value="photo"','value="compact"'])assert.ok(html.includes(template),'catalog template option missing: '+template);

const whatsStart=html.indexOf('function lfOpenOrderWhatsAppConfirmation(order)');
const whatsEnd=html.indexOf('\nfunction ',whatsStart);
const whats=html.slice(whatsStart,whatsEnd);
const captured={href:''};
const sandbox={customerPhoneDigits:value=>String(value||'').replace(/\D/g,''),formatLocalBusinessPhone:value=>String(value||''),lfOrderNumber:()=> 'LF-000123',orderGrossTotal:()=>150,paidOnOrder:()=>50,orderDue:()=>100,document:{createElement:()=>({style:{},click(){captured.href=this.href},remove(){}}),body:{appendChild(){}}},console};
vm.runInNewContext(whats+'\nthis.send=lfOpenOrderWhatsAppConfirmation;',sandbox);
const result=sandbox.send({phone:'01012345678',customer:'عميل الاختبار',area:'القاهرة - مدينة نصر',items:[{productName:'منتج أول',qty:2,unitType:'piece',price:25},{productName:'منتج ثان',qty:1,unitType:'carton',price:100}]});
assert.equal(result.opened,true,'order WhatsApp confirmation opens successfully');
const message=decodeURIComponent(captured.href.split('?text=')[1]||'');
for(const value of ['عميل الاختبار','01012345678','القاهرة - مدينة نصر','LF-000123','منتج أول','2 قطعة','25 جنيه','50 جنيه','منتج ثان','1 كرتونة','100 جنيه','150 جنيه','50 جنيه','100 جنيه'])assert.ok(message.includes(value),'order WhatsApp message missing '+value);
assert.ok(!message.includes('مرتجع')&&!message.includes('استبدال'),'customer WhatsApp order message must not mention returns or exchanges');
\nconsole.log('Order workspace, archive, invoice, catalog, and WhatsApp checks passed.');
