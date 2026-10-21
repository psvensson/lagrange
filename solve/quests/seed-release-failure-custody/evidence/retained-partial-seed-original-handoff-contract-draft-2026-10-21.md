---
audience: development
documentClass: current
---

# Original partial-seed handoff: bounded contract and witness draft

Date: 2026-10-21. Author: subagent release_recovery_writer. **Proposed owner
contract, pending independent review and a separately sealed red unit.** No
runtime/test change, new seal, receipt, execution, or implementation acceptance
is made by this document. Product input is exact candidate
`393f411ca09449898465cc3cb7320c03fba2aba8`; the adjacent inputs manifest binds
Git blobs, hashes and read ranges. Primary-tree evidence may be committed by
its owner concurrently; these product bytes are checked against the fixed SHA.

## Chosen operation and remaining larger obligation

The next unit is cold public continuation of a prospective original seed
allocation whose **entire declared local founder cohort is present with intact
ESTABLISHED native history and every registration/publication right still UNUSED**,
after the known failed release cut and before the first SERVICES submission. It completes
remaining participant release, exact SERVICES generation handoff, and the
single reserved cluster identity's CONFIG publication, while every public
serving boundary remains closed. It then closes all acquired owners through
the existing cleanup ledger and reports a typed handoff-complete/serving-deferred
result. It does not leave a new controller or a background workflow running.

This deliberately changes the next unit's proposed oracle from whole public
startup success to one complete nonserving handoff. The earlier full startup
and serving obligation remains unsatisfied. Existing seed-restart-v2 is not
superseded: no local grant, original origin, NODES count of one, or collection
of local Raft replicas supplies its missing peer/quorum proof. A later ordinary
public start must acquire actual current proof through the existing owner.
Cold restart after transfer is never reclassified as virgin storage. Cold
mid-handoff recovery with any SUBMITTED/TRANSFERRED right is a separate unresolved
extent; the original allocation is not permission to reopen in order to discover
whether SERVICES has already retired or replaced it.

Incomplete issuance, a partially opened cohort, and a consumed INSERT right
whose send cannot be proved remain explicit durable HOLD cases. This unit
proves their safe retention, not automatic progress for those additional cuts.
The operator's safety-first mandate permits this conservative bounded extent;
it does not turn these unresolved progress obligations into completion.

## One original decision, stored by the existing lifecycle owner

The current original issuer is the seed creation interaction: the startup
membership owner admits a fresh seed; the storage owner admits virgin storage;
SeedMessageGroupsPhase and SeedPartitionsPhase choose the founder catalog.
Today the queue in SeedInfrastructurePhase is volatile. Extend this same
interaction to prepare one immutable allocation before any native opening.
No caller reconstructs a grant from a filename, progress checkpoint, origin,
empty SERVICES row set, or remembered FRESH_SEED outcome.

Use the existing `_raft_rs_replica_lifecycle` storage and its durability owner,
not another database, sidecar journal, bootstrap controller, or placement table.
Proposed lifecycle columns are owner-defined canonical versioned values:

| Stored value | Meaning and sole writer |
| --- | --- |
| `seed_allocation_ref` | Allocation UUID plus canonical declaration digest, bound to this row's existing group/peer/replica/incarnation; lifecycle owner writes once under original issuance. |
| `seed_allocation_declaration` | Present only at the anchor lifecycle row; immutable version, allocation UUID, original node identity, original boot provenance, measured build digest, reserved cluster ID, complete ordered founder descriptors and exact physical incarnations. |
| `seed_allocation_issue_state` | Anchor PREPARING or ISSUED; monotonic lifecycle-owned commitment that all declared member rows were durably prepared before any native opening. |
| `seed_registration_handoff` | Exact member's reserved canonical SERVICES identity and state UNUSED, SUBMITTED, or TRANSFERRED; durable lifecycle record of unspent/uncertain/discharged original permission. |
| `seed_cluster_id_handoff` | Anchor's same reserved cluster identity and UNUSED/SUBMITTED/TRANSFERRED publication obligation; existing cluster identity issuer and lifecycle storage owner cooperate on this value. |

These are prospective fields. Missing columns or null values on old rows mean
ABSENT, never unused authority. Unsupported version, malformed canonical form,
identity conflict or unreadable row means a named closed outcome. No constructor
migration or legacy incarnation stamp can backfill the original allocation.

Choose the existing SERVICES first-founder database as the declaration anchor,
using the canonical SERVICES partition and first replica identifier, not a
new metadata file. Its identity and path are resolved by the existing catalog
and storage path owner. Each descriptor records service kind, table/group or
partition identity, original node, canonical replica identity and peers,
physical incarnation, and the reserved SERVICES generation. Replay consumes
this persisted complete declaration. Today's constants may validate a supported
catalog version but may not replace or silently expand the declaration.

The existing lifecycle owner prepares its row and stamps its exact incarnation
before the native operation port can be published. The original issuer forms
the complete declaration using those exact stamps and the existing row owners'
reserved birth identities. Write the anchor PREPARING declaration and each
member's bound reference/handoff identity through the existing SYNCED transaction
primitive. After every declared row is successfully durable, re-read them through
the owner, then commit anchor ISSUED. Only the issuer's live, branded completion
result permits the normal native opening path. Any unknown preparation commit
is reconciled by exact durable read; native entry stays blocked meanwhile.

There is no transaction across the SQLite databases. A crash before the final
ISSUED commit produces a detectably incomplete allocation and no authorized
native effect. A missing or mismatched declared member after ISSUED is also HOLD,
not a license to recreate it. The lifecycle owner retains the exact allocation
obligation; release requires an explicit reviewed lifecycle/cleanup decision,
not timeout, local TTL, absent rows, or automatic reissue. The first unit does
not implement partial-cohort repair. Metadata preparation itself owns and
closes its native connections under existing cleanup custody.

## Cold public classification and prior-existence fencing

Extend the actual startup decision owner to inspect this allocation after data
directory process custody and before classifying retained native storage as
fresh. Extend the existing `readDurableReplicaLifecycle` read-only result to
include the above allocation fields and native opening-history state. Its
inspection must use readonly/fileMustExist access; it must not construct a
lifecycle owner, create a table, migrate a row, or mint an incarnation.

The new typed decision is ORIGINAL_SEED_HANDOFF_RECOVERY. It is distinct from
FRESH_SEED, normal seed serving, and a failed seed-serving proof. It requires
all of: exact issuer/node/declaration bindings, anchor ISSUED, complete supported
cohort, exact live lifecycle incarnations, intact native records with every
member's ESTABLISHED history, every SERVICES/CONFIG right still UNUSED, and no
contrary cleanup/retirement/membership or cluster-identity evidence. Required unreadable evidence is UNAVAILABLE, not
absence. Existing explicit join intent, foreign cluster identity and contrary
established membership retain their refusal/ordinary join path; the local
allocation cannot override them.

This local decision permits only intact reopening for the original handoff,
with `identityExisted` true for every retained member. It does not permit new
GENESIS. The existing opening-history/native-record check still independently
rejects missing native records, UNKNOWN history, retired or changed incarnation,
or prior-existence conflict. Both MG and partition constructors must consume
the same lifecycle result; no service-specific history shortcut is added.
NEVER_OPENED or mixed ESTABLISHED/NEVER_OPENED cohorts remain outside the first
recovery extent even if issuance was valid. Original uninterrupted fresh opening
still follows the existing atomic bootstrap/history contract.

Cluster identity is reserved by the **existing first-seed minting responsibility**
at original allocation, once, and bound in the declaration before participation.
It is the future CONFIG cluster ID, not an extra genesis identity. Original
boot incarnation is provenance; actual restart reserves its new incarnation
through the existing owner. No caller invents MATCH from the reserved ID: local
allocation identity permits internal continuation only. Actual durable carriers
are compared and conflicts refuse. Hints absent before publication stay absent.
The literal v2 proof remains a separate serving decision.

## Internal release and exact SERVICES transfer

The existing participant-release authorization owner gains a precisely bounded
original-seed-continuation grant. It consumes a private owner-produced allocation
capability tied to the current directory/boot owner, handler, exact original
partition cohort and measured build. Required current build equals the issued
build for this first format; upgrade compatibility is outside scope. It cannot
accept a serialized caller-shaped FRESH_SEED object or operator substitute.

The same release algorithm runs for original and restart triggers. Existing
origins are retained; pre-origin cohorts receive permission only from this
validated original allocation. Their real native ENABLE must commit. Nested
control authorization is derived only for the declaration's actual control
partition and same current handler/build, with full current membership census,
current control, generation, drain and final OPEN fences unchanged. The grant
is invalid after handoff discharge or shutdown. Recovery wakes schedule work;
they confer no permission. Public default 30,000ms and the issued absolute
request deadline are unchanged. A new restart request obtains its own legitimate
budget; an expired original request is never renewed in place.

Reserve each SERVICES birth once through its existing row owner at allocation
issuance. Persist its exact `created_at` and non-null `create_attempt_token`,
bound to allocation UUID and physical incarnation, along with logical IDs,
service kind and original node. The current process-local high-water mint still
prevents in-process reuse; the persisted birth is replayed rather than reminted
on restart. Row owners must consume a branded lifecycle result, not arbitrary
`extraFields` supplied by a caller. This extends their existing registration
shape rather than adding a second row registry.

Before the sole original INSERT submission, the lifecycle owner durably changes
that member's handoff UNUSED→SUBMITTED with the exact expected generation and
identity. A failed/unknown local commit causes an exact re-read before any send.
A known committed transition grants one submission in that live invocation.
After restart SUBMITTED permits **readonly inspection only**, never an INSERT inferred
from missing SERVICES. This is the conservative ordering that prevents a lost
acknowledgement followed by row cleanup from resurrecting original create rights.

The existing row owner authoritatively reads the canonical SERVICES key. An
exact match includes service/group/partition/replica/node, reserved created_at,
create_attempt_token, and current canonical lifecycle status; a number merely
present in created_at is insufficient. Exact STOPPED is a named handoff state,
not broad admission of STOPPED rows. Rebuild process-local registration evidence
only through that exact authoritative read, then activate through the existing
lifecycle owner and actual current handler. Same-generation ACTIVE is idempotent;
cleanup, removing/retired, foreign generation, duplicate/conflicting rows and
unavailable reads refuse. No updater synthesizes a missing row and no UPSERT
changes ownership. Activation and physical effects keep existing generation CAS.

After the row owner acknowledges the exact generation's successful handoff,
record TRANSFERRED durably. A lost local response is resolved by exact state read.
If row commit/activation succeeded but this local write did not, the same
live already-admitted owner in SUBMITTED can authoritatively re-read the same
current generation and finish discharge. A cold owner is subject to the stricter
current-authority prerequisite below; this is not a cold reopen grant. Later row absence,
cleanup or replacement cannot change SUBMITTED/TRANSFERRED back to UNUSED.
The source of placement authority after transfer is SERVICES, never the old
declaration; any remaining physical cleanup stays with its exact lifecycle owner.

**Irreducible bounded HOLD:** crash after SUBMITTED is durable but before the
network/SQL send may leave no row. That is indistinguishable from committed
INSERT followed by later deletion without another authoritative history. This
proposal does not add such a history or retry that INSERT. Persisted SUBMITTED
plus the missing authoritative row yields ORIGINAL_REGISTRATION_OUTCOME_UNKNOWN,
owned by the existing row owner with the lifecycle owner retaining local debt.
An independently authorized live row owner observing the exact row permits
reconciliation; otherwise a separately
reviewed operator/cleanup decision must settle it. Ordinary timeout, restart,
cache absence and a successful cleanup return cannot clear it. Lost-after-commit
progress is proved separately from lost-before-submit HOLD.

### Breaking the authority-read cycle without a new recovery path

Four effects are different: readonly local inspection; native reconstruction;
consensus participation/real ENABLE; and a current SERVICES-authorized effect.
A local SQL snapshot is not an authoritative current SERVICES answer. Public
closure alone does not authorize the latter three effects. The first cold
recovery extent admits native reconstruction only from the unspent original
allocation: its prospective original public fence and all-member UNUSED state
must establish that no SERVICES/CONFIG mutation could have been sent under that
allocation. Every original seed registration submission must pass consumption
first, including fresh startup; no direct seed writer may evade it. Ordinary
background writers/steady-state handoff stay inactive until their existing
later boundary. The new witness must positively check this source interaction;
an observed row or any contrary durable fact stops original-only recovery.

At the known pre-registration cut, this is independent authority: the original
create issuer already allowed those exact native incarnations to participate,
and has not yet transferred their placement. Reopening them intact does not
require SERVICES to be brought up to invent that authority. Once those admitted
original owners are live, the existing authoritative row route can perform and
resolve the same live handoff without a second registration algorithm.

If any member is SUBMITTED or TRANSFERRED on cold inspection, that reasoning no
longer holds. The first unit returns ORIGINAL_HANDOFF_CURRENT_AUTHORITY_REQUIRED
before native reconstruction/participation/ENABLE under the old grant. Even an
apparently matching local persisted SERVICES row cannot erase this barrier. An
existing independently sufficient current-authority/rejoin path may act under
its own rules; otherwise the named lifecycle/row owner retains HOLD. This unit
does not add read-only consensus replay, open a restricted native core to obtain
its own permission, or assume a transferred generation still owns placement.
Cold lost-after-INSERT progress is therefore explicitly unfulfilled, not hidden
inside the same-live-owner lost-answer positive. Extending that extent requires
its own reviewed authority acquisition proof.

The same rule applies to the reserved cluster ID under SeedRegistrationPhase:
use a typed authoritative CONFIG read; same exact ID is idempotent, different ID
conflicts, unavailable/malformed/missing leader retains debt. Proved absence plus
UNUSED publication permission allows one INSERT of the reserved ID, after durable
SUBMITTED. No new UUID or UPSERT on retry. SUBMITTED+absence remains typed unknown;
exact committed same-value read permits TRANSFERRED. Required hints/carriers use
the same value and their real durable-write acknowledgment; starting a best-effort
hint timer is not discharge. Snapshot provenance remains outside this unit.

## Public admission and termination

Install a single recovery-only authority state before BootstrapAPI listens;
existing ingress owners consume it. A phase flag or SQL availability is not
that authority. The fresh prospective issuance path must also keep public
admission closed until ordinary first startup handoff, so no partial allocation
can have served before the retained recovery cut.

During recovery, refuse bootstrap requests before admission lease/node writes;
register-service before mutation; Request Cell and administrative mutation before
dispatch; external transport admission; and joinable cluster-state publication.
Ready/health/boot-ready projections must remain nonready while internal SQL/native
release is positively active. Keep required internal consensus/control transport
available. Route inventory and a final boundary recheck must prove an in-flight
public request cannot cross a shutdown/withdrawal. These are consumers of one
existing startup admission decision, not separate route policy algorithms.

Completion means all declared exact row handoffs and the reserved CONFIG identity
are TRANSFERRED, actual pre-origin releases have committed, and existing origins
are unchanged. The public path reports HANDOFF_COMPLETE_SERVING_DEFERRED and
unwinds the existing BootstrapAPI, BootstrapService and data-directory owners.
It does not enter normal steady-state startup, open external admission, advertise
ready, or mint a live serving handle. The result records committed handoff plus
separate cleanup outcome; cleanup failure retains custody and all primary errors
as already required by the failure-custody unit. A clean result is returned only
after real owner closure. Directory deletion is not part of the operation.

This typed completion is not an unqualified bootstrap success or a swallowed
failure. The public caller must expose its missing serving proof and durable
handoff result. Future ordinary public restart after actual v2 proof returns
is the serving owner's trigger. No proof is manufactured to demonstrate that
future transition; full serving remains unmeasured and outside this new seal.

## Frozen real-entry witness and semantic negatives

Before any repair, freeze a cold child-process harness that calls the actual
`startLagrangeRuntime` with a supplied retained directory. Do not reset process
claims, construct membership/cluster outcomes, force a seed role, or directly
call BootstrapService on restart. Parent/child observation and hooks must be
passive wrappers around the real owners except the named clock/delivery faults.
Use existing test helpers and canonical locked lab placement, retries0.

1. On unchanged393, the first cold child must reach the actual registered first
   non-control ENABLE; record real returned origin before advancing only the
   existing handler clock to that attempt's issued absolute deadline. Assert
   real public budget30,000ms. Preserve actual refusal, all cleanup outcomes and
   original identities. Exit/reap the real process before a second child acquires
   the directory. If setup fails earlier, retain that first divergence and resolve
   its prerequisite separately; no lower-entry substitution or fake grant.
2. The second cold public child consumes real disk/membership outcomes. On old
   source preserve its first refusal; on repaired source require actual typed
   recovery, original allocation/native identities, real pre-origin ENABLE,
   unchanged committed origin, exact row generations and CONFIG value. Successful
   internal handoff must end with typed serving-deferred plus actual clean closure.
   Reopen the retained files read-only to verify commits and discharged grants.
3. While internal native work and SQL are engaged, send real valid public bootstrap,
   register-service and routable Request Cell requests, plus relevant administrative
   entry and ready/cluster-state reads. Require typed refusal/zero irreversible
   effects. An otherwise-ready snapshot and completed phase cannot override the
   recovery authority. A missing/unsupported request is not an admission negative.
4. Drop an actual SERVICES INSERT answer after verified native commit. The same
   already-admitted live owner resolves the exact STOPPED/same-generation row and
   completes activation/discharge. Also lose the local TRANSFERRED answer and
   resolve its real commit. Keep original created_at/token/incarnation; exercise
   CONFIG same-value replay. Separately cold-stop after real INSERT and before
   local discharge, and after discharge: original-only cold entry must HOLD
   before native participation unless an existing independent current-authority
   path is genuinely available. Do not count these HOLD cases as cold progress.
5. Separately stop after local SUBMITTED but before send: no row is fabricated,
   next public start exposes the durable typed unknown and retains debt. Partial
   allocation preparation, missing declared member, mixed native history and
   unsupported version likewise HOLD without entering native opening. These are
   explicit safety results and unfulfilled progress cases.
6. Negative grants: absent legacy grant (preserve actual old-source-produced
   artifacts), wrong node/cohort/incarnation, retired member, ESTABLISHED native
   loss, unreadable/conflicting records, foreign/cleanup SERVICES generation,
   missing row after transfer, wrong cluster ID and isolated stale seed without
   v2 proof. Never reconstruct fresh permission from any of them.
7. Source-only controlled negatives in isolated diagnostic branches must remove
   the original-authority check, the public recovery fence, or the post-commit
   handoff continuation separately. Freeze oracle bytes; require each named
   semantic failure after real entry and relevant positive engagement. Static
   rejection, import failure, fixture timeout or generic setup failure is not
   a native kill. Keep normal hooks and same-host retry0 comparisons.

Every measured attempt binds exact source/test/fixture hashes, process/host and
full raw output; independently review six harness and ten owner-interaction
categories before measurement. Keep safety, bounded recovery progress, custody
and resource/performance outcomes separate. No timeout/baseline relaxation, RF3
cross-host, snapshot, full startup, U1/TX1/FreshMG or release claim is implied.

## Complete-operation accounting

Trigger: actual public cold restart of the failed original release. Facts:
current directory/boot custody, readonly complete original grant, exact lifecycle
and intact native history, current membership/identity outcomes, current release
and row facts. Effects: intact original reopen, authorized release, exact original
INSERT/activation or read-only uncertainty reconciliation. Commits: prospective
ISSUED before native opening; unchanged atomic native bootstrap/history; real
ENABLE; durable SUBMITTED before send; canonical row/CONFIG commits; exact local
TRANSFERRED. Restart: re-read owners, never renew spent authority or mint identity.
Remaining owners: lifecycle retains incomplete/native/custody debt; row/identity
owners retain unknown writes; current v2 owner retains serving proof; existing
cleanup owns actual connections and directory-lock release. No single DONE bit
or projected success discharges these distinct obligations.
