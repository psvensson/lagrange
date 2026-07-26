# S3 Design — Raft Snapshot Bulk Transfer

Scope: quest `raft-snapshot-bulk-transfer` (R2). Authenticated,
integrity-checked, resumable chunk transfer of sealed S1 checkpoint
generations between nodes, on a dedicated byte-bounded bulk lane, with a
deterministic proof that critical convergence retains progress under bulk
saturation. Output of a completed transfer = a sealed local generation
directory (payload + descriptor, S1 publication-token semantics) ready for
S2 install. Catch-up orchestration (who triggers a transfer, install, resume
AppendEntries) is S4.

## The lane decision (epic open question, answered from code)

Research verdict: NO existing pressure owner can prove lane isolation.

- Foreground raft packets bypass the outbound queue entirely
  (`tryDeliverRaftDirect` writes to the socket when the peer is CONNECTED),
  so the queue's critical/readiness reserves — the only true
  reserved-progress machinery — do not sit on raft's path. Tagging chunks
  BACKGROUND there is exactly the "separate queue name without reserved
  progress" the authoring bar rejects.
- The real contended resource is the ONE ordered JSON-text WebSocket per
  peer: a multi-MB chunk ahead of a heartbeat is socket head-of-line
  blocking that no send-side class can undo. (Design-verifier correction:
  quarantine severance is NOT the harm — quarantine is outbound-only and
  CL-007 liveness-guarded; the accurate harms are 5s ACK-timeout FAILURES of
  critical messages stuck behind a multi-MB frame, plus raw HOL latency on
  the tryDeliverRaftDirect heartbeat path.)
- Nothing in the tree accounts bytes (queues count messages).

Decision: a **dedicated per-peer bulk channel** — a second WebSocket
connection under the SAME identity/admission regime (IDENTIFY frame with a
`channel: bulk` marker, admitted by the existing `externalAdmissionEnabled`
+ nodeId gate; R2's "REUSED: authenticated cluster transport" is exactly
this identity-based authentication — no transport MAC exists to reuse, so
integrity rides the S1 envelope + per-chunk digests). Critical frames never
share the bulk write buffer. The bulk channel owns byte-denominated
controls: single in-flight chunk per peer, bounded chunk size, a
token-bucket byte-rate cap, bounded pending requests, AbortSignal
cancellation (reused deliver-path idiom).

## Protocol (versioned, explicit negotiation)

Message kinds (`lagrange-snapshot-transfer-v1`): control messages as JSON
TEXT frames — `offer` (descriptor + transferId + chunkSize + chunkCount),
`accept` (resume boundary included), `chunk-request` (transferId +
chunkIndex), `chunk-header` metadata + the chunk itself as a BINARY frame
(length-prefixed header binding transferId/chunkIndex/byteLength/`sha256:`
chunk digest, OCI framing precedent), `complete`, `abort` (typed reason).
Binary frames avoid the ~33% base64 expansion and multi-MB JSON.parse per
chunk (design-verifier challenge sustained). Negotiation pins protocol
version and chunk geometry; a version/geometry mismatch is a typed abort.

- Chunk size: 1 MiB (constant); chunkCount = ceil(payloadByteLength /
  chunkSize). The bulk dial sets an explicit per-socket `maxPayload`
  (supported by ws@8 per-client) and the receiver length-checks every frame
  before append.
- Pre-claim frame discipline (load-bearing): NOTHING but the IDENTIFY frame
  may be sent on a bulk socket before the receiver's claim completes, and
  the IDENTIFY fork must DETACH the router's message/close/error listeners
  before the bulk registry attaches its own in the same tick — a stray
  binary frame reaching the router handler is a rethrown JSON.parse inside
  a ws callback (process-level crash).
- RECEIVER-DRIVEN flow: the receiver requests one chunk at a time
  (single in-flight), verifies the chunk digest, appends to the transfer
  staging file, and durably records the verified boundary (canonical-JSON
  progress marker: transferId, generationIndex, descriptor digest,
  verifiedChunkCount, verifiedByteLength) before requesting the next.
  Restart resumes ONLY from the recorded verified boundary (R2): a fresh
  `accept` carries the boundary; the sender serves from there; a boundary
  whose staged bytes fail re-digest on resume restarts from zero (typed).
- Completion: staged byte length + whole-payload sha256 (computed by
  STREAMING, never S1's readFileSync inheritance) must equal the
  descriptor's `payloadByteLength`/`payloadDigest`; then the generation is
  published locally at exactly `{checkpointsRoot}/{lastIncludedIndex}/`
  (bare decimal) as `payload.db` + `checkpoint.json` with S1 semantics
  (payload rename + dir fsync first, descriptor last via writeAtomicDurable)
  — any other layout is invisible to `listCheckpointGenerations` and
  un-installable. Any mismatch is a typed abort and the staging discarded.
- Durability mechanics: progress marker via `writeAtomicDurable`
  (canonical-JSON-only — correct for the marker, unusable for bytes); chunk
  appends via raw `fs` (file opened once, write + `fsyncSync` per verified
  chunk, directory fsync at staging creation) — `appendDurable` is rejected
  (foreign error type, 0o600 re-open constraint, double dir-fsync per
  call). Budget: 2 fsyncs per chunk (bytes + marker); the marker may batch
  every N chunks with a conservative resume boundary if measurement demands.
  S3 owns stale `transfer/` staging cleanup, invoked at transfer accept
  (boot-time sweep wiring arrives with S4's production caller — recorded).
- Membership-epoch abort: the receiver re-checks the descriptor against its
  `expectedIdentity` at accept time and at completion; an epoch advance
  mid-transfer is a typed `stale_epoch` abort (identity sources remain
  caller-supplied in S3; production pinning lands with S4 wiring, per the
  epic log).

## Placement

- `src/raft/snapshot-transfer.js` + `snapshot-transfer-constants.js` —
  sender/receiver protocol state machines, chunk digesting, progress
  marker, publication. (Vocabulary note: `checkpointChunk`/`snapshotTransfer`
  prefixes; bare `chunk`/`snapshot` are overloaded elsewhere.)
- `src/transport/bulk-transfer-channel.js` — the dedicated channel: dial /
  accept (IDENTIFY + `channel: bulk`), per-peer single connection keyed
  `{nodeId, channel}`, byte-rate token bucket, bounded pending, abort
  wiring. Queue-class/reserve machinery in `src/transport/` is NOT touched;
  the channel is additive. Inbound: a minimal hook in the identification
  path routes `channel: bulk` sockets to the channel registry instead of
  `nodeConnections` (never rekeying/evicting the primary connection).
- Pressure visibility (sensor, not enforcement — verifier-corrected so the
  sensor is not blind): resource prefix `snapshot-transfer:` (NOT bare
  `snapshot:` — `control-plane:snapshot:repair` already occupies that
  vocabulary) added BOTH to the capacity-partition map (new BULK partition)
  AND to `TRANSPORT_RESOURCE_PREFIXES` so `shouldUseTransportSensor`
  engages; and because bulk bytes never traverse the router's outbound
  queues, the bulk channel FEEDS its own stats (pending requests, in-flight
  bytes, token-bucket depth) into `messageRouter.getStats()` as an additive
  `bulkChannel` section the governor's summary reads for the BULK
  partition. The governor remains advisory. The sender-side token bucket is
  the enforcement point (the serving node is the protected resource);
  receiver single-in-flight is the complementary bound. Bulk traffic
  deliberately does NOT stamp `nodeInboundActivityAt` — lane isolation, not
  an oversight.
- Transport owner card (`src/transport/README.md`) is amended in this quest
  to name the bulk channel as an owner surface: a second per-peer socket
  lane, byte-bounded, never carrying query/data-plane or router-queue
  traffic, with visible bounded pressure (no hidden drops / unbounded
  growth).

## Proof (two tiers, both deterministic)

1. Transport guard (`test/transport/`): with the bulk channel saturated
   (never-draining bulk sends, pending at cap), the primary router's
   critical enqueue + dispatch complete unaffected (modelled on the
   readiness-inflight-reserve guard) — bulk bytes never appear in the
   router queue, and the primary connection's quarantine state is
   untouched.
2. DT6 cost-table guard (`test/convergence/` — zero DT6 usage exists under
   test/raft/): real liferaft cluster over `createVirtualNetwork(
   {costTable})` with LIVE election timers, charging `perUnitMs ×
   chunkBytes` (per-chunk charges >= 1ms — cost() rounds per charge) for
   bulk chunk serving on the SERVING NODE'S CLOCK. Causal story
   (verifier-corrected — the harness has no per-peer FIFO link, so this is
   NOT a socket-HOL model): bounded chunks keep the serving node's clock
   available so its heartbeat timers fire inside the election budget;
   the negative control charges an UNBOUNDED single-chunk cost and asserts
   the budget blows — proving the BOUND, not the tag, preserves progress.
3. Protocol guards (`test/raft/`): resume-from-verified-boundary round trip
   (kill mid-transfer, restart, complete; bytes re-verified), tampered
   chunk digest refused, truncated staging restart-from-zero, whole-digest
   mismatch refused at completion, version/geometry mismatch abort,
   epoch-change abort, publication token semantics (no descriptor until
   payload durable).

## Out of scope (S4/S5)

Transfer triggering, install invocation, AppendEntries resume, retention
pinning of in-flight generations (S5 must not delete a generation an
admitted transfer still needs — recorded), production identity pinning,
receive-side admission on the primary transport.
