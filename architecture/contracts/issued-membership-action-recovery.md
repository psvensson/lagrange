---
audience: development
documentClass: current
---

# Issued membership action: historical outcome before reissue

Owner interaction: existing operation repository -> existing native runtime /
committed-context owner -> existing application and snapshot owners.
Parent: message-group-fresh-identity-membership. Author continuation prepared
2026-10-09 against 8ece20f70392314ceba49e4e787b800bc14d07d6.
Status: bounded decoder and native-history witness; NOT an activated route,
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
| Invalid/incoherent record or failed decoder | Report UNAVAILABLE | Obtain owner evidence again; never downgrade to proved absence |
| Historical ADD followed by committed REMOVE | Keep historical ADD evidence historical | Current join descriptor and CREATE owner separately refuse obsolete materialization |
| New leader/runtime, original outcome unresolved | Observe original action, not execute stale permit | New attempts remain blocked until ordered fencing/noncommitment is established |

## Implemented bounded component

`observeRetainedMembershipAction` is a subordinate function in the existing
`raft-rs-committed-membership-context.js` owner. It is not a new read service or
public operation-port method. Its caller must supply a coherent SAME-GROUP
durable record and the native decoder. This function cannot authenticate a
caller-provided record or group label.

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

1. Acquire a coherent record in the actual native owner and expose a bounded
   outcome observation through the existing semantic port. Do not pass raw
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

## Corrective boundary — 2026-10-09

This section refines the original packet after its adversarial review. It does
not change the sealed FreshMG acceptance or authorize a successor attempt.

### Coherence belongs to the existing durable store

The supported acquisition path is now
`RaftRsDurableStore.readMembershipActionEvidence(groupId, action, decodeEntry)`.
The native owner must pass its own bound group and decoder; no wire-level raw
record is accepted. This method selects its own record in one SQLite read
transaction. It refuses an already-open transaction, including a store-owned
application transaction: uncommitted changes are not durable evidence.

The method validates the storage positions on which historical evidence
relies: snapshot <= applied <= commit <= the retained/snapshot frontier, valid
snapshot term/index bounds, applied membership generation, and a complete suffix
with positive nondecreasing terms no newer than HardState. A persisted snapshot
may replace the prefix. Entries covered by its cut never supply action
provenance; a coherent snapshot-only record remains UNRESOLVED. A missing
prefix without an anchor, an interior hole or impossible progress is
UNAVAILABLE, not a certificate of absence.

The method reads no partial log page. It does not replay every configuration,
authenticate arbitrary disk contents, or validate a snapshot's application
image. The existing application and snapshot owners retain those duties. The
pure `observeRetainedMembershipAction` codec still checks its scalar/context
conditions; it is NOT an alternative complete-record integrity validator.
This clarifies the original transition table's broad invalid-record wording.

No DDL, persistence journal entry, proposal, phase update or receipt ledger is
created by this read. It does not alter the old generic durable-record reader.
The production semantic port/driver is not wired by this corrective increment.

### Corrected evidence discipline

Mutation results are matched to actual Node per-test failure events, with the
exact test identity, ERR_ASSERTION and assertion message. Printed test titles,
setup errors, cancellation, skipped/todo cases, and unrelated failures cannot
satisfy a designated negative. The diagnostic refuses through the existing
probe guard before creating output or replacing source; timeout partial
stdout/stderr are retained and source is restored.

The historical native fixture asserts actual WAL/FULL on each open. Explicit
close/reopen engagement checks observe real connection state, store identity,
and invalidation of the old native handle before a new handle is acquired.
Numeric handle reuse is allowed. This remains same-process reconstruction,
not an abrupt process crash or power-loss proof.

A second-connection test commits between the store's record SELECTs and proves
that this read remains on its original snapshot; the next read sees the new
commit. Other tests corrupt real fixture tables, rather than relying solely on
projected arbitrary records. Local runs still use the explicit node:sqlite
adapter; its open and transaction flags now come from SQLite itself. Normal
better-sqlite3, actual runtime/Ready, process loss, native snapshot installation,
and the full source/gateway gates remain required.
