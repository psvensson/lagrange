import fs from 'node:fs';
import path from 'node:path';
import tap from 'tap';
import { buildRepresentativeEvidenceSummary } from '../../scripts/summarize-representative-evidence.js';
import { classifyArtifact } from '../../scripts/work-mechanism-card.js';
import { extractFields, compareArtifacts } from '../../scripts/work-artifact-compare.js';

tap.test('Theory Loop Active Gate Calibration Proof', async (t) => {
  const oldArtifactPath = path.resolve('test-output/reports/rolling-restart-active-gate-snapshot-coverage-retry-cadence-20260528T033446Z.report.json');
  const newArtifactPath = path.resolve('test-output/reports/rolling-restart-active-gate-owner-reconcile-retry-20260528T040351Z.report.json');

  t.ok(fs.existsSync(oldArtifactPath), 'Baseline artifact exists');
  t.ok(fs.existsSync(newArtifactPath), 'Fresh artifact exists');

  const oldContent = fs.readFileSync(oldArtifactPath, 'utf8');
  const newContent = fs.readFileSync(newArtifactPath, 'utf8');

  const oldArtifact = JSON.parse(oldContent);
  const newArtifact = JSON.parse(newContent);

  t.test('Calibration target: Single-artifact Mechanism Classification', (t) => {
    const summary = buildRepresentativeEvidenceSummary(newArtifactPath, newArtifact);
    t.ok(summary, 'Evidence summary successfully built');

    const card = classifyArtifact(summary, newArtifact);
    t.ok(card, 'Mechanism card successfully generated');

    // Expected classifications & mechanisms
    t.match(card['Failure mechanism'], /^(?:transition_gap|scheduling_gap)$/, 'Classified failure mechanism matches transition or scheduling gap');
    t.ok(card.candidateMechanisms.includes('transition_gap'), 'transition_gap is ruled in as a candidate');
    t.ok(card.candidateMechanisms.includes('scheduling_gap'), 'scheduling_gap is ruled in as a candidate');

    // Rejected alternatives
    t.ok(card.rejectedMechanisms.includes('observation_gap'), 'observation_gap is rejected');
    t.ok(card.rejectedMechanisms.includes('selection_gap'), 'selection_gap is rejected');

    // Deciding owner & stable facts
    t.equal(card['Owner who decides'], 'startup_active_gate_owner', 'Dominant owner is correctly identified as startup_active_gate_owner');
    t.match(card['Stable facts'], 'owner_reconcile_pending', 'Stable facts contain owner_reconcile_pending');
    t.match(card['Stable facts'], 'deferred', 'Stable facts contain deferred');

    t.end();
  });

  t.test('Calibration target: Multi-artifact Comparison & Invariant Blockers', (t) => {
    const oldFields = extractFields(oldArtifactPath, oldContent);
    const newFields = extractFields(newArtifactPath, newContent);

    t.equal(oldFields.owner, 'startup_active_gate_owner', 'Old fields owner is startup_active_gate_owner');
    t.equal(newFields.owner, 'startup_active_gate_owner', 'New fields owner is startup_active_gate_owner');

    const comp = compareArtifacts(oldFields, newFields);
    t.ok(comp, 'Comparison successfully generated');

    const c = comp.comparison;

    // Stable facts vs changed facts
    t.equal(c.stableFacts['Owner who decides'], 'startup_active_gate_owner', 'Owner is stable across artifacts');
    t.equal(c.stableFacts['Owner Boundary'], 'snapshot_coverage', 'Boundary is stable across artifacts');
    t.equal(c.stableFacts['Snapshot Coverage'], '1/5', 'Snapshot coverage remains stuck at 1/5');

    // Changed cadence metric
    t.equal(c.changedFacts['Active-gate Attempts'].old, 1, 'Baseline attempts was 1');
    t.equal(c.changedFacts['Active-gate Attempts'].new, 2, 'Fresh attempts moved to 2');

    // Invariant blockers
    t.ok(c.invariantBlockers.includes('snapshotCoverageNodeCount=1/5'), 'Tracks stuck snapshot coverage invariant');
    t.ok(c.invariantBlockers.includes('owner_reconcile_pending'), 'Tracks owner_reconcile_pending invariant blocker');
    t.ok(c.invariantBlockers.includes('write_deferred'), 'Tracks write_deferred invariant blocker');
    t.ok(c.invariantBlockers.includes('enqueued=false'), 'Tracks enqueued=false invariant blocker');

    // Causal recommendations
    t.ok(c.ruledInMechanisms.some(m => m.includes('transition_gap')), 'Rules in transition_gap');
    t.ok(c.ruledInMechanisms.some(m => m.includes('scheduling_gap')), 'Rules in scheduling_gap');
    t.ok(c.ruledOutMechanisms.some(m => m.includes('observation_gap')), 'Rules out observation_gap');
    t.ok(c.ruledOutMechanisms.some(m => m.includes('selection_gap')), 'Rules out selection_gap');

    t.equal(
      c.recommendedAction,
      'migrate owner or open architecture gate (to prevent loop oscillation on invariant blockers)',
      'Recommended action biases towards owner migration or architecture gate to avoid repeated witness timeout patches'
    );

    t.end();
  });
});
