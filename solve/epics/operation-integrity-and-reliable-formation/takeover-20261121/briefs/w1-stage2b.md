# W1 stage 2b — finish the retained placement repair owner (handover from the stage-2 writer, 2026-11-21)

Branch `work/retained-ledger-observation-repair-20261121`, pushed head 9d241bd89. Worktree
`/mnt/data/peter/projects/.worktrees/retained-ledger-observation-repair-20261121`.
Commits of stage 2: 95ee6ee4a (items 1-5: record shape, required ports, typed read outcomes, decision reuse,
binding/tenure/custody, unknown native outcome; new witnesses; test migrations; fabricated leader row replaced),
bc20bb929 (the real-publication cross-boundary witness; ITS COMMIT MESSAGE IS WRONG: another writer's text landed in
it because writers shared a scratchpad message file; the content is the witness; corrected in the message of
9d241bd89; never amend), 9d241bd89 (coupled-pair registration
`leadership-publication-and-retained-placement-repair` under contract
`retained-placement-repair-leadership-publication`; `npm run audit:impact-contracts` passed).
Everything is described in `/mnt/data/peter/projects/lagrange-takeover-20261121/reports/w1-transition-record.md`
sections 15.1-15.6 (15.3 = settlement-consumer table, 15.5 = proposed witness corrections).

Executed state (tv-dator, sha bc20bb929, output
`/mnt/data/peter/projects/lagrange-takeover-20261121/lab/w1-stage2-run3-bc20bb929-try7` + `.console.log`):
placement-retained-publication 6/6; placement-retained-leadership 5/5; placement-retained-real-publication 1/1;
placement-retained-continuation 18/21; placement-retained-row-repair 44/45; replace-real-group-native-ledger-recovery
1/3. All 7 guards green; 14 of the 16 stage-1 red witnesses green; row-repair 15 and 40 green.

STILL RED (6 cases):
1. W7 post-resolution (`placement-retained-continuation` ~:307) and row-repair 41 (~:1183): both assert the entry is
   still pinned after a lost answer; under approved ruling Q8 the leader observes its own entry commit and settles
   the entry through replay before the test looks. The writer calls these witness conflicts, not product defects,
   and proposes corrections in record 15.5 (not applied).
2. W7 ingress: the release during the outage is not restored within 200 continuation turns. Not attributed.
   Writer's unverified suspicion: the witness raises the raft term without a role transition, so the write kernel
   may refuse the later native submit.
3. New B5 tenure-end witness (~:545): one receiver timer still pending after the record is released. Not attributed.
4. S11 owned-repair and S11 raw-bypass-negative (`test/rebalancer/replace-real-group-native-ledger-recovery.test.js`
   ~:64): the ledger owner holds 0 retained records where the test expects 1. Not attributed; possibly a regression
   from the new receiver decision or the tenure release. These two passed before stage 2 (they are among the ten
   removal witnesses that passed on 7fbdd5057).

Known residuals stated by the writer: custody attests ledger term and node boot incarnation but the receiver does
not attest its own replica created_at (that value comes from the sender's cache); a receiver releases ingress-only
records when its tenure ends only at its next commit, release or ingress, not at the moment it loses leadership;
22 tests that build a bare repository now pass typed unavailable ports through
`test/test-helpers/retained-repair-ports.js`.

NOT DONE: the six-mechanism mutation table (planned mutants and expected killers are listed in the writer's report:
lost wake -> W2 partition-first; stale custody -> W5 disclaim; blind handoff -> W3; reused unavailable -> C1
sequential; overwritten trigger -> W7 consume; uncancelled timer -> W8 retirement); the change cone versus
0993265e5; the corpus selection implied by 9d241bd89 (the lead schedules it).

LEAD RULINGS for stage 2b:
A. Witness conflicts (item 1): a witness may be RE-STAGED, never weakened. The property each one protects must
   still be exercised in a reachable schedule after Q8: for W7 post-resolution, "a read failure on the
   post-resolution path leaves the blocker's clearing trigger unchanged and the owed revalidation is retained";
   for row-repair 41, whatever its description states. Re-stage so the precondition is real under Q8 (for example
   the entry did not commit, or its commit is not observable at the holder at that moment) and keep every original
   assertion that still describes the contract. If the property is now unreachable in ANY schedule, say so and show
   why, and keep a witness for the nearest reachable schedule. Put the before/after of each changed assertion in the
   transition record so the independent verifier can check it.
B. Items 2-4 must be attributed by evidence before any change: for each, establish whether it is a product defect
   of stage 2, a witness defect, or a pre-existing behaviour; S11 first, because two previously green removal
   witnesses going red is a regression until shown otherwise (compare with their behaviour on 8eba5f745 using the
   retained lab outputs or a focused lab run of that sha).
C. Residuals: (i) the receiver must attest its OWN replica created_at together with its boot incarnation (the pair
   existing owners attest), not rely on the sender's cache for it; (ii) tenure-end release must not wait for an
   unrelated later event: the leadership-loss event of the ledger replica is the release trigger (the owner already
   binds a wake to the service); witness: after demotion with no further commit/ingress the record map is empty and
   no timer is armed.
D. Then the mutation table (six mechanisms, each mutant built on a detached HEAD through the normal hook via
   heavy.sh, run on the lab, kept under a local `probe/w1-…` ref, never pushed to the work branch), and the change
   cone versus 0993265e5 on tv-dator.
