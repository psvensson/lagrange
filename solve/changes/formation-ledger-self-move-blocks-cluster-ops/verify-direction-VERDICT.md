# Direction verification VERDICT — veto-recusal REFUTED, redirect to CL-042-shaped honesty (DT-gated)

Cross-check of the `research-lever-synthesis.md` recommendation against (1) external
production-Raft practice and (2) in-repo prior art / machinery. Inputs:
- `verify-external-practice-persistence-honesty.md` (etcd/raft, CRDB, TiKV, Ongaro, SwarmKit)
- `verify-inrepo-priorart-machinery.md` (CL-040/041/042, sibling durability-fitness quest)
- existing s7 `research-external-systems.md` / `research-theory-papers.md` (Ongaro §3.10, Pre-Vote/CheckQuorum)

## Headline: the proposed veto-recusal root lever is REFUTED (both sides agree)

- **External:** No mainstream Raft relaxes the §5.4 up-to-date veto on a node's
  self-detected unfitness. The universal answer is the opposite — step down / demote
  to non-voter (Learner) / remove: a role or membership change, never a per-node
  relaxation of a safety property decided by a malfunctioning sensor. etcd/raft is
  categorical that writes must be **durable before response messages are delivered**;
  advertising a non-durable index IS the invariant violation — fix the log layer,
  don't route around the lie. This is the same "don't build logic on a lying sensor"
  class as the already-refuted **Path-H** deadband.
- **In-repo:** Veto-recusal weakens a §5.4 veto — the **opposite direction** from all
  three CL-04x raft-safety fixes, which strengthen the up-to-date check. **CL-042**
  already fixed this exact class ("a node must not advertise a log position it does not
  truly hold") by **correcting the advertised `getLastInfo()` value** at both adapters
  (`sqlite-log-adapter.js:157-168`, `in-memory-log-adapter.js:84-86`), symmetrically —
  NOT by muting the veto. Recusal would need an unproven safety lemma that CL-042's
  value-correction sidesteps.

## The redirected candidate root (idiomatic, reuses existing machinery)

**Make a durability-unfit log adapter advertise its HONEST DURABLE index (a CL-042-shaped
value correction), not a phantom-high in-memory one.** The honest durable watermark
already exists: `partition-service-durability-fitness.js readDurableCommittedIndexWitness:112-143`.
Then Raft's own §5.4 does the right thing (an honest durable candidate is no longer
vetoed) and CheckQuorum-style step-down (etcd #15247 "leader stuck in fdatasync steps
down" — our exact `Query timeout` case) deposes the wedged leader correctly. This is
durable-before-advertise in the repo's established value-correction idiom — no new
read path, no §5.4 relaxation.

- **Reuse:** EXTENDED (CL-042 adapter value-correction pattern + the sibling quest's
  existing durable watermark). Contrast the refuted recusal (NEW safety-relaxation).
- **Sequencing after root:** Ongaro §3.10 leadership transfer / `MsgTimeoutNow` to a
  **confirmed caught-up** voter is the idiomatic reseat (SwarmKit #1939 "Use
  TransferLeadership to make leader demotion safer"). This is **Lever B**, EXTENDING
  shipped `STEP_DOWN_REPLICA`/`requestElectionNow` — keep as defense-in-depth AFTER the
  root, as originally sequenced.
- **Pre-Vote:** DEAD/unwired here (only the `raft-logic-spike-adapter.js:231` external
  spike, imported nowhere) and would not fix the veto anyway. Do NOT re-chase.

## BUT — a load-bearing premise is UNVERIFIED and currently CONTRADICTED

Lever-C's mechanism assumed the zombie advertises a phantom-**HIGH** index that vetoes
honest candidates. The **sibling quest's own design-vet finding** says the zombie's
in-memory index **== the followers'** index (which is precisely why `deferCandidacy`
was needed there). If index == followers, the wedge is NOT caused by a phantom-high
§5.4 veto, and the "advertise the honest durable index" fix would not move the
election either. The two are reconcilable ONLY if the election is being won/lost
against a **catching-up, voter-ready target** whose index is legitimately behind — but
that is **not yet shown in any evidence or test**. Additionally, the durability-fitness
verdict is a **≥60s strike-latched** signal, not a per-vote one — so any correction
keyed on that verdict cannot act earlier than the demotion already does; it must key on
the faster per-append durable watermark to help at all.

## Therefore: the next step is DT-first, and it is now DOUBLY motivated

Build the deterministic test that reproduces — **or falsifies** — the exact election
wedge: a 3-node `replica_operations`-style raft group where one node's local durable
write wedges (timeout), a voter-ready caught-up target exists, and we assert whether a
leader is (or is not) installed in bounded ticks. This test must resolve the
phantom-HIGH-veto vs index==followers contradiction BEFORE any fix is chosen:
- If it reproduces a §5.4 veto by a non-durable advertised index → the CL-042-shaped
  honest-durable-index correction is the root fix (prove red-on-revert against it).
- If it does NOT (index == followers; the wedge is elsewhere — e.g. the target can't
  campaign, or votes can't persist) → the honest-index fix is refuted too, and the DT
  will show the true election-blocking mechanism.

Substrate: `election-jitter-seed.test.js` (LifeRaft on VirtualTimeSource +
SeededRandomSource) + `dt6-ledger-leader-durability-fitness.test.js` (real
file-backed-sqlite wedge physics). No live gate.

## Net change to the plan
- **DROP** veto-recusal (refuted external + in-repo; a §5.4 safety relaxation).
- **Root candidate → CL-042-shaped "advertise honest durable index"** (value
  correction), GATED on the DT confirming the veto mechanism.
- **KEEP** Lever B (directed transfer) as post-root defense-in-depth — now
  theory-endorsed (Ongaro §3.10, SwarmKit).
- **NEXT = the DT**, which must falsify-or-confirm the mechanism before any patch.
This verification did its job: it caught a non-idiomatic, safety-weakening direction
and a contradicted premise before a single line of fix was written.
