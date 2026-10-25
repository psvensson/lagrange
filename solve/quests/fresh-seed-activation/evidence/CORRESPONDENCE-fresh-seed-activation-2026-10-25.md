---
audience: development
documentClass: evidence
---

# Fresh-seed activation correspondence amendments for independent review

Base `af8a0381be10bebbb3daf78bd331f7aa3fcacbbf`. The seal, design, original
red, and prior logs remain intact. This document records discrepancies found
after enabling the live issuer. It proposes explicit oracle correspondence;
it is not independent approval or receipt acceptance.

## R1: actual native election activation

The sealed test assumed every RF3 group enters the explicit native `campaign`
primitive. In this runtime `startElection()` starts scheduling, and native
`tick` causes the election. The first candidate served the public write/read
while R1 had an empty explicit-campaign set. A JavaScript start counter would
not prove native activation.

The proposed witness uses the existing actual native-entry observer plus a
passive observer of the existing native status projection. For every exact
declared group it requires native `create_node`, then native `tick` or
`campaign`, then a native leader observation with the exact declared replica,
lifecycle incarnation and positive term, all before startup returns. It also
rejects undeclared activation. The per-replica owner negative engages an
undeclared identity, a declared unadmitted opening, an admitted unconsumed
opening and a different attempt. No native call, election timeout, budget or
scheduling policy is changed for this witness.

Root requested this explicit amendment and independent xhigh acceptance of
equivalent or stronger discrimination before any receipt is accepted.

## R5: retain the membership owner's actual typed hold

The successful first start leaves retained data. On the next real process
start, the existing membership owner returns `blocked_startup` with
`seed_recovery_proof_missing` before allocation preparation or native entry.
`resolveStartupJoinDecision` formerly replaced that exact owner result with
a generic `Error`, losing its type. A focused regression first measured that
loss, then the adapter was changed to attach the original frozen membership
outcome, with its own outcome type and reason as the error code and reason.
The membership algorithm, proof requirement and decision are unchanged.

The sealed Quest requires an owner-named typed hold; the design's narrower
`ORIGINAL_ALLOCATION_HOLD` assumption did not describe this earlier owner.
R5 now accepts the exact membership owner, boundary, outcome and reason in
addition to the existing original-allocation hold. It still requires zero
native entries, no public acceptance, and identical durable rights before and
after restart. It does not route past membership, relabel its refusal or claim
retained recovery service. Root requested independent review of this oracle
correspondence before acceptance.

## R3: separate TCP observation from public WebSocket ingress

Local diagnostic attempt 3 recorded one TCP connect on transport port 56154
while both right samples were false. Its TCP tuple was not captured, so that
specific observation remains unresolved and is preserved. An independent
bounded reproduction with no listener established Linux loopback self-connect
using the same local and remote address and port. This establishes a plausible
probe failure mechanism, not the cause of the historical sample.

The probe now retains every accepted TCP tuple and both rights samples. Only
a demonstrated identical local/remote tuple is labeled self-connected; a
distinct accepted endpoint still counts as listener admission and fails before
transfer. A real WebSocket handshake separately probes the intended public
transport and is required after startup. `/readyz` is also required after
startup, and the engaged readiness-owner negative supplies a ready observation
while rights remain UNUSED and requires the actual API owner to return 503.
The sealed pretransfer admission condition is retained, with the raw TCP
observation available for independent assessment.

## Registration component correspondence

Original SERVICES births now consume declaration identities. The old seed
phase component expected a second whole-phase invocation to mint another birth
and be refused by ordinary row creation. That behavior cannot remain the
original-publication retry contract: after submission it must retain the first
identity and never issue another INSERT. The migrated component retains the
STOPPED-before-activation and deferred-activation assertions and requires the
same exact original birth on repetition. Ordinary row-owner birth policy and
its own conflict witnesses remain separate and unchanged.

The lost-answer negative substitutes the SQL effect/answer seam while using
the actual original opening, row owner, publication operation and durable
SQLite rights. It proves uncertainty custody and single submission, not native
replication of its injected SQL effect. The positive child proves normal
replicated publication and actual public write/read. These evidence ceilings
are intentional and must not be combined into a broader recovery claim.

## Public listener configuration and same-live handoff lifetime

Attempt 6 captured the child's actual listeners: REST `0.0.0.0:53552`,
admin `127.0.0.1:53553`, transport `[::1]:53554`, all owned by PID 2695520.
The witness advertised and probed `127.0.0.1`. Bounded probe outcomes showed
1309 WebSocket `ECONNREFUSED` results and two REST 200 results. Production's
default transport bind is `localhost`; the child had not supplied `wsHost`.
The child now explicitly supplies the supported `transport.wsHost` equal to
its advertised/probed HOST. Attempt 7 passed all eight public/negative tests.
Later runs record actual listener addresses as well as probe outcomes.

The related shared `initializeTestEnvironment` already pins IPv4, and the
distributed Cluster lifecycle builder binds `0.0.0.0`. The retained public
child advertises `localhost`, matching its default bind. The public binding
and process-custody helpers do not supply the contrary IPv4 advertisement.
Separately, production `resolveRuntimeAddresses` can derive an advertised
IPv4 WebSocket endpoint from explicit `node.address` while MessageRouter's
unspecified bind falls back to `localhost`. This address-owner defect
candidate was reported to integration; the fixture correction does not claim
to repair that source policy. No unrelated builder or transport source was
changed.

Source review found that re-reading every active founder on every `/readyz`
probe would restore startup debt after ordinary founder retirement. Root
approved preparation retaining its own completed-handoff fact only after the
first exact durable all-rights read. It remains scoped to LIVE_ISSUER and
current directory custody on every use. A paired storage/native-owner witness
requires refusal before transfer, completion only after all durable transfers,
continued original admission after actual founder retirement/handle close,
and refusal in a new preparation, after custody loss and after close. The
public child separately proves the publication/readback effects; no new
durable ledger or cold-recovery authority is introduced.

## Independent retry finding and removal of the legacy API option

The independent source reviewer reproduced F1 against source manifest
`4498b4a248faab8e842c78a274e4afa87e47afb26ce048d1e267301e972561c1`:
after one durable insert with a lost answer, changing the native role from
follower to leader caused the row owner to rebuild a different `raft_role`.
Full value comparison refused before reading the exact original committed row.
Safety held (SUBMITTED, one insert) but same-live finite-failure resolution
did not. The revised publication validates the immutable declaration identity
on every SERVICES invocation and returns the retained first row, regardless
of a changed mutable role observation. Both row owners use that returned row.
Cluster identity still requires the full exact value. The N5 witness now
changes role before resolving the lost answer; wrong node identity still
refuses. The phase component also checks message-group role changes.

The operator reiterated one implementation per behavior and no legacy path.
BootstrapAPI's old whole-service constructor fallback and adapter-derived
runtime-owner fallback were removed. An AST caller census migrated every
direct constructor property in source, tests and the request-binding example
to the existing named startup adapter/runtime owner and the explicit seed
admission operation. Phase-only component stubs use only their narrow adapter;
actual seed callers bind the real original-admission operation. Joining callers
have no original allocation and retain their existing readiness owners.
No missing-method fallback was added. The old two-assertion characterization
that merely constructed and inspected its own legacy option literals was
deleted; the real N3 readiness refusal and child startup/public ingress tests
exercise the replacement contract.

## Approved fixture composition

The shared seed fixture dependency is taken byte-for-byte from independently
approved `69d125051628ee5630f7ac7d7ddf7c961f057136`. The approval is recorded in
`/tmp/session-worktree-oTBvrI/tree/review-seed-r7/REVIEW.md`; the local dependency
manifest is `test-output/fresh-seed-activation-20261025/approved-fixture-dependency.json`.
The dependency closure is the shared `cluster-test-helpers.js`, its sole former
`createVirginSeedDataDirectoryManager` caller (`formation-sim-production-seed-host.js`),
and that caller's five async formation test callers. The obsolete export is not
retained. The fresh negatives and registration component consume the shared
`createOwnedVirginSeedBootstrapService`, without duplicated custody or preparation
setup. The original opening helper only actuates the already owned attempt.

The F1 retry probe changes the role observation at the canonical row-owner seam;
its native opening, durable original rights and SQLite effect are real. It does
not claim to induce a native election in the lost-answer case. R1 separately
measures actual native election scheduling and native leadership. The independent
reviewer confirmed that this distinction directly discriminates the observed F1
defect without requiring a second election claim.

## Distinct probe source and separate listener failure

The composed run `fixture-composed.tap` passed R1, R2, R4, R5 and the three
engaged negatives; R3 failed. Its retained child log at
`/tmp/fresh-seed-activation-YchPPd/initial-child-output.log` records
`EADDRINUSE` on `127.0.0.1:49854`. The listener address was null, readiness
served 200, and public SQL write/read passed. A WebSocket probe recorded
`HPE_INVALID_CONSTANT`; this run did not capture its connected tuple.

The independent reviewer's bounded Linux reproduction retained at
`/tmp/session-worktree-oVsRrx/tree/test-output/independent-fresh-review/implicit-self-connect.json`
observed an implicitly assigned client source tuple identical to its destination,
an HTTP request echoed to that client, and a later listener bind refused with
`EADDRINUSE`. An explicit `localPort` reproduction permitted rebind instead;
these mechanisms are not interchangeable. The missing historical tuple means
the composed run's observer collision remains a strong matching inference,
not a proven reconstruction.

Every public probe now uses source address `127.0.0.2` while the runtime remains
advertised and bound on `127.0.0.1`. TCP, WebSocket and readiness connections
retain their actual tuples. The distinct-address witness passed all eight tests
with the existing bounds and retries disabled (`distinct-probe-source.tap`).

Separately, `startSeedNode` catches the actual listener owner's bind rejection
and continues startup. The listener owner itself waits for `listening` and
rejects its error. The integration owner explicitly routed the swallowed
rejection to a separate bounded startup-owner repair; changing the probe source
does not close that production defect or widen this sealed Quest.
