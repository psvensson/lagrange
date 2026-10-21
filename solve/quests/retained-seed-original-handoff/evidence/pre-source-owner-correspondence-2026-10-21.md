---
audience: development
documentClass: current
---

# Original seed handoff: concrete owner correspondence

Date: 2026-10-21. Author: subagent release_recovery_writer. Product input is
`393f411ca09449898465cc3cb7320c03fba2aba8`; evidence checkpoint is
`e69db481f37ab5633d64de7b6e7345426d9286b3`. The adjacent input manifest binds
the inspected source and supporting records. This is an additive proposed
implementation contract for independent review, not source approval. No runtime,
test, sealed statement, or receipt changes accompany it.

The [public baseline](public-baseline-c6ece57ee/assessment.md) and its
[independent result review](public-baseline-c6ece57ee/independent-result-review.md)
establish the actual predecessor cut: first public startup commits a selected
ENABLE, then the selected request expires at its issued 30,000ms deadline under
the handler-clock fault; a second cold public startup first reaches
CREATE_OWNER_DEFERRED with readable, nonempty storage and no SERVICES row. The
later leadership timeout is not the first refusal. The controller's 369,850-byte
elision and unverified retained remote files remain limitations of that packet.
No original grant exists in those historical directories; they must stay HOLD.

## Decisions retained and refined

1. Completion still requires exact SERVICES **ACTIVE** handoffs and the single
   reserved CONFIG identity, followed by actual cleanup and typed
   HANDOFF_COMPLETE_SERVING_DEFERRED. STOPPED-only is not completion. The literal
   seed-restart-v2 serving proof remains separate and unchanged.
2. Cold original recovery admits only the complete intact ESTABLISHED cohort
   whose SERVICES and cluster-ID rights are all UNUSED. Any cold SUBMITTED or
   TRANSFERRED right stops before native reopening under the original grant.
   Local SERVICES contents cannot promote that HOLD to current authority.
3. The new original declaration also binds the canonical metadata birth inputs
   needed by the existing registration/activation owners: allocation timestamp,
   supported schema/catalog version, original group descriptor, original table
   and partition descriptors, and built-in meta definition identities. These
   describe the same original seed allocation; they are not a second placement
   ledger or a permission to replace an existing row. This explicit refinement
   is required because activation has metadata dependencies. It must be reviewed
   as part of this interaction before source; it cannot enter as incidental
   helper extraction.
4. The recovery path invokes a bounded set of methods on the existing owners.
   It does not call the complete registration phase, cache-hydration phase,
   ControlPlaneSetup, ordinary admin composition, or successful-bootstrap
   finalization. Fresh prospective startup uses the same original birth and
   handoff methods before continuing its existing later phases. There must not
   be a second fresh registration algorithm that skips right consumption.

## Exact allocation and issuance boundary

The producer remains the original fresh membership/storage decision plus the
seed catalog owners. The lifecycle owner stores it in existing lifecycle rows;
the canonical SERVICES founder DB is the anchor. No recovery caller can issue
it. Preparation is a new bounded interaction inside this owner, not an API
already supplied by `execute()` or the phase scheduler.

Before any bootstrap desired/option entry can schedule native creation, the
original issuer acquires the actual process/directory custody already held by
public startup and prepares the **complete** declared catalog. Infrastructure
currently starts the service reconciler before the later creation phases
(`seed-infrastructure-phase.js:193-196`, `startup-service-lifecycle-owner.js:57-74`);
therefore deferring a check until an individual create callback is insufficient.
Both queue admission and the lower native-opening boundary consume the same
private live issuance result. Existing exact-cohort reconciler and participant
recovery work remain enabled; ordinary placement drivers are not constructed.

The proposed preparation operation is synchronous, contains no await or caller
callback/logger/event emission, and refuses reentrant issuance before acquiring
another handle. It must perform these steps in one event-loop turn:

- Acquire each exact preparation DB through its existing path/format owner;
  immediately register the handle in a strongly retained, resource-only
  collection in the existing lifecycle/preparation module before any later
  throwing work. It cannot call the operation port, which constructs native
  dispatch immediately after lifecycle construction (`raft-rs-operation-port.js:
  180-225`). No native core, role callback, transport delivery, or runtime
  registration is permitted during preparation.
- Use the existing peer registry and lifecycle identity allocation, committing
  exact stamps and anchor PREPARING/member bindings with `commitDurably`.
  The constructor's plain INSERT/stamp is not itself the issuance commit.
  Every descriptor binds service kind, logical group/partition, actual peer
  mapping, replica/node, incarnation, supported build, original membership
  stamp, reserved SERVICES generation/token, and the declaration digest.
- Read back every exact member and the immutable declaration; commit anchor
  ISSUED only after all are durable. A thrown-after-COMMIT result requires exact
  readback; unknown/unreadable results confer no live opening permission.
  Per-DB FULL transactions are not a cross-DB transaction.
- Close the preparation handles through their exact owning collection before
  returning a private live opening capability. A failed close retains that
  handle, revokes native admission, and fails preparation with cleanup debt.
  Never pass an uncertain open handle to an independently constructed service.

The preparation capability binds the actual allocation instance, directory
custodian, current boot, exact handles/incarnations and immutable declaration;
it is not a serialized flag. The uninterrupted virgin issuer preserves the
original host's prior-existence observation for its first native opening;
preparing a new NEVER_OPENED lifecycle row does not turn it into a cold restart.
A cold consumer always sets `identityExisted: true`, uses durable-record
membership, and never obtains the original live first-opening capability.
The existing opening-history predicate and atomic bootstrap/ESTABLISHED commit
remain unchanged (`raft-rs-bootstrap-membership.js:107-136` and
`raft-rs-participation-gate.js:322-345`).

Cold validation is a read-only, fileMustExist pass over **all** members before
any writable/native construction. It does not call lifecycle constructors,
migrate columns, stamp old rows, or use snapshot preparation to establish
history. Both MG and partition storage formats, their peer mappings, native
hard/applied/log/configuration record requirements, current lifecycle states,
and opening-history values must pass their existing owners. Missing old grant,
partial issue, malformed format, missing member, mixed NEVER_OPENED/ESTABLISHED,
retirement, current-incarnation mismatch, foreign cluster/explicit join intent,
and any spent right remain typed HOLD. A positive local contrary SERVICES fact
may refuse; local absence is never the authority to open.

Abort/shutdown sets the live attempt closed **synchronously**, before the first
await in cleanup. Every queue admission, lower native opening, one-shot birth
submission and activation effect checks that same live attempt after intervening
awaits. Runtime retirement additionally retains its existing exact-runtime
lifecycle lane; one owner's `execute` active count is not a cohort mutex.
Synchronous preparation excludes normal JS abort callbacks only during its
turn. If implementation introduces an await, a joining cleanup barrier becomes
mandatory and requires renewed review; readback alone cannot fill that gap.

Pre-ISSUED failure preserves PREPARING/partial rows as nonauthorizing evidence.
Post-ISSUED abort cannot undo issue. Cold ISSUED plus NEVER_OPENED or a partial
ESTABLISHED cohort remains the named lost-progress HOLD. These cases are not
automatic recovery success. Failed preparation closes retain strong references
even if public startup drops its local acquisition ledger. The public ledger
does not retry unwind and returns no runtime handle; absent an actually retained
reachable owner retry, cleanup-failure progress is **retained until process
termination**, not a claimed public retry. Directory-lock retention alone is
insufficient. No new public recovery handle or generic cleanup controller is
introduced. The [serialization input](issuance-serialization-input-2026-10-21.md)
records the source basis and the missing existing APIs explicitly.

## Mutation cut and authoritative read path

Before registration, complete the actual participant release for every declared
partition, preserving old origins and committing ENABLE for previously
pre-origin cohorts. The private original-create continuation permission is
bound to the exact current handler/build/cohort; it does not replace current
control, drain, generation, membership or final OPEN checks. Use each actual
issued request deadline; do not transplant the lower fixture's 3,000ms budget.
Capture the complete exact service generation set, including **all** local CDC
fallback targets. Any unmatched target is a refusal, not an ignored map entry.

The actual SQL engine already exists before release: seed-startup-plan acquires
it through SeedRuntimeBridgeOwner. Its canonical control-plane gateway is the
authoritative read ingress. Pass that existing gateway to row/publication owners
instead of constructing another gateway or relying on BootstrapSystemTableWriter
to repair authority options. Its current read pass-through does not establish
a reachable read: MG observation supplies no frozen readAuthority, which the
CDC owner requires. The gateway's OWNER_RPC_REQUIRED path and current leader
witness must actually succeed before any result is called authoritative.
Routing availability before catalog publication remains an engaged-witness
prerequisite; dependency construction is not proof of a read.

The [lower SQL input](lower-sql-correspondence-input-2026-10-21.md) identifies
native commit/application and the post-origin local-mutation sink fence.
Options passed to bootstrap executeSQL do not necessarily reach the lower
partition. One consumed SERVICES/CONFIG right admits one actual INSERT
invocation; an uncertain answer never admits a fresh INSERT. Exact same-live
readback resolves it. The native entry identity minted below that invocation
must remain unchanged through forwarding. A fallback attempt after a lost
Raft answer must be measured and refused by each actual target's committed
origin. No CDC rewrite is justified solely by the source branch.

The following is the chosen bounded effect order. Each retained row is read
through the authoritative gateway. Unavailable, duplicate, foreign or ambiguous
rows stop the operation. An INSERT response alone is not exact-generation
handoff evidence.

| Effect and existing owner | Permission, commit and result policy | Remaining obligation |
| --- | --- | --- |
| Original MESSAGE_GROUPS descriptor; SeedRegistrationPhase | Replace blind upsert with canonical original birth reconciliation: exact declared row is accepted without write; authoritative absence allows INSERT-only original template; conflict refuses. Preserve the earlier committed MESSAGE_GROUPS prefix. | Unknown write remains this owner's debt; no overwrite or fresh timestamp on restart. |
| Declared TABLES and PARTITIONS foundation; SeedRegistrationPhase | Materialize only the original supported catalog descriptors needed by the declared cohort, before ACTIVE leader publication. Use reserved original timestamps and exact immutable-field comparison; INSERT-only absence, no broad upsert or topology rewrite. | Existing transition/generation/cleanup evidence is contrary authority and refuses. Size optimization is not completion. |
| SERVICES STOPPED births; existing MG/partition row owners | Reserve birth once at issue; durably UNUSED→SUBMITTED before the sole send. Both thrown and returned uncertain answers enter the same exact authoritative readback. Match service type, logical IDs, replica/node, reserved created_at and non-null create_attempt_token. Rebuild evidence only inside that owner. | SUBMITTED retains unknown debt. Current MG catch/weak matcher and partition's nonexact created_at match need owner-side correction; caller retry/fabricated evidence is prohibited. |
| Current-boot NODES JOINING; MembershipPublicationRuntimeOwner | Consume the real newly reserved boot incarnation and NodeService's actual resources through existing row construction and incarnation birth/CAS owner. Use the already constructed canonical gateway. Explicit JOINING is required; no heartbeat call, READY/ACTIVE node publication, lease or membership driver. | Unknown result retains existing node registration identity/debt; newer boot refuses. Do not infer currentness from a cache. |
| Built-in meta definitions/endpoints required by current endpoint evidence; existing meta definition builder and endpoint incarnation owner | Register only the existing boot-owned wasm/admin definitions and endpoint rows for the actual bound listener. Use original definition identities and the current boot endpoint owner; no generic endpoint upsert. No PG-wire desired placement/runtime is started. Authoritative same-boot endpoint and NODES evidence is projected through the sanctioned bootstrap cache applier only after real commits. | Endpoints are published metadata under JOINING, not public readiness. Projection failure prevents activation completion and retains debt; no fabricated endpointsPublished boolean. |
| Exact partition ACTIVE plus canonical leader publication; existing activation helper/row owner/lifecycle | Use the same exact registration evidence and actual registered handler in its existing lifecycle lane. STOPPED registration does not publish a leader; ACTIVE does. Therefore foundation rows above must exist and the actual leader update must be acknowledged or exactly reconciled. Require every declared partition activated, not merely a helper return. | Deferred/missing/foreign/cleanup generation is unfinished handoff. Routing repair observation is not ACTIVE authority. |
| Exact MG ACTIVE; existing MG setup/helper/row owner/lifecycle | Register the actual MessageGroupServiceHandler via its existing standalone setup. Its creation callback remains original-admission gated. Pass actual current handler, exact birth evidence and committed current-boot endpoint evidence. Use strict completion, not deferTransientFailures success. Require every declared MG activation. | Missing endpoints/current handler, unknown CAS, stale generation or retirement retains SUBMITTED. |
| Reserved CONFIG cluster_id and existing identity carriers; SeedRegistrationPhase/current identity owner | Typed authoritative read: same reserved ID is idempotent, another conflicts, unavailable is HOLD. UNUSED→SUBMITTED precedes one INSERT-only send; exact real commit/readback permits TRANSFERRED. Preserve actual durable hint/carrier acknowledgments; a scheduled hint timer is not one. | No UUID remint, upsert, guessed MATCH or v2 waiver. Unknown/absent-after-submit retains identity debt. |
| Local TRANSFERRED records; lifecycle owner | Only after exact ACTIVE handoff (SERVICES) or acknowledged same reserved identity (CONFIG). Sync exact generation update; thrown-after-commit readback is idempotent. | Cold any spent right requires independent current authority and cannot reopen under the original grant. |

The foundation/template refinement above is deliberate: the ordinary current
phase orders MESSAGE_GROUPS before SERVICES, then definitions/endpoints and
TABLES/PARTITIONS later. Replaying that whole phase would overwrite unknown
prefixes, and activating before a catalog exists could hide a zero-row leader
update. The existing registration owner must own the smaller ordered methods
and use them for both prospective fresh and retained triggers. All-UNUSED does
**not** imply any of the earlier metadata is absent. Positive prefix adoption
requires exact reserved immutable identity; mutable/foreign/uncertain state is
not silently normalized. Lost prefix answers are reconciled, never treated as
SERVICES transfer or permission for public ingress.

Excluded ordinary phase effects are updatePartitionSizes, general dynamic CONFIG
defaults, current-epoch publication, PG-wire desired/runtime placement, complete
cache hydration/CDC propagation/migration wiring, ControlPlaneSetup, membership
driver/SWIM, coordinator recovery, heartbeat/lease/dispatch, admin runtime-ready
notification, normal transaction recovery, and external transport opening.
Their absence is a stated nonserving handoff boundary; their later execution and
full serving stay with ordinary startup under its required current proof.
Existing native replay, role publication, exact-cohort service reconciliation,
and participant release are not globally disabled. Their actual possible
metadata effects must be measured against the allowed original identities;
an unclassified autonomous mutation is a failed correspondence, not an exemption.

## One startup admission decision, all real ingress consumers

The existing startup owner supplies a private admission decision to its existing
BootstrapAPI adapter **before** API initialization/listening. Prospective fresh
original allocation begins closed too. Recovery never opens it. Successful
ordinary fresh startup may open it only at the existing later readiness/handoff
boundary after all original rights have transferred; shutdown closes it
synchronously. No HTTP payload, ready snapshot, SQL availability or phase value
can grant it. Consumers request its current result; they do not copy a boolean
into independent policy.

| Actual ingress/effect | Required consumer check |
| --- | --- |
| BootstrapRequestOwner | Refuse before capacity/admission lease, assignment reservation, membership/node effects; recheck at the actual effect after async conflict/readiness work. A pre-await ready snapshot cannot survive closure. |
| ServiceRegistrationHandoffOwner | Refuse valid register-service before assignment/handoff mutation and at actual SERVICES submission after awaits. Its SQL-present check is insufficient. Unsupported node-registration/MOVE requests are not proof. |
| BootstrapAPI assignment sweep | Do not start mutation-capable assignment reconciliation while admission is closed; an already scheduled callback checks the same owner before terminal/publication writes. This is the API owner's existing scheduler, not a new retry algorithm. |
| Request Cell HTTP/admin dispatch | Gate the API route and the actual dispatch attempt after authentication/routing awaits using the same owner; retain existing cancellation/shutdown. Reject a real valid intent as nonserving, not authentication failure/404 or a fake route. Ordinary admin runtime composition is not acquired in the recovery path. |
| External MessageRouter dispatch | Existing externalAdmissionEnabled guards IDENTIFY only; it is not sufficient for SERVICE_MESSAGE. Gate actual external captured-delivery invocation before handler effect using transport-owned connection provenance, including previously adopted/outgoing connections. Wire sourceNodeId is not an internal-work credential. Keep genuine local registered delivery/native exact-cohort protocol operational. |
| readiness/health/bootstrap-ready/cluster-state | Consume the same closed decision after async observation; return explicit nonready/nonjoinable state even with real SQL and active internal replicas. Liveness may remain alive. Do not publish join candidates from a recovery snapshot. |

This does not add a global per-request topology read. It is a single startup
admission boundary with consumers at real existing sinks. Exact callback/current
handler checks remain separate. A request already past an earlier check must
not cross later closure; final synchronous check and effect claim belong to the
same existing sink owner. The current identity-only transport gate is a source
finding, not an executed exploit or a license to suppress legitimate consensus.

## Public completion and resource custody

The existing bootstrap failure/result mapping must preserve an owned typed
primary error plus immutable committed-handoff observation instead of reducing
it to a new Error(message). startSeedNode throws that owned error before ordinary
runtime composition. `runStartupWithCleanup` then performs actual API/service
cleanup and releases exclusive custody only on success. It rethrows the primary
or aggregates it with the existing ledger's first cleanup error. No ad-hoc result
union reaches bindDataDirectoryProcessOwner, which expects a real runtime.

The handoff observation identifies allocation, every exact transferred birth,
reserved identity and still-missing serving proof. It cannot assert cleanup
success until the real owners close. Unknown physical work/close retains its
exact resource in its existing owner, even if ordinary publication has already
committed. No directory deletion, promise mutation, direct native close shortcut
or public recovery object is added. The retained-handle collection is neither
allocation authority nor proof of eventual progress after the public ledger has
unwound. Full serving and the named cold partial/mid-handoff obligations remain
unfulfilled.

## Required witness implementation and controlled negatives

The existing frozen baseline remains unchanged evidence. Before production
approval, independently review the exact next witness bytes and the proposed
owner API shapes against the following discriminators:

1. Actual cold public positive: issue the real complete original allocation on
   first startup, reach real selected ENABLE, use the actual issued 30s deadline,
   preserve and close. Second cold public startup must select the new owned
   recovery outcome from readonly facts, preserve old origins, commit remaining
   ENABLEs, execute the exact mutation/activation cut, transfer all rights,
   remain publicly closed, return typed deferred after cleanup, and independently
   reread exact durable rows/identity. No fabricated grant/membership/permission.
2. Lower authoritative read and uncertainty: actual canonical gateway read before
   original row publication; lose real native SERVICES answers (both MG and
   partition row owners), including thrown delivery; prove one INSERT invocation,
   attempted local fallback refusal at every captured target, exact readback,
   ACTIVE and discharge. CONFIG uses its real commit and same-value readback.
   Tests must distinguish readAuthority/routing setup failure from semantic red.
3. Prefix and activation: real MESSAGE_GROUPS prefix, each required foundation
   prefix and a lost prefix answer; no blind upsert/remint. Missing/current-boot
   endpoint, replaced handler, exact foreign created_at/token, cleanup status,
   zero-row leader update, unavailable gateway and transient activation cannot
   produce completion. Positive evidence must include all declared members.
4. Issuance/custody: no native entry before complete ISSUE; fault each durable
   member/anchor cut, thrown-after-COMMIT, abort before/after issue, failed exact
   close, and attempted queued creation after shutdown. Cold incomplete issue,
   ISSUE+NEVER_OPENED and missing/retired member refuse before opening. Real owner
   close retry is distinct from public-ledger retry, which does not exist.
5. Public effects: use real valid bootstrap/register-service requests and current
   ready internal state; race closure after an await; positively invoke API sweep
   and real transport dispatch with captured external provenance. The Request
   Cell/admin valid-dispatch control must use existing real binding/handler
   setup, not fabricated admission. If the nonserving original catalog cannot
   yet supply that control, report the precise witness prerequisite and obtain
   review before claiming that coverage; a route-level refusal alone is not the
   sealed semantic negative.
6. Separate same-live lost-answer progress from cold SUBMITTED-before-send,
   after-INSERT-before-transfer and after-transfer HOLD. In every cold spent
   case require zero original native reopening. Existing old ungranted baseline
   stores and literal v2 isolated restart remain refused.
7. Freeze exact oracles before isolated source-only treatments of issuance
   admission, right consumption, current generation, public dispatch fence and
   lost-answer continuation. Each negative must fail its named semantic assertion
   after positive engagement, on the same locked host/retry0 as its exact positive.
   Hook rejection, unavailable native setup and generic timeout are not kills.

Safety, bounded all-UNUSED recovery progress, public exclusion, physical custody
and performance remain separate verdicts. This note requests independent
correspondence judgment; it does not mark these proposed discriminators green,
waive any unresolved corpus failure, authorize a timeout/baseline increase, or
approve U1/TX1/FreshMG, activation generally, a release, main or publication.
