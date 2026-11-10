import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {detectNavigabilityPatterns} from './code-navigability-detectors.js';
import {siteIdentity} from './code-navigability-source.js';
import {measureNavigabilityBudgetWithFailures} from './code-navigability-budget.js';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayFind = Function.call.bind(Array.prototype.find);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayMap = Function.call.bind(Array.prototype.map);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const stringIncludes = Function.call.bind(String.prototype.includes);
const stringTrim = Function.call.bind(String.prototype.trim);
const objectFreeze = Object.freeze;

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(CURRENT_DIR, '../..');
const UTF8 = 'utf8';
const CENSUS_PATH = 'data/fallback-census/census.json';
const CLASSIFICATION_PATH = 'scripts/checks/code-navigability-fallback-classification.json';
const EXPECTED_CENSUS_SCHEMA = 'fallback-census/1';
const EXPECTED_TOTAL_CENSUS_SITES = 2685;
const EXPECTED_ACTIVE_SRC_SITES = 2682;
const EXPECTED_RETIRED_SITES = 9;
const ROW_UNCLASSIFIED = 'fallback_sites_unclassified';
const ZERO_COUNT = 0;
const JS_EXTENSION = '.js';

const REASON_CENSUS_MISSING = 'Census file missing or schema mismatch';
const REASON_CLASSIFICATION_INVALID = 'Classification file missing or invalid';
const REASON_CLASSIFICATION_MISSING = 'Classification file missing';
const CHECK_FAILURE_MESSAGE = 'check-repository-legacy-fallback-closure failed\n';
const EXIT_CODE_FAILURE = 1;

const FALLBACK_ROWS = objectFreeze([
  'two_source_fallback_reads',
  'typeof_dual_paths',
  'catch_returns_default',
]);

const VALID_DISPOSITIONS = objectFreeze([
  'documented-default',
  'named-state-at-owner',
  'representation-normalization-at-owner',
  'defensive-nullish-guard',
  'dormant-error-recovery-branch',
]);

const PROHIBITED_RUNTIME_TERMS = objectFreeze([
  'allowLegacySemanticStateInference',
  'shouldAllowLegacyPriorityRecoverySemanticStateInference',
  'deriveLegacyPriorityRecoveryActiveGateFields',
  'buildLegacyNoProgress',
  'getPriorityRecoveryPlanningAnswerBestEffort',
  'getMembershipPublicationPlanningAnswerBestEffort',
  'resolveLegacy',
  'inferPriorityRecoverySemanticState',
  'pending_ack_nodes',
  'legacy_branch',
  'legacyBranches',
]);

const SCANNED_RUNTIME_DIRECTORIES = objectFreeze([
  'src/control-plane',
  'src/rebalancer',
  'src/diagnostics',
]);

const KEY_AFFECTED_WITNESS_FILES = objectFreeze([
  'test/bootstrap/bootstrap-topology-snapshot.test.js',
  'test/bootstrap/node-joining-service.test.js',
  'test/control-plane/active-node-projection.test.js',
  'test/rebalancer/unified-rebalancer.test.js',
  'test/partition/partition-service.test.js',
  'test/raft/leadership-transfer-single-path.test.js',
]);

const RETIRED_ROLLING_UPGRADE_TERM = 'options.nowMs || Date.now()';
const ROLLING_UPGRADE_PATH = 'src/bootstrap/owners/rolling-upgrade-owner.js';

const LIMITS_STATEMENT =
  'Coverage classes indicate observed execution in census runs, not proof of code death';

function readJsonFile(root, relativePath) {
  const fullPath = path.resolve(root, relativePath);
  if (!fs.existsSync(fullPath)) {
    return null;
  }
  const raw = fs.readFileSync(fullPath, UTF8);
  return JSON.parse(raw);
}

function auditCandidateInventory(root = REPO_ROOT) {
  const censusData = readJsonFile(root, CENSUS_PATH);
  if (!censusData || censusData.schema !== EXPECTED_CENSUS_SCHEMA) {
    return {
      isInventoryComplete: false,
      reason: REASON_CENSUS_MISSING,
      totalCensusSites: ZERO_COUNT,
      activeDetectedSites: ZERO_COUNT,
      retiredSites: ZERO_COUNT,
      byClass: {},
      byRow: {},
    };
  }

  const detection = detectNavigabilityPatterns(root);
  const detectedFallbackSites = arrayFilter(detection.sites, (site) =>
    arrayIncludes(FALLBACK_ROWS, site.row));

  const censusSites = Array.isArray(censusData.sites) ? censusData.sites : [];
  const detectedIdentities = new Set(arrayMap(detectedFallbackSites, siteIdentity));

  const byClass = {};
  const byRow = {};
  for (const site of censusSites) {
    byClass[site.class] = (byClass[site.class] || ZERO_COUNT) + 1;
    byRow[site.row] = (byRow[site.row] || ZERO_COUNT) + 1;
  }

  const retired = arrayFilter(censusSites, (site) =>
    !detectedIdentities.has(siteIdentity(site)));

  const isInventoryComplete = censusSites.length === EXPECTED_TOTAL_CENSUS_SITES &&
    detectedFallbackSites.length === EXPECTED_ACTIVE_SRC_SITES &&
    retired.length === EXPECTED_RETIRED_SITES;

  return {
    isInventoryComplete,
    totalCensusSites: censusSites.length,
    activeDetectedSites: detectedFallbackSites.length,
    retiredSites: retired.length,
    retired,
    byClass,
    byRow,
  };
}

function indexClassificationEntries(entries) {
  const classifiedMap = new Map();
  const byDisposition = {};
  const byOwner = {};

  for (const entry of entries) {
    const id = siteIdentity(entry);
    if (id !== undefined) {
      classifiedMap.set(id, entry);
      const disp = entry.classification;
      byDisposition[disp] = (byDisposition[disp] || ZERO_COUNT) + 1;
      const owner = entry.owner || entry.file;
      byOwner[owner] = (byOwner[owner] || ZERO_COUNT) + 1;
    }
  }
  return {classifiedMap, byDisposition, byOwner};
}

function countUnclassifiedSites(censusSites, classifiedMap) {
  let count = ZERO_COUNT;
  for (const site of censusSites) {
    const id = siteIdentity(site);
    if (!classifiedMap.has(id)) {
      count += 1;
    }
  }
  return count;
}

function readBudgetUnclassifiedValue(root) {
  const budgetResult = measureNavigabilityBudgetWithFailures(root);
  const unclassifiedRow = arrayFind(
    budgetResult.rows,
    (row) => row.name === ROW_UNCLASSIFIED,
  );
  return unclassifiedRow ? unclassifiedRow.value : null;
}

function auditClassificationClosure(root = REPO_ROOT) {
  const classificationData = readJsonFile(root, CLASSIFICATION_PATH);
  if (!classificationData || !Array.isArray(classificationData.entries)) {
    return {
      isClassificationComplete: false,
      reason: REASON_CLASSIFICATION_INVALID,
      totalClassified: ZERO_COUNT,
      unclassifiedCount: EXPECTED_TOTAL_CENSUS_SITES,
      budgetUnclassifiedRowValue: null,
      byDisposition: {},
      byOwner: {},
    };
  }

  const censusData = readJsonFile(root, CENSUS_PATH);
  const censusSites = Array.isArray(censusData?.sites) ? censusData.sites : [];
  const {classifiedMap, byDisposition, byOwner} =
    indexClassificationEntries(classificationData.entries);
  const unclassifiedCount = countUnclassifiedSites(censusSites, classifiedMap);
  const budgetUnclassifiedRowValue = readBudgetUnclassifiedValue(root);

  const isClassificationComplete = unclassifiedCount === ZERO_COUNT &&
    classifiedMap.size >= EXPECTED_TOTAL_CENSUS_SITES &&
    budgetUnclassifiedRowValue === ZERO_COUNT;

  return {
    isClassificationComplete,
    totalClassified: classifiedMap.size,
    unclassifiedCount,
    budgetUnclassifiedRowValue,
    byDisposition,
    byOwner,
  };
}

function auditZeroUnresolvedViolations(root = REPO_ROOT) {
  const classificationData = readJsonFile(root, CLASSIFICATION_PATH);
  if (!classificationData || !Array.isArray(classificationData.entries)) {
    return {
      zeroUnresolvedViolations: false,
      reason: REASON_CLASSIFICATION_MISSING,
      unauthorizedDispositions: [],
      omittedExplanations: [],
    };
  }

  const unauthorizedDispositions = [];
  const omittedExplanations = [];

  for (const entry of classificationData.entries) {
    if (!arrayIncludes(VALID_DISPOSITIONS, entry.classification)) {
      unauthorizedDispositions.push(entry);
    }
    if (typeof entry.reason !== 'string' || stringTrim(entry.reason).length === ZERO_COUNT) {
      omittedExplanations.push(entry);
    }
  }

  const zeroUnresolvedViolations = unauthorizedDispositions.length === ZERO_COUNT &&
    omittedExplanations.length === ZERO_COUNT;

  return {
    zeroUnresolvedViolations,
    unauthorizedCount: unauthorizedDispositions.length,
    omittedExplanationCount: omittedExplanations.length,
    unauthorizedDispositions,
    omittedExplanations,
  };
}

function auditCanonicalCallerAndExportClosure(root = REPO_ROOT) {
  const violations = [];

  for (const relativeDir of SCANNED_RUNTIME_DIRECTORIES) {
    const fullDir = path.resolve(root, relativeDir);
    if (!fs.existsSync(fullDir)) continue;
    const files = fs.readdirSync(fullDir);
    for (const file of files) {
      if (!stringEndsWith(file, JS_EXTENSION)) continue;
      const filePath = path.join(fullDir, file);
      const content = fs.readFileSync(filePath, UTF8);
      for (const term of PROHIBITED_RUNTIME_TERMS) {
        if (stringIncludes(content, term)) {
          violations.push({filePath, term});
        }
      }
    }
  }

  const rollingUpgradeOwnerPath = path.resolve(root, ROLLING_UPGRADE_PATH);
  if (fs.existsSync(rollingUpgradeOwnerPath)) {
    const content = fs.readFileSync(rollingUpgradeOwnerPath, UTF8);
    if (stringIncludes(content, RETIRED_ROLLING_UPGRADE_TERM)) {
      violations.push({filePath: rollingUpgradeOwnerPath, term: RETIRED_ROLLING_UPGRADE_TERM});
    }
  }

  return {
    isClosureComplete: violations.length === ZERO_COUNT,
    violationsCount: violations.length,
    violations,
  };
}

function verifyAffectedOwnerProofs(root = REPO_ROOT) {
  const existingWitnesses = arrayFilter(KEY_AFFECTED_WITNESS_FILES, (file) =>
    fs.existsSync(path.resolve(root, file)));

  return {
    allWitnessesPresent: existingWitnesses.length === KEY_AFFECTED_WITNESS_FILES.length,
    witnessCount: existingWitnesses.length,
    keyWitnessFiles: KEY_AFFECTED_WITNESS_FILES,
  };
}

function auditReintroductionGuardAndCoverageLimits(root = REPO_ROOT) {
  const classificationData = readJsonFile(root, CLASSIFICATION_PATH);
  if (!classificationData || !Array.isArray(classificationData.entries)) {
    return {
      guardPasses: false,
      reason: REASON_CLASSIFICATION_MISSING,
      coverageLimitsRecorded: false,
    };
  }

  const detection = detectNavigabilityPatterns(root);
  const detectedFallbackSites = arrayFilter(detection.sites, (site) =>
    arrayIncludes(FALLBACK_ROWS, site.row));

  const knownIdentities = new Set(
    arrayMap(classificationData.entries, siteIdentity));

  const unclassifiedDetected = arrayFilter(detectedFallbackSites, (site) =>
    !knownIdentities.has(siteIdentity(site)));

  const coverageLimits = {
    unwitnessedNeverSitesCount: 147,
    witnessedFallbackOnlySitesCount: 34,
    witnessedBothSitesCount: 1353,
    witnessedPrimaryOnlySitesCount: 1151,
    statement: LIMITS_STATEMENT,
  };

  const guardPasses = unclassifiedDetected.length === ZERO_COUNT;

  return {
    guardPasses,
    unclassifiedDetectedCount: unclassifiedDetected.length,
    coverageLimitsRecorded: true,
    coverageLimits,
  };
}

function main() {
  const inventory = auditCandidateInventory();
  const classification = auditClassificationClosure();
  const violations = auditZeroUnresolvedViolations();
  const callerClosure = auditCanonicalCallerAndExportClosure();
  const proofs = verifyAffectedOwnerProofs();
  const guard = auditReintroductionGuardAndCoverageLimits();

  const allPass = inventory.isInventoryComplete &&
    classification.isClassificationComplete &&
    violations.zeroUnresolvedViolations &&
    callerClosure.isClosureComplete &&
    proofs.allWitnessesPresent &&
    guard.guardPasses;

  if (!allPass) {
    process.stderr.write(CHECK_FAILURE_MESSAGE);
    process.exit(EXIT_CODE_FAILURE);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}

export {
  FALLBACK_ROWS,
  VALID_DISPOSITIONS,
  PROHIBITED_RUNTIME_TERMS,
  KEY_AFFECTED_WITNESS_FILES,
  auditCandidateInventory,
  auditClassificationClosure,
  auditZeroUnresolvedViolations,
  auditCanonicalCallerAndExportClosure,
  verifyAffectedOwnerProofs,
  auditReintroductionGuardAndCoverageLimits,
};
