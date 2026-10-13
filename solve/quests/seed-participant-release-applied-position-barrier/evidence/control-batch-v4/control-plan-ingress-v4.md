# Applied-position controls V4 shared-ingress clarification V4

Status: **SHORT ADDITIVE TEST DESIGN ONLY.** This note preserves V4 plan `47ca5b472bf8dd470cd0e896473089fe0f9b8581406fa4cf4fd490310ac8c088`, addendum `b22d0028854c7d2c2e5cbbce215145ad3c5eda98b687b6d1414467ffbe3fc823`, revision V2 `6dcc9496a3fdb4196a816ddb0fe37c54c0ea61dd962a8bd938915e91953c7b6b`, and clarification V3 `75da26749c57f2c49f8d63f3d62f3e095b7f608018ddba801a8389ca0a02d3ac` unchanged. It aligns only the shared ingress and canonical generation grammar. No source, test, fixture, Quest, registry, metadata, behavior or lab input is changed.

## Unsafe top payload: generic shared-entry refusal

`ReplicaHandler.handleMessage` cannot classify a value as participant release when the whole payload is not a strict own-data record or its discriminator is not a primitive string. For a top-level payload Proxy, symbol-keyed/exotic/noncanonical record, boxed/object discriminator, or own accessor on `type`, `action` or `replicaId`, require the existing generic replica-handler response: error status with `UNKNOWN_MESSAGE_TYPE(undefined)` before any release, create/remove/step-down/read action. Every accessor/proxy/coercion counter remains zero; no unsafe release identity is read or echoed.

This response comes from the existing shared dispatch default. The strict-copy boundary must not fabricate a participant-release answer, copy the dispatcher, or guess an action from unsafe input.

## Strict release-tagged payload: canonical release refusal

Once the top payload is a strict own-data record with the primitive participant-release type and safe primitive action/replica/partition discriminators, the existing release owner remains responsible for nested grammar. Invalid or non-strict nested `release`, `attempt`, `target` or `origin` values—including boxed/coercible digest values and incoherent deadlines—return the canonical release `INVALID` answer. The test requires zero nested getter/`toJSON`/`toString`/`Symbol.toPrimitive` calls and zero resource/admission effects. It does not calculate a release ID, parse a second shape or manufacture a response.

Valid ordinary participant release and OBSERVE requests continue through the same registered entry and retain their existing canonical answers and effects.

## Shared-entry preservation controls

Reuse existing real owner tests rather than introducing a dispatcher fixture:

- the current `replica-handler.test.js` `handleMessage` CREATE and REMOVE cases retain their actual admission/removal outcomes and correlation IDs;
- the existing real STEP_DOWN/leadership-transfer cases retain the one canonical transfer owner and answer;
- `replica-handler-replica-membership.test.js` retains the real tracked-service read result and attempt-sequence echo; and
- the current participant release protocol controls retain valid release/OBSERVE routing.

These are preservation witnesses for the shared strict capture. They add no fake create authority, synthetic service, copied switch, alternate parser or new fixture framework.

## Canonical generation convergence

The release contract owns one canonical generation-shape decision, and the participant facts reader consumes it. A malformed generation produced by the current generation owner returns the existing typed facts refusal `UNAVAILABLE` with `missingFact: 'current_replica_generation'`; it is not reclassified as a generic ingress error or coerced into a release identity.

Add a paired facts-owner control through existing controllable-service seams: make one canonical generation field missing, boxed, accessor-backed or outside its declared domain, require the typed generation refusal with zero coercion, then restore the exact owner field and require ordinary observed facts. Do not hand-build a facts answer or add a second validator.

The canonical decision must preserve both existing valid identity families: native runtime lifecycle identities represented by strings and controllable-port lifecycle identities represented by numbers, together with their existing owner/runtime/connection/admission generation domains. Existing native and controllable positive witnesses remain nonvacuous; the convergence must not narrow either producer merely to simplify the new guard.

All prior T1–T3 timing, resource, C5 and proof-boundary constraints remain unchanged. Implementation and behavioral evidence still require the combined narrow design approval.
