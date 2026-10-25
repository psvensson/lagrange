# H1 shared text boundary — source census and investigation scope

Date: 2026-10-25. This is an independent source investigation of the frozen marker base `6a228ced9439af07216b492bb8fdbba5540c3671` plus its preserved patch. It is not a runtime result, a proposed implementation, or an exhaustive proof that every string owner is safe/unsafe. The companion `REVIEW-MARKER-FROZEN-SOURCE.md` retains the overall HOLD disposition and exact marker bindings.

## One causal question

Can an externally admitted JS string carry code units which change at the shared native text representation boundary, while an owner uses its original JS value as immutable intent or equality evidence? The marker's exact replay makes that question easy to expose, but source inspection does not localize the cause to the marker.

## Traced marker path

`AdminOwnerOperations` supplies the parsed request plus server node ID to `LogsOwner.appendDiagnosticMarker`. `compileDiagnosticMarker` checks marker ID syntax, primitive string message and length; it captures a frozen original row. `SystemMetadataOwnerBase` owns the retry/write identity. The gateway's `canonicalizeControlPlaneMutation` filters to schema columns, and `canonicalizeSystemTableRow` returns ordinary logs rows unchanged. CDC `prepareInsertData` applies existing schema/timestamp defaults; it does not replace the supplied marker message. `buildSystemTableMutationSqlParts` sends primitive values unchanged, and JSON-stringifies objects. The SQL route ultimately runs the prepared statement with these parameters. The actual `better-sqlite3` string binder uses `v8::String::Utf8Value` and `sqlite3_bind_text`; the reader converts SQLite text with `StringFromUtf8`.

The important separation is between original semantic intent, serialized SQL parameter, stored bytes and decoded readback. The pending packet records all four instead of treating a count-one acknowledgement or a decoded driver string as proof of exact bytes.

## Representative reachable owners and representation classes

| Owner/path | Source-observed admission and representation | Consequence for the investigation |
| --- | --- | --- |
| Marker message (`src/control-plane/owners/log-diagnostic-marker-contract.js`) | Nonempty primitive string, at most 2048 code units; raw primitive SQL parameter; exact replay compares original JS string | Direct proposed discriminator; runtime remains pending. Marker ID's ASCII pattern is an existing separate guard. |
| General system-table mutation (`src/cdc/cdc-system-table-mutation-sql-helpers.js`) | `serializeMutationValue` JSON-stringifies objects only; primitive strings return unchanged; WHERE values also return unchanged | A marker-only admission change would not establish the shared parameter contract. INSERT, UPDATE and equality-predicate values all warrant the same boundary classification. |
| Dynamic configuration (`src/config/dynamic-config-service.js`) | Unknown/custom key validation succeeds; string values use `String(value)` and deserialize without JSON; JSON type uses `JSON.stringify` then `JSON.parse` | Existing string config values/keys and JSON config values form different representation classes. Source proves reachability to the shared builder, not measured corruption or a current config regression. |
| Table policies (`src/policy/table-policy-service.js`) | Policy payload uses `JSON.stringify(updatedStoredPolicy)`; table ID remains a separate raw predicate | An object can retain an escaped code unit inside serialized JSON even when the equivalent raw primitive string cannot. Payload safety cannot be transferred to its separate identity fields. |
| ApplicationDatabase (`src/query/application-database-input.js`) | `snapshotBindValue` admits bounded primitive strings unchanged; `snapshotParams` safely snapshots the array and values | The supported typed parameter owner does not currently impose a scalar-text contract. This is broader than marker/admin HTTP. |
| Canonical SQL request (`src/query/sql-request.js`) | Statement must be a nonempty string; parameters must be an array; no scalar validation here | This normalization owner is not evidence that native representation validity was checked. This observation alone does not select it as the repair owner. |
| Partition statement execution (`src/partition/partition-statement-admission.js`) | Admission classifies SQL, allowed targets/functions/conflicts and row-ID behavior; write execution calls prepared `.run(...params)` | Existing statement authority guards solve a different concern. A future representation rule must preserve their ordering and authority. |
| OCI host-agent JSON (`src/runtime/oci-host-agent-json.js`, `oci-host-agent-schema.js`) | Fatal UTF-8 decoding and explicit Unicode scalar validation; separate control-character constraints | Concrete implemented repository precedent. The OCI-specific control-character policy is stronger than the proposed SQL identity domain and must not be copied wholesale. |
| PostgreSQL wire decoding (`src/runtime/pgwire-message-parsers.js`, `pgwire-buffer-codec.js`) | Incoming parameter/cstring bytes are decoded with UTF-8 string conversion before becoming SQL parameters | A distinct representation boundary: malformed wire bytes differ from JSON-escaped surrogate code units. No raw pgwire runtime claim or marker packet coverage is made. |
| SQLite identifiers (`src/query/sqlite-identifier.js`) | Non-simple names are quoted and quotes escaped; no scalar check in this rendering helper | Name rendering alone is not a text-domain guarantee. Complete external table-name admission has not been traced in this bounded review, so no table-name defect is asserted. |

The current-base policy and table-name files predate separately preserved admin repairs. Their source observations identify representation paths; they do not evaluate those newer admin changes or imply they regress encoding behavior.

## Prior occurrence and source-history check

The earlier transaction BEGIN proposal contains the same issue explicitly, not merely a keyword match. Its **Explicit canonical text supersession** section says the claim of arbitrary JS/native SQLite identity was withdrawn and distinguishes unpaired U+D800 from stored U+FFFD. Its later **D9-3** section coordinates scalar-domain admission, native INSERT/schema behavior and original-byte readback while preserving leading/embedded NUL, BOM and supplementary text. The Quest append log at the 2026-10-11 21:48:34.914Z finding records that the round-nine producer-domain supersession was authorized for independent design consideration, **not implementation approval**. The source remains held in that historical finding. This must not be presented as a landed shared fix.

A read-only GitHub path-history query for `src/runtime/oci-host-agent-json.js` at the frozen marker base returned commit `3ed153572649dbc5992059cff956d110926867a9` (2026-07-15), the OCI host-agent activation checkpoint. Current source implements scalar checks. A generic repository commit-message search for Unicode found documentation changes; that limited search is not proof of absence of other historical bugs. The targeted current-tree census found no other production unpaired-surrogate validator besides the OCI owner.

## Comparable systems and the owner decision

Primary sources support treating representation admission as an explicit contract. SQLite documents that it neither enforces UTF formatting nor promises exact invalid-text preservation. PostgreSQL validates surrogate pairing when converting JSON to its typed storage representation. RFC 8785 rejects lone surrogates for canonicalized identity rather than silently replacing them. References and retrieved source URLs are in the companion review.

These precedents do not authorize changing this project's accepted domain. If H1 reproduces, the author must first identify the supported shared text contract and the earliest owner which can enforce it before a durable identity or write is exposed. A last-moment driver rejection can be too late for an already retained/replicated operation; an endpoint-only rule leaves other primitive parameter owners unresolved. Silent U+FFFD substitution, a second serializer/persistence path, a compatibility toggle, or a fallback would not resolve exact identity.

## Pending discriminator packet

`marker-text-boundary-witness.mjs` is an external reviewer packet. It has only been parsed with `node --check`, which executes no imports or native product code. No runtime result exists.

The packet measures ten inputs: ASCII, lone high surrogate, lone low surrogate, high surrogate followed by ASCII, actual U+FFFD, a valid supplementary character, leading NUL, embedded NUL, BOM and decomposed scalar text. Each input goes through direct SQLite, ApplicationDatabase parameter admission, CDC primitive serialization and CDC JSON serialization. It then sends raw JSON through actual Fastify decoding into the frozen marker owner/gateway/CDC/SQLite integration seam, with both a known count and an unknown count followed by authoritative readback. The first answer, identical replay, stored raw BLOB hex/code units, exact count and deliberate U+FFFD replay are retained. Protected marker source, shared source, lockfile, installed driver source and actual native-addon hashes are recorded.

This packet has no native Raft/physical-network claim. The lab owner must bind it to the normal-preserved marker commit, review the runner packet and execute through the authorized existing lab route. No cloud native or direct-SSH fallback is authorized. A failure to provision that route is a capability limit, not a green result and not confirmation of H1.
