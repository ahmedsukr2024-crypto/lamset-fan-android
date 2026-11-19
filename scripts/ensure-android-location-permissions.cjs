#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const manifestPath = path.join(process.cwd(), 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
if (!fs.existsSync(manifestPath)) {
  console.error('AndroidManifest.xml غير موجود. نفّذ npx cap add android أولاً.');
  process.exit(1);
}

let xml = fs.readFileSync(manifestPath, 'utf8');
const requiredPermissions = [
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_COARSE_LOCATION'
];

if (!/<manifest\\b/.test(xml) || !/<application\\b/.test(xml)) {
  console.error('تعذر التحقق من بنية AndroidManifest.xml؛ لم يتم تعديل الملف.');
  process.exit(1);
}

const missing = requiredPermissions.filter(permission =>
  !xml.includes('android:name="' + permission + '"') &&
  !xml.includes("android:name='" + permission + "'")
);

if (missing.length) {
  const declarations = missing.map(permission =>
    '    <uses-permission android:name="' + permission + '" />'
  ).join('\\n');
  xml = xml.replace(/(<application\\b)/, declarations + '\\n\\n    $1');
  fs.writeFileSync(manifestPath, xml, 'utf8');
  console.log('تمت إضافة صلاحيات الموقع: ' + missing.join(', '));
} else {
  console.log('صلاحيات الموقع موجودة بالفعل؛ لا حاجة لأي تعديل.');
}
