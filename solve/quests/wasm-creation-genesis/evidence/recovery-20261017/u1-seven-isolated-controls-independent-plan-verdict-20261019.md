# U1 seven isolated controls: independent plan verdict

Date: 2026-10-19. Reviewer: `subagent:/root/lifecycle_design_research`.

## Disposition and execution prerequisite

**APPROVE** the seven proposed isolated source-only controls below, as a
bounded experiment plan. Each targets a distinct current guarantee and has
a direct discriminator in the reviewed test bytes. No source mutation or
behavioral execution was performed by this reviewer. No predicted outcome
is an executed control result.

Root will first obtain the full positive result at one immutable corrected
candidate. The baseline must contain the independently reviewed one-guard
generic REMOVE correction and complete test tree, with the exact reviewed
physical/strict-read/handler hashes below. Each control must preserve that
entire test tree and differ from the positive source only in its declared
owning production file. Preserve the actual patch, source/full/test tree
identities, placement, terminal receipt and complete first result.

## Approved seven-control matrix

| Control | Exact isolated change | Meaningful discriminator and isolation argument |
| --- | --- | --- |
| NC-MANAGER-PREPARE | In `service-lifecycle-state-record.js`, allow `STATE.STARTING` independently of the original `permitted` expression; retain the original expression for every other state and retain all capture/current-observation calls. | The actual READY-return case must first fail J's manager-record reference/value preservation. I's subsequent driver start remains refused by its unchanged descriptor/currentness guards, so the control isolates the earlier manager write. |
| NC-MANAGER-CONFIRM | In the same file, allow only `STATE.RUNNING` independently of the original `permitted` expression; retain the other states and all owner calls. | Only the actual PUBLISHED-confirmation return can perform the stale RUNNING write in the named witness. The READY-return STARTING guard remains intact. J's exact manager record must fail before the per-request PUBLISHED carrier is checked. |
| NC-DRIVER-PUBLISHED | Remove only the currentness-refusal block in the PUBLISHED branch of `projectBoundStart`; retain kind/token/result mapping, prepared admission and the actual lifecycle call. | The actual physical PUBLISHED answer returns after complete I retirement and real HELD J. The running-set or old-context assertion fails before FAILED/UNAVAILABLE carrier checks. |
| NC-DRIVER-PRESTART | Remove only the physical-currentness half of `startBoundReplica`'s compound admission condition; retain the prepared-descriptor equality check and full origin capture. | The dedicated witness deliberately restores the old prepared pointer after actual J preparation, so descriptor equality cannot mask this missing guard. `OLD_CONTEXT_STARTED_A_SUCCESSOR_THROUGH_SERVICE_ID` now precedes the carrier assertion and must expose the actual forbidden lifecycle invocation. |
| NC-RUNTIME-SERVICES | Remove only the `if (!current()) return stale();` immediately after `await projectServicesRow`; retain the initial currentness check and post-endpoint check. | `LATE_SERVICES_RETURN_INVOKED_RETIRED_CREATIONS_ENDPOINT_WRITER` must fail. The later endpoint owner may refuse, and the later guard may still produce the original stale carrier; neither can conceal that the forbidden next owner was invoked. |
| NC-RUNTIME-ENDPOINT | Remove only the `if (!current()) return stale();` immediately after `await writeEndpoint`; retain the initial and post-services checks. | `LATE_ENDPOINT_RETURN_INVOKED_RETIRED_CREATIONS_PHYSICAL_MARK` must fail before the stale carrier. The physical PRESENT owner may itself refuse I's token; that later refusal does not satisfy the runtime's omitted handoff guard. |
| NC-LEGACY-ABSENCE | Remove only `requireAbsenceConfirmation: true` from the `ReplicaDispatchService` repository-read options; preserve the exact original ID and `authoritativeReadMode: OWNER_RPC_REQUIRED`. | The captured-call assertion requiring `reads[0].options.requireAbsenceConfirmation === true` must fail. The scripted ADMITTED response and all typed response cases remain unchanged. This measures the dispatch consumer's request contract, not a real repository read failure or physical effect. |

For each manager control, implement the intended Boolean expression as
`state === TARGET_STATE || (ORIGINAL_PERMITTED_EXPRESSION)`, with the complete
original conditional parenthesized. An unparenthesized `||` before the existing
ternary would change operator grouping and would not implement this approved
plan. Do not remove origin capture, the synchronous observation or the
STOPPED/STOPPING ownership conditions from the other states. Actual patches
must be inspected against this expression before execution.

The relevant current sites are
`src/service/service-lifecycle-state-record.js:15–27`,
`src/runtime/wasm-component-driver-consensus.js:74–86,103–116`,
`src/runtime/service-runtime-consensus-publication.js:92–119`, and
`src/control-plane/replica-dispatch-service.js:47–64`.

## Why these failures are meaningful

The five actual-return tests first complete the real original owner call,
then complete I's actual handler removal, exact local/resource retirement,
discovery withdrawal and original journal completion. They next select,
retain and create J through the real owners and require a native HELD
successor. Their direct effect assertions precede result carriers, and their
positive tail redrives J. Their approved source construction is detailed in
`u1-reconstructed-post-await-oracles-independent-verdict-20261019.md`.

The dedicated pre-start witness is different: J is legitimately prepared
but not initialized, and the only artificial seam reinstates the stale
prepared descriptor. The source-only control removes the other independent
permission check. The separately approved assertion reorder makes a
physical invocation, rather than a changed status, the first discriminator.

The strict legacy test intentionally uses a scripted repository seam.
Its option assertion is the correct boundary oracle because the real
repository supplies failed-read deferral outside priority recovery only
when absence confirmation was required. This source rationale is in
`u1-strict-legacy-read-contract-independent-approval-20261019.md`; the
control must not be described as executing that repository behavior.

A missed pause, setup exception, unfinished I removal, failed J admission,
import or missing-interface failure, timeout, or assertion from an unrelated
case does not establish the intended control. If a full-file control stops
one case at its decisive assertion, only that actually observed case can
be credited; later assertions in that case did not execute. Keep the
unmodified positive as the complete prerequisite/progress evidence.

## Bindings and remaining scope

| File | SHA256 |
| --- | --- |
| `test/wasm-service/bound-creation-physical-custody.integration.test.js` | `b22348a23a705765b92be5480737b2532d79aa90570fd0209554a2fa83de7d6b` |
| `test/control-plane/replica-dispatch-reservation-identity.test.js` | `0dd845ca42bcdbb3db8851fd610df077438ca145bf15c43d8a039d091be86b17` |
| `test/node/runtime-service-handler.test.js` | `e6fb5b6b658fa855ecabe22689c7e3d7896e783fe68ed7a19a17dc961cb77fe3` |
| `src/service/service-lifecycle-state-record.js` | `25a1d5ea97780205dac204801d097c882365eedd47b99d3f99489653be1fb9f2` |
| `src/runtime/wasm-component-driver-consensus.js` | `b3065d582982d581af810134bf3d74168818b253b83c3c113b84d392b461a0c3` |
| `src/runtime/service-runtime-consensus-publication.js` | `82533d9c688f9c306f243f57f1c9ee3c1e14d4f7457c8c2abab13a0c07e496fd` |
| `src/control-plane/replica-dispatch-service.js` | `385217923b84a9981204398d25b434453d01df709aa09daf429f24c378e04352` |

These current owner bytes were rehashed for this plan. Their four source
files are independent of the generic REMOVE guard move. The final positive
candidate and every control still need complete immutable tree bindings;
this table is not a substitute for the actual final manifest.

This approval does not execute the controls, accept the preceding nine-path
production delta, close every V1–V8 contract obligation, prove asynchronous
in-flight writer cancellation, or establish coordinator reconciliation.
It does not replace the separate generic REMOVE correction pair. U1 final
acceptance and its U2 dependency remain governed by the combined checklist.
