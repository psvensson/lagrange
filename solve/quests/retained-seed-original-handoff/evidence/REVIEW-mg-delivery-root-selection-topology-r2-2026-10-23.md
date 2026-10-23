# Independent review: root selection/topology source correction R2

Reviewer: `subagent:/root/mg_delivery_design`. Date: 2026-10-23.

Verdict: **APPROVE for the exact isolated R2/R3/R5/R7 source corrections below**.
No remaining blocking defect was established in this bounded delta. This is not
approval of the whole root implementation, the separate native-custody or
complete-vector semantic revisions, runtime acceptance, Quest landing, or
publication. Original root finding R4 remains a separate composition dependency.

This review read the complete original seven-finding review, the approved MG
contract, all nine frozen after-files and their finite patch, and adjacent
selection, routing, source-ledger, lifecycle and service-birth owners. No runtime,
test, production source, metadata, Quest log, commit, ref or lab job was changed.
Only this review evidence is written in this lane.

## Exact identity and evidence boundary

Worktree: `/mnt/data/peter/projects/.worktrees/mg-source-occurrence-delivery-20261023`.
Base: `21cfd917d8ceb2f0c1435cade117c0c44a91a03a`.
Bundle: `/tmp/mg-root-selection-topology-r2-20261023`.

| Artifact | SHA256 |
| --- | --- |
| R2 manifest | `094fe3b3c23d4021dc39afeea72e777c5428158fe9778104585c30cc56aa0d9c` |
| R2 NOTES | `c4c541e597ab0d19ea310c4e16601b743fe7bfb4f11a05efa0e49a578eb804dc` |
| R1-to-R2 patch | `14917e9a5e2726e0ab3a2e7d8b35f9c28ce5a0e0d31c520284d650a58614d8f7` |
| Original root R1 review | `b404fadb31060fad56944dbd4c05603f7fa8d0ecc70ff92193ef7a83d235ca7a` |
| Governing contract | `474182126c3c985feceadb9a1b72d7de9975e1b4c3280af52be884c6c095f383` |
| Approved design review | `2eb6a5a1243ee5efc72e0c5182e5f919fbc7d058c1404785bb3d4123ba3e597d` |

All nine live files independently matched their manifest hashes and frozen
`after/` copies. The before-files are the preserved root R1 bytes, HEAD for the
existing selector/routing owners, and empty bytes for the new durable-plan leaf;
this is not an approval of an unspecified whole-worktree patch.

| Path | SHA256 |
| --- | --- |
| `src/bootstrap/shared/message-group-selection.js` | `c4b6dafc4cbb39c7bc83c90cb895e7500f303ce2cd6b70e813dabf147542df7a` |
| `src/bootstrap/shared/partition-cdc-propagation-subscriber.js` | `cac24307086ab9da6dc38758fdaa507d75002891ce2f857ca7b4e188f28470f7` |
| `src/partition/partition-cdc-delivery.js` | `1789927b3c87f700998ffa77c797e6c3db23bb000d74689e1d7251c5a342d24b` |
| `src/cdc/cdc-propagation-progress.js` | `e29b62dc9abc1c88505ad815aad9a0606a65a5ed9788baee9811818411dc856e` |
| `src/partition/partition-cdc-obligation-progress.js` | `63500b9dddb7493640559d21317a0f3123bb774d3884fac4ee639f82e3829779` |
| `src/partition/partition-cdc-obligation-delivery.js` | `f3821b9850910c368ba1168fff7f8fcaf870448c5c6eec0c0c9eda4afbac7056` |
| `src/topology/cdc-group-propagation-durable-plan.js` | `63e2d39b6e73f45d48d6c2555c74404e11e0234f7d7c7174c995fd6a9ce66451` |
| `src/topology/cdc-group-propagation-durable-delivery.js` | `7e2b1d0bfd40e3de7eb996ad13b970d3cfa1594c1d3e8d78340199b5f7d5bdfd` |
| `src/topology/cdc-group-propagation-routing.js` | `60653a2a63007d6ab2f979b9d023aa8b62f6d043f8082570b32ef08385ab96c0` |

## R2: selected-service policy and currentness

The synchronous selector now consumes preferred service and captured-ingress
reuse through shared preferred-decision helpers. Both selectors retain the
existing leader, preferred, then relay ordering
(`message-group-selection.js:266-347,350-445`). This removes the concrete
preferred B versus earlier relay A disagreement in the original review.

The real subscriber factory derives one required table from its table name and
passes the same preferred/reuse options to actual async selection and its
currentness accessor (`partition-cdc-propagation-subscriber.js:192-208,230-235,
254-260`). The three production factory sites supply the captured preferred
service. The existing forwarding owner remains responsible for metadata-ingress
readiness and repair: this patch does not make a progress helper invent a second
ready flag or waive event admission. The async owner can still perform repair;
this approval does not assert that every generic multi-table async query is
identical to a synchronous query while state is changing.

After selection, source-progress currentness still compares the actual selected
service object, port and source lifetime. It does not accept a new object merely
because its group text matches. Existing captured-ingress policy is retained,
while the service's actual shutdown/replacement and parent invocation remain
fences. No new selector registry or permissive fallback was added.

## R3: re-observe covered branches and final aggregation

The new `captureDurablePropagationPlan` is a synchronous leaf of the existing
topology owner, used by both wave admission and retained-progress currentness.
`cdcPropagationProgressCurrent` now observes that plan before reuse
(`cdc-propagation-progress.js:71-85`). `topologyBindingCurrent` refreshes even a
previously covered branch and resets its derived subscriber tag when underlying
coverage is incomplete (`partition-cdc-obligation-progress.js:30-40`). The source
loop's scoped currentness runs before its covered-branch skip, and its final
aggregation explicitly re-observes first (`partition-cdc-obligation-delivery.js:
464-486`). The original short-circuit around route observation is closed.

Requirements remain a captured union. A newly exposed group is added uncovered
and invalidates weak coverage for the changed obligation set. Mere projection
omission does not delete an old group. Native receipts remain historical facts;
they do not magically cover a newly added group. Address/coordinator replacement
invalidates the affected weak leaf, and the observation also carries existing
service/replica identity, service birth, create-attempt token and node boot
incarnation when available. Missing remote metadata does not manufacture a
replacement or a foreign-clock lease.

This is consistent with `src/node/service-row-incarnation.js`: `created_at` is
the minted durable birth, while role and update timestamp are not birth identity.
The routing additions read existing SERVICES/NODES observations and do not grant
registration, activation or membership authority. Cache/tree/router object
replacement and topology initialization lifetime also fence reuse; no global
cache revision restarts otherwise stable progress.

Each outstanding target dispatch now carries the exact selected route object
(`cdc-propagation-progress.js:91-101`). Observation rechecks currentness first;
a provisional answer from an old route cannot cover its replacement. A canonical
native answer for the captured group can remain a historical fact. Required-set
growth during an await is handled by the next observation and cannot produce a
complete aggregate while a new leaf is uncovered. The cursor advances before
work and retains the stable covered prefix, so an ordinary retry need not replay
every prior target within one response budget.

The cell still contains metadata, current tags, cursors and owner references,
not event bodies, timers, caller promises or another ledger. The one active wave
and serial dispatch window are unchanged. There is no new total payload/fanout
cap or timer-based expiry of durable debt.

## R5: contradictory grouped source is a refusal

`captureDurablePropagationPlan` gives a positive grouped source mismatch priority
over another fallback reason. `propagateDurableCdcEvent` returns the existing
retaining UNKNOWN result before binding/applying source work or sending a target
(`cdc-group-propagation-durable-delivery.js:145-154`). A later mismatch discovered
through retained-progress observation invalidates reuse instead of being turned
into a successful fallback. Allowed aligned-source conservative fallback still
uses the existing routing policy.

This addresses both original R5 cases: a direct S-versus-T mismatch, and the same
mismatch accompanied by missing coordinator/address/router diagnostics. Config
and publication-mode diagnostics are not native proposal, delivered tracking or
ACK authority.

## R7: remove the introduced complexity increases

The named table-admission, readiness, outcome-consumption and capture helpers
preserve the source refusal/result behavior while reducing the subscriber and
partition delivery functions below the explicit complexity-12 threshold. The
subscriber's provisional predicate now receives the actual selected group,
matching the committed predicate.

The preserved author reports contain normal scoped ESLint/syntax/whitespace
success. Their explicit comparison has eight over-limit reports before and six
after; the two R1-introduced findings are removed, and the async selector drops
from 25 to 21. The remaining six are inherited. No baseline was increased. This
review inspected the structural extraction and report evidence; it did not turn
those author statics into a measured semantic pass or re-run application tests.

## Systematic context, proof still required, and composition

I inspected the cited history. `77a048b08bc4e7ad74159a4bfea5298627d465fe`
documents the fanout targetability window and existing authoritative catch-up
owner. `fde3a0552803fed787fded2ae1b3d012a44ae18c` documents per-change freshness
and mid-build invalidation. This delta uses those ownership lessons: preserve
requirements when projection is absent, and observe relevant changes before
reusing a result. Neither historical green tests nor commit prose proves these
new exact bytes.

Required paired proof remains:

| Scenario | Required discriminator |
| --- | --- |
| Preferred relay B with earlier relay A; captured ingress temporarily lacks published readiness | Actual selector and subscriber engage B; no false replacement refusal. |
| Replace/retire selected service while its child is held | Old private operations refuse; equal group text does not renew them or allow duplicate hydration. |
| One covered and one uncovered subscriber across budgets | Separately change address, coordinator, same-text service birth, node boot and required population; stale coverage cannot release scan or ACK. |
| Change a route during target await | Old weak answer cannot install on new route; exact native group fact remains distinct. |
| Omit a captured group, then restore its route | Its obligation remains owed throughout. |
| Stable finite population spanning several budgets | Cursor progress completes without repeatedly replaying the covered prefix or adding a total-population cap. |
| S-versus-T grouped source, with and without another fallback failure | Zero source proposal, target send, delivered tracking or ACK; correcting back to S permits a normal retry. |
| Root R4 full-vector API | Every derived coverage check receives the exact cell binding; changed/partial ordinary siblings cannot reuse an otherwise identical durable tag. |

The last row is deliberately a dependency. Both new calls pass `cell.binding`
to the agreed `cdcCoverageState(coverages, expectedDigest)` API, but the R4
semantic implementation is authored/reviewed separately. This source approval
does not establish its behavior or approve a composed checkpoint using older
outcome semantics. Native raw cleanup and notification settlement have their own
exact review; F1/F3 retain their separate source and runtime gates.

The existing S2 witness pins the exact `buildSafeTargets` object shape. The new
observational route fields therefore require an explicit candidate fixture
adaptation: preserve its group/address/coordinator assertions and additionally
assert the selected service/node identity fields. Dropping fields from comparison
or loosening the route assertion would hide the interaction under review. This
known source-bound fixture premise is not a measured regression or a reason to
remove the lifetime observation; no test adaptation is approved or executed by
this source review.

The full original category pass was considered: admission/freshness, recovery,
owner interaction, concurrency, transport, retry/timer custody, formation and
harness fidelity have no additional blocking delta here. There is still no
measured native RF1/RF3, S2/W7, original-cohort classification, protected
activation, durable-transfer, composed two-start, full Quest, publication or
merge acceptance. Final integrated source review and exact-source locked-lab
proof remain necessary.
