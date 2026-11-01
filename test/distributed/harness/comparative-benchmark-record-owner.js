/**
 * The ONE integration point with stream A's record and admission owners in
 * the campaign layer: the v2 record validator and digest
 * (raw-observation-record.js), and the campaign outcome from admitted cells
 * (benchmark-claim-admission.js over comparative-coverage-manifest.js claims
 * and the invalidation ledger). Loaded on demand so a missing owner is an
 * explicit typed unavailability (R11), never a second record shape.
 */
import {
  arrayFilter,
  arrayIncludes,
  arrayMap,
  arraySome,
} from './real-product-captured-intrinsics.js';
import {deploymentFailure} from './real-product-deployment-contract.js';
import {errorText} from './real-product-remote-shell.js';

const RECORD_OWNER_UNAVAILABLE = 'record_owner_unavailable';
const OWNER_MODULES = Object.freeze({
  record: './raw-observation-record.js',
  admission: './benchmark-claim-admission.js',
  coverage: './comparative-coverage-manifest.js',
  invalidations: './benchmark-invalidation-ledger.js',
});

async function importOwner(importModule, specifier) {
  try {
    return await importModule(specifier);
  } catch (error) {
    throw deploymentFailure(RECORD_OWNER_UNAVAILABLE,
      `record/admission owner ${specifier} unavailable: ${errorText(error)}`, {specifier});
  }
}

/**
 * @param {Function} [importModule]
 * @return {Promise<Object>} validateCampaignHeader, validateRunRecord,
 *   computeRunObservationsDigest, campaignOutcome
 */
async function loadRawObservationRecordOwner(importModule = (specifier) => import(specifier)) {
  const record = await importOwner(importModule, OWNER_MODULES.record);
  const admission = await importOwner(importModule, OWNER_MODULES.admission);
  const coverage = await importOwner(importModule, OWNER_MODULES.coverage);
  const ledger = await importOwner(importModule, OWNER_MODULES.invalidations);
  return Object.freeze({
    validateCampaignHeader: record.validateCampaignHeader,
    validateRunRecord: record.validateRunRecord,
    computeRunObservationsDigest: record.computeRunObservationsDigest,
    /**
     * Admit this campaign's runs against the coverage claims of its targets'
     * scenarios and subkinds; an all-non-valid campaign never reads as passed.
     */
    campaignOutcome({header, runs, file, rootDir, manifest}) {
      const claims = arrayFilter(coverage.listManifestClaims(coverage.buildCoverageManifest()),
        (claim) => arrayIncludes(manifest.targets, claim.targetId) &&
          hasRunForClaim(manifest.runs, claim));
      const cells = arrayMap(claims, (claim) => admission.admitClaim({claim,
        runs: arrayMap(runs, (run) => ({file, run})),
        campaignHeaders: new Map([[header.campaignId, header]]), forensicRecords: [],
        invalidations: ledger.readInvalidationLedger(rootDir)}));
      return {outcome: admission.campaignOutcomeOfCells(cells),
        cells: arrayMap(cells, (cell) => ({claimKey: cell.claimKey, status: cell.status,
          reasons: cell.reasons ?? []}))};
    },
  });
}

function hasRunForClaim(runs, claim) {
  return arraySome(runs, (run) => run.targetId === claim.targetId &&
    run.scenario === claim.scenario && run.subkind === claim.subkind);
}

export {RECORD_OWNER_UNAVAILABLE, loadRawObservationRecordOwner};
