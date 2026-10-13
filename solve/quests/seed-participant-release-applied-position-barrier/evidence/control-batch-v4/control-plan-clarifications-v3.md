# Applied-position controls V4 plan clarifications V3

Status: **SHORT ADDITIVE TEST DESIGN ONLY.** This note preserves V4 plan SHA256 `47ca5b472bf8dd470cd0e896473089fe0f9b8581406fa4cf4fd490310ac8c088`, addendum SHA256 `b22d0028854c7d2c2e5cbbce215145ad3c5eda98b687b6d1414467ffbe3fc823`, and revision V2 SHA256 `6dcc9496a3fdb4196a816ddb0fe37c54c0ea61dd962a8bd938915e91953c7b6b` unchanged. It makes three precision corrections and changes no source, test, fixture, Quest, registry, metadata, behavior, lab input or Git history.

## 1. Settled joins are bounded by retained-record custody

The settled-join/nonrenewal claim applies only when the call captures the still-retained observation record or its retained cleanup debt. That call returns the stored terminal answer while it may discharge cleanup through the same record; it cannot renew a timer/listener, create a successor or replace the inner stored owner Promise during that call.

A fully clean record may be deleted by its existing lifetime owner. A genuinely later request after deletion may create a fresh observation. No permanent memoization, terminal-answer store or extended record lifetime is proposed. The registered async route is not required to preserve outer Promise object identity: source review binds the inner stored Promise, while public controls assert the same terminal answer and no resource renewal through observable listener/timer/read effects.

## 2. Durable origin comparison is by canonical content

The C5 direct OBS assertion compares `answer.origin` with `durableOrigin` using canonical deep/content equality over `originIndex` and `originTerm`. `readPartitionWriteOrigin` returns a fresh frozen object, so reference identity is neither expected nor evidence. The proof still requires the exact earlier origin values and `durableOrigin.originTerm < request.attempt.term` after the real `setTerm` transition.

## 3. Acquisition cancellation need not enter facts

For synchronous cancellation during subscription or timer acquisition, register the returned operation under the existing gate/fixture custody, engage the actual acquisition owner, perform the real registry/service cancellation from inside that acquisition, and await the one approved event-loop checkpoint. A correct implementation may cancel before any committed-membership read, so these cases must not unconditionally await `gate.started`.

Instead assert the acquisition-specific effects directly:

- subscription cancellation returns and retires the exact late unsubscribe handle, then performs zero later timer or membership-read acquisition;
- timer cancellation retires the exact returned handle and every previously acquired subscription, then performs zero later listener/read/resource acquisition;
- the registered operation settles with its canonical cancellation answer and all observable counts return to baseline.

Only if the actual path did enter the facts gate may the case await and retire that engagement. Otherwise retirement releases/restores the dormant gate without claiming a read. Exact handle identity, wrapper/field restoration, returned-operation settlement, sentinel error identity and directory custody remain independently preserved. No timeout, poll, fabricated facts engagement or cleanup shortcut is added.
