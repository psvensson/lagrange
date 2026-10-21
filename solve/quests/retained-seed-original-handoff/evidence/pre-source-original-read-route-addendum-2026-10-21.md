---
audience: development
documentClass: current
---

# Original handoff: pre-registration authoritative read routing

Date: 2026-10-21. Author: subagent release_recovery_writer. Product remains
`393f411ca09449898465cc3cb7320c03fba2aba8`; source/test bytes are unchanged.
This adds a concrete missing owner interaction to the frozen
[correspondence proposal](pre-source-owner-correspondence-2026-10-21.md)
(SHA256 `2136902dd5418ba26b7735219ef0dd6942a0fb27f40835ca1f12d9c829459d17`).
It preserves that version and requires independent review before production.

## Source finding and scope consequence

The existing early SQL engine's gateway supplies the correct frozen
readAuthority ingress, but the current query route cannot select an unpublished
original replica merely because that engine exists. QueryExecutor gets candidate
SERVICES rows from its overlay/cache
(`query-executor-partition-routing-snapshot.js:171-215`) and refuses a non-ACTIVE
or unaddressed row before its internal-readiness lane
(`query-executor-partition-service-resolution.js:126-147`). Neither a valid
grant nor its actual live service has an existing consumer in that selection.
The [MG source input](message-group-correspondence-input-2026-10-21.md) also
identifies the BootstrapSystemTableWriter pass-through/readAuthority gap and
the owner-side reserved-birth/uncertain-answer changes.

Thus this is an actual missing **routing input contract**, not merely a slow
test setup or proof that current native readback is reachable. Publishing
synthetic ACTIVE SERVICES, hydrating a pretend cache/overlay, borrowing ordinary
ControlPlaneSetup, or reading SQLite directly would not resolve it correctly.
An ordinary routing call must still require its existing authoritative
SERVICES/readiness evidence. A current native leader witness proves neither
original allocation permission nor v2 serving/quorum eligibility.

## Chosen bounded input to the existing routing owner

The existing query routing owner remains the sole selector and executor. It
gains one privately issued original-live-cohort read input, supplied by the
existing allocation/lifecycle owner **after** actual all-member native release.
Both prospective fresh startup and admitted retained startup use this same
selection/dispatch algorithm. It is an alternative source of admitted exact
endpoint facts for this operation, not a second SQL/read implementation.

The input carries only the exact current original operation, declaration/build,
allowed system-table/partition identities, captured service generation and
registered handler/endpoint identity. It must be unforgeably associated with
the original live operation; setting a public options field, copying a frozen
plain object, supplying sourceNodeId or sending a wire token is insufficient.
The normal read-authority contract still comes from gateway ingress, remains
frozen and structurally propagated, and requests OWNER_RPC_REQUIRED plus current
leader authority. Its original-handoff extent is recognized only when the
existing owner validates the private association. No generic caller can choose
that extent by naming a purpose or a routing dimension.

The allowed read set is the exact canonical keys required by the already
specified handoff: original MESSAGE_GROUPS/catalog/definition rows, each reserved
SERVICES birth, current node/endpoint rows, and the reserved CONFIG cluster ID.
Their existing owners construct the actual read statements and keys. No caller
gets a general SQL or mutation capability. A declaration containing a table
does not automatically authorize arbitrary queries against it. An unclassified
read remains unavailable until its owner/shape is explicitly included and
reviewed; this cannot become a universal bootstrap routing flag.

Inside QueryExecutor, this input produces a separately typed candidate whose
authority is original-live-allocation, not an object pretending to be an ACTIVE
SERVICES row. The ordinary row-based candidate remains unchanged. Both converge
on the same real query RPC transport and existing leader-read witness validator
(`cdc-integration-service-owner-rpc-read-execution.js:356-470`, especially
`:65-83`). Candidate address/replica identity comes from the actual captured
current registered handler and the existing address owner, not row synthesis.
Missing/dead/replaced service or handler, changed lifecycle incarnation, abort,
shutdown, unsupported build, invalid original permission, nonlocal declaration
or target outside the admitted cohort refuses before delivery.

Validation occurs at selection, again after every intervening await before
actual delivery, and at the existing serving/read owner against the exact
captured generation. A stale pending read must not select a same-name successor.
Response acceptance revalidates the operation/generation and the genuine leader
witness; withdrawal during the read cannot produce a handoff grant. A selected
leader changing role follows the existing canonical failure path. Neither an
empty result nor a timeout refreshes the input or changes a handoff right.

This input is process-local and limited to already admitted, already open exact
original services. It cannot authorize cold opening, genesis, mutation, public
dispatch, new placement or later restart. Completing one member's SERVICES
handoff does not authorize replacement or a different runtime through this
input. Any remaining live read must still be by the same admitted operation and
current exact lifecycle/handler; normal current-authority rules govern a later
operation. Terminal handoff or shutdown revokes the whole input synchronously.
Cold SUBMITTED/TRANSFERRED remains a pre-native HOLD even if a local row looks
like the expected generation. The input is never persisted as a competing
current-authority record.

The current connected-peer overlay reseed is not the original-cohort input and
must not silently run as its substitute. The original-only read extent returns
its own explicit unavailable/refused outcome when the bound endpoint is missing.
It may not fabricate a peer, an ACTIVE row, fresh created_at timestamps, or a
singleton heuristic to pass normal routing. This choice changes only the
original handoff read's candidate provenance, not the ordinary route's existing
recovery behavior.

## Concrete API consumers and final local delivery

The following are proposed owner methods/shapes, not currently implemented APIs.
They refine the interaction above without exporting raw stores, native cores or
another public bootstrap surface.

| Owner boundary | Proposed operation and precise returned meaning |
| --- | --- |
| Lifecycle/allocation owner → existing seed registration owner | `bindOriginalHandoffRead({liveAttempt, tableName, canonicalKey})` validates the original live admission and returns a frozen private-associated read context. The context binds allocation/current boot/build, fixed canonical SELECT shape and parameters, allowed exact partition, and request deadline/cancellation from the existing query budget. It conveys read contact only, never INSERT permission. Unsupported read shape refuses. |
| Existing registration owner → existing SQL gateway | `readAuthoritativeRows` receives that context through a named owner option. Gateway ingress constructs its normal frozen OWNER_RPC_REQUIRED/REQUIRED-leader token and associates that exact token with the validated context; a copied token or caller-supplied purpose has no association. Read coalescing identity includes the live original operation and exact generation extent, so an ordinary read or later operation cannot share privileged routing/results accidentally. |
| QueryExecutor candidate selection | Consume the context and the original cohort owner's exact live service view, requiring one current eligible leader for this partition. Zero or contradictory leader observations refuse; never choose a guessed singleton or highest term. Produce an original-allocation candidate with actual address, node/replica, native incarnation, exact handler and the observed leader term. Do not feed a synthetic SERVICES row through `evaluatePartitionServiceRoutability`, install an overlay, or weaken ordinary ACTIVE admission. |
| QueryExecutor delivery → existing MessageRouter | Pass the validated exact-local read context as local-only delivery metadata, outside the wire payload. The router verifies current operation, local node, exact registered callback and target before choosing its existing `deliverLocal`. No network/MG transport fallback or redirect is permitted for this context. Missing local handler is a typed unavailable outcome, not `deliverLocal`'s ordinary remote fallback. The ordinary query transport algorithm is unchanged for unassociated reads. |
| Actual partition handler → existing QUERY/read implementation | The local-only second invocation argument carries the owner-validated read context with actual `captureLocalDelivery` provenance. The partition handler validates its captured service/incarnation/callback and carries the private context through canonical payload extraction to the existing `handleRemoteQuery`/`executeQuery` call. Before statement preparation/collection, the owning validator checks current lifetime/deadline, read-only statement/key, same service/incarnation/handler and current required leader. It never accepts this context from a wire field or from the SQL text. Existing removal-serving and statement admission remain mandatory. |
| Actual answer → CDC → row owner | Require normal successful owner-RPC result and leader witness, plus serving node/replica matching the exact selected endpoint, unchanged expected physical generation, and current operation. Compare the actual observed leader term/role at selection, immediate read and response; a changed or unavailable observation refuses this read rather than proving a stale result current. Row owner then independently matches reserved birth/token/value before any handoff transition. |

The source basis for the local-only choice is explicit. Ordinary
`resolveDeliveryOutcome` routes QUERY through the MG query transport when one
is selected (`message-router-delivery-pressure-routing.js:331-355`); therefore
it is **not** enough to assume every same-node query already takes a direct
path. The new private context is a bounded input to that existing transport
selection owner. Its selected operation is the existing registered local
delivery, not direct DB access or a second SELECT implementation.
`deliverLocal` currently captures the handler and invokes it with
`captureLocalDelivery()` (`message-router-delivery-behaviors.js:106-133`);
the connection owner binds that value to the actual router boot/lifetime
(`message-router-connection-authority.js:122-130`). The currently dropped second
argument must be carried through the existing partition handler for this
context; the current QUERY wire payload does **not** carry readAuthority.
Do not claim that caller options already provide a sink check.

The private association is an ephemeral capability owned by the same live
original interaction, not a pending-operation ledger. It has no durable history,
current-name lookup, retry algorithm or authority inferred from its existence.
It cannot cross serialization. A wire reconstruction, unknown incoming
delivery, remote peer or unrelated local request cannot obtain it. Captured
local provenance alone is also insufficient: the original operation association
and exact allowed statement/target must both validate. In-process arbitrary
trusted JavaScript/intrinsic replacement is not newly claimed as an adversary;
the existing genuine SQL/network/service mutation boundaries remain protected.

The read itself has the existing bounded SELECT path
(`partition-service-write-metrics-base.js:99-128`): no new asynchronous database
reader is introduced. Place the final owned check after earlier await/callback
boundaries and immediately before the read's prepare/collection; retain existing
result limits/cancellation. A deadline cancels this read only. It cannot revert
durable SUBMITTED, retire a resource, or extend the original release deadline.
Neither a follower answer nor a well-formed leader witness from a different
same-partition replica satisfies the exact candidate binding. No v2/read-index/
cross-host linearizability claim follows from this local bounded witness.

## Activation auxiliary effects are not completion evidence

The first proposal's strict activation requirement does not mean treating the
whole current partition helper as a passive ACTIVE call. That helper invokes
`settlePartitionServiceActiveAdmission` after ACTIVE
(`partition-service-activation.js:299-315`). The settlement can reassert role/
leader and await denied-routing repair; diagnostic errors do not fail it
(`:87-126`). Those downstream convergence effects are outside this handoff's
original metadata cut and cannot certify the row update.

Choose an explicit original-handoff invocation of the same activation owner
which performs the existing exact lifecycle ACTIVE CAS and canonical leader
publication, then returns their actual owned acknowledgments/authoritative
readback. Factor that existing bounded activation from subsequent ordinary
convergence observation; do not change ordinary callers' behavior or pass a
blanket ignore-errors flag. The nonserving invocation does not call the later
reassertion/readiness-repair operations. It requires the exact PARTITIONS
foundation row and verifies its leader publication through the admitted live
read route. A zero-row update, unrelated generation or uncertain result is HOLD,
not one counted activation. Only exact acknowledged ACTIVE plus required leader
publication can permit that member's TRANSFERRED. MG similarly keeps strict
count/all-member checking and does not count a transiently deferred call.

These are precise additional effect boundaries, not a change to the sealed
ACTIVE requirement. The ordinary post-ACTIVE routing-repair obligation remains
with ordinary startup after its proper serving prerequisites. Test the cut by
observing the actual ACTIVE/leader mutations and proving the downstream
readiness repair is not entered in original handoff; keep ordinary helper
regressions engaged to prevent accidentally disabling its existing work.

## Actual proof and explicit stop boundary

Before accepting the new input, freeze a witness that reaches the existing
public startup/recovery operation with real allocation and release. Keep the
SERVICES/catalog projections genuinely unpublished at the selected first read.
Require the exact canonical gateway to execute a real registered read, receive
the actual native leader witness and authoritative absence, then perform the
permitted original INSERT once. A successful read after a fixture has installed
fake ACTIVE rows or forced a local SQL branch is not this positive.

Separate real-owner negatives must cover no original association, forged/copy
of the options object, wrong key or partition, stale captured object and exact
handler replacement, invalid build/incarnation, abort between selection and
delivery, withdrawal before response consumption, and a follower/malformed
leader witness. Preserve an ordinary non-ACTIVE row refusal with no original
association. Mutations and unrelated/public queries cannot use this input.
Lost native INSERT answers still require actual same-live exact readback and
the lower origin fence; routing permission does not settle a write outcome.

This refinement is necessary to break the specific read-before-registration
cycle without inventing current SERVICES authority. It is not approved source,
executed availability or a weakening of the ACTIVE completion requirement.
The complete input schema/lifetime and next frozen witness require the same
independent category-complete review as the other pre-source decisions. If
their actual ingress cannot carry these checks, retain the first typed
unavailable boundary and resolve that owner's concrete prerequisite before
production; do not claim the earlier public baseline proves this new route.
