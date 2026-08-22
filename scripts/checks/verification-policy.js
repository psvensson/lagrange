// Canonical verification-plan owner.
//
// Change meaning belongs to change-selection.js and test scheduling belongs to
// run-classified-test-files.js. This module only composes those authorities
// into named boundary profiles. Callers may choose a profile; they may not add
// or subtract leaves from it.

import {
  SELECTION_REFUSED,
} from './change-selection-constants.js';
import {
  changedRecords,
  semanticPaths,
  vanishedPaths,
} from './changed-paths.js';
import {
  buildExecutionPlan,
  changedPackageFields,
} from '../select-change-tests.js';
import {
  planNamedTestProfile,
  TEST_PROFILE_FAST,
} from '../plan-test-lane.js';

const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayMap = Function.call.bind(Array.prototype.map);

export const VERIFICATION_PROFILE_AFFECTED = 'affected';
export const VERIFICATION_PROFILE_PREPUSH = 'prepush';
export const VERIFICATION_PROFILE_RELEASE = 'release';
export const VERIFICATION_PROFILES = Object.freeze([
  VERIFICATION_PROFILE_AFFECTED,
  VERIFICATION_PROFILE_PREPUSH,
  VERIFICATION_PROFILE_RELEASE,
]);

const DEFAULT_HEAD = 'HEAD';
const NPM = 'npm';
const NODE = process.execPath;
const FOCUSED_TESTS = Object.freeze([
  'test/scripts/run-test-files.test.js',
  'test/scripts/acceptance-proof-manifest-runner.test.js',
  'test/release/public-api-side-effect-boundary.test.js',
  'test/release/project-hardening-contracts.test.js',
  'test/admin/admin-websocket-external-bind-policy.test.js',
  'test/runtime/pgwire-protocol-ordering.test.js',
  'test/compatibility/pgwire-client-compat.test.js',
]);
const PREPUSH_COMMANDS = Object.freeze([
  Object.freeze({id: 'thermal-headroom', executable: NODE,
    argv: ['scripts/checks/wait-for-thermal-headroom.js']}),
  Object.freeze({id: 'unused-files', executable: NPM,
    argv: ['run', '-s', 'test:unused:push']}),
  Object.freeze({id: 'lint-scripts', executable: NPM,
    argv: ['run', '-s', 'lint:scripts']}),
  Object.freeze({id: 'lint-product-and-tests', executable: NPM,
    argv: ['run', '-s', 'lint']}),
  Object.freeze({id: 'cycles', executable: NPM,
    argv: ['run', '-s', 'test:cycles']}),
  Object.freeze({id: 'duplication', executable: NPM,
    argv: ['run', '-s', 'test:duplication']}),
  Object.freeze({id: 'unused-exports', executable: NPM,
    argv: ['run', '-s', 'test:unused:ratchet']}),
  Object.freeze({id: 'static-audits', executable: NPM,
    argv: ['run', '-s', 'test:static:postpush']}),
  Object.freeze({id: 'model-contracts', executable: NPM,
    argv: ['run', '-s', 'model:contracts']}),
  Object.freeze({id: 'owner-debt-inputs', executable: NPM,
    argv: ['run', '-s', 'test:owner-debt:prepare']}),
  Object.freeze({id: 'golden-capability-guards', executable: NODE,
    argv: ['scripts/checks/run-golden-capability-guard-scenarios.js']}),
]);

export class VerificationPolicyError extends Error {
  constructor(code, problems) {
    super(`${code}: ${problems.join('\n')}`);
    this.name = 'VerificationPolicyError';
    this.code = code;
    this.problems = [...problems];
  }
}

function affectedPlan(root, base) {
  const records = changedRecords({root, base, head: DEFAULT_HEAD});
  const changedPaths = semanticPaths(records);
  const packageFields = changedPackageFields(
    base, base ? DEFAULT_HEAD : null, root);
  const plan = buildExecutionPlan({
    changedPaths,
    packageFields,
    vanished: vanishedPaths(records),
    planRoot: root,
  });
  if (plan.kind === SELECTION_REFUSED) {
    throw new VerificationPolicyError(
      plan.refusalCode || SELECTION_REFUSED, plan.refusals);
  }
  return plan;
}

function affectedStaticCommand(base) {
  const argv = ['scripts/check-fast-static.js'];
  if (base) argv.push('--base', base);
  return {id: 'fast-static', executable: NODE, argv};
}

function unionTests(...groups) {
  const tests = new Set();
  for (const group of groups) {
    for (const entry of group) {
      tests.add(typeof entry === 'string' ? entry : entry.path);
    }
  }
  return [...tests].sort();
}

export function buildVerificationPlan({root, profile, base = null}) {
  if (!arrayIncludes(VERIFICATION_PROFILES, profile)) {
    throw new VerificationPolicyError('UNKNOWN_PROFILE', [String(profile)]);
  }
  if (profile === VERIFICATION_PROFILE_RELEASE) {
    return {
      schemaVersion: 1,
      profile,
      base: null,
      selection: 'COMPLETE',
      changedPaths: [],
      commands: [{id: 'release-proof', executable: NPM,
        argv: ['run', '-s', 'test:gate']}],
      tests: [],
    };
  }

  const affected = affectedPlan(root, base);
  if (profile === VERIFICATION_PROFILE_AFFECTED) {
    return {
      schemaVersion: 1,
      profile,
      base,
      selection: affected.kind,
      changedPaths: affected.changedPaths,
      commands: [affectedStaticCommand(base)],
      tests: unionTests(affected.tests),
    };
  }

  const fast = planNamedTestProfile(root, TEST_PROFILE_FAST);
  return {
    schemaVersion: 1,
    profile,
    base,
    selection: affected.kind,
    changedPaths: affected.changedPaths,
    commands: arrayMap(PREPUSH_COMMANDS, (command) => ({
      id: command.id,
      executable: command.executable,
      argv: [...command.argv],
    })),
    tests: unionTests(affected.tests, fast, FOCUSED_TESTS),
    counts: {
      affected: affected.tests.length,
      fast: fast.length,
      focused: FOCUSED_TESTS.length,
    },
  };
}
