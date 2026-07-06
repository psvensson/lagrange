# Refined forward plan — after fresh production-Raft review (round 2)

Source: `verify-plan-vs-raft-practice-round2.md` (fresh web read of etcd/raft,
CockroachDB, TiKV/PD, Hashicorp Nomad/raft, Ongaro §3.10). Verdict on the
(i)+(ii) plan: **directionally right, NOT yet idiomatic — refine.** It caught two
anti-patterns in my plan and one missing move.

## What the review corrected

1. **My (i) ordering was the anti-pattern.** I proposed "shed leadership, then
   re-probe for a successor as a follower." Industry pattern is the OPPOSITE: **stay
   leader and retry the transfer** until a caught-up successor accepts it; never
   relinquish first. etcd on a failed transfer "becomes leader again"; Nomad retries
   while leader; a retry-after-shed loop is a *filed leaderless-void bug*. **A
   "re-probe as a follower" state must not exist.**
2. **My (ii) "keep serving while unfit" is dangerous as written.** A degraded leader
   must NOT keep acking writes — CockroachDB *crashes* on a disk stall specifically to
   avoid acking non-durable writes. Refinement: **hold the role to keep retrying the
   handoff, but STOP ACKING durability** (fail those writes loudly) rather than "serve
   normally."
3. **Missing move for the whole-group-degraded case.** When the storage problem hits
   the whole group (our peers are degraded on the same wedged partition), moving
   leadership is the wrong tool — TiKV's evict-slow-trend *tolerates* past an
   affected-ratio threshold, and "PD keeps transferring leader to a down store" is a
   bug. **Escalate to reconfiguration (replace the member / pre-ready a learner) via
   the control plane instead of thrashing leadership.**

Confirmed as-is: transfer requires the target caught-up to the leader's committed
index and brings it current before `TimeoutNow` (Q1 SUPPORTS); the "acked-in-10s"
viability signal is far too weak — use **caught-up-to-committed + voter(not learner)
+ healthy + Progress=Replicate** (Q5 SUPPORTS); and the trigger should be driven by
peer/control-plane liveness, not orchestrated by the sick node itself (Q6).

## The refined plan (replaces i+ii)

**R1 — Never shed into a void (ordering fix).** Replace the blind
`performTrackedLeaderDemotion` at first detection with: the unfit leader **retains the
role and retries a DIRECTED leadership transfer** to a genuinely-viable successor. It
relinquishes ONLY as the atomic result of a transfer the target accepts — never as a
speculative step-down. This removes the "shed → follower → wait for self-heal" 66s
void directly.

**R2 — Stop the false acking while unfit (safety fix that keeps the sibling-quest
invariant).** While unfit and holding the role, the leader must stop acking
non-durable writes (surface them as failures) — this preserves the sibling quest's
"must not remain a silently-lying leader" invariant WITHOUT requiring an immediate
void-causing demotion. (Reconciles with the shipped design: the shipped fix demotes to
stop the lying; R2 stops the lying while holding the role until a real successor is
ready.)

**R3 — Strong viability gate.** Replace `hasViableLeaderDurabilitySuccessor`'s
recent-ack heuristic with: target is a VOTER (not a learner), Match == leader's
committed index, recently heartbeat-healthy, and not itself durability-unfit.

**R4 — Escalate, don't thrash, when no successor is genuinely ready.** If R3 finds no
viable target within a bound (our run-6 case: target is a catching-up learner, peers
degraded), escalate to the control-plane/rebalancer to **pre-ready a caught-up voter /
replace the member** rather than keep leadership moving. This is the "heal-latency is
the real constraint" acknowledgement — a transfer primitive only pays off if a
caught-up voter has been made available.

## Biggest single risk (called out by the review)
Any path that relinquishes the role when no electable successor exists reproduces the
exact 66s void. R1 (never shed speculatively) is the load-bearing guard.

## Owner-boundary note
R1+R2 INVERT part of the shipped `formation-ledger-leader-local-persistence-wedge`
design (which demotes-immediately). This is a deliberate correction of that quest's
mechanism, not a new bug — it must be framed as such and re-vetted against the
CL-033/034 re-election-churn and "never bare-rollback" constraints that motivated the
original demote-immediately choice. That re-vet is a prerequisite before code.

## Next step (unchanged in shape, refined in target)
DT-first, decision-level, on the existing `dt6-ledger-leader-durability-fitness`
harness: assert the unfit leader **retries a directed transfer while holding the role**
and **never enters a role-less state when no viable successor exists** (RED on the
current blind-shed head). Outcome-level multi-node test as follow-on. Do NOT implement
R1–R4 until the shipped-design re-vet (owner-boundary) is done.
