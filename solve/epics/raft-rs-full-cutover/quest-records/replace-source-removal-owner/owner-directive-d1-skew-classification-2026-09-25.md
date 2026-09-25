# Owner directive (2026-09-25, binding): classify the services-row skew before sealing D1

**Status wording until classified:** "concrete REPLACE bootstrap safety repair complete; authoritative remote-membership sourcing still under classification." Never redefine services rows as committed membership.

## 1. The release-blocker falsifier
Run one narrow check on the smallest realistic target bootstrap through the real path, with two skews:
- **Missing committed voter:** authoritative membership contains source A, but the services rows omit A.
- **Phantom voter:** authoritative membership lacks X, but the services rows include X.

For each skew, answer one question: can the new replica participate in consensus with the wrong bootstrap before replay or admission corrects it? Observe whether it can do any of these:
- campaign;
- raise terms or disrupt the leader;
- vote;
- become leader;
- accept or commit writes;
- form a quorum under the wrong membership.

Also observe when the replay corrects its local configuration.

**Decision rule:**
- **Safety violation** (a leader under a wrong voter set, a commit with a quorum invalid under authoritative membership, or incompatible leadership or quorum views): the authoritative committed-membership boundary is implemented BEFORE the publish. The membership/replica owner owns it, and ADD, REPLACE and formation reuse it. There is no REPLACE-only RPC.
- **Fail-closed** (the replica cannot participate until admission or replay; skew only delays or refuses): record it as the next membership-owner quest. A liveness problem alone is a follow-up unless it violates an existing release gate.

## 2. The not-yet-admitted-voter finding
Classify it with the same probes.
- **Safety blocker, fixed before the publish:** it becomes an authoritative leader it should not be, commits, votes as a member before admission, or produces incompatible quorum authority.
- **Availability defect, next membership-owner quest:** it only raises terms, deposes leaders or causes churn. The SLO and acceptance gates may still make it blocking operationally.

## 3. CA3 stays separate
It stays separate unless REPLACE correctness depends on guaranteed event delivery. The design already has an event wake, a fresh reread, fallback and reconciliation, and a REPLACE re-drive. If this quest does depend on guaranteed delivery, repair the owner/reconciliation contract here, not all of CA3.

## 4. Finish the REPLACE checklist before A2
The checklist covers:
- membership-change wake;
- durable removal-intent boundary;
- no timer-driven FAILED after it;
- bounded re-drive;
- committed-membership reread before completion;
- handoff-attempt identity;
- planner exclusion;
- restart and recovery.

## 5. Lab changed-files base
Parameterize the existing lab runner so changed-file selection accepts an explicit comparison SHA (`--base <sha>`). The default stays origin/main. Add a tiny contract test showing that the supplied base controls the selection. Do not build a second selection system.
- For evidence-only work, compare against the frozen production_sha.
- For a production corrective, compare against its parent checkpoint.

## 6. Production and evidence commits stay distinct
Follow these steps in order:
1. Commit the production checkpoint.
2. Record its production_sha.
3. Merge D1.
4. Run the focused production checks.
5. Apply the evidence in a separate commit.
6. Prove mechanically that production_sha..evidence_sha has no production change.

## 7. Stop when decisive
This is a safety/liveness classification, not a rate estimate.

## 8. The follow-up packet if fail-closed
If the skew is fail-closed, the immediate post-publish membership-owner quest investigates three things as one ownership question first:
1. the authoritative committed-membership read for bootstrap, shared by ADD, REPLACE and formation;
2. CA3;
3. the not-yet-admitted replica disturbing leadership.

All three sit at the boundary between desired or projected membership and the membership that holds consensus authority.
