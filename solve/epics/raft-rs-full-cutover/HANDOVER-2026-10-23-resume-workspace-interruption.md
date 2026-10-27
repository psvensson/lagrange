---
audience: agent
status: blocked-environment-unavailable
---

# Rs-raft delivery takeover: workspace interruption, 2026-10-23

## What happened

The user authorized taking over the rs-raft development. Work resumed from the
stopped delivery checkpoint, with static repair, foreground test completion,
and independent composition review in parallel. At approximately 13:50 UTC the
selected execution environment disconnected. A subsequent minimal read failed
with "No usable execution environment is available." GitHub access remained
available.

This is an interruption and recovery record, not an acceptance or landing
receipt. No predecessor or corrected runtime test was submitted during this
takeover. The active Quest remains open and its pure probe still measured eight
failed predicates against target zero. No source change for the two newly
identified composition defects was made before the interruption.

## Starting authority and exact source

- Repository: psvensson/lagrange.
- Preserved branch: work/mg-source-occurrence-delivery-20261023.
- Source checkpoint: 681da1dc1beb5728a52ee5d223113b71b423156b.
- Doc-only child used as the takeover base:
  64c34a5daa60a73668421e8a585f239312066b97.
- Base Git root tree: 41ff52d8de19bb616dec2947ebf47484ef128209.
- Source subtree: 13d5692a896a65dac09291c1bc67158d504a26f1.
- Test subtree: 8876990478aa139596cbb2c2c4973ff60377c3b8.
- All 58 frozen production-path hashes were checked against the base Git blobs
  before editing and matched.
- Local integration checkout:
  /workspace/scratch/0c0362d1530e/lagrange,
  branch work/mg-delivery-resume-20261023.
- Test-only predecessor worktree:
  /workspace/scratch/0c0362d1530e/lagrange-mg-baseline,
  branch test/mg-composition-baseline-20261023.

Read HANDOVER-2026-10-23-delivery-stop.md in this epic and the repository steering
before continuing. The earlier verified retained-state observer does not prove
this changed delivery candidate. The missing classification draft and elided
historical TAP remain missing; no repeat recovery hunt is justified.

## Work completed before the disconnect

### Bounded static corrections

The static-repair author changed these five source files:

1. src/partition/partition-cdc-obligation-delivery.js
2. src/transport/message-router-ack-delivery.js
3. src/transport/message-router-delivery-lifetime.js
4. src/topology/cdc-group-propagation-delivery-methods.js
5. src/topology/cdc-group-propagation-retry-wait-report.js

The changes give obligation retry timers and drive steps explicit states,
route stale-socket and timer errors through existing owners, and use the
existing throttled console-only reporter for retry scheduling. The author
recorded the five-file unified diff SHA256 as
9b17cad084ed1911046967cd4ff96dcc139d01a5a468dd6783695a046c7b1e71.

Before loss of execution access, the author reported syntax 5/5 and normal
scoped ESLint passing, zero new decision findings (three inherited), zero
silent-catch findings, zero new hot-path diagnostic findings (one inherited),
zero literal findings, and clean whitespace. These are scoped author results,
not final composed static or runtime proof. The original receipt path was
solve/quests/retained-seed-original-handoff/evidence/mg-delivery-resume-static-r1-2026-10-23.json.

The timer-state change required one external diagnostic reader correction in
test/message-group/message-group-native-provisional-route.test.js. Its snapshot
now reads lane.retryTimer.handle !== null. Calling the canonical diagnostic
function at that captured observation point would mutate tenure through laneOf.
A broad reader census found no affected property-test reader. Syntax, scoped
ESLint, and whitespace passed. The independent reviewer accepted the rationale.

The inherited topology delivery module still exceeds the 800-line style target.
The global file-size ratchet passed historically, but that is not permission
to close the Quest without resolving the applicable style requirement.

### New foreground tests

test/topology/cdc-group-propagation-foreground-boundary.test.js contains eight
component cases using the actual retry helper and actual lifecycle:

- stop after real ATTEMPTS_EXHAUSTED;
- stop after a real sleep returns ADVANCE;
- observed STOPPED followed by restart before consumption;
- ordinary attempt exhaustion with truthful background diagnostics;
- durable attempt exhaustion retaining source debt without ordinary maps;
- positive remaining duration shorter than the next delay;
- equality at the next delay;
- sufficient duration, real 50-ms wait, and canonical provisional completion.

The stop cases count actual helper decisions so downstream stop behavior cannot
conceal an extra foreground iteration. The greater-duration control does not
assume one target send per foreground attempt: after 49 ms there is no retry;
the admitted next step obtains a canonical provisional response.

Independent source review approved the exact file for candidate composition,
conditional on generated metadata and lab execution. Syntax, normal ESLint,
complexity <=12 and cognitive complexity <=20 passed. Runtime remains unexecuted.

### Composition defect C1: public receiver admission and forwarding custody

The independent composition review found that the public durable receiver
captures incoming data before reserveCdcWait and its FORWARD branch bypasses
the existing bounded proposal queue. This violates the superseding contract:
existing queue admission must precede immutable capture, and a retired caller
response must not release raw forwarding/native custody.

The affected receiver owner is
src/message-group/message-group-service-cdc-propagation-runtime-methods.js.
The acceptance owner is
src/message-group/message-group-cdc-committed-acceptance.js.

The proposed correction is to route public durable single/batch input through
the existing applyCDCBatch/committed-acceptance path, remove the competing
receiver ingress-selection helper, preserve canonical DEFER and terminal
native-commit guards inside that owner, and charge actual forwarding through
the same queue.ownOperation custody used for local native work.

Do not wrap the entire delivery operation in ownOperation: the local path
already owns a nested raw operation, so that approach risks deadlock and
incorrect late-native custody. The public forwarding response needs to race
the existing wait/deadline while the raw forwarding promise retains its queue
slot until actual completion. No new queue, admission cap or alternate path
is authorized by this plan.

The new C1 test file has four cases:

1. Public single-event input at actual native queue capacity returns
   BACKPRESSURE before capture.
2. The equivalent public batch case.
3. A public follower at capacity performs no second forward while an actual
   native terminal response is held.
4. Receiver expiry returns UNKNOWN while the same queue slot remains held
   until the real remote response is released, after which admission works.

The capacity tests use actual RF3 admitted native work and a nested Symbol
capture tripwire, with a free-capacity INVALID control. They do not mock queue
admission results. Syntax and scoped ESLint passed. Independent review and the
test-first predecessor measurement were pending at disconnection.

### Composition defect C2: transport normalizes away receipt contradictions

normalizeDeliveryOutcome in
src/transport/message-router-outbound-queue-admission.js calls the transport
outcome builder. That builder can replace explicit reasonCode, errorCode,
deferRetry, noHandler, retryAfterMs or deliveryState claims before the CDC
validator sees them. Some malformed/contradictory committed replies therefore
arrive as valid-looking receipts, even though the canonical CDC predicate
rejects the original reply.

The new C2 test uses actual local registration/dispatch, actual identified
WebSocket SERVICE_RESPONSE, and actual inline ACK response paths. It checks
recipient engagement and pending registries, valid committed/provisional
controls, wrong-group and ordinary-success controls, and a matrix of invalid
wrapper fields. Synthetic receipt answers are explicitly component fixtures;
they do not claim native commit proof.

Independent source review approved the exact C2 test for predecessor
measurement. An additional recommended control, not yet written, is provisional
deferRetry:false and provisional deliveryState:'delivered' together with a
positive retry hint.

The recommended bounded source approach is a transport-owned preservation
helper using the existing transport metadata field list: compute the canonical
transport result, preserve each explicitly owned raw metadata field with an
own-property test, and let the canonical CDC validator reject incompatible
receipt claims. A supplied deliveryState must never overwrite a computed
failure or deferral; an explicit state conflict should retain a failed outcome.
Keep generic transport classification with its existing owner, avoid importing
CDC policy into transport, and require idempotence because inline ACK replies
are normalized twice. This is a reviewed design recommendation, not implemented
or measured behavior.

## Exact identities recorded before disconnect

These identities describe artifacts that existed in the now-unavailable local
workspace. The recovery inventory accompanying this record states which bytes
were actually recovered. A recorded hash alone is not file custody.

| Artifact | SHA256 |
| --- | --- |
| Foreground boundary test | 311b87acaa42a55e29e99f154bb2ef82f60b4ae9e3267481739fbb4ffa87c997 |
| C1 receiver-admission test | 7ebead6f8b5a6c728f7b8da8c6c373fe6189f301e471c1889ffd910606395f79 |
| C2 transport roundtrip test | 3e201c0fd84f3e2b5d4c7843aa4c1f1fa349c2a98d9ce5facae1ea2d4699f8fb |
| Native provisional-route test after snapshot repair | 865ea45eb53f1036be2a6701f6c5291adfc18c90e11332aaefdba0520711ed9e |
| Five-source unified diff | 9b17cad084ed1911046967cd4ff96dcc139d01a5a468dd6783695a046c7b1e71 |
| Snapshot-only unified diff | a3e07a6ed4859f04916e31e4172ea634517746b6182dba71871ccb1639370bf6 |
| Composition review R1 | 00d77bbade11e9bf76ff884ecec00f0b29ee11f9547ac7630724fe4881213cfb |
| Composition manifest R1 | aa174ba759fab595e01ee654497e61cec95fe25078330692e65770bf86538d61 |
| Independent foreground review R1 | ddc5b81dcb10f2f5c7a1d3b2672feecd95bdf5c416fb9042d93359521c1542c7 |

Two findings were appended through the canonical solve note command locally:
the takeover/source verification and the C1/C2 discoveries. Their exact local
log bytes were not available to this remote recovery record. Do not fabricate
those original entries or claim they were preserved by this document. Reconcile
them append-only if the workspace returns.

## Lab preparation and evidence custody

Read-only preflight completed:

- Ping: https://github.com/psvensson/lagrange-lab/issues/1187
  at 13:40:46 UTC. Request fa1f0f6a650940fe8f44d4c3b46a9d8c.
- Fleet: https://github.com/psvensson/lagrange-lab/issues/1188
  at 13:40:48 UTC. Request f970cb7891e9496f9de40ae909e3869f.
- Controller b4a2e06c193c44b09f1b67d02e8d80f4, version 0.2.2,
  source 53e262450fada3b4e706898201a3c732811ae4d0;
  paused=false, uncertain_execution=false.
- tv-dator was free at the observation, CPU 59 C. This is not a reservation.
- No source-executing job was submitted. There is no new test job to cancel.

The preserved source archive was downloaded and re-hashed successfully before
disconnection: c0eb799e1651a8feb0a3f4d349ed5d25d88ca83432ebe38348115167ee0656c6.
The exact reviewed request builder and full TAP collector were extracted:

- Builder: 4d07e125ebb1bf5db596933fdabc565023a7205fdcb5524c8fa65ea84a330b47.
- Collector: ae248b12797118ec5bbfdb671262337cec22f6599cb92208c93208911f1c1aa1.
- Installed contract: 2d6e5e3c2f032e205c37cbc8ecd1bb7fded442196fa22d91fc5c0fe4625f6586.

A local wrapper relocated only the builder's installed-release path and retained
its contract digest check. It did not alter authorization or packet semantics.
The builder was not run to submit predecessor/candidate tests before access
was lost. The full TAP collector remains required for future exact-SHA runs.

## Resume in this order

1. Restore an execution workspace. If the original checkout survives, reconcile
   its dirty paths by exact hashes with the recovery inventory; preserve every
   historical record and do not overwrite newer work.
2. Finish independent review of C1 and the proposed owner consolidation.
   Keep production unchanged in the test-only predecessor branch.
3. Freeze both C1/C2 tests, regenerate canonical test metadata, inspect source
   and test trees, commit the explicit WIP predecessor, and independently review
   the exact lab packet.
4. Measure predecessor tests on locked tv-dator with canonical test:file and
   retry-once zero. Retain full TAP/stderr. Distinguish setup failures from the
   intended behavioral failures; do not weaken assertions or inflate timeouts.
5. Implement the reviewed C1/C2 owner corrections only after that measurement.
   Independently review composition, add the new witnesses and affected owners
   to the impact contract, regenerate metadata and run final applicable statics.
6. Freeze the exact candidate and run the focused delivery selection, including
   existing delivery/native/transport/property tests and all new witnesses.
7. Continue W7 composite source progress, W9 size/fanout, retained-work
   classification, protected activation, durable transfer and two-start recovery
   in their contract order. None is closed by this checkpoint.

No local runtime tests, raw SSH runners, Actions-credit-dependent execution,
ratchet increases, rejected 1-MiB/64-item caps, main update, merge or publication
was introduced by this takeover.
