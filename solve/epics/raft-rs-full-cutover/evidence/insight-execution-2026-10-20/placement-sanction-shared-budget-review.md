---
audience: development
documentClass: evidence
---

# Placement sanction and shared-budget review

Date: 2026-10-20. Read-only review by `subagent:release_recovery_writer`.
Source candidate: `0e9ff4fdc11152e6b4da39adb5a1046615d19be4` in
`/mnt/data/peter/projects/.worktrees/control-refusal-provenance-20261020`.
The reviewed placement, budget and promotion files have no staged or
unstaged changes. The candidate's concurrent diagnostic-only source work is
outside these files. This report is authored in the isolated witness tree
at `be93c7e5d9a76a39e76a530c93715521b2281356`.

Scope is work package C / model claim M3 of the
[approved plan](../../insight-execution-plan-2026-10-20.md): identify existing
sanction, shared-budget and membership boundaries, and the missing real-owner
witness. No source, test, design, seal or receipt is changed. No test, static
suite, lab, production or publication command was run for this review.

## Separate claim verdicts

| Claim | Source finding | Verdict |
| --- | --- | --- |
| An exact placement sanction has a durable carrier | The existing cure policy mints it, and the coordinator stamps it into the operation's first `steps_history` metadata record. Exact operation/destination identity is part of the decoded record. | Source correspondence established; no new record is needed. |
| The carrier currently enforces overflow at the receiver | The sealed carrier is deliberately decision-neutral. Its promotion evaluation is diagnostic, supplies no membership epoch and can return `MEMBERSHIP_FENCE_NOT_EVALUATED`. | Not a current enforcement claim. Historical carrier acceptance must retain this ceiling. |
| Distinct creates sharing a budget have no common serialization | Existing code serializes a budget scope, runs each distinct factory after its own budget check, persists/claims within that turn and dispatches afterward. | The blanket absence-of-serialization hypothesis is contradicted by source. This is not a complete distributed allowance proof. |
| Two actual operations cannot spend one partition allowance across lost reply/restart | Per-intent deduplication, shared create budget, partition lane, membership publication fencing, learner count/progress and physical admission are different existing boundaries. This review did not compose them in a real operation. | **UNRESOLVED**. No double-spend defect is established and no complete safety acceptance is granted. |
| Recovery progresses and resources remain bounded | Cadence and existing operation ownership remain present, but no current recovery/performance measurement was made. | **UNRESOLVED**, separately from safety. |

## Exact existing chain

1. **Policy sanction.**
   `src/rebalancer/replica-placement-cure-policy.js:384-436` recognizes the
   priority over-target spread-cure condition, reads the partition's declared
   replication factor, and mints `observedVoterCount + 1` with destination
   node and observed membership-publication epoch. It returns no sanction
   when the condition or exact record validation fails.

2. **Identity and durable origin.**
   `src/rebalancer/spread-cure-transition-authorization.js:6-27,153-186`
   defines the existing metadata carrier and the policy/coordinator field
   split. `rebalance-coordinator-operation-creation.js:775-778` stamps the
   operation after its canonical identity exists. The binding distinguishes
   absent, present and malformed bytes; it does not repair malformed input
   or create a second store.

3. **Creation admission and shared capacity.**
   `rebalance-coordinator-operation-creation.js:182-261` performs intent
   deduplication and existing workflow exclusivity.
   `rebalance-coordinator-concurrent-add-budget.js:56-96` uses a shared
   scope key. A waiter re-enters until its own factory receives a turn; a
   preceding holder's result or rejection is not the waiter's result.
   `rebalance-coordinator-concurrent-budget-gate.js:31-48` holds that turn
   through budget check, record creation and owner claim, then dispatches.
   `rebalance-coordinator-operation-creation.js:571-583` selects this path
   when `shouldEnforceConcurrentOperationBudget` requires it. These are
   existing guards to engage, not evidence that every ingress is equivalent.

4. **Partition-level conflict and policy publication.**
   `rebalance-coordinator-priority-budget-admission.js:90-174` distinguishes
   an operation's own partition lane from the cross-partition budget and
   reads authoritative operations for the critical add-like guard.
   `rebalance-coordinator-operation-creation.js:504-555` calls the existing
   entity/critical/topology gates when not consuming an already supplied
   allowed creation admission.
   `rebalance-coordinator-owner-delegation-methods.js:188-224` refuses
   unreadable or changed membership-publication epochs for epoch-bound
   plans. Unbound direct callers are explicitly a different population.
   This publication epoch is not automatically the committed Raft
   configuration or physical replica lifetime.

5. **Receiver evaluation and membership progress.**
   `partition-service-learner-promotion-count-check-methods.js:243-283`
   expressly runs the carrier evaluation only for evidence. It supplies
   no membership-publication epoch. The binding owner returns the named
   not-evaluated outcome at
   `spread-cure-transition-authorization.js:399-407`; arithmetic
   `wouldBeWithinAuthorizedBound` is explicitly insufficient without an
   honoured evaluation (`:422-433`).
   The existing receiver first evaluates its count gate at
   `partition-service-learner-promotion-methods.js:478-507`, then requests
   and revalidates progress proof using post-round-trip role, leader,
   membership epoch and term at `:517-559`. This review did not establish
   that this older receiver path is every current rs-raft promotion ingress;
   the actual membership/physical owner must be followed by the discriminator.

## Existing seals and witness ceilings

`solve/quests/critical-spread-transition-authority-carry/quest.json` is
sealed at `f2fed102a5174a806d63392eb3ad15cc9fd04e44`. Its constraints include
decision-neutrality, one evaluation, single mint and
`diagnostics-never-decide`. The stored receipt is pass, dated
2026-09-19, and the append-only log records historical landing at
2026-09-19T16:08:47Z. That is acceptance of the carrier scope. It is not
permission to turn the field into a new admission condition or to add
membership reads under the old seal.

`test/rebalancer/spread-cure-transition-authorization-production-path.test.js:1-11,247`
follows the carrier from the real planner/coordinator classes to an operation
row. Its imports at `:30-35` use mock cache/readiness and existing coordinator
fixtures. It is useful carrier correspondence; it does not include native
membership promotion, a physical target, two coordinators or restart.

`test/rebalancer/rebalance-coordinator-create-budget-intent-serialization.test.js:18-25,38-135`
uses the real workflow exclusivity and budget-lane function but a budget check
that records calls. It discriminates distinct factory/result/error
serialization. It does not consume a real one-slot durable allowance.
Its existing Quest, `movielens-create-budget-intent-serialization`, seals
that bounded contract at `95fe44441569ba9e6ce87d898316805a4da9bda4`; no
terminal entry was found in its candidate log. This report does not change
that historical state.

Existing partition-serialization, budget, storage-reservation and promotion
tests remain relevant adjacent owners. Their existence and historical
receipts are not current composed-candidate results.

## Required real-owner discriminator

Use two distinct actual ADD intents competing for one relevant partition
allowance. Record the trigger, current authoritative operation/membership
facts, selected policy sanction, permitted effect, operation/reservation
commit and exact physical target. Delay the first admission response and
restart the owner after the durable transition. Observe whether the existing
budget and partition lanes reconstruct the same remaining obligation before
the second intent can advance.

Pair the engaged positive with a semantic negative on the actual guard that
excludes the bad schedule. Include stale policy against current membership,
conflicting content under the same identity and exact-target replacement.
Preserve ADD-before-retirement prerequisites and ownership after uncertain
effects. Failed setup or a quiet receiver is not evidence that the allowance
is enforced.

If existing guards exclude the schedule, record the exact enforcing owner
and current witness. If the composed entry path exposes a defect, bound and
independently review that existing interaction before repair. Do not widen
the historically sealed diagnostic carrier, invent a parallel budget ledger
or conflate placement sanction with consensus/physical permission.
