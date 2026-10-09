---
audience: development
documentClass: current
---

# Issued membership action: historical outcome before reissue

Owner interaction: existing operation repository -> existing native runtime /
committed-context owner -> existing application and snapshot owners.
Parent: message-group-fresh-identity-membership. Author continuation prepared
2026-10-09 against 8ece20f70392314ceba49e4e787b800bc14d07d6.
Status: bounded decoder, coherent durable-store acquisition and native-history witness; NOT an activated route,
independent approval, sealed-acceptance change, or complete recovery protocol.

## The measured problem

The same unanswered ADD can have two different native histories. The retained
entry can commit under a later leader term, or an isolated minority suffix can
be overwritten. Therefore STALE_LEADERSHIP, lost reply, or current absence do
not alone establish whether the logical action happened. Execution fencing is
necessary, but is not historical outcome observation.

Use existing owners. Do not refresh an issued permit in place, infer release
from a socket closure, or introduce another workflow/receipt coordinator.
The ordinary settlement / membership obligation / physical cleanup / storage
reservation separation and J1 forward recovery remain unchanged.

## Transition table

| Trigger/evidence | Action allowed now | Authority and remaining obligation |
| --- | --- | --- |
| Exact committed and durably applied action context recovered | Report the historical group/action/index/term | Native application truth; repository recording must still use its exact conditional update |
| Matching entry retained above commit or applied progress | Report UNRESOLVED | Keep original membership debt; no new execution permission |
| No retained matching context, including snapshot-covered history | Report UNRESOLVED | Absence of evidence is not cancellation or permission to reissue |
| Invalid acquisition envelope at the durable-store owner, or failed context decoder | Report UNAVAILABLE | Obtain owner evidence again; never downgrade to proved absence |
| Historical ADD followed by committed REMOVE | Keep historical ADD evidence historical | Current join descriptor and CREATE owner separately refuse obsolete materialization |
| New leader/runtime, original outcome unresolved | Observe original action, not execute stale permit | New attempts remain blocked until ordered fencing/noncommitment is established |

## Implemented bounded component

`observeRetainedMembershipAction` is a subordinate function in the existing
`raft-rs-committed-membership-context.js` owner. It is not a new read service or
public operation-port method. Its pure context/scalar checks are not a complete
log consistency validator. The existing RaftRsDurableStore.observeMembershipAction
owns acquisition for this purpose: it selects only its requested group through
its own connection, in one read-only SQL transaction. A preexisting transaction
is refused so an uncommitted local view cannot supply durable evidence.

That owner checks applied <= commit, the snapshot cut <= applied, no committed
progress beyond the snapshot plus retained suffix, contiguous post-cut indexes,
and nonregressing post-cut terms no higher than current term. A snapshot may
cover a missing prefix; no unexplained post-cut gap is accepted. These are the
specific consistency prerequisites of this historical reader, not a new Raft
protocol validator, a proof of authentic disk contents, or a check of every
configuration/identity invariant. Direct decoder calls still require coherent
same-group owner evidence. Neither a caller-supplied record nor its group label
is authenticated by the pure function.

The original action is the codec's exact six-field tuple: operationId,
transitionIdentity, permitSequence, stage, replicaIdentity, peerId. The group
is bound by the native owner querying its own record, not by the tuple alone.
Canonical encoding/decoding and permanent peer derivation are reused.

A positive observation requires an actual matching configuration-change entry,
with a canonical index no higher than durable applied and committed progress.
It reports the original entry's term, which may be older than the current term.
There is no requirement that the obsolete execution permit become executable
again just to recover that historical fact.

Raw entries at or below an installed snapshot cut are excluded. They cannot
impersonate the installed image's action provenance even when residual log
bytes still exist. Missing covered provenance remains unresolved until the
snapshot/application owner supplies a supported retained representation.

The result is frozen data. It grants neither current learner eligibility,
physical CREATE, cancellation, promotion, membership-lane release, nor a
successor attempt. There is no production caller/registration in this increment.
Its current scan is over retained entries; it is not an approved indefinitely
repeated full-log scan in the production reconciliation loop.

## Still required before enabling the route

1. The store now owns coherent acquisition. Connect it only where the actual
   native owner requires retained-log evidence; do not add an alternative
   fallback to the separately planned committed-learner-origin path. Expose the
   selected outcome observation through the existing semantic port. Do not pass raw
   database/core objects or caller-controlled records over the boundary.
2. Preserve the exact action provenance with existing committed application
   state and checkpoints before allowing its necessary log evidence to be
   pruned. Test real install/reopen/compaction, not just an empty projected log.
   The representation and its ownership need review before schema changes.
3. Record exact recovered evidence through the existing repository conditional
   mutation. Match original action and current holder; preserve ordinary
   terminal membership debt and reject wrong-action or superseded evidence.
4. Define the ordered successor-attempt path for genuinely fenced,
   noncommitted predecessors. This decoder deliberately creates no negative
   certificate and therefore authorizes no reissue. A current-term quorum
   barrier plus complete prefix/outcome reasoning may be needed; a status
   sample or local missing row is not a substitute.
5. Join actual transport dispatch, outcome response, repository transition,
   current descriptor, and CREATE CAS in one production-owner-path witness.

The initial authorization still accepts only its existing sequence-1 shape.
No change here widens that contract or invents a sequence-2 grant. The complete
FreshMG negative controls and physical two-replacement acceptance remain open.

## Proof boundary for this packet

Tests use the vendored, digest-verified Rust/WASM Raft core, the existing
DeterministicRaftRsCluster/raw Ready helpers and RaftRsDurableStore. Native
messages, elections, configuration application, log replacement and handle
reconstruction are real. Scheduling/dropped replies are explicit fixture work.

Local execution substitutes node:sqlite for better-sqlite3 through the clearly
named diagnostic adapter. The raw Ready helper is the repository's historical
low-level test driver, NOT the production operation-port/runtime Ready loop.
The evidence therefore does not establish production persistence ordering,
client reply handling, physical restart, power-loss safety, or distributed
SQL/CDC. Snapshot-cut tests intentionally project record views; they do not
install or compact a real snapshot. Canonical dependency/runner and GCP proof
remain required. No normal gate result is inferred from this diagnostic.

## 2026-10-09 package review corrections

F1: the mutation runner consumes real per-test node:test events, requires the
exact failing test plus ERR_ASSERTION and its message, and rejects setup errors,
wrong test surfaces, cancellations and skipped cases. A deliberately unrelated
failure while the designated malformed-record case passes is a negative test
of the checker itself. Ordinary TAP and the structured events are both retained.

F3: every fixture open asserts WAL and FULL; reconstruction checks closed old
SQLite resources, a freed native handle before reopen, and new database/store
objects over the same file. Native numeric handles may be reused; numerical
inequality is not the criterion. Omission mutations cover close, reopen and WAL.
This remains same-process resource reconstruction, not a process-kill claim.

F4: the mutating diagnostic invokes the existing probe guard before creating
output or writing source. Timeouts retain partial stdout/stderr and an explicit
failure before validation; finally restores the changed source. The canonical
driver is the default; --sqlite-driver diagnostic explicitly opts into the
node:sqlite adapter. Both commands refuse Solver probes.

The independent committed-origin branch was discovered at f258bade6dedde2b10b6c73d035f2b942b493b5e.
Its permanent-origin/checkpoint work is not replaced, merged or activated by
this package correction. Retained-log evidence and missing checkpoint evidence
must never become competing execution authorities. Record the integration
choice explicitly before production consumption; no receipt or reissue
permission is inferred from this component's local success.
