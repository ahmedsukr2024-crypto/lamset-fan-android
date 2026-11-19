const fs=require('node:fs');const assert=require('node:assert/strict');const html=fs.readFileSync('www/index.html','utf8');
assert(html.includes('id="LAMSET_PRODUCTION_WORKSPACE_V2"'),'production workspace controller missing');
assert(html.includes("definitions=[['overview','نظرة عامة'],['now','المطلوب'],['groups','مجموعات التصنيع'],['history','سجل الدفعات']]"),'production workspace must expose the four approved tabs');
for(const id of ['productionNeedsSummary','productionNeedsList','stockDashboard','lfProductionBatchAudit'])assert(html.includes('id="'+id+'"'),'production region missing: '+id);
for(const fn of ['renderProductionOverview','renderProductionGroups','renderProductionNeeds','renderProductionBatchHistory'])assert(html.includes(fn),'production renderer missing: '+fn);
assert(html.includes('lfProductionOverviewStats'),'production overview counters missing');
assert(html.includes('lfProductionOverviewAlerts'),'production overview alerts missing');
assert(html.includes('lfProductionGroupAlerts'),'production group alert region missing');
assert(html.includes('oldRenderAll.apply(this,arguments)'),'production overview must refresh after app renders');
assert(html.includes('window.setProductionTab(\'overview\')'),'production workspace must open on overview');
assert(html.includes('lfProductionBatchAudit'),'existing production batch history must be preserved');

const releaseStart=html.indexOf('function lfReleaseProductionAllocationForOrderEdit(');
const preserveStart=html.indexOf('function lfPreserveOrderProductionOnEdit(',releaseStart);
const preserveEnd=html.indexOf('function lfCanEditOrder(',preserveStart);
assert(releaseStart>=0&&preserveStart>releaseStart&&preserveEnd>preserveStart,'production release-on-order-edit helpers exist');
const releaseSource=html.slice(releaseStart,preserveEnd);
assert(releaseSource.includes('row.batch.surplusUnits=(Number(row.batch.surplusUnits)||0)+take'),'reduced-order production is recorded against its original batch');
assert(releaseSource.includes('product.surplusStock=Math.max(0,Number(product.surplusStock)||0)+count'),'production released by order edit is held in separate surplus stock');
assert(!releaseSource.includes('product.stock=Math.max(0,Number(product.stock)||0)+count'),'released production must not become sellable stock automatically');
const cancellationStart=html.indexOf('if(cancelling){if(!Array.isArray(db.stockMovements))');
const cancellationEnd=html.indexOf('if(reactivating&&o.stockReturnedOnCancel===true)',cancellationStart);
const cancellationSource=cancellationStart>=0&&cancellationEnd>cancellationStart?html.slice(cancellationStart,cancellationEnd):'';
assert(!!cancellationSource,'order cancellation stock release block exists');
assert(cancellationSource.includes('p.surplusStock=Math.max(0,Number(p.surplusStock)||0)+fulfilled'),'produced units from cancelled orders are separated as surplus');
assert(cancellationSource.includes('delta:deducted,surplusDelta:fulfilled'),'stock movement distinguishes returned stock from production surplus');
assert(cancellationSource.includes('releasedToSurplusOnOrderCancel'),'surplus quantity remains linked to its original production allocation');
assert(html.includes('releasedToSurplusOnOrderCancel)>0'),'a batch with released surplus cannot be reversed again');
assert(html.includes('فائض إنتاج للمراجعة')&&html.includes('غير متاح للبيع'),'surplus is visible separately and not presented as sellable stock');
assert(html.includes('Number(x.surplusUnits)||0'),'production batch history shows its surplus quantity');


const surplusUseStart=html.indexOf('window.lfUseProductionSurplus=async function(batchId)');
const surplusUseEnd=html.indexOf('window.renderProductionBatchHistory=function()',surplusUseStart);
const surplusUseSource=surplusUseStart>=0&&surplusUseEnd>surplusUseStart?html.slice(surplusUseStart,surplusUseEnd):'';
assert(!!surplusUseSource,'owner-approved production surplus use action exists');
assert(surplusUseSource.includes('await window.lamsetRequireOwnerPin'),'using surplus requires owner PIN approval');
assert(surplusUseSource.includes('lfProductionGroupKey(line)!==batch.productionGroupKey'),'surplus can only be assigned to an exact matching product/specification group');
assert(surplusUseSource.includes('liveLine.item.productionPendingUnits=livePending-qty'),'surplus use reduces the selected order production shortage');
assert(surplusUseSource.includes('product.surplusStock=Math.max(0,(Number(product.surplusStock)||0)-qty)'),'surplus use reduces the separate surplus balance');
assert(surplusUseSource.includes('product.reservedStock=Math.max(0,Number(product.reservedStock)||0)+qty'),'approved surplus is reserved to the target order');
assert(surplusUseSource.includes('batch.surplusUses.push')&&surplusUseSource.includes('production_surplus_allocation'),'surplus use is audited without creating a new production batch');
assert(surplusUseSource.includes('if(!save())throw new Error'),'surplus allocation must persist before reporting success');


assert(html.includes('surplusDelta:Number(m.surplusDelta)||0'),'central stock movement history retains the separate surplus balance change');
assert(html.includes('تغير فائض الإنتاج'),'central stock movement history displays surplus balance changes');
assert(html.includes('surplusDelta=Number(x.surplusDelta)||0'),'product movement detail displays surplus movement quantities');


assert(html.includes('المجموعة دون طلبات مرتبطة'),'production surplus alert identifies batches whose group has no open matching orders');
assert(html.includes('دفعة '+"'+esc(b.batchNo||'قديمة')"),'production surplus alert includes the source batch number');


const reversalStart=html.indexOf('window.cancelProductionBatch=async function(batchId)');
const reversalEnd=html.indexOf('window.lfUseProductionSurplus=async function(batchId)',reversalStart);
const reversalSource=reversalStart>=0&&reversalEnd>reversalStart?html.slice(reversalStart,reversalEnd):'';
assert(!!reversalSource,'production batch reversal action exists');
assert(reversalSource.includes('سبب عكس دفعة الإنتاج (إلزامي)'),'production batch reversal requires a correction reason');
assert(reversalSource.includes("window.lamsetRequireOwnerPin('تصحيح سجل دفعة الإنتاج')"),'production batch reversal requires owner PIN');
assert(reversalSource.includes("movementType:'production_batch_reversal'"),'production batch correction creates an explicit reverse stock movement');
assert(reversalSource.includes('reversedProductionBatchId:batch.id'),'reverse movement references the original production batch');
assert(reversalSource.includes('batch.reversal={movementId:'),'original batch retains reversal audit metadata');
assert(reversalSource.includes("lfRecordActivity('عكس دفعة تصنيع'"),'production reversal is written to the activity log');
assert(reversalSource.includes('ownerApproved:true'),'reversal records owner approval');
assert(!reversalSource.includes('db.productions=db.productions.filter'),'production correction does not delete the original batch');
assert(reversalSource.includes('lfOrderHasShipped(order)'),'production batch reversal is blocked when any linked order has a partial or complete shipment');

console.log('Production workspace four-tab structure and existing production regions verified.');
