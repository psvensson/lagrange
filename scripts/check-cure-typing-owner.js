// Cure-typing census — quest cure-typing-single-owner-table
// (epic self-hosting-circularity-generic-treatment Option 5, fourth semantic;
// 2b5875b0 lineage: the planner re-minted impotent count-neutral cure
// REPLACEs against a 1-2 voter ledger view because "what condition does this
// move cure" was re-inferred from raw count diffs at the site — REPLACE cures
// placement skew, ADD cures under-replication, REMOVE cures surplus/failure —
// and the (cure x partition class) -> admission-lane assignment is a per-site
// (moveType x partitionClass x priorityClass) conjunct).
//
// The semantic "which cure move type does a detected placement condition
// take, and which admission lane does that cure enter" must be declared once
// as named relation rows in the owner family and consumed everywhere. This
// analyzer counts the re-derivations in production source:
//   (a) cure_move_type_mint — an object literal minting a move/operation with
//       a hand-picked `type: MoveType.X` / `type: OperationType.X` member
//       outside the owner family: the condition -> cureType decision point;
//   (b) admission_lane_conjunct — a call to an emergency-lane classifier
//       (isPriorityRecoveryEmergencyPartition /
//       isEmergencyPriorityControlPlanePartition /
//       usesEmergencyPriorityOverflow) outside the owner family: the
//       cureType -> admission-lane conjunct home.
// Metric 0 == every cure-typing decision reads a named owner row.
// Landed 2026-07-13 (baseline 15 -> 0): the condition/cure/scope rows live in
// src/rebalancer/replica-placement-cure-policy.js; the admission
// partition-class classifier (classifyPriorityRecoveryAdmissionPartitionClass)
// lives in src/control-plane/priority-recovery-admission-constants.js — the
// cycle-safe lane-vocabulary home, since the admission-plan owner sits inside
// rebalance-coordinator-shared's import tree. This analyzer stays the ratchet:
// new sites count by default.
//
// Delegation wrappers (a function named exactly like the marker it calls) are
// skipped automatically. Schema-provisioning creation ADDs (intent-derived,
// not condition-derived) are committed exclusions with reasons; new sites
// count by default.
//
// With --oracle it writes the quest oracle; `done` additionally requires
// --with-gates (lint + targeted suites).

import path from 'node:path';
import fs from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {
  parseSourceFile,
  runGuidelineCheckWhenDirect,
  walkAst,
} from './guideline-check-shared.js';

const ANALYZER_SOURCE_FORMAT = Object.freeze({
  JAVASCRIPT_EXTENSION: '.js',
  MODULE_SCOPE: '<module>',
  PATH_SEPARATOR: '/',
});
const CURE_TYPING_ANALYZER_OUTPUT = Object.freeze({
  CLASSIFICATION: 'cure-typing-single-owner-census',
  GENERATED_BY: 'scripts/check-cure-typing-owner.js',
  NEWLINE: '\n',
});

const REPO_ROOT = path.resolve(path.dirname(new globalThis.URL(import.meta.url).pathname), '..');
const SCAN_ROOT = 'src';
const ORACLE_FILE = 'solve/oracle/cure-typing-single-owner-table.json';
const ORACLE_TARGET = 0;

// The owner family of the cure-typing semantic: the declared
// condition -> cureType rows (placement-cure policy), the ledger hold/cure
// sibling (rung-3 owner), the policy-free concentration evaluator, and the
// admission-lane plan owner plus its lane-predicate home.
const OWNER_MODULES = Object.freeze(new Set([
  'src/rebalancer/replica-placement-cure-policy.js',
  'src/rebalancer/operation-ledger-hold-policy.js',
  'src/rebalancer/operation-ledger-quorum-concentration.js',
  'src/control-plane/priority-recovery-snapshot-workflow.js',
  'src/control-plane/priority-recovery-admission-constants.js',
]));

const VIOLATION_KIND = Object.freeze({
  CURE_MINT: 'cure_move_type_mint',
  LANE_CONJUNCT: 'admission_lane_conjunct',
});

const LANE_CONJUNCT_MARKERS = Object.freeze(new Set([
  'isPriorityRecoveryEmergencyPartition',
  'isEmergencyPriorityControlPlanePartition',
  'usesEmergencyPriorityOverflow',
]));

const MOVE_TYPE_ENUM_NAMES = Object.freeze(new Set([
  'MoveType',
  'OperationType',
]));
const MINT_PROPERTY_KEY = 'type';

// Out-of-scope exclusions, each with a reason tied to the sealed statement.
// Keyed file + kind + enclosing identifier; a site not listed always counts.
const EXCLUDED_SITES = Object.freeze([
  {
    filePath: 'src/query/sql-query-engine-initial-partition-provisioning.js',
    kind: VIOLATION_KIND.CURE_MINT,
    enclosingIdentifier: 'provisionInitialTablePartition',
    reason: 'schema-provisioning creation lane: the ADD count derives from the CREATE TABLE intent (requiredNewReplicaCount), not from a detected placement condition',
  },
  {
    filePath: 'src/query/sql-query-engine-provisioning-admission-methods.js',
    kind: VIOLATION_KIND.CURE_MINT,
    enclosingIdentifier: 'probeProvisioningTargetAdmission',
    reason: 'admission-probe payload: describes a proposed provisioning ADD for a capacity precheck, not a condition-to-cure decision',
  },
]);

const NODE_TYPE = Object.freeze({
  CALL: 'CallExpression',
  FUNCTION_DECLARATION: 'FunctionDeclaration',
  IDENTIFIER: 'Identifier',
  MEMBER: 'MemberExpression',
  METHOD: 'MethodDefinition',
  OBJECT: 'ObjectExpression',
  PROPERTY: 'Property',
  VARIABLE_DECLARATOR: 'VariableDeclarator',
});
const EXIT_CODE = Object.freeze({SUCCESS: 0, FAILURE: 1});

const GATE_COMMANDS = Object.freeze([
  {label: 'lint', command: ['npm', 'run', 'lint', '--silent']},
  {
    label: 'targeted-suites',
    command: [
      'node', 'scripts/run-test-files.js',
      'test/rebalancer/replica-placement-cure-policy.test.js',
      'test/rebalancer/operation-ledger-hold-policy.test.js',
      'test/rebalancer/move-planner-spread-vs-count-reconciliation.test.js',
      'test/rebalancer/move-planner-placement-owner-kernel.test.js',
      'test/rebalancer/priority-recovery-follow-up-count-aware-add-gate.test.js',
      'test/rebalancer/priority-follow-up-target-readiness.test.js',
      'test/control-plane/priority-recovery-snapshot-operation-owner-outcome.test.js',
    ],
  },
]);

function normalizeRepoPath(filePath) {
  return path.relative(REPO_ROOT, path.resolve(filePath))
    .split(path.sep)
    .join(ANALYZER_SOURCE_FORMAT.PATH_SEPARATOR);
}

function resolveCalleeName(callee) {
  if (callee?.type === NODE_TYPE.IDENTIFIER) {
    return callee.name;
  }
  if (callee?.type === NODE_TYPE.MEMBER &&
      callee.property?.type === NODE_TYPE.IDENTIFIER) {
    return callee.property.name;
  }
  return null;
}

// The decision unit for a site is the OUTERMOST named function (method or
// declaration) — nested arrows and options-object properties are its
// mechanism, and stable exclusion keys need the method name. Module-level
// sites fall back to the nearest declarator/property.
function findEnclosingIdentifier(ancestors) {
  for (let index = 0; index < ancestors.length; index += 1) {
    const ancestor = ancestors[index];
    if (ancestor.type === NODE_TYPE.METHOD && ancestor.key?.name) {
      return ancestor.key.name;
    }
    if (ancestor.type === NODE_TYPE.FUNCTION_DECLARATION && ancestor.id?.name) {
      return ancestor.id.name;
    }
  }
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const ancestor = ancestors[index];
    if (ancestor.type === NODE_TYPE.VARIABLE_DECLARATOR &&
        ancestor.id?.type === NODE_TYPE.IDENTIFIER) {
      return ancestor.id.name;
    }
    if (ancestor.type === NODE_TYPE.PROPERTY &&
        ancestor.key?.type === NODE_TYPE.IDENTIFIER) {
      return ancestor.key.name;
    }
  }
  return ANALYZER_SOURCE_FORMAT.MODULE_SCOPE;
}

// A `type: MoveType.X` / `type: OperationType.X` member of an object literal:
// the mint point where a condition decision becomes a concrete cure move.
function resolveMintedMoveType(node) {
  if (node.type !== NODE_TYPE.PROPERTY ||
      node.computed === true ||
      node.key?.name !== MINT_PROPERTY_KEY) {
    return null;
  }
  const value = node.value;
  if (value?.type === NODE_TYPE.MEMBER &&
      value.object?.type === NODE_TYPE.IDENTIFIER &&
      MOVE_TYPE_ENUM_NAMES.has(value.object.name) &&
      value.property?.type === NODE_TYPE.IDENTIFIER) {
    return `${value.object.name}.${value.property.name}`;
  }
  return null;
}

function isExcluded(site) {
  return EXCLUDED_SITES.some((entry) =>
    entry.filePath === site.filePath &&
    entry.kind === site.kind &&
    entry.enclosingIdentifier === site.enclosingIdentifier);
}

function collectFileSites(filePath, source) {
  const repoPath = normalizeRepoPath(filePath);
  if (OWNER_MODULES.has(repoPath)) return [];
  const ast = parseSourceFile(source);
  const sites = [];
  walkAst(ast, (node, parent, ancestors) => {
    if (node.type === NODE_TYPE.CALL) {
      const calleeName = resolveCalleeName(node.callee);
      if (calleeName !== null && LANE_CONJUNCT_MARKERS.has(calleeName)) {
        const enclosingIdentifier = findEnclosingIdentifier(ancestors);
        // A delegation wrapper — a function itself named as a marker —
        // declares no decision of its own; alias laundering is caught
        // because the wrapper's callers still count.
        if (!LANE_CONJUNCT_MARKERS.has(enclosingIdentifier)) {
          sites.push({
            filePath: repoPath,
            line: node.loc?.start?.line ?? 0,
            kind: VIOLATION_KIND.LANE_CONJUNCT,
            enclosingIdentifier,
            detail: calleeName,
          });
        }
      }
    }
    const mintedMoveType = resolveMintedMoveType(node);
    if (mintedMoveType !== null) {
      sites.push({
        filePath: repoPath,
        line: node.loc?.start?.line ?? 0,
        kind: VIOLATION_KIND.CURE_MINT,
        enclosingIdentifier: findEnclosingIdentifier(ancestors),
        detail: mintedMoveType,
      });
    }
  });
  return sites;
}

async function collectJavaScriptFiles(entryPath) {
  const stat = await fs.stat(entryPath);
  if (stat.isFile()) {
    return entryPath.endsWith(ANALYZER_SOURCE_FORMAT.JAVASCRIPT_EXTENSION) ?
      [entryPath] : [];
  }
  if (!stat.isDirectory()) return [];
  const children = await fs.readdir(entryPath, {withFileTypes: true});
  const collected = [];
  for (const child of children) {
    const childPath = path.join(entryPath, child.name);
    if (child.isDirectory()) {
      collected.push(...await collectJavaScriptFiles(childPath));
    } else if (child.isFile() &&
        childPath.endsWith(ANALYZER_SOURCE_FORMAT.JAVASCRIPT_EXTENSION)) {
      collected.push(childPath);
    }
  }
  return collected;
}

async function collectCensus() {
  const files = await collectJavaScriptFiles(path.join(REPO_ROOT, SCAN_ROOT));
  const counted = [];
  const excluded = [];
  for (const filePath of files.sort()) {
    const source = await fs.readFile(filePath, 'utf8');
    for (const site of collectFileSites(filePath, source)) {
      (isExcluded(site) ? excluded : counted).push(site);
    }
  }
  return {counted, excluded};
}

function runGates() {
  const results = [];
  for (const gate of GATE_COMMANDS) {
    const [executable, ...args] = gate.command;
    const outcome = spawnSync(executable, args, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    results.push({
      label: gate.label,
      passed: outcome.status === 0,
      exitCode: outcome.status,
    });
  }
  return results;
}

function buildOraclePayload(census, gateResults, doneAt) {
  const metric = census.counted.length;
  const gatesGreen = gateResults !== null &&
    gateResults.every((gate) => gate.passed);
  return {
    metric,
    target: doneAt,
    done: metric <= doneAt && gatesGreen,
    classification: CURE_TYPING_ANALYZER_OUTPUT.CLASSIFICATION,
    detail: {
      generatedBy: CURE_TYPING_ANALYZER_OUTPUT.GENERATED_BY,
      ownerModules: [...OWNER_MODULES],
      countedSites: census.counted,
      excludedSites: census.excluded,
      gates: gateResults,
    },
  };
}

function readCliOption(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 && index + 1 < argv.length ? argv[index + 1] : null;
}

async function main() {
  const argv = process.argv.slice(2);
  const writeOracle = argv.includes('--oracle');
  const withGates = argv.includes('--with-gates');
  const oracleFile = readCliOption(argv, '--oracle-file') || ORACLE_FILE;
  const doneAtRaw = readCliOption(argv, '--done-at');
  const doneAt = doneAtRaw === null ? ORACLE_TARGET : Number(doneAtRaw);
  if (!Number.isInteger(doneAt) || doneAt < 0) {
    throw new Error(`--done-at must be a non-negative integer, got: ${doneAtRaw}`);
  }
  const census = await collectCensus();
  const gateResults = withGates ? runGates() : null;
  const payload = buildOraclePayload(census, gateResults, doneAt);
  if (writeOracle) {
    const oraclePath = path.join(REPO_ROOT, oracleFile);
    await fs.mkdir(path.dirname(oraclePath), {recursive: true});
    await fs.writeFile(
      oraclePath,
      JSON.stringify(payload, null, 2) + CURE_TYPING_ANALYZER_OUTPUT.NEWLINE,
    );
  }
  process.stdout.write(
    JSON.stringify(payload, null, 2) + CURE_TYPING_ANALYZER_OUTPUT.NEWLINE,
  );
  return payload.metric <= doneAt ? EXIT_CODE.SUCCESS : EXIT_CODE.FAILURE;
}

runGuidelineCheckWhenDirect(import.meta.url, main);

export {collectCensus, collectFileSites};
