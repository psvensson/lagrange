---
categories: [sweep-timer]
---

# Verification Template: Sweep / Timer / Periodic Enforcement

For changes to periodic sweeps, hold-timeout enforcement, interval-driven
detectors. Each item requires an evidence path.

1. **Clock injection.** The sweep body must accept a nowMs override (the
   `enforcePreparedStateHoldTimeouts(nowMs)` pattern) so DTs drive it
   deterministically; timers must be unref'd.
2. **Role/authority gating.** Actions with raft-safety implications (e.g.
   ROLLBACK) must gate on role with the SOLO carve-out reasoned explicitly:
   leader/candidate rollback re-mints acked indices and followers truncate
   (zombie-lifecycle quest; CL-033/034 adjacent).
3. **JS-memory crash-equivalence.** A swept recovery that mimics a crash
   must also clear surviving in-memory state (apply-dedup sets, monotonic
   caches) or the heal strands the very data it saves (verifier finding Z1).
4. **Detection windows.** Legal-hold windows vs detection thresholds: a
   legitimate long operation must not trip the detector (fitness signal-b:
   in-session commits diverge LEGALLY for the session length).
5. **Sweep starvation.** What happens when the sweep's own reads/writes go
   through the subsystem being enforced (circularity — see
   formation-circularity.md)?
