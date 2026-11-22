#!/usr/bin/env node
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('www/lamset-local-db.js', 'utf8');
const start = source.indexOf('  async recomputeTreasuryLedger(');
const end = source.indexOf('\n  async updateTreasuryMovement(', start);
if (start < 0 || end < 0) throw new Error('Treasury ledger implementation could not be isolated.');
const method = source.slice(start, end).trim().replace(/^async recomputeTreasuryLedger/, 'async function recomputeTreasuryLedger');
const categoryStart = source.indexOf('function normalizeTreasuryCategory(');
const categoryEnd = source.indexOf('\nfunction bytesToBase64', categoryStart);
if (categoryStart < 0 || categoryEnd < 0) throw new Error('Treasury category normalization could not be isolated.');
const categorySandbox = {};
vm.runInNewContext(source.slice(categoryStart, categoryEnd) + '\nthis.normalizeCategory = normalizeTreasuryCategory; this.normalizeAttachment = normalizeTreasuryAttachment;', categorySandbox);
const addCategoryStart = source.indexOf('  async addTreasuryCategory(');
const addCategoryEnd = source.indexOf('\n  async recordTreasuryMovement(', addCategoryStart);
if (addCategoryStart < 0 || addCategoryEnd < 0) throw new Error('Treasury category storage implementation could not be isolated.');
const categoryStoreMethod = source.slice(addCategoryStart, addCategoryEnd).trim().replace(/^async addTreasuryCategory/, 'async function addTreasuryCategory');
const categoryStoreSandbox = {
  META: 'meta',
  normalizeTreasuryCategory: categorySandbox.normalizeCategory,
  requestValue: value => Promise.resolve(value),
  transactionDone: () => Promise.resolve(true)
};
vm.runInNewContext(categoryStoreMethod + '\nthis.addCategory = addTreasuryCategory;', categoryStoreSandbox);
assert(categorySandbox.normalizeCategory('  سحب   مشتريات  ') === 'سحب مشتريات', 'category names are trimmed and repeated whitespace is normalized');
let longCategoryRejected = false;
try { categorySandbox.normalizeCategory('x'.repeat(41)); } catch (error) { longCategoryRejected = /40/.test(error.message); }
assert(longCategoryRejected, 'category names longer than 40 characters are rejected');
const validAttachment = categorySandbox.normalizeAttachment({ dataUrl: 'data:image/jpeg;base64,AA==', name: 'receipt.png', sizeBytes: 2048 });
assert(validAttachment.mimeType === 'image/jpeg' && validAttachment.name === 'receipt.png' && validAttachment.sizeBytes === 2048, 'receipt image metadata is normalized and preserved');
let invalidAttachmentRejected = false;
try { categorySandbox.normalizeAttachment({ dataUrl: 'data:image/svg+xml;base64,AA==' }); } catch (error) { invalidAttachmentRejected = /JPEG/.test(error.message); }
assert(invalidAttachmentRejected, 'non-JPEG or unprocessed attachment data is rejected');
let oversizedAttachmentRejected = false;
try { categorySandbox.normalizeAttachment({ dataUrl: 'data:image/jpeg;base64,' + 'A'.repeat(1200000) }); } catch (error) { oversizedAttachmentRejected = /الحد المسموح/.test(error.message); }
assert(oversizedAttachmentRejected, 'oversized processed attachment data is rejected');

const sandbox = {
  META: 'meta', MOVEMENTS: 'treasuryMovements', CASH_LINKS: 'treasuryCashLinks', CLOSEOUTS: 'treasuryCloseouts',
  META: 'meta', MOVEMENTS: 'treasuryMovements', CASH_LINKS: 'treasuryCashLinks', CLOSEOUTS: 'treasuryCloseouts',
  requestValue: value => Promise.resolve(value),
  transactionDone: () => Promise.resolve(true),
  toCents: value => { const amount = Number(value); if (!Number.isFinite(amount) || amount <= 0) throw new Error('invalid amount'); return Math.round(amount * 100); },
  fromCents: value => Number((Number(value || 0) / 100).toFixed(2))
};
vm.runInNewContext(method + '\nthis.runLedger = recomputeTreasuryLedger;', sandbox);
const correctionStart = source.indexOf('  async correctOpeningBalance(');
const correctionEnd = source.indexOf('\n  async getTreasuryBalance()', correctionStart);
if (correctionStart < 0 || correctionEnd < 0) throw new Error('Opening balance correction implementation could not be isolated.');
const correctionMethod = source.slice(correctionStart, correctionEnd).trim().replace(/^async correctOpeningBalance/, 'async function correctOpeningBalance');
vm.runInNewContext(correctionMethod + '\nthis.correctOpeningBalance = correctOpeningBalance;', sandbox);
function makeStore(records, keyField) {
  return {
    getAll: () => records.slice(),
    get: key => keyField === 'key' ? records.find(x => x.key === key) : records.find(x => x.id === key),
    put: value => {
      const key = keyField === 'key' ? value.key : value.id;
      const index = records.findIndex(x => (keyField === 'key' ? x.key : x.id) === key);
      if (index < 0) records.push(value); else records[index] = value;
    }
  };
}
function fixture({ opening = 10000, openingDate = '2026-11-01', movements = [], links = [], closeouts = [] } = {}) {
  const metaRecords = [{ key: 'treasury.opening', value: { cents: opening, businessDate: openingDate } }];
  const stores = {
    meta: makeStore(metaRecords, 'key'),
    treasuryMovements: makeStore(movements, 'id'),
    treasuryCashLinks: makeStore(links, 'id'),
    treasuryCloseouts: makeStore(closeouts, 'id')
  };
  return {
    stores, movements, links, closeouts, metaRecords,
    transaction: { objectStore: name => stores[name] }
  };
}
function assert(condition, message) {
  if (!condition) throw new Error('Treasury ledger runtime check failed: ' + message);
}
(async () => {
  const categoryRecords = [{ key: 'treasury.categories', value: { deposit: ['إيداع نقدي'], withdrawal: [] } }];
  const categoryStore = {
    get: key => categoryRecords.find(item => item.key === key),
    put: value => { const index = categoryRecords.findIndex(item => item.key === value.key); if (index < 0) categoryRecords.push(value); else categoryRecords[index] = value; }
  };
  let ownerChecks = 0;
  const categoryOwner = {
    requireOwnerSession: () => { ownerChecks += 1; },
    open: async () => ({ transaction: () => ({ objectStore: name => { if (name !== 'meta') throw new Error('unexpected store'); return categoryStore; }, abort: () => {} }) })
  };
  const savedCategories = await categoryStoreSandbox.addCategory.call(categoryOwner, 'deposit', ' إيداع بنكي ');
  assert(savedCategories.deposit.includes('إيداع بنكي'), 'new category is persisted in the selected movement type');
  let duplicateRejected = false;
  try { await categoryStoreSandbox.addCategory.call(categoryOwner, 'deposit', 'إيداع بنكي'); } catch (error) { duplicateRejected = /موجود بالفعل/.test(error.message); }
  assert(duplicateRejected, 'duplicate categories are rejected');
  const otherType = await categoryStoreSandbox.addCategory.call(categoryOwner, 'withdrawal', 'إيداع بنكي');
  assert(otherType.withdrawal.includes('إيداع بنكي'), 'the same label may exist independently for deposits and withdrawals');
  assert(ownerChecks === 3, 'each category write requires an owner session');
  const normal = fixture({
    movements: [
      { id: 'd1', type: 'deposit', category: 'إيداع نقدي', amountCents: 5000, effectiveDate: '2026-11-01', createdAt: '2026-11-01T08:00:00Z', status: 'active' },
      { id: 'w1', type: 'withdrawal', category: 'سحب تشغيلي', amountCents: 2000, effectiveDate: '2026-11-01', createdAt: '2026-11-01T09:00:00Z', status: 'active' },
      { id: 'w-expense-reference', type: 'withdrawal', amountCents: 3000, expenseId: 'e1', referenceOnly: true, effectiveDate: '2026-11-01', createdAt: '2026-11-01T11:30:00Z', status: 'active' },
      { id: 'w-cancelled', type: 'withdrawal', amountCents: 9000, effectiveDate: '2026-11-01', createdAt: '2026-11-01T09:30:00Z', status: 'cancelled' }
    ],
    links: [
      { id: 'p1', type: 'collection', amountCents: 1000, effectiveDate: '2026-11-01', createdAt: '2026-11-01T10:00:00Z', status: 'active' },
      { id: 'e1', type: 'expense', amountCents: 3000, effectiveDate: '2026-11-01', createdAt: '2026-11-01T11:00:00Z', status: 'active' }
    ]
  });
  const normalBalance = await sandbox.runLedger(normal.transaction);
  assert(normalBalance === 110, 'deposits, withdrawals, collections, and expenses produce the correct balance');
  assert(normal.movements.find(x => x.id === 'd1').category === 'إيداع نقدي' && normal.movements.find(x => x.id === 'w1').category === 'سحب تشغيلي', 'movement categories are retained as metadata without changing ledger calculation');
  assert(normal.movements.find(x => x.id === 'w-cancelled').balanceAfterCents === undefined, 'cancelled movements do not affect the ledger');
  assert(normal.links.find(x => x.id === 'p1').balanceAfterCents === 14000, 'cash collection is credited once');
  assert(normal.links.find(x => x.id === 'e1').balanceAfterCents === 11000, 'cash expense is debited once');
  const referenceMovement = normal.movements.find(x => x.id === 'w-expense-reference');
  assert(referenceMovement.balanceBeforeCents === 11000 && referenceMovement.balanceAfterCents === 11000, 'a withdrawal linked to an already-counted cash expense is reference-only and adds no second debit');
  assert(normal.metaRecords.find(x => x.key === 'treasury.balance.cents').value === 11000, 'current treasury balance is persisted in cents');

  const negative = fixture({
    movements: [{ id: 'w-over', type: 'withdrawal', amountCents: 12000, effectiveDate: '2026-11-01', createdAt: '2026-11-01T08:00:00Z', status: 'active' }]
  });
  let rejected = false;
  try { await sandbox.runLedger(negative.transaction); } catch (error) { rejected = /رصيد خزينة سالب/.test(error.message); }
  assert(rejected, 'any movement that makes the balance negative is rejected');

  const closed = fixture({
    movements: [
      { id: 'd-before-close', type: 'deposit', amountCents: 2000, effectiveDate: '2026-11-01', createdAt: '2026-11-01T08:00:00Z', status: 'active' },
      { id: 'd-next-day', type: 'deposit', amountCents: 1000, effectiveDate: '2026-11-02', createdAt: '2026-11-02T08:00:00Z', status: 'active' }
    ],
    closeouts: [{
      id: 'CLOSE-2026-11-01', businessDate: '2026-11-01', actualCents: 11500,
      expectedCents: 0, differenceCents: 0, pendingInitialSnapshot: true
    }]
  });
  const closedBalance = await sandbox.runLedger(closed.transaction);
  const savedCloseout = closed.closeouts[0];
  assert(savedCloseout.originalExpectedCents === 12000, 'first closeout captures its original expected balance');
  assert(savedCloseout.originalDifferenceCents === -500, 'first closeout captures the original discrepancy');
  assert(savedCloseout.expectedCents === 12000 && savedCloseout.differenceCents === -500, 'closeout stores expected and actual difference');
  assert(closedBalance === 125, 'next-day ledger starts from the actual closeout amount');

  const corrected = fixture({
    movements: [
      { id: 'd1', type: 'deposit', amountCents: 2000, effectiveDate: '2026-11-01', createdAt: '2026-11-01T08:00:00Z', status: 'active' },
      { id: 'd2', type: 'deposit', amountCents: 500, effectiveDate: '2026-11-01', createdAt: '2026-11-01T12:00:00Z', status: 'active' }
    ],
    closeouts: [{
      id: 'CLOSE-2026-11-01', businessDate: '2026-11-01', actualCents: 11500,
      expectedCents: 12000, differenceCents: -500,
      originalExpectedCents: 12000, originalDifferenceCents: -500
    }]
  });
  await sandbox.runLedger(corrected.transaction, {
    action: 'edit', movementId: 'd2', reason: 'تصحيح موثق',
    effectiveDate: '2026-11-01', at: '2026-11-03T12:00:00Z'
  });
  const correctedCloseout = corrected.closeouts[0];
  assert(correctedCloseout.originalExpectedCents === 12000, 'historical original closeout snapshot is not overwritten');
  assert(correctedCloseout.expectedCents === 12500 && correctedCloseout.differenceCents === -1000, 'historical closeout is recalculated after a dated correction');
  assert(correctedCloseout.corrections?.length === 1 && correctedCloseout.corrections[0].reason === 'تصحيح موثق', 'closeout keeps an explicit correction audit entry');

  const openingCorrection = fixture({
    opening: 10000,
    movements: [{ id: 'd-after-opening', type: 'deposit', amountCents: 2000, effectiveDate: '2026-11-01', createdAt: '2026-11-01T08:00:00Z', status: 'active' }]
  });
  const correctionOwner = {
    requireOwnerSession: () => true,
    open: async () => ({ transaction: () => openingCorrection.transaction }),
    recomputeTreasuryLedger: sandbox.runLedger
  };
  const correctionResult = await sandbox.correctOpeningBalance.call(correctionOwner, 120, 'تصحيح رصيد البداية');
  const openingValue = openingCorrection.metaRecords.find(x => x.key === 'treasury.opening').value;
  assert(correctionResult.balance === 140, 'opening balance correction recalculates the current balance');
  assert(openingValue.originalCents === 10000 && openingValue.cents === 12000, 'opening correction preserves the first value and stores the corrected value');
  assert(openingValue.corrections?.length === 1 && openingValue.corrections[0].reason === 'تصحيح رصيد البداية', 'opening correction records its reason and historical values');

  const dateStart = source.indexOf('function normalizeBusinessDate(');
  const dateEnd = source.indexOf('\nfunction fromCents', dateStart);
  if (dateStart < 0 || dateEnd < 0) throw new Error('Business date normalization could not be isolated.');
  const dateSandbox = {};
  vm.runInNewContext(source.slice(dateStart, dateEnd) + '\nthis.normalizeDate = normalizeBusinessDate;', dateSandbox);
  const closeoutStart = source.indexOf('  async correctTreasuryCloseout(');
  const closeoutEnd = source.indexOf('\n  async listTreasuryCloseouts()', closeoutStart);
  if (closeoutStart < 0 || closeoutEnd < 0) throw new Error('Prior closeout correction implementation could not be isolated.');
  const closeoutMethod = source.slice(closeoutStart, closeoutEnd).trim().replace(/^async correctTreasuryCloseout/, 'async function correctTreasuryCloseout');
  const closeoutSandbox = {
    META: 'meta', MOVEMENTS: 'treasuryMovements', CASH_LINKS: 'treasuryCashLinks', CLOSEOUTS: 'treasuryCloseouts',
    normalizeBusinessDate: dateSandbox.normalizeDate,
    requestValue: value => Promise.resolve(value),
    transactionDone: () => Promise.resolve(true),
    fromCents: value => Number((Number(value || 0) / 100).toFixed(2))
  };
  vm.runInNewContext(closeoutMethod + '\nthis.correctCloseout = correctTreasuryCloseout;', closeoutSandbox);
  const closeoutCorrection = fixture({
    opening: 10000,
    movements: [
      { id: 'closeout-day-one', type: 'deposit', amountCents: 2000, effectiveDate: '2026-11-01', createdAt: '2026-11-01T08:00:00Z', status: 'active' },
      { id: 'closeout-day-two', type: 'deposit', amountCents: 1000, effectiveDate: '2026-11-02', createdAt: '2026-11-02T08:00:00Z', status: 'active' }
    ],
    closeouts: [
      { id: 'CLOSE-2026-11-01', businessDate: '2026-11-01', actualCents: 11500, expectedCents: 12000, differenceCents: -500, originalExpectedCents: 12000, originalDifferenceCents: -500, status: 'closed' },
      { id: 'CLOSE-2026-11-02', businessDate: '2026-11-02', actualCents: 12000, expectedCents: 12500, differenceCents: -500, originalExpectedCents: 12500, originalDifferenceCents: -500, status: 'closed' }
    ]
  });
  const closeoutOwner = {
    requireOwnerSession: () => true,
    open: async () => ({ transaction: () => closeoutCorrection.transaction }),
    recomputeTreasuryLedger: sandbox.runLedger
  };
  const closeoutResult = await closeoutSandbox.correctCloseout.call(closeoutOwner, '2026-11-01', 11200, 'تصحيح النقدية الفعلية');
  const firstCloseout = closeoutCorrection.closeouts.find(x => x.businessDate === '2026-11-01');
  const nextCloseout = closeoutCorrection.closeouts.find(x => x.businessDate === '2026-11-02');
  assert(firstCloseout.originalActualCents === 11500 && firstCloseout.actualCents === 11200, 'manual correction preserves original actual cash and stores the corrected value');
  assert(firstCloseout.corrections?.some(x => x.action === 'manual-closeout-correction' && x.previousActualCents === 11500 && x.correctedActualCents === 11200 && x.reason === 'تصحيح النقدية الفعلية'), 'manual closeout correction keeps the exact previous and next actual values with its reason');
  assert(nextCloseout.expectedCents === 12200 && nextCloseout.originalExpectedCents === 12500, 'correcting a prior actual closeout recalculates later expected balances without overwriting the original snapshot');
  assert(closeoutResult.balance === 120 && nextCloseout.actualCents === 12000, 'later actual closeouts remain unchanged and determine the final cash balance');

  console.log('Treasury ledger runtime checks passed: ordering, idempotent source impact, reference-only withdrawals, negative-balance guard, closeout snapshots, and audited corrections.');
})().catch(error => { console.error(error); process.exit(1); });
