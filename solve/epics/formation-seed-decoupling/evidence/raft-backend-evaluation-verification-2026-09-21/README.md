# Independent verification of raft-backend-evaluation (2026-09-21)

Three independent adversarial verification rounds of the quest
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
- `round-3.md` - staged tree 1e7a3e2da. The final round, under the owner's
  approved last repair. CLOSED: the restore oracle is independent of
  `create_node` and every injection and binding-bug fault is caught locally in
  the real receipt; the mutant classifier can fail, with an honest control and
  all eleven mutants differentiated. Two of the same four remain, so the quest
  stops: membership evidence is still forgeable (the `durable-record` source
  kind is unchecked and its snapshot unfrozen; the proposal ledger is
  process-global and never value-compared; `witness.tag` brands a literal), and
  owner attack 11 succeeds with a false voter set surviving regeneration; and
  the hosting record still asserts the withdrawn single-group blast radius in
  the JSON while its recovery measurement restores nothing from durable state.
  It also found a substantive defect in a recorded obligation - the ingress
  validator's sender rule drops legitimate Raft traffic - and further core
  behaviours a backend must know.

The evaluation's own tree is preserved as the tagged object
`raft-backend-evaluation/round-3-rejected-tree` (`fcc67091e`, tree
`18be4ede3`); it is not on a branch, because three of its files exceed the test
file-size ratchet and the hook was not bypassed. **Nothing in the evaluation may
be cited as certified evidence.** What the three verifiers measured for
themselves may be.
