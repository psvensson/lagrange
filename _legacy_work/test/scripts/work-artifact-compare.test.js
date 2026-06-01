import tap from 'tap';
import { extractFields, compareArtifacts, renderTextComparison } from '../../scripts/work-artifact-compare.js';

tap.test('work-artifact-compare unit tests', async (t) => {
  t.test('extractFields extracts target properties from JSON text', (t) => {
    const rawContent = JSON.stringify({
      summary: { duration: 12345, passed: false },
      standardSummary: {
        scenarios: [
          {
            current: { verdict: 'BLOCK_EVIDENCE_INCOMPLETE' }
          }
        ]
      },
      snapshotCoverageNodeCount: 2,
      expectedNodeCount: 5,
      membershipPublicationHandoffOutcomeEnqueued: "false",
      publicationActiveGateHandoffReasonCode: "owner_reconcile_pending",
      membershipPublicationHandoffOutcomeState: "write_deferred",
      attempts: 3,
      maxAttempts: 8
    }, null, 2);

    const fields = extractFields('some-random-file.json', rawContent);

    t.equal(fields.snapshotCoverageNodeCount, 2);
    t.equal(fields.expectedNodeCount, 5);
    t.equal(fields.enqueued, 'false');
    t.equal(fields.handoffReason, 'owner_reconcile_pending');
    t.equal(fields.handoffState, 'write_deferred');
    t.equal(fields.attempts, 3);
    t.equal(fields.maxAttempts, 8);
    t.end();
  });

  t.test('compareArtifacts identifies stable and changed facts', (t) => {
    const oldFields = {
      owner: 'startup_active_gate_owner',
      boundary: 'snapshot_coverage',
      dominantReason: 'active_gate_timed_out',
      frontierState: 'deferred',
      snapshotCoverageNodeCount: 1,
      expectedNodeCount: 5,
      enqueued: 'false',
      handoffReason: 'owner_reconcile_pending',
      handoffState: 'write_deferred',
      attempts: 1,
      maxAttempts: 8,
      durationMs: 290000,
      passed: false,
    };

    const newFields = {
      owner: 'startup_active_gate_owner',
      boundary: 'snapshot_coverage',
      dominantReason: 'active_gate_timed_out',
      frontierState: 'deferred',
      snapshotCoverageNodeCount: 1,
      expectedNodeCount: 5,
      enqueued: 'false',
      handoffReason: 'owner_reconcile_pending',
      handoffState: 'write_deferred',
      attempts: 2,
      maxAttempts: 8,
      durationMs: 260000,
      passed: false,
    };

    const comp = compareArtifacts(oldFields, newFields);
    const comparison = comp.comparison;

    t.equal(comparison.stableFacts['Owner who decides'], 'startup_active_gate_owner');
    t.equal(comparison.stableFacts['Snapshot Coverage'], '1/5');
    t.equal(comparison.changedFacts['Active-gate Attempts'].old, 1);
    t.equal(comparison.changedFacts['Active-gate Attempts'].new, 2);

    // Invariant blockers
    t.ok(comparison.invariantBlockers.includes('snapshotCoverageNodeCount=1/5'));
    t.ok(comparison.invariantBlockers.includes('owner_reconcile_pending'));
    t.ok(comparison.invariantBlockers.includes('write_deferred'));
    t.ok(comparison.invariantBlockers.includes('enqueued=false'));

    // Ruled in/out mechanisms
    t.ok(comparison.ruledInMechanisms.some(m => m.startsWith('transition_gap')));
    t.ok(comparison.ruledInMechanisms.some(m => m.startsWith('scheduling_gap')));
    t.ok(comparison.ruledOutMechanisms.some(m => m.startsWith('observation_gap')));

    // Next loop action recommendation
    t.match(comparison.recommendedAction, 'migrate owner or open architecture gate');
    t.end();
  });

  t.test('renderTextComparison renders beautiful text report', (t) => {
    const oldFields = {
      owner: 'startup_active_gate_owner',
      boundary: 'snapshot_coverage',
      dominantReason: 'active_gate_timed_out',
      frontierState: 'deferred',
      snapshotCoverageNodeCount: 1,
      expectedNodeCount: 5,
      enqueued: 'false',
      handoffReason: 'owner_reconcile_pending',
      handoffState: 'write_deferred',
      attempts: 1,
      maxAttempts: 8,
      durationMs: 290000,
      passed: false,
    };

    const newFields = {
      owner: 'startup_active_gate_owner',
      boundary: 'snapshot_coverage',
      dominantReason: 'active_gate_timed_out',
      frontierState: 'deferred',
      snapshotCoverageNodeCount: 1,
      expectedNodeCount: 5,
      enqueued: 'false',
      handoffReason: 'owner_reconcile_pending',
      handoffState: 'write_deferred',
      attempts: 2,
      maxAttempts: 8,
      durationMs: 260000,
      passed: false,
    };

    const comp = compareArtifacts(oldFields, newFields);
    const rendered = renderTextComparison(comp);

    t.match(rendered, 'STABLE FACTS:');
    t.match(rendered, 'Owner who decides: startup_active_gate_owner');
    t.match(rendered, 'CHANGED FACTS / METRICS:');
    t.match(rendered, 'Active-gate Attempts: moved from 1/8 to 2/8');
    t.match(rendered, 'INVARIANT BLOCKERS:');
    t.match(rendered, 'snapshotCoverageNodeCount=1/5');
    t.match(rendered, 'owner_reconcile_pending');
    t.match(rendered, 'write_deferred');
    t.match(rendered, 'enqueued=false');
    t.match(rendered, 'FAILURE MECHANISM DIAGNOSTIC:');
    t.match(rendered, 'RECOMMENDED NEXT LOOP ACTION:');
    t.match(rendered, 'migrate owner or open architecture gate');
    t.end();
  });
});
