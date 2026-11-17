const DB_NAME = 'lamset-fan-secure-v1';
const DB_VERSION = 1;
const META = 'meta';
const MOVEMENTS = 'treasuryMovements';
const CLOSEOUTS = 'treasuryCloseouts';
const CASH_LINKS = 'treasuryCashLinks';

function requestValue(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('تعذر قراءة قاعدة البيانات المحلية.'));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve(true);
    transaction.onabort = transaction.onerror = () => reject(transaction.error || new Error('تم إلغاء معاملة قاعدة البيانات.'));
  });
}

function toCents(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0 || !/^\d+(?:\.\d{1,2})?$/.test(String(value).trim())) {
    throw new Error('المبلغ يجب أن يكون أكبر من صفر وبحد أقصى منزلتين عشريتين.');
  }
  return Math.round(amount * 100);
}

function normalizeBusinessDate(value, fallback = new Date()) {
  const raw = String(value || '');
  const candidate = raw || [fallback.getFullYear(), String(fallback.getMonth() + 1).padStart(2, '0'), String(fallback.getDate()).padStart(2, '0')].join('-');
  const parts = candidate.split('-');
  const digitsOnly = value => value.length > 0 && Array.from(value).every(char => char >= '0' && char <= '9');
  if (parts.length !== 3 || parts[0].length !== 4 || parts[1].length !== 2 || parts[2].length !== 2 || !parts.every(digitsOnly)) throw new Error('تاريخ الحركة غير صحيح.');
  const parsed = new Date(candidate + 'T00:00:00.000Z');
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== candidate) throw new Error('تاريخ الحركة غير صحيح.');
  return candidate;
}

function fromCents(value) {
  return Number((Number(value || 0) / 100).toFixed(2));
}

function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  return Uint8Array.from(atob(value), char => char.charCodeAt(0));
}

async function derivePinHash(pin, salt) {
  if (!globalThis.crypto?.subtle) throw new Error('ميزة التحقق الآمن غير متاحة على هذا الجهاز.');
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 210000, hash: 'SHA-256' }, material, 256);
  return new Uint8Array(bits);
}

function validatePin(pin) {
  const value = String(pin || '');
  if (!/^\d{6}$/.test(value)) throw new Error('رمز المالك يجب أن يتكون من 6 أرقام.');
  return value;
}

class LamsetLocalDatabase {
  constructor() { this.databasePromise = null; this.failedPinAttempts = 0; this.pinBlockedUntil = 0; this.ownerSessionExpiresAt = 0; }

  requireOwnerSession() {
    if (!this.ownerSessionExpiresAt || Date.now() >= this.ownerSessionExpiresAt) {
      this.ownerSessionExpiresAt = 0;
      throw new Error('انتهت صلاحية التحقق؛ أدخل رمز المالك مرة أخرى.');
    }
    this.ownerSessionExpiresAt = 0;
    return true;
  }

  open() {
    if (this.databasePromise) return this.databasePromise;
    this.databasePromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in globalThis)) { reject(new Error('قاعدة البيانات المحلية غير مدعومة على هذا الجهاز.')); return; }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(META)) database.createObjectStore(META, { keyPath: 'key' });
        if (!database.objectStoreNames.contains(MOVEMENTS)) {
          const store = database.createObjectStore(MOVEMENTS, { keyPath: 'id' });
          store.createIndex('movementNo', 'movementNo', { unique: true });
          store.createIndex('effectiveDate', 'effectiveDate', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
        if (!database.objectStoreNames.contains(CASH_LINKS)) {
          const store = database.createObjectStore(CASH_LINKS, { keyPath: 'id' });
          store.createIndex('effectiveDate', 'effectiveDate', { unique: false });
        }
        if (!database.objectStoreNames.contains(CLOSEOUTS)) {
          const store = database.createObjectStore(CLOSEOUTS, { keyPath: 'id' });
          store.createIndex('businessDate', 'businessDate', { unique: true });
        }
      };
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => database.close();
        resolve(database);
      };
      request.onerror = () => reject(request.error || new Error('تعذر فتح قاعدة البيانات المحلية.'));
      request.onblocked = () => reject(new Error('أغلق النسخة الأخرى من التطبيق ثم حاول مرة أخرى.'));
    });
    return this.databasePromise;
  }

  async getMeta(key) {
    const database = await this.open();
    const transaction = database.transaction(META, 'readonly');
    const record = await requestValue(transaction.objectStore(META).get(String(key)));
    await transactionDone(transaction);
    return record?.value ?? null;
  }

  async setMeta(key, value) {
    const database = await this.open();
    const transaction = database.transaction(META, 'readwrite');
    transaction.objectStore(META).put({ key: String(key), value });
    await transactionDone(transaction);
    return true;
  }

  async ownerPinConfigured() {
    return !!(await this.getMeta('owner.pin'));
  }

  async setOwnerPin(pin) {
    const value = validatePin(pin);
    const database = await this.open();
    const existing = await this.getMeta('owner.pin');
    if (existing) throw new Error('تم إعداد رمز المالك بالفعل؛ استخدم تغيير الرمز.');
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await derivePinHash(value, salt);
    await this.setMeta('owner.pin', { salt: bytesToBase64(salt), hash: bytesToBase64(hash), algorithm: 'PBKDF2-SHA256', iterations: 210000, updatedAt: new Date().toISOString() });
    return true;
  }

  async verifyOwnerPin(pin) {
    if (Date.now() < this.pinBlockedUntil) throw new Error('تم إيقاف المحاولة مؤقتًا بعد إدخال الرمز بشكل غير صحيح عدة مرات. حاول بعد قليل.');
    const value = validatePin(pin);
    const config = await this.getMeta('owner.pin');
    if (!config?.salt || !config?.hash) return false;
    const candidate = await derivePinHash(value, base64ToBytes(config.salt));
    const expected = base64ToBytes(config.hash);
    if (candidate.length !== expected.length) return false;
    let difference = 0;
    for (let index = 0; index < candidate.length; index += 1) difference |= candidate[index] ^ expected[index];
    const valid = difference === 0;
    if (valid) { this.failedPinAttempts = 0; this.pinBlockedUntil = 0; this.ownerSessionExpiresAt = Date.now() + 120000; }
    else { this.ownerSessionExpiresAt = 0; this.failedPinAttempts += 1; if (this.failedPinAttempts >= 5) { this.failedPinAttempts = 0; this.pinBlockedUntil = Date.now() + 30000; } }
    return valid;
  }

  async changeOwnerPin(oldPin, newPin) {
    if (!(await this.verifyOwnerPin(oldPin))) throw new Error('رمز المالك الحالي غير صحيح.');
    const value = validatePin(newPin);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await derivePinHash(value, salt);
    await this.setMeta('owner.pin', { salt: bytesToBase64(salt), hash: bytesToBase64(hash), algorithm: 'PBKDF2-SHA256', iterations: 210000, updatedAt: new Date().toISOString() });
    this.ownerSessionExpiresAt = 0;
    return true;
  }

  async setOpeningBalance(amount, businessDate) {
    this.requireOwnerSession();
    const cents = toCents(amount);
    const date = normalizeBusinessDate(businessDate);
    const database = await this.open();
    const transaction = database.transaction(META, 'readwrite');
    const store = transaction.objectStore(META);
    const existing = await requestValue(store.get('treasury.opening'));
    if (existing) { transaction.abort(); throw new Error('تم تسجيل الرصيد الافتتاحي من قبل ولا يمكن تكراره.'); }
    store.put({ key: 'treasury.opening', value: { cents, businessDate: date, createdAt: new Date().toISOString() } });
    store.put({ key: 'treasury.balance.cents', value: cents });
    await transactionDone(transaction);
    return { balance: fromCents(cents) };
  }

  async getTreasuryBalance() {
    const cents = Number(await this.getMeta('treasury.balance.cents') || 0);
    return fromCents(cents);
  }

  async recordTreasuryMovement(input) {
    this.requireOwnerSession();
    const type = String(input?.type || '');
    if (!['deposit', 'withdrawal'].includes(type)) throw new Error('نوع حركة الخزينة غير صحيح.');
    const amountCents = toCents(input?.amount);
    const reason = String(input?.reason || '').trim();
    if (!reason) throw new Error('سبب حركة الخزينة مطلوب.');
    const database = await this.open();
    const transaction = database.transaction([META, MOVEMENTS, CASH_LINKS, CLOSEOUTS], 'readwrite');
    const meta = transaction.objectStore(META);
    const movements = transaction.objectStore(MOVEMENTS);
    const [sequenceRecord, openingRecord] = await Promise.all([
      requestValue(meta.get('treasury.movement.sequence')),
      requestValue(meta.get('treasury.opening'))
    ]);
    if (!openingRecord?.value) { transaction.abort(); throw new Error('سجّل الرصيد الافتتاحي أولاً قبل إضافة حركات الخزينة.'); }
    const effectiveDate = normalizeBusinessDate(input.effectiveDate);
    if (effectiveDate < openingRecord.value.businessDate) { transaction.abort(); throw new Error('تاريخ الحركة يسبق تاريخ بدء سجل الخزينة.'); }
    const sequence = Number(sequenceRecord?.value || 0) + 1;
    const movementNo = 'TR-' + String(sequence).padStart(6, '0');
    const movement = {
      id: movementNo, movementNo, type, amountCents, reason,
      notes: String(input.notes || ''),
      effectiveDate,
      createdAt: new Date().toISOString(), balanceBeforeCents: 0, balanceAfterCents: 0,
      status: 'active'
    };
    movements.add(movement);
    meta.put({ key: 'treasury.movement.sequence', value: sequence });
    await this.recomputeTreasuryLedger(transaction, { action: 'add', movementId: movementNo, reason: 'تسجيل حركة خزينة', effectiveDate, at: new Date().toISOString() });
    const saved = await requestValue(movements.get(movementNo));
    await transactionDone(transaction);
    return { ...saved, amount: fromCents(amountCents), balanceBefore: fromCents(saved.balanceBeforeCents), balanceAfter: fromCents(saved.balanceAfterCents) };
  }

  async recomputeTreasuryLedger(transaction, correction = null) {
    const meta = transaction.objectStore(META);
    const movementsStore = transaction.objectStore(MOVEMENTS);
    const linksStore = transaction.objectStore(CASH_LINKS);
    const closeoutsStore = transaction.objectStore(CLOSEOUTS);
    const [openingRecord, movements, links, closeouts] = await Promise.all([
      requestValue(meta.get('treasury.opening')),
      requestValue(movementsStore.getAll()),
      requestValue(linksStore.getAll()),
      requestValue(closeoutsStore.getAll())
    ]);
    if (!openingRecord?.value) throw new Error('الرصيد الافتتاحي غير مسجل.');
    const opening = openingRecord.value;
    const dates = new Set();
    for (const item of movements) if (item.effectiveDate >= opening.businessDate) dates.add(item.effectiveDate);
    for (const item of links) if (item.effectiveDate >= opening.businessDate) dates.add(item.effectiveDate);
    for (const item of closeouts) if (item.businessDate >= opening.businessDate) dates.add(item.businessDate);
    let balance = Number(opening.cents || 0);
    for (const date of Array.from(dates).sort()) {
      const events = [
        ...movements.filter(item => item.effectiveDate === date).map(item => ({ kind: 'movement', item })),
        ...links.filter(item => item.effectiveDate === date).map(item => ({ kind: 'link', item }))
      ].sort((a, b) => String(a.item.createdAt || '').localeCompare(String(b.item.createdAt || '')));
      for (const event of events) {
        const item = event.item;
        if (item.status !== 'active') continue;
        const before = balance;
        const signed = Number(item.amountCents || 0) * (
          event.kind === 'movement'
            ? (item.type === 'deposit' ? 1 : -1)
            : (item.type === 'collection' ? 1 : -1)
        );
        balance += signed;
        if (balance < 0) throw new Error('التعديل سيؤدي إلى رصيد خزينة سالب بتاريخ ' + date + '.');
        item.balanceBeforeCents = before;
        item.balanceAfterCents = balance;
        if (event.kind === 'movement') movementsStore.put(item);
        else linksStore.put(item);
      }
      const closeout = closeouts.find(item => item.businessDate === date);
      if (closeout) {
        if (closeout.pendingInitialSnapshot) {
          closeout.originalExpectedCents = balance;
          closeout.originalDifferenceCents = Number(closeout.actualCents || 0) - balance;
          closeout.snapshotCapturedAt = new Date().toISOString();
          delete closeout.pendingInitialSnapshot;
        } else {
          closeout.originalExpectedCents ??= closeout.expectedCents;
          closeout.originalDifferenceCents ??= closeout.differenceCents;
          closeout.recalculatedAt = new Date().toISOString();
        }
        closeout.expectedCents = balance;
        closeout.differenceCents = Number(closeout.actualCents || 0) - balance;
        if (correction && date >= correction.effectiveDate) {
          closeout.corrections = [...(closeout.corrections || []), {
            ...correction,
            originalExpectedCents: closeout.originalExpectedCents,
            correctedExpectedCents: closeout.expectedCents,
            originalDifferenceCents: closeout.originalDifferenceCents,
            correctedDifferenceCents: closeout.differenceCents
          }];
        }
        closeoutsStore.put(closeout);
        balance = Number(closeout.actualCents || 0);
      }
    }
    meta.put({ key: 'treasury.balance.cents', value: balance });
    return fromCents(balance);
  }

  async updateTreasuryMovement(movementId, input, changeReason) {
    this.requireOwnerSession();
    const id = String(movementId || '').trim();
    const reasonForChange = String(changeReason || '').trim();
    if (!id || !reasonForChange) throw new Error('رقم الحركة وسبب التعديل مطلوبان.');
    const type = String(input?.type || '');
    if (!['deposit', 'withdrawal'].includes(type)) throw new Error('نوع حركة الخزينة غير صحيح.');
    const amountCents = toCents(input?.amount);
    const reason = String(input?.reason || '').trim();
    if (!reason) throw new Error('سبب الحركة مطلوب.');
    const effectiveDate = normalizeBusinessDate(input?.effectiveDate);
    const database = await this.open();
    const transaction = database.transaction([META, MOVEMENTS, CASH_LINKS, CLOSEOUTS], 'readwrite');
    const store = transaction.objectStore(MOVEMENTS);
    const previous = await requestValue(store.get(id));
    if (!previous || previous.status !== 'active') { transaction.abort(); throw new Error('الحركة غير موجودة أو سبق إلغاؤها.'); }
    const openingRecord = await requestValue(transaction.objectStore(META).get('treasury.opening'));
    if (!openingRecord?.value || effectiveDate < openingRecord.value.businessDate) { transaction.abort(); throw new Error('تاريخ الحركة يجب ألا يسبق تاريخ بدء الخزينة.'); }
    const now = new Date().toISOString();
    const next = {
      ...previous,
      type, amountCents, reason, effectiveDate,
      notes: String(input.notes || ''),
      updatedAt: now,
      audit: [...(previous.audit || []), {
        action: 'edit', at: now, reason: reasonForChange,
        previous: { type: previous.type, amountCents: previous.amountCents, reason: previous.reason, effectiveDate: previous.effectiveDate, notes: previous.notes || '' },
        next: { type, amountCents, reason, effectiveDate, notes: String(input.notes || '') }
      }]
    };
    store.put(next);
    const correctionDate = [previous.effectiveDate, effectiveDate].sort()[0];
    const balance = await this.recomputeTreasuryLedger(transaction, { action: 'edit', movementId: id, reason: reasonForChange, effectiveDate: correctionDate, at: now });
    await transactionDone(transaction);
    return { ...next, amount: fromCents(amountCents), balance };
  }

  async cancelTreasuryMovement(movementId, cancellationReason) {
    this.requireOwnerSession();
    const id = String(movementId || '').trim();
    const reason = String(cancellationReason || '').trim();
    if (!id || !reason) throw new Error('رقم الحركة وسبب الإلغاء مطلوبان.');
    const database = await this.open();
    const transaction = database.transaction([META, MOVEMENTS, CASH_LINKS, CLOSEOUTS], 'readwrite');
    const store = transaction.objectStore(MOVEMENTS);
    const previous = await requestValue(store.get(id));
    if (!previous || previous.status !== 'active') { transaction.abort(); throw new Error('الحركة غير موجودة أو سبق إلغاؤها.'); }
    const now = new Date().toISOString();
    const next = {
      ...previous, status: 'cancelled', cancelledAt: now, cancellationReason: reason,
      audit: [...(previous.audit || []), {
        action: 'cancel', at: now, reason,
        previous: { type: previous.type, amountCents: previous.amountCents, reason: previous.reason, effectiveDate: previous.effectiveDate, notes: previous.notes || '' }
      }]
    };
    store.put(next);
    const balance = await this.recomputeTreasuryLedger(transaction, { action: 'cancel', movementId: id, reason, effectiveDate: previous.effectiveDate, at: now });
    await transactionDone(transaction);
    return { ...next, amount: fromCents(previous.amountCents), balance };
  }

  async listTreasuryMovements() {
    const database = await this.open();
    const transaction = database.transaction(MOVEMENTS, 'readonly');
    const records = await requestValue(transaction.objectStore(MOVEMENTS).getAll());
    await transactionDone(transaction);
    return records.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).map(record => ({
      ...record, amount: fromCents(record.amountCents), balanceBefore: fromCents(record.balanceBeforeCents), balanceAfter: fromCents(record.balanceAfterCents)
    }));
  }

  // Cash collections and cash expenses are linked to the treasury balance exactly once.
  // The source payment/expense remains in the business database; this store keeps an idempotent
  // reference and its balance impact in the same transaction as the treasury balance.
  async applyCashLink(referenceId, type, amount, effectiveDate, reason) {
    const id = String(referenceId || '').trim();
    if (!id) throw new Error('مرجع العملية المالية مطلوب.');
    if (!['collection', 'expense'].includes(type)) throw new Error('نوع الربط النقدي غير صحيح.');
    const amountCents = toCents(amount);
    const database = await this.open();
    const transaction = database.transaction([META, CASH_LINKS, MOVEMENTS, CLOSEOUTS], 'readwrite');
    const meta = transaction.objectStore(META);
    const links = transaction.objectStore(CASH_LINKS);
    const [previous, openingRecord] = await Promise.all([
      requestValue(links.get(id)),
      requestValue(meta.get('treasury.opening'))
    ]);
    if (!openingRecord?.value) { transaction.abort(); throw new Error('سجّل الرصيد الافتتاحي أولاً قبل ربط التحصيلات أو المصروفات بالخزينة.'); }
    const date = normalizeBusinessDate(effectiveDate);
    if (date < openingRecord.value.businessDate) { transaction.abort(); throw new Error('تاريخ العملية يسبق تاريخ بدء سجل الخزينة. راجع تاريخ الرصيد الافتتاحي.'); }
    const label = String(reason || (type === 'collection' ? 'تحصيل نقدي' : 'مصروف نقدي'));
    if (previous?.status === 'active' && previous.type === type && Number(previous.amountCents) === amountCents && previous.effectiveDate === date && previous.reason === label) {
      transaction.abort();
      return { ...previous, amount: fromCents(amountCents), balanceBefore: fromCents(previous.balanceBeforeCents), balanceAfter: fromCents(previous.balanceAfterCents) };
    }
    const now = new Date().toISOString();
    const record = {
      id, type, amountCents, effectiveDate: date,
      reason: label,
      status: 'active', createdAt: previous?.createdAt || now, updatedAt: now,
      balanceBeforeCents: 0, balanceAfterCents: 0,
      audit: [...(previous?.audit || []), { at: now, previousAmountCents: previous?.amountCents || 0, previousStatus: previous?.status || 'new', amountCents, status: 'active' }]
    };
    links.put(record);
    await this.recomputeTreasuryLedger(transaction, { action: 'cash-link', referenceId: id, reason: label, effectiveDate: date, at: now });
    const saved = await requestValue(links.get(id));
    await transactionDone(transaction);
    return { ...saved, amount: fromCents(amountCents), balanceBefore: fromCents(saved.balanceBeforeCents), balanceAfter: fromCents(saved.balanceAfterCents) };
  }

  async removeCashLink(referenceId, reason = 'إلغاء العملية المالية') {
    this.requireOwnerSession();
    const id = String(referenceId || '').trim();
    if (!id) throw new Error('مرجع العملية المالية مطلوب.');
    const database = await this.open();
    const transaction = database.transaction([META, CASH_LINKS, MOVEMENTS, CLOSEOUTS], 'readwrite');
    const links = transaction.objectStore(CASH_LINKS);
    const previous = await requestValue(links.get(id));
    if (!previous || previous.status !== 'active') { transaction.abort(); return false; }
    const now = new Date().toISOString();
    const record = { ...previous, status: 'cancelled', updatedAt: now,
      audit: [...(previous.audit || []), { at: now, previousAmountCents: previous.amountCents, previousStatus: previous.status, status: 'cancelled', reason: String(reason || '') }] };
    links.put(record);
    const balance = await this.recomputeTreasuryLedger(transaction, { action: 'cash-link-cancel', referenceId: id, reason: String(reason || ''), effectiveDate: previous.effectiveDate, at: now });
    await transactionDone(transaction);
    return { ...record, balance };
  }

  async listCashLinks() {
    const database = await this.open();
    const transaction = database.transaction(CASH_LINKS, 'readonly');
    const records = await requestValue(transaction.objectStore(CASH_LINKS).getAll());
    await transactionDone(transaction);
    return records.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).map(record => ({ ...record, amount: fromCents(record.amountCents) }));
  }

  async createTreasuryCloseout(input) {
    this.requireOwnerSession();
    const date = normalizeBusinessDate(input?.businessDate);
    const actualCents = Number(input?.actualCents);
    if (!Number.isSafeInteger(actualCents) || actualCents < 0) throw new Error('أدخل النقدية الفعلية بقيمة صحيحة غير سالبة.');
    const database = await this.open();
    const transaction = database.transaction([META, MOVEMENTS, CASH_LINKS, CLOSEOUTS], 'readwrite');
    const meta = transaction.objectStore(META);
    const closeouts = transaction.objectStore(CLOSEOUTS);
    const [existing, openingRecord] = await Promise.all([
      requestValue(closeouts.index('businessDate').get(date)),
      requestValue(meta.get('treasury.opening'))
    ]);
    if (!openingRecord?.value) { transaction.abort(); throw new Error('سجّل الرصيد الافتتاحي أولاً قبل إقفال الخزينة.'); }
    if (date < openingRecord.value.businessDate) { transaction.abort(); throw new Error('تاريخ الإقفال يسبق تاريخ بدء سجل الخزينة.'); }
    if (existing) { transaction.abort(); throw new Error('تم إقفال هذا اليوم من قبل.'); }
    const now = new Date().toISOString();
    const closeout = {
      id: 'CLOSE-' + date, businessDate: date, createdAt: now,
      openingExpectedCents: 0, expectedCents: 0, actualCents, differenceCents: 0, pendingInitialSnapshot: true,
      notes: String(input.notes || ''), status: 'closed'
    };
    closeouts.add(closeout);
    await this.recomputeTreasuryLedger(transaction);
    const saved = await requestValue(closeouts.get(closeout.id));
    await transactionDone(transaction);
    return { ...saved, expected: fromCents(saved.expectedCents), actual: fromCents(saved.actualCents), difference: fromCents(saved.differenceCents) };
  }

  async listTreasuryCloseouts() {
    const database = await this.open();
    const transaction = database.transaction(CLOSEOUTS, 'readonly');
    const records = await requestValue(transaction.objectStore(CLOSEOUTS).getAll());
    await transactionDone(transaction);
    return records.sort((a, b) => String(b.businessDate).localeCompare(String(a.businessDate))).map(record => ({
      ...record, expected: fromCents(record.expectedCents), actual: fromCents(record.actualCents), difference: fromCents(record.differenceCents)
    }));
  }

}

export const LamsetLocalDB = new LamsetLocalDatabase();
