const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.resolve(__dirname, '..');
const database = fs.readFileSync(path.join(root, 'www/lamset-local-db.js'), 'utf8');
const bridge = fs.readFileSync(path.join(root, 'www/mobile-bridge.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'www/index.html'), 'utf8');

assert(database.includes("indexedDB.open(DB_NAME, DB_VERSION)"), 'Local IndexedDB database must be initialized');
assert(database.includes("store.createIndex('movementNo', 'movementNo', { unique: true })"), 'Treasury movement numbers must be unique');
assert(database.includes("database.transaction([META, MOVEMENTS], 'readwrite')"), 'Treasury movement and balance must share one read-write transaction');
assert(database.includes('if (after < 0)'), 'Withdrawals must not produce a negative balance');
assert(database.includes("'TR-' + String(sequence).padStart(6, '0')"), 'Treasury movement numbers must be generated serially');
assert(database.includes("iterations: 210000") && database.includes("hash: 'SHA-256'"), 'Owner PIN must use PBKDF2-SHA256');
assert(!/localStorage\.(?:setItem|getItem)\([^\n]*pin/i.test(database), 'Owner PIN must not be stored in localStorage');
assert(bridge.includes('window.lamsetRequireOwnerPin'), 'Owner PIN verification dialog must be exposed to the app');
assert(html.includes("window.lamsetRequireOwnerPin('عرض تكلفة التصنيع')"), 'Manufacturing cost reveal must require owner PIN');
console.log('Local database atomicity, treasury safeguards, and owner PIN checks passed.');
