// Input loading and full-escalation helpers for the impact proof-cone
// selector (developer-velocity epic). Same owner as impact-proof-cone.js;
// extracted to keep selectProofCone within the complexity budget. No
// selection policy lives here — only input reads, freshness evaluation, and
// the full-census escalation constructor.

import fs from 'node:fs';
import path from 'node:path';

import {
  COVERAGE_MINIMUM_TEST_SHARE,
  COVERAGE_SCHEMA_VERSION,
  ESCALATION_RULE_ABSENT_COVERAGE,
  ESCALATION_RULE_INSUFFICIENT_COVERAGE,
  ESCALATION_RULE_STALE_COVERAGE,
  IMPORT_GRAPH_PATH,
  PROOF_CONE_CONTRACTS_PATH,
  PROOF_CONE_COVERAGE_PATH,
  REASON_ESCALATION,
} from './impact-proof-cone-constants.js';
import {
  PRIMARY_CLASS_MANIFEST_PATH,
  loadManifest as loadPrimaryManifest,
} from './test-primary-classification.js';

const UTF8_ENCODING = 'utf8';
const HASH_ALGORITHM = 'sha256';
const HASH_ENCODING = 'hex';

import crypto from 'node:crypto';

export function currentFileDigest(root, relPath) {
  const absolute = path.join(root, relPath);
  if (!fs.existsSync(absolute)) return null;
  return crypto.createHash(HASH_ALGORITHM)
    .update(fs.readFileSync(absolute)).digest(HASH_ENCODING);
}

export function readJsonInput(root, relPath) {
  const absolute = path.join(root, relPath);
  if (!fs.existsSync(absolute)) {
    return {ok: false, problem: `missing required input: ${relPath}`};
  }
  try {
    return {ok: true, value: JSON.parse(fs.readFileSync(absolute, UTF8_ENCODING))};
  } catch (error) {
    return {ok: false, problem: `invalid JSON in ${relPath}: ${error.message}`};
  }
}

export function loadSelectorInputs(root) {
  const primary = loadPrimaryManifest(root, PRIMARY_CLASS_MANIFEST_PATH);
  if (!primary.ok) return {ok: false, problems: primary.problems};
  const contractsRead = readJsonInput(root, PROOF_CONE_CONTRACTS_PATH);
  if (!contractsRead.ok) return {ok: false, problems: [contractsRead.problem]};
  const graphRead = readJsonInput(root, IMPORT_GRAPH_PATH);
  if (!graphRead.ok) return {ok: false, problems: [graphRead.problem]};
  const coverageRead = readJsonInput(root, PROOF_CONE_COVERAGE_PATH);
  return {
    ok: true,
    primary: primary.manifest,
    contracts: contractsRead.value,
    importers: graphRead.value.importers || {},
    importGraphDigest: graphRead.value.sourceDigest || null,
    coverage: coverageRead.ok ? coverageRead.value : null,
  };
}

// Coverage freshness is per-edge, not per-repository: an edge is stale only
// when the bytes of a file it binds actually changed since collection (the
// snapshot records a content digest of every covered file). The import-graph
// sourceDigest churns on every src commit, so it is provenance, never the
// freshness oracle. Sufficiency: the snapshot must cover a meaningful share
// of the census before it can discharge owner-tier proof obligations.
export function evaluateCoverage(root, coverageSnapshot, censusSize) {
  if (!coverageSnapshot) {
    return {present: false, fresh: false, sufficient: false, staleEdges: 0, share: 0};
  }
  const coverageTests = coverageSnapshot.tests || {};
  const fileDigests = coverageSnapshot.fileDigests || {};
  let staleEdges = 0;
  for (const covered of Object.values(coverageTests)) {
    for (const coveredPath of covered) {
      const recorded = fileDigests[coveredPath];
      if (recorded && recorded !== currentFileDigest(root, coveredPath)) {
        staleEdges += 1;
      }
    }
  }
  const fresh = coverageSnapshot.schemaVersion === COVERAGE_SCHEMA_VERSION &&
    staleEdges === 0;
  const share = Object.keys(coverageTests).length / Math.max(1, censusSize);
  return {
    present: true,
    fresh,
    sufficient: fresh && share >= COVERAGE_MINIMUM_TEST_SHARE,
    staleEdges,
    share,
    digest: coverageSnapshot.sourceDigest || null,
  };
}

export function coverageEscalationRule(evaluation) {
  if (!evaluation.present) return ESCALATION_RULE_ABSENT_COVERAGE;
  if (evaluation.fresh) return ESCALATION_RULE_INSUFFICIENT_COVERAGE;
  return ESCALATION_RULE_STALE_COVERAGE;
}

// The full-census escalation decision. Every test carries the escalation
// reason; there is deliberately no empty-tests "probably safe" mode.
export function fullCensusEscalation(receipt, classifiedTests, rule) {
  receipt.fullSuite = true;
  receipt.escalationRule = rule;
  receipt.selectedTests = [...classifiedTests];
  receipt.counts.uniqueSelected = classifiedTests.length;
  const testReasons = {};
  for (const testPath of classifiedTests) {
    testReasons[testPath] = [REASON_ESCALATION];
  }
  receipt.testReasons = testReasons;
  return receipt;
}
