#!/usr/bin/env node
// Scenario runner for the selective-quest-landing-cutover Quest (V4c).
// Proves the sealed result: the landing preflight attaches a deterministic
// proof-cone receipt derived from the aggregate changed paths; leaf diffs
// select a cone; self-change/unknown diffs force the full suite; and the
// quest-proof command executes the selected tests through the fail-closed
// runner.

import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  PROBLEM_JOIN_SEPARATOR,
  REPORTS_DIRECTORY,
  SELECTION_SAFETY_FLOOR,
} from './checks/impact-proof-cone-constants.js';
import {landingReviewPreflight} from './solve/landing-preflight.js';
import {
  emitScenarioReport,
  scenarioAssert as assert,
  scenarioCheck as check,
} from './checks/scenario-report-emit.js';
import {
  PRIMARY_CLASS_MANIFEST_PATH,
  loadManifest,
} from './checks/test-primary-classification.js';

const stringIncludes = Function.call.bind(String.prototype.includes);

const SCENARIO = 'selective-quest-landing-cutover';
const UTF8_ENCODING = 'utf8';
const LABEL_PREFLIGHT_RECEIPT = 'landing-preflight-attaches-receipt';
const LABEL_LEAF_CONE = 'leaf-diff-lands-on-cone';
const LABEL_SELF_CHANGE_FULL = 'self-change-forces-full-suite';
const LABEL_UNKNOWN_FULL = 'unknown-path-forces-full-suite';
const LABEL_QUEST_PROOF_RUNS = 'quest-proof-executes-selection';
const LABEL_RECEIPT_AUDITABLE = 'receipt-more-auditable-than-full-run';

const LEAF_CHANGE = 'src/runtime/call-cell-value-mapping.js';
const SELF_CHANGE = 'scripts/run-test-files.js';
const UNKNOWN_CHANGE = 'substrate.toml';
const DOC_CHANGE = 'docs/steering/llm/core.md';
const SAFETY_FLOOR_SAMPLE = 'test/closure/CL-040.repro.test.js';
const QUEST_PROOF_CMD = 'scripts/run-quest-proof.js';
const SELECTOR_VERSION_PIN = 'proof-cone-selector/1';
const FAKE_CANDIDATE_DIGEST = 'sha256:candidate';
const FAKE_AGGREGATE_DIGEST = 'sha256:aggregate';
const ERR_NO_RECEIPT = 'preflight lacks the proof-cone receipt';
const ERR_NO_VERSION = 'receipt lacks the selector version pin';
const ERR_NO_COUNTS = 'receipt lacks per-edge-kind counts';
const ERR_NO_CENSUS_DIGEST = 'receipt lacks the census digest';
const ERR_WHOLE_CENSUS = 'leaf diff selected the whole census';
const ERR_NO_FLOOR = 'cone lacks the safety floor';
const ERR_SELF_NOT_FULL = 'self-change did not force full suite';
const ERR_FULL_NOT_CENSUS = 'self-change full suite is not the complete census';
const DETAIL_SELF_FULL = 'test-runner self-change selects the complete census';
const ERR_UNKNOWN_NOT_FULL = 'unknown path did not force full suite';
const ERR_UNKNOWN_UNNAMED = 'unknown path not named in receipt problems';
const DETAIL_UNKNOWN_FULL = 'unknown path fails closed with the path named in the receipt';
const STDERR_TAIL_LIMIT = 400;
const DOC_TIER_MARKER = 'quest-proof: tier=documentation';
const ERR_NO_DOC_TIER = 'quest-proof did not report the documentation tier';
const DETAIL_QUEST_PROOF = 'quest-proof executed the documentation-tier safety floor green';
const ERR_NO_GRAPH_DIGEST = 'receipt lacks the import-graph digest';
const ERR_NO_FRESHNESS = 'receipt lacks the coverage freshness marker';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function manifestFor(changedPaths) {
  return {
    candidate: {fingerprint: FAKE_CANDIDATE_DIGEST, paths: changedPaths},
    aggregate: {
      fingerprint: FAKE_AGGREGATE_DIGEST,
      paths: changedPaths,
      sourcePaths: changedPaths,
    },
  };
}

const checks = [];

checks.push(check(LABEL_PREFLIGHT_RECEIPT, () => {
  const preflight = landingReviewPreflight(root, manifestFor([DOC_CHANGE]));
  assert(preflight.proofCone, ERR_NO_RECEIPT);
  assert(preflight.proofCone.selectorVersion === SELECTOR_VERSION_PIN,
    ERR_NO_VERSION);
  assert(preflight.proofCone.counts, ERR_NO_COUNTS);
  assert(preflight.proofCone.inputs?.primaryClassDigest,
    ERR_NO_CENSUS_DIGEST);
  return `preflight attaches receipt (tier=${preflight.proofCone.escalation})`;
}));

checks.push(check(LABEL_LEAF_CONE, () => {
  const preflight = landingReviewPreflight(root, manifestFor([LEAF_CHANGE]));
  const cone = preflight.proofCone;
  assert(!cone.fullSuite, `leaf diff escalated: ${cone.problems.join(PROBLEM_JOIN_SEPARATOR)}`);
  const primary = loadManifest(root, PRIMARY_CLASS_MANIFEST_PATH);
  assert(cone.selectedTests.length < primary.manifest.censusSize,
    ERR_WHOLE_CENSUS);
  assert(cone.selectedTests.includes(SAFETY_FLOOR_SAMPLE),
    ERR_NO_FLOOR);
  return `leaf diff lands on ${cone.selectedTests.length}-test cone`;
}));

checks.push(check(LABEL_SELF_CHANGE_FULL, () => {
  const preflight = landingReviewPreflight(root, manifestFor([SELF_CHANGE]));
  const primary = loadManifest(root, PRIMARY_CLASS_MANIFEST_PATH);
  assert(preflight.proofCone.fullSuite, ERR_SELF_NOT_FULL);
  assert(preflight.proofCone.selectedTests.length === primary.manifest.censusSize,
    ERR_FULL_NOT_CENSUS);
  return DETAIL_SELF_FULL;
}));

checks.push(check(LABEL_UNKNOWN_FULL, () => {
  const preflight = landingReviewPreflight(root, manifestFor([UNKNOWN_CHANGE]));
  assert(preflight.proofCone.fullSuite, ERR_UNKNOWN_NOT_FULL);
  assert(preflight.proofCone.problems.some((problem) =>
    stringIncludes(problem, UNKNOWN_CHANGE)),
  ERR_UNKNOWN_UNNAMED);
  return DETAIL_UNKNOWN_FULL;
}));

checks.push(check(LABEL_QUEST_PROOF_RUNS, () => {
  const result = spawnSync(
    process.execPath,
    [QUEST_PROOF_CMD, '--changed', DOC_CHANGE],
    {cwd: root, encoding: UTF8_ENCODING, timeout: 300000});
  assert(result.status === 0,
    `quest-proof failed: ${(result.stderr || '').slice(-STDERR_TAIL_LIMIT)}`);
  assert(stringIncludes(result.stderr, DOC_TIER_MARKER),
    ERR_NO_DOC_TIER);
  return DETAIL_QUEST_PROOF;
}));

checks.push(check(LABEL_RECEIPT_AUDITABLE, () => {
  const preflight = landingReviewPreflight(root, manifestFor([LEAF_CHANGE]));
  const cone = preflight.proofCone;
  const rationale = [
    cone.escalation,
    `static=${cone.counts.static}`,
    `coverage=${cone.counts.coverage}`,
    `contract=${cone.counts.contract}`,
    `floor=${cone.counts[SELECTION_SAFETY_FLOOR]}`,
  ].join(' ');
  assert(cone.inputs.importGraphDigest, ERR_NO_GRAPH_DIGEST);
  assert(typeof cone.inputs.coverageFresh === 'boolean',
    ERR_NO_FRESHNESS);
  return `receipt records why each proof is relevant: ${rationale}`;
}));

emitScenarioReport(root, REPORTS_DIRECTORY, SCENARIO, checks);
