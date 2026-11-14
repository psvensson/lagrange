---
audience: evidence
---

# Transition: a node's READY lease no longer waits for cluster formation

Recorded 2026-11-14 against main `232082669eddebe4c9fd98d3e07c11fc91ffb781`,
before any source change. Paths are relative to the repository root; every
site was re-read on that commit.

## 1. Current chain (what is replaced)

| Decision | Site on main | Inputs today |
| --- | --- | --- |
| Joiner publishes its READY lease | `src/bootstrap/node-joining-ready-signal-readiness.js:372-529` (`signalReadyForReplicas`) | CDC subscription (:379), local query transport (:403), metadata publication readiness (:424), **the operation-ledger formation barrier (:444-447)**, then the durable heartbeat (:481-516) |
| Barrier release | `src/bootstrap/node-joining-operation-ledger-formation-readiness.js:233-246, 352-362, 397-471` | engagement latch (candidates >= 3 and pre-READY >= 2), then `startupAuthorityReady` |
| What the barrier reads | `node-joining-ready-signal-readiness.js:258-293` -> `src/control-plane/control-plane-readiness-startup-authority-health.js:193-246` | the joiner's own derivation of the authority, with a release-authorised handoff forcing `ready` |
| Handoff capture, retain, revoke, successor | `src/control-plane/formation-release-handoff-closure-owner.js:205-209, 221-264, 266-281, 283-349, 351-421` | seed authority READY and spread satisfied, canonical JOINING cohort, connection evidence, terminal generation |
| READY override on every authority read | `control-plane-readiness-startup-authority-health.js:127-152, 154-178, 193-230` -> `src/control-plane/control-plane-readiness-formation-release-methods.js:286-324` -> `src/control-plane/formation-release-handoff-contract.js:547` | a release-authorised generation |
| Pre-READY priority placement | `src/rebalancer/unified-rebalancer-available-nodes.js:232-242, 321-384`; `src/control-plane/startup-authority-placement-eligibility.js`; `src/rebalancer/unified-rebalancer-replica-state.js:115, 159`; `src/rebalancer/unified-rebalancer-critical-topology-methods.js:88`; `src/rebalancer/rebalancer-priority-recovery-planning-gate-methods.js:135-138`; `src/rebalancer/rebalance-coordinator-topology-guard-methods.js:92-117, 220`; `src/rebalancer/rebalance-coordinator-replica-identity-methods.js:321`; `src/rebalancer/unified-rebalancer-control-plane-readiness-methods.js:70` | startup cohort, JOINING or ACTIVE, CONNECTED, live transport |
| Remove-safety floor | `src/rebalancer/priority-publication-safety-topology.js:136-140` | voter rows on nodes whose committed row is `readyNow` |
| Cluster open for clients | `src/control-plane/serve-eligibility-record-decision.js:122-130, 174-183, 194`; `/readyz` HARD dependency `src/bootstrap/owners/bootstrap-readiness-snapshot-evaluator.js:221-230` | the published priority summary (`src/control-plane/membership-publication-candidate-derivation.js:612-628`) |

The chain is circular: READY waits for the authority, the authority waits for
the priority spread, the spread needs removals that the floor admits only
with voters on READY nodes, and the handoff, the one breaker, is captured only
at an instant before its cohort is counted.

## 2. Transition

**Trigger.** A joiner's node-local readiness gates pass: CDC subscriptions
active, local query transport ready, lifecycle metadata publication ready.

**Authoritative facts.** The node's own NODES row (status, boot incarnation,
`ready_lease_expires_at`), owned by the durable node lifecycle publication;
the published membership row with its `priority_partition_summary`, owned by
membership publication; replica service rows, owned by the replica lifecycle.

**Permitted action.** Publish the READY lease. It states that this node can
serve and nothing about the cluster.

**Durable commit point.** The NODES row write through the node lifecycle
publication owner (unchanged), requested with `requireDurableVisibility`.

**Restart and lost answer.** A lost READY write is retried by the existing
ready-signal retry loop and the periodic heartbeat. No formation state is held
in process memory any more: the handoff generation, the terminal generation
and the successor admission cease to exist, so neither a seed restart nor a
joiner restart can strand a joiner behind them.

**Remaining obligations and their owners.** The priority spread stays with the
rebalancer (planning, ledger interlock, remove safety) and is observed only
through the published summary. A joiner that dies after READY is excluded by
lease expiry at placement and at the floor; its removal from published
membership has no owner today (the same gap any ACTIVE node has) and is routed
to a follow-up quest by the quest's constraint `dead-ready-node-witnessed`.

## 3. Checklist

1. **Producer and consumer symbols.** Producer: `signalReadyForReplicas` and
   the heartbeat it calls. Consumers of the READY lease are node-scoped
   (placement candidates, the floor, liveness). Consumers of "formation
   complete" are unchanged: `decideServeEligibility`, the `/readyz` HARD
   dependency, the non-priority spread gate, the ledger quorum hold.
2. **Owner-defined shape.** READY is the existing NODES lifecycle state;
   formation complete is the existing published summary. No new field.
3. **Identity and generation.** The lease is bound to the node's boot
   incarnation; the summary to its publication epoch. The handoff's
   generation identity (epoch, authority incarnation, cohort) is removed.
4. **Ordering.** READY (node-local) precedes placement onto the node;
   placement precedes spread; spread precedes the published summary; the
   summary precedes every client-facing cluster gate. No edge points back.
5. **Absent versus unavailable.** Unchanged: an absent summary is
   `PRIORITY_SPREAD_UNSTATED` for serving and not READY for the startup
   authority; both fail closed.
6. **Durable commit.** The NODES row write, as above.
7. **Retained obligations.** Durable `formation_release_handoff` publication
   rows written by earlier versions are left in place and never read.
   Operations created against a JOINING target do not arise any more.
8. **Canonical wake and cleanup.** The existing not-ready to ready edge wakes
   placement. The barrier's CONNECTED liveness heartbeat is removed with the
   barrier unless a remaining consumer of a JOINING node's liveness is found
   when the code is changed; that finding is recorded with the change.

## 4. What the reproducer established on main

The harness (`test/convergence/dt-formation-joint-admission-release-liveness.test.js`)
runs the production owners on evaluation rounds with no bound expiring.

- Four of nine arrival orders leave every admitted joiner without a READY
  lease: same derivation after a revoke, same derivation never captured,
  successive derivations with no authority read between them, and four
  joiners in one derivation after a revoke.
- One release-authorised generation captured for one joiner releases a second
  joiner that is not in its cohort: the override applies to every reader.
- A lone joiner is published at one epoch without a stated summary and the
  next epoch restates the seed alone with a satisfied summary; the measured
  recapture at "epoch 3" is that vacuous instant.
- In the losing order the priority ADDs onto the first (pre-READY) joiner
  complete, the planners then refuse their own surplus removal of a seed
  replica at the floor (2 of 3), the remaining priority ADDs are refused by
  the ledger interlock, and the ledger REPLACE is not terminal.
- The measured revoke reason (`startup_authority_incompatible`) was not
  reproduced; the harness revokes through a connection re-identification
  (`captured_cohort_member_ineligible`). Every revoke has the same effect.
- The harness does not yet complete a REPLACE in any order; the spread half
  is owed to stage 1b and to lab runs.

## 5. Counterexamples and their witnesses

| Counterexample | Witness |
| --- | --- |
| A wait on formation returns to the READY path | the reproducer's liveness assertion and sweep |
| A client-facing gate opens while the summary is unsatisfied or unstated | the reproducer's cluster-gate probe at every round |
| A removal drops a priority partition below its voter-ready floor | the reproducer's floor probe at every round; the verifier's SYNCING-voter counterexample |
| A node without a READY lease is a placement target | a witness on the available-nodes owner (stage 2 restates the inverted test) |
| The unwired handoff still writes, re-arms, overrides or logs | absence of `formation_release_handoff` rows and of handoff transitions in the reproducer |

## 6. Supersessions

Recorded in the quest log (decision entry of 2026-11-14, R09) before this
record: the barrier's origin quest, the joining-ready phase fence, the
handoff closure lineage, the spread-progress and barrier-oscillation quests,
the durable-rejoin barrier quest, the barrier paths of the quorum-release
quest, and model CL-044.
