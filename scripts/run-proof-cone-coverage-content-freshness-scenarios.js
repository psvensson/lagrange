#!/usr/bin/env node
// Scenario runner for the proof-cone-coverage-content-freshness Quest.
// Proves: coverage edges go stale only when a bound file's bytes change
// (per-file sha256), not when the import-graph digest churns; forged file
// digests widen fail-closed; unrelated state leaves the snapshot fresh.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {selectProofCone} from './checks/impact-proof-cone.js';
import {
  emitScenarioReport,
  scenarioAssert as assert,
  scenarioCheck as check,
} from './checks/scenario-report-emit.js';
import {
  PROOF_CONE_COVERAGE_PATH,
  REPORTS_DIRECTORY,
} from './checks/impact-proof-cone-constants.js';

const SCENARIO = 'proof-cone-coverage-content-freshness';
const UTF8_ENCODING = 'utf8';
const LABEL_CONTENT_FRESH = 'snapshot-fresh-on-current-bytes';
const LABEL_FORGED_DIGEST_WIDENS = 'forged-covered-file-digest-widens';
const LABEL_UNRELATED_CHURN_SAFE = 'unrelated-graph-digest-churn-stays-fresh';
const LABEL_DIGESTS_RECORDED = 'collector-records-per-file-digests';

const LEAF_CHANGE = 'src/runtime/call-cell-value-mapping.js';
const OWNER_CHANGE = 'src/rebalancer/placement-owner-decision.js';
const DIGEST_FORGE = 'f'.repeat(64);
const ERR_NO_DIGESTS = 'snapshot lacks fileDigests';
const ERR_STALE_ON_UNCHANGED = 'stale edges reported on unchanged bytes';
const DETAIL_FRESH = 'snapshot fresh: zero stale edges on unchanged bytes';
const ERR_NOTHING_TO_FORGE = 'no digests to forge';
const ERR_FORGE_NOT_WIDEN = 'forged digest did not widen the owner-tier cone';
const ERR_STALE_NOT_COUNTED = 'stale edge not counted';
const STALE_WORD = 'stale';
const ERR_STALE_UNNAMED = 'staleness not named';
const DETAIL_WIDENED = 'edge(s) and widened fail-closed';
const ERR_CHURN_STALE = 'graph-digest churn alone marked the snapshot stale';
const ERR_CHURN_WIDENED = 'graph-digest churn widened the cone';
const DETAIL_CHURN_SAFE = 'import-graph digest churn with unchanged bytes leaves edges fresh';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function withForgedSnapshot(mutate, fn) {
  const target = path.join(root, PROOF_CONE_COVERAGE_PATH);
  const original = fs.readFileSync(target, UTF8_ENCODING);
  const forged = JSON.parse(original);
  mutate(forged);
  fs.writeFileSync(target, JSON.stringify(forged));
  try {
    return fn();
  } finally {
    fs.writeFileSync(target, original);
  }
}

const checks = [];

checks.push(check(LABEL_DIGESTS_RECORDED, () => {
  const snapshot = JSON.parse(
    fs.readFileSync(path.join(root, PROOF_CONE_COVERAGE_PATH), UTF8_ENCODING));
  const digests = snapshot.fileDigests || {};
  assert(Object.keys(digests).length > 0, ERR_NO_DIGESTS);
  for (const [relPath, digest] of Object.entries(digests)) {
    assert(/^[0-9a-f]{64}$/u.test(digest), `${relPath} digest is not sha256 hex`);
  }
  return `${Object.keys(digests).length} covered files carry sha256 digests`;
}));

checks.push(check(LABEL_CONTENT_FRESH, () => {
  const {selection} = selectProofCone(root, [LEAF_CHANGE]);
  assert(selection.inputs.coverageFresh === true,
    `snapshot not fresh on current bytes (staleEdges=${selection.inputs.coverageStaleEdges})`);
  assert(selection.inputs.coverageStaleEdges === 0,
    ERR_STALE_ON_UNCHANGED);
  return DETAIL_FRESH;
}));

checks.push(check(LABEL_FORGED_DIGEST_WIDENS, () => {
  return withForgedSnapshot((forged) => {
    const keys = Object.keys(forged.fileDigests || {});
    assert(keys.length > 0, ERR_NOTHING_TO_FORGE);
    forged.fileDigests[keys[0]] = DIGEST_FORGE;
  }, () => {
    const {selection, problems} = selectProofCone(root, [OWNER_CHANGE]);
    assert(selection.fullSuite, ERR_FORGE_NOT_WIDEN);
    assert(selection.inputs.coverageStaleEdges > 0, ERR_STALE_NOT_COUNTED);
    assert(problems.some((problem) => problem.includes(STALE_WORD)),
      ERR_STALE_UNNAMED);
    return `forged digest produced ${selection.inputs.coverageStaleEdges} stale ` +
      DETAIL_WIDENED;
  });
}));

checks.push(check(LABEL_UNRELATED_CHURN_SAFE, () => {
  // Simulate the import-graph sourceDigest moving (as it does on every src
  // commit) while covered bytes stay identical: freshness must NOT move.
  return withForgedSnapshot((forged) => {
    forged.sourceDigest = DIGEST_FORGE;
  }, () => {
    const {selection} = selectProofCone(root, [LEAF_CHANGE]);
    assert(selection.inputs.coverageFresh === true,
      ERR_CHURN_STALE);
    assert(!selection.fullSuite, ERR_CHURN_WIDENED);
    return DETAIL_CHURN_SAFE;
  });
}));

emitScenarioReport(root, REPORTS_DIRECTORY, SCENARIO, checks);
