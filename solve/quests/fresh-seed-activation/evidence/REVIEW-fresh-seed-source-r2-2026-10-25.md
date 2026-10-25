# Independent fresh-seed review r2: APPROVE bounded source snapshot

Reviewer: subagent:/root/fresh_seed_review. Date: 2026-10-25.

APPROVE the bounded fresh-seed activation implementation and witness changes at the exact snapshot below. R1 findings F1 and F2 are closed. No required correction remains in this bounded source review. This is not a canonical Quest receipt, landing, publication, retained-recovery, multi-host or release acceptance claim. A clean commit must match the reviewed bytes before this approval is attributed to its SHA.

## Exact candidate and review custody

- Base: af8a0381be10bebbb3daf78bd331f7aa3fcacbbf.
- Isolated reviewer worktree: /tmp/session-worktree-2zCjJL/tree, created with scripts/session-worktree.js during the author's explicit stable boundary.
- Complete 68-path manifest: complete-review-r2.json, SHA256 383691901d6f1852a7041ce777185168a7659c7ba942204889e429950e1b4414.
- Source/document/example/audit/writer 20-path manifest: source-review-r2.json, SHA256 e873dcee094442ed8cc9a1b5fa90eb7b209f83d4298a35771cab4040622c9dda.
- Shared-harness prerequisite: 69d125051628ee5630f7ac7d7ddf7c961f057136. Every one of the seven copied prerequisite paths was independently hashed against git show at that exact commit. Its approving independent review is /tmp/session-worktree-oTBvrI/tree/review-seed-r7/REVIEW.md. This review consumes that bounded prerequisite approval; it does not claim to rerun its whole fixture/scaler proof.
- No author files, seal, receipt, commit or remote state were changed by the reviewer.

The complete r1 category checklist remains at /tmp/session-worktree-oVsRrx/tree/test-output/independent-fresh-review/REVIEW-r1.md (SHA256 dfcd956be3b1e0f6d4a63a9d39fa941b37c30a174bdf99d492ce0bd487602b4f). This report appends the final delta judgments instead of rewriting r1's rejection or evidence.

## F1 closed: retry observes and returns the first publication

RaftRsOriginalAllocationPreparation.publishOriginalRight now validates SERVICES declaration identity on every invocation, then retains the first complete immutable publication value. A new native-role observation cannot replace it. The one submit callback receives that retained value; exact readback observes it; both successful transfer and a repeated already-transferred call return it. The cluster-identity right keeps full-value equality. Wrong service/node/group/address/birth/token still refuses through assertServiceIdentity before callbacks or mutation.

Both canonical row owners consume that result: PartitionServiceRowOwner.registerReplica seals registration evidence from the returned original row; MessageGroupServiceRowOwner.registerReplica returns that original row. Neither rebuilds a new role observation into returned evidence after transfer. The original adapter no longer duplicates the identity decision; preparation owns the check once at the publication boundary.

The original independent r1 diagnostic was rerun with the same explicit follower-to-leader role observation change after a lost INSERT answer and unavailable/absent/contrary reads. It now passes, returns the first follower row, transfers only after exact readback, and still submits once. An added contrary caller create_attempt_token after transfer is refused before either callback. Retained diagnostic source is independent-fresh-retry.test.js in this evidence directory; verifier-probe-custody.json preserves its hash and original execution path.

Evidence ceiling: this probe mocks only the role observation and SQL effect/answer seam. It uses the actual declaration, admitted/consumed native opening, row owner, preparation operation and durable SQLite rights. It does not itself cause a native election or prove replicated application of the injected SQL. The separate actual-child R1/R2 public witness proves native activation and normal replicated publication. That is sufficient to close the demonstrated role-observation bug without claiming a broader failure-domain experiment.

## F2 closed: one shared owned setup and explicit BootstrapAPI inputs

Both fresh-seed integration negativeSeed and seed-registration registrationFixture now use createOwnedVirginSeedBootstrapService. Preparation remains explicit in the caller, so N1 still exercises the unprepared owner rather than silently acquiring an allocation. openOriginalSeedReplica remains an actuator through catalog/phase/native entry and supplies no authority. The actual helper implementation exactly matches the independently approved prerequisite, including pre-await authority capture and custody through failed cleanup.

BootstrapAPI no longer accepts bootstrapService as an alternative startup adapter, derives runtimeOwner from an adapter, or counts the legacy input as lifecycle ownership. Its three distinct dependencies are supplied explicitly: bootstrapStartupAdapter, runtimeOwner, and the named assertOriginalSeedPublicAdmission operation. Seed runtime composition and the example bind the latter to their actual BootstrapService; joining composition supplies no original-allocation operation. Phase-only component tests supply the narrow observation adapter rather than a fake seed authority. A malformed non-null configured admission callable is not treated as permission: invocation fails; only an absent operation denotes the separate join composition.

Independent AST census of src/test/examples found 203 direct BootstrapAPI constructions, all with literal option objects, zero bootstrapService option keys, and 35 explicit seed-admission bindings (api-caller-census.json). The inspected migrations move callers to the same adapter/runtime/admission contracts; no compatibility fallback or second row-construction/rights decision was added. The old characterization that only constructed local legacy option bags was deleted because that input was intentionally removed; actual runtime/public and readiness tests measure the replacement.

The obsolete bootstrapOrExit entry remains a separately authorized bounded removal under the integration owner. It was not silently absorbed into this sealed fresh-seed unit. Its future removal and the separately authorized startup listener-failure repair are not covered by this source snapshot approval.

## Newly observed transport red and narrow probe correction

The first fixture-composed public run had 7/8 passing tests: readyz and public CREATE/INSERT/SELECT succeeded, but the WebSocket listener was null and handshake failed. The exact child log records listen EADDRINUSE on 127.0.0.1:49854; the client records HPE_INVALID_CONSTANT. Copies and hashes are preserved under the r1 review tree in transport-red-custody.json, author-fixture-composed-red.tap, and author-fixture-composed-child-red.log. This was not relabeled as the earlier IPv6 localhost binding failure.

Independent bounded Linux diagnostics establish a matching mechanism: a client with a kernel-selected ephemeral source port can connect to itself at the still-closed target tuple. The reproduced identical tuple prevented a subsequent real SO_REUSEADDR listener bind with errno98 and echoed an HTTP GET back to the client (implicit-self-connect.json, 23992 refused attempts in 0.17s). A separate real WebSocket self-connection emits HPE_INVALID_CONSTANT. Explicit localPort variants reproduced the parse error but allowed binding; that non-equivalence is preserved, not hidden. The historical failing run lacks the responsible socket tuple, so attribution of that exact sample remains an inference.

The witness now binds only its probe clients to 127.0.0.2 and keeps the runtime bound/advertised host at the requested 127.0.0.1. Distinct source/destination addresses eliminate the self-tuple condition without changing runtime authority, deployment settings, service assertions, deadlines or acceptance. TCP, WebSocket and HTTP probes use this same source; WebSocket endpoint tuples are now retained too. A distinct-address/same-numeric-port diagnostic was independently checked on this Linux host: connection refuses before listening and the intended target binds successfully. The corrected full public witness passes in this snapshot. The evidence remains single-host Linux loopback evidence.

The production startup path's warning-only handling of a real listener failure is a separately named defect under the root's authorized follow-up. This review does not approve that behavior or claim its repair. The fresh positive witness continues to require a real listener and handshake, so it cannot silently count that failed startup as successful public ingress.

## Independent r2 executions

Command: npm run -s test:file -- test/bootstrap/independent-fresh-retry.test.js test/bootstrap/fresh-seed-activation.integration.test.js test/bootstrap/seed-registration-phase.test.js test/bootstrap/seed-original-attempt-lifetime.test.js test/bootstrap/bootstrap-api-readiness-gating.test.js

Raw: affected-probes.tap. Five files, 213 assertions, all passed:

| Surface | Assertions | File elapsed |
| --- | ---: | ---: |
| Original independent F1 retry diagnostic plus contrary token | 1 node:test case | 4073ms |
| Actual fresh/cold public witness, including N3 and corrected N5 | 8 | 79777ms |
| BootstrapAPI readiness component gates | 119 | 4858ms |
| Canonical seed registration and shared fixture | 61 | 20115ms |
| Original-attempt lifetime, including submit/observe-await abort | 24 | 102669ms |

These are runner file times under the recorded local host load, not per-case performance claims or canonical lab results. The live abort negatives prove a late submit/read answer cannot move the revoked attempt from SUBMITTED to TRANSFERRED; public admission also remains CLOSED.

Clean impact-contract audit passes: 73 contracts, 45 coupled pairs, digest e698a7f2952edeb468468aa2c950617d73168689ed350cc25dacad66c8e69493 (impact-contracts-clean.log). The first invocation failed because the reviewer-created temporary probe was unclassified and poisoned whole-tree primary discovery. That verifier contamination is preserved in impact-contracts.log. The already-executed probe was retained outside product discovery, with custody/hash recorded, and the unchanged candidate audit passed. No product test was removed or skipped and no acceptance selector was weakened.

## Seven-template delta closure and reused evidence

source-delta.json binds the comparison: 11 r1 source paths are byte-identical; seven changed and two were added to the source manifest. Every changed source and affected caller was inspected. The complete r1 checklist is reused only as follows:

- Admission/gating items1-8: the actual preparation decision, per-replica election gates, listener/admission consumers and success gate remain unchanged. API composition now supplies the same operation explicitly. Actual N3 still supplies a ready observation while UNUSED rights force 503; public witness8 passes. Readiness-gating119 is remeasured. The private monotonic handoff fact and its live custody guard are unchanged.
- Retry-loops items1-8: F1 is closed by retaining/returning the first row, without new loops, resets, retries, budget or second submission. The independent formerly-red role-observation probe passes. Wrong token/node remain typed refusal. N5 continues to prove absent/unavailable/contrary reads retain SUBMITTED and exact read resolves it.
- Recovery/replay items1-6: no cold recovery permission, replacement state, replay write or second durable authority was added. LIVE_ISSUER/COLD_RECOVERY/null discrimination and exact lifecycle reads are unchanged. R5 remeasures the actual earlier membership-owner typed hold with unchanged rights. Cold/opening r1 tests and their source paths are byte-identical; the changed publication function does not execute on those refused paths.
- Concurrency/serialization items1-6: same per-right pending promise, lifecycle CAS and one-submission sequence remain. The only publication semantic delta is retained value handling. New submit-await and observe-await revocation negatives pass in lifetime24; no late transfer. The map remains bounded by declared rights.
- Formation-circularity items1-5: local original rights still authorize only internal activation; public readiness does not gate original publication. Existing owner-local authoritative read remains the sole transfer observation. F1 no longer creates a permanent veto from a newer role observation. Public CREATE/INSERT/SELECT and real WS/HTTP ingress pass after all rights transfer; no circularity bypass or extra ledger.
- Harness-fidelity items1-8: shared fixture dependency is exact and both callers migrated. The formerly-red independent source-bound test is green at the same owner seam. R1's restored-unconditional-hold control remains applicable because that continuation decision and election wiring are byte-identical, and no fresh receipt selector or required assertion changed. The new probe-source correction preserves the intended public target and admission assertions; historical red and the mechanism/evidence ceilings remain explicit.
- Owner-interaction items1-10: preparation owns immutable identity/right/retained-value decisions; row owners own canonical construction and consume the returned original value. The adapter no longer duplicates identity judgment. API has one representation per dependency, with a complete direct-call census and no old fallback. Runtime contract text records both retained first value and same-live monotonic handoff. Impact contract includes runtime-startup composition and its registry audit passes. No source-only contract change or independent local authority remains in this delta.

The explicit R1 native-create -> native tick/campaign -> exact native leader and R5 exact membership typed-hold correspondence judgments from r1 stand. Their source instrumentation and membership propagation are unchanged, and the full child witness was remeasured here. The source approval does not convert those bounded measurements into retained recovery service.

## Remaining gates and commit binding

Canonical sealed-receipt execution is still the integration owner's next step: actual existing writer under the existing local Linux machine lock, retries0, exact committed SHA/environment/full streams, and lock release only after owned child cleanup. This review ran no receipt writer and changed no receipt. Applicable landing/static/publication and whole-candidate integration checks retain their own exact-candidate requirements; source approval does not waive them. The complete snapshot must be compared to the eventual clean commit, including any generated metadata or append-only record delta, before recording this verdict against that commit.
