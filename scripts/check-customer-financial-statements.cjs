#!/usr/bin/env node
const fs=require('node:fs');
const html=fs.readFileSync('www/index.html','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
function check(ok,message){if(!ok){console.error('Customer financial statement checks failed: '+message);process.exitCode=1;}}
for(const token of ['lfCustomerStatementFrom','lfCustomerStatementTo','renderCustomerStatement','printCustomerStatement','shareCustomerStatement','lfCustomerStatementHtml','lfFinancialFrom','lfFinancialTo','renderFinancialMovementReport','printFinancialMovementReport','lfFinancialMovementData'])check(html.includes(token),'missing '+token);
check(html.includes("p.status!=='cancelled'&&orderIds.has(p.orderId)"),'customer statement excludes cancelled receipts');
check(html.includes("p.status!=='cancelled'&&inRange(p.date)"),'financial report excludes cancelled receipts');
check(html.includes("x.status!=='cancelled'&&inRange((x.date||'')+'T12:00:00')"),'financial report excludes cancelled expenses');
check(html.includes('رصيد مستحق قبل الفترة')&&html.includes('الرصيد المستحق حتى نهاية الفترة'),'customer statement shows opening and closing due');
check(html.includes('لا يشمل هذا التقرير الإيداعات والسحوبات أو أرصدة الخزينة'),'financial report stays separate from treasury movements');
check(html.includes('هذا التقرير مستقل عن تقرير الخزينة ولا يعرض تكلفة التصنيع أو الأرباح'),'financial report does not expose internal costs or profit');
check(html.includes('renderCustomerStatement(cid);'),'customer statement renders when customer profile opens');
check((pkg.scripts['check:all']||'').includes('check-customer-financial-statements.cjs'),'new checks are included in check:all');
if(process.exitCode)process.exit(process.exitCode);
console.log('Customer statement and financial movement report checks passed.');
