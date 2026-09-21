# Handover: the raft-rs backend line of work (2026-09-21)

For whoever picks this up next, agent or human. It assumes you have read
`CLAUDE.md` and `docs/steering/rules.md` and nothing else about this work.

Everything below is either measured and cited, or explicitly marked as a claim
that was never independently verified. Where three independent verifiers agreed,
that is said. Where an implementer's report was the only source, that is said
too — several such reports were later falsified, so the distinction matters.

---

## 1. The one thing blocking everything

`raft-rs-runtime-boundaries` was rejected three times. The third rejection
triggered a stopping rule the owner set in advance, so the quest is **stopped
pending an owner decision**, not in progress.

**The decision the owner owes:** redesign what the public backend seam hands
out. Not another repair.

Three rounds measured the *same consequence* — a durably retired, restarted
replica disrupting the live cluster from a public object — with the mechanism
displaced each time:

1. the seam returned the core and the handle as fields;
2. it returned a host object from which both were one dereference away;
3. the core became genuinely unreachable, but the **gate's inputs** were not:
   `lifecycle.record` is a writable property reached through the provider's
   public `partitionControlOf`, and the durable record behind it is a live
   SQLite connection the seam hands out.

The owner's rule: a third instance means the public object boundary itself is
wrong and must be redesigned before transport. **Do not attempt a fourth round
of hiding the handle more deeply.**

A lead observation, not the owner's, offered as a starting point: each round the
seam handed out *objects* and the repair removed one capability from them. A
seam that hands out only *operations* — no object a caller can reach through —
is a different design, not a smaller patch.

Also required by that rejection: rebuild the core-entry census around an
instrument that counts **core entries**, not **gate crossings**. The present one
cannot see an ungated entry by construction, and its runtime-host recogniser
names a method (`enter`) the repaired host no longer has.

---

## 2. Repository state

**Nothing in this line of work has been landed, merged to `main`, or pushed.**
`main` is at `bce6a3637` with **21 unpushed commits**, all records-only: owner
directions, evidence packets, verification reports. No production file on `main`
changed for any of this.

Branches (all local, none pushed):

| Branch | Head | State |
| --- | --- | --- |
| `quest/raft-rs-runtime-boundaries` | `1a1b5fd4e` | stopped, three rejections |
| `quest/raft-rs-experimental-partition-backend` | `fe6e04c3d` | phases 1-5, verified approve-with-recorded-defects |
| `quest/audit-evidence-binding` | `62f647437` | exhausted (rejected-by-architecture) |
| `quest/replica-membership-model-reduction` | `3dd08cb25` | written, never sealed, superseded in practice |

`quest/raft-rs-runtime-boundaries` contains all the partition-backend work as
its ancestry — it was branched from it. That branch is the live one.

Tags pinning trees that are not on a branch:

- `raft-backend-evaluation/round-3-rejected-tree` — the exhausted evaluation's
  exact tree. Not on a branch because three of its files exceed the test
  file-size ratchet and the hook was not bypassed.
- `audit-evidence-binding/round-3-verified-tree` — the exact tree that quest's
  third verifier saw.
- `raft-rs-backend/phases-1-3` — a pin taken when 73 files were staged and
  uncommitted; superseded by real commits, kept for provenance.

Worktrees under `.claude/worktrees/`: `raft-rs-boundaries` (the live one),
`raft-rs-backend`, `model-reduction`, `records`. The `records` worktree is where
records-only commits are made before fast-forwarding `main`.

---

## 3. Owner directions — read these before touching anything

All in `solve/epics/formation-seed-decoupling/`:

- `binding-direction-raft-rs-experimental-backend-2026-09-21.md` — **the
  governing document.** Read it whole, including its three addenda:
  - the phase-4 addendum (the partition construction seam),
  - the phase-5 addendum (the proof answered the question; spend narrowly),
  - the prerequisite addendum (`raft-rs-runtime-boundaries` before transport).
- `owner-decision-raft-backend-evaluation-2026-09-20.md` and its three addenda —
  why raft-rs is being evaluated at all.
- `binding-direction-replica-membership-model-reduction-2026-09-20.md` —
  complexity reduction as the objective; Model A.
- `owner-decision-transition-identity-2026-09-20.md` — superseded in part by the
  model-reduction direction.

Two more owner rule-sets live only in the quest log of
`solve/quests/raft-rs-runtime-boundaries/log.ndjson`, as `decision` entries: four
added constraints, then thirteen final rules. **Rule 12 is the stopping rule that
fired.** They were recorded as strengthening decisions rather than a reseal,
because the quest was already sealed.

The owner's standing preferences, distilled:

- Fewer concepts, not reorganised ones. A phase that adds a mechanism while
  leaving the old machinery active is not success.
- Abstract the semantic contract, never the vendor's event name.
- Measure; do not assume. A scenario not driven is recorded undriven and
  unanswered — never "probably fine".
- Never invent an imitation of another backend's behaviour to make an interface
  look complete. A named refusal beats a silent lie.
- Stop and report a falsifier rather than widening scope to make something pass.

---

## 4. What is measured and true

Independently verified — three separate adversarial verifiers, each driving the
core themselves, agreed on all of this:

- **raft-rs consensus core: viable.**
- **WASM RawNode boundary: viable with named gaps.**
- **Lagrange migration: undetermined, no decisive incompatibility found.**

About the *current* liferaft backend (measured on production owners, reconfirmed
every round):

- There is **no committed Raft membership.** `join`/`leave` edit a local
  in-memory peer array; quorum is computed from it; each node reconciles its own
  array from cached `services` rows.
- Two nodes whose caches disagree reach **two different voting configurations**
  with no consensus operation. A `SYNCING` row is a voter.
- The configuration is local, unreplicated and carries no generation.
- **Term and vote are never persisted.** `persistTerm`, `persistVotedFor`,
  `setTerm`, `setVotedFor` have no caller in `src`; `_raft_state` holds zero rows
  after a granted vote; a restarted replica returns at term 0 free to vote again
  in a term it already voted in. Only snapshot install writes a durable term.
- `partition-service-raft-peer-cache-reconciliation.js:164` and `:294` call
  `raft.leave(address)` from service rows — service metadata **is**
  consensus-membership authority on that backend. The owner ruled this a
  **cutover deletion target, not a repair**: liferaft has no replicated
  mechanism to replace it, so removing one direction in isolation risks stale
  voters indefinitely.

About the experimental backend (phases 1-5, verified approve-with-defects):

- A real partition on raft-rs **survives restart** — term, vote, commit and
  committed voters restore from real on-disk SQLite.
- **`ConfState` stays authoritative under hostile caches** through the real
  partition path, including the case where one replica ends with no service rows
  at all and is still a voter everywhere.
- Sequential learner → catch-up → promotion → removal works.
- The required backend interface shrank from ~80 LifeRaft members to ~36 names.
- `src/partition` has **zero** `extends LifeRaft`.

Findings a transport implementer must know (each measured):

- **H1, the most dangerous:** a host failure inside a Ready cycle leaves an
  un-advanced Ready, and the **next** ordinary drain panics in the crate at
  `raw_node.rs:496` and retires the whole shared runtime. Reachable wherever a
  group is momentarily its own only voter — the formation path — and triggered
  by exactly what transport adds. No receipt measures the call *after* a host
  failure.
- `provider.propose` with a JavaScript object does not throw: the glue reads
  `.length` as undefined and the core receives an **empty proposal**, which a
  leader would commit. `partition-service-raft-write-commit.js:37` hands it
  exactly such an object.
- The inbound demux speaks liferaft's packet vocabulary, so `isRaftPacket` is
  false for a raft-rs envelope; the real transport cannot deliver to a raft-rs
  partition yet.
- One WASM runtime is shared by every partition group in the process; one
  group's trap stops all of them.
- Handles are small consecutive integers, and `adoptGroup` accepts a caller's
  handle and lifecycle.
- A wrong-typed handle coerces to 0 and reaches another group.
- Never `campaign()` a learner (it becomes leader) or a removed peer (it
  panics after real voters vote for it).
- raft-rs permits promoting a learner that is not caught up; gating is
  Lagrange's job.
- A stack-exhaustion trap arrives as a `RangeError`, not a `RuntimeError`.
- `pre_vote` and `check_quorum` are **off**, deliberately. Every measurement in
  phases 1-5 was taken with them off. Evidence favours turning both on; the owner
  ruled that a separate later step so it does not confound earlier receipts.

---

## 5. The recurring failure pattern — the most valuable thing here

Across two different quests, **eight adversarial verification rounds rejected
work that reported every receipt green.** The pattern is always the same:

> The receipt checks the shape of the thing rather than the property it claims.

Concretely, what kept happening and what fixed it:

- A crash matrix where six "distinct" boundaries were one host state, because
  the trigger fired on the first cycle rather than the one carrying the entry.
  *Fix: define a boundary relative to the entry under test, and assert each
  boundary's own distinguishing durable facts.*
- A restore oracle that computed its expectation by the same code path it was
  testing. *Fix: the expectation comes from the pre-crash core, or from the
  survivors — never from the path under test.*
- Evidence "bound" to a row by an id the emitter stamped on. *Fix: the receipt
  carries what the run observed, and the validator proves the measurement is
  about that row.*
- A guard asserted by checking two property names at depth one, satisfied by
  renaming the property. *Fix: assert reachability, not names.*
- A census whose only instrument was the counter the thing it was hunting never
  moves. *Not yet fixed — this is the open item.*

**If you take one rule from this handover:** before building the thing, build
the control that would catch it being wrong, and *watch the control fail.* Every
round that did this survived verification; every round that wrote the code first
and the test after was rejected. Two implementers disclosed writing production
before tests; both were rejected on exactly the surface they could not see.

Corollary the owner made binding: identity and expectations come from production
state or the core, never from a test literal, and never from the code path under
test.

---

## 6. Practical traps that cost real time

- **Test runners.** Files import the project's `tap` helper, not `node:test`.
  Running one bare produces false failures (a verifier reported 10 failures that
  were an artefact). Use `node scripts/run-test-files.js` or
  `run-classified-test-files.js`.
- **Ratchets are one-way.** Fix, de-export, extract or simplify. Never raise a
  baseline; several checkers offer an exclusion mechanism for genuinely
  generated material, which is the correct tool.
- **Generated output does not belong under `src/`.** Every source-walking
  checker has to be taught about it separately and one *will* be missed. The
  binding now lives at `vendor/raft-rs-wasm/`; six exclusions were deleted as a
  result.
- **The pre-commit hook regenerates inventories**, so the committed tree can
  differ from the staged one. Never bypass it; if it refuses, fix the cause.
- **`solve start` refuses a probe that is not red**, so tests and the evidence
  script must exist and fail before sealing. Plan for two phases: red first, then
  implement.
- **A sealed quest takes no further log entries after a terminal one.** Record
  corrections before closing.
- Shell heredocs mangled an evidence script twice in this session. Prefer file
  edits over generating code through shell quoting.
- Long implementer sessions exhaust context (one reached ~650k tokens). Split
  work into handover-sized phases from the start and hand back early with a
  precise remainder rather than compressing.

---

## 7. What is parked, and must not be quietly absorbed

Recorded as inputs to the transport quest, not to be fixed opportunistically:

- the apply-rollback invariant (not preserved on the raft-rs path — a real gap;
  do **not** invent a fake LifeRaft event for it);
- outbound proposal encoding (the empty-proposal defect above);
- the committed-entry callback shape, which differs between backends;
- the module-level shared runtime host;
- the unregistered-peer workflow rule, which today exists only in a test driver.

Also parked by owner decision: the liferaft service-row membership defect
(cutover deletion target); `pre_vote`/`check_quorum` defaults; runtime sharding;
the broad side-by-side corpus; the scale campaign.

Two quests are superseded and must not be resumed as they stand:
`replica-membership-model-reduction` (its premise assumed a committed membership
that does not exist) and `raft-backend-evaluation` (exhausted; **its artifact is
uncertified and must never be used as an oracle or a baseline** — cite a named
verifier's measurement instead).

---

## 8. If the owner authorises the seam redesign

The scope the third verifier named, which the lead endorses:

1. Neither the core, nor the eligibility owner's *answer*, nor the durable
   record that answer derives from may be reachable or mutable through the node,
   the group object or the provider's control.
2. Rebuild the census around an instrument that counts core entries. Test it by
   adding an ungated entry and requiring red — the present one stays green.
3. `openGroup`, `adoptGroup` and `replaceRuntime` enter the core outside both
   boundaries; bring them inside or justify why they cannot be.
4. Then re-verify against the owner's seven transport preconditions, of which
   three, four, five and seven are currently affirmed and one, two and six are
   not.

Transport (`raft-rs-partition-transport-demux`, scope already defined in the
phase-5 addendum §5-§10) starts only after all seven are affirmed.

---

## 9. Evidence you can rely on

- `evidence/raft-backend-evaluation-verification-2026-09-21/` — three full
  verifier reports and their attack scripts, from the exhausted evaluation.
- `evidence/model-reduction-reconnaissance-2026-09-20/` — two read-only surveys
  of production, with the lead's verified subset called out separately.
- `evidence/overflow-budget-audit-verified-packet-2026-09-20/` — a sealed
  records-only packet from an earlier stopped audit, with its own manifest.
  Same rule: it is uncertified historical evidence, not an oracle.
- The quest logs themselves are the primary record. Every rejection, every
  ruling and every method disclosure is there, append-only.
