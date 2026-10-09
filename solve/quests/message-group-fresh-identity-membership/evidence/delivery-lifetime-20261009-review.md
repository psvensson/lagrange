# Issued learner: actual delivery lifetime - 2026-10-09

Status: bounded implementation measured and preserved, independent source
review outstanding. No Solver landing, main merge, FreshMG closure or release
certification. The original full lab FAIL and restart-duration finding remain.

Base: `ca1cb1384daee9592c88f7b47851043abdb7a5ae`.
Measured source/test/contract commit:
`d9e87b2961993121d75df11d3a177d380ad790df`.
Evidence-bearing pushed head:
`1e10a4ef75ac9262010c28083033b67148fedb75`.
Run: `37886131059`, hosted Ubuntu/Node22, existing one-worker cap.
This written review adds no runtime changes to those measured bytes.

## Scope and owner decisions

The next interaction specified by author R3 is now implemented for delivery
lifetime: the existing RouterConnectionAuthorityOwner captures local-only
identity/currentness from the actual adopted socket or local router. Inbound
and local service handlers receive it as a second argument, not a wire field.
The existing issued-learner consumer requires that context and passes its
captured predicate through the existing semantic operation into the native
membership turn. That turn checks it after queueing and immediately before
proposal. The existing native term/configuration/lifecycle/runtime/address
checks remain unchanged.

The scope extension into connection/inbound/local/shutdown owners and native
normalization/runtime is recorded as a decision in the existing Quest log and
as one coupled owner interaction in impact-contracts.json. Its contract is
architecture/contracts/message-group-learner-delivery-lifetime.md.

One private ephemeral router-lifetime marker rotates on shutdown. There is
no per-request registry, durable ledger, additional coordinator, new workflow
or retry loop. It prevents old local contexts from reviving if the same router
object is initialized again. Remote contexts also bind the original adopted
connection record, exact socket, connection identifier and known boot.

UNKNOWN peer boot remains compatible with ordinary transport but produces no
privileged context. Wire sourceNodeId and payload fields do not create or
replace that context. IDENTIFY still operates under the repository's existing
transport trust assumptions; this is not a new cryptographic authentication
claim or protection against malicious trusted-host JavaScript.

The generic, already-privileged native membership entrypoint retains its
existing callers. Its additional argument is host-only, not taken from the
request, and the learner consumer always requires it. No function is written
into replicated ConfChange context or snapshots.

## Distinctions deliberately preserved

- Refusing a stale delivery is NOT cancellation of the durably issued action.
  An exact fresh session/holder may reconcile and redeliver it through the
  existing repository; tests prove both stale refusal and valid redelivery.
- Ordinary terminal failure retaining an issued learner obligation still
  allows that exact action under a current context. Successful completion and
  conflicting/absent intent keep their existing refusals.
- Once native proposal has happened, later connection loss cannot undo it.
  Proposal, committed configuration, physical CREATE and cleanup permissions
  remain different facts.
- The R3 canonical-boot-row-only counterexample is NOT claimed resolved. A
  remote row change without observed local connection/native invalidation is
  not made globally atomic by this local predicate. Completing issued-action
  validity/revocation and the exact committed receipt remains mandatory.
- No MessageGroupServiceHandler membership route, full driver, planner/CREATE
  unpark, transfer, promotion or physical off-seed test is activated here.

## Actual proof, including failure engagement

The first run `37885664295` reproduced the absent-context boundary and passed
all five transport cases after the transport implementation. Three consumer
refusal cases changed as intended. Its queued-native test did NOT engage: a
normal proposal need not emit a Ready message immediately, and the pending
promise was cancelled when the event loop emptied. That was a test apparatus
failure, not a native queue result, and prevented publication.

The correction follows the existing operation-port-status-observation test:
drive only the leader's native clock, bounded to twelve ticks, until an actual
Ready send suspends. Assert that the send really entered and its operation is
pending before testing queue behavior. No source code, timer limit or election
configuration changed to achieve engagement. The first archive is retained
inside the final evidence, with its original SHA256.

The second run demonstrated these staged controls:
1. New transport witness with original source fails the expected missing
   owner-bound context assertions.
2. Transport change alone passes all five transport cases.
3. Adapted consumer with real transport context but old native source fails
   four specific cases: wire-copy authorization, shutdown/reinitialize,
   same-boot connection replacement and actual queued execution. No cancelled
   tests occur in that result. This staged red is not falsely labeled a run
   of the entirely unchanged product.
4. Complete source commit passes all nine selected files with unchanged
   budgets and all original consumer cases retained.

| Group | Reported assertions | Whole-file milliseconds |
| --- | ---: | --- |
| Learner consumer integration | 26 | 3011 (limit 30000) |
| Local delivery compatibility | 7 | 928 |
| Router transport cleanup | 16 | 1122 |
| Existing node-incarnation fences | 79 | 1151 |
| New delivery lifetime | 5 | 704 |
| Membership branch authorization | 90 | 1009 |
| Membership operation lane | 8 | 1058 |
| Workflow persistence | 24 | 1332 |
| Reservation restart | 39 | 1213 |

Every non-integration file above retains its 2000 ms limit. Total reported
assertions: 294. This is a focused nine-file result, not the complete change
cone, static suite or release gate.

Three mutations establish why the new assertions matter:
- Remove only the native execution-delivery check: the queued-native case
  alone fails its intended refusal assertion. Pre-observation or caller-only
  checks are not sufficient for that interleaving.
- Remove exact current socket/connection matching: the closure/replacement
  and newer-boot cases fail.
- Remove router-lifetime token equality: shutdown/reinitialize revives the
  old context, and that exact assertion fails.

All mutation source bytes were restored; no cancellation/time-budget failure
is counted as the expected mutation result.

## Static findings and integrity

New/changed tests and fixture pass strict cyclomatic/cognitive checks. Full
source-scope violation counts remain 8 cyclomatic and 2 cognitive; matching
path plus message proves these are the same existing violating functions,
not newly introduced functions replacing old debt. This is NOT a claim that
those nine source files are strict-debt-free. Scoped decision-boundary,
literal and runtime-grammar checks return zero, lint passes, and generated
primary/resource/subsystem/impact metadata and shard audits pass.

Actions artifact id: `11596387277`.
Downloaded Actions archive SHA256:
`7bb8b35de03c538460bc077fe67e256ae3364867170f55a07d89109b27884e6b`.
The archive and all 163 manifest entries were rehashed in this session and
matched. The original failed-attempt archive is nested and hash-bound.
Canonical Solver archive SHA256:
`42ee58f6a4c6b731708f3326be43379bfe4eaa22d5a3e494a70514cde40554d5`.
Canonical asset:
`message-group-fresh-identity-membership--delivery-lifetime-37886131059-1.zip`.
The canonical upload is recorded by the Solver; this note does not falsely
claim a separate download of that release asset.

Expected-old-head and final-remote-head checks passed around a normal,
non-force Actions Git push. Final measured status is empty. All earlier
salvage refs, PR #73, the separate 0.3 lane and main remain untouched. Hosted
component execution is not substituted for required Actions/GCP/lab physical
acceptance. No GCP/lab machine was reconfigured by this attempt.

## Immediate next implementation

The actual-delivery piece does not yet supply the complete action receipt.
Extend the existing native committed-observation/retained-state owner so the
caller can distinguish this exact operation/transition/permit/target's
committed learner addition from role-only ALREADY_LEARNER and PROPOSED.
Bind the result to the applied configuration/index and durable identity map,
including answer loss and native reconstruction. Then conditionally advance
the existing operation's learner stamp/phase without losing terminal debt or
allowing another holder to rewrite the original issued action.

Before choosing representation, audit log compaction/checkpoint recovery:
proof must survive the supported loss/restart path, not depend on a new
in-memory callback or an indefinitely retained diagnostic log. Reuse the
existing native/store/operation owners; no second receipt coordinator.

Only that exact committed evidence can feed the existing CREATE admission
owner. The full driver, holder/boot action-time semantics, snapshot catch-up,
shared-helper change cone, restart duration, inherited lab failures and final
multi-host/off-seed acceptance remain open. This author review records the
bounded result and requests independent review; it does not issue approval.
