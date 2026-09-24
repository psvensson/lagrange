# Cutover seed parity: closing note

Recorded 2026-09-24. Branch `fixes/cutover-seed-parity`. Production is frozen at 55a42ef57, and the evidence sits on top of it (79db60fbd). The fresh final verifier approved in round 9. The A2 acceptance gate and the publish result are recorded after this note, in the merge and publish commits.

## What the unit repaired

It fixed the two regressions that caused the rs-raft integrated head's publish to be refused on 2026-09-24:
- **membership-consistency.** The first membership epoch was empty. There is now one publication-owner interpretation of membership, with two reads: the published read and the pending read. A failed joiner is retracted from the right read.
- **seed-node-bootstrap.** The CDC shutdown lingered; the seed-node-bootstrap run dropped from about 110 s to about 35 s. The CDC lifecycle now has a typed terminal SHUT_DOWN owner.

Along the way it closed, at the owner and as a class, the shutdown-quiescence property the owner stated on 2026-09-24:
- **P-Q:** once a CDC lifecycle owner is terminal, no CDC-owned retry or publication work may remain pending, be newly scheduled, or execute.
- **P-L:** no referenced CDC-owned handle keeps the process alive.

Where the two owners enforce it:
- **CDCGroupPropagationService.** Its one timer primitive, `armPropagationTimer`, refuses to arm once the service is stopped. That primitive covers the batch window, the retry sleep and the background wave. `stop()` settles every waiter, and an event sent after stop is answered stopped.
- **The CDC integration service.** It has one terminal gate, `refuseIfTerminal`, with three choke points:
  - issuing a read, at every stage;
  - applying a cache repair or sweep;
  - an engine or partition hop.

  An in-flight leg stays NOT_CONFIRMED, with its own answer as the cause. The catch-up counts a table as hydrated only when the table's applies ran before terminal.

## Rounds

| Round | Verdict | What it found |
|---|---|---|
| 1-2 | reject | the CDC terminal answer; the empty first epoch; the retraction read; propagation stop not settling batches (B-A) |
| 3 | reject | R3-1: a retry was armed after an in-flight attempt at stop |
| 4 | reject | R4-1: a background wave re-armed after stop. This led to the class repair through one timer primitive |
| 5 | approve | production. The census witness was shape-level (N2) |
| 6-7 | reject | witness only: first stack attribution, then the handle count, was defeated. This led to the owner's verification protocol |
| 8 | reject | the evidence author found that the catch-up sleep bypassed the owner. After the P1 repair, a fresh verifier found in-flight work crossing terminal at seven sites. This led to the owner-level terminal gate, with the evidence written independently |
| 9 | **approve** | fresh verifier; the semantic attack matrix under the owner's round-9 rules |

## Recorded follow-ups (not in this unit)

- **R9 N1, uncertain-write honesty under a virtual clock.** The local leg starts a fresh `issued` on each attempt (`routed-mutation-readiness.js:119, 125-127`), and a thrown engine answer is not recorded (`:473-477`). If the mark lands between a retry timer and its continuation, a write whose earlier attempt answered OUTCOME_UNKNOWN is answered `not_routed`. It is unreachable on RealTimeSource: microtasks drain after every timer callback, and the retry delay is at least 100 ms. The fix is one line: seed the local leg with `issuedHop.answer` and record thrown engine answers. Owner decision: whether virtual-clock orderings are in scope for rule 3.
- **R9 N2, read honesty.** In OWNER_LOCAL_ONLY mode, a read refused at terminal answers the retryable `authoritative_row_source_unavailable` and loses SHUT_DOWN (`authoritative-read-flow.js:250-264`). No CDC-owned loop consumes that answer.
- **R9 N3 and N4, evidence limits.** A gate that always answers NOT_ROUTED is caught only by the implementer's witness. Routing leg 27 accepts a gate call whose answer is ignored.
- **R9 N5, ledger limit.** The ledger captures 64 stack frames, and a foreign scheduler that exists before `ledger.open()` escapes it. No production instance is known.
- **R9 N6.** A write in flight at the mark that succeeds still emits its local UPSERT event after the mark. The success is honest, and the listeners belong to other owners.
- **Round 7 N-a.** Every propagation result carries the single-valued `status: 'delivered'`, which nothing reads. Delete it owner-wide.
- **Round 5 N-b.** A stopped propagate with no safe targets answers `success: false` with an empty failure list.
- **N3 restart.** A `start()` after `stop()` while a wave is in flight revives the pre-stop wave; see `finding-propagation-restart-revives-pre-stop-wave.md`. It is not reachable today.
- **Readiness.** The lapsed-member publication flap is pre-existing on both backends and amplified under rs-raft; see `finding-readiness-lapsed-member-and-planning-oscillation.md`. It needs its own quest, with one recovery-eligibility owner.

## Pending owner decisions carried over

- The RECOVERY_ELIGIBLE_ACK close lane (`finding-owner-close-lane-recovery-eligible-ack.md`).
- The owner retry loop drops an earlier OUTCOME_UNKNOWN (`retryable-control-plane-write.js:72-134`).
- Priority readiness reads the planning ids.
