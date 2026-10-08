# Snapshot owner unsealed draft materialization update

Authority inputs now reflected in the three-file unsealed draft:

- v7 proposal `/tmp/raft-rs-takeover-20261008/raft-rs-partition-snapshot-owner-dependency-decision-v7-gpt56.txt` SHA256 `800b8cfeb0c586978a487aac5b347e52f69dfc1089877eb5b7dfc3823e94308c`, with draft-materialization approval `/tmp/raft-rs-takeover-20261008/raft-rs-partition-snapshot-owner-dependency-decision-v7-astra-review.txt` SHA256 `841489103ebee438eb4d8fc8979bc17cfe0ecfa78fbfecc66220b5c065060513`.
- Format v2 `/tmp/raft-rs-takeover-20261008/raft-rs-application-image-manifest-native-binding-v2-astra-design.txt` SHA256 `382b203221c9dd73656a8d53df0cd0343bfb8e3f4d36861614e310d5b7b65e1b`.
- Native owner transitions v3.1 `/tmp/raft-rs-takeover-20261008/raft-rs-application-image-native-owner-transitions-v3.1-astra-design.txt` SHA256 `80d522e572c81dfee7e35272edec8d6cf6686c9fd9e7a46a35dd3935a2539d01`.
- GPT-5.5 three-file review `/tmp/raft-rs-takeover-20261008/snapshot-quest-three-file-draft-v2-v3-gpt55-review.txt` SHA256 `a7c685a94ad0c9de967a3c42e505fb33fd10eec79ddcdf78a688dc2f206e7354`.
- R4 future witness report `/tmp/raft-rs-takeover-20261008/snapshot-r4-local-open-future-acceptance-gpt56-report.txt` SHA256 `980f63864812b55571cd786922c78119eb6e3c3441dfdaf14328827b9b886c5c`.
- R5 independent verdict `/tmp/raft-rs-takeover-20261008/r5-owner-matrix-v2-independent-review-gpt56.txt` SHA256 `3efc167236e07212c033de58c71cf21f7a52ba8ba316fd28673626d38273b73c`.
- Historical Path B v1 `/tmp/raft-rs-takeover-20261008/snapshot-path-b-seven-receipt-plan-gpt55.txt` SHA256 `87b71f132644005e70686de0ae403cbc2ac81df3a2b88a10bf53b86bd75fc4be` is rejected as final catalog; successor v2 `/tmp/raft-rs-takeover-20261008/snapshot-path-b-seven-receipt-plan-v2-gpt55.txt` SHA256 `763b7eb57909819635b5fa9ecba4d8494734cb5184e481f26239ca6305fe1f33` closes only the three named corrections; consolidated v3 `/tmp/raft-rs-takeover-20261008/snapshot-path-b-seven-receipt-plan-v3-gpt55.txt` is the current GPT-5.5 catalog draft for review.

This note and the paired JSON files remain **unsealed planning only**. They do not start or seal the Quest, authorize source/test/metadata/receipt edits, promote any partial diagnostic to a receipt, commit, publish, close the epic, or unpark FreshMG. The status remains `UNSEALED_FALSE`.

Materialized corrections:

- Keep LOCAL_OPEN, KNOWN_WIPE, INSTALL_ADMISSION and READ_UNAVAILABLE as separate gates.
- Use one coupled Quest for sender private Storage publication, transport feedback/staging, receiver native Ready and atomic application import. A sender-only predecessor is not sealable here.
- Before sealing/source: independently approve exact owner interaction and scope, seven concrete future-green suites using the existing `scripts/quest-evidence/harness-runtime.js` runner, external exact-baseline manifests, and at least one genuine owner red. After sealing/source: exact-candidate all-required greens, semantic revert/crash mutants and independent final verification precede landing.
- The untracked custom digest/result generator is excluded from Path B evidence. Baseline reds are measured by the existing runner and may produce failing receipt output; external manifests bind and classify those fail receipts. Do not fabricate pass receipts for reds or suppress runner output.
- v2 image shape is exact: singleton `raft_rs_checkpoint_manifest(manifest_json)`, canonical M with payloadVersion 2 and no membershipEpoch, descriptor D with membershipEpoch as the routing/publication freshness fact, and native data N as `{bindingVersion:1, checkpoint:C}` with membershipEpoch omitted. Canonical wrong generation mutates only D while payload bytes/M/N remain unchanged and must yield `CORRUPT_PAYLOAD` plus `RAFT_RS_CHECKPOINT_REASON.MANIFEST_GENERATION_MISMATCH` after structural descriptor validation stays `VALID`.
- Source publication is private Storage, durable-first and proof-gated. Stable cluster identity for new v2 authoring comes from the existing authoritative CONFIG owner-RPC path. Cache/default/local SQL fallback cannot seal immutable identity. `MemStorage::apply_snapshot` remains receiver restore only.
- Real native MsgSnapshot attempts use private runtime attempt ownership, unchanged packet handoff, `report_snapshot` finish/failure, bounded retry/reconcile and `RawNode::ping` liveness nudges. Caller flags, fabricated Ready and handcrafted packets are not authority.
- Bulk VALID/STAGED without matching native snapshot is `AWAITING_NATIVE_SNAPSHOT`, preserving service and releasing lanes without pretending native rejection or install. Actual native non-admission and binding mismatch are separate refusal branches.
- Receiver acceptance requires actual Ready with the exact N and an atomic same-main-DB transaction for application import, Ready durability, applied/config state and completion binding before acknowledgement, exposure or advance. Same-service continuation after owner-controlled projection rebuild is allowed; separate debt marker or mandatory re-registration is not claimed.
- R4 final scope is the supported local-open/known-wipe/cold-restart matrix. It requires per-fact no-unsafe-install/no-participation, legal vote0/coherent-lag positives, read-unavailable separated from absence/HOLD, same-byte known-wipe HOLD replay, and three-voter cold restart. Historical old whole-DB clone rollback diagnostics are excluded from final receipt coverage.
- R5 remains a bounded fresh-CREATE/component receipt: REPLACE source retention, genuine branded A/B evidence and physical-worker claim cross-wire, late A CREATE/admission fence after A closure and B admission, exact-generation cleanup preserving successor B bytes/artifacts, and settlement/cleanup/deletion separation. It does not prove v2 application-complete compatibility, full FreshMG, off-seed workflow, or source retirement.
- Identity81 exact-generation successor cleanup boundaries remain unchanged where cleanup is in scope. Cleanup uncertainty preserves the replica but cannot become install authority, deletion authority, lane release, or indefinite operation-settlement blockage.

Known unresolved owner decisions before seal/source:

1. R3 and R7 still need executable real source-to-target owner paths after the v3.1 publication/transport/receiver contract lands.
2. R4 durable group mismatch currently exposes a missing exact local group-binding owner; final source must use an approved existing binding or an explicitly reviewed owner extension.
3. R6 genuine sender MsgSnapshot refusal remains unmeasured on exact82b54 until production emits a real native packet; tests may delay/drop authentic packets but cannot synthesize Ready.
4. R5 v2 fresh-CREATE compatibility remains separate from the approved payloadVersion1 component matrix.
5. Path B harness work remains future work and must bind raw logs, hashes, owner-entry classification and independent review outside the binary receipt probe.

## Path B review correction

Astra rejected the earlier Path B plan wording where it could be read to allow final R3 through direct `requestSnapshotInstall` without actual receiver native Ready, to tolerate absent/BLOCKED R7 at seal, or to prohibit runner baseline receipt output. This draft now treats the old CREATE-gate/requestSnapshotInstall red as historical component evidence only; final R3 must exercise an actual receiver-native accepted Snapshot in Ready. All seven concrete future-green suites, including R7, must exist before Quest seal. Baseline reds are measured with the existing `harness-runtime` runner and may produce failing receipt output; external manifests bind and classify those fail receipts instead of fabricating pass receipts or suppressing runner output.


## Astra three-file and Path B v2 correction

Astra review `/tmp/raft-rs-takeover-20261008/snapshot-quest-three-file-and-path-b-v2-astra-review.txt` SHA256 `b3e6340fb82094fd32a520713a137018c6c22c6bfdacad203f3b0420ab65cfc7` rejects two authority/retention sentences and otherwise treats this as unsealed planning only.

Corrections materialized here:

- Pending image stage or cleanup uncertainty never grants operation settlement, membership cleanup, deletion, member-lane release or install authority. Terminal operation settlement stays with its operation owner and must not be indefinitely blocked by snapshot staging or cleanup uncertainty. Unaccepted stage expiry cleans only the exact transfer-owned pin/marker and does not settle an operation or delete a replica/successor artifact.
- R6 refusal no longer forbids all staging deletion. Refusal causes no application import/swap, destructive shutdown, local lifecycle change or accepted-install marker; previously verified unaccepted staging may remain for its exact finite lease or be released by the transfer owner, and expiry/cleanup is limited to that exact stage/pin.
- Endpoint v3.2a `/tmp/raft-rs-takeover-20261008/raft-rs-application-image-native-owner-endpoints-v3.2a-astra-design.txt` SHA256 `51d59c047919556970a6f230bfe00348e54a6ada043fb30a97e5d71b4022aa9a` is bound only as pending endpoint design: SERVICE_RESPONSE/local handler completion for MsgSnapshot Finish, durable whole-file lifecycle preflight before registry/mint/core, existing HOST_FAILURE/DURABLE_RECORD_READ for unreadability, combined receiver transaction API, and `payload_version_unsupported_for_create` for deferred v2 CREATE.
- Path B v1 `87b71f...` is historical/rejected. Path B v2 `763b7e...` closed only the three named corrections and is not a complete final catalog. The consolidated catalog must remove inherited FreshMG/automatic-trigger R7 wording, whole-cell PASS dependency gates, shell/digest ambiguity and missing finite pending/report schedules before preseal review.
