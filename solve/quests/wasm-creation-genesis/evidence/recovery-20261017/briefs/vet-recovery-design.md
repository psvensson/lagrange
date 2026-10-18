# Design vet brief: recovery stage (process-loss recovery of bound creations)

Role. Independent adversarial DESIGN VET (Fable) of the lead's draft
`solve/quests/wasm-creation-genesis/RECOVERY-DESIGN-20261017.md` in the lane
worktree `/mnt/data/peter/projects/.worktrees/rs-raft-event-reconciliation-20261016`
(branch at 381750de2, clean). READ-ONLY: never edit, commit, stage, push or
run tests that write; you may run read-only scripts and `git show/log/grep`.
Never touch `/mnt/data/peter/projects/lagrange` or any other worktree; no lab.
Scratch: `.../scratchpad/vet-recovery/` (prefix
/tmp/claude-1000/-mnt-data-peter-projects-lagrange/52d74044-bacb-41c7-9eb9-7fdbcbd93317/scratchpad).

Read in full (R18): CLAUDE.md, docs/steering/rules.md, router.md,
architecture/contracts/authority-and-recovery.md, the quest's CONTRACT-R2.md
(all of it; esp. "Recovery, local permission and process custody" :146-200 and
the proof list :236-250), HANDOFF-INTERFACES.md, TEST-PLAN.md,
SERVING-PUBLICATION-RETIREMENT-DESIGN-20261017.md (D1'-D7', 7', Revision 3,
A2''), ACTIVATION-DISCOVERY-DESIGN-20261017.md (all revisions; RV2.1, RV3.3,
RV5-RV7 custody table), ACTIVATION-DISCOVERY-STAGE1C-ACCEPTANCE-20261017.md,
the stage-1 vet reports (evidence/design-vets-20261017/design-vet-A/B,
design-revet-R2) for the deferred items A-B6, A-B3, B-§4/R8, B-N2, and the
PROCESS-CUSTODY-ACCEPTANCE-20261016.md. Then every source file the draft cites
in section 1, in full, plus their collaborators: service-lifecycle-recovery.js,
service-lifecycle-manager.js, service-consensus-creation-intent.js,
service-consensus-bootstrap.js, runtime-service-bound-creation-route.js,
runtime-service-handler.js, wasm-creation-opening.js,
wasm-service-serving-state.js, wasm-service-replica-lifecycle.js,
wasm-service-lifecycle.js, wasm-creation-reconciliation.js, the data-directory
process owner, the stage-1c publication/remover modules, and the embedding
fixture test/wasm-service/bound-creation-handler-embedding-fixture.js.

Vet, category-complete (verification protocol v2; the eight sealed
verification templates; evidence path per finding; bound your reading and
count what you withheld):
1. Contract conformance: every clause of CONTRACT-R2 B1/B4 and the HANDOFF
   recovery clauses mapped to a design decision; name any clause the draft
   violates or leaves unanswered (especially: B1 "without a live metadata
   quorum" vs D-R4; "no local tombstone/root is inferred after storage loss";
   "Recovery resolving today's different definition refuses"; HANDOFF
   "a historical COMPLETED row still requires current resource permission"
   vs D-R6).
2. Mechanism refutation by scenario: for each decision D-R1..D-R11, construct
   the concrete sequence that breaks it (restart during a re-entry; restart
   during the CLOSED redo; I restarts UNCONFIRMED while J was selected
   offline; the lost CAS reply case; two nodes restarting; the handler
   accepting a wake before `ready`; the inventory reading a file another
   process still holds; a definition changed between crash and restart; a
   PENDING row whose reservation was applied). Classify NEW MECHANISM / NEW
   SHAPE / recorded.
3. Owner interaction: one owner per decision (scan = manager; re-entry =
   handler route; local permission = opening module; serving = serving-state;
   retirement = lifecycle); any second owner or copied authority is a
   finding. Check D-R6's change to `readRetainedCreation`'s TERMINAL answer
   and the bound STOP branch's row completion against every consumer.
4. Temporal: the D-R6 order (CLOSED -> endpoint removal -> STOPPED -> rows
   COMPLETED) crash-safe at every step; the D-R9 ordering (memo before
   re-entry; `ready` before transport); D-R7's "no durable wake".
5. Harness fidelity: `restartHost` as a faithful process-loss model (what a
   same-process teardown cannot prove: open file handles, OS locks, timers)
   and the C9 child-process harness's labelling; what each substitution hides.
6. Proof plan: every decision has a red-first witness and a killing mutation;
   name missing cells.
7. Scope: anything that is production wiring (activation quest) or another
   owner's (timer, tombstoned-path cleanup) that the draft pulls in, or
   anything in scope it defers.

Verdict: APPROVE / REVISE (with required changes R1..) / REJECT, written to
`.../scratchpad/vet-recovery/design-vet-recovery-20261017.md` and returned as
your final message. Never report "done" on the lead's behalf.
