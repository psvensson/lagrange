---
categories: [retry-loops]
---

# Verification Template: Retry / Re-drive / Follow-up Loops

For changes to retry registration, follow-up timers, rearm logic, or
re-drive lanes. Each item requires an evidence path.

1. **Retry-must-fire.** Any registered retry that other seams TRUST (e.g.
   `SKIP_LIVE_DEFERRED_RETRY`-style suppression) must provably fire or
   loudly stop — trace the firing path under the failure conditions that
   scheduled it. A registered-but-dead retry suppresses every other rescue.
   (run-26: the 1s verification follow-up self-cancelled silently while its
   live window suppressed the only planner rearm.)
2. **Bound from frozen evidence.** If the loop's stop decision reads the
   operation/row, what bounds it when the row is UNREADABLE? Snapshots must
   carry timestamps; degenerate evidence must stop loudly, not loop.
3. **Every stop is loud.** Enumerate all exits (terminal, ineligible,
   budget, degenerate); each must log a typed reason. Silent self-cancel is
   the run-26 class.
4. **Mutual suppression / livelock.** Does A defer to B while B defers to
   A? Show the tick where progress is guaranteed.
5. **Retry storm ceiling.** Cadence x max-duration x concurrent instances:
   compute worst-case attempts and log volume; verify per-target sheds or
   throttles exist where the product is large.
6. **Duplicate-effect safety.** A retry that re-fires after late success
   must be a no-op nudge (CAS/single-flight/authoritative re-read at the
   receiver), not a duplicate mutation.
7. **Reset semantics.** What resets attempt counters — and can a
   success-that-wasn't (transport ACK without processing) reset them
   forever?
