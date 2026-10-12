# CDC bulk send custody implementation packet

## Verdict and authority

**Frozen for independent source review; product acceptance remains HOLD.**

This bounded slice implements the existing bulk transport owner's physical send-custody handoff. It does not activate a CDC listener, alter the approved caller correction, enlarge a pool or global limit, add a timer/retry/budget owner, or certify a release artifact.

- Approved resource design and erratum: `cfe7405ce63469383c879c7dd3de6406b255468cd3e6816fbdbb5c219019eb84`.
- Approved terminal transfer owner/test slice: commit `758b32e733754b2fb67da7953899a2c4a55765dc`; independent approval `a3769209f3a635e3e77e8858beedc77e88470f9db8b708ee671609c6abd4f98a`.
- Narrow native-profile prerequisite remains `080d3d826422cd7a8a5116da4d4fbfb7613f2f7a1a76e6db261f2a7e11a6ecc2`; it is not treated as certification of every advertised distribution.
- Caller source at `2de419483c9b4ce9e3fabc87bb54d93e4afb8817` and terminal behavior remain closed and unchanged.

The exact eight source/test paths and before/after hashes are in `source-sha256.txt`; the complete patch is `subject-delta.patch`.

## Owner changes

1. `bulk-transfer-channel.js` now owns an accepted encoded frame from bounded pending-slot admission through the actual WebSocket send callback and the callback's outer continuation. It distinguishes retained bytes from bytes in the current physical write.
2. `bulk-connection-transfer-socket.js` observes asynchronous control and binary send outcomes. Any rejection or non-SENT result closes the existing connection owner and emits one local close, including controls that the snapshot driver intentionally enqueues without awaiting.
3. `inproc-transport.js`, the repository's other reachable WebSocket implementation, now implements the optional send callback. It settles after peer listener unwind, reports typed close or delivery failure, and settles once under callback reentry.
4. `transport.js` adds the additive `retainedSendBytes: 0` field to the existing empty bulk statistics shape. It is diagnostic evidence. It is not a new memory cap or pool.

No owner metadata file changed in this slice; its current hashes exactly equal the approved baseline hashes.

## Complete accepted-send timeline

### Dial and IDENTIFY

1. Dial keeps the existing explicit `maxPayload` and waits for WebSocket OPEN.
2. IDENTIFY is the first frame. The registry calls `ws.send(frame, callback)` and does not attach or return the connection before callback settlement.
3. Abort during the write terminates the socket but does not manufacture release before the actual callback. After callback settlement, the `await` continuation rechecks the signal; a cancellation in the callback-to-continuation interval terminates the identified socket and refuses attachment.
4. Only a successful callback with a still-live signal reaches `attach()`. Thus an IDENTIFY frame cannot be reported complete while its physical callback is still retained, and late cancellation cannot make a cancelled socket routable.

### Slot, bytes, pacing and serialization

1. A control reserves one existing pending slot before `JSON.stringify()`. This makes a reentrant accessor observe an occupied claim. Serialization succeeds once, the exact encoded byte count is added, and no accessor is reread. Serialization throw releases the same zero-byte slot in `finally`; nothing reaches socket custody.
2. A binary frame reserves one pending slot and charges its `frame.length` before it waits for the registry-shared byte token bucket. The frame, signal continuation and waiter are therefore visible retained custody while paced.
3. A granted or aborted bucket waiter removes its abort listener. Removing an aborted head immediately drains the next eligible waiter. Per-connection close aborts that connection's waiters; it never disposes the registry-shared bucket or another peer's waiter.
4. Token acquisition occurs before entry into the per-connection physical-write chain. Therefore ABORT/ACCEPT/ACK/COMPLETE controls bypass rate pacing and may pass a token-waiting chunk. Once a chunk has a grant, the common chain preserves one physical write at a time for that connection.
5. The common write turn rechecks external cancellation and `open` before `ws.send`. A cancelled queued chunk and a queued frame behind a closed connection never enter socket custody.
6. If every configured pending slot is occupied, a new control or chunk receives typed `pending_limit`. The adapter treats this as fatal and closes the transfer instead of dropping accepted protocol debt or waiting behind a paced chunk forever.

### Native callback, semantic result and final release

1. Immediately before `ws.send`, `inFlightBytes` identifies the one frame in the connection's physical writer. `retainedSendBytes` still includes that frame and every paced/queued accepted frame.
2. Installed ws 8.21.0 delegates the callback to the final underlying `socket.write`. Its sender error path calls the current and queued callbacks. The retained pinned Node 22.22.0 Writable source invokes active and buffered write callbacks on error/destroy. Exact source, hashes and line excerpts are in `ws-send-callback-source.txt`.
3. Callback entry settles only the inner Promise. It does not decrement ownership counters. The callback returns, then the `await` continuation classifies SENT or CLOSED, clears `inFlightBytes`, and the outer `finally` decrements retained bytes and the pending slot. The test observes bytes still charged synchronously after callback invocation and before that continuation.
4. A callback error starts connection close and yields CLOSED. A successful callback concurrent with socket close remains truthful SENT for that physical write. In both cases, final accounting release occurs exactly once in the outer continuation.
5. The snapshot adapter retains the send Promise even though the driver's `socket.send()` API returns void. A delayed successful terminal control may finish after the driver returns; a delayed non-SENT result or rejection closes the connection once. There is no result ACK and no added retry path.

### Close, replacement and registry retirement

1. Local close marks the connection unavailable and aborts only its local token waiters. The actual WebSocket CLOSE event removes that exact connection from active routing. A stale close cannot evict a replacement for the same node.
2. If native callbacks or pacing continuations remain, the closed connection moves to the registry's existing-owner retirement set. Registry statistics sum active and retired connections, so a replacement can be active while the old callback's bytes remain truthfully charged.
3. Retirement ends only after both facts hold: CLOSE was observed and `pendingSends` reached zero through the real continuation. The old service graph is then dropped. There is no free interval between map eviction and callback release.
4. Registry shutdown closes all active connections, keeps them retired while callbacks unwind, and disposes the shared token bucket once at registry scope. Individual connection close never disposes it.

### In-process WebSocket

1. `send(data, callback)` captures the current peer and queues the existing delivery microtask.
2. Close before that microtask reports `inproc_websocket_closed`. A peer listener throw reports `inproc_websocket_delivery_failed`. With no callback, the prior throw behavior is preserved.
3. On success, all peer message listeners return before callback entry. The exact-once flag is set before invoking the callback, so callback reentry queues a successor without recursively delivering it.
4. The bulk callback resolves its Promise inside that delivery microtask. Its continuation and accounting release run only after the delivery/callback closure unwinds, so the frame is not credited while the closure still executes.

## Caller census and compatibility

The production `connection.sendControl()` consumer is the existing bulk connection transfer adapter. `snapshot-transfer.js` sends encoded controls and chunks through the adapter's WebSocket-like `send()` API, and `snapshot-offer-router.js` constructs the same adapter for accepted offers. Direct `sendControl()` uses outside the owner are tests. The exact census is in `send-caller-census.txt`.

Snapshot offer, resume, chunk verification, cancellation and completion tests remain green. A zero-rate chunk no longer prevents an accepted terminal control or an independent peer control from reaching its socket. Closing the blocked connection releases only its own waiter. The primary/ordinary router queue and snapshot semantic owner are unchanged. The in-process optional callback preserves existing callback-free callers.

## Bounds and non-claims

- Existing `maxPendingSends` remains authoritative (default 8 per connection). The slice does not raise it or create a second admission bank.
- Each connection has at most one physical write in its common chain. Active and retired replacement connections are both counted until their own callbacks release.
- `retainedSendBytes` is an exact live diagnostic for encoded frames accepted by this owner. It is not an aggregate native-memory guarantee and does not replace the approved fixed CDC banks.
- Control frames bypass rate pacing but still consume the same pending count. A full bank gives typed refusal and adapter close; it does not silently discard a probe/control response.
- The successful real-socket guard proves the installed ws callback is used and keeps peer delivery as a separate fact. Source tracing covers close/error settlement for the selected Node/ws pair. It does not certify other runtimes or release artifacts.

## Verification

Final cumulative run: **9 files, 9 passed, 305 assertions**. It covers callback-controlled controls/chunks, cap refusal, serialization throw, queued close/cancel revalidation, registry retirement while bytes remain, callback error, zero-rate cancellation, shared-peer continuation, abort-listener removal, in-process close/throw/reentry/unwind, real ws callback, adapter delayed-control failure, IDENTIFY callback and late cancellation, plus prior snapshot offer/resume/protocol/dispatcher behavior.

Targeted ESLint, complexity, cognitive complexity, file size, literal, hot-path, deferred-outcome, silent-catch, impact-contract and shard checks pass. Whole-tree file-size, guideline, test-duplication and unused-export ratchets remain red from concurrent repository WIP; exact outputs and declared-slice censuses are retained. The declared files introduce no duplicate group, no new export, and no size violation. See `commands-and-results.md`.

## Remaining HOLDs

1. Independent source review of this exact packet is required before source acceptance.
2. The native receive/listener ownership and CDC MessageRouter activation are not implemented by this send slice.
3. `retainedSendBytes` is not evidence for the full receive/native allocation coefficient or the complete fixed-pool colocated proof.
4. OCI/Helm, SEA, npm/source and lab artifact profiles still require certification by the existing release/runtime owner. This local Linux x64 Node 22.23.2/ws 8.21.0 run is not that certification and does not narrow advertised support.
5. The preserved runtime producer/profile census belongs to the existing release/provenance owners and must be composed without overwriting their retained work.
