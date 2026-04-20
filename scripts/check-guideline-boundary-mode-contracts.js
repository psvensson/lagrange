import path from 'node:path';
import process from 'node:process';
import {
  buildGuidelineViolationReport,
  formatGuidelineHumanSummary,
  runGuidelineCheck,
  runGuidelineCheckWhenDirect,
} from './guideline-check-shared.js';

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
  return filePath.split(path.sep).join('/');
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
    .filter((fragment) => String(source || '').includes(fragment))
    .map((fragment) => ({
      filePath,
      line: 1,
      column: 1,
      kind: VIOLATION_KIND,
      target: fragment,
      reason:
        'hotspot boundary still contains legacy semantic mode fragment ' +
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
    'boundary-mode-contract hotspot',
  );
}

async function main(argv = process.argv.slice(2)) {
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
