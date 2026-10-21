---
audience: development
documentClass: current
---

# Actual cold public baseline at c6ece57ee

Date: 2026-10-21. Author: subagent:/root/release_recovery_writer.
This is an author assessment pending independent result review. The Quest stays
red and every receipt remains false. No production source was changed.

Exact checkpoint c6ece57ee319ff60b77948226e36643f57c6dc22 was committed with
normal hooks and pushed to work/retained-seed-original-handoff-20261021; the
remote SHA was independently read back. Its entire src and scripts trees are
identical to product 393f411ca09449898465cc3cb7320c03fba2aba8. The three witness
hashes match the frozen independent-public-witness-review.md approval.

## Measured result and first divergence

The canonical lab API placed exactly one file on locked adam-laptop, retry 0,
automatic factor 2, bootstrap lane jobs 2 (one selected file). Thermal admission
held at 83C, then admitted at 43C. No production deadline, test deadline, runner
policy or baseline was changed. The controller ran from 06:39:01.718Z to
06:41:02.572Z. The file took 51,941ms; its single node:test case took 50,254ms.
The runner's one reported assertion is a top-level case count, not a count of
all leaf assertions. Exit 1, one failed case, zero cancelled/skipped/todo, and
no controller error. This is no performance or full-startup acceptance.

The only failing assertion is the final expected future public code at test
line 158: actual undefined versus HANDOFF_COMPLETE_SERVING_DEFERRED. Every
preceding sequential engagement and cleanup assertion therefore completed.
This is the intended old-source public-frontier baseline, not a setup failure
or proof that the current missing-authority refusal is unsafe.

1. The first genuinely cold child called actual startLagrangeRuntime with the
   supplied retained directory and real node/listener configuration. The public
   membership owner returned FRESH_SEED; startup SERVICES admission was missing
   and empty. No seed-role override, process-claim reset, fake authority, direct
   factory entry, constructor replacement or public dependency double was used.
2. Actual registered control release completed. The first selected dependent
   ENABLE was artifact_payload_chunks-p1-r1. Its real origin changed from null
   to index 2 / term 1. The request's unchanged public budget was 30,000ms, with issued
   deadline 1792564852532; the real answer settled at 1792564824627. Only the
   already-injected handler time-source now value advanced to the issued
   deadline after that answer. The shared handler remains at that reading for
   the rest of the attempt: this is deterministic boundary evidence, not a
   measurement of wall-clock expiry. Node/native clocks and timer delegation
   stayed original. Pure admission was CLOSED. The selected attempt delivered
   three PAUSE messages and one ENABLE, with no subsequent selected OBSERVE or
   RESUME. Its original outer refusal names RELEASE_DEADLINE at
   OBSERVE_APPLIED_POSITION. Other actual recovery traffic was not suppressed.
3. Actual public failure/unwind completed without AggregateError or observer
   error. Every captured original database owner was observed closed before
   the explicit child termination. The parent reacquired actual directory
   custody and independently read the selected origin through readonly SQLite.
   This is an observed host-map inventory, not a prospective complete-cohort
   issuance proof.
4. The second genuinely cold child entered the same public function with the
   same retained directory and no fault-clock replacement. Its membership
   decision was again FRESH_SEED with no durable membership proof. Its actual
   SERVICES storage snapshot was READABLE, rows:[], empty:false. The first
   captured creation refusal was assertBootstrapPartitionStorageAdmission in
   SeedPartitionsPhase for artifact_payload_chunks-p1-r1, code
   CREATE_OWNER_DEFERRED. There was no authoritative SERVICES row to admit it.
   The public path therefore reaches this partition owner; it does not enter
   a proved seed-restart-v2 recovery mode or invent a cluster identity.
5. Reconciler execution continued to its existing leadership wait. The public
   error was later flattened to the unchanged 30,000ms failure to establish the
   four required partition leaders: partitions, services, tables, message_groups.
   This later timeout is not the first causal divergence. Three message-group
   services were created on this restart, as the original raw failure reports;
   no claimed successful partition recovery follows. The parent verified no
   observed cleanup/observer errors, closed captured database owners, real
   directory reacquisition, and preservation of the original selected origin.

Current fail-closed behavior is protected: a committed origin and readable
empty SERVICES store do not supply missing creation/placement authority. This
baseline demonstrates the exact prospective handoff prerequisite. It does not
waive it for old directories lacking the proposed grant. It gives no approval
for grant issuance, activation, metadata replay, serving, RF3 cross-host safety,
U1/TX1/FreshMG, or release publication.

## Raw evidence and explicit retention limit

input.json binds the exact commit, source/script trees, file selection, lane,
host, retries and three test/helper blobs. source-bindings.json binds nineteen
inspected source/runner/witness files. exit.json is the terminal controller
result. controller.log is the complete emitted controller stream;
transport.log and transport.err are the canonical transport logs, and
test-results.ndjson is the complete one-row returned result ledger.

The canonical run-test-files owner bounded the failed TAP relay to its head and
tail. It explicitly elided 369,850 bytes from the verbose child observations.
These preserved streams are **not a complete child TAP transcript**. The remote
placement owner normally removes its temporary worktree on exit, including the
full .tap file there. No skipped excerpt bytes have been reconstructed.

The complete selected release object fits in the preserved head, and the
complete final first-divergence diagnostic fits in the tail. Their separate
JSON observations state their derivation: strip the host/TAP prefix and collapse
TAP-doubled backslash pairs once, then parse the complete selected value or
complete final diagnostic. They do not reconstruct the truncated database list
or the complete second-child report. The unchanged sequential test is the
source of the claimed passed pre-final assertions.

The test reported retaining this remote directory on adam-laptop:
`/tmp/retained-seed-public-CkzwCB`. Its named child output files are
`initial-child-output.log` and `restart-child-output.log`; the selected origin
file is the descendant
`partitions/artifact_payload_chunks-p1/artifact_payload_chunks-p1-r1.db`.
The directory and its contents have not been re-read or checksummed remotely.
Their reported paths are retained evidence locations, not freshly verified
artifact bytes. A later process-exit cleanup claim is not substituted for the
pre-exit database assertions.

The current lab CLI/API was inspected for supported retained-file readback:
lab commands cover fleet/provision/test/harness, while probe.js exposes
placement/discovery/holds and copies its result ledger. There is no supported
readback surface for these retained temporary child files. Generic process
capture is not an artifact retrieval contract. No raw SSH, extra native run,
runner change or new artifact subsystem was used to recover incidental logs.

## Remaining gates

Independent result classification is next. All receipt rows remain false.
The sealed activation obligation is unchanged. Complete mutation/activation,
ingress, original allocation/abort and lower actual submission correspondence
still require independent approval before any production edit. The old-source
baseline alone does not define or prove the future positive operation.
