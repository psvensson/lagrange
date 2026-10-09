# Adversarial delivery/issued-action review — 2026-10-09

Reviewed PR #109 head: `8ece20f70392314ceba49e4e787b800bc14d07d6`.
Latest runtime increment in that head: `d9e87b2961993121d75df11d3a177d380ad790df`.
This is author self-review requested by the user, not an independent approval,
Solver verification, activation decision or release certification. No runtime,
ordinary test, timeout, schema or gate is changed by this packet. It is kept on
a separate review branch to avoid moving the source under the existing review.

## Verdict

Keep the delivery-lifetime implementation. It puts the local validity check in
the existing native execution turn, including queued work, and retains the
separate durable obligation. I found no additional substantiated bypass of
that bounded lifetime predicate within the declared trusted-host model.
That is not an exhaustive safety proof or approval to merge/activate FreshMG.

The most important next work is **recovery of an issued action across native
fence changes**, together with its exact committed outcome. A receipt-only
happy path would leave the uncommitted/unknown branch incomplete. Do not add
another metadata reread, weaken native fencing, or make a transient delivery
context the durable authorization owner.

## Basis and limits

Read the exact source, contract, existing integration/transport fixtures,
repository authorization and observation policies, native transition policy,
committed-membership read/application path, and retained delivery evidence.
Also read independent review 5465944366 on this same head. It is COMMENTED /
Needs a closer look, not approval, and retains the global-currentness and
duration findings plus documentation findings.

The retained Actions archive `freshmg-delivery-lifetime-37886131059.zip` hashes
to `7bb8b35de03c538460bc077fe67e256ae3364867170f55a07d89109b27884e6b`.
All 163 manifest entries were independently rehashed in this review and matched.
This verifies the archive; it does not rerun its nine-file/294-reported-assertion
measurement. Source was reconstructed from the exact ca1cb138 source archive
and the retained change.patch. Key changed/policy blobs were checked against
current GitHub blob identities; 1846 unchanged src blobs matched the original
manifest. No source was edited for the diagnostic.

The new diagnostic ran locally with Node v22.16.0 and exit 0. It imports the
actual repository authorization, permit codecs and native transition policy.
Operation/boot observations and native status/proposal/drain callbacks are
EXPLICIT supplied inputs. The linker replaces only the control-plane gateway
wrapper. There is no SQLite transaction, real Raft core, live router, physical
restart or distributed test in this new diagnostic. It measures policy
outcomes, not a production deadlock, lease handoff or corruption. The environment
could not resolve the npm registry; no dependency update or substitute full
integration result is claimed. Original Actions/native evidence is separate.

## Finding A — high-priority recovery gap, not a demonstrated new regression

Locations:
- `replica-operation-message-group-membership-authorization.js`: initialLearnerPermitMatches,
  recordedLearnerIntent, initialLearnerRowEligible, authorizeMessageGroupLearner.
- `replica-operation-message-group-learner-observation.js`: snapshotReceiver,
  matchesInitialLearnerRequest, exactIssuedIntent, nativeTransition.
- `raft-rs-membership-transition-runtime.js`: transitionOwnerRefusal and transitionState.

The operation's initial in-flight permit encodes leader term, configuration,
recipient boot, runtime generation and replica lifetime. Exact replay preserves
that permit; a changed permit cannot be written through the initial authorizer
once the initial action is in flight, and the initial route requires sequence 1.
The native owner correctly rejects old term/runtime/configuration/lifetime.

The diagnostic's already-issued row produced:

| Control | Actual policy outcome |
| --- | --- |
| Replay the identical encoded permit | recorded |
| Change only leaderTerm from 7 to 8 | conflict; no mutation attempted |
| Change term and use permitSequence 2 | invalid; no mutation attempted |
| Execute original transition at the matching supplied native state | PROPOSED; one supplied proposal callback |
| Execute original transition at a newer native term | STALE_LEADERSHIP; zero proposal callbacks |
| Execute it at a newer runtime generation | STALE_RUNTIME; zero proposal callbacks |
| Dead or throwing delivery predicate | retryable STALE_DELIVERY; zero proposal callbacks |

These individually correct refusals expose a missing continuation: after an
issued action loses its native execution context before its outcome is known,
reopening a socket is not sufficient. The current exact-redelivery test keeps
the native term/runtime/replica fences unchanged. Its successful replay must
not be cited as leader-change or native-reconstruction recovery.

Before activation, the existing operation/native owners must distinguish:
1. Exact original action committed: recover that result, rather than propose it again.
2. It may still commit / authoritative outcome unavailable: retain the obligation.
3. Prior execution is definitively fenced and the action did not commit:
   an explicitly authorized successor attempt, or a defined terminal recovery
   outcome, must exist. No new permission comes from timeout or bare absence.

Recommendation: specify immutable logical action identity separately from a
fenced execution attempt, using existing operation/permit/native owners.
Preserve the original issued bytes as historical identity; never silently
refresh them from current status. Any successor attempt must be durably ordered
against the prior attempt and delayed messages. Whether and how that fits the
sealed contract is an owner decision; this review does not amend acceptance.
J1 forward recovery after promotion authorization remains binding.

## Finding B — action validity versus observation is still unresolved

`delivery.isCurrent()` establishes current local router/socket lifetime. It
cannot establish simultaneous nodes-table and operation-row currentness across
independent awaits, nor does it re-evaluate an operation holder at each native
execution instant. The native command carries a captured lifetime predicate,
not the full repository lease or a distributed cancellation transaction.

The already-recorded metadata-only boot counterexample therefore remains open.
No additional one-sided reread closes that class of question. The protocol must
state which changes prevent NEW action issuance, which reject an old delivery,
and which durably fence an already-issued action. Holder loss, ordinary failure,
receipt loss and action revocation must not be treated as synonyms.

Add a real-owner witness where a request waits in the native queue while its
holder expires or is replaced WITHOUT closing the socket. The expected result
must follow the declared issued-action rule, not an arbitrary new assertion
that every expired lease cancels previously authorized work. If cancellation
is required, prove the ordering that prevents a delayed action from crossing it.

## Finding C — exact committed proof and its recoverability precede CREATE

The generic native role answer is not an action receipt. In the diagnostic,
the same learner role produced byte-equal ALREADY_LEARNER answers for two
different operation identifiers. This is correct for a role/no-op answer but
insufficient for operation completion. Likewise a PROPOSED reply reports a
proposal anchor; it is not by itself proof of committed application.

`answerCommittedMembership` exposes configuration, applied/commit indices,
generation, term and peer identities, not the original action tuple. The
existing integration assertion reads and decodes the durable log directly to
check operation/transition/permit/target context. That is a useful oracle, not
yet a production receipt path. Committed context currently installs permanent
peer identity through the application transaction. The receipt design must
explain its restart/checkpoint/log-pruning representation before relying on it.

The next slice should bind group, operation, transition, attempt/permit sequence,
stage and permanent target identity to the actual committed entry and applied
configuration boundary. Use the existing native/application/durable-state and
repository owners; justify any retained data by the crash/compaction witness,
not a generic receipt service or another workflow ledger.

A historical successful ADD receipt also does not establish that the peer is
STILL a learner. Current join/CREATE eligibility must independently satisfy the
existing current descriptor, exact physical-generation and CREATE-CAS rules.
A later removal or superseding configuration must not resurrect old CREATE.

## Finding D — supported checks and remaining test boundaries

The lifetime checks occur before observation, before reservation and in native
execution. Socket identity, adopted record, known boot and local lifetime are
not sourced from payload JSON. The callable remains host-local rather than
replicated. The current mutation checks meaningfully exercise queued execution,
socket matching and local restart-token invalidation. Preserve these checks.

The generic native API still permits already-privileged callers to omit the
new host predicate. The contract explicitly allows that. This is not a new
wire bypass demonstrated by this review, but future MessageGroupServiceHandler
registration must not expose that generic route or drop the second argument.

The transport fixture dispatches a probe to capture a real context, then the
integration invokes the learner consumer explicitly. This proves context
composition, not the future registered membership envelope/receipt handler.
The full route test must join socket identification, payload validation, issued
intent, native effect, exact result, and durable phase update in one path.

Useful missing controls before route activation include distinct sender and
recipient with independent boots, same-socket holder turnover, valid queued
execution without invalidation, disconnect after proposal with lost response,
actual native reconstruction, and old-request refusal after successor progress.
Do not count a queued test's cancellation or setup timeout as its negative proof.

## Finding E — timing and review hygiene remain separate

The retained WAL/FULL correction improves the measured restart file but still
leaves 16 cases at 3494 ms against 2000 ms; a neighbor also exceeds its budget.
The shared helper has more consumers than the bounded run. No timing/full-cone
success or complete merge readiness follows from the nine-file component result.

WAL/FULL is the helper's DEFAULT when no explicit database wrapper is supplied,
not an invariant of every specialized fixture. The prior written review already
states this limit; improve local wording rather than deleting intentional fault
injection. Keep all matrix cells, independent observations and durable settings.

The older attribution/digest errors have an additive correction. Preserve raw
history, but mark the original prose clearly superseded or reply directly to
its review threads; do not let reviewers repeatedly use it as current truth.
The public PR head and historical measured head remain different identities.

## Recommended next work, in order

1. One bounded contract/witness for issued learner recovery after native term,
   runtime or recipient replacement. Decide the missing outcome/reissue ordering
   before adding more fields or another retry loop.
2. Implement exact committed-action observation and crash/checkpoint recovery
   in existing owners. Pair it with conditional repository recording, preserving
   terminal membership debt and exact replay.
3. Wire the registered membership recipient and existing driver through that
   result, then the existing CREATE descriptor/admission CAS. Keep planner and
   handler parks until the complete eligible path is enforceable.
4. Run complete shared-helper/transport/native/repository impact tests with
   unchanged budgets; finish timing remediation as a separate bounded track.
5. Freeze the integrated product and run the existing physical two-replacement,
   restart and distinct-off-seed/seed-storage-loss proof through Actions/GCP or
   the locked local lab. The original 941-file lab result remains FAIL.

No new epic, generalized scheduler, receipt coordinator, external database,
independent authority, or relaxed gate is recommended. No source approval is
issued by this author review. The independent review requirement, final-main
proof and A1-v13 compatibility gate are unchanged.

## Reproduce the policy-only diagnostic

From this directory, with a checkout of the reviewed source:

```sh
node --no-warnings --loader ./gateway-only-loader.mjs \
  ./issued-action-recovery-probe.mjs /path/to/reviewed/source
```

Check `git rev-parse HEAD` (or exact source blob identities) before applying the
result to another tree. `policy-results.json` preserves this run, including
SHA256 values for the imported policy modules. This script is an adversarial
review diagnostic, not the Quest's doneWhen probe or a full integration test.
