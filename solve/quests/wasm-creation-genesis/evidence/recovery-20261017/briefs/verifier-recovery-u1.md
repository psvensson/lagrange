# Verifier brief: recovery stage UNIT 1 (inventory, memo rebuild, typed refusals, retirement completion, PENDING resolution, restartHost)

Role. Independent adversarial VERIFIER (Fable) of the Opus implementation of
unit 1 of the recovery stage of Quest `wasm-creation-genesis`. You vetted the
design (six rounds); you did not write this code. Verification protocol v2
binding: property first, owner-scoped proof, evidence-author mode,
category-complete, mutation by mechanism, an evidence path per finding; bound
your reading and count what you withheld. The lead records the verdict.

YOUR worktree: `/mnt/data/peter/projects/.worktrees/verify-1c` (detached, idle).
Run `git checkout -- test/shards/impact-graph-seal.json` if modified, then
`git checkout --detach d55cb368d027d40c780ab8463aa6b1f254d2a540`
(= `refs/heads/wip/rs-raft-recovery-u1-1`, pushed; parent 381750de2 = the
stage-1c landing = the base), then
`node scripts/generate-global-owner-debt-inventory.js --refresh-import-graph-only`.
Subject: `git diff 381750de2 d55cb368d -- src test` (31 files, +1779/-95)
minus nothing (the lead's docs are not under src/test). You MAY edit files in
YOUR worktree only for mutations, each restored byte-identically; never
commit/stage/push/reset/clean/stash or touch refs; never touch the lane
worktree, the compose worktree, the primary checkout or any other worktree;
never run on lab hosts; thermal gate + one runner at a time via
`npm run test:file -- <file>`. Scratch: `.../scratchpad/verify-recovery-u1/`.

Binding texts: `RECOVERY-DESIGN-20261017.md` (draft + Revisions 1-5, latest
wins; read it as the lane worktree has it: `git -C <lane> show` is read-only,
or read the copy the snapshot carries under solve/quests/wasm-creation-genesis/),
your six vet reports, the stage-1c custody table (RV5-RV7), CONTRACT-R2
:146-200, HANDOFF. Implementer report:
`.../scratchpad/reports/implementer-recovery-u1-report.md` (F1-F20, the
supersession list, red logs `red-recovery-u1/`, mutations
`mutations-recovery-u1/`, statics, cone `reports/lab-selection-recovery-u1.txt`).

Measure, category-complete:
1. Frozen claim for unit 1 = design claim items 2 (ADMITTED/ABSENT re-entry),
   3 (RETIRED redo), 4 (COMPLETED), 5 (memo rebuilt before ready), 6 (four
   refusals), plus R1-A, R1-B, R1-D, R1-E, R1-F, R1-G/R2-A/R3-E, R1-H, R2-E,
   R2-F, R3-B, R3-C, R3-D, R3-F, R4-A rule 2 + R5-A wake detail, R5-A
   supersessions. Unit 2 (R1-C/R2-C local-grant decision at the opening
   module, R2-D/R3-A/R4-A rule 1, C9) is EXCLUDED: confirm the implementer did
   not partially implement it in a way that changes behaviour (the manager's
   `phase: UNAVAILABLE` pass-through is in scope as the implementer states).
2. Coverage model: inventory entry classes x local answers (N13 table) x
   memo written x re-entry/re-drive x outcome emitted x REMOVE afterwards;
   the five crash points of R1-D; the three PENDING branches of R2-A; the
   TERMINAL-with-row-state mapping; the ready latch (`awaitsRestartInventory`
   opt-in: judge the implementer's call); the wake-detail rule for any memo.
3. Owner interaction: one scan entry point; one by-path reader (read-only,
   close-before-open); one local-permission decision site untouched (unit 2);
   one memo writer of the creation link (custody table unchanged); one row
   completion CAS; the adapter base verb with typed UNSUPPORTED; census of
   every caller of changed surfaces (`recoverPendingOperations`,
   `readRetainedCreation` TERMINAL answer, `confirmConsensusBootstrapResult`,
   `startReplica` refusal code, `decideBoundRemoval` NOT_ADMITTED branch,
   `WAKE_ACTION`/`PENDING_WAKE_REASONS`).
4. Judge the implementer's listed calls (ready latch opt-in; generic rows
   untouched; HELD memo first then permanent FAILED by the re-entry for local
   CORRUPT/CONFLICT/UNSUPPORTED answers; "re-entry starts only while its memo
   is still HELD" (their addition; is it a second decision site or the custody
   table applied?); `storage` compared by the by-path tombstone; row completion
   failure after CLOSED; the direct `node --test` run) and the six superseded
   witnesses (R5-A three + P15 :668, cell (c) :835, P4 :440): old lines
   preserved verbatim as comments, successors cite R5-A/R1-D/R2-A, nothing
   weakened.
5. Mutations by your own hand from mechanism (do not reuse the implementer's
   patches except to compare): inventory reads metadata; re-entry under a scan
   id; memo after re-entry; row completed at PUBLISHED; CLOSED redo skipped;
   tombstone inferred on STORAGE_MISSING; five-field identity; node filter
   removed; REMOVE outcome emitted by the re-drive; PENDING terminated without
   resolving; wakePending set for GRANT_HELD(UNAVAILABLE); CORRUPT_STATE kept
   re-drivable; a lifecycle `.code` passed through as permanent. Each must
   redden the named witness; record the first failing line.
6. Statics on the clean tree: `node scripts/check-fast-static.js --base 381750de2`;
   decision boundaries --json on every touched src file (0 new); eslint;
   complexity/cognitive/literals/silent-catch scoped; `audit:shards`;
   `audit:impact-contracts`; `test:duplication` vs 698/26458; `test:unused:ratchet`
   vs 1456; the seal reproduced.
7. Runs: the new `test/wasm-service/bound-creation-restart.integration.test.js`
   and every touched test file; the stage-1c witnesses U/N/H and the
   publication integration (regression).
8. Lab: queued at d55cb368d (two jobs, ids in `lab/recovery/submit-u1-*.log`;
   38 files) behind the owner's lab reconciliation; PENDING at hand-back is
   expected; say what the classification must check.

Verdict: `.../scratchpad/verify-recovery-u1/verdict.md` (frozen claim,
coverage table, findings by category with evidence paths, census diff,
mutation table, statics, lab, what you did not read or run, APPROVE/REJECT);
return the same content. Never report "done" on the lead's behalf.
