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

check(html.includes("esc(p.receiptNumber||p.id||'—')"),'customer statement payment rows show the receipt serial');
check(html.includes("esc(p.method||'غير محدد')"),'customer statement payment rows show the payment method');
check(html.includes('التفاصيل / طريقة الدفع'),'on-screen and printable statement tables expose payment details');
check(html.includes("lfOrderNumber(order||{})"),'customer statement payment rows link collections to the related order number');

const vm=require('node:vm');
const statementStart=html.indexOf('function lfStatementDate(value)');
const statementEnd=html.indexOf('function printCustomerStatement(cid)',statementStart);
check(statementStart>=0&&statementEnd>statementStart,'customer statement calculation and rendering helpers can be tested');
if(statementStart>=0&&statementEnd>statementStart){
 const statementSource=html.slice(statementStart,statementEnd);
 const customer={id:'customer-1',name:'عميل اختبار',phone:'01000000000'};
 const sandbox={
  db:{
   customers:[customer],
   orders:[
    {id:'old-order',orderNumber:'LF-000001',customerId:customer.id,customer:customer.name,date:'2026-11-01T10:00:00.000Z',total:100,status:'جديد'},
    {id:'period-order',orderNumber:'LF-000002',customerId:customer.id,customer:customer.name,date:'2026-11-12T10:00:00.000Z',total:50,status:'جديد'}
   ],
   payments:[
    {id:'old-payment',orderId:'old-order',amount:100,date:'2026-11-02T10:00:00.000Z',status:'active',receiptNumber:'RCPT-000001',method:'نقدي'},
    {id:'period-payment',orderId:'period-order',amount:70,date:'2026-11-13T10:00:00.000Z',status:'active',receiptNumber:'RCPT-000002',method:'تحويل بنكي'},
    {id:'cancelled-payment',orderId:'period-order',amount:10,date:'2026-11-14T10:00:00.000Z',status:'cancelled',receiptNumber:'RCPT-000003',method:'نقدي'}
   ],
   orderCreditSettlements:[
    {id:'settle-in-period',orderId:'period-order',customerId:customer.id,amount:15,date:'2026-11-15T10:00:00.000Z',method:'نقدي',note:'صرف للعميل'},
    {id:'settle-after-period',orderId:'period-order',customerId:customer.id,amount:5,date:'2026-12-01T10:00:00.000Z',method:'نقدي'}
   ]
  },
  localDay:()=> '2026-11-30',
  $:id=>({value:id==='lfCustomerStatementFrom'?'2026-11-10':'2026-11-30'}),
  customerOrderMatches:(order,c)=>order.customerId===c.id,
  lfOrderHasDepositLedgerEntry:()=>false,
  orderNetTotal:o=>Number(o.total)||0,
  lfOrderNumber:o=>o.orderNumber||o.id,
  money:value=>String(Number(value)||0),
  esc:value=>String(value??'')
 };
 vm.createContext(sandbox);
 vm.runInContext(statementSource+'\\nthis.statementApi={lfCustomerStatementData,lfCustomerStatementHtml};',sandbox);
 const result=sandbox.statementApi.lfCustomerStatementData(customer.id);
 check(result.sales===50,'statement period sales include only invoices created within the selected period');
 check(result.collected===70,'statement collections exclude cancelled receipts');
 check(result.creditsSettled===15,'statement counts only credit settlements inside the selected period');
 check(result.closing.due===0&&result.closing.credit===5,'closing excess credit subtracts already-paid settlements and preserves later settlements outside the period');
 check(result.opening.due===0&&result.opening.credit===0,'opening balance is calculated before the selected period');
 check(result.rows.includes('RCPT-000002')&&result.rows.includes('settle-in-period'),'statement rows include receipt and settlement references');
 check(result.rows.indexOf('RCPT-000002')<result.rows.indexOf('settle-in-period'),'statement ledger rows are sorted chronologically');
 check(!result.rows.includes('RCPT-000003')&&!result.rows.includes('settle-after-period'),'cancelled receipts and out-of-period settlements are excluded');
 const printable=sandbox.statementApi.lfCustomerStatementHtml(result);
 check(printable.includes('صرف أرصدة زائدة خلال الفترة')&&printable.includes('الرصيد الزائد حتى نهاية الفترة'),'printable statement explains settled and remaining customer credit');
}
\nif(process.exitCode)process.exit(process.exitCode);
console.log('Customer statement and financial movement report checks passed.');
