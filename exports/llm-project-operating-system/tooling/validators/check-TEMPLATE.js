#!/usr/bin/env node
// check-TEMPLATE.js — scaffold for a project-specific guardrail.
//
// Method kernel — portable. Copy this file to check-<your-rule>.js, implement
// the scan, and wire it into package.json scripts (and .githooks/pre-commit if
// it is fast enough, < ~2s) so the gate enforces it.
//
// Contract every checker in this bundle follows:
//   - Walk the relevant source set (src/, or staged files for a pre-commit gate).
//   - Collect violations as {file, line, message}.
//   - Print them human-readably.
//   - process.exit(1) on any violation, exit(0) when clean. Nothing else.
//
// Keep checkers dependency-light: the node-only validators in this directory
// (complexity, file-size, constant-names, ...) use only node: builtins so they
// run anywhere without install. Reach for a devDependency only when you must.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

// --- configure ---------------------------------------------------------------
const ROOT = process.cwd();
const SCAN_DIRS = ['src']; // directories to walk
const EXTENSIONS = new Set(['.js', '.mjs', '.ts']);
const RULE_NAME = 'example-no-todo-without-owner';

// --- walk --------------------------------------------------------------------
function* files(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      yield* files(full);
    } else if (EXTENSIONS.has(path.extname(entry.name))) {
      yield full;
    }
  }
}

// --- the rule (replace this) -------------------------------------------------
// Example: a bare TODO with no "(owner)" tag is a violation.
function violationsIn(file) {
  const out = [];
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((text, i) => {
    if (/\bTODO\b/.test(text) && !/TODO\s*\(/.test(text)) {
      out.push({file, line: i + 1, message: 'TODO without an (owner) tag'});
    }
  });
  return out;
}

// --- driver ------------------------------------------------------------------
const violations = [];
for (const dir of SCAN_DIRS) {
  for (const file of files(path.join(ROOT, dir))) {
    violations.push(...violationsIn(file));
  }
}

if (violations.length) {
  console.error(`[${RULE_NAME}] ${violations.length} violation(s):`);
  for (const v of violations) {
    console.error(`  ${path.relative(ROOT, v.file)}:${v.line}  ${v.message}`);
  }
  process.exit(1);
}
console.log(`[${RULE_NAME}] clean`);
process.exit(0);
