# Spec-Led Runtime Modularization Tasks

## 1. Spec And Reference-Pattern Rebaseline

- [x] Create the successor Quest queue.
- [x] Replace the coarse core topology rewrite guidance with executable owner
      contract templates.
- [x] Record best-of-breed tactical patterns as implementation guidance.
- [x] Update roadmap truth without changing the active release-gate blocker.
- [x] Validate Quest/Solver and spec diff hygiene.

## 2. Operation Owner Decision Kernel

- [ ] Define normalized operation evidence.
- [ ] Define operation progress state vocabulary.
- [ ] Implement pure decision table for workflow progress, serial wait, timeout
      reconcile, remote wake, local dispatch, terminal outcomes, and deferred
      visibility.
- [ ] Add focused fixtures for current rolling-restart workflow-progress and
      timeout witnesses.
- [ ] Keep runtime effects behind adapters.

## 3. Priority Recovery Observation Contract

- [ ] Split priority recovery observation from operation-owner re-entry.
- [ ] Consume operation-owner outcomes for workflow progress and timeout state.
- [ ] Remove snapshot-local semantic rewrites that decide operation progress.
- [ ] Restore broad priority-recovery snapshot suite expectations or deliberately
      update them with contract proof.

## 4. Workflow Owner Adapter Cutover

- [ ] Route existing operation workflow owner facades through the new operation
      decision kernel.
- [ ] Preserve idempotent retry, wake, and dispatch effects.
- [ ] Delete duplicate transition and timeout branch logic after parity proof.
- [ ] Rerun rolling-restart blocker probe.

## 5. Placement Owner Policy Kernel

- [ ] Split placement filtering, scoring, reservation, and intent emission.
- [ ] Prevent pressure branches from rewriting placement policy locally.
- [ ] Cut priority recovery follow-up scheduling to placement intent outcomes.
- [ ] Add focused placement fixtures inspired by scheduler filter/score phases.

## 6. Publication Owner Stream Contract

- [ ] Make publication revision, ACK state, freshness, and recovery gate state
      one owner stream.
- [ ] Prevent SQL fallback reads and diagnostics from completing publication.
- [ ] Cut projection/readiness consumers to the publication owner stream.

## 7. Projection Readiness Contract

- [ ] Emit internal, repair, and serve readiness from owner outcomes.
- [ ] Stop consumers from recombining raw publication, transport, service,
      heartbeat, and ready-lease evidence.
- [ ] Add source revision and reason proof to readiness snapshots.

## 8. Diagnostics And Harness Consumer Rewrite

- [ ] Normalize owner witnesses into one diagnostics input shape.
- [ ] Rank one dominant blocker without reclassifying raw evidence.
- [ ] Cut failure bundles, active gates, and topology convergence analysis to
      owner outcomes.
- [ ] Preserve subordinate evidence as explanation only.

## 9. Legacy Deletion And Representative Proof

- [ ] Delete superseded branches, shadow vocabularies, and transitional import
      paths.
- [ ] Add structural guards against new direct calls to old paths.
- [ ] Run focused package proof plus representative rolling-restart proof.
- [ ] Close or migrate the sprint with one named remaining blocker.
