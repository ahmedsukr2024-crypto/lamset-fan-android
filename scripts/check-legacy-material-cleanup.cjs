#!/usr/bin/env node
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('www/index.html', 'utf8');
function assert(condition, message) {
  if (!condition) {
    console.error('Legacy material cleanup check failed: ' + message);
    process.exitCode = 1;
  }
}

const start = html.indexOf('function lfRemoveLegacyMaterialData(data){');
const end = html.indexOf('\nfunction orderStockLines', start);
assert(start >= 0 && end > start, 'legacy cleanup migration is present and bounded');
if (process.exitCode) process.exit(process.exitCode);

const migrationSource = html.slice(start, end);
const context = vm.createContext({});
vm.runInContext(migrationSource + '\nthis.migrate = lfRemoveLegacyMaterialData;', context);

const data = {
  materials: [{ id: 'm1', name: 'legacy material' }],
  materialMovements: [{ id: 'mm1', qty: 12 }],
  products: [{
    id: 'p1',
    name: 'منتج قائم',
    recipe: [{ materialId: 'm1', qty: 2 }],
    recipeUpdatedAt: '2026-01-01',
    costStudy: { wastePct: 5, lines: [{ name: 'تكلفة قائمة', value: 10 }] }
  }],
  appSettings: {
    alertDailySummary: { materials: true, orders: true },
    alertLifecycle: {
      active: { 'material-short:m1': true, 'order-late:o1': true },
      read: { 'material-short:m2': true },
      history: [
        { category: 'الخامات', key: 'material-short:m1' },
        { category: 'الطلبات', key: 'order-late:o1' }
      ]
    },
    alertSnoozes: { 'material-short:m1': 123, 'order-late:o1': 456 }
  },
  productions: [
    { id: 'old1', qty: 20, damaged: 3, consumedMaterials: [{ id: 'm1' }], materialCost: 15, materialUnitCost: 2, materialsUntracked: true },
    { id: 'old2', qty: 18, net: 16, damaged: 2 },
    { id: 'clean', qty: 9, batchNo: 'PRD-OLD-0001' }
  ],
  orders: [{ id: 'o1', status: 'جديد', total: 100 }]
};

assert(context.migrate(data) === true, 'migration reports that legacy records were removed');
assert(!Object.prototype.hasOwnProperty.call(data, 'materials'), 'raw-material records are deleted');
assert(!Object.prototype.hasOwnProperty.call(data, 'materialMovements'), 'raw-material movement history is deleted');
assert(!('recipe' in data.products[0]) && !('recipeUpdatedAt' in data.products[0]), 'product material recipes are deleted');
assert(!('wastePct' in data.products[0].costStudy), 'product waste percentage is deleted');
assert(data.products[0].costStudy.lines.length === 1, 'unrelated product cost lines are preserved');
assert(data.appSettings.alertDailySummary.orders === true && !('materials' in data.appSettings.alertDailySummary), 'only material alert summaries are removed');
assert(!('material-short:m1' in data.appSettings.alertLifecycle.active), 'active material alerts are deleted');
assert(data.appSettings.alertLifecycle.active['order-late:o1'] === true, 'unrelated active alerts are preserved');
assert(Object.keys(data.appSettings.alertLifecycle.read).length === 0, 'read material alerts are deleted');
assert(data.appSettings.alertLifecycle.history.length === 1 && data.appSettings.alertLifecycle.history[0].category === 'الطلبات', 'only material alert history is deleted');
assert(data.appSettings.alertSnoozes['order-late:o1'] === 456, 'unrelated alert snoozes are preserved');
assert(data.productions[0].qty === 17 && data.productions[0].net === 17, 'legacy damaged quantity is excluded from usable production history');
assert(data.productions[1].qty === 16 && data.productions[1].net === 16, 'existing net production quantity is preserved');
for (const key of ['damaged', 'consumedMaterials', 'materialCost', 'materialUnitCost', 'materialsUntracked']) {
  assert(!(key in data.productions[0]), 'legacy production field ' + key + ' is deleted');
}
assert(data.orders[0].total === 100, 'customer orders are preserved');
assert(context.migrate(data) === false, 'migration is idempotent after the first cleanup');

assert(html.includes('removedLegacyMaterials=lfRemoveLegacyMaterialData(db)'), 'legacy cleanup runs while loading saved app data');
assert(html.includes('function save(){lfRemoveLegacyReturnData(db);lfRemoveLegacyMaterialData(db);'), 'legacy cleanup also runs before saving app data');
assert(!html.includes('data-nav-target="materials"') && !html.includes('<section id="materials"'), 'no raw-material page or navigation entry remains');
assert(!html.includes('id="prodDamaged"') && !html.includes('id="wastePct"'), 'production and costing forms no longer expose scrap or waste controls');
assert(!html.includes('التالف اختياري') && !html.includes('المخزون يستقبل الصافي السليم فقط'), 'production UI no longer describes the removed scrap workflow');

if (process.exitCode) process.exit(process.exitCode);
console.log('Legacy raw-material, defects, and waste cleanup checks passed.');
