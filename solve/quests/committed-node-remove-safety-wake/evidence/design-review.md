# R17 floor/wake: correction and bounded design review

Reviewer: `subagent:/root/independent_review`.
Source: `8b08183a7adf89f279e7816f70410e48414cc728`; rule-set revision 5.
Review date: 2026-11-06. This is a read-only construction, source-history,
contract, and retained-evidence review. No reviewer test or lab run was made.
At review, `git diff --stat -- src` was empty. The author's unrelated dirty
fixture and Quest-log work is outside this source finding.

**Disposition: confirmed production defect and corrected reviewer attribution.
Approve the bounded design below for a separately recorded implementation;
no implementation, frozen-test, Quest closure, E8, or E9 approval is given.**

## 1. Explicit correction to my earlier report

This addendum supersedes the causal statements in items 2 and 3, lines 87 and
89, of `independent-readiness-frozen-failure-review.md` (SHA-256
`4bd9483e8b0972230e0036096a0a99a65e7a121f47a76fe6e137c42340e5b1ef`).
The original report is retained unchanged.

I incorrectly said that the ordinary REPLACE wake fixture's current-lease
predicate was "unchanged and true". Standard production construction makes
that branch **false**, because its receiver has no `systemTableCache`.

* `rebalance-coordinator-lifecycle.js:349-392` gives the cache to the repository
  and constructs `OperationWorkflowOwner` with that repository, readiness
  service, and the existing time source. It does not give the workflow owner a
  cache port.
* `operation-workflow-owner-retry-registry.js:50-80` stores the repository and
  readiness service. Inspection of the owner inheritance/assignment path found
  no workflow-owner `systemTableCache` property or getter.
* `priority-publication-safety-topology.js:153-161` nevertheless reads
  `this.systemTableCache`. The optional receiver check selects `null`, and
  `isNodeActiveWithCurrentLease(null)` returns false.

The earlier reason-only fixture change still did not demonstrate a changed
lease level. That observation was insufficient to classify the remaining
failure as fixture-only. The preserved actual-lease-transition attempt now
also fails: the ordinary d3 non-vacuity anchor and ordinary e changed-level
re-evaluation remain red. Its unchanged-level and reason-only no-wake controls
pass (`inherited-owner-fixtures-first.log:174,211-213,238`). This agrees with
the broken receiver, but is not yet a real committed-owner integration proof.
The source derivation above does not claim runtime instrumentation of a live
formation process.

Same-host predecessor redness remains valid comparison evidence. It neither
waives the failure nor proves the old predicate correct.

## 2. History and the complete affected decision

Commit `58fb84e3b42b51fbef9c6e1109aacc1f0d83b719` (2026-11-03) replaced the old
readiness-denial classifier with this cache receiver and a local
`Number(...)`/`Date.now()` lease predicate. It left the old evidence-absence
name and comments. The 2026-11-05T16:17:49.748Z entry in
`serve-eligibility-committed-epoch-read/log.ndjson:65` already recorded this
floor path as an R17 residual outside the bounded F10 repair. F10 approval
did not approve or repair it.

A one-line redirect to `this.repository.systemTableCache` is **not approved**:
it would activate a projected-cache permission, caller-local coercion, and
an independent clock. Two additional reachable details matter:

1. `isVoterReadyFloorCountableReplica` first grants via
   `isVoterReadyRoutableReplica` (`priority-publication-safety-topology.js:173-180`).
   Repairing only its second branch leaves projected readiness as an alternate
   authority for the same node-floor fact.
2. `evaluateRemoveSafety` filters the floor at
   `operation-workflow-remove-safety-evaluator.js:521-528`, then returns SAFE
   at 577-582 if the source is not counted and no special handoff is required.
   Collapsing an unavailable node read to false for every node can therefore
   authorize removal. Unavailable evidence must be handled before this branch.

The evaluator applies this floor to ordinary and system **partition** REMOVE
and REPLACE sends, including STOPPING re-sends (425-505). Non-partition entity
safety has its own branch. Current caller options are `partitionId`,
`REMOVE_SAFETY_READINESS_DIMENSION`, and
`REMOVE_SAFETY_OWNER_PARTICIPATION_KIND`. Preserve their strict participation
meaning where the separate replacement/leadership guards consume them;
do not reinterpret those options as permission to use projected node liveness.

## 3. Minimal canonical node-floor repair

Keep the interaction in the existing workflow safety, readiness, semantic
projection, and retained wake owners. No supervisor, polling loop, new authority
cache, retry allowance, or threshold change is needed.

1. At the partition remove-safety decision, run/join **one**
   `controlPlaneReadinessService.readServeEligibility()` refresh and consume
   **one** `answerCommittedNodes()` answer for that evaluation. These are the
   existing public readiness-owner ports
   (`control-plane-readiness-serve-eligibility-methods.js:55-89`). The actual
   leader-required read and its timeout remain in that owner. Never obtain
   permission from NODES cache rows, a direct second gateway read, arbitrary
   method detection, or a readiness-dimension fallback.
2. After the awaited read, capture the existing workflow owner's clock once
   through `resolveTimeoutCheckNowMs()` and use that instant for every node
   examined by this decision. Call the existing pure
   `projectNodeLivenessSemantics({nodeRow, nowMs})` for those exact committed
   rows. Do not reproduce lease parsing, aliases, `Number` coercion, or platform
   clock reads in the caller. A held async read must not reuse an earlier
   pre-read time to credit a lease that expired while the read was held.
3. Make unavailable/malformed/empty committed evidence, missing referenced
   node identity, and invalid decision time an explicit named unavailable
   outcome, carried into the existing retained DEFER/retry path **before**
   floor filtering and the non-countable-source early SAFE branch. A known,
   well-formed expired/stopped node is different from an unavailable or
   malformed node observation. In particular, invalid source evidence must
   not become permission merely because the source is omitted from the count.
   Preserve the readiness owner's own retained-record policy: a failed refresh
   may leave a valid committed answer available; the caller consumes that
   answer instead of inventing a stricter or looser read-failure policy.
4. The floor's node credit has one route: accepted replica topology plus the
   canonical committed-node semantic result. Remove the projected-readiness
   OR grant and retire `isEvidenceAbsentReadinessDenial`, its old local helper,
   and its misleading comments. Keep the topology role/address checks and
   the independent minimum, replacement, leader handoff, publication, and
   peer-contact guards. A node-floor credit is not a serving permission or a
   replacement-completion permission.
5. Pass the typed evaluation context through the existing floor caller rather
   than rereading per replica. Verify one refresh/answer per evaluated floor,
   including multiple replicas on the same node, and preserve the retained
   operation identity/custody when the read becomes unavailable and recovers.

## 4. Wake and effect revalidation are part of the repair

The current wake reads `ready` plus the broken evidence-absence boolean
(`operation-workflow-replace-owner-wake.js:127-154`). It subscribes only to
planning publications and consensus (309-341). The planning handler requires
`event.ownerKey` (236-242); `subscribeServeEligibility` publishes an epoch
object, not that shape (`serve-eligibility-owner.js:469-472`). Passing the
committed-owner event to that handler would silently discard it.

Use the existing committed-owner subscription as an additional owned trigger.
It must re-enter the **same** retained deferred body and be released by the
existing shutdown lifecycle. It must not read the gateway, start another
refresh loop, supply a SAFE verdict, or treat an event epoch as permission.
The wake can synchronously sample the existing owner's published answer to
compare its semantic level; that is a trigger comparison only, never a second
authoritative reader or a saved permission for the next evaluation. The real
evaluation always performs its own owned read described above.

Use the same pure semantic projection and existing owner clock seam for the
committed-node portion of this level. Capture the clock once per level sample,
not once per node. Include typed availability and relevant semantic node
states; exclude `readAtMs`, raw renewal timestamps, publication tokens, and
generation counters as substitutes for semantic change. Otherwise every
refresh can manufacture a new level and redrive itself. Retain the strict
participation component for the separate guards that still use it.

Two source-derived coverage requirements must be resolved in implementation:

* **Actual committed notifications.** Expired-to-current lease recovery changes
  the existing serve signature even when serving remains denied for another
  reason: all denial reasons are included (143-180,475-495). But the signature
  uses the serve owner's older `Number` lease reader. A fractional future lease
  becoming a valid future lease can change canonical node `readyNow` while
  leaving that serve signature unchanged. This is an unexecuted source-derived
  notification gap, not a measured formation cause. Include canonical node
  liveness in the existing owner's notification signature if needed to make
  its committed-node consumer contract complete; do not compensate with local
  polling or a second authority. A real-owner witness must cover the changed
  semantic transition, not just a synthetic listener invocation.
* **Every waited-on peer.** Current node dependency discovery includes source,
  target, and cached service rows (114-124), whereas the safety evaluation may
  read an additional authoritative-only remaining voter. A changed lease on
  that voter must not be excluded from wake comparison. Derive complete
  dependencies from the decision's actual inputs, preserving the before-read
  level baseline and subscribe-before-recheck rule. A bounded complete
  committed-node level captured before the async decision can supply that
  baseline; it remains comparison state, never authority retained for a send.
  Do not rely solely on cached discovery to prove complete wake coverage.

Preserve the existing capture-before-evaluation ordering
(`operation-workflow-dispatch-response-reconcile.js:526-528`), subscription /
registration / recheck ordering (wake 354-371), retained turn, rerun-on-dirty,
16-run bound, and timer backstop. Also preserve the post-await removal-effect
revalidation (`operation-workflow-replace-owner.js:622-636,651-688`): a changed
or unavailable canonical level after SAFE must prevent an immediate send and
return to the owner. Do not remove this check to avoid an extra recovery turn.

## 5. Required discriminating proof and historical reconciliation

Use the actual constructed workflow owner with no injected cache alias, the
real readiness/committed owner, and a controlled authoritative boundary plus
the existing injected clock. Preserve old failing logs. Required cases are:

* Opposing positive cache/projected readiness and unavailable/expired committed
  evidence cannot credit the floor or reach the early SAFE permission.
  Positive current committed evidence is accepted through the semantic owner
  while an unrelated projection remains denied; other removal guards still
  decide whether an actual send is allowed.
* Empty, missing, malformed, sparse/ambiguous node observations and invalid
  clock/lease inputs cannot mint permission; include malformed **source**
  evidence, not only remaining peers. Preserve valid string/numeric forms
  exactly as the existing semantic owner defines them, without caller coercion.
* An authority read held across lease expiry uses the post-read captured clock.
  A valid recovery changes the owner decision and drains the same retained
  retry. Disabling the required committed subscription prevents event-driven
  progress while the existing fallback clock is frozen.
* Lease-only changes with strict participation still false must drive the
  unsafe re-evaluation anchor. Reason-only/unchanged semantic notifications do
  not grant credit. Cover an authoritative-only remaining peer absent from
  cached discovery, an unsafe changed level with zero REMOVE effects, and later
  genuinely safe progress as the positive control.
* Retain lost-wake, same-token, held-lane, change-during-run, stale/duplicate
  event, shutdown, fallback, and effect-boundary revalidation controls. Do not
  turn a failing re-evaluation assertion into a weaker no-effect-only test.

The sealed `replace-source-removal-owner/evidence-remove-safety-wake.md`
records W1-W6 and N1-N9 against `102e127c4`/`527771405`. Its explicit limits
remain applicable: modeled readiness authority, modeled lane holders, and W2
also satisfiable by the 250ms observed-progress retry. It is useful inherited
interaction proof, not present-head committed-node integration proof. Retain
its safety, lost-wake, dirty-lane, and negative-control obligations while
re-deriving the changed input under the canonical committed owner. Do not
silently delete SYSTEM_FLOOR/unsafe cells because an obsolete name is removed.

The old `formation-ledger-spread-voter-ready-readiness-closure/quest.json`
sealed a lease-zero evidence-absence carve-out and a separate five-node/GCP
60-second acceptance. Its log at line 109 explicitly ended **exhausted** on
2026-08-30, transferred later stale-actuals work to named successors, and placed
the broader five-node bar with `formation-release-handoff-closure-v4`. It did
not successfully close this current canonical committed-node interaction.

Record an explicit R09 supersession/disposition naming the old carve-out
clause, its exhausted status, commit 58fb's attempted replacement, the current
R17 gap, and the new canonical owner interaction before changing that witness.
Keep the old seal, original red evidence, and history intact. The old
lease-zero case should remain a negative under current authority; add a real
committed-current-lease progress case rather than restoring reason-code
permission. Do not mark the old Quest solved, imply its five-node gate passed,
or change the current epic's unchanged three-run E9 formation sequence.

## 6. Scope boundary and evidence ceilings

Adjacent inherited debt is visible: `priority-publication-safety-rows.js:74-98`
falls back to cached SERVICES rows on missing/failed/empty reads and merges
cached-only rows into successful reads. This addendum does **not** approve that
as authoritative replica evidence. The bounded repair above owns the
**node-liveness contribution** to the floor plus its wake/revalidation chain.
Record the SERVICES topology/read interaction separately; a claim that *all*
remove-safety inputs are now canonical or that no legacy logic remains across
the whole evaluator would be false without repairing that adjacent interaction.
Do not widen this unit silently or conceal the remaining authority debt.

No physical formation cause, CDC cause, repository-wide legacy elimination,
broader corpus disposition, or current E8/E9 acceptance follows from this
review. The author's reported frozen 8b run remains red pending its separate
same-host controls and disposition.

## 7. Exact reviewed content

All paths below are relative to the worktree; digests are SHA-256.

| Path | Digest |
| --- | --- |
| `src/rebalancer/priority-publication-safety-topology.js` | `881e2b9cd9d73b1ccb39a4d0bde11d59e979cde764dab7c304046661dd27c906` |
| `src/rebalancer/operation-workflow-replace-owner-wake.js` | `281c6fea07030f605e88dad62986d9b0de988d1eb3fee8c106bc49b342f9bb83` |
| `src/rebalancer/operation-workflow-remove-safety-evaluator.js` | `d21651083b8f91ccdd15f4d0452fac6cccecc8438d15d8b5c35a0cae4d45ad72` |
| `src/rebalancer/operation-workflow-owner-retry-registry.js` | `fd289df689dd6714b306ee9278ca37edcfdb88de84a6a3c9018359ec612e2ba3` |
| `src/rebalancer/rebalance-coordinator-lifecycle.js` | `847be9164a707bb4c99590e5c9fc874345581ae1056cce6ee353abd6bb17b095` |
| `src/control-plane/control-plane-readiness-serve-eligibility-methods.js` | `951a5d2152a25a717280cf8def3c2439bef5f5add4a107cb62fdb125b7434f88` |
| `src/control-plane/serve-eligibility-owner.js` | `02c907fd954943d524ddef6bf7191582e7f0868713d1b88aa44255e4b146b33e` |
| `src/control-plane/node-liveness-semantic-projection.js` | `2fc7221a63784562ce5f5d3746683592d874ada432917b6161e811165cd051c3` |
| `src/rebalancer/priority-publication-safety-rows.js` | `08d9a4f29bc68498c651502ca622a3ba429586fe2356ccabbdbedd0f46bd2c82` |
| `src/rebalancer/operation-workflow-replace-owner.js` | `a1ecddea660a32702ac1ce0bb34e4737957e7ecc88e0eb18b78f6d746ee135bc` |
| `src/rebalancer/operation-workflow-dispatch-response-reconcile.js` | `062902efb3d18bb5e195ce3369dbad31f4268e15d725a1622092e140f76e1bcb` |
| `src/rebalancer/operation-workflow-recovery-timeout.js` | `85bb5bf37efd73673579429860ce7c478cd4ad36b9ae7dc68e6d872a6a9b2a53` |
| `test-output/verification-20261106-partition-target/inherited-owner-fixtures-first.log` | `bf211d6ddcd1425b52a9bda029ef38a5a22e176674d661610801cafbd84b4f32` |
| `test-output/verification-20261106-partition-target/replace-owner-wake-lease-transition-attempt.patch` | `bf0bacee9e4832cd33bc618a13a4ed725d075332532b8d004d890db94ba0a05d` |
| `solve/quests/formation-ledger-spread-voter-ready-readiness-closure/quest.json` | `4a48070cb47f07f3974e5db52ae3e93fcb0ee953dbf9e3aa1c208bb202b36d8a` |
| `solve/epics/raft-rs-full-cutover/quest-records/replace-source-removal-owner/evidence-remove-safety-wake.md` | `8f2bb6cde6367c081a0a38ba27e1be670b91e70acc02b54a33d2e2f49cef3d6f` |
