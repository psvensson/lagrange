# Shared-process runtime fixture census

Independent read-only review: subagent:verify_authoritative_absence_final,
2026-09-11, release base 59f3427c1557618c65f8dcd36d506826e8ffcbcf.
References below describe that base, before the two current migrations.

The release runner selects unit, packaging, integration and bootstrap primary
classes. Convergence probes are separate; multi7 nevertheless belongs to the
router change proof. An assertion-green shared-process fixture does not prove
independent runtime state. This is a disposition, not a completed repair receipt.

| Fixture | Release blocking | Mechanism and required owner remedy |
| --- | --- | --- |
| bootstrap/fresh-join-via-non-seed-node.integration.test.js | Yes | Lines102-211 share seed/B/C globals and fake HTTP. Migrate to three entrypoints; transparent B readiness proxy drops first POST so ContactSeedPhase, not preselection, rotates. Preserve lines219-250 meanings. Current D migration. |
| integration/critical-partition-learner-safety.integration.test.js | Yes | Lines279-343 test REMOVE admission/execution against a learner; lines149-240 create broad runtimes and rewrite service state. Replace with deterministic real admission/coordinator owner fixture and canonical rows; prove refusal and no STOPPING. No process scenario needed. Follow-on owner-test repair. |
| integration/critical-replica-placement-causal-trace.integration.test.js | Yes | Lines280-487 are real formation/trace claims: three processes plus production admin snapshots. Lines489-498 active rebalancer probe should be focused owner proof. Lines435-437 diagnostic t.ok(true) is not affirmative release evidence. Follow-on split repair. |
| integration/debug-join-flow.test.js | Yes | Lines50-224 share seed/join runtime; lines50-59,232-246 force process.exit(0) or absorb cleanup. Replace with two real processes, phase logs and admin membership. Follow-on process repair. |
| integration/message-group-multi-join-formation.integration.test.js | No: convergence | Lines279-419 share seven runtime owners with outer join retries. Lines479-624 fabricate admin owners then query them. Replace with seven entrypoints, actual admin health/SQL/discovery, positive per-joiner assignment/local group/READY evidence and no outer retries. Current D migration; mandatory router cone. |
| integration/move-replica-handoff.integration.test.js | Yes | Lines100-205,340-542 claim real ownership/history/peer outcomes: two-process public success witness. Lines208-338,544-658 monkeypatch chronology/source-shutdown failure: focused handoff owner tests, no production test controls. Follow-on split repair. |
| integration/multi-node-raft-replication.integration.test.js | Yes | Lines143-795 share global cache despite WS/Raft claims. Require real processes, quorum-backed write and positive follower-local durable/apply evidence. Routed SQL alone cannot prove follower apply. Existing structured logs or offline durable-store reader must supply evidence; otherwise an explicit observability owner decision. Follow-on process repair. |
| integration/node-join-convergence-slo.integration.test.js | No: convergence | Lines441-799 full joins need isolation. Lines804-979 single-seed stress and984-1171 phaseContactSeed-only seam are focused owners. Lines1176-1208 private handle/file-order proof becomes per-fixture lifetime evidence. Deferred nonblocking split repair; not cured by D. |
| integration/node-join-replica-activation.integration.test.js | Yes | Lines197-384,711-887 need isolated membership/READY proof. Hook/internal handler checks, hydration failure386-514, stale-cache writes516-631 and PK633-709 need focused owners. Remove rejection absorber/quiesce workaround132-179 by restoring ownership, not ignoring errors. Follow-on split repair. |
| integration/preflight-critical-path-hops.integration.test.js | Yes | Lines151-270,400-454 require three real processes with production preflight_critical_path_snapshot_local() and service_discovery_local(). Lines272-398 synthetic follower.applyCDCEvent belongs to focused CDC ingress proof. Follow-on split repair. |
| integration/three-node-seed-rebalance.integration.test.js | Yes | Lines213-382 placement requires three processes and actual persisted active non-seed placement. Fallback mock plan383-437 cannot substitute for executed movement. Preserve planner proof separately; remove compressed formation/cleanup warning workarounds36-130. Follow-on split repair. |
| integration/user-table-metadata-fanout.integration.test.js | No: convergence | Lines105-187 need three processes; lines189-296 suppress/pump scheduling and change singleton defaults. Use real CREATE and each node's truthful local diagnostic/query consequence. control_snapshot_local exposes partition IDs, not arbitrary raw table-cache rows; do not invent test endpoints. Deferred nonblocking process/observability repair. |

## No-new-debt guard contract

Use the repository's AST parsing owner (installed Espree) to resolve exact ESM
BootstrapService/NodeJoiningService bindings including aliases. Track instances
through local helpers to actual bootstrap()/join() activation per authored TAP
callback/hook, excluding sibling nested tests. Two joins or bootstrap plus join
in one owner is a finding. Constructors alone and phase-only calls are not.
Loops/helper calls and ambiguous escapes must not silently pass.

Required guard controls: aliases, wrappers, loops, sibling tests, unactivated
objects, direct phaseContactSeed, and multi-node-cluster.integration.test.js
where an injected duplicate-ID join seam and real seed are separate tests.
Any staged reviewed-debt record must bind title plus normalized AST fingerprint
and disposition, not a broad path exemption. Remaining blocking debt prevents
full release acceptance; no increase or quiet renewal is allowed.

## Duration and landing

Every authored test, including a parent awaiting nested tests, must fit its
2-second unit or30-second integration budget. Synthetic file runner totals alone
do not identify a slow authored test. Multi7's single authored root is clearly
over budget at158-173seconds. Its480second kill cap grants no exemption.

Router source is independently content-approved, but its landing remains
rejected pending the multi7 fixture and two additional duration frontiers:
router chunk3 aggregates to3034ms, and request-routing has actual2674/2605ms
leaves. These are separate from production transport semantics. No timeout,
retry, classification or baseline relaxation is authorized by this finding.
