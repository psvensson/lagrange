#!/usr/bin/env node
// The change-proof orchestrator.
//
//   node scripts/select-change-tests.js [--base <sha>] [--head <sha>] [--explain]
//
// This is what `npm test` runs. Without --base it proves the WORKING TREE,
// which is the inner-loop case; --base adds a committed range on top of it.
//
// It has exactly four responsibilities and no others:
//
//   1. load the fixed safety spine        (unconditional)
//   2. ask the selector for variable proof (PRECISE / WIDENED / REFUSED)
//   3. union and deduplicate
//   4. execute
//
// No ownership inference, no impact reasoning, no classification logic lives
// here - those belong to the selector library, which is itself exercised by
// tests inside the unconditional spine. That separation is what makes it safe
// for the spine to contain the selector's own contracts:
//
//   Layer 0  runner        can we execute an explicit list of files?
//   Layer 1  safety spine  is the machinery that makes selection trustworthy intact?
//   Layer 2  selector      which additional tests does THIS change require?
//
// Each layer proves the next. A selector that returned nothing would still
// leave the spine running, and the spine contains the selector's contract.

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {selectChangedTests} from './checks/change-selection.js';
import {changedRecords, semanticPaths} from './checks/changed-paths.js';
import {
  PACKAGE_MANIFEST_PATH,
  REASON_SAFETY_SPINE,
  REFUSAL_RELEASE_PROOF_REQUIRED,
  REFUSAL_BANNER,
  RELEASE_PROOF_HINT,
  SAFETY_SPINE_PATH,
  SELECTION_REFUSED,
} from './checks/change-selection-constants.js';

const UTF8 = 'utf8';
const BASE_FLAG = '--base';
const HEAD_FLAG = '--head';
const EXPLAIN_FLAG = '--explain';
const LIST_FLAG = '--list';
const RUNNER = 'scripts/run-test-files.js';
const DEFAULT_HEAD = 'HEAD';
const NEWLINE = '\n';
const INDENT = '  ';
const BLANK = '';
const LABEL_CHANGED = 'changed:';
const LABEL_SUBSYSTEMS = 'subsystems:';
const LABEL_SELECTED_BY = 'selected by:';
const LABEL_SELECTION = 'selection:';
const LABEL_REASON = 'reason:';
const LABEL_TOTAL = 'total:';
const REFUSED_LABEL = 'REFUSED';
const TESTS_SUFFIX = ' test(s)';
const UNIQUE_TESTS_SUFFIX = ' unique test(s)';
const USAGE =
  'usage: node scripts/select-change-tests.js [--base <sha>] [--head <sha>] ' +
  '[--explain] [--list]\n';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function loadSafetySpine(spineRoot = root) {
  return JSON.parse(
    fs.readFileSync(path.join(spineRoot, SAFETY_SPINE_PATH), UTF8)).tests;
}

// Both sides of a rename and the vanished side of a deletion: a change that
// removed src/raft/x.js must still prove storage-raft, and a rename that
// crosses a subsystem boundary must prove BOTH owners.
export function changedPathsBetween(base, head, gitRoot = root) {
  const records = changedRecords({root: gitRoot, base, head});
  return records === null ? null : semanticPaths(records);
}

// Which top-level package.json keys differ between the two states. Computed
// here because it needs both; the selector stays a pure function of what it is
// told, and refuses when this cannot be determined.
//
// The AFTER state is the WORKING TREE unless a head revision is named, because
// the worktree is exactly what changedRecords already reports on. Comparing two
// committed revisions instead would read "no fields changed" for an
// uncommitted `dependencies` edit and let a dependency change - the broadest
// change there is - take the modular path.
export function changedPackageFields(base, head, gitRoot = root) {
  const parse = (text) => {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  };
  const fromRevision = (revision) => {
    const result = spawnSync('git',
      ['show', `${revision}:${PACKAGE_MANIFEST_PATH}`],
      {cwd: gitRoot, encoding: UTF8});
    return result.status === 0 ? parse(result.stdout) : null;
  };
  const fromWorktree = () => {
    try {
      return parse(fs.readFileSync(
        path.join(gitRoot, PACKAGE_MANIFEST_PATH), UTF8));
    } catch {
      return null;
    }
  };
  const before = fromRevision(base || DEFAULT_HEAD);
  const after = head ? fromRevision(head) : fromWorktree();
  if (!before || !after) return null;
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter((key) =>
    JSON.stringify(before[key]) !== JSON.stringify(after[key])).sort();
}

// The union. The spine is added HERE, unconditionally, never by the selector.
export function buildExecutionPlan({
  changedPaths,
  packageFields,
  planRoot = root,
  selector = selectChangedTests,
  spine = loadSafetySpine,
}) {
  const selection = selector({
    root: planRoot,
    changedPaths,
    changedPackageFields: packageFields,
  });
  const selected = selection.tests || [];
  const spineTests = spine(planRoot);
  const merged = new Map();
  for (const testPath of spineTests) merged.set(testPath, [REASON_SAFETY_SPINE]);
  for (const entry of selected) {
    const existing = merged.get(entry.path) || [];
    merged.set(entry.path, [...new Set([...existing, ...entry.reasons])]);
  }
  return {
    kind: selection.kind,
    refusals: selection.refusals || [],
    refusalCode: selection.refusalCode || null,
    subsystems: selection.subsystems || [],
    changedPaths,
    spineCount: spineTests.length,
    selectedCount: selected.length,
    tests: [...merged.keys()].sort()
      .map((testPath) => ({path: testPath, reasons: merged.get(testPath)})),
  };
}

// The ONE refusal rendering, shared by the dry run and the real command, so a
// caller can never meet a refusal shape it has not been taught to read. It
// always carries the banner and the machine-readable code; the release hint is
// added only where a release proof is actually the answer, because suggesting
// `check:release` for an unclassifiable path would teach operators to reach for
// the expensive command instead of fixing the taxonomy.
function renderRefusal(plan) {
  const lines = [REFUSAL_BANNER, `${INDENT}${LABEL_REASON} ${plan.refusalCode}`];
  for (const refusal of plan.refusals) lines.push(INDENT + refusal);
  if (plan.refusalCode === REFUSAL_RELEASE_PROOF_REQUIRED) {
    lines.push(INDENT + RELEASE_PROOF_HINT);
  }
  return lines.join(NEWLINE) + NEWLINE;
}

function renderExplain(plan) {
  const lines = [LABEL_CHANGED];
  for (const changed of plan.changedPaths) lines.push(INDENT + changed);
  if (plan.kind === SELECTION_REFUSED) {
    lines.push(BLANK, LABEL_SELECTION, `${INDENT}${REFUSED_LABEL}`, BLANK);
    return lines.join(NEWLINE) + NEWLINE + renderRefusal(plan);
  }
  lines.push(BLANK, LABEL_SUBSYSTEMS);
  for (const subsystem of plan.subsystems) lines.push(INDENT + subsystem);
  const byReason = new Map();
  for (const entry of plan.tests) {
    for (const reason of entry.reasons) {
      if (!byReason.has(reason)) byReason.set(reason, []);
      byReason.get(reason).push(entry.path);
    }
  }
  lines.push(BLANK, LABEL_SELECTED_BY);
  for (const reason of [...byReason.keys()].sort()) {
    lines.push(
      `${INDENT}${reason}: ${byReason.get(reason).length}${TESTS_SUFFIX}`);
  }
  lines.push(BLANK, LABEL_SELECTION, `${INDENT}${plan.kind}`);
  lines.push(BLANK, LABEL_TOTAL,
    `${INDENT}${plan.tests.length}${UNIQUE_TESTS_SUFFIX}`);
  return lines.join(NEWLINE) + NEWLINE;
}

// An optional flag that is present but has no value is a usage error, never a
// silently ignored one: `--base` with a missing sha must not quietly downgrade
// to a worktree-only proof.
function flagValue(argv, flag) {
  if (!argv.includes(flag)) return {present: false, value: null};
  return {present: true, value: argv[argv.indexOf(flag) + 1] || null};
}

function parseInvocation(argv) {
  const base = flagValue(argv, BASE_FLAG);
  const head = flagValue(argv, HEAD_FLAG);
  return {
    valid: !(base.present && !base.value) && !(head.present && !head.value),
    base: base.value,
    head: head.value,
    headRevision: head.value || DEFAULT_HEAD,
    explain: argv.includes(EXPLAIN_FLAG),
    list: argv.includes(LIST_FLAG),
  };
}

function main() {
  const invocation = parseInvocation(process.argv.slice(2));
  if (!invocation.valid) {
    process.stderr.write(USAGE);
    process.exitCode = 1;
    return;
  }
  const changedPaths = changedPathsBetween(
    invocation.base, invocation.headRevision);
  if (changedPaths === null) {
    process.stderr.write(
      `cannot diff ${invocation.base}..${invocation.headRevision}${NEWLINE}`);
    process.exitCode = 1;
    return;
  }
  const plan = buildExecutionPlan({
    changedPaths,
    packageFields: changedPackageFields(invocation.base, invocation.head),
  });

  if (invocation.explain) {
    process.stdout.write(renderExplain(plan));
    if (plan.kind === SELECTION_REFUSED) process.exitCode = 1;
    return;
  }
  if (plan.kind === SELECTION_REFUSED) {
    process.stderr.write(renderRefusal(plan));
    process.exitCode = 1;
    return;
  }
  if (invocation.list) {
    process.stdout.write(
      plan.tests.map((entry) => entry.path).join(NEWLINE) + NEWLINE);
    return;
  }
  process.stdout.write(
    `${plan.kind}: ${plan.tests.length}${TESTS_SUFFIX} ` +
    `(${plan.spineCount} spine, ${plan.selectedCount} selected)${NEWLINE}`);
  const result = spawnSync(process.execPath,
    [RUNNER, ...plan.tests.map((entry) => entry.path)],
    {cwd: root, stdio: 'inherit'});
  process.exitCode = result.status === null ? 1 : result.status;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
