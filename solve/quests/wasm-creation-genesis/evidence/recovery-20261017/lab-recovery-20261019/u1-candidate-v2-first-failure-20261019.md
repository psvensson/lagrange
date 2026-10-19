# U1 coherent candidate V2: first executed result

Candidate `8596850d0c323dd410a5705576d30ec414c106e9`, branch `refs/heads/probe/u1-coherent-candidate-v2-20261019`, completed the authorized eleven-file investigation with **FAIL: seven files passed and four failed**. This is the original result, preserved before correction or rerun. It is a source/test assertion result, not an infrastructure or dispatch failure.

## Exact identity and evidence

- Cloud request: `f7f3b357-a5d7-4373-81dc-0d1fb26b6850`, [control post 6260573590](https://github.com/psvensson/harnessd-control/issues/12#issuecomment-6260573590).
- Physical original: [lab #295](https://github.com/psvensson/lagrange-lab/issues/295#issuecomment-6260611075), request `f535bdc9d2486f300287db2e364d6ed0`.
- Physical request SHA256: `2415fc0146a70648262a1cb21129a509950d1f288fb870b77432d661efcc4091`.
- Actual placement: `tv-dator`, exact source `8596850d0c323dd410a5705576d30ec414c106e9`.
- Full tree: `101b7c369e00ab1b4ad3d94061880d4220e0e7e0`. The preceding correction changed three old recovery-stub membership predicates only; it left the candidate's production source unchanged.
- Terminal: COMPLETE, FAIL, exit 1, completed 2026-10-19 05:48:45 UTC.
- Runner total: 11 planned/executed files, 7 pass, 4 fail, **307 runner assertions**.
- Full original log: `lab-295-executor.log`, **144,456 bytes**, SHA256 **`64502dbe564e80b7bff067aeaec3dd173f349c6045f0b04acefc56ed0f3e1c2d`**.
- Raw terminal/request bundle: `lab-295-original-receipt.json`.
- Complete extraction and chunk attestations: `lab-295-failure-analysis.json`.

The original log was fetched through nineteen bounded, nonexecuting evidence requests, physical issues #297–#315, with offsets 0 through 144000. Each request/controller identity, canonical request digest, original job identity, byte offset, returned length and chunk hash was checked before concatenation. The full concatenated length and SHA256 match the original terminal result. No new source execution was used to fill gaps in this result.

## Four failed files

Runner assertion totals include suite accounting and must not be substituted for TAP leaf counts.

| Failed file | Runner assertions | TAP leaves | Passed leaves | Failed leaves |
| --- | ---: | ---: | ---: | ---: |
| `test/service/service-consensus-creation-intent.test.js` | 39 | 39 | 38 | 1 |
| `test/node/runtime-service-bound-route.test.js` | 62 | 54 | 46 | 8 |
| `test/node/runtime-service-handler.test.js` | 39 | 32 | 31 | 1 |
| `test/wasm-service/bound-creation-restart.integration.test.js` | 41 | 39 | 33 | 6 |

The full log contains sixteen failing test leaves across these four files. Parent suite failures are excluded from that count.

### Creation-intent recovery

The R2-E total restart-scan witness fails with `CORRUPT_STATE` in `ServiceLifecycleManager._readRecoverableOperations` at manager line 543 before the test can prove that a malformed row fails alone and a later creation row is inventoried. This needs reconciliation with the total-scan contract. The three named F1 cancellation/admission race witnesses are not the failing leaf in this file.

### Bound routing

The eight failed leaves are:

1. F9 duplicate CREATE during an in-flight HELD re-entry: the duplicate returns `error` where the retained test expects `in_progress`.
2. RV5.2 unrouted request under another operation ID: the observed last event remains CREATE_HELD under the retained operation ID instead of CREATE_FAILED under the new request ID.
3. RV5.2 catch path before a retained resume answer: the fixture's asserted emitter fault was not reached.
4. RV5.3 RESOURCE_CLOSED wake during first START: wake returns `NO_LOCAL_OPERATION` instead of `RECORDED`.
5. RV6.2 same-ID deferred retry: the second return is `error` instead of `in_progress`.
6. RV7.2/P14 permanently failed memo and another CREATE ID: the recorded routing calls are empty rather than containing the new request ID.
7. RV7.2/P15 retired I, duplicate I, later J: memo state is `removed` rather than the old `failed` expectation, while the retained reason is TERMINAL_OPERATION.
8. RV7.1 deferred versus permanent settle: the expected retry routing call was not recorded.

These are observed assertion differences. Their source-versus-fixture ownership was not assumed when preserving the result.

### Legacy handler reconstruction

The persisted-legacy-target restart/remove test returns `error` instead of `initiated` at handler test line 501. This is the only failing leaf in that file.

### Restart and inventory

The six failed leaves are:

1. P-R7 crash cuts across retirement steps: host-2 REMOVE_COMPLETED does not settle within the fixture's declared rounds.
2. P-R8 COMPLETED creation row: memo state is `removed` instead of the old `failed` expectation.
3. P-R11 message/wake around readiness: wake returns `NO_LOCAL_OPERATION` instead of `QUEUED`.
4. P-R12 PENDING reservation retirement: observed reason is `runtime_service_retirement_in_progress` instead of TERMINAL_OPERATION.
5. Independent overlapping startup inventory: later fixture formation attempts to read `raft` on a null replica; the first raw failure does not by itself distinguish stale-inventory production behavior from fixture sequencing.
6. U1 v3 duplicate journal observation: the owner throws a typed error with `outcome: 'CORRUPT_STATE'`, while the test expects `code: 'CORRUPT_STATE'`. The raw diagnostic proves the refusal occurred; the error shape differs from the assertion.

The atomic one-SELECT PENDING-to-IN_PROGRESS inventory witness and exact duplicate-fold witness pass. The duplicate-conflict refusal remains a failed assertion until the reviewed contract and its oracle agree; it is not counted as a pass merely because its diagnostic shows a refusal.

## Seven passing files

| File | Runner assertions |
| --- | ---: |
| `test/control-plane/service-instance-creation-cas.test.js` | 31 |
| `test/runtime/service-runtime-consensus-publication.test.js` | 16 |
| `test/wasm-service/operation-lifecycle.test.js` | 34 |
| `test/service/service-lifecycle-manager.test.js` | 26 |
| `test/service/service-consensus-creation-recovery.integration.test.js` | 2 |
| `test/wasm-service/bound-creation-handler-embedding.integration.test.js` | 3 |
| `test/wasm-service/bound-creation-physical-custody.integration.test.js` | 14 |

The physical-custody file is the preserved fourteen-case oracle that failed 14/14 on unchanged-production baseline #266. It now passes at this candidate. That focused improvement does not discharge the four failed files or additional post-await lifetime/mutation requirements.

## Next gate

The source owner and independent reviewer have the full original log and exact failure extraction. Reconcile each failed contract/assertion, preserve any correction as a new immutable source/test tree, and run the approved focused selection against that new identity. The root is also adding independently reviewed post-await lifetime oracles. No replacement cloud UUID or source rerun has been submitted for this failed candidate, and U1 remains unapproved.
