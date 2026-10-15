# Related implementations: hints for the existing owners

Read on 2026-10-15 after the user's request for comparable systems. These are
primary-source precedents and explicitly marked inferences for Lagrange.
They supply design questions and witnesses; they do not certify Lagrange or
change its accepted local-staging protocol. No external project was executed.

## Atomic comparison belongs with the effect: etcd

etcd's transaction API evaluates its comparisons atomically and executes the
selected success or failure branch; the returned `succeeded` field reports
that evaluation. A transaction's modifications share one store revision.
Its failure branch can itself write: failed comparison does not universally
mean unchanged store revision. [etcd v3.6 transaction API](https://etcd.io/docs/v3.6/learning/api/#transaction).

**Lagrange inference:** D2 should compare the exact expected release state,
apply the chosen transition/refusal, and record its actual result atomically
with the applied position. A refusal-result write may advance the Raft log
and storage state while leaving the release-state version unchanged. Neither
an etcd revision nor a proposal counter is interchangeable with all those
identities. This sharpens the existing F2/F5 contract without adding an owner.
Witness: two distinct requests against the same expected authority; record
one winner and the loser's own refusal at their actual application positions.

## Retiring a response must not permit replay: Raft / LogCabin

Ongaro's client-interaction design stores command identities with their
responses, permits a client's acknowledged sequence frontier to retire older
responses, and requires deterministic expiration. An unknown expired session
must not be silently recreated and its commands re-executed.
[Raft dissertation, chapter 6, pinned source](https://github.com/ongardie/dissertation/blob/0c10ea1b53d73bf6d163bdde8e4141a1cbd8f36a/clients/clients.tex#L214-L286).

The inspected LogCabin implementation suppresses both retained duplicates and
requests below `firstOutstandingRPC`. It answers a missing/retired response
with `SESSION_EXPIRED`, and serializes/restores the response map and frontier
in its state-machine snapshot. This is a concrete historical implementation,
pinned at `ee6c55ae9744b82b451becd9707d26c7c1b6bbfb`, not a claim about current
maintenance or blanket exactly-once behavior for arbitrary clients.
[LogCabin StateMachine.cc](https://github.com/logcabin/logcabin/blob/ee6c55ae9744b82b451becd9707d26c7c1b6bbfb/Server/StateMachine.cc#L175-L214),
[application/retirement](https://github.com/logcabin/logcabin/blob/ee6c55ae9744b82b451becd9707d26c7c1b6bbfb/Server/StateMachine.cc#L300-L341),
[snapshot schema](https://github.com/logcabin/logcabin/blob/ee6c55ae9744b82b451becd9707d26c7c1b6bbfb/Server/SnapshotStateMachine.proto#L42-L69).

**Lagrange inference:** retain exact outcomes and anti-replay information under
the same application/result owner, including snapshot recovery. A bounded
cache alone is insufficient. Do not copy LogCabin's session subsystem: its
deduplication sessions are unrelated to TX1's volatile BEGIN/staging, and its
request-number lookup does not establish Lagrange's stronger same-ID/different-
contents requirement. An acknowledgment frontier would introduce new bytes
and recovery obligations; it is an alternative requiring owner approval,
not an implicit addition to this packet's proposed version fence.
Witness: retire a result, restore a snapshot, deliver the old request, and
observe unavailable history without a repeated effect or renewed authority.

## Unknown outcome requires stable intent: FoundationDB

FoundationDB recommends generating transaction identities outside retry loops
and atomically recording/checking a unique effect marker for idempotence.
It distinguishes `commit_unknown_result` from timeout/cancellation: for that
specific error it guarantees the old transaction is no longer in flight;
other errors can leave a commit that completes later.
[FoundationDB developer guide](https://apple.github.io/foundationdb/developer-guide.html#transactions-with-unknown-results),
[error distinctions](https://apple.github.io/foundationdb/developer-guide.html#non-retryable-errors).

**Lagrange inference:** preserve identity, contents and admission binding
through the existing query delivery/unknown-outcome owner. A retry must not
obtain fresh authority simply because its reply was lost. Lagrange has not
proved FoundationDB's no-longer-in-flight guarantee, so do not import it or
interpret a timeout as noncommit. Witness: lose the reply, cross HOLD and
reauthorization, retry the original bytes, and check the original result or
typed uncertainty without a second new-work effect.

## Capacity errors and recovery paths: etcd

etcd's quota alarm retains read/delete maintenance operations. Its documentation
also warns that a Put/Txn/LeaseGrant can return `ErrGRPCNoSpace` even though
the backend write succeeded, because quota checks exist at different layers.
[etcd v3.6 maintenance and space quota](https://etcd.io/docs/v3.6/op-guide/maintenance/#space-quota).

**Lagrange inference:** capacity behavior needs explicit result semantics and
a recovery path, not just an ingress size check. HOLD, decision settlement and
reauthorization need bounded reserved capacity under their existing owners.
The etcd recovery operations do not prove those Lagrange credits exist.
Witness: saturate normal history with pending commands, change leader, then
close, settle and reauthorize; distinguish preproposal backpressure from an
applied refusal and an unknown outcome. This is the open retention gate in
[OWNER-CONTRACT.md](OWNER-CONTRACT.md), not a new global alarm authority.

The source URL/hash inventory is in `native-evidence/research-source-identities.json`.
These precedents strengthen the existing complete implementation unit and
its RED-first matrix. None resolves the missing D0 proof contract, immutable
binding capture point, exact release-result schema, finite credit proof or
application snapshot provenance decision on its own.
