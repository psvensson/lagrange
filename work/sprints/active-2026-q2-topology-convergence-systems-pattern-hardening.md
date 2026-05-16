# Topology Convergence Systems Pattern Hardening Sprint

Status: active. This sprint starts after
`work/sprints/done-2026-q2-topology-rolling-restart-green-gate-closure.md`
migrated the representative `rolling-restart` blocker to
`topology_publication_owner / publication_convergence`.

## Goal

Raise the probability that topology convergence work reaches representative
green, or fails with a narrower owner-boundary blocker, by turning proven
distributed-systems patterns into local owner contracts and proof surfaces.

The sprint is deliberately split into package-sized work:

1. stabilize handoff mechanics and current-frontier selection;
2. add replayable missing-edge proof before repeated broad reruns;
3. convert borrowed system ideas into local runtime contracts;
4. reduce review risk from oversized topology owner files.

## Entry Conditions

1. The current active package is closed or explicitly migrated.
2. `npm run work:current-blocker` names the latest artifact, owner, boundary,
   and next action.
3. `npm run work:validate -- --pre-impl` is green for the package being
   activated.
4. Only one package from this sprint is activated at a time.

## Non-Goals

1. Do not copy external architectures wholesale.
2. Do not implement Pro or Enterprise behavior.
3. Do not introduce operator-facing control surfaces for internal topology
   machinery.
4. Do not relax active-gate admission, raise timeouts, or treat diagnostics as
   correctness success.

## Borrowing Contract

The references below are design inputs, not implementation scope. Each package
must restate the local owner, boundary, vocabulary, allowed consumers, and
forbidden reinterpretations before runtime work begins.

| System | Borrowed idea | Local implementation detail | Not borrowed |
| --- | --- | --- | --- |
| etcd learner promotion | Presence is separate from promotion; promotion requires owner-validated catch-up. | Add an active-gate catch-up fence: target nodes, durable publication epoch/revision, snapshot coverage revision, missing proof reasons, and one promotion outcome. | etcd membership, Raft voting, quorum behavior, operator commands. |
| TiKV / PD scheduling | Topology work is an operator with ordered steps and later heartbeat evidence. | Add `topologyOperatorWitness`: operator id, owner, boundary, kind, current step, step state, witness source, next action, deadline, and last observation. | PD schedulers, Region/Store heartbeat protocol, placement policy. |
| CockroachDB system ranges | Critical metadata has stronger resilience expectations than ordinary data. | Add a critical convergence class for publication ACK, membership publication, owner recovery wake, and active-gate handoff work with typed pressure outcomes. | Cockroach range replication, SQL zone config, user-visible controls. |
| FoundationDB simulation | Reproduce the failure class deterministically before broad validation. | Generate compact missing-edge replay fixtures from representative artifacts and assert the same owner, boundary, reason, and next action through topology convergence code. | A full deterministic simulator, randomized fault campaigns, new cluster runtime. |

Primary references:

- etcd learner promotion: `https://etcd.io/docs/v3.4/op-guide/runtime-configuration/`
- TiKV scheduling operators and heartbeat follow-up:
  `https://tikv.org/docs/7.1/reference/architecture/scheduling/`
- CockroachDB system range resilience:
  `https://www.cockroachlabs.com/docs/stable/alter-range`
- FoundationDB testing and deterministic simulation:
  `https://apple.github.io/foundationdb/testing.html`

## Package Queue

1. [Topology Sprint Handoff Hygiene](../packages/done-20260516-topology-sprint-handoff-hygiene.md)
   - Lane: `lightweight-maintenance`
   - Owner boundary: `workflow_tooling_owner / sprint_handoff_integrity`
   - Purpose: make current-blocker files, scope fields, and dirty-scope
     separation mechanically trustworthy before activating another topology
     runtime package.
   - Acceptance: `work:current-blocker -- --write`, `work:validate
     -- --pre-impl`, and `work:dirty-scope` agree with the latest active
     package and artifact.
2. [Topology Publication Convergence Frontier Causal Edge](../packages/active-20260516-topology-publication-convergence-frontier-causal-edge.md)
   - Lane: `causal-escalation`
   - Owner boundary: `topology_publication_owner / publication_convergence`
   - Purpose: classify the latest `publication_ack_convergence` frontier after
     the active-gate owner-reconcile path drained.
   - Acceptance: one next owner is selected from publication convergence,
     readiness support, or operation workflow handoff, with a causal edge table
     explaining the decision.
3. [FoundationDB Style Deterministic Missing Edge Replay](../packages/todo-20260516-foundationdb-style-deterministic-missing-edge-replay.md)
   - Lane: `scenario-release-gate`
   - Owner boundary: `diagnostics_owner / deterministic_missing_edge_replay`
   - Purpose: turn representative topology frontier artifacts into compact
     replay fixtures before repeated same-frontier runtime patches.
   - Acceptance: replay fixture reproduces owner, boundary, dominant reason,
     and next action through existing topology convergence code.
4. [Etcd Style Active Gate Admission Catchup Fence](../packages/todo-20260516-etcd-style-active-gate-admission-catchup-fence.md)
   - Lane: `runtime-owner-boundary`
   - Owner boundary: `startup_active_gate_owner /
     active_gate_admission_catchup_fence`
   - Purpose: make active-gate promotion depend on one owner-owned catch-up
     fence rather than caller-local readiness reconstruction.
   - Acceptance: focused tests prove pending, blocked, and allowed promotion
     outcomes from durable publication and snapshot coverage evidence.
5. [TiKV PD Style Topology Operator Step Witness Ledger](../packages/todo-20260516-tikv-pd-style-topology-operator-step-witness-ledger.md)
   - Lane: `runtime-owner-boundary`
   - Owner boundary: `operation_workflow_owner /
     topology_operator_step_witnesses`
   - Purpose: represent topology work as one current operator step with one
     follow-up witness and next legal action.
   - Acceptance: diagnostics and harness prefer `topologyOperatorWitness` over
     timeout-only inference when it is present.
6. [Cockroach Style Control Plane Priority Convergence Class](../packages/todo-20260516-cockroach-style-control-plane-priority-convergence-class.md)
   - Lane: `runtime-owner-boundary`
   - Owner boundary: `topology_publication_owner /
     control_plane_priority_convergence_class`
   - Purpose: separate critical topology convergence work from ordinary
     diagnostics and broad repair under pressure.
   - Acceptance: focused pressure tests prove critical convergence is admitted,
     deferred, or rejected with typed owner outcomes and is never silently
     dropped.
7. [Topology Owner Boundary File Size Reduction](../packages/todo-20260516-topology-owner-boundary-file-size-reduction.md)
   - Lane: `lightweight-maintenance`
   - Owner boundary: `workflow_tooling_owner / topology_owner_file_size_debt`
   - Purpose: reduce review risk by extracting one coherent topology owner
     helper at a time from oversized runtime or test files.
   - Acceptance: selected file-size extraction keeps focused tests and
     guardrails green with no runtime behavior change.

## Activation Order

The first two packages are ordered and should run before any broad hardening
runtime package. Packages 3 through 6 may be reordered by the then-current
frontier, but each must remain one owner boundary. Package 7 is opportunistic
and should run only between runtime slices or when a runtime package explicitly
records inherited file-size debt.

## Closure Rule

This sprint closes when either:

1. the representative topology gate is green and the four borrowed-pattern
   contracts are either implemented or explicitly deferred with current
   evidence; or
2. the remaining red topology evidence is migrated to a narrower track, and
   this sprint has left replay, admission, operator-witness, priority-class,
   and file-size follow-ons in package-ready form.
