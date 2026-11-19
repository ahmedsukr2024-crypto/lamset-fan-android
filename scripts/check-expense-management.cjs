#!/usr/bin/env node
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('www/index.html','utf8');
function check(ok,message){if(!ok){console.error('Expense management checks failed: '+message);process.exitCode=1;}}
for(const id of ['lfExpenseAmount','lfExpenseDate','lfExpenseCategory','lfExpenseMethod','lfExpenseNotes','lfExpenseReceipt','lfExpenseSearch','lfExpenseFilterMethod','lfExpenseFrom','lfExpenseTo','lfExpenseList'])check(html.includes('id="'+id+'"'),'expense UI includes '+id);
const saveStart=html.indexOf('async function saveExpense(button)');
const saveEnd=html.indexOf('async function editExpense(expenseId)',saveStart);
const save=saveStart>=0&&saveEnd>saveStart?html.slice(saveStart,saveEnd):'';
check(!!save,'expense registration handler exists');
for(const token of ['amount<=0',"status:'active'","file.type.startsWith('image/')",'file.size>5*1024*1024',"lfRecordActivity('تسجيل مصروف'",'save()',"applyCashLink(expense.id,'expense'"])check(save.includes(token),'expense registration validates and records '+token);
const editStart=html.indexOf('async function editExpense(expenseId)');
const editEnd=html.indexOf('async function cancelExpense(expenseId)',editStart);
const edit=editStart>=0&&editEnd>editStart?html.slice(editStart,editEnd):'';
check(!!edit,'expense edit handler exists');
for(const token of ['oldValues','newValues','item.audit','reason:reason.trim()','lamsetRequireOwnerPin','removeCashLink','applyCashLink','committed'])check(edit.includes(token),'expense edit protects and audits '+token);
const cancelStart=html.indexOf('async function cancelExpense(expenseId)');
const cancelEnd=html.indexOf('async function viewExpenseReceipt',cancelStart);
const cancel=cancelStart>=0&&cancelEnd>cancelStart?html.slice(cancelStart,cancelEnd):'';
for(const token of ['سبب إلغاء المصروف (مطلوب)','lamsetRequireOwnerPin',"status='cancelled'",'cancelReason','removeCashLink','item.audit'])check(cancel.includes(token),'expense cancellation preserves '+token);
check(html.includes("rows.filter(x=>x.status!=='cancelled')"),'expense list retains but excludes cancelled entries from active total');
check(html.includes("x.status!=='cancelled'&&inRange((x.date||'')+'T12:00:00')"),'financial movement report excludes cancelled expenses');
check(html.includes("expense.status!=='cancelled'&&expense.method==='نقدي'"),'cash expense reconciliation is limited to active cash expenses');

if(edit){
 const prompts=['125','2026-11-10','تغليف','تحويل بنكي','ملاحظة جديدة','تصحيح بيانات'],alerts=[];
 const sandbox={db:{expenses:[{id:'expense-1',amount:100,date:'2026-11-01',category:'مواصلات',method:'نقدي',notes:'قديم',status:'active'}]},removed:[],applied:[],prompt:()=>prompts.shift(),alert:value=>alerts.push(value),save(){return true},lfRecordActivity(){},renderExpenses(){},window:{lamsetRequireOwnerPin:async()=>true,LamsetLocalDB:{removeCashLink:async(...args)=>sandbox.removed.push(args),applyCashLink:async(...args)=>sandbox.applied.push(args)}}};
 vm.createContext(sandbox);
 vm.runInContext(edit+'\nthis.api={editExpense};',sandbox);
 (async()=>{
  await sandbox.api.editExpense('expense-1');
  const item=sandbox.db.expenses[0];
  check(item.amount===125&&item.date==='2026-11-10'&&item.category==='تغليف'&&item.method==='تحويل بنكي'&&item.notes==='ملاحظة جديدة','edit updates all supported expense fields');
  check(item.audit?.length===1&&item.audit[0].oldValues.amount===100&&item.audit[0].newValues.amount===125&&item.audit[0].reason==='تصحيح بيانات','edit stores complete before/after values and mandatory reason');
  check(sandbox.removed.length===1&&sandbox.applied.length===0,'cash-to-bank edit removes the previous cash link exactly once');
  check(alerts.length===0,'successful expense edit completes without an error alert');
  if(process.exitCode)process.exit(process.exitCode);
  console.log('Expense management behavioral checks passed.');
 })().catch(error=>{console.error(error);process.exitCode=1});
}
