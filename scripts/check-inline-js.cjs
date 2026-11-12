#!/usr/bin/env node
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const htmlPath = path.resolve('www/index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const scriptTag = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
const checked = [];
let match;
let index = 0;
let failed = false;

while ((match = scriptTag.exec(html)) !== null) {
  const attrs = match[1] || '';
  const source = match[2] || '';
  if (/\bsrc\s*=/i.test(attrs)) continue;

  const typeMatch = attrs.match(/\btype\s*=\s*["']([^"']+)["']/i);
  const type = typeMatch ? typeMatch[1].toLowerCase().trim() : '';
  if (type && !['module', 'text/javascript', 'application/javascript', 'text/ecmascript', 'application/ecmascript'].includes(type)) continue;
  if (!source.trim()) continue;

  const extension = type === 'module' ? '.mjs' : '.cjs';
  const tempPath = path.join(os.tmpdir(), 'lamset-inline-' + index + extension);
  fs.writeFileSync(tempPath, source, 'utf8');
  const result = spawnSync(process.execPath, ['--check', tempPath], { encoding: 'utf8' });
  checked.push(index);
  if (result.status !== 0) {
    failed = true;
    const lineInScript = (result.stderr || result.stdout || 'Unknown syntax error').match(/:(\d+)(?::\d+)?\s*\n/);
    const htmlLine = html.slice(0, match.index).split('\n').length;
    console.error('JavaScript syntax error in inline script #' + index +
      ' (HTML starts near line ' + htmlLine +
      (lineInScript ? ', script line ' + lineInScript[1] : '') + '):');
    console.error(result.stderr || result.stdout);
  }
  fs.rmSync(tempPath, { force: true });
  index++;
}

if (checked.length === 0) {
  console.error('No inline JavaScript blocks were found to validate.');
  process.exit(1);
}
if (failed) process.exit(1);
console.log('Validated ' + checked.length + ' inline JavaScript block(s) in www/index.html.');
