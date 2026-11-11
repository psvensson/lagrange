# Why 39 system partitions stay on the seed: a stale readiness latch (2026-11-11)

Read-only investigation (subagent) over committed HEAD 103f132c1, the working tree, git
history and the 18 recorded local formations of 2026-11-11. Timelines, gate messages and
placement counts are measured from logs; the gate chain and the latch are read from
source; old-version behaviour and the seed-loss consequences are inferred.

## Finding

In every recorded embedded formation the 39 default system partitions are **blocked
indefinitely**, by a stale latch, not by slowness.

- The seed's lifecycle controller stores a `priority_control_plane_recovery` dependency.
  It is written only when the bootstrap readiness owner is evaluated: on a bootstrap or
  join request, or on an HTTP `/readyz`, `/startupz` or diagnostics probe
  (`bootstrap-readiness-snapshot-evaluator.js:221-230`; callers
  `bootstrap-api-readiness-methods.js:231-236`, `bootstrap-readiness-owner.js:80-121`).
- In every run the last such evaluation is the **second joiner's bootstrap request**,
  when priority recovery is genuinely pending. The seed goes TRAFFIC_READY -> DEGRADED
  [`PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`] in the same millisecond (run h4-head:
  11:06:01.447) and nothing re-samples it afterwards. The embedded test polls no probe.
- The rebalancer's traffic-readiness gate
  (`rebalancer-planning-gate-methods.js:445-483` ->
  `unified-rebalancer-priority-readiness.js:698-711` ->
  `startup-recovery-coordinator.js:451-453` -> `traffic-readiness-utils.js:123-142`) reads
  `LifecycleController.evaluate()`, which only re-projects the stored dependencies
  (`lifecycle-controller.js:151-191`). It reads DEGRADED for ever.
- A default system partition needs the seed TRAFFIC_READY. Priority partitions and
  `nodes-p1` need only metadata-publication readiness, which DEGRADED with that one
  reason satisfies (`traffic-readiness-utils.js:26-30, 144-171`). That is why only they
  move.
- The real condition cleared about a minute later (h4: the seed's control-plane readiness
  stopped carrying the reason during 11:07; at 11:10:10 the convergence trace shows no
  recovery reason, no spread pending, `steady_published`). The lifecycle stayed DEGRADED.
- Measured: all 39 defaults logged only `WAIT_TRAFFIC_READY phase=DEGRADED
  reasons=[PRIORITY_CONTROL_PLANE_RECOVERY_PENDING]` (187 lines in h4, delays 75 s, 94 s,
  117 s, capped at 120 s); 0 of 39 ever left the seed in any of the 18 runs. The
  re-check cannot help because its input is latched; the rebalancer has no wake on a
  lifecycle transition.

If the latch were sampled when the condition clears (inferred): defaults become plannable
when priority spread completes plus the 70 s release dwell; 78 REPLACEs at 4-8 s over 4
slots is about 2-3 minutes more locally; about 4.5-6 minutes after start in total. The
70 s window and the back-off contribute one to two minutes; the latch contributes all of
the indefinite hold.

Caveat (inferred): once re-sampled, startup authority might still read recovery pending
through the projection active gate (the handoff contract's reading of that reason, under
repair the same day).

## History: no single "fix" stopped them

| Commit | Date | Change |
|---|---|---|
| 46b65f8ab | 2026-03-18 | traffic-readiness gate for system partitions |
| 28f413983 | 2026-03-30 | defaults need TRAFFIC_READY, priority need metadata-publication; the HARD/IMMEDIATE recovery dependency. **The latch structure**, refreshed only on join or probe ever since (same callers at v0.2.0, v0.2.5, v0.3.0, v0.4.0, HEAD) |
| 2424b8d53 | 2026-07-18 | ordinary work closed until a 70 s stable window after priority spread (deliberate: protect schema admission from the background REPLACE wave) |
| 84b3692cd | 2026-07-20 | carve-out letting `nodes-p1` pass on metadata-publication readiness |
| - | 2026-09-02/03 | a formation lane that drove all 45 critical partitions directly and measured convergence in 52-87 s: **never landed** |

When they did spread: runs in which something kept re-sampling the seed. The distributed
harness polls `/readyz` (`test/distributed/harness/cluster-base-layer.js:154`), as a
Kubernetes readiness probe would, and that unlatches the seed (a 2026-08-04 harness run
logged 272 replace and 208 spread operations across all system partitions; the lab night
of 2026-11-10/11 logged a wave of about 39 partitions after the 70 s fence). When they
did not: an August 2026 epic already measured "all 45 critical partitions stayed pending
... TRAFFIC_READY is never reached. The controller is driven, ends DEGRADED"
(`solve/epics/cluster-formation-topology-admission-closure.md:57-60`); a 0.4.0 lab run on
2026-11-01 still had 40 system partitions on one node 7.7 minutes after start. Earliest
version observed running: 0.4.0.

So correctness of placement has depended on an external HTTP probe happening to poll the
seed.

## Why no test caught it

The formation scenario's predicates check only the six priority partitions
(`fresh-formation-routability-predicate.js`). The causal-trace integration test is
observational and asserts no convergence. No test asserts that all system partitions
reach three distinct nodes.

## Consequence of seed loss after "formation complete" (inferred from placement)

The 39 defaults (and `nodes-p1` in most runs) and the sampled `mg-1` replicas are only on
the seed: partitions, tables, services, endpoints, indices, config (including
`cluster_id`), message_groups, storage reservations, migrations and more. Their Raft
groups have no surviving voter. Restarting the seed with its disk restores them; with the
disk lost, no rebuild path was found (joiner caches are projections, not replicas).

## Repair options (not implemented)

1. Readiness owner: re-sample the recovery dependency on the recovery-clear event (the
   progress contract already names a wake source `priority_control_plane_recovery_event`
   that nothing drives), so the lifecycle follows the real condition; or have the gate
   read recovery health rather than the latched lifecycle. Makes defaults plannable when
   priority spread completes instead of never.
2. Fence owner: replace the 70 s per-entity wall-clock dwell with a durable condition
   and a named, bounded system-spread step (metadata-critical tables first). About 2-3
   minutes after priority spread locally; at the lab's 3.5x factor 7-9 minutes, which
   threatens the 420 s budget if made part of the formation predicate.
3. Batch release within the 4-slot budget.
4. A scenario predicate: all 46 system partitions on three distinct nodes within a bound.
