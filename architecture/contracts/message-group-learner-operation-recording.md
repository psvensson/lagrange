---
audience: development
documentClass: current
---

# Recovered learner result to operation recording

Bounded continuation of message-group-fresh-identity-membership, approved by
user continuation on 2026-10-09. Base 16bcff35bc44d2c6c6151cfb29d35fa7a4b4325a.
The existing repository authorization module owns this transition. The native
runtime owns committed origin and bootstrap observations. No new state store,
receipt service, coordinator, successor permission or CREATE activation.

## Transition

Trigger: an issued learner action requires reconciliation after commit, answer
loss, or operation-worker reconstruction. The original request is captured by
the existing issued-request decoder. The caller supplies a host-bound native
committed-membership read method separately, never a receipt from the request.
That host composition is trusted and must bind the same group for both purposes;
it is not a new wire API or authentication against arbitrary hostile host code.

Authoritative basis: exact operation/group/source/target/lifecycle identities,
issued permit, current encoded membership holder, phase, obligation and ordinary
terminal fields from the existing authoritative operation reader. The native
owner supplies the exact historical ADD tuple/index/term and a canonical
bootstrap stamp containing the current source voter and target learner. The
historical entry term must equal the original issued attempt term, but need not
equal the later observing leader's term. All original execution fences stay
unchanged; only permitState and the actual proposalIndex become committed.

The two native reads are not globally atomic with the operation row. They
record observed historical progress, not a current execution grant. A stamp
must be at or beyond the exact action's applied/generation boundary and must
carry matching permanent identities. Later role change cannot authorize CREATE
from this stored observation; existing current descriptor and CREATE owners
must still enforce their own boundaries.

Commit point: one conditional UPDATE of the existing operation row changes
only membership phase, committed permit and learner stamp. Reuse the existing
membershipRowWhere predicate, including current holder and terminal fields.
Ordinary status, workflow history, completion time, reservation, cleanup state
and the UNKNOWN membership obligation/lane remain unchanged. A concurrent
settlement or holder change defeats that basis. Failure after issue may record
its retained debt; successful settlement cannot newly admit learner work.

Lost write answers are resolved by exact authoritative readback. A failed or
unavailable read is UNKNOWN, not guessed cancellation or success. Exact replay
reads the already-recorded fact without rewriting the stamp or refreshing old
execution fences. Holder expiry is not destruction of a known historical fact;
RECORDED is not a live lease, dispatch or cleanup grant. No distributed clock
or nodes/operation atomicity claim is added.

## Witness and limits

Extend the existing actual-native/file-SQL consumer test, retaining all its
original cases. Cover exact recording/no-op replay, missing/wrong origin,
historical ADD after actual removal, holder turnover, ordinary terminal races,
write-answer loss and unavailable readback.

A separate operation worker uses a real SQLite connection and repository. Its
native read callback crosses test IPC to the parent's actual native ports.
Hold its SQL callback only after both native reads, verify the prewrite phase,
then actually SIGKILL that worker. A new process and a legitimately acquired
successor holder must record the original result with no new native proposal.
This is operation-worker process loss, not loss of every native node or physical
power failure. The native group survives in the parent. Operation SQL remains
file-backed fixture SQL rather than distributed control-plane SQL/CDC.

The explicit-context repository function avoids growing the already oversized
repository facade. It is not yet called by the production membership driver.
Next: registered driver consumption and current CREATE, retaining this owned
recording transition; ordered successor attempts still require affirmative
predecessor fencing/noncommitment. J1 and the original full-lab/timing/main gates
remain unchanged. No terminal Quest receipt or independent approval is issued.
