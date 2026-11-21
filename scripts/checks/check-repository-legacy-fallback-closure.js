import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {detectNavigabilityPatterns} from './code-navigability-detectors.js';
import {siteIdentity} from './code-navigability-source.js';
import {measureNavigabilityBudgetWithFailures} from './code-navigability-budget.js';
import {
  describeCheckout, executionReportProblems, readExecutionReport,
} from '../test-execution-report.js';

const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayFind = Function.call.bind(Array.prototype.find);
const arrayFlatMap = Function.call.bind(Array.prototype.flatMap);
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
const HISTORICAL_RECEIPT =
  'solve/quests/repository-legacy-fallback-closure/evidence/receipt.json';
const EXPECTED_CENSUS_SCHEMA = 'fallback-census/1';
const EXPECTED_TOTAL_CENSUS_SITES = 2674;
const EXPECTED_ACTIVE_SRC_SITES = 2637;
const EXPECTED_RETIRED_SITES = 47;
const ROW_UNCLASSIFIED = 'fallback_sites_unclassified';
const ZERO_COUNT = 0;
const JS_EXTENSION = '.js';

const REASON_CENSUS_MISSING = 'Census file missing or schema mismatch';
const REASON_CLASSIFICATION_INVALID = 'Classification file missing or invalid';
const REASON_CLASSIFICATION_MISSING = 'Classification file missing';
const EXIT_CODE_CLOSURE_INCOMPLETE = 1;
const SEMANTIC_CLOSURE = objectFreeze({
  UNRESOLVED: 'unresolved', UNVERIFIED: 'unverified',
});
const OWNER_EXECUTION_PROBLEM = objectFreeze({
  SELECTION: 'affected-owner-selection-mismatch',
  CHECKOUT: 'affected-owner-checkout-not-clean',
});
const EXACT_SELECTION_REQUIRED =
  'The exact named owner files must each execute once without reused proofs';
const EXECUTION_REPORT_LIMIT =
  'Execution reports are unsigned. Applicability requires trusted original producer custody.';
const CLOSURE_LIMITS =
  'Census and source markers do not prove semantic classification or caller closure.';
const REPORT_OPTION = 'execution-report';
const OUTPUT_OPTION = 'output';
const STRING_OPTION = 'string';
const DIAGNOSTIC_SCOPE = 'current-closure-diagnostic';
const SCRATCH_PATH_REQUIRED = '--output requires a scratch path';
const SEALED_OUTPUT_REFUSED = 'Cannot write diagnostics to the sealed historical receipt';
const TEMPORARY_OUTPUT_PREFIX = '.q11-diagnostic-';
const TEMPORARY_OUTPUT_FILE = 'output';

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
const SEMANTIC_COUNTEREXAMPLES = objectFreeze([
  ['src/partition/partition-placement-admission.js',
    'return isPreFingerprintCommandReplay(service, recorded, command);'],
  ['src/rebalancer/replica-operation-repository-mutation-gateway-methods.js',
    'typeof gateway?.insertSystemTableRow === \'function\''],
  ['src/rebalancer/replica-placement-owner-transport.js',
    'await messageRouter.sendToAddress(address, message, options)'],
  ['src/rebalancer/rebalance-coordinator-operation-creation-support.js',
    'const selected = nodeLeader || rows[0];'],
]);

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
      matchesCensusCounts: false,
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

  const matchesCensusCounts = censusSites.length === EXPECTED_TOTAL_CENSUS_SITES &&
    detectedFallbackSites.length === EXPECTED_ACTIVE_SRC_SITES &&
    retired.length === EXPECTED_RETIRED_SITES;

  return {
    matchesCensusCounts,
    totalCensusSites: censusSites.length,
    activeDetectedSites: detectedFallbackSites.length,
    retiredSites: retired.length,
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
      censusIdentitiesClassified: false,
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

  const censusIdentitiesClassified = unclassifiedCount === ZERO_COUNT &&
    classifiedMap.size >= EXPECTED_TOTAL_CENSUS_SITES &&
    budgetUnclassifiedRowValue === ZERO_COUNT;

  return {
    censusIdentitiesClassified,
    totalClassified: classifiedMap.size,
    unclassifiedCount,
    budgetUnclassifiedRowValue,
    byDisposition,
    byOwner,
  };
}

function auditClassificationDispositions(root = REPO_ROOT) {
  const classificationData = readJsonFile(root, CLASSIFICATION_PATH);
  if (!classificationData || !Array.isArray(classificationData.entries)) {
    return {
      dispositionsWellFormed: false,
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

  const dispositionsWellFormed = unauthorizedDispositions.length === ZERO_COUNT &&
    omittedExplanations.length === ZERO_COUNT;

  return {
    dispositionsWellFormed,
    unauthorizedCount: unauthorizedDispositions.length,
    omittedExplanationCount: omittedExplanations.length,
    unauthorizedDispositions,
    omittedExplanations,
  };
}

function auditRetiredRuntimeMarkers(root = REPO_ROOT) {
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

  for (const [file, term] of [
    [ROLLING_UPGRADE_PATH, RETIRED_ROLLING_UPGRADE_TERM], ...SEMANTIC_COUNTEREXAMPLES,
  ]) {
    const filePath = path.resolve(root, file);
    if (fs.existsSync(filePath) && stringIncludes(fs.readFileSync(filePath, UTF8), term)) {
      violations.push({filePath, term});
    }
  }

  return {
    searchedDirectories: SCANNED_RUNTIME_DIRECTORIES,
    matches: violations,
  };
}

function isExactSelection(paths) {
  return Array.isArray(paths) && paths.length === KEY_AFFECTED_WITNESS_FILES.length &&
    arrayEvery(KEY_AFFECTED_WITNESS_FILES, (file) => arrayIncludes(paths, file));
}

function verifyAffectedOwnerProofs(root = REPO_ROOT, report = null) {
  const checkout = describeCheckout(root);
  const {problems, summary} = executionReportProblems(report, {
    sha: checkout.head, tree: checkout.tree, requiredFiles: KEY_AFFECTED_WITNESS_FILES,
  });
  if (summary) {
    const planned = arrayFlatMap(report.runs, (run) => run?.planned ?? []);
    const executed = arrayFlatMap(report.runs, (run) =>
      Array.isArray(run?.results) ? arrayMap(run.results, (result) => result?.file) : []);
    if (!isExactSelection(report.planned) || !isExactSelection(planned) ||
        !isExactSelection(executed) || report.reusedProofs.length > ZERO_COUNT) {
      problems.push({code: OWNER_EXECUTION_PROBLEM.SELECTION, detail: EXACT_SELECTION_REQUIRED});
    }
    if (!checkout.clean) {
      problems.push({code: OWNER_EXECUTION_PROBLEM.CHECKOUT, detail: root});
    }
  }
  return {
    reportApplicable: problems.length === ZERO_COUNT,
    sourceCommit: checkout.head,
    selectedFiles: KEY_AFFECTED_WITNESS_FILES,
    problems,
    summary,
    limits: EXECUTION_REPORT_LIMIT,
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
    witnessedBothSitesCount: 1349,
    witnessedPrimaryOnlySitesCount: 1144,
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

function auditCurrentClosure(root = REPO_ROOT, report = null) {
  const runtimeMarkers = auditRetiredRuntimeMarkers(root);
  const ownerExecution = verifyAffectedOwnerProofs(root, report);
  return {
    scope: DIAGNOSTIC_SCOPE,
    sourceCommit: ownerExecution.sourceCommit,
    inventory: auditCandidateInventory(root),
    classification: auditClassificationClosure(root),
    dispositionFormat: auditClassificationDispositions(root),
    runtimeMarkers,
    ownerExecution,
    reintroductionGuard: auditReintroductionGuardAndCoverageLimits(root),
    semanticClosure: runtimeMarkers.matches.length > ZERO_COUNT ?
      SEMANTIC_CLOSURE.UNRESOLVED : SEMANTIC_CLOSURE.UNVERIFIED,
    limits: CLOSURE_LIMITS,
  };
}

function scratchOutputPath(value) {
  if (value.length === ZERO_COUNT) throw new Error(SCRATCH_PATH_REQUIRED);
  const requested = path.resolve(value);
  const historical = path.join(REPO_ROOT, HISTORICAL_RECEIPT);
  const historicalStat = fs.statSync(historical, {throwIfNoEntry: false});
  const requestedStat = fs.statSync(requested, {throwIfNoEntry: false});
  const sameInode = historicalStat && requestedStat &&
    historicalStat.dev === requestedStat.dev && historicalStat.ino === requestedStat.ino;
  if (requested === historical || sameInode) throw new Error(SEALED_OUTPUT_REFUSED);
  if (requestedStat) return fs.realpathSync(requested);
  const directory = path.dirname(requested);
  fs.mkdirSync(directory, {recursive: true});
  const resolved = path.join(fs.realpathSync(directory), path.basename(requested));
  if (resolved === historical) throw new Error(SEALED_OUTPUT_REFUSED);
  return resolved;
}

function writeScratchOutput(output, contents) {
  const temporary = fs.mkdtempSync(path.join(path.dirname(output), TEMPORARY_OUTPUT_PREFIX));
  try {
    const file = path.join(temporary, TEMPORARY_OUTPUT_FILE);
    fs.writeFileSync(file, contents, UTF8);
    fs.renameSync(file, scratchOutputPath(output));
  } finally {
    fs.rmSync(temporary, {recursive: true, force: true});
  }
}

function runCurrentClosureCli() {
  const {values} = parseArgs({options: {
    [REPORT_OPTION]: {type: STRING_OPTION},
    [OUTPUT_OPTION]: {type: STRING_OPTION},
  }});
  const reportPath = values[REPORT_OPTION];
  const output = values[OUTPUT_OPTION] === undefined ? null :
    scratchOutputPath(values[OUTPUT_OPTION]);
  let audit;
  try {
    audit = auditCurrentClosure(REPO_ROOT, reportPath ? readExecutionReport(reportPath) : null);
  } catch (error) {
    audit = {scope: DIAGNOSTIC_SCOPE, semanticClosure: SEMANTIC_CLOSURE.UNVERIFIED,
      error: error.message};
  }
  const contents = `${JSON.stringify(audit, null, 2)}\n`;
  if (output !== null) writeScratchOutput(output, contents);
  process.stdout.write(contents);
  // Every result here is deliberately partial. The current owning Quest
  // must admit semantic caller evidence before issuing an acceptance receipt.
  process.exitCode = EXIT_CODE_CLOSURE_INCOMPLETE;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runCurrentClosureCli();
}

export {
  FALLBACK_ROWS,
  VALID_DISPOSITIONS,
  PROHIBITED_RUNTIME_TERMS,
  KEY_AFFECTED_WITNESS_FILES,
  auditCandidateInventory,
  auditClassificationClosure,
  auditClassificationDispositions,
  auditRetiredRuntimeMarkers,
  verifyAffectedOwnerProofs,
  auditReintroductionGuardAndCoverageLimits,
  auditCurrentClosure,
  runCurrentClosureCli,
};
