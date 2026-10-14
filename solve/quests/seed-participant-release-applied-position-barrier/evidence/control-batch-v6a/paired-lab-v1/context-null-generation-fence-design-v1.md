# Known-context membership-refusal generation fence

## Evidence and boundary

This design binds author triage `6472f5f0900070a44b8274e86998a0eb46361211e896a5c5d45b41142b9e2b69` and independent paired review `762307c8fff4266b489452b169abbc55af3954fa036d16864ae7dbe5f0b1d626`. R9 measured a held membership refusal while `runtimeGeneration` changed: `readParticipantReleaseFactsAssessment` returned `context:null`, so `adjudicateParticipantReleaseObservation` returned the old UNAVAILABLE answer before its canonical generation fence. Same-generation refusal must remain UNAVAILABLE; independently known changed valid generation must be STALE; unknown current identity remains UNAVAILABLE.

## Minimal owner correction

Change only the PA/K owner in `src/partition/partition-participant-transaction-pause.js`. After the existing single committed-membership await and single `readStatus`, preserve membership-refusal precedence, but independently derive a nullable context when status is `CORE_OK` and the sole existing `replicaGenerationOf` plus `participantReleaseGenerationValid` accept the current generation. Use the existing `releaseFactsContext` projection. Return the original membership UNAVAILABLE answer with that context and `refreshEligible:false`. If status or generation is unavailable/invalid, return the same refusal with `context:null`. For committed membership, retain the current generation-unavailable and facts paths unchanged. Do not decode PA's own trusted context again or copy its generation field list.

`src/node/replica-handler-participant-release.js` needs no second classifier or facts read. Its existing R adjudicator already checks lifecycle, then sends non-null context through `observationContextMatches`, which performs the current registry/service/port/build/pause/attempt/term/leader/configuration/membership/full-generation fence using K's exported projection. A same-generation context therefore preserves the original UNAVAILABLE answer and no-refresh result; any known current generation change yields existing STALE. A null context keeps the honest original refusal. O's post-await clock/lifecycle/overall/RPC precedence remains untouched.

Ordinary `readParticipantReleaseFacts` continues returning only `.answer`, so its established refusal order remains membership before generation when membership is unreadable. Computing an independently valid context must not turn the refusal into observed facts, enable refresh, repeat membership/status reads, or expose a new public result shape.

## Falsifying interactions

Extend the existing `test/node/replica-handler-release-recovery.test.js` R9 table rather than adding a fixture or classifier:

- unreadable membership plus unchanged valid full generation returns the exact UNAVAILABLE/membership-unreadable answer, one read, `refreshEligible:false`;
- the same held refusal plus a real canonical runtime-generation change returns exact STALE before settling, retaining release/attempt identity and no refresh;
- independently vary lifecycle, connection, and admission generation through their existing owners to prove the full canonical generation comparison, without enumerating fields in test helpers;
- unavailable status or invalid canonical generation retains UNAVAILABLE rather than fabricating stale/current context;
- replacement/removal and pause/build/term/configuration changes retain their existing STALE/lifecycle precedence and cleanup identity.

Keep `test/partition/participant-release-protocol.test.js` as the ordinary-answer regression cone: unreadable membership still wins over invalid generation and no extra read occurs. Reuse existing K validator adversarial coverage for accessor, Proxy, boxed, symbol, unsafe and malformed generation inputs; add only a composed refusal-plus-invalid-generation case if that interaction is not already exercised. No new validator, retry, refresh loop, timeout, clock sample, status/facts read, or result classifier is permitted.

Implementation requires exact source review, unchanged R9 same-host paired controls, the ordinary protocol file, and canonical impact/metadata checks. This document authorizes no code, test, metadata, Quest, Git, or lab action.
