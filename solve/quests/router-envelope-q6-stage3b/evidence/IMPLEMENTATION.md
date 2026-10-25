# Q6 stage 3b candidate: implementation and review handoff

Status: WIP preservation for independent review and committed-source lab proof.
This is not Quest landing, retained-seed acceptance, publication or release proof.

The approved authority is owner-review decision 6 and retained-seed-original-handoff
log entry 147 (D1-D5). Entry 178 approves stages 1-2 only. The separate Quest keeps
that broad retained-handoff seal unchanged. No subsequent D4 reversal was found.

## Custody and source provenance

Original interrupted worktree: `/mnt/data/peter/projects/.worktrees/router-envelope-q6-stage3b-20261028`,
HEAD `f0060ff36ee16b8eee479ef927d81978b8daabb1`, 352 tracked changes and five
untracked tests. It was not reset, cleaned, stashed, committed or otherwise edited.
The binary patch, untracked bytes and full byte/mode manifest were captured under
`/tmp/codex-rs-raft-20261025/q6-preservation` and rechecked for stability.

- `tracked.patch` SHA256: `985e391e92122b8622552edac1d77584194904b8c9a20c79dfdad4f52332f277`.
- `manifest.json` SHA256: `51a78cf2f4207eb88fdeaf0062da96427a1a5730e868876403e3702598154980`.
- Reconstruction at `work/codex-router-envelope-q6-20261025` matched every captured
  tracked/untracked byte and mode and the exact binary patch before edits.

All original candidate changes are part of this atomic migration. Subsequent
repairs below are in the isolated reconstruction. The final commit SHA is the
source identity for review/lab; this document cannot self-reference that SHA.
External logs remain in the preservation directory; no acceptance receipt is green.

## Systematic history and comparable-system research

`7bf6ceecb` preserved owner-supplied delivery metadata and made classification a
fixed point. `013979c41` repaired ACK overwrite/lost-answer/handler-throw behavior
while retaining the flat shape. `abcafb95a` named supersession and removed the
inline-ACK heuristic. Those repairs are retained. The remaining shape allowed
handler-controlled transport fields to masquerade as transport state; moving the
ACK assignment alone could not fix the whole namespace.

The stage1-2 independent review's F-V1 through F-V5 identify normalization throws,
dead applicationAcknowledged, owner tests, dead coalesced/deliverySource fields,
and redundant ACK wrappers. The handler-identity followup identifies retired
partition Raft drops, address-only singleton removal and inconsistent fail-closed
MG retirement. The candidate also exposed callback custody loss on refused
retirement, wrong-router calls and registration replacement; the same policy now
covers these transitions across MG, Runtime and Replica handlers.

Primary-source inspiration, not a replacement for project authority:
[RabbitMQ confirms](https://www.rabbitmq.com/docs/confirms) separates publisher
confirmation from consumer acknowledgement and states their scopes are orthogonal.
That reinforces explicit per-hop ownership rather than transitive success.
[gRPC status codes](https://grpc.io/docs/guides/status-codes/) describes deadline
expiry even when a state-changing operation completed. That reinforces preserving
unknown-write debt when the reply is lost instead of treating transport failure as
proof the write did not happen.

## Final interaction

`transport-semantic-outcome.js` owns the closed transport key set and one frozen
`{transport, answer}` envelope. Module-private brands admit genuine owner outcomes
and envelopes; unowned objects, clones, primitives and unreadable proxies fail
closed through `deliveryTransportOf`/`deliveryAnswerOf` without evaluating fields.
The builder is idempotent on its own outcome/envelope. The router stamps message
and correlation identity. Public `acknowledged` is removed; raw ACK remains only
an internal producer input. No compatibility path or public ACK alias exists.

Transport is this hop's classification. A delivered domain refusal stays a domain
refusal in `answer`; a handler throw is failed/handler_failed on both routes.
Supersession is delivered, no answer, named superseded. Forwarders return the
onward answer or a typed answer-level refusal; they cannot adopt onward transport
as their own. Transport classification never inspects handler answer fields.

The LOCAL answer is kept verbatim, including reference identity and unreadable
properties. It is never shallow-copied or JSON-normalized by the router. The
remote wire carries `result = answer` through the existing JSON owner: JSON value
semantics differ from local references, and serialization failures remain at that
wire-owner boundary. W-ENV-8 proves local unreadable-property identity and remote
serialization refusal. It does not claim full local/JSON value equivalence.

`recoverableBeforeSend` is retained as a closed boolean transport fact because
START and query admission distinguish it. QueryExecutor now observes a resolved
connection_closed/message_timeout transport outcome just as it observes a rejected
post-submission delivery. Both primary and redirected paths retain the original
entry identity and unresolved-write debt. Proven pre-send refusal creates no new
debt; an already unresolved write remains unresolved. No retry policy or identity
minting is added.

All production delivery readers use owner accessors. The remaining direct `.answer`
reads belong to service-dispatch/native-forwarding/participant-release owner
records or router-internal construction; remaining `.transport` reads name actual
transport services or the owner accessor itself. Test seams construct genuine
owner envelopes. The impact registry couples router changes to query, CDC,
partition, control-plane, rebalancer, service/bootstrap and Raft observations.

Exact callback retirement preserves a successor's callback. Refused retirement
retains custody for retry, wrong-router calls leave custody intact, and replacement
first retires the prior registration. Partition dispatch refuses retired handlers
instead of acknowledging a dropped Raft message. Node service retirement uses the
same fail-closed exact-identity owner as replica retirement.

Static repairs within touched scope preserve behavior: CDC's repeated reply
metadata uses one passive constructor; dispatch legacy-removal observation is
separated from its existing authority classifier; repeated migrated test router
and cleanup fixtures are consolidated. No ratchet baseline was raised.

## Composition with SQL admission

The intersection with `8fee98abe` is
`src/query/query-executor-partition-request-builders.js`. Q6 replaces the old flat
success predicate/import with delivered transport plus answer.success. SQL
admission adds statement policy/request fields elsewhere in that file. Compose
both: preserve SQL admission fields and Q6 envelope predicate. The admin edits are
in different files. No SQL branch was taken into this candidate. Parent integration
owns composed-source proof and delta review; this isolated SHA cannot certify it.

## Evidence and remaining gates

The captured candidate initially passed 10 files / 190 assertions; that was only
candidate evidence and contradicted D4. The added no-public-ACK witness failed
before the repair. The resolved-lost-answer witness failed before its repair.

Latest focused union: 28 files, 728 assertions, 27 passing files. The only failing
file is replica-dispatch-node-state-update-remote-direct-wakeup: two expectations
omit target_claim_key and membership_publication_epoch null fields. Exact base
f0060ff36 reproduces the same two leaves. Focused identity custody and query loss
checks separately pass 76 assertions. The two consolidated stopping-reconcile
fixtures pass 76 assertions. The CDC non-leader file initially exposed one stale
removed-ACK expectation; it now asserts the domain status. Its remaining 21 failed
leaves reproduce at exact base f0060ff36 (87 runner assertions on both).

Scoped old-JS cyclomatic counts are 113 candidate / 113 baseline; cognitive counts
18 / 18. Scoped literals have zero new violations. Touched decision-boundary
violations were reduced to zero. ESLint, file-size, unused-export ratchet, cycles,
metadata-gateway and runtime grammar checks were run; final normal hooks and fresh
metadata will rebind them to the committed bytes. Full duplication passes: source 44 groups / 1383 lines, test 655 groups /
24631 lines; the test baseline was tightened to the measured counts. All seven
new JavaScript files pass strict complexity and cognitive checks. Consolidated
transaction fixtures pass 58 assertions. Whole-corpus complexity is red on both
candidate and exact base at 1766 violations against 1755; no new count is added.
The first normal hook attempt correctly rejected two import-formatting errors;
those were fixed and the normal hook was retried. Original 9122-path snapshot
recheck still has zero byte/mode differences. Broad lab proof and independent
source review are still required. No source landing or green acceptance is claimed.


## Pre-send producer trace before the lab freeze

The first normal-hook preservation commit is
`cf9e88ee75c91d1217b947e991a94652ce57343d`; it is not the final lab candidate.
A final producer trace found the query witness's true before-send input could
hide an omission: reconnect/deferred constructors dropped the real send owner's
recoverableBeforeSend flag. The new router-envelope-pre-send-failure test uses
an actual MessageRouter delivery with a controlled closed-socket connection;
sendWithAck itself refuses before ws.send, then real recovery and envelope
construction run. Its pre-send assertion failed on cf9e88ee while ACK/response
custody assertions passed. Deferred constructors now carry the existing flag;
reconnect-pending owners mark their unsent request explicitly. No inferred
pre-send proof is added to ambiguous post-send failures. The full-field rewrite
matrix now also attacks recoverableBeforeSend. The final source requires its own
normal-hook followup commit and committed-source lab/review identity.

Pre-send focused proof: four files / 80 assertions pass, including the real-router
refusal, query loss/pre-send matrix, canonical query-transport failure shape and
cold-reconnect grant. The new test is included in the router impact contract.
