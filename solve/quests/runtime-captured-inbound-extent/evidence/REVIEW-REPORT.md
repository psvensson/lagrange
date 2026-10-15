# Runtime captured inbound correction — review checkpoint

Status: **HOLD for whole-increment certification**. The requested finite-capture implementation and frozen native RED→GREEN evidence are present. The wider owner cone exposes an explicit conflict with the historical F1 late-arrival contract. No test was weakened to hide that conflict. This is a review branch, not a merge or release candidate.

## Exact identities

| Item | Identity |
| --- | --- |
| Accepted W07 review base | `a7e821154f1039df82bfc73ef4f2e25e4fa0468d` |
| Separate test-only checkpoint | `04391697aeabea5ddd504491321546212b95982e` |
| Executed source checkpoint | `4aa8780cfec6f2718b86b4d1e27ee9711492be59` |
| Candidate runtime Git blob | `d8f86b81e7c3098da01cf558aa37a85334c7ace9` |
| Candidate runtime SHA256 | `b47951f39c6a5e7b93670a3a730115b3993976e808ec2e7d76598ade270dbc0f` |
| Frozen W07 Git blob | `debc16f442ba63b100332d93b285865d36d1c376` |
| Companion test Git blob | `2f2aaf91262c69eb73317efaedff5ccf09de5009` |
| Companion helper Git blob | `f323396b30a7d4140600bab54e1d1851ad62e88d` |
| Source-only predecessor comparison | `19de88997fda4b6719bc0c1e46df61698bac1922` |
| Capture-before-ensure comparison | `fbcc14d8b22479244642c54a504a96f452d11e7b` |
| Blanket-one comparison | `3b4560b1b0800d3703b6a887632cb2d069dd3144` |

The later evidence head retains the source and test bytes above; its identity belongs to the publication receipt. A comparison Git bundle preserves the three negative checkpoints and requires the source checkpoint, which is an ancestor of the review branch.

## One owner and the actual change

Only `src/raft/raft-rs-runtime-owner.js` changes production behavior: 26 additions and 14 deletions. Its existing execution predicate is shared by `invokeCoreAt` and `drainInbound`. The drain checks that predicate before destructive removal and before an exhausted continuation. `perform` captures `runtimeGeneration` and `group.inbound.length` after successful `ensureExecution`; each consumed occurrence decrements the extent, including a handled refusal.

The authoritative queue stays on the group. No new timer, queue, scheduler, runtime hook, result authority or release command is introduced. A later arrival retains the existing inbound timer or the DRAIN continuation already queued by its fired wake. The fixture observes that actual handoff; no completion rearm was added. Identity-unrecorded, reseed, persistence-held, closed and replacement paths retain their existing owners and typed outcomes.

Tests were committed before source. The new companion and helper are separately identified; W07 remains byte-identical. The impact registry extends the existing runtime lifecycle and application contracts, and existing generators produce inventory/classification/seal metadata. No existing historical witness, release seal or rejected model is rewritten.

## First native results

All commands use the repository's existing classified planner and locked lab executor, exact committed checkouts, matching dependency graph, retry disabled and unchanged timeout policy. The archived `request.json`, `plan.json`, `discovery.json`, `run.log` and raw TAP bind each invocation. Git mirrors name the same log bytes `run.log.txt`.

| Check | Host | Whole-file result |
| --- | --- | --- |
| Companion on test-only predecessor | lenovo-laptop | exit 1; 2 pass / 2 semantic fail |
| Frozen W07 on candidate | lenovo-laptop | exit 0; 4/4 pass |
| Companion on candidate | lenovo-laptop | exit 0; 4/4 pass |
| Turn integrity, inbound timer, lifecycle generation | adams-gamla | 3 files pass; 17 tests pass |
| Ready recovery, persistence admission, durable Ready | adam-laptop | 3 files pass; 18 tests pass |
| Trap/restore, replacement review, runtime load recovery | tv-dator | 3 files pass; 13 tests pass |
| W07 with predecessor runtime only | lenovo-laptop | exit 1; 3 pass / 1 intended fail |
| Companion with capture before ensureExecution | lenovo-laptop | exit 1; 3 pass / 1 intended fail |
| Companion with blanket-one extent | lenovo-laptop | exit 1; 3 pass / 1 intended fail |

The candidate focused total is **11 files and 56 tests passing**. Every first result is retained. These are independent native groups on separate locked hosts, not a physical multi-host Raft certification.

## Capture, custody and passive observation

- W07 candidate: predecessor proposal 2390; captured input 2399; selected proposal 2408; later inputs 2417, 2426, 2435. All four input bytes and native replies are preserved. The endpoint is native proposal entry/forwarding, not quorum commitment.
- Companion capture: two inputs accepted after enqueue enter at 639 and 648 before selected proposal 657. This rules out capturing at enqueue and a blanket-one treatment.
- Consumed wake: captured input 1327; selected proposal 1336; retained remainder 1345. The existing wake fired while Ready was held and queued service. Releasing that send was the last external progress event; no new message, status read, tick or settle helper drove the remainder.
- Generation preservation: first input 2026 in generation 1; an explicit final-announcement trap; second input 2055 in generation 2. One separately declared recovery tick establishes preservation, not an autonomous-recovery claim.
- Reconstruction capture: heartbeat 2885 precedes selected proposal 2894 after an actual persistence wait inside ensureExecution. Durable applied=committed=3 and the committed marker appears once.

Setup and cleanup are explicitly outside the measured intervals. Observers record actual native arguments and sends; they do not synthesize successful outcomes. The injected faults use existing seams. All eight candidate cleanup records settle.

## Controlled negatives

Restoring only the predecessor runtime, with final tests unchanged, restores the named W07 `4 > 1` failure after all byte/reply preservation checks. Capturing before ensureExecution causes an actual selected native proposal to precede the queued heartbeat and return `CORE_REFUSED`, reason `propose: raft: proposal dropped`, despite completed replay at applied=committed=3 and marker count 1. The blanket-one mutation preserves both copies/replies but orders step 656, selected proposal 665, step 674, failing the direct capture assertion.

Independent review accepts all three as semantic falsifiers, not missing-symbol, setup, cleanup or timeout failures. Neither a no-leader diagnostic nor infinite starvation is claimed from these observations.

## Wider owner-contract blocker

The canonical selector widens to 1,442 files across eight subsystems. Eleven exact passing files are reused; the remaining 1,431 are partitioned into disjoint existing-owner execution groups. The complete plan and per-file ledger belong to the archive because the plan exceeds the repository evidence-size limit. The frozen cone receipt records **1,339 passing files, 96 failed files and 7 files without a verdict** (including the 11 reused focused passes). TV completed 590/34, Adams 321/31, each exit 1. Adam reported 417/31 before normal owned SIGINT cancellation, exit 130; its remaining seven files are explicitly incomplete, not known unstarted versus active. TV had already finished when cancellation was requested, so only Adam was signaled. Completed-group stream verdicts match exact per-file ledger tuples; TV has one extra passing ledger row preserved but not double-counted. The interrupted group retains its raw stream rather than a fabricated completed ledger. See `canonical-cone-receipt.json` and `canonical-cone-first-file-results.json`.

`transfer-leadership-drain-oracle.test.js` exposes a direct conflict in its three mid-turn D1/D2/D3 cells. Its other 152 cases pass in the first TV run. The source-reconstructed schedule, bound to the recorded answer differences, is:

1. A selected turn captures an already accepted append response.
2. Processing it awaits a real Ready send.
3. A test-crafted higher-term transfer-election vote request is accepted during that await.
4. Under finite capture, the selected command runs before that later vote; the owned remainder turn processes the vote afterward.
5. Historical F1 instead requires that vote before the decision, and its processed-first reference expects a different answer.

The same-host locked Lenovo comparison confirms causality with identical oracle bytes (`fe5776a91c0fc706d14bd4c30e74316eadf1c15bef3bb5db12c657cd54341007`): candidate `4aa8780c` exits 1 with 152 pass / 3 fail; predecessor-runtime-only `19de8899` exits 0 with 155 pass / 0 fail. This is a new regression against the historical F1 contract, not an inherited failure. The additional candidate run was an explicit same-host causal comparison after the retained first TV result, not a retry until green.

The candidate answers `transfer-requested`, `transfer-requested`, and `drained`; the reference answers `no-known-leader`, `not-leader`, and `proposal-dropped`. This is an observable ordering-contract difference. It is not, by itself, proof of a false committed result or a Raft safety violation.

The historical `f1-step-down-port/coverage-model.md` T3 and `coverage-model-amendment-1.md` expressly retain the live pending-message requirement. The new W07 contract expressly prevents late arrivals from enlarging the captured extent. The runtime owner needs one explicit, content-bound reconciliation of that late-arrival rule and its operation-result expectations. Restore neither live draining nor a hidden per-operation alternative to make both tests appear green. Preserve the original F1 evidence and record any future supersession explicitly.

Other broad-cone failures are kept in the first-failure catalog. Unchanged test bytes alone do not establish inherited behavior. Source-established fixture mismatches, known retained release REDs, source-paired regressions and causal-unknown failures are distinguished. RC1/RC2 and unrelated lint/complexity debt remain separate from this correction.

## Static checks and review boundary

Scoped runtime lint, literals and grammar pass. Cyclomatic findings remain two, cognitive one, and decision-boundary findings two, exactly as before source. Source/script duplication remains 47 groups / 1,462 lines. Test duplication returns to the predecessor's 697 groups / 26,415 lines after the new setup clone was removed; the existing 46-line overrun remains. The changed-path fast-static suite passes.

The normal source commit hook refuses the two unbaselined decision findings in `invalidateRuntimeGroups` and `replaceRuntime`. Its failure is retained. The explicit runbook WIP-only preservation route was used for the independently reviewed source and deliberately incorrect comparison checkpoints. No ratchet or allowlist was raised; this is not a green commit gate or terminal Quest landing. The oversized runtime owner also remains outside terminal closure under the user's prohibition on unrelated extraction.

Independent source review initially approved measurement against the new finite-capture design. The append-only F1 addendum holds whole-increment certification after the wider native result. The Quest remains open, with its probe still red. Publication preserves the reviewed source and evidence; it grants no merge, release or activation authority.

## Exact next decision

`ORDERING-DECISION.md` selects a narrow supersession proposal: one finite runtime cut with truthful native acceptance, while existing completion owners retain authority. D1/D2 support that interpretation; D3 global consumer safety is blocked by source-backed Wasm acceptance/advertised-commit mismatch and an unresolved message-group delivery-custody proof. Timer callback reachability is explicitly conditional. No new native safety result is claimed from that source review. The document provides the three traces, current consumers and smallest same-schedule proof for review. Neither the proposal nor its tests are activated here; original F1 remains binding and source/test bytes stay frozen.

The complete release successor remains unsealed/unactivated. Shared-control-wave remains HELD, Runner/TAP PARKED, PR #122 rejected, and the complete release protocol on HOLD.
