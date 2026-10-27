# U1 F1 independent executed-evidence verdict

Reviewer: `subagent:/root/f1_independent_review`, 2026-10-19.

**APPROVE the bounded F1 executed gate at `77a888af01f13e30052135075964c6508b1d0b24`. The positive three-file run and all three required source-only negative controls have now been independently matched to their original receipts, complete rehashed logs, exact source placements and frozen test bytes. This closes the execution condition left open by this reviewer's F1 source verdict; it does not approve combined U1, U2, activation, merge or release.**

This is an append-only execution addendum to `u1-f1-independent-source-verdict-20261019.md`, SHA256 `d919a4e780442013bfbea82025c866665bf12f5122f7263134c73ab493d18ab0`. No historical report, control manifest, source or test was rewritten. No behavioral test was run locally.

## Exact source and test identity

| Identity | Value |
| --- | --- |
| Corrected positive source | `77a888af01f13e30052135075964c6508b1d0b24` |
| Full corrected tree | `240db7714a4979c87aea8f70d28e20e9119f7359` |
| Corrected production tree | `e0414db30f6d4dbd253e019fe0b0d02d27891024` |
| Complete unchanged test tree shared by positive/control candidates | `ddbddb24eaa9cf720425fc175ef7b54665ccefce` |
| Detailed evidence binding | `u1-f1-executed-evidence-bindings-20261019.json` |
| Evidence-binding SHA256 | `3c0076d1e08e4353b594992198a8653440394568020902d763475f6492d9e835` |

The new JSON binds every original terminal receipt, full reconstructed executor log and lab chunk/leaf analysis by byte count and SHA256. It also records original request IDs/digests, local and remote control SHAs, full control trees, the sole changed production path and all failed leaf names. Local Git object checks independently confirm that each control changes only its declared source file and preserves the entire positive test tree. Root reported exact equality between each published remote tree and its local control tree; this reviewer did not independently fetch the remote Git objects. Each original lab log independently names the corresponding published full source SHA as its placement head.

| Complete positive test file | SHA256 |
| --- | --- |
| `test/control-plane/service-instance-creation-cas.test.js` | `89c957763a687fda76dd0ab25b8cda7eec31dcd831dfafa595c734fd2e81cead` |
| `test/service/service-consensus-creation-intent.test.js` | `f307c5996759cf401df56fc344b4a82905213bb7fe22dede99a0182062fcb7fc` |
| `test/node/runtime-service-bound-route.test.js` | `86db89475ed02c1362b0560c05cd4c22159cf56d145cdfb9bce97edd46ae6358` |

## Original positive execution

[Lagrange lab #235](https://github.com/psvensson/lagrange-lab/issues/235) is COMPLETE/PASS on tv-dator at the exact corrected SHA, exit code 0, finishing `2026-10-18T20:19:53Z`. Its complete 1,304-byte log has SHA256 `a1372b5c0421f99197126ba7a70d587a49d64e9e8a439ae71dee711849bb3824`; it is explicitly untruncated. All three selected files pass, with 123 runner-reported assertions: 39 intent, 31 CAS and 53 bound-route.

Original request `e7e09dcb4fdcba1a0d30d41d037ff259`, request digest `10f5a1714247c99b32f7d6b3fe6a669e65c08a634b5eef844c279e551a456b39`, matches the retained terminal record. Raw files are `lab-recovery/lab-235-result.json` and `lab-recovery/lab-235-executor.log`.

The prior independent source verdict already audited the original historical race preservation and the paired positive progress assertions. This execution runs those exact complete files; it is not inferred from unrelated tests or from a later handler-file revision.

## Three original negative controls

All three are **deliberate expected failures and excluded from the positive population**. Each selects only the complete unchanged intent test file. Every log contains all 39 numbered test leaves, with zero cancelled, skipped or todo tests. No import, setup, missing-interface or timeout failure was substituted for a named behavioral failure.

| Control and original lab job | Exact published source | Observed result and direct oracle |
| --- | --- | --- |
| M01: seal temporary occupancy; [#262](https://github.com/psvensson/lagrange-lab/issues/262) | `6dd2690d494ef959a6f94712281a2703581eebb5` | 37 pass, 2 fail, exit 1. Both preserved TARGET_ALREADY_OWNED and INVALID_EXPECTED_STATE delayed-original cases fail `CANCELLED_JOURNAL_WITH_DELAYED_ADMITTED_RESOURCE: unresolved obligation lost` at intent test line 412. |
| M02: seal an absent future binding; [#263](https://github.com/psvensson/lagrange-lab/issues/263) | `b4dd1c2dddc9da21539078f243fcae4ad90055a0` | 38 pass, 1 fail, exit 1. The STALE_BINDING-before-future-selection case fails `FUTURE_BINDING_CANCELLED_BEFORE_EXACT_REQUEST_BECAME_ADMISSIBLE` at line 456. |
| M03: restore outcome-name cancellation for untagged replies; [#265](https://github.com/psvensson/lagrange-lab/issues/265) | `48349777471f8cdb7c7c46020d1703960404116a` | 38 pass, 1 fail, exit 1. The missing/UNRESOLVED-tag consumer case fails `CALLER_RECONSTRUCTED_FINALITY_FROM_OUTCOME` at line 486. |

M01 changes only the two temporary reservation refusals in the deterministic resource owner from UNRESOLVED to SEALED. Both failures include actual diagnostics: the same original journal is cancelled, its admission field remains absent and that original immutable resource request later becomes ADMITTED. The other 37 tests pass, including the future-binding and untagged-consumer cases. This directly measures the obligation-loss mechanism the correction prevents.

M02 changes only absent-binding classification to seal the still-future request. The complete log shows exactly one failed leaf. The diagnostic contains RESERVATION_CANCELLED/STALE_BINDING, an original retry observing terminal cancelled journal state and an actual resource for that same original operation in ADMITTED phase. Both occupancy races and the consumer-tag case pass. The failure is not merely a different diagnostic string: the journal/resource contradiction is present.

M03 changes only the consumer predicate to accept the former outcome-name list when finality is missing. The failure is the first untagged STALE_BINDING subcase: the real REMOVE resolution returns RESERVATION_CANCELLED where UNKNOWN is required. The intended actual-versus-expected object difference is visible in the full log. Because that assertion stops its leaf, this control does not claim that every later loop subcase executed on the mutant. The unchanged positive run executes the complete tagged/untagged table, while this source-only control demonstrates that reconstructing finality from the old outcome list is detected. Both occupancy races and the future-binding race remain passing on this variant.

| Original log | Bytes | SHA256 |
| --- | --- | --- |
| `lab-recovery/lab-262-executor.log` | 23,938 | `ea33b44ba655790999fe980f59fd5a8dbd28511cdfb75573ff4408004446251e` |
| `lab-recovery/lab-263-executor.log` | 29,403 | `855a3b04cbcf61e7b60018963d95900f729802ab1ea9bd53101501dc3641570c` |
| `lab-recovery/lab-265-executor.log` | 32,086 | `051a1c6c7ea6db1d9df38dfabea5398b1295db6ce3c23a987eaad7d4dd9a2edc` |

Original request bindings are M01 `aec74bb83bd22df29b7571219be90751` / `740bc7f5237a8bd1d5332f401f76a77a7d303540a882eaaafd08210aae86207d`; M02 `c5b282c6be733f98d74d44e07885c286` / `0a580dcd15c97e14a95ef6249302454da2819960f78281982c3fbe1e37b8039d`; and M03 `e950f281d938f6b0686cd3fd2ec81088` / `741e4c6862759dd210ccc4ea048cb86500a1105f835c61a12059f11d5213a820`. The exact original receipts and chunk attestations are retained beside the logs; no duplicate replacement run was needed for this verdict.

## Scope of acceptance

The source review plus the inspected positive run and three meaningful controls satisfy the preserved **bounded F1 reservation-finality** execution condition. The finality owner, token retention ordering, explicit cancellation consumer and terminal rereads remain the source claims reviewed in the earlier report.

The fixture uses real component SQLite journal/metadata owners and the handler sequence's explicitly scripted physical runtime. This is not distributed metadata consensus, native physical retirement, cross-node wake, abrupt-process recovery or activation evidence. The broader U1 correction changes the inventory, physical lifecycle and completion interactions and requires its own same-source tests and controls. Later test-only and source changes do not inherit full-file positive results from this checkpoint. The historical rejection and separate negative-control refs remain preserved and must never be merged as product code.
