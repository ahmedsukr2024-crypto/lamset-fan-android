#!/usr/bin/env node
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const htmlPath = path.resolve('www/index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const scriptTag = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
const checked = [];
const classicSources = [];
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

  if (!type || type === 'text/javascript' || type === 'application/javascript' || type === 'text/ecmascript' || type === 'application/ecmascript') classicSources.push(source);

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
if (classicSources.length > 1) {
  const combinedPath = path.join(os.tmpdir(), 'lamset-inline-combined.cjs');
  fs.writeFileSync(combinedPath, classicSources.join('\n;\n'), 'utf8');
  const combinedResult = spawnSync(process.execPath, ['--check', combinedPath], { encoding: 'utf8' });
  fs.rmSync(combinedPath, { force: true });
  if (combinedResult.status !== 0) {
    failed = true;
    console.error('Cross-script JavaScript conflict detected (for example, a repeated top-level let/const declaration):');
    console.error(combinedResult.stderr || combinedResult.stdout);
  }
}
if (failed) process.exit(1);
console.log('Validated ' + checked.length + ' inline JavaScript block(s) and cross-script declarations in www/index.html.');
