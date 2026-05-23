#!/usr/bin/env node

import process from 'node:process';
import {fileURLToPath} from 'node:url';

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const NUM_ONE = 1;
const NUM_TWO = 2;
const NEWLINE = '\n';
const EMPTY_TEXT = '';
const FLAG_HELP = '--help';
const FLAG_DOCS_ONLY = '--docs-only';
const FLAG_MAINTENANCE = '--maintenance';
const FLAG_TESTS_ONLY = '--tests-only';
const FLAG_CLASSIFICATION = '--classification';
const FLAG_EXPERIMENT = '--experiment';
const FLAG_RUNTIME = '--runtime';
const FLAG_SCENARIO = '--scenario';
const FLAG_SRC = '--src';
const FLAG_TEST = '--test';
const FLAG_SCRIPT = '--script';
const FLAG_WORK = '--work';
const FLAG_REPRESENTATIVE = '--representative';
const FLAG_SHARED_CONTRACT = '--shared-contract';
const FLAG_RUNTIME_CONTRACT = '--runtime-contract';
const FLAG_ONE_FILE = '--one-file';
const CANONICAL_LANE_READ_DOC = 'read-doc';
const CANONICAL_LANE_MAINTENANCE = 'maintenance';
const CANONICAL_LANE_PROOF = 'proof';
const CANONICAL_LANE_EXPERIMENT = 'experiment';
const CANONICAL_LANE_RUNTIME = 'runtime';
const CANONICAL_LANE_SCENARIO = 'scenario';
const PACKAGE_LANE_READ_REVIEW_DOC_ONLY = 'read-review-doc-only';
const PACKAGE_LANE_MECHANICAL_MAINTENANCE = 'mechanical-maintenance';
const PACKAGE_LANE_LIGHTWEIGHT_MAINTENANCE = 'lightweight-maintenance';
const PACKAGE_LANE_TEST_ONLY_PROOF = 'test-only-proof';
const PACKAGE_LANE_DIAGNOSTIC_CLASSIFICATION = 'diagnostic-classification';
const PACKAGE_LANE_EXPERIMENT = 'experiment';
const PACKAGE_LANE_BOUNDED_EXPERIMENT = 'bounded-experiment';
const PACKAGE_LANE_SINGLE_FILE_RUNTIME = 'single-file-runtime';
const PACKAGE_LANE_RUNTIME_OWNER_BOUNDARY = 'runtime-owner-boundary';
const PACKAGE_LANE_SCENARIO_RELEASE_GATE = 'scenario-release-gate';
const PACKAGE_LANE_CAUSAL_ESCALATION = 'causal-escalation';
const PACKAGE_LANE_FAST_SPIKE = 'fast-spike';
const DEFAULT_REASON = 'No strong signal selected; use maintenance until runtime, scenario, experiment, or test-only proof is named.';
const HELP_TEXT = [
  'Usage:',
  '  node scripts/work-lane-picker.js [flags]',
  '',
  'Flags:',
  '  --docs-only              docs/prose only',
  '  --maintenance            scripts/templates/package tooling maintenance',
  '  --tests-only             tests or fixtures only',
  '  --classification         diagnostic classification without runtime edits',
  '  --experiment             probe or bounded hypothesis package',
  '  --runtime                runtime owner-boundary work',
  '  --scenario               representative scenario/release-gate work',
  '  --src --test --script --work --one-file --representative --shared-contract',
].join(NEWLINE);

const CANONICAL_WORKFLOW_LANES = Object.freeze([
  CANONICAL_LANE_READ_DOC,
  CANONICAL_LANE_MAINTENANCE,
  CANONICAL_LANE_PROOF,
  CANONICAL_LANE_EXPERIMENT,
  CANONICAL_LANE_RUNTIME,
  CANONICAL_LANE_SCENARIO,
]);

const LEGACY_LANE_ALIASES = Object.freeze({
  [PACKAGE_LANE_READ_REVIEW_DOC_ONLY]: CANONICAL_LANE_READ_DOC,
  [PACKAGE_LANE_MECHANICAL_MAINTENANCE]: CANONICAL_LANE_MAINTENANCE,
  [PACKAGE_LANE_LIGHTWEIGHT_MAINTENANCE]: CANONICAL_LANE_MAINTENANCE,
  [PACKAGE_LANE_TEST_ONLY_PROOF]: CANONICAL_LANE_PROOF,
  [PACKAGE_LANE_DIAGNOSTIC_CLASSIFICATION]: CANONICAL_LANE_PROOF,
  [PACKAGE_LANE_EXPERIMENT]: CANONICAL_LANE_EXPERIMENT,
  [PACKAGE_LANE_BOUNDED_EXPERIMENT]: CANONICAL_LANE_EXPERIMENT,
  [PACKAGE_LANE_FAST_SPIKE]: CANONICAL_LANE_EXPERIMENT,
  [PACKAGE_LANE_SINGLE_FILE_RUNTIME]: CANONICAL_LANE_RUNTIME,
  [PACKAGE_LANE_RUNTIME_OWNER_BOUNDARY]: CANONICAL_LANE_RUNTIME,
  [PACKAGE_LANE_SCENARIO_RELEASE_GATE]: CANONICAL_LANE_SCENARIO,
  [PACKAGE_LANE_CAUSAL_ESCALATION]: CANONICAL_LANE_SCENARIO,
});

function hasFlag(args, flag) {
  return args.includes(flag);
}

function canonicalLaneForPackageLane(lane) {
  return LEGACY_LANE_ALIASES[lane] || lane || CANONICAL_LANE_MAINTENANCE;
}

function buildSignalsFromArgs(args = []) {
  return {
    docsOnly: hasFlag(args, FLAG_DOCS_ONLY),
    maintenance: hasFlag(args, FLAG_MAINTENANCE),
    testsOnly: hasFlag(args, FLAG_TESTS_ONLY),
    classification: hasFlag(args, FLAG_CLASSIFICATION),
    experiment: hasFlag(args, FLAG_EXPERIMENT),
    runtime: hasFlag(args, FLAG_RUNTIME) || hasFlag(args, FLAG_RUNTIME_CONTRACT),
    scenario: hasFlag(args, FLAG_SCENARIO) || hasFlag(args, FLAG_REPRESENTATIVE),
    src: hasFlag(args, FLAG_SRC),
    test: hasFlag(args, FLAG_TEST),
    script: hasFlag(args, FLAG_SCRIPT),
    work: hasFlag(args, FLAG_WORK),
    oneFile: hasFlag(args, FLAG_ONE_FILE),
    sharedContract: hasFlag(args, FLAG_SHARED_CONTRACT),
  };
}

function recommendLane(signals = {}) {
  if (signals.scenario) {
    return {
      canonicalLane: CANONICAL_LANE_SCENARIO,
      packageLane: PACKAGE_LANE_SCENARIO_RELEASE_GATE,
      reason: 'Representative scenario or release-gate evidence drives the work.',
    };
  }
  if (signals.runtime || signals.sharedContract || signals.src) {
    return {
      canonicalLane: CANONICAL_LANE_RUNTIME,
      packageLane: signals.oneFile ?
        PACKAGE_LANE_SINGLE_FILE_RUNTIME :
        PACKAGE_LANE_RUNTIME_OWNER_BOUNDARY,
      reason: signals.oneFile ?
        'One preselected runtime file can use the single-file runtime lane.' :
        'Runtime or shared-contract behavior can change.',
    };
  }
  if (signals.experiment) {
    return {
      canonicalLane: CANONICAL_LANE_EXPERIMENT,
      packageLane: PACKAGE_LANE_EXPERIMENT,
      reason: 'The package success criterion is information or a bounded hypothesis.',
    };
  }
  if (signals.testsOnly || signals.classification || signals.test) {
    return {
      canonicalLane: CANONICAL_LANE_PROOF,
      packageLane: signals.classification ?
        PACKAGE_LANE_DIAGNOSTIC_CLASSIFICATION :
        PACKAGE_LANE_TEST_ONLY_PROOF,
      reason: signals.classification ?
        'Diagnostic classification records evidence without runtime edits.' :
        'The write scope is test or fixture proof only.',
    };
  }
  if (signals.docsOnly) {
    return {
      canonicalLane: CANONICAL_LANE_READ_DOC,
      packageLane: PACKAGE_LANE_READ_REVIEW_DOC_ONLY,
      reason: 'The work is docs or review text only.',
    };
  }
  if (signals.maintenance || signals.script || signals.work) {
    return {
      canonicalLane: CANONICAL_LANE_MAINTENANCE,
      packageLane: PACKAGE_LANE_LIGHTWEIGHT_MAINTENANCE,
      reason: 'The work is bounded tooling, template, package, or workflow maintenance.',
    };
  }
  return {
    canonicalLane: CANONICAL_LANE_MAINTENANCE,
    packageLane: PACKAGE_LANE_LIGHTWEIGHT_MAINTENANCE,
    reason: DEFAULT_REASON,
  };
}

function recommendLaneForPackage(metadata = {}) {
  const lane = metadata.lane || EMPTY_TEXT;
  return {
    canonicalLane: canonicalLaneForPackageLane(lane),
    packageLane: lane || PACKAGE_LANE_LIGHTWEIGHT_MAINTENANCE,
    reason: lane ?
      `Existing package lane ${lane} maps to the canonical bucket.` :
      DEFAULT_REASON,
  };
}

function renderRecommendation(recommendation) {
  return [
    '# Work Lane Picker',
    EMPTY_TEXT,
    `- Canonical lane: \`${recommendation.canonicalLane}\``,
    `- Package lane: \`${recommendation.packageLane}\``,
    `- Reason: ${recommendation.reason}`,
    EMPTY_TEXT,
    '## Canonical Lanes',
    EMPTY_TEXT,
    ...CANONICAL_WORKFLOW_LANES.map((lane) => `- \`${lane}\``),
    EMPTY_TEXT,
  ].join(NEWLINE);
}

function runCli(args = process.argv.slice(NUM_TWO)) {
  if (args.includes(FLAG_HELP)) {
    return `${HELP_TEXT}${NEWLINE}`;
  }
  return `${renderRecommendation(recommendLane(buildSignalsFromArgs(args)))}${NEWLINE}`;
}

function isDirectRun() {
  return process.argv[NUM_ONE] === fileURLToPath(import.meta.url);
}

if (isDirectRun()) {
  try {
    process.stdout.write(runCli());
    process.exitCode = EXIT_SUCCESS;
  } catch (error) {
    process.stderr.write(`${error.message}${NEWLINE}`);
    process.exitCode = EXIT_FAILURE;
  }
}

export {
  CANONICAL_WORKFLOW_LANES,
  LEGACY_LANE_ALIASES,
  canonicalLaneForPackageLane,
  recommendLane,
  recommendLaneForPackage,
  renderRecommendation,
  runCli,
};
