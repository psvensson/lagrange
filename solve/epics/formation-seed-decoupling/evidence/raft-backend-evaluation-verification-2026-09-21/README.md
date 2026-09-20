# Independent verification of raft-backend-evaluation (2026-09-21)

Two independent adversarial verification rounds of the quest
`raft-backend-evaluation`, in full, with the verifiers' attack scripts stored as
text (they ran against fixture copies and are not runnable from here). Both
rounds REJECTED the evaluation's receipts; both judged, from their own
measurements, that the raft-rs consensus core is viable, that the WASM RawNode
boundary is viable with named gaps, that migration is undetermined, and that no
decisive incompatibility exists.

- `round-1.md` - staged tree 2346faa5a3c7. Six blocking defects: a host loop that
  applied before persisting the commit index (raft-rs `src/lib.rs:304-310`), a
  non-atomic ConfState/applied write with swallowed refusals, a circular restore
  oracle, boundaries asserting no defining facts, a flaky sealed receipt, and
  derivation/core-read receipts that checked shape.
- `round-2.md` - staged tree e348fa2da176. Host order, atomicity, trigger shifts,
  determinism, derivation and isolation CLOSED. Four blocking remain, three the
  same class as round 1 (the restore receipt's ConfState oracle still circular;
  the membership brand launderable and the static census bypassable; a host-mutant
  classifier that cannot fail) and one new overclaim (panic isolation: after 304
  fatals every group in the runtime traps; fatals are remotely triggerable
  through `step`).

The quest's work is staged and uncommitted in the worktree
`.claude/worktrees/raft-backend-evaluation`; the quest log carries both
verdicts. Record only.
