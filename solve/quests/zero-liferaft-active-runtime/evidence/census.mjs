#!/usr/bin/env node
// Reachability/ownership census for quest zero-liferaft-active-runtime.
//
// The census is measured at the sealed commit, never at the moving head: the
// hit set is every tracked file whose path or content matches one of the
// census token classes there. Each hit is classified by rule, never by
// opinion:
//   - solve/** and the dated solver handover record handover/** are
//     HISTORICAL_SOLVE_EVIDENCE (append-only provenance, no disposition);
//   - src/** outside src/test-helpers is PRODUCTION_REACHABLE when the static
//     import closure of the production entrypoints reaches it at the sealed
//     commit, otherwise DEAD_CODE;
//   - test/** and src/test-helpers/** are ACTIVE_TEST (test/shards,
//     test/manifests and test/distributed/config are ACTIVE_CONFIG);
//   - markdown, architecture/**, docs/** and models/** are ACTIVE_DOC;
//   - everything else (manifests, lockfile, scripts, vendor provenance) is
//     ACTIVE_CONFIG.
// Every non-historical hit carries one disposition from DISPOSITION_RULES
// (first match wins; an unmatched hit is a census failure).
//
//   node census.mjs --write    classify and write census.json
//   node census.mjs --verify   recompute, compare with census.json, and
//                              check the working tree honours every
//                              disposition (delete: absent; migrate and
//                              preserve: present with no retired token)

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const SEALED_COMMIT = '0023e74ae4a0ab1df199ca8557a14c45fc4e6340';
const QUEST_DIR = 'solve/quests/zero-liferaft-active-runtime';
const CENSUS_FILE = `${QUEST_DIR}/evidence/census.json`;
const SCHEMA = 'zero-liferaft-census/1';
const GIT_BUFFER = 256 * 1024 * 1024;

const TOKEN_CLASSES = Object.freeze({
  'legacy-implementation': 'liferaft|markwylde',
  'provider-selection': 'raft[-_]?provider',
  'spike-and-rollback':
    'raft[-_]logic|rollback[-_]drill|migration[-_]rollback|raft-migration',
  'legacy-consumer-module':
    'raft-group(\\.js|-constants)|\\bRaftGroup\\b|raft-replica-base|' +
    'RaftReplicaBase|in-memory-log-adapter|InMemoryLogAdapter|' +
    'raft-timing-utils|src/worker/|\\.\\./worker/|system-cache-proxy',
});
// The tokens the active-surface zero-reference checker refuses. A migrate or
// preserve disposition is honoured only when none of them remains.
const RETIRED_TOKEN_SOURCE = 'liferaft|markwylde|raft[-_]?provider';

const CATEGORY = Object.freeze({
  PRODUCTION_REACHABLE: 'PRODUCTION_REACHABLE',
  ACTIVE_TEST: 'ACTIVE_TEST',
  ACTIVE_CONFIG: 'ACTIVE_CONFIG',
  ACTIVE_DOC: 'ACTIVE_DOC',
  DEAD_CODE: 'DEAD_CODE',
  HISTORICAL_SOLVE_EVIDENCE: 'HISTORICAL_SOLVE_EVIDENCE',
});
const DISPOSITION = Object.freeze({
  MIGRATE: 'migrate',
  PRESERVE: 'preserve-as-backend-neutral',
  DELETE: 'delete',
});

// Production entrypoints: package main/exports/bin, the Docker CMD, and the
// SEA bundles that production spawns (service worker, request-cell worker).
// The SEA "Replica Worker" bundle is deliberately not an entrypoint: nothing
// in production constructs the manager that would spawn it (census decision
// 5 of the epic), so its reachability is measured, not assumed.
const PRODUCTION_ENTRYPOINTS = Object.freeze([
  'src/index.js',
  'src/public-api.js',
  'src/sea-entry.js',
  'src/cli/bin/lagrange-admin.js',
  'src/threading/service-worker.js',
  'src/runtime/wasi-component-cell-worker.js',
]);

const DISPOSITION_RULES = await loadDispositionRules();

async function loadDispositionRules() {
  const module = await import('./census-dispositions.mjs');
  return module.DISPOSITION_RULES;
}

function git(args) {
  return execFileSync('git', args, {encoding: 'utf8', maxBuffer: GIT_BUFFER});
}

function gitLines(args) {
  try {
    return git(args).split('\n').filter(Boolean);
  } catch (error) {
    if (error.status === 1) return [];
    throw error;
  }
}

function trackedFilesAt(commit) {
  return gitLines(['ls-tree', '-r', '--name-only', commit]);
}

function contentHitsAt(commit, source) {
  const prefix = `${commit}:`;
  return gitLines(['grep', '-l', '-I', '-i', '-E', source, commit, '--', '.'])
    .map((line) => (line.startsWith(prefix) ? line.slice(prefix.length) : line));
}

function readBlobsAt(commit, files) {
  const input = files.map((file) => `${commit}:${file}`).join('\n');
  const output = execFileSync('git', ['cat-file', '--batch'], {
    input: `${input}\n`, maxBuffer: GIT_BUFFER,
  });
  const contents = new Map();
  let offset = 0;
  for (const file of files) {
    const headerEnd = output.indexOf(0x0a, offset);
    const header = output.subarray(offset, headerEnd).toString('utf8');
    const size = Number(header.split(' ')[2]);
    if (!Number.isInteger(size)) {
      offset = headerEnd + 1;
      continue;
    }
    const start = headerEnd + 1;
    contents.set(file, output.subarray(start, start + size).toString('utf8'));
    offset = start + size + 1;
  }
  return contents;
}

const SPECIFIER_PATTERNS = Object.freeze([
  /\bfrom\s*['"]([^'"]+)['"]/gu,
  /\bimport\s*['"]([^'"]+)['"]/gu,
  /\bimport\(\s*['"]([^'"]+)['"]\s*\)/gu,
  /\brequire\(\s*['"]([^'"]+)['"]\s*\)/gu,
  // Over-approximation on purpose: any relative module path written as a
  // string literal (dynamic import specifiers held in constants, worker
  // URLs) counts as an edge, so DEAD_CODE is never claimed by a missed edge.
  /['"](\.{1,2}\/[^'"\s]+\.(?:m?js|cjs))['"]/gu,
]);

// Comments name modules without loading them (JSDoc `import('...')` type
// references, prose), so they are stripped before edges are read.
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//gu;
const LINE_COMMENT = /(^|[^:'"`\\])\/\/.*$/gmu;

function specifiersOf(source) {
  const code = source.replace(BLOCK_COMMENT, '').replace(LINE_COMMENT, '$1');
  const found = new Set();
  for (const pattern of SPECIFIER_PATTERNS) {
    for (const match of code.matchAll(pattern)) found.add(match[1]);
  }
  return [...found];
}

function resolveSpecifier(fromFile, specifier, tracked) {
  if (!specifier.startsWith('.')) return null;
  const base = path.posix.normalize(
    path.posix.join(path.posix.dirname(fromFile), specifier));
  const candidates = [base, `${base}.js`, `${base}/index.js`];
  return candidates.find((candidate) => tracked.has(candidate)) ?? null;
}

function productionClosureAt(commit, trackedList) {
  const tracked = new Set(trackedList);
  const sources = trackedList.filter((file) => file.startsWith('src/') &&
    /\.(?:m?js|cjs)$/u.test(file));
  const contents = readBlobsAt(commit, sources);
  const reached = new Set();
  const queue = [...PRODUCTION_ENTRYPOINTS];
  while (queue.length > 0) {
    const file = queue.pop();
    if (reached.has(file) || !contents.has(file)) continue;
    reached.add(file);
    for (const specifier of specifiersOf(contents.get(file))) {
      const target = resolveSpecifier(file, specifier, tracked);
      if (target && !reached.has(target)) queue.push(target);
    }
  }
  return reached;
}

function categoryOf(file, reachable) {
  if (file.startsWith('solve/') || file.startsWith('handover/')) {
    return CATEGORY.HISTORICAL_SOLVE_EVIDENCE;
  }
  if (file.startsWith('src/test-helpers/')) return CATEGORY.ACTIVE_TEST;
  if (file.startsWith('src/')) {
    return reachable.has(file) ? CATEGORY.PRODUCTION_REACHABLE :
      CATEGORY.DEAD_CODE;
  }
  if (file.startsWith('test/shards/') || file.startsWith('test/manifests/') ||
      file.startsWith('test/distributed/config/')) {
    return CATEGORY.ACTIVE_CONFIG;
  }
  if (file.startsWith('test/')) return CATEGORY.ACTIVE_TEST;
  if (file.endsWith('.md') || file.startsWith('architecture/') ||
      file.startsWith('docs/') || file.startsWith('models/')) {
    return CATEGORY.ACTIVE_DOC;
  }
  return CATEGORY.ACTIVE_CONFIG;
}

function dispositionOf(file, category) {
  if (category === CATEGORY.HISTORICAL_SOLVE_EVIDENCE) return null;
  const rule = DISPOSITION_RULES.find(([matcher]) =>
    (typeof matcher === 'string' ? (matcher.endsWith('/') ?
      file.startsWith(matcher) : file === matcher) : matcher.test(file)));
  if (!rule) return {disposition: null, owner: null, reason: null};
  const [, disposition, owner, reason, replacement] = rule;
  return {disposition, owner, reason, ...(replacement ? {replacement} : {})};
}

function measureCensus() {
  const tracked = trackedFilesAt(SEALED_COMMIT);
  const reachable = productionClosureAt(SEALED_COMMIT, tracked);
  const byFile = new Map();
  const note = (file, kind, tokenClass) => {
    if (!byFile.has(file)) byFile.set(file, {name: new Set(), content: new Set()});
    byFile.get(file)[kind].add(tokenClass);
  };
  for (const [tokenClass, source] of Object.entries(TOKEN_CLASSES)) {
    const pattern = new RegExp(source, 'iu');
    for (const file of tracked) {
      if (pattern.test(file)) note(file, 'name', tokenClass);
    }
    for (const file of contentHitsAt(SEALED_COMMIT, source)) {
      note(file, 'content', tokenClass);
    }
  }
  const entries = [...byFile.keys()].sort().map((file) => {
    const hits = byFile.get(file);
    const category = categoryOf(file, reachable);
    return {
      path: file,
      category,
      nameTokens: [...hits.name].sort(),
      contentTokens: [...hits.content].sort(),
      ...(dispositionOf(file, category) ?? {}),
    };
  });
  return {entries, reachableCount: reachable.size};
}

function summarize(entries) {
  const summary = {};
  for (const entry of entries) {
    const key = entry.disposition ?
      `${entry.category}/${entry.disposition}` : entry.category;
    summary[key] = (summary[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(summary).sort());
}

function writeCensus() {
  const {entries, reachableCount} = measureCensus();
  const unclassified = entries.filter((entry) =>
    entry.category !== CATEGORY.HISTORICAL_SOLVE_EVIDENCE && !entry.disposition);
  const payload = {
    schema: SCHEMA,
    quest: 'zero-liferaft-active-runtime',
    sealedCommit: SEALED_COMMIT,
    tokenClasses: TOKEN_CLASSES,
    retiredTokenSource: RETIRED_TOKEN_SOURCE,
    productionEntrypoints: PRODUCTION_ENTRYPOINTS,
    productionClosureSize: reachableCount,
    summary: summarize(entries),
    entries,
  };
  fs.writeFileSync(CENSUS_FILE, `${JSON.stringify(payload, null, 2)}\n`);
  process.stdout.write(`${CENSUS_FILE}: ${entries.length} hits, ` +
    `${unclassified.length} without disposition\n`);
  for (const entry of unclassified) {
    process.stdout.write(`  UNCLASSIFIED ${entry.category} ${entry.path}\n`);
  }
}

function retiredHitsInWorkingTree(file) {
  const pattern = new RegExp(RETIRED_TOKEN_SOURCE, 'iu');
  if (pattern.test(file)) return ['path'];
  const content = fs.readFileSync(file, 'utf8');
  return pattern.test(content) ? ['content'] : [];
}

function honourProblems(entry) {
  if (entry.category === CATEGORY.HISTORICAL_SOLVE_EVIDENCE) return [];
  if (!entry.disposition) return ['no disposition'];
  const exists = fs.existsSync(entry.path);
  if (entry.disposition === DISPOSITION.DELETE) {
    const problems = exists ? ['delete disposition but the file exists'] : [];
    if (entry.replacement && !fs.existsSync(entry.replacement)) {
      problems.push(`replacement ${entry.replacement} is missing`);
    }
    return problems;
  }
  if (!exists) return [`${entry.disposition} disposition but the file is absent`];
  const retired = retiredHitsInWorkingTree(entry.path);
  return retired.length > 0 ?
    [`${entry.disposition} disposition but a retired token remains in ${retired}`] :
    [];
}

function verifyCensus() {
  const recorded = JSON.parse(fs.readFileSync(CENSUS_FILE, 'utf8'));
  const {entries} = measureCensus();
  const problems = [];
  if (recorded.schema !== SCHEMA || recorded.sealedCommit !== SEALED_COMMIT) {
    problems.push('census.json schema or sealed commit differs');
  }
  const recordedByPath = new Map(recorded.entries.map((entry) => [entry.path, entry]));
  for (const entry of entries) {
    const stored = recordedByPath.get(entry.path);
    if (!stored) {
      problems.push(`unrecorded hit ${entry.path}`);
      continue;
    }
    for (const field of ['category', 'disposition']) {
      if ((stored[field] ?? null) !== (entry[field] ?? null)) {
        problems.push(`${entry.path}: recorded ${field} ${stored[field]} ` +
          `!= measured ${entry[field]}`);
      }
    }
    for (const problem of honourProblems(entry)) {
      problems.push(`${entry.path}: ${problem}`);
    }
    recordedByPath.delete(entry.path);
  }
  for (const phantom of recordedByPath.keys()) {
    problems.push(`recorded entry ${phantom} is not a measured hit`);
  }
  if (problems.length > 0) {
    process.stderr.write(`census verification FAILED (${problems.length}):\n`);
    for (const problem of problems) process.stderr.write(`  ${problem}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`census verified: ${entries.length} hits classified ` +
    'and every disposition honoured by the working tree\n');
}

const mode = process.argv[2];
if (mode === '--write') {
  writeCensus();
} else if (mode === '--verify') {
  verifyCensus();
} else {
  process.stderr.write('usage: census.mjs --write | --verify\n');
  process.exitCode = 2;
}
