/**
 * CL-031(d): readiness HISTORY entries must carry bounded contract
 * summaries, never the full projection readiness contract.
 *
 * The full contract embeds its whole evidence chain (~0.5MB, grows with run
 * depth). Histories keep up to 32 entries per node embedding TWO contracts
 * each and ride on every served admin control snapshot — gate 220403Z
 * measured 34MB per readinessByNodeId entry, ~1MB per transition entry,
 * 10MB epoch events arrays, and >100MB snapshot frames that blinded the
 * harness oracles and OOM-killed nodes cluster-wide. The omission must be
 * VISIBLE (contractDetailOmitted), never silent; the LIVE readiness entry
 * keeps the full contract (gates read current state, not history).
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  buildProjectionReadinessContract,
  summarizeProjectionReadinessContractForHistory,
} from '../../src/control-plane/projection-readiness-state.js';
import {
  ControlPlaneReadinessServiceSegment3,
} from '../../src/control-plane/control-plane-readiness-service-segment-3.js';

const ONE_MB = 1024 * 1024;
const SUMMARY_SIZE_BOUND_BYTES = 8 * 1024;

function buildFatContract() {
  // Real contract shape via the real builder, then verify the fat members
  // exist so the size assertions below are meaningful.
  const contract = buildProjectionReadinessContract({});
  const fatContract = {
    ...contract,
    publication: {
      ...contract.publication,
      boundaryOutcome: {evidenceBlob: 'x'.repeat(ONE_MB)},
    },
    evidence: {rawEvidenceBlob: 'y'.repeat(ONE_MB)},
    reasonCodes: ['publication_pending', 'priority_recovery_active'],
    priorityRecovery: {
      active: true,
      reasonCodes: ['recovering_in_flight'],
      outcome: {outcomeBlob: 'z'.repeat(ONE_MB)},
    },
  };
  return fatContract;
}

test('history summary drops the evidence chain, keeps decision state, and ' +
  'marks the omission visibly', async (t) => {
  const fatContract = buildFatContract();
  const summary = summarizeProjectionReadinessContractForHistory(fatContract);

  const summaryBytes = Buffer.byteLength(JSON.stringify(summary));
  t.ok(
    summaryBytes < SUMMARY_SIZE_BOUND_BYTES,
    'summary stays KB-scale regardless of contract evidence size ' +
      `(got ${summaryBytes} bytes; red on revert)`,
  );
  t.equal(summary.contractDetailOmitted, true,
    'omission is visible, never silent (CL-031 never-break rule)');
  t.equal(summary.state, fatContract.state, 'decision state preserved');
  t.same(summary.reasonCodes,
    ['publication_pending', 'priority_recovery_active'],
    'reason codes preserved');
  t.equal(summary.priorityRecovery.active, true);
  t.same(summary.priorityRecovery.reasonCodes, ['recovering_in_flight']);
  t.equal(summary.evidence, undefined, 'raw evidence dropped');
  t.equal(summary.publication.boundaryOutcome, undefined,
    'publication boundary outcome dropped');
  t.equal(summarizeProjectionReadinessContractForHistory(null), null);
});

test('recorded readiness transition entries embed summaries, not full ' +
  'contracts', async (t) => {
  const proto = ControlPlaneReadinessServiceSegment3.prototype;
  const fatContract = buildFatContract();
  const buildState = (serveEligible, observedAtMs) => ({
    serveEligible,
    repairEligible: true,
    observedAt: new Date(observedAtMs).toISOString(),
    observedAtMs,
    reasonCodes: ['some_reason'],
    projectionReadinessContract: fatContract,
    rawInputs: {small: true},
  });
  const states = [buildState(false, 1000), buildState(true, 2000)];
  let stateIndex = 0;
  const stub = {
    readinessTransitionHistoryLimit: 32,
    lastReadinessEvaluationByNodeId: new Map(),
    readinessTransitionHistoryByNodeId: new Map(),
    readinessTransitionHistoryViewByNodeId: new Map(),
    buildReadinessTransitionState: () => states[stateIndex++],
    recordReadinessTransition: proto.recordReadinessTransition,
    getReadinessTransitionHistory: proto.getReadinessTransitionHistory,
  };

  stub.recordReadinessTransition({nodeId: 'n1'});
  const history = stub.recordReadinessTransition({nodeId: 'n1'});

  t.equal(history.length, 1, 'the eligibility flip records one entry');
  const entry = history[0];
  t.equal(entry.projectionReadinessContract.contractDetailOmitted, true,
    'current contract summarized (red on revert)');
  t.equal(
    entry.previousProjectionReadinessContract.contractDetailOmitted,
    true,
    'previous contract summarized (red on revert)',
  );
  const entryBytes = Buffer.byteLength(JSON.stringify(entry));
  t.ok(
    entryBytes < SUMMARY_SIZE_BOUND_BYTES * 4,
    `transition entry stays KB-scale (got ${entryBytes} bytes; was ~1MB ` +
      'with full contracts)',
  );
});

test('recovery epoch event summaries embed contract summaries, not full ' +
  'contracts', async (t) => {
  class EpochHost {}
  const {installControlPlaneReadinessSnapshotStoreMethods} = await import(
    '../../src/control-plane/control-plane-readiness-snapshot-store.js'
  );
  installControlPlaneReadinessSnapshotStoreMethods(EpochHost.prototype);
  const host = new EpochHost();
  const fatContract = buildFatContract();
  const summary = host.buildRecoveryEpochSummary(
    'n1',
    {
      observedAt: '2026-06-12T22:00:00.000Z',
      lifecycleState: 'recovering',
      dimensions: {},
      reasons: [{code: 'recovery_open'}],
      projectionReadinessContract: fatContract,
    },
    1000,
  );

  t.equal(
    summary.projectionReadinessContract.contractDetailOmitted,
    true,
    'epoch event contract summarized (red on revert)',
  );
  const summaryBytes = Buffer.byteLength(JSON.stringify(summary));
  t.ok(
    summaryBytes < SUMMARY_SIZE_BOUND_BYTES * 4,
    `epoch event stays KB-scale (got ${summaryBytes} bytes; was ~300KB ` +
      'with the full contract)',
  );
  t.equal(
    summary.priorityControlPlaneRecoveryActive,
    true,
    'scalar extractions still read the FULL contract before summarizing',
  );
  t.same(summary.reasonCodes, ['recovery_open']);
});
