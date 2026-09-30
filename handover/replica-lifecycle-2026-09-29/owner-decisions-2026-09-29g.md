# Owner decisions 2026-09-29 (round 8, BINDING) — answers to the three open handover questions

Given after the local session was lost to a machine restart; round 8 resumes in a cloud session on
branch `claude/lagrange-work-wyz3yo`, starting from the r7-final tree (78b0cfbd3).

1. **N2 design: ACCEPTED.** The activation effect section (opened at the in-lane exact-handler check,
   closed when the ACTIVE CAS and its lost-ack readback settle; retirement waits only on an open section)
   is the accepted shape. Do not revert to holding the whole ReplicaStateMachine lane.
2. **Message-group activation: FIX IN THIS QUEST (class repair).** Apply the same shape to
   message-group activation (message-group-service-activation preflight + persistMessageGroupActivation
   CAS): exact handler identity checked inside the lifecycle owner with no await before the ACTIVE CAS,
   exact-identity retirement that waits only on an open effect section. Same witness set as round-7 N2
   (owner-decisions-2026-09-29f.md section 2), red-on-revert.
3. **The two candidate-only reds: CLASSIFY FIRST.** Find the first divergence against base 6831054b1 for
   formation-sim-production-partitions ("Seed partition storage admission deferred") and
   bootstrap-mode-routing.property (SERVICES upsert refusal). If the candidate's refusal is the intended
   rule, adapt the property generator (record it in the fixture inventory). The formation-sim red is a real
   finding until explained; simulator quests never touch src.

Then: re-freeze from scratch per owner-decisions-2026-09-29f.md section 5, fresh verifier per section 6.
