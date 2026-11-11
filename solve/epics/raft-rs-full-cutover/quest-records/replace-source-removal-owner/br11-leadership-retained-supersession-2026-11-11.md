# BR11 supersession: leadership retained when the source does not lead (2026-11-11)

Authority: owner instruction of 2026-11-11 ("I allow you to unseal and unpin any quests or earlier decision needed to come to a provably stable system"), recorded in the `fresh-formation-user-table-routability` quest log. The sealed files in this folder are unchanged; this record supersedes the named text (R09). Full design, safety argument, transition record and test list: [`replace-leadership-supersession-design-2026-11-11.md`](replace-leadership-supersession-design-2026-11-11.md).

**Supersession of BR11 (coverage-model-amendment-1, section 1, row BR11;
section 0 table row BR9, first sentence) - leadership is retained when the
source does not lead.**

Superseded text: "REPLACE handoffs become named-target-only (always t)" as
read with BR11's "A fresh `lead === t` does [authorize removal]" to mean
that every REPLACE on a handoff-required partition moves leadership to its
target before its source is removed.

Superseding rule: a REPLACE's source may be removed when either (a) a
fresh read of the target shows the target leading (BR11, unchanged), or
(b) no handoff attempt of the operation is unresolved and the group's
current leader - the leader's own answer, applied at its commit index,
confirmed by a majority of its voters at its term (the completion
authority of the owner ruling on FINDING F1 and fix-f7), and agreeing with
the target's own read at the same term, with the target a voter past its
participation gate - is neither the source nor the target. In case (b) no
handoff is issued. The named-target handoff is issued only when the source
itself leads.

Unchanged and still binding: handoffs are named-target-only (BR9: at most
one transferee, t, per operation); COMPLETED election evidence authorizes
nothing (BR11, first sentence); an unresolved attempt, including the
pseudo-attempt rebuilt after a restart (BR10), blocks issuance and - unless
the target leads - the removal (T-9); the row-based ownership wait stays
superseded (BR3); completion is decided only against committed membership
(P1).

Why: the planner chooses non-leader sources so that leadership need not
move; the always-handoff reading moved it anyway. In fresh 3-node
formations this concentrated control-plane leadership on the joining node
and missed the formation bound (9 lab runs, 2026-11: 70 s without
leadership movement, 172-286 s with). The authority that makes (b) sound -
a majority-corroborated current-leader read - did not exist when BR11 was
sealed.

Tests superseded with this record: the BR11 cell of
`test/rebalancer/replace-named-handoff-attempt.test.js` ("a third replica
leading gets the named-target handoff") and the follower-source cells of
the `replace-real-group-*` family that expected the target to lead; each
is listed with its reason in the change's report.
