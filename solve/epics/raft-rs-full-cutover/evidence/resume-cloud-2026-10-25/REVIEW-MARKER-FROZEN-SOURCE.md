# Independent review — preserved diagnostic marker plus intrinsic capture correction

Date: 2026-10-25. Reviewer: `/root/metric_review`. Implementation author: the preserved marker author; intrinsic correction author: `/root/admin_review`.

## Disposition

**HOLD for bounded implementation approval.** The frozen-source review is complete. No concrete implementation defect has been established by this review. One source-derived text-representation hypothesis remains unresolved; it needs the actual HTTP/SQLite boundary witness requested from the authorized lab owner. It is a systematic boundary investigation, not a proven endpoint-local bug and not a proposal to silently narrow the marker's accepted strings.

The intrinsic-only test correction is acceptable on source inspection: six captured calls replace thirteen equivalent ambient calls, with no removed assertion, changed fixture outcome, or changed production implementation. Its original ambient audit had thirteen findings and the author's corrected scoped audit has zero. The normal hooks and exact corrected-source runtime receipts are separate gates; their execution is not asserted here.

This report does not approve composition onto the current D2/Q6 integration, the physical split-brain scenario, the marker Quest, release, or main. The source base predates current integration. Successful normal preservation commits would not change this disposition.

## Exact source binding

Reviewed working tree: `/workspace/scratch/285a938494ce/marker-hook-repair`, base `6a228ced9439af07216b492bb8fdbba5540c3671`.

The author's restoration record proves that the preserved patch reconstructed original index tree `ca8691da88767a41f51841e9708bdc6fbb297e8d`. Original patch SHA-256 is `79698fc90837bfaa4f3488b759d5c57db81712cd4c716372ce5af3c18c68cba1`. The only subsequent implementation/test-source delta is the intrinsic capture correction in `test/distributed/harness/__tests__/network-partition-split-brain-scenario.test.js`; correction patch SHA-256 is `dda8c4fab2539c1d0bad3210768468996955db65f43e58ec2b7c4a2f5071dd62`.

All 23 preserved/current file hashes are in `/workspace/scratch/285a938494ce/admin-hook-repair-evidence/marker-review-source.json`. The reviewer independently reread and hashed those paths into `frozen-source-current-check.json` beside this report. Every `.js` implementation and test path still matches the frozen source. Only the Quest append log had changed at that check; no historical receipt was changed. Hooks may subsequently regenerate derived manifests, which must not be confused with these reviewed implementation bytes.

Key bindings:

| Path | SHA-256 |
| --- | --- |
| `src/control-plane/owners/log-diagnostic-marker-contract.js` | `bb2d40e3d3c7a308f5a4affb6fa57fe857a8af409772c09a60efc270bbb8aa00` |
| `src/control-plane/owners/logs-owner.js` | `eef1bf5a64dd48b349b983c5165b9c30b09add64e54f203fe0b82ba34f877ccc` |
| `src/admin/admin-owner-operations.js` | `db14a1c51f68798dc5f21b53b504bed874d5777bcb41f25286d0687a15ccc1c0` |
| `test/distributed/scenarios/network-partition-marker.js` | `a5ce9b1fb55cf1ff16031e16c6e75558c237a13b5088452f275775df197ddc07` |
| `test/distributed/scenarios/network-partition-split-brain.js` | `4c2a575cec1aa3658f39d5fc0ce0c16faf6502c1aedd490558023b420cb5946b` |
| Corrected split-brain scenario unit test | `de4927bb607abb57badff623a178ed622adbbf05ee8fb46db1754b051d32986c` |

## Owner and interaction assessment

### Admission, intent, and mutation authority

The HTTP operation is fixed: `POST /api/admin/logs/markers` delegates to `LogsOwner.appendDiagnosticMarker`. The admitted body contains only `markerId` and `message`; the ASCII marker identity and message length are bounded. The server supplies node identity, timestamp, level, metadata and the deterministic `diagnostic-marker:` log ID. Caller attempts to supply SQL, a write identity, timestamp, node identity, or mutation options are refused before the gateway. The operation uses the existing admin bind/trust boundary and runtime owner provider; it introduces no generic system-table write exemption.

`compileDiagnosticMarker` builds a frozen row before the first await. `appendLog` uses the existing insert operation. INSERT uniqueness fences the write at application time. Readback never overwrites or upserts the existing marker. Existing generic LogsOwner methods predate this patch and are not exposed by the new marker endpoint.

The base metadata owner remains the retry owner. One original row and one write identity survive retryable gateway attempts. The marker adds neither a retry scheduler nor a second persistence owner. A later HTTP retry is intentionally a new insert attempt against the same immutable semantic identity; its newly sampled timestamp does not replace the first row.

### Completion evidence, reconciliation, and server identity

The fast receipt uses the canonical mutation classifier and requires applied, not deferred, no pending visibility, and an explicit affected-row count of exactly one. Ambiguous write completion, a constraint/error, or a missing count proceeds to authoritative keyed readback. The read request forces `OWNER_RPC_REQUIRED` and required leadership after caller options, so weaker cache/SQL read strategies cannot be selected through this operation.

The read must be successful and return exactly one row with the expected key, a positive safe timestamp, and identical timestamp/created-at. Message, ingress node, level and fixed metadata must match. Exact replay returns the stored first timestamp. A request at another ingress node conflicts rather than replacing server identity. Failed, absent, malformed, ambiguous or unavailable readback cannot manufacture a recorded result. Those paths remain typed `LOG_MARKER_OUTCOME_UNCONFIRMED` with retry disposition.

One unresolved premise is the equality of admitted JS text and actual stored text. That premise is separated below rather than hidden inside this otherwise sound evidence chain.

### Diagnostics callers and transport interpretation

The node handle delegates to the existing HTTP request owner. The admin smoke caller uses the fixed marker operation and then checks the exact row by parameterized read. It no longer grants arbitrary system-table SQL mutation authority.

For a Docker partition scenario, the minority request executes a fetch to loopback inside the selected node container. This retains local-minority ingress instead of accidentally moving the request to a reachable majority service. The fixed body is safely serialized, each fetch has a timeout, and typed stdout carries the application outcome. Transport completion alone is never a marker acknowledgement.

The scenario helper classifies only `success: true` plus recorded state as acknowledgement. Only pre-mutation request invalidity and unavailable admin owner are definite refusal. Other failed answers, transport loss and timeout remain unknown. The scenario rejects a minority acknowledgement, requires a majority acknowledgement, heals in a finally path, then performs convergence/consistency and exact marker checks. Definite refusals must remain absent. Unknown attempts retain attempt identity, readback observations and a typed inconclusive result; post-heal presence is not relabelled as proof of cut-time commitment. This preserves the distinction between uncertainty and a false no-commit assertion.

### Resources, retries, and unsupported threat expansion

The owner adds a bounded marker row and one keyed reconciliation read. Retention and gateway retry/pressure remain existing owners; this patch adds no queue, ledger or independent timeout loop. Scenario retries/attempts are bounded by its node set and existing HTTP deadlines. The native witness owns and releases its held delivery packets and cleans up its test database/replicas.

The adversarial review covers actual external JSON input, mutable original request capture, malformed/ambiguous producer evidence, conflicting durable identity and transport loss. It does not assume unsupported hostile JavaScript getters, replaced module globals, or arbitrary injected in-process objects are equivalent to externally parsed JSON. The corrected scenario test now captures its needed intrinsic operations once without changing the result predicates.

## Evidence actually examined and its limits

Recovered originals are under `/workspace/scratch/285a938494ce/recovered-rs-raft-evidence/raw/marker`. Root's recovery verification confirms all 32 manifest-listed recovered files match their historical hashes and sizes and both manifests are byte-identical. This establishes custody of historical evidence; it does not turn it into a current-candidate run.

`green-owner-callers-final.log` reports three canonical test files: owner 54 assertions, HTTP/gateway/CDC/SQLite integration 50 assertions, scenario fixture 5 assertions, for **109 passing assertions**. `green-scenario-diagnostics-final.log` separately reports the five scenario assertions. These exact sources are preserved except for the equivalent captured-intrinsic scenario-test delta.

The integration test reaches the real Fastify route, semantic owner, gateway and CDC mutation builder, with an actual SQLite database. Its SQL execution and authoritative-read transport are deliberately bound to that same database by the fixture. It proves those compositions and immutable replay; it is not a distributed leader or physical network witness.

The original RF3 native test is preserved in `test/raft/raft-rs-backend/log-marker-partition.test.js`. The recovered final log and existing raw TAP report a passing real three-replica held-delivery witness. The final fixture fences native group packets, witnesses the actual first marker APPEND, observes uncommitted/unapplied state with the owner unresolved, then releases the original packet and proves committed convergence and exact replay. Earlier native attempts failed a fixture predicate that incorrectly demanded two APPEND observations while the sender awaited the first; they are retained as fixture failures, not reclassified as product evidence.

Final native log SHA-256: `e919df7e816e57c77df65416540081d62c7e477b307c50b5a1a0680521bfb15b`. Raw final TAP SHA-256: `85eed80e5733397db71be43118c507b4438cc1ef78097d31fc3ca00cf15c4a90`.

The native fixture's ceiling is deliberate: co-located replicas, held delivery and scheduling control are not the required physical minority-isolation acceptance. No physical split-brain execution is claimed. No marker runtime, native test or local boundary probe was launched by this reviewer.

## H1 — unresolved shared text-representation hypothesis

**Status:** unconfirmed. **Potential impact if reproduced:** a marker can acknowledge an insertion but fail an identical semantic replay because the stored message differs from the admitted original message. The same representation boundary can affect other primitive string fields; scope is not yet proven local. Do not classify the historical green tests as disproving this untested domain case.

Source observations:

1. A message supplied as JSON `"\ud800"` becomes a primitive JS string containing an unpaired high surrogate. Marker admission currently checks primitive type, nonempty length and the 2048-code-unit bound, without a scalar-domain check. The ASCII marker ID itself is protected by its existing pattern.
2. Gateway row canonicalization and CDC `serializeMutationValue` preserve a primitive string. The latter JSON-serializes objects only. Partition statement admission calls the actual prepared statement with the parameters, without validating this text representation.
3. Installed `better-sqlite3` 11.10.0 source converts a JS string through `v8::String::Utf8Value` and binds the resulting bytes with `sqlite3_bind_text`; text readback uses `StringFromUtf8`. That is a representation conversion shared by SQL-bound primitive strings. It is not a marker-specific implementation.
4. The marker's fast applied/count-one receipt returns the intended row without reading back content; on a later uniqueness collision it compares stored `row.message` to the original intended JS string using exact equality.

The predicted discriminator is: first marker with a lone surrogate returns recorded; stored UTF-8/message contains U+FFFD; identical replay returns identity conflict; actual U+FFFD is a distinct control input. This prediction is not a measured result. Paired supplementary characters, a standalone replacement character, embedded/leading NUL and BOM must be included as controls, with stored bytes inspected directly. A raw escaped JSON request must engage the actual HTTP decoder. The broader boundary witness must also compare the shared SQL parameter path and JSON-serialized value path before a repair owner is selected.

### Prior repository occurrence and implemented precedent

`solve/quests/replicated-transaction-decision-and-apply/design-query-begin-uncertain-insert-resolution-2026-10-11.md`, under **Explicit canonical text supersession** (around lines 1714–1734), explicitly withdraws an earlier assumption that every JS string has identical SQLite text identity. It discusses exactly the distinction between attempted unpaired U+D800 and stored U+FFFD, and excludes unpaired surrogates from the proposed identity producer domain. **D9-3** (around 2199–2220) coordinates preallocation, INSERT and stored-byte classification while preserving NUL, BOM, supplementary and other valid scalar text. This file is a proposal, and is not evidence that a shared production fix landed.

Production `src/runtime/oci-host-agent-json.js` already rejects unpaired surrogates during JSON parsing/canonicalization and uses a fatal UTF-8 decoder for byte input. `oci-host-agent-schema.js` also rejects surrogate code points and has protocol-specific control-character restrictions. GitHub path history attributes the parser to commit `3ed153572649dbc5992059cff956d110926867a9`. That owner is a concrete repository precedent for explicit representation-domain admission, but its stronger control-character policy must not be copied blindly into SQL text.

### Primary comparable-system sources

SQLite's [Invalid UTF Policy](https://www.sqlite.org/invalidutf.html) expressly provides no exact text preservation guarantee for invalid UTF and leaves text-format validation to applications. PostgreSQL's [JSON types documentation](https://www.postgresql.org/docs/18/datatype-json.html) documents rejecting invalid surrogate pairing when converting JSON into its typed storage representation. [RFC 8785 section 3.2.2.2](https://www.rfc-editor.org/rfc/rfc8785#section-3.2.2.2) requires a canonicalization error for lone surrogates because replacement can break identity/signature interoperability. These sources support investigating an explicit shared representation contract; they do not establish this repository's runtime outcome or authorize a new endpoint-local restriction.

### Required next proof and review boundary

The sole lab coordinator `/root/startup_lab` has been asked to provide an authorized packet for a tiny actual HTTP/SQLite witness. No local native execution or alternate SSH/lab path is authorized. Preserve exact source and dependency hashes, raw JSON bytes/code units, actual stored BLOB hex, first and replay answers, and all controls. If reproduced, establish the reachable owner/caller census and choose one supported producer/binding policy before proposing code. Do not normalize into U+FFFD, add a marker-only compatibility mode, or introduce a second persistence path.

Apart from H1 and the explicitly unrun acceptance/composition gates, this review found no additional concrete defect in the bounded marker implementation. No source or test implementation was changed by the reviewer.
