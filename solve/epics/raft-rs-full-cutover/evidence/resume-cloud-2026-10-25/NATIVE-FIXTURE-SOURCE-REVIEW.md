# Native queue fixture migration: independent source review

Reviewer: `subagent:/root/admin_review`. Author: root. Base: `709dc2bebd4abdbec9a5d4fb2232c2621d7897f7`.

**Verdict: APPROVE the seven-file source delta for the bounded fixture correction. Runtime acceptance remains pending the focused canonical proof and affected native witnesses.** No implementation correction is requested. No runtime test was executed by this reviewer. The review must not be recorded as W7/W9, distributed CDC, native acceptance, or release approval.

The exact seven staged file hashes and patch SHA256 are recorded in `native-fixture-reviewed-source.json`. All seven working files matched their staged bytes when inspected. `git diff --cached --check` passes. Root may bind the eventual normal-hook commit to these file hashes; additional source changes require a scoped follow-up review.

## What is approved

Each of the six native transport queue overrides now returns `Promise.resolve(buildDeliveryEnvelope({acknowledged: true}))` after its unchanged cloning/enqueue operation. The sole transport owner produces the canonical outcome; no fixture builds an imitation `{transport, answer}` envelope or asks the runtime to accept an old representation. The default application answer is null.

The six corrections exactly match the stop handover's census: message-group custody, message-group provisional route, WASM strong-write, WASM creation-bound, retained bootstrap, and bound-creation embedding. Non-native application delegation in the message-group fixtures is unchanged. The queued native bytes, hold/release schedules, original recipient dispatch, fixed round budgets, timers, lifecycle/setup checks, durable-read assertions and cleanup logic are unchanged.

The two adjacent retired-address responses now use the same builder with their original `{acknowledged: true, noHandler: true}` facts. In the canonical owner, `noHandler` prevents delivered classification even when acknowledged is true. The result remains FAILED/NO_HANDLER with a null answer. These responses belong to the later pump dispatch and its awaited/discarded response; they are not changed into successful queue custody. The no-throw scheduling behavior remains intact.

The existing peer-delivery test adds the specified actual-owner discriminator. With raw `{delivered: true}`, the first native message enters the controlled queue, the real `sendMessages` owner records one failure, and the remaining message to that peer is suppressed in the same batch. Replacing only the returned value with the canonical envelope lets the next batch enqueue both messages and clears prior peer failure observation. The test explicitly asserts null application answer. The retired-address facts are added to the existing failure matrix, which asserts non-delivered classification and same-peer suppression.

## Checklist results

| Checklist item | Result and evidence |
| --- | --- |
| ACK versus application | Preserved. The six queues supply only custody facts and no handler answer. `buildDeliveryEnvelope` owns the delivered state; the new discriminator asserts `answer === null`. |
| No-handler classification | Preserved. The two retired-address fixtures retain `noHandler: true`; `classifyTransportDeliveryState` rejects delivered classification and the existing test matrix consumes the resulting envelope. |
| Late responses and retained obligations | No change to response waiters, deadlines, retry identities, retained creation obligations, native handlers or wake ownership. This fixture-only delta does not establish those broader properties. |
| Undeliverable behavior | The changed retired-address path still resolves immediately, now with the canonical typed failure. Existing loopback handler delegation is untouched. No new waiting or retry owner is introduced. |
| Stub fidelity | Uses the sole production builder at the exact immediate queue-result seam identified by `native-fixture-census.md`. The queued schedule remains explicit fixture custody, not recipient application or network delivery certification. |
| Red for the right reason | The new negative input is intentionally raw predecessor shape. `sendMessages` really receives it, records FAILED and suppresses the second same-peer message. The positive uses the same queue, group and two-message batch, changing only the result representation. Source engagement is explicit; execution is pending. |
| Treatment fidelity | Six direct returns change to the prescribed owner builder, without modifying consumers, queue geometry or pass criteria. The negative raw result is confined to the explicit discriminator. |
| Time and field fidelity | Original cloned native envelope/options, counters, round constants, timer advances, withheld-response selection and release behavior are unchanged. No fields are omitted from the queued message. |
| Vacuity | The discriminator uses two messages to one peer and observes both queue contents and owner failure counters; it cannot pass by testing an empty queue or unused callback. Native acceptance assertions themselves are unchanged. |
| Entry-path fidelity | The focused discriminator calls the actual `sendMessages` production function. The six fixtures still instantiate their original MessageGroupService/WasmServiceReplica/native consensus owners. This trace is source inspection, not a newly executed native witness. |
| Evidence ceiling | No network, physical-machine, compiled guest, W7, W9 or whole-D1 proof is created by this source review. Required native witnesses retain their original acceptance oracles and must be classified by actual reached path. |

## Required proof before integration acceptance

Run `test/raft/raft-rs-peer-delivery-transport-outcome.test.js` through the existing canonical classified test runner, with retries disabled, on the exact committed candidate. Then use the handover's 18 actual fixture construction paths for affected native checks; shared scheduler imports alone are not additional constructors. Preserve the first failures and distinguish setup-not-reached from a semantic failure. Existing higher-level acceptance obligations remain open regardless of this narrow repair's result.

This report approves no change to production transport classification, no compatibility decoder, and no relaxation of original acceptance tests or operational controls.
