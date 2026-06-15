#!/usr/bin/env node
// Installer for the LLM Project Operating System bundle.
//
//   node apply.js <target-repo-dir> [--force]
//
// Copies the bundle into a target git repository, places the git hooks,
// merges the npm-script + devDependency fragment into the target package.json,
// and wires core.hooksPath. Idempotent-ish: refuses to overwrite existing files
// unless --force is given (package.json is always merged, never overwritten).

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const BUNDLE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const force = args.includes('--force');
const target = args.find((a) => !a.startsWith('--'));

if (!target) {
  console.error('Usage: node apply.js <target-repo-dir> [--force]');
  process.exit(2);
}
const TARGET = path.resolve(target);
if (!fs.existsSync(TARGET)) {
  console.error(`Target does not exist: ${TARGET}`);
  process.exit(2);
}

// Top-level bundle entries copied into the target repo root.
const COPY = [
  'AGENTS.md',
  'steering',
  'ledger',
  'tooling',
  'governance',
  'docs',
  '.claude',
  'architecture',
  'LICENSE',
  'NOTICE',
];
// Bundle files that are NOT copied into a consuming repo (they describe the export itself).
const SKIP = new Set(['apply.js', 'EXPORT-PLAN.md', 'README.md', 'ci']);

let copied = 0;
let skipped = 0;

function copyRecursive(src, dst) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dst, {recursive: true});
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dst, entry));
    }
    return;
  }
  if (fs.existsSync(dst) && !force) {
    console.warn(`  skip (exists): ${path.relative(TARGET, dst)}`);
    skipped++;
    return;
  }
  fs.mkdirSync(path.dirname(dst), {recursive: true});
  fs.copyFileSync(src, dst);
  copied++;
}

console.log(`Applying LLM Project Operating System -> ${TARGET}`);
for (const entry of COPY) {
  const src = path.join(BUNDLE, entry);
  if (!fs.existsSync(src) || SKIP.has(entry)) continue;
  copyRecursive(src, path.join(TARGET, entry));
}

// Place git hooks payload at <target>/.githooks (install.js sets core.hooksPath there).
const hooksSrc = path.join(BUNDLE, 'tooling', 'hooks', 'githooks');
if (fs.existsSync(hooksSrc)) {
  copyRecursive(hooksSrc, path.join(TARGET, '.githooks'));
  for (const h of fs.readdirSync(path.join(TARGET, '.githooks'))) {
    try {
      fs.chmodSync(path.join(TARGET, '.githooks', h), 0o755);
    } catch {
      /* best effort */
    }
  }
}

// Merge the npm-script + devDependency fragment into the target package.json.
const fragPath = path.join(BUNDLE, 'tooling', 'package.scripts.json');
const frag = JSON.parse(fs.readFileSync(fragPath, 'utf8'));
const pkgPath = path.join(TARGET, 'package.json');
const pkg = fs.existsSync(pkgPath)
  ? JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
  : {name: path.basename(TARGET), version: '0.0.0', type: 'module'};

pkg.scripts = pkg.scripts || {};
pkg.devDependencies = pkg.devDependencies || {};
let addedScripts = 0;
for (const [k, v] of Object.entries(frag.scripts)) {
  if (k === '_comment') continue;
  if (pkg.scripts[k] && pkg.scripts[k] !== v && !force) {
    console.warn(`  script kept (differs): ${k}`);
    continue;
  }
  pkg.scripts[k] = v;
  addedScripts++;
}
for (const [k, v] of Object.entries(frag.devDependencies)) {
  if (k === '_comment') continue;
  if (!pkg.devDependencies[k]) pkg.devDependencies[k] = v;
}
if (!pkg.type) pkg.type = 'module';
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

// Wire core.hooksPath via the bundled installer (runs in the target repo).
let hooksInstalled = false;
try {
  execFileSync('node', [path.join(TARGET, 'tooling', 'hooks', 'install.js')], {
    cwd: TARGET,
    stdio: 'inherit',
  });
  hooksInstalled = true;
} catch (err) {
  console.warn(`  hooks:install skipped (${err.message}). Run it manually in the target repo.`);
}

console.log('\nDone.');
console.log(`  files copied:   ${copied}${skipped ? ` (${skipped} skipped — use --force to overwrite)` : ''}`);
console.log(`  scripts merged: ${addedScripts}`);
console.log(`  git hooks:      ${hooksInstalled ? 'core.hooksPath -> .githooks' : 'NOT wired (see warning)'}`);
console.log('\nNext steps:');
console.log('  1. npm install              # pull the validator devDependencies');
console.log('  2. npm run steering:llm:pack # regenerate the compact packs');
console.log('  3. Edit steering/*.md + governance/edition-matrix.template.md for THIS project');
console.log('  4. node tooling/solve.js new --id <first-quest>');
