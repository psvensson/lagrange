# Lead rulings (Claude, takeover 2026-11-21)

## 2026-11-21 ~12:10 CET — on W4 (fallback-read closure), report w4-fallback-read-closure.md
- H1 Owner fact = the leader-qualified read (leader REQUIRED + receiver-verified witness, index/term floors,
  commit == applied). It may schedule or propose; it never authorises an effect. Every effect is granted by a
  conditional committed write (CAS / native admission). SF-1 and SF-2 are repaired by putting the effect behind
  the conditional write, not by adding ReadIndex. ReadIndex would change the guarantee level: not adopted now;
  recorded as a possible later owner decision. (Lead judgment within the existing authority-and-recovery contract.)
- H2 Approved: in-process leader arm and widened candidates with receiver-side witness verification. This is
  routing to the one authority, not a second algorithm; a non-leader refuses with a typed answer.
- H3 Open: budgets (maxConcurrentRemoves/Adds) safety bound vs throttle — the S6 writer establishes it from the
  owning docs before S6; default assumption (unverified): throttle, safety is the remove-safety owner's.
- H4 S2 follows the W2 composition landing on the integration branch. The primary checkout's uncommitted
  strict-operation-outcomes tree is a stale early state from 2026-11-20 (68 of its 92 files differ from the
  composed runtime, which has all of them); it is preserved at preserve/20261121/primary-checkout and is NOT an
  in-flight writer. S1 bases on the integration line.
- H5 authorizeLegacyRuntimeRemoval: prove no token-less row can exist and delete; else a one-time explicit
  transition. No hardened legacy path.
- H6 Extract the shared owner-fact read in S0 (new files); the retained-repair owner adopts it at merge.
- H7 Retire the 2026-11-10 label-based checker in S-P, replaced by the one-way ratchet; S-P starts after W2
  merges the proof-closure branch.
- Order: S-P and S0 first; S1, S3, S4, S5 after S0 (disjoint writers); S2 after W2; S6-S9 after physical
  acceptance unless H3 says the budgets are safety bounds.

## 2026-11-21 ~12:30 CET — owner instruction on fallbacks
Owner: "I am concerned with the existence of fallbacks. It smells of legacy a bit. Please test any multiple path
for the same logic to make sure they really, really need to be there."
Ruling: burden of proof is on keeping an alternate arm; evidence is execution measurement and a trap/deletion
experiment, never a label. Track N (necessity audit) started: worklist from the coverage census
(`data/fallback-census/census.json`), trap-mode design, deletion slices, one-way ratchet. Reports under
`reports/necessity/`.

## 2026-11-21 ~12:00 CET — on W3 (leader identity has one authority), report w3-leader-authority-migration.md
Finding that corrects an earlier lead statement: the broken role readers #2-#5 are NOT shown to delay the
three-host formation or admit an unsafe removal (formation is ADD-only; #2 is neutral in all 38 recorded
decisions; #3/#4 are decision-dead; #5 has a live arm that answers first). Formation evidence instead shows
serialisation behind the ledger partition (~43 s), ~27 s without row change, and failed control-snapshot reads.
- D0 (b): run the checker/ratchet and the deletions of decision-dead arms now (S2a-c). Behaviour-changing
  slices (S1, S3, S4a, S4d, S5) wait for a formation baseline on the collected runtime and each gets a
  formation comparison; they are not dropped.
- D1 (a): owner row stays node-level; replica identity only from local or fresh-witness reads.
- D2: OWNER DECISION PENDING (re-key #2 = surrogate scheduling live for the first time, versus delete the lane
  and supersede quest movielens-priority-surrogate-single-owner-arbitration).
- D3: delete the guess tiers with the role arm for #8, #13, #14 (leader unknown = typed deferral + wake).
  #15's "any observable replica" first hop is subject to the necessity test before it is kept or renamed.
- D4: RETAINED_RUNTIME tier stays for now, bound recorded in the contract, subject to the necessity test.
- D5: message-group producer flip and its readers in one slice.
- D6: split-brain scenario cannot observe a leader: recorded as a finding, repair in S6.
- One ratchet, not three: the leader-authority rows, the fallback-read rows and the census buckets go into a
  single checker; its writer starts when the necessity audit reports.
