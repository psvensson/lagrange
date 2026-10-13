# Applied-position production V2 correction plan — additive G1 ownership correction

Status: **design only**. This short addendum supersedes only the generation-validation ownership described by `correction-plan-v2.md` SHA-256 `553f31e42c2539ab999f116e27d6d7043e8b7438cd7d8dcaf48444f760e4c5a9`. Every other D1–D4 decision, accepted V1 behavior, proof limit, and frozen byte remains unchanged. No source, test, script, metadata, Quest, Git, or behavior action is performed here.

## G1 — one canonical generation field/domain owner

`src/partition/partition-participant-release-contract.js` already owns `GENERATION_FIELDS` and `sameReplicaGeneration`. It will own one bounded primitive/domain validator beside them (planned export `participantReleaseGenerationValid`). The validator uses the existing single field list and captured primitive operations; it accepts exactly:

- nonempty primitive strings for `nodeId` and `replicaId`;
- positive safe-integer primitives for `ownerIncarnation`, `runtimeGeneration`, `connectionGeneration`, and `admissionGeneration`;
- either the production native nonempty-string form or the existing controllable-port positive-safe-integer form for `lifecycleIncarnation`.

Boxes, coercible objects, symbols, missing fields, unsafe/fractional/nonpositive integers, and every other lifecycle-incarnation type are invalid. `sameReplicaGeneration` continues to own equality over that same field list. No caller copies the list, projects a generation, or defines a second domain predicate.

`src/partition/partition-participant-transaction-pause.js` retains sole ownership of `replicaGenerationOf`, the trusted current generation projection, and the `FACT.GENERATION` unavailable response. Its local `generationAvailable` predicate is removed or becomes a direct delegation to `participantReleaseGenerationValid`; it performs no independent field/domain checks. PA passes its internally constructed trusted projection directly to the canonical validator. It does **not** run `copyStrictOwnDataRecord`, recursively decode its own facts, or treat trusted source output as hostile wire input.

At the registered release ingress, D1 still first uses `copyStrictOwnDataRecord` on the caller's target record to exclude proxies/accessors/non-data shapes without invoking them. Only that copied untrusted-input value is then passed to `participantReleaseGenerationValid`. Thus strict shape capture and canonical scalar-domain validation remain distinct responsibilities while consuming one domain owner.

The explicit malformed-producer behavior remains:

- an unsafe/nonprimitive shared discriminator receives the existing generic `UNKNOWN_MESSAGE_TYPE(undefined)` response and invokes no action owner;
- a safely identified participant-release request whose action requires `target` but whose copied target fails the canonical validator receives existing `releaseAnswer(INVALID, safeCapturedRequest)` before map, clock, registry, service, hash, subscription, or timer effects;
- release actions that do not require a target retain their existing field requirements, and every valid generic message, production native string incarnation, and controllable-port numeric incarnation remains accepted with its existing behavior.

This closes the only G1 ownership conflict. Implementation and every source/static/behavior/locked-lab/Quest acceptance gate remain HOLD pending combined independent design approval.
