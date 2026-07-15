// Workflow-step coverage census — quest step-coverage-single-owner-table
// (epic self-hosting-circularity-generic-treatment Option 5, second semantic;
// CL-029 lineage: the dispatch-wake preempt set covered {PENDING, SENDING,
// CREATING} and stopped one step short of target_sync — each coverage set is
// enumerated ad hoc at its call site, so gaps are invisible until an incident).
//
// The semantic "which workflow steps of which operation type does THIS
// mechanism cover" must be declared as named per-step policy rows in the owner
// module and consumed everywhere. This analyzer counts the re-derivations in
// production source:
//   (a) step_coverage_set_declaration — a Set/array literal with >= 2
//       WORKFLOW_STEP members outside the owner (a hand-rolled coverage set);
//   (b) step_branch_pile — a function body containing equality comparisons
//       against >= 2 DISTINCT WORKFLOW_STEP members (a hand-rolled coverage
//       predicate written as if/else).
// Metric 0 == every coverage decision reads a named owner row.
//
// With --oracle it writes the quest oracle; `done` additionally requires
// --with-gates (lint + targeted suites). Exclusions are committed data with
// reasons; new sites are counted by default.

import path from 'node:path';
import fs from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {
  parseSourceFile,
  runGuidelineCheckWhenDirect,
  walkAst,
} from './guideline-check-shared.js';

const LOCAL_STR_OWNED_001 = '/';
const LOCAL_STR_OWNED_002 = 'Map';
const LOCAL_STR_OWNED_003 = 'Set';
const LOCAL_STR_OWNED_004 = 'FunctionDeclaration';
const LOCAL_STR_OWNED_005 = 'MethodDefinition';
const LOCAL_STR_OWNED_006 = '<module>';
const LOCAL_STR_OWNED_007 = '<anonymous>';
const LOCAL_STR_OWNED_008 = ',';
const LOCAL_STR_OWNED_009 = '.js';
const LOCAL_STR_OWNED_010 = 'step-coverage-single-owner-census';
const LOCAL_STR_OWNED_011 = 'scripts/check-step-coverage-owner.js';
const LOCAL_STR_OWNED_012 = '\n';

const REPO_ROOT = path.resolve(path.dirname(new globalThis.URL(import.meta.url).pathname), '..');
const SCAN_ROOT = 'src';
const ORACLE_FILE = 'solve/oracle/step-coverage-single-owner-table.json';
const ORACLE_TARGET = 0;

// The owners of workflow-step semantics: the progression/terminal tables and
// the (new) per-step coverage policy table.
const OWNER_MODULES = Object.freeze(new Set([
  'src/rebalancer/replica-operation-progress.js',
  'src/rebalancer/replica-operation-step-policy.js',
]));

// Out-of-scope exclusions, each with a reason tied to the sealed statement.
// Keyed file + kind + enclosing identifier; a site not listed always counts.
const EXCLUDED_SITES = Object.freeze([
  {
    filePath: 'src/rebalancer/operation-workflow-recovery-status-reconcile.js',
    kind: 'step_branch_pile',
    enclosingIdentifier: 'getTimeoutForStep',
    reason: 'per-step timeout SCALARS (budget policy semantic, sealed NOT-in-scope)',
  },
  {
    filePath: 'src/rebalancer/rebalance-coordinator-operation-intent-methods.js',
    kind: 'step_branch_pile',
    enclosingIdentifier: 'getRecentOperationMissReuseBudgetMs',
    reason: 'per-step reuse-budget SCALARS (budget policy semantic, sealed NOT-in-scope)',
  },
  {
    filePath: 'src/rebalancer/operation-workflow-transition-orchestration.js',
    kind: 'step_branch_pile',
    enclosingIdentifier: 'updateStep',
    reason: 'independent single-step bookkeeping conditionals (clear retry when leaving ACTIVE; not a coverage enumeration)',
  },
  {
    filePath: 'src/rebalancer/operation-workflow-transition-orchestration.js',
    kind: 'step_branch_pile',
    enclosingIdentifier: 'recordPriorityDispatchDeferredLocalProgress',
    reason: 'independent single-step bookkeeping conditionals (claim-field cleanup at CREATING, retry clear off ACTIVE)',
  },
  {
    filePath: 'src/rebalancer/priority-recovery-superseded-target.js',
    kind: 'step_branch_pile',
    enclosingIdentifier: 'reconcileReplaceActualActive',
    reason: 'per-step ACTION ROUTING: each branch performs a distinct reconcile action (a state-model chain, not a coverage set)',
  },
  {
    filePath: 'src/rebalancer/operation-workflow-dispatch-execution.js',
    kind: 'step_branch_pile',
    enclosingIdentifier: 'dispatchOperationInternal',
    reason: 'per-step ACTION ROUTING in the dispatch sequencer (claim at PENDING vs re-send), not a coverage set',
  },
  {
    filePath: 'src/rebalancer/replica-operation-liveness.js',
    kind: 'step_branch_pile',
    enclosingIdentifier: 'inferOperationTypeFromStepsHistory',
    reason: 'forensic type inference over steps-history evidence tokens, not a coverage set',
  },
]);

const WORKFLOW_STEP_ENUM_NAME = 'WORKFLOW_STEP';
const MIN_SET_MEMBERS = 2;
const MIN_DISTINCT_COMPARISONS = 2;

const VIOLATION_KIND = Object.freeze({
  SET: 'step_coverage_set_declaration',
  PILE: 'step_branch_pile',
});

const NODE_TYPE = Object.freeze({
  ARRAY: 'ArrayExpression',
  BINARY: 'BinaryExpression',
  IDENTIFIER: 'Identifier',
  MEMBER: 'MemberExpression',
  NEW: 'NewExpression',
  PROPERTY: 'Property',
  SWITCH_CASE: 'SwitchCase',
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
      'test/rebalancer/cl-029-target-completion-evidence-retry-owner.test.js',
      'test/rebalancer/operation-workflow-owner-decision.test.js',
      'test/rebalancer/replica-operation-step-policy.test.js',
      'test/rebalancer/priority-dispatch-deferred-local-progress-outcome-coverage.test.js',
    ],
  },
]);

function normalizeRepoPath(filePath) {
  return path.relative(REPO_ROOT, path.resolve(filePath)).split(path.sep).join(LOCAL_STR_OWNED_001);
}

function resolveWorkflowStepMember(node) {
  if (node?.type === NODE_TYPE.MEMBER &&
      node.object?.type === NODE_TYPE.IDENTIFIER &&
      node.object.name === WORKFLOW_STEP_ENUM_NAME &&
      node.property?.type === NODE_TYPE.IDENTIFIER) {
    return node.property.name;
  }
  return null;
}

function isMapEntryPairArray(node, ancestors) {
  const parent = ancestors[ancestors.length - 1];
  const grandparent = ancestors[ancestors.length - 2];
  return node.type === NODE_TYPE.ARRAY &&
    parent?.type === NODE_TYPE.ARRAY &&
    grandparent?.type === NODE_TYPE.NEW &&
    grandparent.callee?.type === NODE_TYPE.IDENTIFIER &&
    grandparent.callee.name === LOCAL_STR_OWNED_002;
}

function findStepSetArray(node, ancestors) {
  if (node.type === NODE_TYPE.NEW &&
      node.callee?.type === NODE_TYPE.IDENTIFIER &&
      node.callee.name === LOCAL_STR_OWNED_003) {
    return node.arguments?.[0]?.type === NODE_TYPE.ARRAY ? node.arguments[0] : null;
  }
  if (node.type === NODE_TYPE.ARRAY && !isMapEntryPairArray(node, ancestors)) {
    return node;
  }
  return null;
}

function findEnclosingIdentifier(ancestors) {
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
    if ((ancestor.type === LOCAL_STR_OWNED_004 ||
         ancestor.type === LOCAL_STR_OWNED_005) &&
        (ancestor.id?.name || ancestor.key?.name)) {
      return ancestor.id?.name || ancestor.key?.name;
    }
  }
  return LOCAL_STR_OWNED_006;
}

function findEnclosingFunction(ancestors) {
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    if (FUNCTION_NODE_TYPES.has(ancestors[index].type)) {
      return ancestors[index];
    }
  }
  return null;
}

function functionDisplayName(functionNode, ancestors) {
  if (functionNode?.id?.name) return functionNode.id.name;
  const index = ancestors.indexOf(functionNode);
  const owners = ancestors.slice(0, index >= 0 ? index : undefined);
  for (let cursor = owners.length - 1; cursor >= 0; cursor -= 1) {
    const owner = owners[cursor];
    if (owner.type === LOCAL_STR_OWNED_005 && owner.key?.name) return owner.key.name;
    if (owner.type === NODE_TYPE.VARIABLE_DECLARATOR && owner.id?.name) {
      return owner.id.name;
    }
    if (owner.type === NODE_TYPE.PROPERTY && owner.key?.name) return owner.key.name;
  }
  return LOCAL_STR_OWNED_007;
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
  // step -> comparison census per enclosing function (and module level).
  const comparisonsByFunction = new Map();
  const countedSetArrays = new Set();
  walkAst(ast, (node, _parent, ancestors) => {
    const stepSetArray = findStepSetArray(node, ancestors);
    if (stepSetArray && !countedSetArrays.has(stepSetArray)) {
      countedSetArrays.add(stepSetArray);
      const members = (stepSetArray.elements || [])
        .map(resolveWorkflowStepMember)
        .filter(Boolean);
      if (members.length >= MIN_SET_MEMBERS) {
        sites.push({
          filePath: repoPath,
          line: node.loc?.start?.line ?? 0,
          kind: VIOLATION_KIND.SET,
          enclosingIdentifier: findEnclosingIdentifier(ancestors),
          detail: members.join(LOCAL_STR_OWNED_008),
        });
      }
    }
    if (stepSetArray) return;
    let comparedStep = null;
    if (node.type === NODE_TYPE.BINARY &&
        EQUALITY_OPERATORS.has(node.operator)) {
      comparedStep = resolveWorkflowStepMember(node.left) ||
        resolveWorkflowStepMember(node.right);
    } else if (node.type === NODE_TYPE.SWITCH_CASE) {
      comparedStep = resolveWorkflowStepMember(node.test);
    }
    if (comparedStep) {
      const enclosing = findEnclosingFunction(ancestors);
      const key = enclosing || '<module>';
      if (!comparisonsByFunction.has(key)) {
        comparisonsByFunction.set(key, {
          steps: new Set(),
          line: node.loc?.start?.line ?? 0,
          name: enclosing ?
            functionDisplayName(enclosing, ancestors) :
            LOCAL_STR_OWNED_006,
        });
      }
      comparisonsByFunction.get(key).steps.add(comparedStep);
    }
  });
  for (const entry of comparisonsByFunction.values()) {
    if (entry.steps.size >= MIN_DISTINCT_COMPARISONS) {
      sites.push({
        filePath: repoPath,
        line: entry.line,
        kind: VIOLATION_KIND.PILE,
        enclosingIdentifier: entry.name,
        detail: [...entry.steps].sort().join(LOCAL_STR_OWNED_008),
      });
    }
  }
  return sites;
}

async function collectJavaScriptFiles(entryPath) {
  const stat = await fs.stat(entryPath);
  if (stat.isFile()) {
    return entryPath.endsWith(LOCAL_STR_OWNED_009) ? [entryPath] : [];
  }
  if (!stat.isDirectory()) return [];
  const children = await fs.readdir(entryPath, {withFileTypes: true});
  const collected = [];
  for (const child of children) {
    const childPath = path.join(entryPath, child.name);
    if (child.isDirectory()) {
      collected.push(...await collectJavaScriptFiles(childPath));
    } else if (child.isFile() && childPath.endsWith(LOCAL_STR_OWNED_009)) {
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
    classification: LOCAL_STR_OWNED_010,
    detail: {
      generatedBy: LOCAL_STR_OWNED_011,
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
    await fs.writeFile(oraclePath, JSON.stringify(payload, null, 2) + LOCAL_STR_OWNED_012);
  }
  process.stdout.write(JSON.stringify(payload, null, 2) + LOCAL_STR_OWNED_012);
  return payload.metric <= doneAt ? EXIT_CODE.SUCCESS : EXIT_CODE.FAILURE;
}

runGuidelineCheckWhenDirect(import.meta.url, main);

export {collectCensus, collectFileSites};
