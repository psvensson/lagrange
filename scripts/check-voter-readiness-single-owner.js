// Voter-readiness single-owner census — quest voter-readiness-visibility-single-owner-table.
//
// The semantic "is this replica a ready voter" must be declared ONCE, as named
// decision-table rows in the owner module, and consumed everywhere else. This
// analyzer counts the independent re-derivations that remain in production
// source: (a) raft-role membership SETS declared outside the owner, and
// (b) inline learner-membership comparisons (voter membership decided by a
// literal at the call site). Metric 0 == every site consumes the owner table.
//
// With --oracle it writes the quest oracle file
// (solve/oracle/voter-readiness-visibility-single-owner-table.json); `done`
// additionally requires --with-gates (lint + targeted suites) to pass, per the
// sealed doneWhen. Exclusions are committed data below, each with a reason
// tied to the quest's NOT-in-scope list; new sites are counted by default.

import path from 'node:path';
import fs from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {
  parseSourceFile,
  runGuidelineCheckWhenDirect,
  walkAst,
} from './guideline-check-shared.js';

const LOCAL_STR_OWNED_001 = '/';
const LOCAL_STR_OWNED_002 = '_';
const LOCAL_STR_OWNED_003 = 'Map';
const LOCAL_STR_OWNED_004 = 'Set';
const LOCAL_STR_OWNED_005 = 'FunctionDeclaration';
const LOCAL_STR_OWNED_006 = 'MethodDefinition';
const LOCAL_STR_OWNED_007 = '<module>';
const LOCAL_STR_OWNED_008 = ',';
const LOCAL_STR_OWNED_009 = 'local re-derivation of the bootstrap-critical partition set';
const LOCAL_STR_OWNED_010 = '<destructured>';
const LOCAL_STR_OWNED_011 = '.js';
const LOCAL_STR_OWNED_012 = 'voter-readiness-single-owner-census';
const LOCAL_STR_OWNED_013 = 'scripts/check-voter-readiness-single-owner.js';
const LOCAL_STR_OWNED_014 = '\n';

const REPO_ROOT = path.resolve(path.dirname(new globalThis.URL(import.meta.url).pathname), '..');
const SCAN_ROOT = 'src';
const ORACLE_FILE = 'solve/oracle/voter-readiness-visibility-single-owner-table.json';
const ORACLE_TARGET = 0;

// The single owner of voter-readiness semantics. Role-set declarations and
// membership literals are legal ONLY here.
const OWNER_MODULES = Object.freeze(new Set([
  'src/raft/replica-voter-readiness.js',
]));

const RAFT_ROLE_VALUES = Object.freeze(new Set([
  'leader',
  'follower',
  'candidate',
  'learner',
]));
const LEARNER_ROLE = 'learner';
// Enum objects (and their aliases) whose members are raft role values; a
// comparison against <ENUM>.LEARNER is a membership literal regardless of
// which alias names the enum (PARTITION_RAFT_ROLE = RAFT_ROLE, etc.).
const RAFT_ROLE_ENUM_NAMES = Object.freeze(new Set([
  'raftrole',
  'partitionraftrole',
  'raftgrouprole',
]));
const MIN_ROLE_SET_MEMBERS = 2;

const VIOLATION_KIND = Object.freeze({
  ROLE_SET: 'role_set_declaration',
  LEARNER_COMPARISON: 'learner_membership_comparison',
  LEARNER_ALIAS: 'learner_scalar_alias_declaration',
  CRITICAL_PARTITION_SET: 'critical_partition_set_local_declaration',
});

// The scoping column of the voter-readiness rows: the bootstrap-critical
// partition set. Its single home is the partition-class taxonomy module; a
// local `const CRITICAL_SYSTEM_PARTITION_IDS = ...` re-derivation elsewhere is
// the CL-035 scoping-drift vector.
const CRITICAL_PARTITION_SET_NAME = 'CRITICAL_SYSTEM_PARTITION_IDS';
const PARTITION_CLASS_TAXONOMY_MODULE =
  'src/bootstrap/system-partition-classification.js';

// Out-of-scope exclusions (sealed quest statement: leader-routing sites, pure
// normalizers, and CLI/observability formatting are NOT voter-readiness
// derivations). Keyed file + kind + enclosing identifier; every entry carries
// a reason. A site not listed here always counts.
const EXCLUDED_SITES = Object.freeze([
]);

const NODE_TYPE = Object.freeze({
  ARRAY: 'ArrayExpression',
  BINARY: 'BinaryExpression',
  CALL: 'CallExpression',
  IDENTIFIER: 'Identifier',
  LITERAL: 'Literal',
  MEMBER: 'MemberExpression',
  NEW: 'NewExpression',
  PROPERTY: 'Property',
  VARIABLE_DECLARATOR: 'VariableDeclarator',
});
const EQUALITY_OPERATORS = Object.freeze(new Set(['===', '!==', '==', '!=']));
const EXIT_CODE = Object.freeze({SUCCESS: 0, FAILURE: 1});

// Targeted gate suites for the doneWhen (--with-gates): the CL-035 guard plus
// the suites that own the censused consumption sites.
const GATE_COMMANDS = Object.freeze([
  {label: 'lint', command: ['npm', 'run', 'lint', '--silent']},
  {
    label: 'targeted-suites',
    command: [
      'node', 'scripts/run-test-files.js',
      'test/control-plane/cl-035-voter-ready-row-seed.test.js',
      'test/partition/durable-voter-visibility-role-write.test.js',
      'test/rebalancer/promoted-voter-voter-ready-routable-60s-axis.test.js',
      'test/rebalancer/quorum-conditioned-remove-safety.test.js',
    ],
  },
]);

function normalizeRepoPath(filePath) {
  return path.relative(REPO_ROOT, path.resolve(filePath)).split(path.sep).join(LOCAL_STR_OWNED_001);
}

function resolveRaftRoleValue(node) {
  if (!node) return null;
  if (node.type === NODE_TYPE.LITERAL && typeof node.value === 'string') {
    const value = node.value.toLowerCase();
    return RAFT_ROLE_VALUES.has(value) ? value : null;
  }
  if (node.type === NODE_TYPE.MEMBER &&
      node.object?.type === NODE_TYPE.IDENTIFIER &&
      RAFT_ROLE_ENUM_NAMES.has(
        node.object.name.replaceAll(LOCAL_STR_OWNED_002, '').toLowerCase()) &&
      node.property?.type === NODE_TYPE.IDENTIFIER) {
    const value = node.property.name.toLowerCase();
    return RAFT_ROLE_VALUES.has(value) ? value : null;
  }
  return null;
}

function collectRoleSetMembers(arrayNode) {
  if (!arrayNode || arrayNode.type !== NODE_TYPE.ARRAY) return [];
  const members = [];
  for (const element of arrayNode.elements || []) {
    const role = resolveRaftRoleValue(element);
    if (role) members.push(role);
  }
  return members;
}

function isMapEntryPairArray(node, ancestors) {
  // A `[from, to]` pair inside `new Map([...])` is a mapping row (e.g. the
  // published-role projection table), not a role membership set.
  const parent = ancestors[ancestors.length - 1];
  const grandparent = ancestors[ancestors.length - 2];
  return node.type === NODE_TYPE.ARRAY &&
    parent?.type === NODE_TYPE.ARRAY &&
    grandparent?.type === NODE_TYPE.NEW &&
    grandparent.callee?.type === NODE_TYPE.IDENTIFIER &&
    grandparent.callee.name === LOCAL_STR_OWNED_003;
}

function findRoleSetArray(node, ancestors) {
  // `new Set([...])` — the declaration idiom for role membership sets.
  if (node.type === NODE_TYPE.NEW &&
      node.callee?.type === NODE_TYPE.IDENTIFIER &&
      node.callee.name === LOCAL_STR_OWNED_004) {
    return node.arguments?.[0]?.type === NODE_TYPE.ARRAY ? node.arguments[0] : null;
  }
  // Bare array literal (often wrapped in Object.freeze) — counted at the
  // ArrayExpression itself so the freeze wrapper does not matter.
  if (node.type === NODE_TYPE.ARRAY && !isMapEntryPairArray(node, ancestors)) {
    return node;
  }
  return null;
}

function isLearnerMembershipComparison(node) {
  if (node.type !== NODE_TYPE.BINARY || !EQUALITY_OPERATORS.has(node.operator)) {
    return false;
  }
  return [node.left, node.right].some((side) =>
    resolveRaftRoleValue(side) === LEARNER_ROLE);
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
    if ((ancestor.type === LOCAL_STR_OWNED_005 ||
         ancestor.type === LOCAL_STR_OWNED_006) &&
        (ancestor.id?.name || ancestor.key?.name)) {
      return ancestor.id?.name || ancestor.key?.name;
    }
  }
  return LOCAL_STR_OWNED_007;
}

function isEnumDefinitionProperty(ancestors) {
  // A raft-role string used as an object-literal property VALUE (the RAFT_ROLE
  // enum definition itself, event maps, log payloads) is not a membership set.
  const parent = ancestors[ancestors.length - 1];
  return parent?.type === NODE_TYPE.PROPERTY;
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
  const countedRoleSetArrays = new Set();
  walkAst(ast, (node, _parent, ancestors) => {
    const roleSetArray = findRoleSetArray(node, ancestors);
    if (roleSetArray && !countedRoleSetArrays.has(roleSetArray)) {
      const members = collectRoleSetMembers(roleSetArray);
      if (members.length >= MIN_ROLE_SET_MEMBERS) {
        countedRoleSetArrays.add(roleSetArray);
        sites.push({
          filePath: repoPath,
          line: node.loc?.start?.line ?? 0,
          kind: VIOLATION_KIND.ROLE_SET,
          enclosingIdentifier: findEnclosingIdentifier(ancestors),
          detail: members.join(LOCAL_STR_OWNED_008),
        });
      }
      return;
    }
    if (isLearnerMembershipComparison(node) &&
        !isEnumDefinitionProperty(ancestors)) {
      sites.push({
        filePath: repoPath,
        line: node.loc?.start?.line ?? 0,
        kind: VIOLATION_KIND.LEARNER_COMPARISON,
        enclosingIdentifier: findEnclosingIdentifier(ancestors),
        detail: node.operator,
      });
      return;
    }
    if (node.type === NODE_TYPE.VARIABLE_DECLARATOR &&
        node.id?.type === NODE_TYPE.IDENTIFIER &&
        node.id.name === CRITICAL_PARTITION_SET_NAME &&
        node.init &&
        repoPath !== PARTITION_CLASS_TAXONOMY_MODULE) {
      sites.push({
        filePath: repoPath,
        line: node.loc?.start?.line ?? 0,
        kind: VIOLATION_KIND.CRITICAL_PARTITION_SET,
        enclosingIdentifier: node.id.name,
        detail: LOCAL_STR_OWNED_009,
      });
      return;
    }
    // A module-local alias of the learner scalar (const X = 'learner') is a
    // membership literal laundered through a name; enum vocabulary properties
    // (LEARNER: 'learner' inside a role enum) are Property nodes and stay out.
    if (node.type === NODE_TYPE.VARIABLE_DECLARATOR &&
        node.init?.type === NODE_TYPE.LITERAL &&
        typeof node.init.value === 'string' &&
        node.init.value.toLowerCase() === LEARNER_ROLE) {
      sites.push({
        filePath: repoPath,
        line: node.loc?.start?.line ?? 0,
        kind: VIOLATION_KIND.LEARNER_ALIAS,
        enclosingIdentifier: node.id?.name || LOCAL_STR_OWNED_010,
        detail: node.init.value,
      });
    }
  });
  return sites;
}

async function collectJavaScriptFiles(entryPath) {
  const stat = await fs.stat(entryPath);
  if (stat.isFile()) {
    return entryPath.endsWith(LOCAL_STR_OWNED_011) ? [entryPath] : [];
  }
  if (!stat.isDirectory()) return [];
  const children = await fs.readdir(entryPath, {withFileTypes: true});
  const collected = [];
  for (const child of children) {
    const childPath = path.join(entryPath, child.name);
    if (child.isDirectory()) {
      collected.push(...await collectJavaScriptFiles(childPath));
    } else if (child.isFile() && childPath.endsWith(LOCAL_STR_OWNED_011)) {
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
    classification: LOCAL_STR_OWNED_012,
    detail: {
      generatedBy: LOCAL_STR_OWNED_013,
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

// --oracle-file / --done-at let a bounded child quest (scope-pressure split of
// the migration) measure the SAME census against its own sealed threshold;
// the parent quest keeps the default file and done-at 0.
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
    await fs.writeFile(oraclePath, JSON.stringify(payload, null, 2) + LOCAL_STR_OWNED_014);
  }
  process.stdout.write(JSON.stringify(payload, null, 2) + LOCAL_STR_OWNED_014);
  return payload.metric <= doneAt ? EXIT_CODE.SUCCESS : EXIT_CODE.FAILURE;
}

runGuidelineCheckWhenDirect(import.meta.url, main);

export {collectCensus, collectFileSites};
