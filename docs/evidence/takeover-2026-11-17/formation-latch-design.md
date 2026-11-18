---
audience: evidence
recorded: 2026-11-18
---

# Declared formation size and a one-time formation latch: design and Quest proposal (2026-11-17; rev. 1, rev. 2 and rev. 3 2026-11-18)

**Owner decision being implemented (2026-11-11, second round, item 1):** "User statements are REFUSED until the cluster is formed: declared formation size given to the seed at bootstrap, one-time monotone latch; F10 (create at quorum, report under_replicated) governs only after formation."

**Owner decisions 2026-11-18** (rev. 1 and rev. 2):
- **Reads allowed.** Reads are ALLOWED before formation. Only writes and DDL are refused (O8).
- **O13, confirmed reading of entry 166.** FORMED = `D` declared distinct hosts READY, **and** the six priority control-plane partitions hold voters on `V(r_p, D)` of them. The other system partitions spread after the latch.
- **O14, bounded lab exception.** Three lab hosts may be busy at once **only** for the named formation receipt runs: no bulk copies during them, image preloaded. Everything else keeps the two-host limit.
- **O15, synthetic host ids.** Synthetic per-node host ids are accepted for single-machine **test** harnesses only. They are never a product default; the production configuration requires a real declared host.
- **O16, one release and one fence.** Latch, placement and founding ship in **one release behind one version fence** (founding D7, through the support-envelope owner). Existing clusters are re-founded. The operator-declare path for pre-latch clusters has no caller and is **not built**. This supersedes the old-cluster branch of O7.

The 2026-11-11 decision is recorded in the routability Quest log on the WIP branch only. It is entry 166 of `solve/quests/fresh-formation-user-table-routability/log.ndjson` on `origin/wip/formation-stability-20261111`. On the current line the same log has 96 entries and none is dated 2026-11-11 (C: `grep -c 2026-11-11` = 0). Stage S0 carries it over, together with the 2026-11-18 decisions (§6).

**Inputs:**
- Code: the read-only worktree `/mnt/data/peter/projects/lagrange-gcp-takeover-20261117` at `19a2134c5`. Every `path:line` is at that HEAD unless marked otherwise.
- Host identity, placement WP-D: `fed85ec00` on `claude/place-wpd-20261117`.
- The 2026-11-11 design and research on `origin/wip/formation-stability-20261111`, in `solve/epics/operation-integrity-and-reliable-formation/`:
  - `formation-admission-design-2026-11-11.md`;
  - `similar-systems-research-2026-11-11.md`;
  - `defect-class-recurrence-history-2026-11-11.md`.
- The routability log on that branch: entries 164 and 166 (decision) and 185 (stage S1 WIP code, never landed).
- The sealed and landed sibling `solve/quests/formation-ready-lease-independent-of-spread/` (landed `5bc4d0769`, 2026-11-15) and its design evidence `docs/evidence/formation-ready-lease-independent-of-spread-2026-11/design/repair-b-design.md`.
- Sibling designs in this directory:
  - `placement-owner-design.md`, rev. 3 (P4, P6 version fence, §2.5, §2.6);
  - `founding-membership-design.md`, rev. 1 (§2.3, §2.6, D4, D7).
- Two read-only census subagents, one web research subagent, and the independent review of rev. 0, with its probe `scratchpad/latch-vet/probe-join-projection.mjs`, which I re-ran.

**Labels:** **C** = CONFIRMED: I or a census agent read the cited lines. **P** = PLAUSIBLE: inferred, or not executed.

Nothing here is built or run. It proposes a Quest; it seals nothing.

---

## Revision 3 (2026-11-18): gate-check items folded in; S0 and S1 may start

I spot-checked every citation below at `19a2134c5`. Inline marks are "(rev. 3)".

| # | Item | Verified | Resolution |
| --- | --- | --- | --- |
| 1 | **The W6 witness reaches only the seed's join projection.** The convergence world builds the joiner's `NodeJoiningService` without `readinessState` (`formation-joint-admission-rounds.js:125-175`), so `bootstrapReadinessState` is null (`node-joining-owner-construction.js:180`). N5 never exercises the READY-signal leg (`node-joining-ready-signal-readiness.js:217-267`) or the metadata-publication leg (`traffic-readiness-utils.js:26-30`). | C | **S1 mounts every node, joiners included, on the real lifecycle readiness state that the probe evaluator writes.** W6 asserts each of the three legs separately: seed join projection, joiner READY signal, metadata-publication readiness. N5 must turn each leg red (§5.2, §6.1). |
| 2 | **Harnesses treat `/readyz` as "the cluster has formed".** Under this design `/readyz` is node-local, so they would send DDL before FORMED and get 57P03. | C: `real-product-deployer-lagrange.js:130-136` (the GCP benchmark; "spread … before joiners' /readyz opens"); `examples/lab-cluster-smoke/observe-cluster.js:138-142`; the routability scenario | **S0 censuses every harness, example and scenario that reads `/readyz` as cluster formation.** Each switches its existing wait to `cluster.formation.state === 'FORMED'` from `GET /management/v1/facts`, the management-facts owner (`management-v1-owner.js:198-205`). That is one observation path through the existing owner. No second wait loop is added, and no other endpoint is polled (§6.1). |
| 3 | **Staleness after FORMED (point C).** The serve owner's committed record answers only until its lease expires (`serve-eligibility-owner.js:402-411`). A publications-leader loss after FORMED would therefore make `answerFormation()` UNAVAILABLE and refuse writes on every node. | C | **FORMED is terminal for a cluster id.** Once this process has read FORMED for its cluster id through a committed read, `answerFormation()` answers FORMED for the life of the process, and it does **not** inherit the serve owner's lease bound. `UNAVAILABLE` applies only before the first committed read that returns FORMED. FORMING and UNDECLARED remain live answers under the normal bound. This is not a second authority: the write side guarantees FORMED is never revoked (§3.3), so the remembered value cannot go stale (R10 holds). A restarted process starts again from its first committed read. New witness **W3L**: stop the `control_plane_publications-p1` leader after FORMED; writes stay admitted on every node (§3.4, §5.2). |
| 4 | **The release fence is inert today (point B).** `BootstrapJoinAdmissionOwner` is constructed without `supportEnvelope`, `getSupportEnvelope` or `getReleaseVersion` (`bootstrap-api.js:404-425`). `resolveJoinSupportEnvelopeConflict` returns null when either the envelope or the peer version is missing (`support-envelope-owner.js:316-319`). No join request carries a version. | C | **The fence is founding's WP-V deliverable, not this Quest's.** It must fail closed: an **ABSENT** cluster format revision or peer version is refused, never admitted. **S2 depends explicitly on WP-V landing.** No downgrade across this boundary: an older binary replaying a log that contains `FORMATION_TRANSITION` refuses it, `COMMITTED_COMMAND_UNRECOGNISED` (`partition-service-entry-apply-base.js:94-102`), and wedges. That is fail-closed by design, and the runbook says so (§3.3, §6.1, §8). |
| 5a | **`BackupRestoreOwner.restoreFromBackup`** (`backup-restore-owner.js:301-317`) writes cluster state outside the engine gate | C | Added to the surface census and **refused before FORMED** with `FORMATION_PENDING` (§3.6). |
| 5b | **Re-founding loses operator state written during FORMING.** System-table writes stay open while FORMING. | C (§3.6 allowlist) | The rev. 2 claim "nothing user-visible is lost" is corrected: **no user-table data** can exist before FORMED, but artifact payloads, service definitions, dynamic config and functions written during FORMING are lost on re-founding. The refusal hint and the runbook say so. AMEND stays dropped; the owner may restore it if this cost matters (Revision 2 section). |
| 5c | **The existing ingress clauses are CLIENT-only** (`sql-statement-ingress.js:100-104`) | C | The formation check is its **own clause** in `resolveClientStatementRefusal`. It does not depend on the ingress classification and is not merged into the CLIENT-only clauses (§3.6). |

---

## Revision 2 (2026-11-18): owner decisions folded in, names fixed

**Final names.** These are what placement rev. 3 already consumes; there are no aliases.

| Concept | Name |
| --- | --- |
| Owner of the fact (writer, decoder, latch evaluation) | **Membership publication**: module `membership-publication-formation-record.js` (`decodeFormationRecord`, `evaluateFormationLatch`, command builders), and the typed committed command **`FORMATION_TRANSITION`** with its applier |
| The record | the **`cluster_formation`** row in `control_plane_publications` (`publication_id = publication_kind = 'cluster_formation'`). Its row status is `DECLARED` or `FORMED`; the schema-declared column `formation_record` holds the owner-defined shape. |
| The one reader | **`ServeEligibilityOwner.answerFormation()`**: one implementation, `decodeFormationRecord` applied to that owner's committed publications read |
| What placement consumes | **`answerCommittedNodes().formation`**: the same value, from the same committed record |
| What the statement gate, gate C and management facts consume | `answerFormation()`. The readiness service reaches it through its existing per-method delegation (`control-plane-readiness-serve-eligibility-methods.js:77-89`), under the same name. That is a call path, not a second reader. |
| Answer states | `FORMED` / `FORMING` / `UNDECLARED` / `UNAVAILABLE` |
| Placement waiting reason; client refusal | `FORMATION_NOT_LATCHED`; `FORMATION_PENDING` (SQLSTATE `57P03`) |

The rev. 1 name `answerFormationAdmission()` is withdrawn. No `formation_complete` record exists anywhere.

**Why the reader stays in `ServeEligibilityOwner`, now that serving does not consult formation.**
- That owner holds the one committed, leader-required read of `control_plane_publications`, beside the nodes read (`serve-eligibility-owner.js:365-376`). It also holds the one `subscribe` that placement's `NODES_OR_FORMATION` trigger uses (`:712-715`).
- A separate reader would add a second read of the same table and a second trigger source.
- Its role here is stated honestly: it is the committed control-plane record reader, and its serve decision has **no** formation reason (§3.4).

**What changed in rev. 2:**

| # | Change | Sections |
| --- | --- | --- |
| 1 | **O13** is recorded as the owner's confirmed reading, not an interpretation awaiting confirmation | §3.3, §5.1 |
| 2 | **O16.** The old-cluster DECLARE path is deleted. `DECLARE_FORMATION` is **dropped entirely**, AMEND included; the reasons follow this table. `D` is declared only at seed bootstrap. The record has no revision, so the transition table shrinks to DECLARE (founding only) and LATCH. | §3.2, §3.3, §3.5, §5, §7 |
| 3 | **One version fence.** The rev. 1 per-command capability fence (`formation-transition-v1`) is withdrawn. Founding D7's support-envelope fence, placement rev. 3's P6, guarantees that every replica in a cluster with a formation record knows `FORMATION_TRANSITION` and has the `formation_record` column. One owner of version compatibility (R01), matching placement rev. 3. | §3.2, §3.3, §6 |
| 4 | **O15.** Synthetic per-node host ids live only in test-harness code. The production path requires a real `NODE_HOST_ID` (WP-D: no default). A census pins this. | §3.1, §5.1 |
| 5 | **O14.** The physical receipt runs under the bounded exception | §5.3 |
| 6 | Reader and record names fixed (above) | throughout |

**Why `DECLARE_FORMATION` (AMEND) is dropped rather than kept.**
- Before FORMED, **no user-table data can exist.** Every user-table write and every DDL is refused at the one engine gate, independent of ingress (§3.6), and the surface census proves every entry passes the gate. **(rev. 3, corrected)** Operator state written to system tables during FORMING *is* lost on re-founding: artifact payloads, service definitions, dynamic config, functions. The refusal hint and the runbook say so.
- **The one real post-founding case is a host lost before FORMED.** It is handled without AMEND:
  - Usually by **starting a replacement host**. Any new READY host counts toward `D`.
  - If the operator truly has fewer hosts than declared, by **re-founding with the correct `D`**. That is etcd's documented exit: "remove the data directories on all members and re-bootstrap the cluster" (§4).
- **After FORMED, AMEND has no meaning,** because FORMED is terminal and the declaration caps nothing.
- **Keeping it would cost more than it saves.** It needs a management operation kind, a revision in the record, an AMEND edge with a stale-LATCH guard, and witnesses, all for a case that two existing operator actions already cover.
- Under the "remove unused paths" rule it is dropped. If the owner prefers an in-place amend for operator convenience, the rev. 1 text (§3.2 operator operation, AMEND row of §3.3) is the version to restore.

---

## Revision 1 (2026-11-18): independent review APPROVE-WITH-CHANGES, folded in (history)

The core stands: one owner, one record, an apply-guarded one-way latch, no double latch, and no placement deadlock (P4 admits classes 1-2 before FORMED). Inline marks "(rev. 1)".

| # | Finding | Verified | Resolution (rev. 2 status) |
| --- | --- | --- | --- |
| 1 HIGH | A `/readyz` HARD dependency on formation deadlocks formation. The shared lifecycle state is also read by seed join admission and `/bootstrap`, the joiner's READY signal and metadata-publication readiness, which tolerate only `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`. | **C**, probe re-run: the reason `cluster_formation_pending` gives `joinAdmissionProjectsReady: false` in INIT, DEGRADED and CONTROL_READY; the old reason projects ready. Lines in §1.2. | Formation is not a readiness, `/readyz` or serve-eligibility dependency. The old dependency, its tolerance sets and the ready-signal rewrite are deleted (§3.4; W6, N5). Stands. |
| 2 HIGH | `D` in hosts against WP-D: single-machine harnesses are one host; the chart has no anti-affinity | **C** at `fed85ec00` (§1.3) | `declaredHostCountOf` helper; synthetic ids in test harnesses only (rev. 2, O15); required chart anti-affinity (§3.1). Stands. |
| 3 MED-HIGH | `FORMATION_TRANSITION` is a new command type; old replicas wedge | **C** (`partition-service-entry-apply-base.js:94-102`) | rev. 1: a capability fence. **Rev. 2: replaced by the one version fence** (founding D7 / placement P6). |
| 4 MED | A replicated ALTER cannot add the column | **C** | A schema-declared column plus a node-local ensure; the version fence guarantees it (§3.2). Stands. |
| 5 MED | L3's holder predicate has no catch-up or committed-membership test | **C**; the suggested floor predicate also accepts SYNCING (`priority-publication-safety-shared.js:48-52`) | `isCaughtUpVoterReadyReplica` = floor-countable **and** ACTIVE; ConfState voter after founding (§3.3). Stands. |
| 6 MED-LOW | The trigger set is incomplete | agreed | Triggers add priority SERVICES changes and NODES lease commits (§3.3). Stands. |
| 7 LOW-MED | Unguarded writes to the record; dead `removePublication` | **C** | A partition-boundary guard; `removePublication` deleted. Stands. |
| 8 LOW | (a) Entry 166 wording. (b) Ingress default. (c) AMEND to 1. (d) Two reads. (e) Three lab hosts. (f) D7. | **C** for (b), (d) | (a) **owner-confirmed** (rev. 2). (b) Allowlist plus surface census. (c) **AMEND dropped** (rev. 2). (d) Wording fixed. (e) **Owner exception** (rev. 2). (f) **One release** (rev. 2). |
| 9 | Applier discipline as in placement | agreed | Validate, settled-key replay, re-park, CDC slot, guard, write (§3.3). Stands. |

---

## 0. Summary (rev. 2)

**Today (C).**
- No node is ever told the intended cluster size (§1.3).
- "Formation complete" is a live census, `min(3, |eligible|)` (`membership-publication-priority-partition-summary.js:560-563`).
  - It is recomputed on every derivation and refreshed in place on the PUBLISHED row (`membership-publication-coordinator-reconcile.js:274-305`).
  - A lone seed reads as satisfied (`:576`), and two of three hosts satisfy it.
- Serve eligibility, and therefore every user-table read and write route, closes cluster-wide whenever a later publication carries a gap (`serve-eligibility-record-decision.js:122-130, 174-183`).
- `/readyz` follows the same live fact through a HARD dependency that the join path tolerates by name.
- No statement-ingress check reads any formation fact.
- No latch exists.

**The design.**
1. **The declaration.** `D`, declared hosts (WP-D), is given only to the founding seed (`formation.declaredHostCount`).
   - It is validated as `D = 1` or `D ≥ 3`, with no default.
   - It is written into the seed's write-once original allocation beside the `clusterId`.
   - It is published once, through a new original right, as the `cluster_formation` row in state DECLARED.
   - It is **never amended** (rev. 2).
2. **The latch.** Membership publication commits `DECLARED → FORMED` once, through `FORMATION_TRANSITION` guarded at apply, when:
   - a PUBLISHED, acknowledged membership publication exists;
   - its READY published nodes span ≥ `D` distinct hosts;
   - each of the six priority control-plane partitions has caught-up voters (floor-countable **and** ACTIVE) on ≥ `V(r_p, D)` of them.

   FORMED is never revoked, and no timer produces it. Every replica knows the command because of the one version fence (founding D7 / placement P6; rev. 2).
3. **One reader.** `ServeEligibilityOwner.answerFormation()`; placement consumes `answerCommittedNodes().formation`. Formation is **not** a readiness, `/readyz` or serve-eligibility dependency.
4. **Before FORMED.** Writes to user tables and all DDL are refused at the one engine gate with `FORMATION_PENDING` (57P03), before any job or metadata row exists. Reads are admitted.
5. **After FORMED.** Node loss, under-replication and added nodes never close admission. F10 governs CREATE TABLE. A declared size that is never reached stays FORMING for ever, with typed missing-host detail. The exits are starting a (replacement) host, or re-founding with the correct `D`. There is no timeout and no amend (rev. 2).
6. **Two meanings separated.** The live summary keeps its repair meaning (placement WP-F, founding). Only "the cluster has formed" moves to the latch.

**Quest:** `formation-declared-size-latch`, epic `operation-integrity-and-reliable-formation` (§5).
- It is red today on four deterministic witnesses.
- It is precondition P4 of placement WP-F.
- It ships in the same release as placement and founding, behind founding's D7 fence.

---

## 1. What exists today on this line

### 1.1 The formation summary and who computes it

**The canonical computation, A** (membership publication candidate derivation; C):
- `membership-publication-candidate-derivation.js:593-599` builds the eligible set as the union of three sources: locally eligible, projected serving and published active.
- `:600-611` normalizes the planning snapshot's embedded summary with `requiredDistinctNodeCount = Math.min(PRIORITY_SPREAD_REQUIRED_DISTINCT_NODE_COUNT, union.length)`.
- `:612-622` derives a fresh census with `buildDerivedPriorityPartitionSummary`.
- `:623-628`: "The fresh census wins whenever it is derivable (owner decision 2026-10-04): an earlier satisfied planning-snapshot summary never outranks the current rows." So the summary is live **by design**.
- The result is written to the row's `priority_partition_summary` column (`:98`; schema `system-table-runtime-schema-definitions.js:33`).

**The builder** (`membership-publication-priority-partition-summary.js`; C):

| Step | Lines | Behaviour |
| --- | --- | --- |
| Eligible set | `membership-publication-priority-partition-readiness-data.js:182-239` | The union of three sources; if empty, readiness-promotable nodes (`:28-78`) |
| Holder exclusion | `:515-523` | `node_not_eligible` outside a non-empty eligible set |
| Holder fallback | `:549-558` | If the eligible set is still empty, every node that already holds a replica |
| Requirement | `:45, 560-563` | `required = min(3, |eligible|)` |
| Skip | `:576` | `required ≤ 1` skips every partition, so a lone seed is `satisfied: true` |
| Verdict | `:621` | `satisfied: blockedPartitions.length === 0` |
| Holder predicate | `:411-447` | ACTIVE partition row, voter role, address, node. No catch-up, READY or committed-membership test. |

**Publication and refresh** (C):
- The 5 s owner-membership driver derives and publishes (`membership-publication-coordinator-reconcile.js:597-621`).
- A summary-only change rewrites the existing row in place (`:274-305`).
- Serve eligibility treats that as a supersession (`serve-eligibility-record-decision.js:221-242`).

**Other computations** (C; numbering follows `repair-b-design.md` §2.1, and E was deleted by the sibling):

| # | Where | Requirement | Unknown |
| --- | --- | --- | --- |
| B | `current-priority-placement-observation.js:488-531`; memo `:166`; admin overlay `admin-control-snapshot-local-build-base.js:381-415` | same builder, a fourth node source | `unavailable`, read as not pending |
| C | `unified-rebalancer-priority-readiness.js:470-555` (rebalancer spread blocker; drives the 70 s fence) | `Math.min(NUM.THREE, Math.max(ready, cohort))` (`:517-520`) | null: **fails open** |
| D | `membership-publication-coordinator-reconcile-helpers.js:184-216` | ACTIVE ∪ cached published | false |

**`priority-recovery-partition-assessment.js:84-130`** (C) consumes the summary.
- Its eligibility is `admission.effectiveEligibleNodeIds`, filled from `resolvePriorityRecoveryActiveNodeCohort` (`unified-rebalancer-available-nodes.js:405-406, 466-467`).
- That cohort moves with readiness, so a serve-lane flap changes the requirement and the verdict.

### 1.2 Consumers

**Gate meaning: "the cluster has formed"** (C unless marked):

| Consumer | Reads | Not-formed / unknown | file:line |
| --- | --- | --- | --- |
| Serve eligibility (the reason is cluster-wide) | the latest PUBLISHED row's summary, through two concurrent leader-required reads (nodes, publications) | `priority_spread_unstated` / `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`: every node NOT_ELIGIBLE | `serve-eligibility-owner.js:365-376`; `serve-eligibility-record-decision.js:40-50, 100-130, 174-183` |
| User-table routing (reads and writes) | default routing dimension SERVE_ELIGIBLE after the handoff | refused after one refresh wait; XX000 (P) | `startup-sql-runtime-handoff.js:163-171`; `query-executor-base.js:62-64`; `query-executor-partition-delivery.js:244-293` (P) |
| CREATE TABLE targets (F10) | the serve cohort | targets < quorum: `PROVISIONING_UNAVAILABLE` → 57P03, **after** `tables` and `partitions` rows commit | `sql-query-engine-provision-target-methods.js:130-160, 194-235`; `table-creation-service-create-table.js:238-269, 302-308`; `pgwire-result-mapper.js:151-152` |
| `/readyz` | HARD `PRIORITY_CONTROL_PLANE_RECOVERY`, IMMEDIATE demotion, from the startup-authority planning answer (not the serve owner) | 503 | `bootstrap-readiness-snapshot-evaluator.js:348-357`; `bootstrap-readiness-lifecycle-source.js:159-200`; `control-plane-readiness-startup-authority-health.js:264-298`; `startup-authority-snapshot-owner.js:263-266, 446-505` |
| Admin load lane | the SERVE_ELIGIBLE dimension | **admits when readiness is unavailable** | `admin-websocket-load-lane-admission.js:141-171` |
| Statement ingress | nothing; a statement not marked CLIENT defaults to `IN_PROCESS_OWNER` | no formation predicate | `sql-statement-ingress.js:67-76, 131-141`; callers `sql-query-engine-statement-execution.js:309`, `sql-query-engine-request-dispatch.js:165, 257` |
| Non-priority placement gate | computation C, then the 70 s window | fails open | `unified-rebalancer-priority-readiness.js:470-555`; `rebalancer-priority-recovery-planning-gate-methods.js:220-367`; `unified-rebalancer-policy-scheduler-methods.js:182-223` |
| Ledger quorum hold | **no formation read**; caches only | not engaged | `operation-ledger-quorum-concentration.js:86-101, 219-231` |
| PG wire startup gate | presence checks only | - | `pgwire-startup-safety-gate.js:69-75, 121-145` |

**Readers of the shared lifecycle readiness state, which the `/readyz` dependency feeds** (rev. 1; C):

| Reader | file:line | What it tolerates |
| --- | --- | --- |
| Seed join admission, `POST /bootstrap`, `/bootstrap/ready` | `bootstrap-api-readiness-methods.js:231-236`; `bootstrap-request-owner-handler.js:154-157` | `BOOTSTRAP_JOIN_NON_BLOCKING_REASONS` (`bootstrap-join-projection-policy.js:24-29`) |
| INIT-phase bypass | `startup-recovery-coordinator.js:145-182` | `BOOTSTRAP_INIT_PRIORITY_BYPASS_REASONS`. It requires at least one of the two priority-recovery reasons (`:157-160, 174-176`). |
| Joiner READY signal | `node-joining-ready-signal-readiness.js:217-267`. It rewrites an INIT bypass to DEGRADED plus the priority-recovery reason. | the INIT bypass |
| Metadata-publication readiness | `traffic-readiness-utils.js:26-30` | `METADATA_PUBLICATION_ALLOWED_CONTROL_READY_REASONS` |

**Consequence** (C, probe re-run). Any other reason from a HARD formation dependency stops a seed from admitting joiners in INIT, DEGRADED and CONTROL_READY. A latch that waits for joiners would never be reached.

**Footprint** (C, grep). 25 `src` and 65 test files reference the priority-recovery reason or dependency. Many are repair-meaning uses. S0 classifies each.

**Repair meaning: "a priority partition is under-spread now"** (C for the lines). These readers stay live and are not changed here; they belong to placement WP-F and founding:
- remove safety (`operation-workflow-remove-safety-membership.js:46-49`; `operation-workflow-remove-safety-evaluator.js:262`);
- learner promotion (`partition-service-learner-promotion-count-check-methods.js:150-165`);
- the priority admission plan (`priority-recovery-snapshot-workflow.js:34, 211-342`);
- superseded targets (`priority-recovery-superseded-target.js:89`);
- ledger visibility (`replica-operation-repository-visibility-methods.js:400`);
- publication recovery (`publication-recovery-priority-spread.js:71-115`);
- projection evidence (`projection-readiness-evidence.js:592`);
- the recovery-lane branch of available nodes (`unified-rebalancer-available-nodes.js:125-150`, alias reads `:132-135`);
- the `nodes-p1` spread rule (`system-spread-transition-policy.js:127-187`).

`hasPriorityRecoverySpreadGap(null)` answers "no gap" (`priority-recovery-planning-intent.js:219-232`); routed (§6.4).

### 1.3 How the seed learns its cluster size: it does not

All C:
- **Config.**
  - Only replica counts exist: `messageGroup.replicaCount` (`config-definitions.js:65, 383-388`) and `partition.defaultReplicaCount`.
  - The latter's schema is `anyOf [{const:1},{minimum:3}]` (`config-schema-constants.js:79-81`), the precedent for §3.1.
  - There is no size identifier, and the seed path has no size option.
- **Seed role.** No `SEED_NODE_ADDRESS` (`statefulset-seed.yaml:1-3`).
- **Helm.**
  - "Total cluster size = 1 + joiners.replicas" exists only as a comment (`values.yaml:3-7, 14-16`).
  - The seed has `replicas: 1`; joiners are `Parallel`; the headless service has `publishNotReadyAddresses: true` (`service-headless.yaml:14`); the PDB is `minAvailable: 2`.
  - At `fed85ec00`: `NODE_HOST_ID` comes from `spec.nodeName` (`_helpers.tpl:186`), with an empty `affinity: {}` passthrough only (`values.yaml:96`).
- **Distributed and lab harness.**
  - `size: 3` (`local-three-node.json:2`); joiners are started host-side (`cluster-class-lifecycle-base.js:1005-1010`); `scripts/lab/harness.js:300-307`.
  - At `fed85ec00`, the host id is `resolveProviderHostName(...)` (`:515-516`), so local Docker is one host.
- **Embedded and in-process.**
  - `formCluster(size)` (`embedded-cluster-harness.js:524-552`); at `fed85ec00` each node gets `hostId ?? hostname()` (`:397`).
  - The convergence world uses `simulatedHostIdOf` (`formation-joint-admission-world.js:179-181` at `fed85ec00`).
  - The examples use `hostname()`.
  - Single-node RF 3 refuses CREATE TABLE (`single-node-default-replica-count-refusal.integration.test.js:27-49`).
- **Dead code.** `ClusterReadinessSignal` (`src/rebalancer/cluster-readiness-signal.js:44, 108-118`) is constructed only in tests.
- **Membership-derived counts.** `expectedNodeCount` (`priority-recovery-observation-gate-resolution.js:273-298`) is derived from current rows.
- **Write-once seed record.** `createSeedOriginalAllocation` (`seed-original-allocation-declaration.js:88-106`, validation `:174-200`) mints `clusterId`.
  - It is persisted `WHERE original_allocation IS NULL` (`raft-rs-replica-lifecycle-owner.js:504-531`).
  - It is published once through the original-right state machine UNUSED → SUBMITTED → TRANSFERRED (`raft-rs-original-allocation-constants.js:44-52`; `raft-rs-original-allocation-preparation.js:436-495`; `seed-registration-phase.js:614-631`; `seed-original-registration.js:45-57`).
- **Storage hazards.**
  - `DynamicConfigService.set` can overwrite any CONFIG key, `cluster_id` included (`dynamic-config-service.js:287-305, 536-542`; admin `PUT /api/admin/config/:configKey`).
  - Publications are written by read-merge-upsert (`membership-publication-coordinator-persist.js:105-144`).
  - `removePublication` (`control-plane-publications-owner.js:82`) has no caller.

---

## 2. What changed since the 2026-11-11 design, and what still applies

| 2026-11-11 item | State at `19a2134c5` | Disposition |
| --- | --- | --- |
| F1a `min(3, eligible)`, five formulas | Still true. E was deleted; A, B, C and D remain (C). | The gate meaning moves to the latch; A stays as the repair summary. C is re-pointed (O10); B and D go to WP-F. |
| F1b no declared size | Still true. WIP S1 is not on this line (C). | §3.1-3.2 |
| F1c F10 | Unchanged | Governs only after FORMED |
| F1e no formation predicate at admission | Still true | §3.6: writes and DDL only (owner, 2026-11-18) |
| F2a, F3a | Still true | Routed (§6.4) |
| F4d `ClusterReadinessSignal` | Dead | Deleted |
| Barrier, handoff, pre-READY placement | Deleted by the sibling | The latch adds nothing to READY or to node readiness |
| Formation record by the publication coordinator | Not built | Kept, with changes: hosts, `V(r_p, D)`, caught-up voters, the publications partition, an apply-guarded command behind the release version fence, read by `answerFormation()` |
| D1 declared size (a) "written once … beside `cluster_id`" | - | Kept: the original allocation beside `clusterId`. **No amendment** (rev. 2). |
| D2 refuse all user statements | - | Narrowed by the owner, 2026-11-18: writes and DDL only |
| D4 one admission point | Still the one refusal function (`sql-statement-ingress.js:124-141`) | Kept, plus a target allowlist and a surface census |
| S5, S6 | - | S5 is superseded by placement's repair deficits. S6 is split. |

**New since 2026-11-11.** Placement rev. 3 (P4 consumes `answerCommittedNodes().formation`; the P6 version fence; spread in declared hosts; WP-D at `fed85ec00`). Founding rev. 1 (`V(r, H)`; one-voter founding; D4; the D7 version fence). The 2026-11-18 owner decisions (header).

---

## 3. The design

### 3.1 The declared formation size

| Aspect | Rule |
| --- | --- |
| Name and unit | `formation.declaredHostCount` (env `FORMATION_DECLARED_HOST_COUNT`, through the static `ENV_MAPPINGS`). The unit is the declared host, `NODES.host_id` (WP-D). |
| Who reads it | Only the founding branch of a seed (no `SEED_NODE_ADDRESS`, no retained original allocation). A joiner started with it refuses typed, `FORMATION_DECLARATION_SEED_ONLY` (O11). |
| Default | None. `FORMATION_DECLARED_HOST_COUNT_REQUIRED` before any founder is prepared. |
| Validation | `D = 1` or `D ≥ 3` (the RF schema precedent). `D = 2` gives `FORMATION_DECLARED_HOST_COUNT_INVALID{reason: TWO_HOSTS_HAVE_NO_MAJORITY}`. |
| Odd-node rule | Voter sets stay odd because the requirement is `V(r, D)`. Defaults, proofs and examples use 3 or 5. Refusing even `D ≥ 4` is O2. |
| `D = 1` | Formed when the seed is READY and published. RF 3 user tables wait for a second host (F10, C). |
| Harness rule (rev. 1; **rev. 2: test-only**) | One **test** helper, `declaredHostCountOf(topology)`, under `test/`. It derives `D` from the same host assignment the harness passes to `NODE_HOST_ID`, so the two cannot disagree. A single-machine **test** harness whose subject is a multi-host formation (local Docker formation scenarios, embedded formation tests, the simulator) assigns synthetic per-node host ids, as the convergence world does. Other single-machine harnesses and **every example** use the real `hostname()` and declare `D = 1`. Lab runs on several machines use real hostnames. |
| **Production (rev. 2, O15)** | Synthetic host ids are never a product default. The product path requires a real `NODE_HOST_ID` / `node.hostId` with no default (WP-D: `NODE_HOST_ID_REQUIRED`). A census pins that no `src`, `charts`, `examples` or `scripts/lab` path produces a synthetic host id. |
| Chart | `formation.declaredHostCount`, default `3`, rendered into the **seed** StatefulSet only. Schema: 1 or ≥ 3. An install-time guard checks `≤ 1 + joiners.replicas`. **Required** `podAntiAffinity` on `kubernetes.io/hostname` across seed and joiner pods. The README states that `D` counts Kubernetes nodes. |

### 3.2 Durable persistence at bootstrap (rev. 2)

**On the seed.**
- `createSeedOriginalAllocation({…, declaredHostCount})` adds the field to the deep-frozen declaration, beside `clusterId`. `assertAllocationHeader` validates it.
- It is persisted `WHERE original_allocation IS NULL`. A retained declaration is reused on restart and never re-minted.
- **(rev. 2) Release boundary.** Latch, placement and founding ship in one release (O16), so a declaration retained from a pre-release build is refused by founding D7's one typed refusal, `ORIGINAL_ALLOCATION_FOUNDING_LAYOUT_UNSUPPORTED`, before any founder opens.
  - That refusal covers a declaration lacking `declaredHostCount` as well. There is no compatibility reader, and existing clusters are re-founded.
  - Between this Quest's landing and founding's, `main` is not releasable across that boundary. A development seed with a retained older declaration gets today's typed IDENTITY refusal.

**In the cluster: the `cluster_formation` row.**
- The row lives in `control_plane_publications`: `publication_kind = publication_id = 'cluster_formation'`, `status ∈ {DECLARED, FORMED}`. `publication_epoch` is 0 while DECLARED and the latch epoch when FORMED. The ack lists are empty.
- **Column.** `formation_record` (TEXT) holds `{clusterId, unit, declaredHostCount, latchedFromPublicationId, formedNodeIds, formedHostIds, requirementByPartitionId}`. Rev. 2 dropped `declarationRevision` and `declaredBy` (no amendment).
- The column is **declared in `CONTROL_PLANE_PUBLICATIONS_SCHEMA`** (`system-table-runtime-schema-definitions.js:21-52`) and created on every replica by a node-local ensure, `ensureControlPlanePublicationsTableColumns`, beside the existing ensures (`partition-service-table-bootstrap.js:300-311`).
- **(rev. 2)** The release version fence guarantees every replica runs the version that declares it. No replicated ALTER, and no per-command fence.
- **Why this partition (O3).**
  - It is spread to `V(3, D)` hosts by the latch's own condition.
  - The reader already reads it.
  - Publication rows are never deleted.
  - CONFIG is spread only after FORMED, and its keys can be overwritten.

**First and only declaration.**
- It goes through a new original right, `ORIGINAL_FORMATION_RIGHT`, on the anchor replica (UNUSED → SUBMITTED → TRANSFERRED), exactly as `IDENTITY_RIGHT` works.
- `submit` sends `FORMATION_TRANSITION{DECLARE}`; `observe` reads the row back.
- A lost answer keeps SUBMITTED and never re-mints.

**Seed restart.**
- The retained declaration and the durable record govern.
- If the configured `D` differs, startup continues, and management facts show `declarationConfigDiffers{durable, configured}`, logged once (etcd's rule). Refusing startup instead is O5.
- The diagnostic's text names the only ways to change `D`: before FORMED, re-found the cluster; after FORMED, `D` is history (§3.5).

**No operator declaration or amendment operation exists (rev. 2).** The reasons are in the Revision 2 section above.

### 3.3 The one-time monotone latch

**Condition.** All inputs come from committed reads at one evaluation by the publications write leader. A false FORMED cannot be undone, so no cached input contributes.

| | Condition |
| --- | --- |
| L0 | The `cluster_formation` row is DECLARED for this node's cluster id |
| L1 | A `cluster_membership` publication `P` is PUBLISHED and acknowledged (`serve-eligibility-record-decision.js:116-120`) |
| L2 | `R` = nodes in `P.publishedActiveNodeIds` whose committed NODES row is ACTIVE with a valid READY lease at the read instant. The distinct `host_id`s of `R` number ≥ `D`. |
| L3 | For each of the six priority control-plane partitions `p` (each table's p1 included even without rows), the replicas counted by `isCaughtUpVoterReadyReplica` on nodes in `R` span ≥ `V(r_p, D)` distinct hosts. `r_p = resolveDesiredReplicationFactor(partitionRow_p)`, and UNDECLARED fails L3. `V` = founding's `resolveVoterTarget` in `replication-target-authority.js`, added by whichever Quest lands first. |

**(rev. 2) This is the owner's confirmed reading of entry 166 (O13, 2026-11-18).**
- "Intended node count" means `D` declared distinct hosts READY.
- "Every control-plane group spread across that many nodes" means the six priority control-plane partitions holding voters on `V(r_p, D)` of those hosts.
- The other system partitions spread after the latch; placement admits them only after FORMED.

**`isCaughtUpVoterReadyReplica`** (rev. 1).
- It is exported by the remove-safety topology owner (`priority-publication-safety-topology.js`).
- It is `isVoterReadyFloorCountableReplica(row, {committedNodeFloor})` (`:136-140`: voter role, address, committed node `readyNow`) **and** `row.status === ACTIVE`. The floor's own status set admits SYNCING (`priority-publication-safety-shared.js:48-52`), and a one-way latch must not count a SYNCING voter.
- After founding, the role is the applied-`ConfState` projection, so only committed voters count and learners never do.

**In practice** (`r = 3`): `V(3, 1) = 1` and `V(3, D ≥ 3) = 3`. With `D = 5`, all five hosts must be READY and each priority partition needs three caught-up voter hosts.

**Why `V(r_p, D)` and not `V(3, eligible)`.**
- `D` is fixed, so no serve flap or late joiner moves the requirement.
- Founding keeps `V(r, H_eligible)` for founding and growth.
- `D = 2` is refused, so founding D4's two-host case does not arise.

**Evaluation.** `evaluateFormationLatch({record, publication, nodeRows, serviceRows, partitionRows, committedNodeFloor, readAtMs})` returns `LATCH{…}` or `WAIT{MISSING_HOSTS{n} | PARTITION_UNDER_DECLARED_SPREAD{ids} | PUBLICATION_NOT_ACKNOWLEDGED | REQUIREMENT_UNDECLARED{ids} | UNAVAILABLE{input}}`. It reads neither the live summary nor the cache.

**Triggers** (rev. 1; no timer). Evaluated whenever the row is DECLARED and one of these occurs:
- a membership publication becomes PUBLISHED;
- a priority-partition SERVICES row changes (the cache change port is used as a trigger only; the decision re-reads committed rows);
- a NODES READY-lease commit (`serve-eligibility-owner.js:712-715`);
- the DECLARE commit;
- publications write-leadership start.

The 5 s driver is not on the latch path.

**Version fence (rev. 2; replaces the rev. 1 capability fence).**
- No `control_plane_publications-p1` replica of a version without the `FORMATION_TRANSITION` applier, or without the `formation_record` column, can exist in a cluster that has a `cluster_formation` row. The one release boundary is fenced by the support-envelope owner (founding D7 = placement P6):
  - the certified version pair excludes pre-release sources;
  - join admission refuses `OUTSIDE_SUPPORT_ENVELOPE` (`resolveJoinSupportEnvelopeConflict`, `bootstrap-join-admission-owner.js:38, 266`);
  - the rolling-upgrade owner refuses the pair (`validateVersionPairAdmission`);
  - the seed refuses a pre-release declaration.
- A per-command capability token would be a second version-compatibility authority that never fires: an R01 duplicate, and dead logic under the "remove unused paths" rule. So none is added; placement rev. 3 made the same choice.
- What still holds: an old replica that did receive the command would refuse it `COMMITTED_COMMAND_UNRECOGNISED` and wedge (`partition-service-entry-apply-base.js:94-102`, C). The fence is what prevents that.
- After FORMED, nothing is ever proposed again.
- **(rev. 3) The fence is inert today and must be built to fail closed.**
  - Today: `BootstrapJoinAdmissionOwner` is constructed without `supportEnvelope`, `getSupportEnvelope` or `getReleaseVersion` (`bootstrap-api.js:404-425`). `resolveJoinSupportEnvelopeConflict` returns null, i.e. admits, when either the envelope or the peer version is missing (`support-envelope-owner.js:316-319`). No join request carries a version.
  - The fence is **founding's WP-V deliverable**. It must refuse an **ABSENT** cluster format revision or peer version.
  - This Quest builds no fence of its own. **S2 depends on WP-V having landed.**
- **(rev. 3) No downgrade across this boundary.** An older binary that replays a log containing `FORMATION_TRANSITION` refuses the entry, `COMMITTED_COMMAND_UNRECOGNISED`, and wedges. That is fail-closed by design. The runbook states that downgrade across this release is unsupported and that recovery is re-founding.

**Transition: `FORMATION_TRANSITION`, applied deterministically inside the Raft apply transaction.**
- It follows the committed-command pattern (`partition-committed-command-admission.js:131`, `COORDINATOR_SETTLEMENT`; placement §2.5).
- **Applier steps:**
  0. validate;
  1. settled-key replay (an entryId already settled returns its recorded outcome);
  2. reservation re-park;
  3. CDC owed admission counting 1 slot, at request and at apply (`partition-cdc-owed-admission.js:39-50`);
  4. the guard below;
  5. write the row, record the typed outcome under the entryId, emit CDC from the full row image, and fire `ENTRY_COMMITTED` for both admit and refusal.

| From | Command | Guard at apply | To | Outcomes |
| --- | --- | --- | --- | --- |
| absent | `DECLARE{clusterId, D}` (only via `ORIGINAL_FORMATION_RIGHT` at founding) | `D` valid; `clusterId` = the anchor declaration's | `DECLARED` | COMMITTED; ALREADY_APPLIED (same value); REFUSED{ALREADY_DECLARED} |
| `DECLARED` | `LATCH{publicationId, epoch, nodes, hosts}` | status is DECLARED | `FORMED` | COMMITTED; ALREADY_APPLIED (identical LATCH already applied) |
| `FORMED` | any | - | `FORMED` | REFUSED{ALREADY_FORMED}. A different LATCH never overwrites FORMED. |

- A lost answer is `UNKNOWN{writeKey}`, resolved only by exact read-back.
- **Partition-boundary guard** (rev. 1). The partition refuses every SQL write (INSERT, UPSERT, UPDATE, DELETE) to the `cluster_formation` row, by `publication_id` or `publication_kind`, whatever its origin. Only the `FORMATION_TRANSITION` applier writes it.

### 3.4 One owner, one reader (rev. 2)

| Role | Name | Mechanism |
| --- | --- | --- |
| Owner of the fact | Membership publication: `membership-publication-formation-record.js` plus the `FORMATION_TRANSITION` applier | Writers: seed founding (DECLARE, via the original right) and the publication coordinator (LATCH). **No other writer** (rev. 2). |
| The one reader | **`ServeEligibilityOwner.answerFormation()`** | `decodeFormationRecord` applied to the owner's committed publications read. The committed record comes from **two concurrent leader-required reads**, nodes and publications (`serve-eligibility-owner.js:365-376`), not one consistent cut. The formation answer comes entirely from the publications read, so it is self-consistent. |
| Placement's input | **`answerCommittedNodes().formation`** | The same value from the same record. `subscribe` (`:712-715`) fires on every change of it: `NODES_OR_FORMATION`. |
| Other consumers | `answerFormation()`, reached on the readiness service through its existing per-method delegation (`control-plane-readiness-serve-eligibility-methods.js:77-89`) under the same name | a call path, not a second implementation |

**Answer states:**
- `FORMED{clusterId, latchEpoch, declaredHostCount, formedHostIds, unit}`.
- `FORMING{clusterId, declaredHostCount, readyHostCount, missingHostCount, blockedPartitionIds, publicationEpoch}`.
- `UNDECLARED{clusterId | null}`: the read succeeded and no row exists. With no pre-release clusters (O16), this occurs only while a new seed's DECLARE right is still being transferred.
- `UNAVAILABLE{reason}`: **(rev. 3)** only before this process's first committed read that returns FORMED.

**(rev. 3) A FORMED answer is held for the life of the process.**
- FORMED is terminal for a cluster id; the write side guarantees it (§3.3).
- Once this process has read FORMED for its cluster id through a committed read, `answerFormation()` answers FORMED for the life of the process. It does **not** inherit the serve owner's lease bound (`serve-eligibility-owner.js:402-411`).
- A later read failure, or the loss of the publications leader, cannot turn it into UNAVAILABLE. Witness W3L.
- This is not a second authority. It holds a terminal committed fact, which by construction cannot go stale. Only the pre-FORMED answers (FORMING, UNDECLARED, UNAVAILABLE) follow the owner's normal freshness bound.
- A restarted process answers UNAVAILABLE until its first committed read succeeds. Its writes and DDL are refused typed, retryable, for that window.

**Consumers after the cutover:**

| Consumer | Change |
| --- | --- |
| Statement gate (writes and DDL) | §3.6 |
| Non-priority placement gate C | `FORMATION_NOT_LATCHED` until FORMED, then null. Its live census and `Math.min(NUM.THREE, …)` (`:517-545`) are deleted (O10). The 70 s fence is left to WP-F. |
| Placement owner (WP-F) | `answerCommittedNodes().formation` (P4) |
| Management facts | `cluster.formation` beside `identity` (`management-v1-owner.js:198-205`) |
| Serve eligibility | **No formation reason.** `PRIORITY_SPREAD_UNSTATED` and `PRIORITY_SPREAD_PENDING` (`serve-eligibility-record-decision.js:40-50, 122-130, 174-183`) are deleted and not replaced. Reads route while FORMING. |
| `/readyz` and the shared lifecycle state | **Not a formation consumer.** Deleted: the HARD `PRIORITY_CONTROL_PLANE_RECOVERY` dependency (`bootstrap-readiness-snapshot-evaluator.js:348-357`; `bootstrap-readiness-lifecycle-source.js:159-200`), its entries in `BOOTSTRAP_JOIN_NON_BLOCKING_REASONS`, `BOOTSTRAP_INIT_PRIORITY_BYPASS_REASONS` with the recovery-reason set, `METADATA_PUBLICATION_ALLOWED_CONTROL_READY_REASONS`, and the ready-signal rewrite. `/readyz` then means "this node can serve". `docs/bootstrap-readiness-probes.md:31-38` is reconciled. The reason constant stays where the repair meaning emits it. |

**Deleted, not disabled:** the two serve reasons; the readiness dependency with its tolerance entries and rewrite; C's formation computation; `ClusterReadinessSignal`; `ControlPlanePublicationsOwner.removePublication`.

### 3.5 After formation, and when formation is not reached (rev. 2)

| Event | Behaviour |
| --- | --- |
| A node dies (any `D`) | FORMED stays. Reads and writes keep routing on the survivors. CREATE TABLE follows F10 (`under_replicated` NOTICE, `pgwire-protocol-handler.js:664-671`). Placement repairs. |
| A priority partition is under-spread later | Admission is unaffected; the repair meaning handles it |
| A node is added beyond `D` | Before FORMED it counts toward L2. After FORMED it is an ordinary join, and `D` caps nothing. |
| `D` is never reached | `FORMING{missingHostCount, blockedPartitionIds}` for ever, in every write/DDL refusal and in management facts. **No timeout, and no amend.** Reads keep working. Operator exits, both existing actions: (1) start the missing or a **replacement** host, since any new READY host counts; (2) if fewer hosts exist than declared, **re-found** the cluster with the correct `D` (etcd's exit). Re-founding loses no user-table data, because none can exist before FORMED (§3.6). **(rev. 3)** It does lose operator state written during FORMING (artifact payloads, service definitions, dynamic config, functions), as the hint and the runbook state. "Hosts READY but spread blocked" shows `PARTITION_UNDER_DECLARED_SPREAD`: a placement defect made visible, not an exit. |
| Third host permanently lost before FORMED, with `D = 3` | Start a replacement host. With no third machine available, re-found with `D = 1`. `D = 2` is refused, because two hosts have no majority. |
| Seed restarts during FORMING | The declaration is retained and not re-declared |
| Seed lost before FORMED | Re-found (no automatic recovery, as today; nothing user-visible is lost) |
| Seed data dir wiped and restarted | It founds a new cluster id, as today; F3a is routed |
| Cluster from a pre-release build | Outside the support envelope (founding D7, O16): refused; re-founded |

### 3.6 Write and DDL refusal before formation

- **Where.** At engine entry, inside `resolveClientStatementRefusal` (`sql-statement-ingress.js:131-141`; callers `sql-query-engine-statement-execution.js:309`, `sql-query-engine-request-dispatch.js:165, 257`). The engine passes in `answerFormation()`. **(rev. 3)** The formation check is its **own clause** in that function. It is evaluated for every statement and is not merged into the existing CLIENT-only clauses (`:100-104`).
- **Not ingress-classified.** The ingress defaults to `IN_PROCESS_OWNER` (`:67-76`), so the gate is an allowlist over resolved targets, applied to every engine statement:
  - **admitted:** every read (SELECT on user and system tables, live-query subscription); session and transaction control with no write; any write whose every resolved target is a system table (still subject to `SYSTEM_TABLE_WRITE_REFUSED` for clients);
  - **refused while not FORMED:** every INSERT, UPDATE, DELETE or UPSERT with a non-system target; every DDL; every statement whose targets cannot be resolved (fail closed).
  - The target extraction reuses routing's AST owner (P: verify in S0).
  - Rev. 2: with no pre-release clusters, no user table can exist before FORMED, so no in-process owner can be writing one.
- **Surface census.** A test enumerates every engine statement entry and proves that each passes the gate: PG wire, the admin websocket default and load lanes, request dispatch, embedded and application sessions, live query.
- **(rev. 3) State writers outside the engine.** The census also covers paths that write cluster state without going through the engine. `BackupRestoreOwner.restoreFromBackup` (`backup-restore-owner.js:301-317`) is refused before FORMED with `FORMATION_PENDING`. Any other such path S0 finds is listed and refused the same way.
- **Answer.**
  - `FORMATION_PENDING`, retryable, SQLSTATE `57P03`, added to `SQLSTATE_BY_ENGINE_ERROR_CODE` (`pgwire-result-mapper.js:136-159`).
  - Message: "cluster formation pending: 2 of 3 declared hosts ready; writes and DDL wait for formation".
  - Detail: the typed state.
  - Hint: "start the missing hosts; if fewer hosts exist than declared, re-found the cluster with the correct declared host count. Re-founding discards state written during formation: artifact payloads, service definitions, dynamic config, functions" (rev. 3; the same text goes in the runbook).
  - The admin websocket gets the same code and details. One code for the family (O9).
- **No side effects.** The gate runs before execution: no `tables` or `partitions` row, schema job or provisioning attempt for a refused statement.
- **Connections and readiness.** PG wire accepts connections, and `/readyz` is node-local, so read clients work during formation.

### 3.7 Contract-first transition record

| Item | Record |
| --- | --- |
| 1. Producer and consumer symbols | Producer: `membership-publication-formation-record.js`, the `FORMATION_TRANSITION` applier, `ORIGINAL_FORMATION_RIGHT`, `isCaughtUpVoterReadyReplica`. Reader: `ServeEligibilityOwner.answerFormation()`; `answerCommittedNodes().formation`. Removed consumers: serve eligibility and the lifecycle readiness dependency with its tolerance sets. |
| 2. Owner-defined shape | `formation_record` (a schema-declared column) and the four answer states |
| 3. Identity and generation | Cluster id; `latchEpoch` (the epoch of the satisfying publication); the command's entryId. No declaration revision (rev. 2). |
| 4. Ordering | Serialized by the publications partition's Raft log. The inputs are committed reads at the leader. Consumers may lag, never regress. |
| 5. Absent vs unavailable | UNDECLARED vs UNAVAILABLE. Both refuse writes and DDL; both admit reads. |
| 6. Durable commit | The apply of `LATCH`. DECLARE is durable first in the anchor's original allocation. |
| 7. Retained obligations | The original right across restarts; UNKNOWN resolved by read-back; settled-entryId replay |
| 8. Wake and cleanup | The §3.3 triggers. One row per cluster, never deleted, guarded at the partition boundary. |

---

## 4. Comparable systems

All quotes are from fetched pages or source (research subagent, 2026-11-17). [u] = unverified.

| System | Declared size and where persisted | Before it is reached | After formation, on member loss | Changed declaration | Never reached |
| --- | --- | --- | --- | --- | --- |
| **CockroachDB** | None. `--join` is discovery: "specify the addresses of 3-5 initial nodes", "stored in a node's data directory" ([cockroach-start](https://docs.cockroachlabs.com/docs/stable/cockroach-start)). RF default 3 ([zones](https://docs.cockroachlabs.com/docs/stable/configure-replication-zones)). | "Client connections will be accepted after this completes successfully" ([`start.go`](https://raw.githubusercontent.com/cockroachdb/cockroach/master/pkg/cli/start.go)). Init is "one-time initialization"; a repeat returns "cluster has already been initialized" ([`init.go`](https://raw.githubusercontent.com/cockroachdb/cockroach/master/pkg/server/init.go)). It does not wait for N: "the few default starting ranges have a single replica" ([replication dashboard](https://docs.cockroachlabs.com/docs/stable/ui-replication-dashboard)). | "under-replicated"; unavailable only when "a majority of a range's replicas are on nodes that are unavailable" ([troubleshooting](https://docs.cockroachlabs.com/docs/stable/cluster-setup-troubleshooting)) | `--join` may change without restart | Warns "unable to contact the other nodes"; "Add nodes to the cluster" |
| **etcd** | `--initial-cluster` "for bootstrapping" ([configuration](https://etcd.io/docs/v3.6/op-guide/configuration/)) | "A cluster bootstrap is only successful if all required members successfully start" ([failures](https://etcd.io/docs/v3.6/op-guide/failures/)) | Minority loss: "can still accept requests"; majority: "cannot accept more writes" | "…`--initial-cluster` will be ignored on subsequent runs" ([clustering](https://etcd.io/docs/v3.6/op-guide/clustering/)); "conflicting cluster ID" fails hard | "remove the data directories on all members and re-bootstrap the cluster with a new cluster-token" |
| **Kafka KRaft** | Static `controller.quorum.voters`; dynamic: VotersRecord in the bootstrap checkpoint, "the same in all of the controllers" ([KIP-853](https://cwiki.apache.org/confluence/display/KAFKA/KIP-853%3A+KRaft+Controller+Membership+Changes); [kraft ops](https://kafka.apache.org/41/operations/kraft/)) | Per feature: internal topic creation "will fail until the cluster size meets this replication factor requirement" ([broker configs](https://kafka.apache.org/41/configuration/broker-configs/)) | `UnderReplicatedPartitions`, normal 0 ([monitoring](https://kafka.apache.org/41/operations/monitoring/)) | `add-controller`; "only allow one voter change operation at a time" | Add brokers |
| **kubeadm** | None. `init` makes "a single-node local etcd"; `join --control-plane` adds a member ([kubeadm-join](https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-join/)) | Serves with one node | "may lose data and may need to be recreated from scratch" | Join or reset | [u] |
| **TiDB PD** | `--initial-cluster`, `--join` ([PD flags](https://docs.pingcap.com/tidb/stable/command-line-flags-for-pd-configuration)); `max-replicas` 3 ([PD config](https://docs.pingcap.com/tidb/stable/pd-configuration-file)) | "the total number of TiKV instances is always greater than or equal to the number of replicas" ([FAQ](https://docs.pingcap.com/tidb/stable/manage-cluster-faq)) | `miss-peer-region-count` ([daily check](https://docs.pingcap.com/tidb/stable/daily-check)) | "etcd cluster ID mismatch" | `pd-recover` `--force-new-cluster` ([pd-recover](https://docs.pingcap.com/tidb/stable/pd-recover)) |
| **Consul** (sibling's research, not re-fetched) | `bootstrap_expect` | "holds off bootstrapping until that many servers are available" ([bootstrap](https://developer.hashicorp.com/consul/docs/reference/agent/configuration-file/bootstrap)) | - | "All servers should use the same value" | [u] |
| **MongoDB** | `rs.initiate()` | Initiate: "All nodes respond"; reconfig: "A majority of voting nodes respond" ([`check_quorum_for_config_change.h`](https://raw.githubusercontent.com/mongodb/mongo/master/src/mongo/db/repl/check_quorum_for_config_change.h)) | Writes pause only for an election | - | - |

**Adopted:**
- **Declare once with the identity, then ignore the flag** (etcd, KRaft).
- **A distinct "already formed" answer** (CockroachDB).
- **All N to form, a majority afterwards** (MongoDB, etcd, Consul).
- **Report under-replication; do not refuse service for it** (CockroachDB, Kafka, PD).
- **No timeout exit** (CockroachDB, etcd, PD).
- **(rev. 2) The never-reached exit is etcd's: add the members, or re-bootstrap.** No surveyed system offers an in-place amendment of its bootstrap declaration. Kafka's dynamic quorum changes voters *after* bootstrap, which is a placement concern here, not the formation declaration.
- **One compatibility authority per release boundary** (Kafka: one voter change at a time; here, the support-envelope fence).

**Not adopted:** no surveyed system gates all statements before formation. The owner's narrowing to writes and DDL brings Lagrange close to Kafka's per-feature shape: reads work, and writes wait for the declared formation.

---

## 5. Quest proposal

### 5.1 Record (`solve/quests/formation-declared-size-latch/quest.json`; unsealed until S1 measures red; rev. 2)

```json
{
  "schema": "solve-quest/2",
  "id": "formation-declared-size-latch",
  "class": "product",
  "epic": "operation-integrity-and-reliable-formation",
  "statement": "A new cluster is founded with a declared formation size D, counted in declared hosts (NODES.host_id), given once to the founding seed and persisted with the cluster identity in the seed's write-once original allocation; D is 1 or at least 3, has no default and is never amended. Membership publication owns one durable formation record per cluster, the cluster_formation row of the control_plane_publications partition with a schema-declared formation_record column, in exactly two states, DECLARED and FORMED; DECLARED becomes FORMED exactly once, by the typed committed command FORMATION_TRANSITION applied deterministically, when a PUBLISHED and acknowledged cluster_membership publication shows at least D distinct hosts with a valid READY lease and each of the six priority control-plane partitions with caught-up voters (remove-safety floor-countable and ACTIVE) on at least V(r_p, D) of those hosts, where V(r, H) is the largest odd number not above min(r, H) and r_p is the partition's declared replication factor. FORMED is never revoked, no other write reaches the record, and no timer, bound or retry produces or removes it. ServeEligibilityOwner.answerFormation is the one reader; placement consumes it as answerCommittedNodes().formation, and the statement gate, the non-priority placement gate and management facts read answerFormation; formation is not a node readiness, /readyz or serve-eligibility dependency. Until FORMED, every statement that writes a user table, every DDL and every statement whose targets cannot be resolved is refused at the one engine gate, independent of ingress classification, with FORMATION_PENDING, SQLSTATE 57P03, carrying the typed formation state, before any schema job or metadata row exists; reads are admitted. After FORMED, node loss, under-replication and added nodes never close admission, and F10 governs CREATE TABLE. A declared size that is never reached stays FORMING with typed missing-host detail; the exits are starting hosts or re-founding. The serve reasons priority_spread_unstated and priority_spread_pending, the PRIORITY_CONTROL_PLANE_RECOVERY readiness dependency with its join, init-bypass, metadata-publication and ready-signal tolerance entries, the rebalancer spread blocker's own formation census and requirement, ClusterReadinessSignal and ControlPlanePublicationsOwner.removePublication are removed from source, tests and documentation, not disabled.",
  "doneWhen": {
    "probe": "test-receipt",
    "args": {
      "file": "solve/quests/formation-declared-size-latch/evidence/receipt.json",
      "requiredReceipts": [
        "reproducer-red-on-base",
        "reproducer-and-owned-roots-green-on-candidate",
        "single-reader-and-surface-census-zero",
        "lab-formation-latch",
        "independent-verification"
      ]
    }
  },
  "constraints": [
    {"id": "owner-decisions-carried-first", "statement": "Before any source change, the owner decision of 2026-11-11 (routability log entry 166 on origin/wip/formation-stability-20261111, quoted with its commit) and the owner decisions of 2026-11-18 are appended to this Quest's log: reads allowed and writes and DDL refused before formation; the owner's confirmed reading of entry 166 (D declared distinct hosts READY and the six priority control-plane partitions with voters on V(r_p, D) of them; other system partitions spread after the latch); the bounded three-lab-host exception for the named receipt runs; synthetic host ids in test harnesses only; one release behind founding D7's version fence with existing clusters re-founded. The F10 scope note (F10 applies after formation) is recorded with them."},
    {"id": "supersessions-recorded-first", "statement": "Before any source change, R09 records quote and supersede: formation-ready-lease-independent-of-spread's statement clause on min(3, eligible) and the published summary as 'formation complete', its constraint one-formation-fact-consumed-where-it-protects ('Its definition and its existing consumers ... are unchanged'), and its constraint readyz-one-meaning ('/readyz means the cluster has formed (the published spread)'), which becomes 'this node can serve'; the contract-first transition record (design section 3.7) is written to evidence/transition.md."},
    {"id": "release-version-fence", "statement": "This Quest ships in one release with replica-placement-admission-owner and single-voter-founding-and-odd-growth behind the one support-envelope version fence of founding D7 (placement P6), delivered by founding's WP-V, which must refuse an ABSENT cluster format revision or peer version (fail closed); S2 starts only after WP-V has landed. No per-command capability fence, compatibility reader or pre-release declaration path is added; a retained pre-release original allocation is refused by founding's typed refusal. Downgrade across this boundary is unsupported: an older binary replaying FORMATION_TRANSITION fails closed (COMMITTED_COMMAND_UNRECOGNISED) and wedges, and the runbook states it."},
    {"id": "no-timer-no-timeout", "statement": "No timeout, bound, retry count, delay or polling interval is added or changed. FORMED is committed in the first coordinator evaluation triggered by the satisfying commit (publication PUBLISHED, priority SERVICES change, NODES READY-lease commit, the DECLARE commit or leadership start); the reproducer steps named cadences as rounds and fails if any bound must expire or if FORMED waits for the 5 s driver. FORMING never expires."},
    {"id": "one-owner-one-reader", "statement": "Only the FORMATION_TRANSITION applier writes the cluster_formation row (DECLARE once from the seed's original right, LATCH once from the publication coordinator); the partition refuses every other write to it. ServeEligibilityOwner.answerFormation is the one reader and answerCommittedNodes().formation carries the same value; no gate reads priorityPartitionSummary, a live census or a min(3, n) requirement to decide formation."},
    {"id": "readiness-not-gated-by-formation", "statement": "Formation is not a lifecycle readiness, /readyz or serve-eligibility dependency. While FORMING the seed admits joiners, the joiner READY signal and metadata-publication readiness proceed, /readyz reports node-local readiness, and user-table reads route. Every node in the witness, joiners included, is mounted on the real lifecycle readiness state the probe evaluator writes; with a formation HARD dependency injected, each of the three legs (seed join projection, joiner READY signal, metadata-publication readiness) turns red."},
    {"id": "formed-held-for-process-life", "statement": "Once a process has read FORMED for its cluster id through a committed read, answerFormation answers FORMED for the life of the process and does not inherit the serve owner's lease bound; UNAVAILABLE applies only before that first read. Witness: with the control_plane_publications-p1 leader stopped after FORMED, writes stay admitted on every node."},
    {"id": "harnesses-observe-formation", "statement": "Every harness, example and scenario that today waits on /readyz as cluster formation (at least real-product-deployer-lagrange.js, examples/lab-cluster-smoke/observe-cluster.js and the routability scenario) waits instead on cluster.formation.state === FORMED from GET /management/v1/facts, through its existing wait and no second observation path."},
    {"id": "latched-monotone", "statement": "The transition table is enforced at apply; FORMED is terminal and no LATCH overwrites it; no in-memory flag substitutes for the record. A witness shows that a summary refreshed from satisfied to unsatisfied, a node death and a node added after FORMED leave reads and writes admitted."},
    {"id": "applier-discipline", "statement": "The FORMATION_TRANSITION applier validates, replays a settled entryId, re-parks on a partition reservation, counts one CDC slot at request and apply, applies the guard, and records a typed outcome under the entryId with CDC from the full row image and ENTRY_COMMITTED; a witness commits the same entryId twice."},
    {"id": "caught-up-voters-only", "statement": "The latch counts a replica only through isCaughtUpVoterReadyReplica (remove-safety floor-countable and ACTIVE; after founding, a committed ConfState voter); a SYNCING voter or a learner never counts."},
    {"id": "no-fallback-no-amend", "statement": "Unavailable, undeclared or malformed formation state refuses writes and DDL typed; nothing admits on null; there is no default D, no inference of D from replicas, topology, NODES rows or the support envelope, and no operation that declares or amends D after founding."},
    {"id": "declared-hosts-consistent", "statement": "Every test harness derives D from the same host assignment it passes to NODE_HOST_ID through one test helper; synthetic per-node host ids exist only in test-harness code and a census shows none in src, charts, examples or scripts/lab; the product requires a real declared host; the chart requires pod anti-affinity on kubernetes.io/hostname."},
    {"id": "refusal-before-side-effects-and-surface-census", "statement": "A refused statement leaves no tables or partitions row, schema job or provisioning attempt; the refusal carries FORMATION_PENDING, SQLSTATE 57P03 and the typed state on PG wire and the admin websocket, and its hint states that re-founding discards state written during formation (artifact payloads, service definitions, dynamic config, functions). The formation check is its own clause in resolveClientStatementRefusal, independent of the CLIENT-only clauses. A census proves every engine statement entry passes the gate, including statements whose ingress defaults to IN_PROCESS_OWNER, and lists every state writer outside the engine; BackupRestoreOwner.restoreFromBackup is refused before FORMED."},
    {"id": "repair-meaning-unchanged", "statement": "Readers of the live priority-partition summary for repair (remove safety, learner promotion, priority admission plan, superseded target, recovery-lane available nodes, publication recovery, nodes-p1 spread) are not changed; their consolidation belongs to the placement owner and founding Quests."},
    {"id": "sibling-constraints-honoured", "statement": "ready-means-node-can-serve, no-pre-ready-placement, remove-safety-unchanged and dead-ready-node-witnessed of formation-ready-lease-independent-of-spread hold; the DT witnesses of that Quest stay green."},
    {"id": "join-core-coupling", "statement": "Witnessed on the candidate: durable rejoin, rolling restart of a joiner and of the seed during FORMING and after FORMED, a joiner restart with a wiped data directory, five-node formation with D=5 and with D=3, single-host D=1, two nodes added to a formed three-node cluster, and a replacement host started after a host is lost before FORMED."},
    {"id": "bounded-repair-not-service-acceptance", "statement": "This Quest closes the formation-admission defect. The three-consecutive physical journey of fresh-formation-user-table-routability and the comparative setup stay with the service Quest and are recorded as the remaining service blocker."},
    {"id": "static-gates-and-ratchets", "statement": "No ratchet baseline is raised; the fallback census changes only by removed occurrences; every checker the Solver and the pre-commit hook run is clean on the change set."}
  ],
  "verificationTemplates": [
    "admission-gating",
    "formation-circularity",
    "owner-interaction",
    "recovery-replay",
    "harness-fidelity"
  ]
}
```

### 5.2 Deterministic reproducer (RED today; rev. 2)

**File:** a new `test/convergence/dt-formation-declared-size-latch.test.js`, on the sibling's frozen-time world (`formation-joint-admission-world.js`, `-rounds.js`, `-scenario.js`).
- The world runs the real readiness service, membership publication coordinator, gateway, CDC owner, heartbeat and rebalance coordinator, with per-node `clusterGates()` (`formation-joint-admission-scenario.js:115-146`) (C).
- **Write admission** is asserted through the real `resolveClientStatementRefusal` over parsed INSERT and CREATE TABLE ASTs, with the node's formation answer passed in. On the base the function takes no formation input and returns null (admit), so the assertion is tree-agnostic.
- **Join admission** is asserted through the real `evaluateBootstrapJoinProjection` (the reviewer's probe).
- Hosts are synthetic per-node ids (test harness, O15).

| Case | Setup | Assertion | Base prediction |
| --- | --- | --- | --- |
| **W1 late joiner** | D = 3; seed and j1; j2 withheld; fixpoint with no bound expiring | Writes and DDL refused `FORMATION_PENDING`; candidate: `FORMING{declared 3, ready 2, missing 1}`; reads route. Then j2 starts, and writes open in the first evaluation triggered by the satisfying commit. | **RED.** `required = min(3, 2) = 2` is met at two hosts, so writes route and CREATE TABLE founds 2 of 3. C by code; run: P. |
| **W2 seed alone** | D = 3; no joiners | as W1 | **RED.** `:576` makes the seed satisfied and serve-eligible, so the ingress admits writes. C by code. |
| **W3u flip after formation** (owner level) | PUBLISHED with a satisfied summary, then the in-place refresh to an unsatisfied one (five nodes, a holder's node leaves the eligible set) | Reads and writes stay admitted; FORMED unchanged | **RED.** The refresh (`reconcile.js:274-305`) supersedes the serve record (`record-decision.js:221-242`), so every node is NOT_ELIGIBLE. C by code; not run. |
| **W3 world** (five nodes, D = 5) | FORMED; stop a priority-voter node; its lease lapses | as W3u | RED **P** |
| **W6 join while FORMING** (rev. 3: all three legs) | D = 3; seed, then j1, then j2. **Every node, joiners included, is constructed with `readinessState` = the real lifecycle readiness state the probe evaluator writes.** Today the world passes none (`formation-joint-admission-rounds.js:125-175`; `node-joining-owner-construction.js:180`). | Asserted separately at each step: (i) the seed's join projection is ready; (ii) each joiner's READY signal passes its metadata-publication gate (`node-joining-ready-signal-readiness.js:217-267`); (iii) metadata-publication readiness allows (`traffic-readiness-utils.js:26-30`). `/readyz` is node-local ready. | Green on both trees |
| **W3L publications leader lost after FORMED** (rev. 3) | D = 3; FORMED; then stop the node leading `control_plane_publications-p1`, so committed reads of that partition fail until a new leader | Writes and DDL stay admitted on every surviving node that had read FORMED. `answerFormation()` stays FORMED past the serve owner's lease bound. | Candidate-only (the base has no latch) |
| **I1 ingress** (owner level) | Real gate, not FORMED | INSERT, UPDATE, DELETE and CREATE TABLE refused 57P03 with state, leaving no row and no job; SELECTs admitted; an unresolvable target refused; a user-table write with the ingress at its default `IN_PROCESS_OWNER` refused | **RED.** No predicate; CREATE TABLE commits rows before provisioning. C by code. |
| N1 / N2 | D = 3 all joiners / D = 1 seed alone | open / FORMED at seed READY | Green on both |
| N3 | The latch replaced by the live summary | W1, W2 and W3u red | mutation |
| N4 (rev. 2) | Apply guard removed | A second LATCH with a different epoch overwrites FORMED; the witness fails | mutation |
| N5 | A `CLUSTER_FORMATION` HARD lifecycle dependency injected | W6 red on **each** of its three legs (rev. 3) | mutation |
| N7 (rev. 3) | `answerFormation()` made to inherit the serve owner's lease bound | W3L red | mutation |
| N6 | SYNCING counted by L3 | A latch on a SYNCING third voter commits; the witness fails | mutation |

**Candidate-only witnesses (rev. 2):**
- seed restart during FORMING: no re-declare; FORMED survives a seed restart;
- a fourth node added after FORMED;
- a host lost before FORMED and a **replacement host** started: FORMED;
- the same entryId committed twice replays;
- a lost LATCH answer resolves by read-back;
- a joiner with the key refuses;
- `D = 2` is refused before any founder;
- a direct write to the `cluster_formation` row is refused at the partition;
- a configured `D` differing on seed restart produces `declarationConfigDiffers`, and the durable value governs;
- a test harness whose `D` exceeds its assigned hosts fails the consistency test;
- the synthetic-host census;
- the engine-entry surface census.

The version-fence witnesses (out-of-envelope joiner refused; pre-release declaration refused) belong to founding D7 and are cited, not duplicated.

### 5.3 Physical receipt (`lab-formation-latch`; rev. 2)

Three consecutive runs on one commit, on three lab hosts with one node each, D = 3, under the **owner's bounded exception of 2026-11-18 (O14)**:
- three lab hosts may be busy at once only for these named receipt runs;
- no bulk copies during them;
- the image is preloaded beforehand;
- everything else keeps the two-host limit (memory `lab-household-bandwidth`);
- the lab machine-coordination lock is held for the duration.

Each run:
- **Before FORMED,** a client CREATE TABLE and INSERT get 57P03 `FORMATION_PENDING`. A system-table SELECT succeeds. `/readyz` is 200 on READY nodes. The harness starts the last joiner only after observing `FORMING{ready 2}` (event-driven).
- **At FORMED,** writes open.
- **One joiner is stopped.** Reads and writes stay open on the survivors, and CREATE TABLE answers `under_replicated`.
- **The joiner is restarted.**
- **Recorded:** time to FORMED, the latching publication epoch, and ledger-leader changes.

A single-host D = 1 control run uses one lab host. The routability journey's predicates are recorded for the service Quest only.

---

## 6. Staged plan and interfaces

### 6.1 Stages

| Stage | Parallel | Depends on | Content | Gate |
| --- | --- | --- | --- | --- |
| **S0** Records and census | ∥ | - | Carry the owner decisions (2026-11-11 and 2026-11-18); R09 supersessions; `evidence/transition.md`; writable paths. Classify the 25 `src` and 65 test files referencing the priority-recovery reason or dependency. Enumerate the engine statement entries **and the state writers outside the engine** (rev. 3: at least `BackupRestoreOwner.restoreFromBackup`). Verify the AST target extractor. **(rev. 3)** Census every harness, example and scenario that reads `/readyz` as cluster formation (at least `real-product-deployer-lagrange.js:130-136`, `examples/lab-cluster-smoke/observe-cluster.js:138-142` and the routability scenario), and record their switch to `cluster.formation` from management facts. | records only |
| **S1** Reproducer and falsifier | ∥ | - | The §5.2 test, red on base, then seal. **(rev. 3)** The world mounts every node, joiners included, on the real lifecycle readiness state, so W6 and N5 reach all three legs; W3L and N7 are added. Falsifiers: the publications partition applies a typed committed command with settled-key replay and re-park; the node-local ensure creates `formation_record`. | sealed red |
| **S2** Declaration (inert) | - | S1; WP-D landed; **(rev. 3) founding's WP-V (the fail-closed release fence) landed** | Config key and validation; the original-allocation field; `ORIGINAL_FORMATION_RIGHT`; the schema column and ensure; the `DECLARE` applier; the test helper and synthetic host ids (test only); chart value and anti-affinity; management facts show the declaration | No consumer reads it; owned roots green |
| **S3** Latch and reader | - | S2 | `evaluateFormationLatch`, `isCaughtUpVoterReadyReplica`, the `LATCH` applier, the triggers, `answerFormation()`, `answerCommittedNodes().formation`, the partition-boundary guard, `resolveVoterTarget` if founding has not landed it | Candidate-only witnesses green |
| **S4** Cutover | serial, one commit | S3 | Statement gate (its own clause) and SQLSTATE mapping; the restore refusal; gate C re-point; removal of the serve reasons and of the readiness dependency with its tolerance entries and rewrite; the harness waits switched to management facts (rev. 3); deletions; docs and runbook (re-founding loss; no downgrade) | W1, W2, W3u, I1 and W6 green; N3-N6 red; sibling DT green. **One behaviour change, no dual path.** |
| **S5** Proof and landing | - | S4 | Join-core list, lab receipt (O14 exception), independent verification, `solve.js land`. **The release is cut only after placement WP-F and founding, including the D7 fence, have landed (O16).** | receipts |

### 6.2 Interface to the placement owner (P4)

- **Read:** `answerCommittedNodes().formation`, the value of `ServeEligibilityOwner.answerFormation()`. It comes from that owner's committed record (two concurrent leader-required reads; formation from the publications read alone). Placement never recomputes formation.
- **Trigger:** `subscribe` fires on every formation change (`NODES_OR_FORMATION`).
- **Waiting reason:** `FORMATION_NOT_LATCHED` is exactly `formation.state !== 'FORMED'`.
- **Admission record:** `PLACEMENT_ADMIT` carries `formationLatchEpoch`.
- **Fence:** one version fence for the release (placement P6 = founding D7). There is no capability token on either side.
- **This matches placement rev. 3 as written.** No placement change is needed.

### 6.3 Interface to the founding Quest

- **`V(r, H)`:** one definition, `resolveVoterTarget`, added by whichever Quest lands first.
- **Founding's formation-fact clause** (item 7, §2.6, its sibling-constraint clause, D4) is superseded: the formation fact is this latch with `V(r_p, D)`. Founding keeps `V(r, H_eligible)` for founding and growth.
- **One-voter founding.** With it, the latch at `D ≥ 3` waits for the PROMOTE. Once roles are projected from `ConfState`, only committed voters count.
- **Original allocation.** Both Quests change it. One release, so founding's D7 refusal covers every pre-release declaration (§3.2).
- **Order.** Latch S4 → placement WP-F → founding. The release follows all three.

### 6.4 Findings routed, not absorbed (R17)

- **Load lane.** It admits on unavailable readiness (`admin-websocket-load-lane-admission.js:141-171`).
- **`/readyz` probe.** It has a 250 ms async budget with a synchronous fallback (`bootstrap-readiness-snapshot-evaluator.js:227-246`).
- **Startup cluster-id check.** It compares the hints file with itself (F3a).
- **CONFIG overwrites.** `DynamicConfigService.set` can overwrite `cluster_id`.
- **Publication writes.** They are still an unconditional upsert (owner decision (2) of 2026-11-11).
- **Routing refusals.** A user-routing refusal maps to XX000 (P).
- **Repair readers.** They fail open on a null summary, and the live summary's eligible fallbacks remain (to WP-F and founding).
- **CREATE TABLE after FORMED with `D = 1`.** At RF 3 it commits metadata before refusing.
- **No explicit SQL function surface** exists for operator state.
- **Lifecycle phase change.** Removing the readiness dependency changes when the lifecycle phase leaves DEGRADED. The rebalancer's traffic-readiness gate reads that phase. It is witnessed in S4.

---

## 7. Owner decisions

### 7.1 Decided

| # | Decision | Ruling |
| --- | --- | --- |
| O7 | Clusters founded before this change | **Superseded by O16** (2026-11-18): existing clusters are re-founded; no old-cluster declare path is built |
| O8 | Refusal scope | Writes and DDL only; reads allowed (2026-11-18) |
| O13 | The reading of entry 166 | **Confirmed** (2026-11-18): `D` declared distinct hosts READY, and the six priority control-plane partitions with voters on `V(r_p, D)` of them; other system partitions after the latch |
| O14 | Three lab hosts for the receipt | **Bounded exception** for the named receipt runs only: no bulk copies, image preloaded; the two-host limit otherwise (2026-11-18) |
| O15 | Synthetic host ids | **Test harnesses only**; never a product default; production requires a real declared host (2026-11-18) |
| O16 | Release composition | **One release, one version fence** (founding D7); existing clusters re-founded (2026-11-18) |
| O6 | Exit when `D` is never reached | **Resolved by the no-timeout ruling and O16.** FORMING for ever; exits are a (replacement) host or re-founding. `DECLARE_FORMATION`/AMEND is **dropped** (rev. 2; reasons in the Revision 2 section). Restore rev. 1's text if the owner wants an in-place amend for convenience. |

### 7.2 Open, with recommendations

| # | Decision | Options | Recommendation |
| --- | --- | --- | --- |
| O1 | Unit of `D` | (a) declared hosts (WP-D) (b) nodes | **(a)**, with WP-D landed before S2 |
| O2 | Even `D ≥ 4` | (a) allow, `{1} ∪ [3, ∞)` (b) odd only | **(a)**, the RF schema precedent; voter sets stay odd through `V` |
| O3 | Where the record lives | (a) the `cluster_formation` row in `control_plane_publications` (b) CONFIG (c) a new table | **(a)** |
| O4 | Transition mechanism | (a) a typed committed command with the applier discipline (b) a partial conditional UPDATE | **(a)**, confirmed by the S1 falsifier |
| O5 | Configured `D` differs from durable on a seed restart | (a) durable governs, plus a diagnostic (b) refuse startup | **(a)** |
| O9 | Error vocabulary | (a) one code, 57P03, state in the detail (b) per state | **(a)** |
| O10 | Gate C before WP-F | (a) re-point it to the latch here (b) leave it to WP-F | **(a)** |
| O11 | A joiner started with the key | (a) refuse typed (b) ignore | **(a)** |
| O12 | Founding D4 | (a) moot under `V(r_p, D)` (b) keep `V(3, eligible)` | **(a)** |

## 8. Risks (not decisions)

- **Join-core coupling.** S4 removes a readiness dependency that the join path tolerated by name, and moves when writes open. It needs the full join-core list, W6 and the lab receipt. S2 and S3 are inert, so a red after S4 isolates to the cutover.
- **What ACTIVE proves about catch-up** is the replica lifecycle's marker (P). Founding's `ConfState` projection is the committed proof.
- **Latch liveness inherits publication liveness.** If membership publication never reaches PUBLISHED, the cluster stays FORMING: typed, visible, reads working.
- **`main` between the three landings.** This Quest relies on founding D7's fence for mixed-version safety. Until founding lands, `main` must not be released or upgraded in place across this boundary (S5). Development clusters are re-founded, as the owner ruled for all clusters.
- **(rev. 3) The fence is inert until WP-V.** Today a join with no envelope or no peer version is admitted (`support-envelope-owner.js:316-319`). Hence S2 depends on WP-V, and WP-V must fail closed on ABSENT.
- **(rev. 3) No downgrade.** A binary older than this release cannot replay a log containing `FORMATION_TRANSITION`: it wedges fail-closed. That is stated in the runbook, not engineered around.
- **(rev. 3) Harnesses misread `/readyz`.** Until S4 switches them, harnesses that equate `/readyz` with formation would send DDL early and get 57P03. That is the S0 census item, changed in the S4 cutover commit.
