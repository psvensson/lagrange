# Independent changed-selection result review

Date: 2026-10-21. Verifier: `subagent:/root/control_source_review`.

**Verdict: the preserved packets faithfully support a RED changed-selection result, with the original three coverage gaps measured in a separate subsequent RED attempt.** No product, test, receipt, selector or budget was changed by this review; no tests were executed. This is evidence-correspondence approval, not approval to land, publish, close a Quest, or waive any failure.

## Exact candidate and packet integrity

Candidate: `393f411ca09449898465cc3cb7320c03fba2aba8`.
Selection base: `847c36a31ea3e84880dbf5e16b7e4ffb81cdd3eb`.

Verified from the actual Git objects:

| Tree | Identity |
| --- | --- |
| Candidate commit tree | `5c3d3203d1aaa2e66ac19090f609e874dfc07bdc` |
| `src` | `ddf32b08e93c0b617f6ec24d0d70596e2888eec5` |
| `scripts` | `f9a8c3bd375965168152673ec1afe06f53216e5e` |
| `test` | `45f645584c35fcca24d40955ca108ed1a967a387` |

At the review read, the primary docs-containing HEAD was `13644b6fab6e2f4153a7b654f1a0c227cc2fc1f3`; its three runtime/script/test trees equal the measured candidate's. This does not claim execution of that later containing commit.

The broad packet's `sha256.json` hashes to `8cc75ed832926c2353cd062f6ba546799bf4f06b8205ccabbf36060469e07418`; all **20** named data files match. Its selection file hashes to `e77082a5fbd4054515680941b7261226b88ced1ced505734b4ed319bfbee550e`. All **1,261** paths are unique and exactly equal the set in `selected-test-blobs.json`; every saved blob matches the candidate's actual tree. All **49** source/test/audit/registry bindings in `source-bindings.json` match both their actual Git blobs and SHA256 bytes, including the unchanged baseline.

The separate companion `../unreported-candidate-393f411ca/sha256.json` hashes to `606c8c370ba221b9406eea847e33053b18d75ec876ab7966401ada80273aa6c6`; all **eight** named files match. Its source/scripts/test trees equal the broad run's exact candidate. The manifest checks exclude themselves and this later independent review, avoiding self-reference.

## Broad run: original result retained

`input.json` records canonical `scripts/lab.js test changed --lane all --base-sha <847> --sha <393> --split` and retry0. `controller.log:10,17,20,23,30` names the exact candidate placement on all five hosts. Lines38,102,192,208,413 record retry0 and automatically chosen factors1.4,2,2.1,2.2,2.5 respectively. The controller declines local participation because the local tree is not exactly the requested commit (`controller.log:6-8`); it does not run a contaminated local share.

The run starts 05:54:16 UTC and ends 06:26:10 UTC, exit1 (`execution.json`, `exit.json`). Independent extraction of the raw outer-runner lines reproduces `reported-verdicts.json` exactly, including host, path, verdict, assertion count and duration. There are **1,258 unique assigned-file verdicts: 1,159 pass and 99 red**. Subtracting those paths from the exact selection yields the same three missing files recorded in `preservation-summary.json`.

| Host | Assigned | Reported pass | Reported red | Unreported |
| --- | ---: | ---: | ---: | ---: |
| tv-dator | 365 | 331 | 34 | 0 |
| lenovo-laptop | 231 | 207 | 21 | 3 |
| adam-laptop | 254 | 238 | 16 | 0 |
| adams-gamla | 206 | 190 | 16 | 0 |
| carinas-windows | 205 | 193 | 12 | 0 |
| Total | 1261 | 1159 | 99 | 3 |

The canonical terminal summary is therefore `total=1261 pass=1159 fail=102 assertions=36057` (`controller.log:34597-34607`). The failure total includes the three unreported files. They are not measured semantic failures in this original attempt. Lenovo explicitly terminates with three missing results at its deadline; no Lenovo ledger is supplied or reconstructed.

The file named `summary.json` in this packet is the pre-run selection inventory, not a competing result. The README and preservation summary distinguish this correctly.

## Raw ledger reconciliation

All four available ledgers remain intact. I independently matched each raw selected record against its outer stdout tuple `(file, verdict, assertions, durationMs)`, requiring exactly one matching raw row. The result is254 Adam,206 adams-gamla,205 Carinas and365 TV selected records, all attempt1 and `retriedOnce=false`.

The extra raw records are exactly the seven entries in `ledger-reconciliation.json`: six generated timeout-fixture runs on adams-gamla (four pass, two deliberately fail) and one additional budget-limit-error run on carinas-windows. These are nested runner invocations, not additional outer selections or evidence that the outer selection retried. Their source correspondence is real: `test/scripts/test-timeout-declarations.test.js:180-245` creates and executes six nested fixtures, including asserted failures, while `test/scripts/local-corpus.test.js:298-329` executes the nested query test. The candidate blobs for those sources are preserved in the reconciliation record.

Lenovo's228 outer verdicts are supported by raw stdout and retry0 placement policy only. They do not acquire invented ledger attempt fields. No failure is dropped by classifying the extra records.

## Operation-witness composition

All **31** files from the focused32-file set that occur in this broad selection have an exact passing outer record; `operation-witness-correspondence.json` matches those raw records. These include the native release/deadline recovery and physical REMOVE witnesses, cleanup owner regressions, exact-handler fixture repairs, completion boundary tests and composed audit tests. This reinforces the previously reviewed positive composition at the same source bytes.

`test/transport/exact-handler-identity-api.test.js` is not selected by this changed-selection run. Its pass belongs to the separately reviewed `../composed-393f411ca/`32-file packet; it is not relabelled as a broad-run execution. Neither packet erases the remaining reds, and these bounded positives are not all-owner, cross-host physical certification or whole-corpus acceptance.

## Separate companion for the three missing files

The later companion is a new attempt on the **same candidate and Lenovo host**, 06:27:58–06:31:29 UTC, exit1. Its retained `runner.mjs` delegates to the existing classified planner and canonical `runLabTest`, with the exact selected three file paths and retry0. `classified-plan.json` selects exclusive/jobs1. The raw controller records exact393 at line3 and automatically selected factor2.3/retry0 at line11. Factor2.3 differs from the broad Lenovo factor2.2 under the same automatic policy; this is not a controlled latency comparison or a manually increased product budget.

The three paths equal precisely the broad run's missing set. All three raw controller verdicts match the complete three-row ledger, each attempt1, red and `retriedOnce=false`; their reported assertion total is24:

| File under `test/integration/` | Reported assertions | First failing line preserved |
| --- | ---: | --- |
| `sql-engine-system-writes-contract.integration.test.js` | 4 | `[real] an empty system table reads as success with no rows` |
| `managed-split-admission-reliability.integration.test.js` | 16 | `Cannot read properties of null (reading 'storageAccountingService')` |
| `create-table-partition-provisioning.integration.test.js` | 4 | `seed bootstrap should succeed false !== true` |

These first lines are evidence locators, not three proven independent root causes. For example the raw SQL-contract output also carries an actual seed release/control deadline refusal; the assertion label alone is not a diagnosis. First material causes, source attribution and same-host predecessor comparisons remain separate work.

Across the two distinct attempts, every originally selected file now has a reported verdict: **1,159 pass and102 red observations**. The original broad run remains **1,159 pass,99 reported red,3 unreported**. It must not be rewritten as a single complete1261-file run or a successful gate. The companion closes the result-availability gap only.

## Remaining obligations and disposition

No artifact/count/source-binding mismatch was found in these frozen packets. Preserve them and their original attempt boundaries. All reds remain obligations; historical overlap or an unchanged test body is not a waiver or proof that a failure is inherited. Same-host847 comparisons and causal attribution have not been independently assessed in this review. No count here is a count of proven bugs, regressions or distinct semantic defects.

The run is the canonical **changed selection**, not the entire repository corpus. The gate remains RED. Safety, recovery progress, resource/performance, selected-test composition, full corpus, physical distributed proof, exact-main publication and release retain separate verdicts. No new source approval, receipt edit, sealed supersession, landing or publication follows from approval of this evidence's correspondence.
