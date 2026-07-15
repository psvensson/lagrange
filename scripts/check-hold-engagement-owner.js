// Operation-ledger hold-engagement census — quest hold-engagement-single-owner-table
// (epic self-hosting-circularity-generic-treatment Option 5, third semantic;
// CL-013 lineage: ledger spread ADDs are exempt from the self-move interlock
// only by OMISSION from the disruptive-move set, and the emergency
// quorum-restore ADD exemption conjunct is written twice — once per admission
// lane — so the (hold x moveType x partitionClass) -> {exempt|idle-only|defer}
// relation exists only as scattered control flow and can drift per lane).
//
// The semantic "what does THIS move do while THIS operation-ledger hold is
// engaged" must be declared once as named relation rows in the owner module
// and consumed everywhere. This analyzer counts the re-derivations in
// production source:
//   (a) ledger_partition_move_conjunct — a call to the ledger-partition
//       classifier (isOperationLedgerPartitionTable / isOperationLedgerPartition)
//       outside the owner family: the moveType x ledger-partition conjunct home;
//   (b) emergency_exemption_read — a call to the emergency-partition
//       classifier (isEmergencyPriorityControlPlanePartition /
//       isPriorityRecoveryEmergencyPartition) outside the owner family;
//   (c) ledger_quorum_hold_state_read — a raw read of the quorum-concentration
//       hold state (evaluateOperationLedgerQuorumConcentration /
//       isConcentratedOperationLedgerPartition) outside the owner family:
//       policy decisions must consume owner relation rows, not raw state;
//   (d) ledger_quorum_cure_classifier — a function that reads the
//       concentration evidence surface AND hand-classifies moves by
//       OperationType/MoveType equality (the cure-typing conjunct).
// Metric 0 == every ledger-hold engagement decision reads a named owner row.
//
// Delegation wrappers (a function named exactly like the marker it calls) are
// skipped automatically. Sibling admission holds (priority budget lanes,
// pressure holds, serial gates) are committed exclusions with reasons — the
// same defect shape, sealed NOT-in-scope for this quest; new sites count by
// default.
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
const HOLD_ENGAGEMENT_ANALYZER_OUTPUT = Object.freeze({
  CLASSIFICATION: 'hold-engagement-single-owner-census',
  GENERATED_BY: 'scripts/check-hold-engagement-owner.js',
  NEWLINE: '\n',
});

const REPO_ROOT = path.resolve(path.dirname(new globalThis.URL(import.meta.url).pathname), '..');
const SCAN_ROOT = 'src';
const ORACLE_FILE = 'solve/oracle/hold-engagement-single-owner-table.json';
const ORACLE_TARGET = 0;

// The owner family of the operation-ledger hold-engagement semantic: the
// declared relation rows (hold policy), the hold-state evaluator it wraps,
// and the rung-4 cure-typing sibling (its admission partition-class
// classifier legitimately reads the emergency classifier).
const OWNER_MODULES = Object.freeze(new Set([
  'src/rebalancer/operation-ledger-hold-policy.js',
  'src/rebalancer/operation-ledger-quorum-concentration.js',
  'src/rebalancer/replica-placement-cure-policy.js',
]));

const VIOLATION_KIND = Object.freeze({
  LEDGER_CONJUNCT: 'ledger_partition_move_conjunct',
  EMERGENCY_READ: 'emergency_exemption_read',
  HOLD_STATE_READ: 'ledger_quorum_hold_state_read',
  CURE_CLASSIFIER: 'ledger_quorum_cure_classifier',
});

const MARKERS_BY_KIND = Object.freeze(new Map([
  [VIOLATION_KIND.LEDGER_CONJUNCT, Object.freeze(new Set([
    'isOperationLedgerPartitionTable',
    'isOperationLedgerPartition',
  ]))],
  [VIOLATION_KIND.EMERGENCY_READ, Object.freeze(new Set([
    'isEmergencyPriorityControlPlanePartition',
    'isPriorityRecoveryEmergencyPartition',
  ]))],
  [VIOLATION_KIND.HOLD_STATE_READ, Object.freeze(new Set([
    'evaluateOperationLedgerQuorumConcentration',
    'isConcentratedOperationLedgerPartition',
  ]))],
]));
const MARKER_KIND_NOT_FOUND = Symbol('marker_kind_not_found');

const CURE_EVIDENCE_SURFACE_NAME =
  'isOperationLedgerQuorumConcentratedForPartition';
const MOVE_TYPE_ENUM_NAMES = Object.freeze(new Set([
  'OperationType',
  'MoveType',
]));

// Out-of-scope exclusions, each with a reason tied to the sealed statement.
// Keyed file + kind + enclosing identifier; a site not listed always counts.
const EXCLUDED_SITES = Object.freeze([
  {
    filePath: 'src/rebalancer/unified-rebalancer-priority-recovery-coordination.js',
    kind: VIOLATION_KIND.EMERGENCY_READ,
    enclosingIdentifier: 'getPriorityRecoveryAdmissionPlan',
    reason: 'plan wiring: passes the classifier into the priority-recovery admission-plan builder (lane counting), not a ledger-hold engagement decision',
  },
  {
    filePath: 'src/rebalancer/rebalance-coordinator-concurrent-add-budget.js',
    kind: VIOLATION_KIND.EMERGENCY_READ,
    enclosingIdentifier: 'getPriorityRecoveryAdmissionPlan',
    reason: 'plan wiring: passes the classifier into the priority-recovery admission-plan builder (lane counting), not a ledger-hold engagement decision',
  },
  {
    filePath: 'src/rebalancer/rebalance-coordinator-pressure-helper.js',
    kind: VIOLATION_KIND.EMERGENCY_READ,
    enclosingIdentifier: 'buildPriorityDeferredObservationPressureEvidence',
    reason: 'sibling admission hold (local-router pressure lane), sealed NOT-in-scope',
  },
  {
    filePath: 'src/rebalancer/rebalance-coordinator-pressure-helper.js',
    kind: VIOLATION_KIND.EMERGENCY_READ,
    enclosingIdentifier: 'buildPriorityAddAdmissionPressureEvidence',
    reason: 'sibling admission hold (priority-add pressure lane), sealed NOT-in-scope',
  },
  {
    filePath: 'src/rebalancer/rebalance-coordinator-priority-budget-helper.js',
    kind: VIOLATION_KIND.EMERGENCY_READ,
    enclosingIdentifier: 'buildConcurrentAddCountByPriorityClass',
    reason: 'emergency-vs-ordinary lane COUNTING (numeric budget classification), not a ledger-hold engagement decision',
  },
  {
    filePath: 'src/rebalancer/unified-rebalancer-budget-planning.js',
    kind: VIOLATION_KIND.EMERGENCY_READ,
    enclosingIdentifier: 'getOrdinaryPriorityRecoverySerialGateSnapshot',
    reason: 'sibling admission hold (ordinary-priority serial gate), sealed NOT-in-scope',
  },
  {
    filePath: 'src/control-plane/priority-recovery-serial-wait-operation-contexts.js',
    kind: VIOLATION_KIND.EMERGENCY_READ,
    enclosingIdentifier: 'isPriorityRecoveryOrdinarySerialLanePartitionId',
    reason: 'sibling admission hold (serial-wait lane membership), sealed NOT-in-scope',
  },
]);

const NODE_TYPE = Object.freeze({
  BINARY: 'BinaryExpression',
  CALL: 'CallExpression',
  FUNCTION_DECLARATION: 'FunctionDeclaration',
  IDENTIFIER: 'Identifier',
  MEMBER: 'MemberExpression',
  METHOD: 'MethodDefinition',
  PROPERTY: 'Property',
  VARIABLE_DECLARATOR: 'VariableDeclarator',
});
const FUNCTION_NODE_TYPES = Object.freeze(new Set([
  'ArrowFunctionExpression',
  'FunctionDeclaration',
  'FunctionExpression',
]));
const EQUALITY_OPERATORS = Object.freeze(new Set(['===', '!==', '==', '!=']));
const EXIT_CODE = Object.freeze({SUCCESS: 0, FAILURE: 1});

const GATE_COMMANDS = Object.freeze([
  {label: 'lint', command: ['npm', 'run', 'lint', '--silent']},
  {
    label: 'targeted-suites',
    command: [
      'node', 'scripts/run-test-files.js',
      'test/rebalancer/operation-ledger-hold-policy.test.js',
      'test/rebalancer/interlock-skip-label-fidelity.test.js',
      'test/rebalancer/operation-ledger-quorum-concentration-replace-impotence.test.js',
      'test/rebalancer/rebalance-coordinator-topology-guard.test.js',
      'test/convergence/dt6-rebalancer-formation-self-move-interlock.test.js',
      'test/convergence/dt6-formation-ledger-quorum-spread-first.test.js',
      'test/convergence/dt6-formation-ledger-spread-completion-self-move-interlock-deadlock.test.js',
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

function resolveMarkerKind(calleeName) {
  for (const [kind, markers] of MARKERS_BY_KIND) {
    if (markers.has(calleeName)) {
      return kind;
    }
  }
  return MARKER_KIND_NOT_FOUND;
}

// The decision unit for a marker call is the OUTERMOST named function
// (method or declaration) — nested arrows and options-object properties are
// its mechanism, and stable exclusion keys need the method name. Module-level
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

// Outermost, not nearest: a hand-rolled cure classifier is typically an
// inner arrow (e.g. a filter predicate) while the evidence-surface read sits
// in the enclosing method body — the decision is one function's.
function findOutermostFunction(ancestors) {
  for (let index = 0; index < ancestors.length; index += 1) {
    if (FUNCTION_NODE_TYPES.has(ancestors[index].type)) {
      return ancestors[index];
    }
  }
  return null;
}

function isMoveTypeEnumEquality(node) {
  if (node.type !== NODE_TYPE.BINARY ||
      !EQUALITY_OPERATORS.has(node.operator)) {
    return false;
  }
  return [node.left, node.right].some((side) =>
    side?.type === NODE_TYPE.MEMBER &&
    side.object?.type === NODE_TYPE.IDENTIFIER &&
    MOVE_TYPE_ENUM_NAMES.has(side.object.name));
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
  // Cure-classifier census per enclosing function: evidence-surface reference
  // plus a hand-rolled OperationType/MoveType equality in the same function.
  const cureCensusByFunction = new Map();
  walkAst(ast, (node, _parent, ancestors) => {
    if (node.type === NODE_TYPE.CALL) {
      const calleeName = resolveCalleeName(node.callee);
      const kind = calleeName === null ?
        MARKER_KIND_NOT_FOUND : resolveMarkerKind(calleeName);
      if (kind !== MARKER_KIND_NOT_FOUND) {
        const enclosingIdentifier = findEnclosingIdentifier(ancestors);
        // A delegation wrapper — a function itself named as a marker of the
        // SAME kind (exact or renamed alias) — declares no decision of its
        // own; alias laundering is caught because the wrapper's callers still
        // count.
        if (!MARKERS_BY_KIND.get(kind).has(enclosingIdentifier)) {
          sites.push({
            filePath: repoPath,
            line: node.loc?.start?.line ?? 0,
            kind,
            enclosingIdentifier,
            detail: calleeName,
          });
        }
      }
    }
    const enclosing = findOutermostFunction(ancestors) ??
      (node.type === NODE_TYPE.CALL || node.type === NODE_TYPE.BINARY ||
       node.type === NODE_TYPE.MEMBER || node.type === NODE_TYPE.IDENTIFIER ?
        '<module>' : null);
    if (enclosing === null) return;
    if (!cureCensusByFunction.has(enclosing)) {
      cureCensusByFunction.set(enclosing, {
        readsEvidenceSurface: false,
        hasMoveTypeEquality: false,
        line: 0,
        name: findEnclosingIdentifier(ancestors),
      });
    }
    const census = cureCensusByFunction.get(enclosing);
    if ((node.type === NODE_TYPE.IDENTIFIER &&
         node.name === CURE_EVIDENCE_SURFACE_NAME) ||
        (node.type === NODE_TYPE.MEMBER &&
         node.property?.type === NODE_TYPE.IDENTIFIER &&
         node.property.name === CURE_EVIDENCE_SURFACE_NAME)) {
      census.readsEvidenceSurface = true;
      if (census.line === 0) {
        census.line = node.loc?.start?.line ?? 0;
      }
    }
    if (isMoveTypeEnumEquality(node)) {
      census.hasMoveTypeEquality = true;
    }
  });
  for (const census of cureCensusByFunction.values()) {
    if (census.readsEvidenceSurface && census.hasMoveTypeEquality) {
      sites.push({
        filePath: repoPath,
        line: census.line,
        kind: VIOLATION_KIND.CURE_CLASSIFIER,
        enclosingIdentifier: census.name,
        detail: CURE_EVIDENCE_SURFACE_NAME,
      });
    }
  }
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
    classification: HOLD_ENGAGEMENT_ANALYZER_OUTPUT.CLASSIFICATION,
    detail: {
      generatedBy: HOLD_ENGAGEMENT_ANALYZER_OUTPUT.GENERATED_BY,
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
      JSON.stringify(payload, null, 2) +
        HOLD_ENGAGEMENT_ANALYZER_OUTPUT.NEWLINE,
    );
  }
  process.stdout.write(
    JSON.stringify(payload, null, 2) +
      HOLD_ENGAGEMENT_ANALYZER_OUTPUT.NEWLINE,
  );
  return payload.metric <= doneAt ? EXIT_CODE.SUCCESS : EXIT_CODE.FAILURE;
}

runGuidelineCheckWhenDirect(import.meta.url, main);

export {collectCensus, collectFileSites};
