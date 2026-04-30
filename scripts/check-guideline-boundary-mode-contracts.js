import path from 'node:path';
import process from 'node:process';
import {
  buildGuidelineViolationReport,
  formatGuidelineHumanSummary,
  runGuidelineCheck,
  runGuidelineCheckWhenDirect,
} from './guideline-check-shared.js';

const LOCAL_STR_SLASH = '/';
const LOCAL_STR_EMPTY = '';
const LOCAL_NUM_ONE = 1;
const LOCAL_STR_1M6MB = 'hotspot boundary still contains legacy semantic mode fragment ';
const LOCAL_STR_15J5F = 'boundary-mode-contract hotspot';
const LOCAL_NUM_TWO = 2;

const RULE_REFERENCE =
  'system guidelines.md §0.2.1 Shared Contract Shape And Boundary-Impedance Discipline';

const VIOLATION_KIND = 'legacy_boundary_mode_fragment';

const BOUNDARY_MODE_HOTSPOT_CONTRACTS = Object.freeze({
  'src/rebalancer/rebalance-coordinator.js': Object.freeze([
    'preferAuthoritativeRead',
    'skipSqlFallbackWhenCacheEmpty',
    'preferAuthoritativeCount',
  ]),
  'src/rebalancer/unified-rebalancer.js': Object.freeze([
    'preferAuthoritativeRead',
    'preferAuthoritativeCount',
  ]),
  'src/control-plane/control-plane-readiness-service.js': Object.freeze([
    'preferAuthoritativeRead',
  ]),
  'test/rebalancer/rebalance-coordinator-facade-compatibility.test.js':
    Object.freeze([
      'preferAuthoritativeRead',
    ]),
  'test/rebalancer/unified-rebalancer.test.js': Object.freeze([
    'preferAuthoritativeRead',
    'preferAuthoritativeCount',
  ]),
  'test/control-plane/control-plane-readiness-service.test.js': Object.freeze([
    'preferAuthoritativeRead',
  ]),
});

function normalizePath(filePath) {
  return filePath.split(path.sep).join(LOCAL_STR_SLASH);
}

function resolveBoundaryModeContract(filePath) {
  return BOUNDARY_MODE_HOTSPOT_CONTRACTS[normalizePath(filePath)] || null;
}

function collectBoundaryModeContractViolationsFromSource(source, filePath) {
  const bannedFragments = resolveBoundaryModeContract(filePath);
  if (!bannedFragments) {
    return [];
  }
  return bannedFragments
    .filter((fragment) => String(source || LOCAL_STR_EMPTY).includes(fragment))
    .map((fragment) => ({
      filePath,
      line: LOCAL_NUM_ONE,
      column: LOCAL_NUM_ONE,
      kind: VIOLATION_KIND,
      target: fragment,
      reason:
        LOCAL_STR_1M6MB +
        `"${fragment}" instead of the named mode contract`,
      ruleReference: RULE_REFERENCE,
    }));
}

async function buildBoundaryModeContractViolationReport(pathsToScan) {
  const defaultPaths = Object.keys(BOUNDARY_MODE_HOTSPOT_CONTRACTS);
  const selectedPaths = Array.isArray(pathsToScan) && pathsToScan.length > 0 ?
    pathsToScan :
    defaultPaths;
  return buildGuidelineViolationReport(
    selectedPaths,
    {includeTests: true},
    collectBoundaryModeContractViolationsFromSource,
  );
}

function formatBoundaryModeContractHumanSummary(report) {
  return formatGuidelineHumanSummary(
    report,
    LOCAL_STR_15J5F,
  );
}

async function main(argv = process.argv.slice(LOCAL_NUM_TWO)) {
  return runGuidelineCheck(
    argv,
    buildBoundaryModeContractViolationReport,
    formatBoundaryModeContractHumanSummary,
  );
}

runGuidelineCheckWhenDirect(import.meta.url, main);

export {
  BOUNDARY_MODE_HOTSPOT_CONTRACTS,
  buildBoundaryModeContractViolationReport,
  collectBoundaryModeContractViolationsFromSource,
};
