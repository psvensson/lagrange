# STOP checkpoint publication repair, 2026-09-27

This record is publication-only. It does not reopen the stopped design and it
does not add a production repair.

- Sealed STOP checkpoint: `292b7204334cf47617e675dd9b12bc708b682886`.
- Branch: `quest/distributed-transaction-replicated-apply`.
- Publication state at the start of this repair: `SEALED / PUBLICATION_BLOCKED`.
- Pushed branch SHA: pending the normal publication gate and independent
  remote-ref readback.

## Failed normal publication gate

The normal whole-corpus push gate reached the exclusive lane with one job and
failed in
`test/integration/transaction-concurrent-read-outage.integration.test.js`.
The failure occurred in `cluster.formCluster(3)`, before `evidence.create`, the
warm-up, or any transaction/outage round. The final formation observation was
a public CREATE rejection whose schema intent was already durably terminal.
The formation loop then retried the same deterministic schema intent under new
operation ids until its deadline. This is a formation-harness failure, not a
failure of the transaction witness and not evidence against the STOP verdict.

Resource reclassification cannot repair this failure: the failed publication
execution had already classified the target in the exclusive lane with
`jobs=1`.

## Historical boundary and isolated challenge

The current test first entered this line of work at
`72d878ece6971915b3284bec3a2cabe38770b8ea`. Its parent has no equivalent
transaction/outage witness. From that commit to the sealed checkpoint, the
transaction body is materially unchanged; the relevant later change replaces
a local log parser with the shared node-log-window helper.

The repository lab selector cannot name one file directly. Two disposable,
scheduling-only commits changed only `package.json` and
`test/shards/resource-exclusive.txt` to select exactly this file through the
normal lab runner. In both cases the selected test and `src/` trees were
byte-identical to the commit under challenge.

| challenged source | selector wrapper | host/lane | result |
| --- | --- | --- | --- |
| `292b7204334cf47617e675dd9b12bc708b682886` | `e008293ce7a57afd56b3a98d6d0f59c8be2e936e` | tv-dator, normal lock and thermal gate, exclusive/jobs=1 | green, 5 assertions, 100314 ms |
| `72d878ece6971915b3284bec3a2cabe38770b8ea` | `51c97a9c2a351be4a76d017f1e6a6af5c3d1d729` | tv-dator, normal lock and thermal gate, exclusive/jobs=1 | green, 5 assertions, 92148 ms |

These isolated greens do not erase the publication red. Together with the
pre-property failure location, they classify the mechanism as nondeterministic
formation admission rather than a transaction-assertion defect.

## Deterministic correction

The first repair checkpoint, `50834c2e2`, was rejected by an independent
verifier before lab execution. Its gate consumed canonical readiness-owner
output but did not match CREATE's provisioning enforcement: ordinary CREATE
also consumes `provisioningEligible` and an operation-specific capacity
decision. Its admin fetch also lacked a request bound, so one stalled request
could escape the remaining formation deadline.

The second repair checkpoint, `4e240ceca`, was also rejected before lab
execution. It incorrectly required `snapshotObservation.state=fresh`; the
`scope=local` HTTP route directly builds its local snapshot and does not attach
that shared-snapshot-owner field. The focused fixture had fabricated a shape
the live route cannot produce.

The amended embedded formation harness consumes existing readiness-owner
output from the seed's directly built local admin control snapshot before it
submits application DDL. It requires an available, satisfied priority-placement
observation whose `capturedAt` equals the enclosing snapshot's `capturedAt`,
which establishes that the placement observation belongs to the same local
build. Every expected node must report `controlPlaneWritable`,
`metadataPublicationHealthy`, `provisioningEligible`, and the capacity-derived
`placementEligible`. Every snapshot request is aborted at the remaining
formation budget.

These are formation preconditions, not CREATE authorization. The one-shot
CREATE remains the operation-specific authoritative decision because its
provisioning owner separately evaluates the operation's estimated bytes
against fresh capacity. A denial there is legitimate direct evidence and is
not retried by the harness.

After that owner-authorized readiness transition, the harness submits the
CREATE exactly once and the INSERT exactly once. A rejection is surfaced
directly with the node-log digest. It is not converted into another readiness
poll, retried under a new operation id, or hidden by a longer timeout. A
focused regression proves that a rejected CREATE has one attempt and cannot
fall through to INSERT. The transaction/outage assertions are unchanged.

## Design verdict remains sealed

The liveness wording is corrected for future work: there is no configured
universal 350 ms workspace timeout. The relevant interval is from a follower's
last valid leader message to its randomized election deadline, and a workspace
is dangerous when it monopolizes the authoritative event-loop/tick path across
that interval. Future probes must measure workspace wall-clock cost and
authoritative-path interference separately.

That correction does not rescue full-image serialization. The STOP verdict is
still based on workspace preparation scaling with total partition bytes. Full
SQLite serialization, WAL-header normalization, anonymous-buffer open, and
Raft-table scrubbing remain measured evidence for a rejected mechanism, not a
production transaction workspace.

## Publication completion

Before the next normal push attempt, the corrected branch must have a green
isolated tv-dator run of the actual outage witness, its directly affected cone,
the focused regression, static checks and ratchets, with a clean worktree. The
quest remains `SEALED / PUBLICATION_BLOCKED` until the branch exists on origin
and the remote SHA is independently read back.
