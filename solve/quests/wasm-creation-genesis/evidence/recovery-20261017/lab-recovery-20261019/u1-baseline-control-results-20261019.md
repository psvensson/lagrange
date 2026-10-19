# U1 retained baseline and F1 control evidence — 2026-10-19

## Scope

The five new source-test intents were each posted once on [Harnessd control #12](https://github.com/psvensson/harnessd-control/issues/12). The existing typed relay and physical lab controller admitted them under the standing Lagrange project grant. All five reached their original terminal results; none was replaced after a pending or ATTENTION status. These runs preserve deliberately failing inventory/custody baselines and three F1 source-only negative controls. They do not approve the corrected combined U1 candidate.

All complete logs below have been reconstructed from the original receipt or bounded nonexecuting evidence reads. Every chunk's controller, request identity/digest, original job, offset, returned bytes and chunk SHA256 was checked, then the concatenated log was checked against the original execution's full byte count and SHA256. Raw source-test logs and original receipt envelopes are retained without rewriting their failures.

## Exact result mapping

| Treatment | Original lab issue | Exact source SHA | Executed result |
| --- | --- | --- | --- |
| Previously recovered F1 corrected source | [#235](https://github.com/psvensson/lagrange-lab/issues/235) | `77a888af01f13e30052135075964c6508b1d0b24` | PASS: 3 files, 123 runner assertions, exit 0 |
| Inventory/hydration baseline | [#247](https://github.com/psvensson/lagrange-lab/issues/247) | `8c9b14141f89872938d21cc35472b262929818d6` | FAIL: 2 files, 95 runner assertions, 20 failing leaf tests, exit 1 |
| F1 M01 — seal temporary occupancy | [#262](https://github.com/psvensson/lagrange-lab/issues/262) | `6dd2690d494ef959a6f94712281a2703581eebb5` | Expected FAIL: 39 leaves, 37 pass, 2 fail, exit 1 |
| F1 M02 — seal absent future binding | [#263](https://github.com/psvensson/lagrange-lab/issues/263) | `b4dd1c2dddc9da21539078f243fcae4ad90055a0` | Expected FAIL: 39 leaves, 38 pass, 1 fail, exit 1 |
| F1 M03 — infer finality from outcome name | [#265](https://github.com/psvensson/lagrange-lab/issues/265) | `48349777471f8cdb7c7c46020d1703960404116a` | Expected FAIL: 39 leaves, 38 pass, 1 fail, exit 1 |
| Physical custody fourteen-case baseline | [#266](https://github.com/psvensson/lagrange-lab/issues/266) | `9f815cf46f72cfdcd5d9ca4c7f95b23d6ace55b4` | FAIL: 14 leaves, 0 pass, 14 fail, exit 1 |

The three F1 controls select only `test/service/service-consensus-creation-intent.test.js`, unchanged from the F1 corrected-source checkpoint. They mutate source only and are not merge candidates. Inventory and custody baseline source has the F1 correction but does not contain the subsequent F2–F6 correction.

| Treatment | Cloud intent UUID | Physical lab request ID |
| --- | --- | --- |
| Inventory | `78307521-de78-4d37-99d2-4534a88db9af` | `20fb6e2c31aaa7ed82a0766160e9a906` |
| M01 | `33a90601-30f8-44e7-a84c-a6a68817b7f5` | `aec74bb83bd22df29b7571219be90751` |
| M02 | `dd6e0072-04ee-4d51-8081-9b85c229e3da` | `c5b282c6be733f98d74d44e07885c286` |
| M03 | `13f283bb-fcc7-4f14-a1fe-97a5586c8e66` | `e950f281d938f6b0686cd3fd2ec81088` |
| Custody | `517008e8-962c-403b-911d-6a207ec38d64` | `415fcd0971c4d2313c34cdc5b11fe342` |

## F1 negative-control witnesses

M01 fails exactly the two preserved delayed-original occupancy races, `TARGET_ALREADY_OWNED` and `INVALID_EXPECTED_STATE`, each with `CANCELLED_JOURNAL_WITH_DELAYED_ADMITTED_RESOURCE: unresolved obligation lost` at the intent test's assertion line 412. The other 37 leaves pass.

M02 fails exactly `independent U1: STALE_BINDING before the exact future selection is not a sealed reservation refusal`, with `FUTURE_BINDING_CANCELLED_BEFORE_EXACT_REQUEST_BECAME_ADMISSIBLE` at line 456. The other 38 leaves pass. The preserved diagnostic shows the original request subsequently owns an ADMITTED resource.

M03 fails exactly `F1 REMOVE-time resolution fails closed for untagged or UNRESOLVED owner refusals`, with `CALLER_RECONSTRUCTED_FINALITY_FROM_OUTCOME`. The other 38 leaves pass.

Each full log and its machine-readable leaf details have been handed to the independent F1 reviewer. Independent acceptance is recorded by that reviewer separately; runner totals alone are not the review verdict.

## Inventory/hydration baseline

The exact two files were `test/node/runtime-service-bound-route.test.js` and `test/wasm-service/bound-creation-restart.integration.test.js`. Their first failures include six hydration/acknowledgment cases and fourteen restart/retirement cases. The retained errors expose missing immutable-origin hydration, late effects after handler shutdown or replacement, blind resume after hydration failure, trusting PENDING wakes, overlapping inventory scans, duplicated retirement, process custody released while retirement remains admitted, lost predecessor/successor obligations, current-memo redirection of known retained requests, physical closure discharging an unconfirmed journal, two separate journal observations, duplicate retention and conflicting-observation ordering.

The exact error and stack for each of the twenty leaves is retained in `lab-247-failure-analysis.json`. No failing assertion was replaced to obtain a passing result.

## Physical custody baseline

The exact file was `test/wasm-service/bound-creation-physical-custody.integration.test.js`, with fourteen independently authored cases. The first three stop at the missing physical-owner currentness observation interface; they establish interface prerequisites rather than executed behavior of the new interface.

The remaining eleven first failures preserve reentrant shutdown missing admitted retirement, duplicate/conflicting retirement entering twice, failed-retirement tombstone debt dropped on shutdown retry, ordinary-stop failure dropping joined retirement debt, direct stopping objects allowing recreation, missing distinction between a RETIRED tombstone and absent storage, stale driver-origin start, and three STOPPED-projection failures completing the original journal prematurely (throw, retained reply and absent reply).

Exact names, error messages and stacks are in `lab-266-failure-analysis.json`. These are deliberate baseline observations; the corrected source still needs its own exact-source result.

## Complete raw log identities

| Log | Bytes | SHA256 |
| --- | ---: | --- |
| `lab-235-executor.log` | 1,304 | `a1372b5c0421f99197126ba7a70d587a49d64e9e8a439ae71dee711849bb3824` |
| `lab-247-executor.log` | 91,437 | `cb09c3ad451e0683c6b3b0d3979a68ba4a6d16100f6d57aec7efd36cf5846708` |
| `lab-262-executor.log` | 23,938 | `ea33b44ba655790999fe980f59fd5a8dbd28511cdfb75573ff4408004446251e` |
| `lab-263-executor.log` | 29,403 | `855a3b04cbcf61e7b60018963d95900f729802ab1ea9bd53101501dc3641570c` |
| `lab-265-executor.log` | 32,086 | `051a1c6c7ea6db1d9df38dfabea5398b1295db6ce3c23a987eaad7d4dd9a2edc` |
| `lab-266-executor.log` | 21,658 | `d51446519aec15e4a14ecfe7101bddaf4ced1fee3385c463aea337145ec57cda` |

Original result metadata is in `lab-N-original-receipt.json` for each new run, and the chunk verification/error records are in `lab-N-failure-analysis.json`. F1 #235 uses the previously recovered `lab-235-result.json`.

## Relay reconciliation and evidence-request correction

Accepted `ATTENTION`/`NOT_RUN` with no physical request does not mean a terminal test refusal. The owner retries durable nonterminal plans. In this batch automatic fleet refresh and a renewed current heartbeat advanced all original intents without replacement UUIDs. The final physical results demonstrate that behavior. The source audit and public status history are retained in `relay-source-inspection.json` and `control-12-public-receipts-20261019-0526.json`.

An initial batch of twelve nonexecuting #247 log reads (#249–#260) was malformed because its request IDs had 30 hex characters instead of the required 32. The original bodies are preserved in `evidence-247-retrieval-actions.json` and `evidence-247-invalid-batch-receipt.json`. Corrected, schema-validated nonexecuting reads #267–#278 supplied the complete matching original log. No source-test intent was modified or resubmitted by this correction.

Heartbeat sequence 5 was initially refused for signed-clock skew after its prepared payload aged before GitHub posting. The exact authoritative refusal was acknowledged through the official helper, then a fresh timestamp reused the same unconsumed sequence 5 and received ACCEPTED. All request identities and both heartbeat outcomes are retained. Signing-to-GitHub creation must be within 90 seconds; transport delivery to the daemon has a separate 120-second bound.
