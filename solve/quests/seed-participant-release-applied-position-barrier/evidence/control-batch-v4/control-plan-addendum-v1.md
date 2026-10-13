# Applied-position controls V4 plan addendum

Status: **READ-ONLY TEST DESIGN.** This addendum preserves `control-batch-v4-plan.md` SHA256 `47ca5b472bf8dd470cd0e896473089fe0f9b8581406fa4cf4fd490310ac8c088` unchanged. It corrects its proposed settlement seam and restores the explicit C5 older-origin/later-work control. No source, test, fixture, Quest, registry, metadata, behavior, lab input or Git history is changed.

## A1. Correct bounded settlement observation

Do not add the proposed direct `Promise.race([operation, Promise.resolve(sentinel)])` helper. Even a synchronously resolved recovery record still traverses registered receive/route async wrappers; the already-resolved sentinel can win before a correct typed cancellation reaches the caller.

Reuse the existing fixture event-loop checkpoint at `participant-transaction-fixture.js:137`, already consumed by `settleTicks`/`awaitProposal`, and export that one function for the two selected tests. Before the owner mutation, install the existing passive `track(operation)` record. After the synchronous registry replacement/removal or after dispatching a malformed/conflicting join, await exactly one `settle()` checkpoint and inspect only `tracked.settled` and `tracked.value` before releasing the held membership read.

This is one bounded event-loop checkpoint, with no duration, timeout, poll loop, microtask count, virtual-clock advance or new production observation. It tests the declared route effect: the lifecycle callback or input refusal must settle through the existing registered route without waiting for the held facts continuation. The membership gate remains held at the assertion, and its existing custody later releases and observes every operation. This causal claim needs independent review against the registered route wrappers before implementation; it is not a general promise-scheduler guarantee.

The two consumers remain:

1. **S5:** preinstall the passive record for the old registered observation, synchronously replace/delete the exact tracked service, await one existing `settle()` checkpoint, then require typed STALE and zero old listener/timer ownership before releasing the membership gate.
2. **S7:** preinstall a passive record for each malformed/copied-ID/top-deadline/conflicting registered join, await one existing `settle()` checkpoint, then require the typed refusal and unchanged starter ownership before releasing the starter gate.

No second settlement helper, timer, polling loop or private observer-map hook is justified.

## A2. C5 older-origin/later-work recipient control

Add one protocol case using the existing real service, controllable proposal port, registered observation route, canonical request builder, facts reader and full cutover classifier:

1. Reach a legitimate current admitted service and record its durable participant origin and canonical generation.
2. Submit one real ordinary write **before PAUSE**, wait until the existing proposal owner has accepted it, and retain the actual proposal without committing it. Assert the write is unsettled, the proposal queue reports the real work, and the durable origin remains the earlier origin.
3. Raise PAUSE through the canonical cutover owner. Do not submit or fabricate work after PAUSE.
4. Send a direct registered `OBSERVE_APPLIED_POSITION` request whose target is the older durable origin/current canonical generation and whose deadline comes from the existing clock/budget owner. Because the recipient action is a progress-watermark observation, require its existing typed OBSERVED result with exact request identity/generation while the real later write remains pending.
5. Invoke the canonical full release/cutover decision for the same service while that accepted proposal is still owned. It must return DRAIN_PENDING with the actual rejected work tuple (including the proposal), and admission must remain CLOSED. The OBSERVED progress answer must neither drain the proposal nor grant release.
6. Under existing custody, commit/settle the retained proposal only after both assertions, then prove a fresh canonical release can succeed. Preserve every primary, proposal, settlement, shutdown and artifact failure independently.

This pairs a progress-only positive with the full classifier's safety refusal. It does not duplicate `isReleaseDrained`, introduce an alternate drain predicate, synthesize inconsistent facts, reuse the native topology, or claim final-query coverage. The existing outer pre-ENABLE blocked-drain case remains valuable but does not substitute for this recipient-level distinction because it can refuse before a successful direct OBS result is established.

## Scope after correction

V4 now plans S1-S8 plus this explicit C5 control. Native stale-N/current-K refresh and final-query ordering remain separate. The production correction plan remains provisional pending its independent review, including strict-capture placement, arithmetic ownership, bounded failed-cleanup custody and reentrant installation cancellation.
