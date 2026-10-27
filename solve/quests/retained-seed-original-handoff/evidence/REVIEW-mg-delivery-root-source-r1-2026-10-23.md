# Independent root source review R1 — MG source-occurrence delivery

Date: 2026-10-23. Reviewer: subagent:/root/retained_effects_review.
Quest: retained-seed-original-handoff.

## Verdict and exact scope

**REVISE.** This frozen root production draft is not approved for a source
checkpoint claiming implementation approval. There are six semantic/lifetime
findings and one measured quality finding below. This is a finite,
category-complete source review, not a runtime result or a Quest verdict.

Reviewed worktree:
 /mnt/data/peter/projects/.worktrees/mg-source-occurrence-delivery-20261023

Base: 21cfd917d8ceb2f0c1435cade117c0c44a91a03a.

The exact 27-path manifest is
MANIFEST-mg-delivery-root-source-draft-2026-10-23.json, also supplied as
/tmp/mg-delivery-root-source-draft-manifest-2026-10-23.json.
Its SHA256 is
e9fbf7cf28344d8f10bba5c0f6bb889d088d970168be22da89d7494d5b413137.
All 27 file hashes were independently checked before inspection, during static
verification, and after the review was written.

The governing contract is
CONTRACT-mg-source-occurrence-delivery-2026-10-23.md, SHA256
474182126c3c985feceadb9a1b72d7de9975e1b4c3280af52be884c6c095f383.
The approved design review is
REVIEW-mg-source-occurrence-delivery-2026-10-23.md, SHA256
2eb6a5a1243ee5efc72e0c5182e5f919fbc7d058c1404785bb3d4123ba3e597d.
References below to D mean that exact contract.

The root lane includes the source invocation/progress, topology wave, canonical
outcome/envelope, native completion, subscriber/bridge integration and the
manifest's existing CDC validator test helper. Concurrent F1 transport and F3
forwarding source was read at the seams but is not independently approved by
this review; those lanes have their own reviewers. Other unbound tests and
working-tree changes are outside this verdict. No source, test, metadata,
Quest log, commit, ref, or lab job was changed by this reviewer. This new
evidence file is the only repository write.

## Material findings

### R1 — A native proposal can outlive both charged caller scopes

Severity: high. Categories: ownership/lifetime, concurrency, retry, owner interaction.

Evidence:
- src/message-group/message-group-cdc-committed-acceptance.js:96-112
- src/message-group/message-group-proposal-routing.js:135-160,171-188
- src/topology/cdc-group-propagation-durable-delivery.js:91-100,148-175
- src/cdc/cdc-delivery-invocation.js:95-121,174-215
- src/raft/raft-rs-runtime-owner.js:966-988,1841-1851

The topology context charges the promise returned by applyCDCBatch. Inside that
promise, the local propose-and-commit operation is raced by
withinProposalDeadline. The unraced native proposal promise is not acquired
through context.ownChild or another bound MG cleanup owner before that race.
This is an actual supported native path: the runtime queues commands behind
group.tail and returns a promise, rather than always completing propose
synchronously.

Hold an existing native turn, submit durable CDC behind it, and let the
per-attempt deadline expire. The routing promise rejects; the durable call can
finish and its waiter is removed. The topology/source charged promises then
settle, although the original queued native proposal and its captured command
remain locally owned and unfinished. A later source retry may hydrate and
enqueue another copy behind the same blocked native turn. No new native
receipt is falsely minted here, but the required retained cleanup guard is
lost and repeated retries can accumulate local native work.

D:429-447 and D:460-465 explicitly distinguish response retirement from actual
local child closure. Charge the original proposal/committed-wait operation
before racing its response, and keep the relevant existing owner slot until
that raw work settles or its owner actually closes it. Do not cancel already
admitted native history, renew the old grant, or add a second dispatcher.

Required proof: hold the actual native queued proposal across the response
deadline; assert UNKNOWN, no ACK, one hydrated payload and both applicable
cleanup scopes still occupied across source nudges/tenure reset. Release the
original work, allow its late actual commit without old-caller success, and
show a new bounded invocation can then complete. Include rejection settlement
of the raw child and the uncontended RF1 positive.

### R2 — The new selected-service fence asks a different selection policy

Severity: high. Categories: admission, formation, owner interaction.

Evidence:
- src/bootstrap/shared/partition-cdc-propagation-subscriber.js:211-232,250-254
- src/partition/partition-cdc-obligation-progress.js:30-35,65-86
- src/bootstrap/shared/message-group-selection.js:266-327,329-400

The actual delivery selects through resolveOperationalMessageGroupSelectionAsync
with preferredService and reuseCapturedIngress. The new currentness getter
passes those same options to the synchronous selector, but that owner does
not consume either option. It selects the first ready leader/relay from the
service collection. The async owner explicitly honors a preferred captured
ingress service before its generic relay loop.

For example, with ready nonleader services A then B and captured preferred B,
the async call selects B, while the new getter selects A. bindTopology records
B, then its immediate scoped currentness check observes A and retires the
invocation. No object, lifetime or tenure was replaced. Every retry can repeat
this refusal. A legitimate captured formation ingress can similarly be
selected asynchronously while the synchronous readiness selection is null.
This is a newly introduced permanent veto, not proof that the selected owner
was replaced.

Consume one selection owner's exact binding/currentness decision, preserving
its approved captured-ingress policy. Do not repair this by weakening service
identity checks, accepting equal group text, or making a second selection
algorithm in the progress helper. D:824-830 and D:1009-1028 require the actual
selected owner, while F3 preserves formation ingress.

Required proof: use the real selection owner and actual subscriber factory
with two relay candidates and preferred B, plus a captured-ingress readiness
case. Delivery must engage B without an artificial replacement. Replace the
selected service object with equal group text while a child is held and prove
the old private operations are refused and no second hydration starts.

### R3 — Covered branches bypass route and requirement invalidation

Severity: high. Categories: recovery/replay, admission freshness, owner interaction.

Evidence:
- src/partition/partition-cdc-obligation-delivery.js:468-485
- src/partition/partition-cdc-obligation-progress.js:30-44,65-73,89-94
- src/cdc/cdc-propagation-progress.js:7-32,42-47,62-94
- src/topology/cdc-group-propagation-durable-delivery.js:22-45,107-123

Route refresh is reached through a new topology invocation. The source loop
skips every subscriber whose aggregate coverage is already native or
provisional. Its currentness checks cover source/subscriber objects, port,
lifetime and group text, but do not consult the captured target requirements
or their current route/lifetime binding.

A branch can therefore obtain complete provisional coverage in attempt one,
while another responsible subscriber remains uncovered. Change the first
branch's observed route or authoritative requirement population before attempt
two. The first branch is skipped, so neither its targets nor its aggregate
coverage is refreshed. When the second branch completes, the source can
release the scan using obsolete weak coverage. Changes between an earlier
branch's answer and final aggregation have the same hole. A completed native
branch also cannot acquire newly authoritative requirements merely because its
aggregate tag causes it to be skipped.

The existing refresh helper preserves omitted groups and invalidates a
provisional leaf for changed address/coordinator when called. Those are useful
rules, but they do not supply the missing invocation/final-aggregation
observation. Its route descriptor also retains only group/address/coordinator;
any stronger service/route lifetime already exposed by the routing owner is
currently discarded.

D:1010-1014 and D:1025-1033 require the captured set and observed replacement
rules before reuse and before consuming complete coverage. Add an owned
requirement/route observation for all captured branches, including skipped
ones, and invalidate or recompute derived branch coverage with the affected
leaves. Preserve the captured union on mere projection omission; do not use
an unrelated cache update as a reason to restart all progress. Keep native
historical receipts and provisional invalidation distinct as the contract
specifies. This does not authorize a new membership ledger.

Required proof: accumulate one covered branch and one uncovered branch across
budgets, then change a required route, same-text service lifetime, and an
authoritative requirement set separately. No stale tag may release the scan
or authorize ACK. Omission of an old group must keep that group owed.
An unchanged large stable set must still progress without repeating the
already proved prefix.

This is related to the project's previous projection/reuse failures, not a
novel local exception: 77a048b08bc4e7ad74159a4bfea5298627d465fe records the
fanout targetability window; fde3a0552803fed787fded2ae1b3d012a44ae18c records
per-change readiness invalidation and mid-build freshness. Those historical
fixes are inspiration for an owned freshness observation, not substitutes for
this unit's exact requirement policy.

### R4 — Canonical receipts do not distinguish the complete mixed vector

Severity: high. Categories: transport, semantic identity, owner interaction.

Evidence:
- src/cdc/cdc-delivery-outcome.js:152-203,217-244
- src/cdc/cdc-event-envelope.js:83-107
- src/message-group/message-group-cdc-committed-acceptance.js:65-90,205-219
- src/message-group/message-group-forwarding-owner-native-delivery-methods.js:55-57
- test/cdc/cdc-delivery-outcome.test.js:75-90,193-204

The waiter identity hashes every semantic member. Both receipt builders and
both canonical validators instead filter the vector to members with eventKey.
A valid mixed input is admitted by captureCdcEvents. Thus an outcome built for
[D, ordinary-A] also passes the canonical predicate for [D, ordinary-B], or for
[D] alone, provided D is unchanged. The provisional result has the same
collision. This is a direct symbolic consequence of durableCdcBindings;
no runtime demonstration is claimed.

The exact local waiter key protects local afterCommit settlement, but that key
does not cross the remote outcome boundary. The forward consumer's canonical
validation therefore cannot prove the entire vector it sent. The current
tests cover partial/duplicate durable receipts, not an omitted or changed
ordinary member in a mixed vector. D:106-109,131-143,711-713,958-960 and
989-994 require complete vector fidelity and forbid successful partial vectors.

There is also a mixed-input compatibility edge to settle explicitly: an
ordinary member without timestamp previously went through the ordinary
normalizer's producer-stamp rule
(src/message-group/message-group-service-cdc-propagation-runtime-methods.js:
315-333). In a mixed batch it now bypasses that normalizer, reaches the
whole-vector digest with timestamp undefined, and is refused. The durable
member's original stamp must never be reminted; that does not establish the
ordinary member's prior domain as invalid.

Resolve mixed-vector semantics in the existing envelope/outcome owner, keeping
the actual full command correspondence. Do not silently filter ordinary
members, invent a second identity owner, or newly strand valid mixed inputs
to hide the gap. Any response-shape or accepted-domain contract change needs
an explicit bounded design correction before source approval.

Required proof: direct/native and forwarded mixed-vector positives; omit,
append and alter an ordinary member while keeping every durable binding
unchanged; include ordinary missing-stamp compatibility and durable stamp
preservation. Each changed/partial vector must fail coverage and source ACK,
while the exact accepted vector remains deliverable.

### R5 — Grouped source mismatch is converted to a successful fallback

Severity: high. Categories: admission, transport, ownership.

Evidence:
- src/topology/cdc-group-propagation-durable-delivery.js:22-38,107-126,163-172
- src/topology/cdc-group-propagation-routing.js:160-167,236
- governing contract D:159-166

The code recognizes SOURCE_GROUP_MISMATCH, sets useGrouped false, and proceeds
with safe targets and the selected source service. A complete safe delivery
can then return canonical success and enter source ACK custody. D:159-163
instead explicitly says a grouped projection naming another source group
must retain debt and return unavailable.

This mismatch must be an explicit retaining result before native/source
effects, not a diagnostic fallbackReason on a successful result. In addition,
the current null-coalescing expression gives another grouped fallbackReason
priority over a known nonnull source-group mismatch; that must not hide the
same refusal condition. Ordinary allowed safe fallback can remain governed
by the existing policy.

Required proof: a real selected source group S with grouped projection T,
including a case where T also has another routing fallback reason. No source
proposal, target send, delivered tracking or ACK may occur. Correct the
projection back to S and show the existing source retry can engage normal
delivery. A normal configured safe-mode positive remains separate.

### R6 — A throwing cleanup notification creates an unowned rejection

Severity: medium. Categories: lifetime, timer/retry, failure settlement.

Evidence:
- src/cdc/cdc-delivery-invocation.js:147-164,174-184
- src/partition/partition-cdc-obligation-delivery.js:436-457,589-591,624-629

closeIfSettled clears the active slot and resolves cleanup, then invokes
onClosed without containment. ownChild attaches that function through a
discarded then(settled, settled) promise. If the notification throws, the
discarded tail rejects after cleanup has already reported success. When there
are no children, finish/retire can instead synchronously throw and replace
the delivery's original result. The real source notification enters the retry
scheduler; a scheduling/owner failure must not become an unhandled process
rejection or a silently lost wake.

This is an exceptional-path finding, not a claim that the normal injected
clock has already thrown in a measured run. The new helper's comment that
both settlement handlers consume rejection is insufficient because the
handlers themselves call throwing work.

Contain and report the cleanup notification through an owned terminal path.
Preserve the original delivery disposition and actual resource closure;
do not suppress the notification failure or charge a freed resource forever.
Required proof: synchronous onClosed failure after held-child fulfillment
and rejection, plus the zero-child retirement case. Assert no detached
unhandled rejection, no overwritten original refusal, explicit notification
failure and correct successor admission/one-time cleanup.

### R7 — Two changed functions add complexity debt

Severity: medium. Category: source quality.

Ordinary scoped ESLint and syntax checks pass, but a scoped explicit
complexity-12 check reports two increases introduced by this draft:

| Path / function | Exact base | Candidate |
| --- | ---: | ---: |
| src/bootstrap/shared/partition-cdc-propagation-subscriber.js:187, subscriber async callback | 13 | 19 |
| src/partition/partition-cdc-delivery.js:451, deliverCDCEventToSubscriber | 8 | 14 |

The remaining reports in the touched files are inherited and are not charged
as new defects here. The baseline values above were obtained by feeding each
exact 21cfd917 file to the same ESLint rule with its original filename. The
candidate report is /tmp/mg-delivery-root-source-review-complexity-r1.json.

Extract named semantic checks/operations or simplify the two changed
functions; do not raise a ratchet or relabel the new debt as inherited.
Recheck the final frozen source and normal hook after the semantic repairs.

## Positive source observations and limits

- Queue capacity is reserved synchronously before immutable capture/digest,
  an active equal vector receives backpressure, and native effects use
  existing ProposalQueue custody. Native receipts are registered at actual
  application and settled in an isolated afterCommit effect, with exact
  service port/lifetime/group and live parent-grant checks. The application
  transaction owner isolates unrelated effects, and rollback cannot mint the
  receipt (message-group-cdc-committed-acceptance.js:65-90,205-219;
  raft-rs-application-transaction-owner.js:23-32,60-98).
- The source's active invocation is outside its resettable lane; topology
  has an exact wave identity and a child cleanup promise. This correctly
  protects unresolved directly charged selection/subscriber/transport work
  and old finalizers, subject to R1 and R6. No ledger-debt expiry, native
  truncation, new durable receipt store or second retry cadence was added.
- The source reads a captured tail and one owed row per iteration, under the
  unchanged 256-row scheduling quantum. The continuation retains event
  binding, subscriber/owner identities, coverage and cursors, not event JSON
  or caller promises. Subscriber and target cursors advance before work,
  permitting later unfinished work after a failed prefix
  (partition-cdc-obligation-delivery.js:506-510,579-608;
  partition-cdc-obligation-progress.js:47-61;
  cdc-propagation-progress.js:50-59). R3 still limits correctness of reuse.
- Canonical outcomes reject contradictory error/defer/noHandler/status claims;
  targets use the transport-aware predicate, local source uses the local
  predicate. Provisional scan release clears all current-obligation
  optimization and does not enter ACK custody. Only complete native
  subscriber coverage reaches the unchanged acknowledgment owner
  (cdc-delivery-outcome.js:101-130,226-298;
  partition-cdc-obligation-delivery.js:477-489).
- Per-topology completion hooks are behind that subscriber's complete native
  result. Aggregate provisional scan release does not itself run a hook or
  delivered tracking. This preserves the previously reviewed per-branch
  interpretation of D:1075-1095; it does not add an unapproved global deferred
  hook phase (partition-cdc-propagation-subscriber.js:237-247;
  partition-cdc-delivery.js:508-513).
- The three production subscriber factories and seed/join bridges pass the
  private delivery context and copied producer envelope. The only bound
  test delta adds observeCdcCoverage and updates zeroTarget to the new
  composition signature; its assertions are unchanged. These are useful
  source observations, not execution proof.

## Category-complete checklist disposition

The routed verification templates and the previously supplied filled review
dossier remain the review bar. These entries consolidate overlapping checks;
a source observation is never labeled a measured pass.

| Category / checks | Evidence and disposition |
| --- | --- |
| Admission/gating A1, A6: precheck/enforcer agreement and freshness | REVISE R2/R3/R5. The exact selector disagreement is at message-group-selection.js:266-327/370-400; requirement freshness is missing before obligation-delivery.js:472/478. |
| Admission A2-A5, A7: refusal type, budget, hold release and reason | The existing CDC UNKNOWN/PROVISIONAL/BACKPRESSURE vocabulary is consumed by canonical predicates; context budget is the minimum existing delivery/transport bound (invocation.js:17-23,137,166-172). Retry remains source-owned at obligation-delivery.js:436-457. R5 must stop turning mismatch into success; latency/release behavior remains unexecuted. |
| Recovery Rv1-Rv3: live state, restart, empty population | One lane cell is reused only by exact binding and subscriber set; a new tenure loses it, while global active-child custody remains outside the lane (obligation-progress.js:38-56; obligation-delivery.js:143-152). No-subscriber is explicit at :500-503; initial source coverage is UNCOVERED, so zero remote targets still need source evidence. R1/R3 remain. |
| Recovery Rv4-Rv5: duplicate replay, absence | Owed ledger rows remain persistent authority. Only ACK apply changes delivered state; provisional release discards optimization (:482-488), missing/unknown replies remain uncovered. Native redelivery may append another actual occurrence; cache dedup is not a receipt. Rollback/restart/late-success proof remains required. |
| Owner interaction O1-O2, O7, O9: single authority and no shortcut | Canonical outcomes, native application effects, source ACK owner and private lane progress have distinct roles. R2 is a second selection interpretation; R4 loses the complete vector; R5 is a contract-forbidden fallback. No event property is consumed as progress authority. |
| Owner interaction O3-O6, O8, O10: paired proof, fresh evidence, pressure, wake and registry | R1/R3/R6 need paired cleanup/freshness/wake controls. Exact capacity and target union are visible in source, but no frozen composed runtime result or final integrated registry/metadata proof is supplied for this draft. Separate F1/F3 reviews and final interaction witnesses cannot be replaced by this root review. |
| Harness H1-H6: engagement, seam fidelity, time, fields, vacuity and live binding | The one frozen test only changes a helper and keeps assertions. R1-R6 specify missing discriminators. Prior baseline failures stay evidence of their exact native/setup cuts, not green candidate proof. No changed test, local runtime or lab job was executed here. |
| Transport T1-T5: processing, late response, shapes, bounded refusal and stubs | Canonical local and remote predicates remain distinct (outcome.js:226-260), actual outcomes survive the result wrapper, and wrong/noHandler/error answers cannot be promoted merely by ACK. R4 leaves mixed-vector correspondence incomplete. F1's exact raw-child transport and receiver behavior is separately reviewed; no transport-stub acceptance is inferred here. |
| Concurrency C1-C5: admission, TOCTOU, winner, timer interleaving and key scope | Source slot, topology slot and waiter reservation are synchronous and identity-bound (invocation.js:132-134,234; durable-delivery.js:148-162; committed-acceptance.js:65-90). Scoped contexts recheck the creating parent before and after awaits. R1 leaves an inner native race uncharged; R2/R3 make some currentness predicates wrong/incomplete. |
| Timer/lifetime S1-S5: injected clocks, role, transient state, windows and starvation | Timers use their creating owner clocks and synchronous remaining-time checks; no timer expires durable debt. Leadership/tenure gates remain at obligation-progress.js:38-44. Per-attempt budgets are unchanged; R1/R6 prevent lifetime approval. This adds response timers, not an independent periodic sweeper or crash-equivalent native reset. |
| Formation F1-F5: self-dependency, starvation, client window, budget and no bypass | Formation still depends on provisional ingress reaching later metadata, followed by actual native completion; weak coverage alone cannot ACK (obligation-delivery.js:482-489). R2 can prevent that ingress and R3 can falsely release its scan. No public startup bound or activation/cutover guard is relaxed. End-to-end formation margin is unmeasured. |
| Retry Y1-Y7: firing, frozen evidence, exits, circularity, pressure, duplicates and reset | Existing source retry and 256-row quantum remain; cursors advance fairly and covered prefix metadata is bounded by one actual requirement population. UNKNOWN remains debt, provisional clears optimization and rescans, drained resets existing backoff. R1 permits repeated native work while cleanup is open; R6 can lose the wake; R3 undermines reuse. Native late-success/replay and composed provisional-to-native progress remain future proof. |

## Static evidence and next gate

All 27 bound JavaScript files passed node --check and ordinary scoped ESLint.
The latter output is /tmp/mg-delivery-root-source-review-eslint-r1.txt.
The explicit complexity check and exact-base comparison produced R7.
No runtime, timing, native RF1/RF3, pressure, formation, startup, shutdown,
managed-split, original-cohort classification, protected activation, durable
transfer, composed two-start, full Quest, corpus, publication or merge
acceptance is claimed.

The next source review should bind a new exact manifest after the finite
repairs and independently authored counterexamples, retain this R1 history,
and inspect the final F1/root/F3 composition. Only then can an independently
approved preservation checkpoint be measured in the locked lab.
