# Final content-bound review: STOP preservation packet

Verdict: **ACCEPT the bounded evidence and non-main STOP preservation packet; HOLD the prototype and implementation contract.** No source correctness approval, F1 supersession, completed repair, Quest landing, merge, snapshot guarantee or full-release approval follows. No tests or source edits were performed by this final review. This review qualifies my earlier design approval exactly as the retained creation-origin audit states.

Reviewed document hashes (SHA256):
- `STOP-DECISION.md`: `86df6748d7194e365fb349ac839ac538a16c76ea32fc518e0d00c352ee743949`
- `RESULTS.md`: `9fce90cdae866c1d2cdd8b13c424575ab53690520bc85bfb282ef07cdbb450d0`
- `evidence/checkpoint-identities.json`: `f71f8d986c13e053d5954b710982325f0800c48877924be54d0cd8d87eb4dea3`
- `evidence/recreation-first.tap`: `f14476a5a5e0f648f8bfcbd02d0365fa8145f2ba2ee20fbdd262fe6624470b22`
- `evidence/recreation-request.json`: `0b3b3d0a5630fa76aa318a32a1e81313c654fe446de52b7dff04c3f52cb90f18`
- `evidence/recreation-summary.json`: `7bbcb7b004f407135391fb8b33afcfa3213bea4f969cdb0d27a935e9ad1da167`

## Identity and preservation checks

Base cdcb9c95f4bdb90e709ed4d20058b51cb193625f; test-only checkpoint26cded6cb74594b8d38bce24e6a862302b605e23; executed frozen source9b53962f2e7b8402b2a6a02a4a24b45985cd3563. The latter is current HEAD during review. All33 `checkpoint-identities.json` file entries were independently checked against `git show` and `git rev-parse` at the frozen source: SHA256, byte count and Git blob all match. The manifest describes that frozen checkpoint, not later append-only evidence documents.

The test-only checkpoint has no src changes against base. No src/test working-tree differences against frozen source were present. The base-to-source diff has no src/raft changes and only the six new WASM test/fixture files plus test classification/impact metadata under test/. Thus original WASM fixture/test, F1 and W07 witnesses are unchanged, as are the original runtime bytes. No ratchet/baseline path was changed. The new static debt is not hidden in an altered allowance.

Fresh read-only shared-checkout check: HEAD0996d7576516af24f5f4d3e1e9aee37c775aabae, 18 staged paths; binary staged diff SHA2560b2ea79142a13f4dcada523f01108fbd8a4809492838e23f7a0246a7159953fc, exactly matching the manifest. This observation is not a future ownership lease.

The recreation test retains pre-reviewed SHA2569edc4b49f2de67da1c3cfce310b171a36e8329437c4c2b189a97db0ac480ec1f / blobd9c116f6493da4a8b6a7c462e3a39ae3cd9f5ca4. Mirrored TAP/request/summary are byte-identical to `/tmp/lagrange-wasm-writer-v1-20261016/recreation-first` originals. Historical reviews remain preserved; their earlier approval is explicitly qualified, not rewritten into an unbroken approval chain.

## First result checked against raw evidence

The request selects exactly one file, frozen source above, lenovo-laptop, retry0. Discovery records Nodev22.23.2; run.log records exact placement-head, existing classified executor, ordinary lane and 663ms classified file duration. TAP reports tests3/pass2/fail1/cancelled0/skipped0; exit file1. The sole failure is `OLD_WRITER_REVIVED_AFTER_RECREATION`, actual true/expected false, at test line104. There is no missing symbol, import/schema failure, setup timeout or shutdown failure substituted for the semantic discriminator.

The raw diagnostic records original and fresh INIT/ENROLL/WRITE all RECORDED/accepted; all three old canonical commands equal their original application inputs; fresh incarnation is old I, with original slot/generation/sequence and actual KV value. Intended INIT J is explicitly `ordered:false`. Original closed DB hash07213354e50bb78d0a8769fb6fea41c12ab05081958904ff3a82291ea6a46165 was checked by the assertion preceding the failure. Same-file control returns original receipt index3 at supplied replay position4 and unchanged application observations; different-service control returns WRITER_INCARNATION_MISMATCH for all three inputs with unchanged state.

For inspection only, Node TAP's diagnostic backslash escaping was decoded before parsing nested slot JSON; retained raw bytes were not normalized or rewritten. The original assertions plus raw diagnostic support the stated claim. No re-execution was done by this reviewer.

The report correctly calls this a defect in the NEW proposed INIT contract/prototype, not an attributed predecessor regression. It is conditional on authorized fresh creation retaining serviceId. It does not demonstrate a native RF3 delivery schedule, completed product recreation, automatic loss/deletion of old storage, process crash, acknowledged data loss or snapshot installation. Clean same-file reopen is accurately distinguished from those stronger claims.

## Category-complete final evidence audit

Harness fidelity (6): (1) named intended assertion reached; (2) actual SQLite/state/KV application, not native consensus, clearly labelled; (3) synchronous finite schedule, no fabricated timers; (4) exact canonical inputs and supplied positions printed; (5) real accepted outcome plus KV excludes vacuity and controls establish retained/different-identity behavior; (6) exact committed source/test and host artifacts bind the execution. See test:42-55,77-104,110-145 and raw TAP. All support bounded evidence acceptance, not source approval.

Owner interaction (10): (1) application owner supplies result, (2) missing creation-to-INIT binding is named, (3) revival and retained-file/different-ID controls preserve competing distinctions, (4) old A precedes UNORDERED J rather than pretending J authoritative, (5) pressure is explicitly unproved, (6) no wake claim, (7) SQL/hash diagnostics are observations, (8) no predecessor or source-only-negative attribution, (9) fresh-file premise explicitly excludes a hidden raw wipe, (10) manifest/Quest receipts remain failed and final source obligations open. STOP-DECISION names the existing creation/lifecycle/application owners, requires an authoritative current creation binding at admission/application with recovery, and alternatively permits only an explicitly enforced never-reused serviceId rule. Neither alternative has silently been selected or implemented. This is a specific owner decision rather than another policy inventory.

Admission (7): (1) actual state.apply evaluated current DB, (2) exact RECORDED versus REFUSED results retained, (3) no budget change, (4) actual owner reason shape retained, (5) no hold-release proof inferred, (6) fresh versus retained state explicit, (7) diagnostics identify actual old/new intents. Missing creation-origin admission is the finding; passing unrelated admission gates is not inferred.

Recovery/replay (5): (1) original file bytes preserved, (2) separate fresh/reopened files discriminate the tested cases, (3) participant enlistment is N/A, (4) exact same-file replay passes, (5) absence in a deliberately NEW file is not presented as proof of safe resurrection. Retained outcomes, full restart recovery, late commit, snapshot installation and creation-origin recovery remain source-proof obligations.

Concurrency (5): synchronous component order only; no async claim/CAS, post-await TOCTOU, competing winner, timer-reentry or application resource-lock certification. Existing locked lab execution owns the host. Lifecycle old-captured-instance versus newly delivered retry is distinguished by source audit, not by this test's fabricated callback.

Transport (5): no ACK/processing, late reply, result classifier, missing-handler timeout or production-router proof is claimed. Supplied positions are component inputs. Unexecuted RF3 companion's pre-run approval remains separate and cannot be promoted to a pass.

Retry (7): no new loop or registered wake is exercised; finite three-command application; stops are assertions; no mutual suppression; bounded input count; exact replay control only; no reset-on-ACK claim. Retained old intent reuse is the counterexample, not evidence that production retry custody is fully implemented.

These category findings incorporate the previously preserved full design-v1/v2, ownership, INIT audit and both pre-run reviews. They do not rerun or replace those earlier records.

## Static qualifications and unproved source

`source-commit-first.log` confirms six new literal findings; six decision findings with four baseline matches; three scoped complexity violations (validateCallerRecord20, submit19, validateSlot18, limit12). Inventory refresh reports aggregate complexity and duplication exceedances, without proving all duplication attribution. RESULTS accurately preserves these qualifications. Impact audit records63 contracts/34 coupled pairs. Source-lint-third is an empty successful-output artifact, so its exit0 is the principal's recorded execution status, not a new independently rerun lint result.

`.githooks/pre-commit` and solver-runbook167-169 explicitly permit WIP-only preservation; source-commit-wip records that route after normal refusal. This is not a green gate or landing authority. Test-only inventory deferral is also an explicitly documented hook option. No ratchet increase was found. The failed receipt file still contains eight false proof entries; this review must not turn `independent-final-review` into a product correctness pass or close the Quest.

Unexecuted proof remains: real RF3 v1 completion and exact completion-only source negative; register-before-synchronous-apply and afterRollback behavior; lifecycle/timeout late-application custody; canonical maximum encodings/count/byte limits; A/B/A and conflicting content/ack/recycle orders; durable caller CAS/retention; same-current-format process loss; actual fresh-creation authorization; supported shared snapshot/application import; affected test cone; final full source review and all new static debt. ASYNC/TIMER compatibility is also not certified by this packet.

## Stop boundary

Publish only as reviewed HOLD/WIP preservation, with exact final publication identity supplied by the publisher. No archive hash or remote publication has been independently verified by this review because publication follows it. No additional source correction or execution is implied. The next approval must settle the concrete creation binding/reuse owner contract; the conditional counterexample remains immutable evidence. Runtime increment/F1 supersession, complete release successor, shared-control-wave, Runner/TAP and PR122 retain their previously stated boundaries.
