import path from 'node:path';
import process from 'node:process';
import {
  buildGuidelineViolationReport,
  formatGuidelineHumanSummary,
  runGuidelineCheck,
  runGuidelineCheckWhenDirect,
} from './guideline-check-shared.js';

const LOCAL_STR_SLASH = '/';
const LOCAL_STR_HOTSPOT_OWNER_PATH_NO_LONGER_EXPOSES_THE = 'hotspot owner path no longer exposes the required structured ';
const LOCAL_STR_STRUCTURED_DEFERRED_OUTCOME_HOTSPOT = 'structured deferred-outcome hotspot';

const RULE_REFERENCE =
  'doctrine.md §5 Slower Under Pressure, Never Less Correct';

const VIOLATION_KIND = 'missing_structured_deferred_outcome_fragment';

const DEFERRED_OUTCOME_HOTSPOT_CONTRACTS = Object.freeze({
  'src/control-plane/control-plane-mutation-readiness.js': Object.freeze([
    'outcome:',
    'reasonCodes:',
    'retryAfterMs',
    'runtimeAuthority',
  ]),
  'src/control-plane/priority-recovery-completion.js': Object.freeze([
    'state:',
    'reasonCode:',
    'retryAfterMs,',
    'allowTemporaryOverflowPromotion:',
  ]),
  'test/distributed/harness/cluster.js': Object.freeze([
    'reasonCodes:',
    'retryAfterMs:',
    'runtimeAuthority:',
  ]),
  'test/distributed/scenarios/table-distribution-helpers.js': Object.freeze([
    'outcome:',
    'retryAfterMs:',
    'visibilityState:',
  ]),
});

function normalizePath(filePath) {
  return filePath.split(path.sep).join(LOCAL_STR_SLASH);
}

function resolveDeferredOutcomeContract(filePath) {
  return DEFERRED_OUTCOME_HOTSPOT_CONTRACTS[normalizePath(filePath)] || null;
}

function collectDeferredOutcomeViolationsFromSource(source, filePath) {
  const requiredFragments = resolveDeferredOutcomeContract(filePath);
  if (!requiredFragments) {
    return [];
  }
  return requiredFragments
    .filter((fragment) => !String(source || '').includes(fragment))
    .map((fragment) => ({
      filePath,
      line: 1,
      column: 1,
      kind: VIOLATION_KIND,
      target: fragment,
      reason:
        LOCAL_STR_HOTSPOT_OWNER_PATH_NO_LONGER_EXPOSES_THE +
        `deferred-outcome fragment "${fragment}"`,
      ruleReference: RULE_REFERENCE,
    }));
}

async function buildDeferredOutcomeViolationReport(pathsToScan) {
  const defaultPaths = Object.keys(DEFERRED_OUTCOME_HOTSPOT_CONTRACTS);
  const selectedPaths = Array.isArray(pathsToScan) && pathsToScan.length > 0 ?
    pathsToScan :
    defaultPaths;
  return buildGuidelineViolationReport(
    selectedPaths,
    {includeTests: true},
    collectDeferredOutcomeViolationsFromSource,
  );
}

function formatDeferredOutcomeHumanSummary(report) {
  return formatGuidelineHumanSummary(
    report,
    LOCAL_STR_STRUCTURED_DEFERRED_OUTCOME_HOTSPOT,
  );
}

async function main(argv = process.argv.slice(2)) {
  return runGuidelineCheck(
    argv,
    buildDeferredOutcomeViolationReport,
    formatDeferredOutcomeHumanSummary,
  );
}

runGuidelineCheckWhenDirect(import.meta.url, main);

export {
  DEFERRED_OUTCOME_HOTSPOT_CONTRACTS,
  buildDeferredOutcomeViolationReport,
  collectDeferredOutcomeViolationsFromSource,
};
