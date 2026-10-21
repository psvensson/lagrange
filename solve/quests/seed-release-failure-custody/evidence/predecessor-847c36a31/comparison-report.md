# Same-host predecessor comparison of the reported red selection

Candidate: `393f411ca09449898465cc3cb7320c03fba2aba8`.
Predecessor: `847c36a31ea3e84880dbf5e16b7e4ffb81cdd3eb`.
Measured 2026-10-21, 06:28:34–07:01:17 UTC through canonical locked lab APIs, retries zero. No product/test changes, timeout overrides, lane overrides, thermal bypasses or alternate-host substitutions were made for this comparison.

**All 102 selected files reported red at the predecessor on their original candidate hosts. There are no predecessor-green or unreported files in this selection.** This is a file-level comparison, not a claim that 102 independent bugs share unchanged causes or that the candidate passes its acceptance gates. Every red remains an obligation.

The original candidate attempt remains 1,261 selected = 1,159 pass + 99 reported red + 3 unreported. The separately preserved candidate supplementary attempt measured those three red on Lenovo. The original 99 selection and its SHA256 `f631228a9fc42bb2e1588c70464c3328f96e161aa47401d48a539c80fb71e887` are unchanged. `supplemental-selection.json` adds exactly those three, SHA256 `7c1c5281aaf90a363bae0c7591f2b36d332c347ff3f3184a724b1c3314835144`. Lenovo's predecessor input combines 21 original plus three supplementary files. No raw candidate ledger extras were promoted to selected files: the original input is the root's 1,258 unique stdout verdicts in `changed-candidate-393f411ca/reported-verdicts.json`.

| Original host | Selected | Predecessor pass / red / unreported | Reported assertions | Candidate factor → predecessor factor |
| --- | ---: | --- | ---: | --- |
| adam-laptop | 16 | 0 / 16 / 0 | 163 | 2.0 → 2.1 |
| adams-gamla | 16 | 0 / 16 / 0 | 521 | 2.1 → 2.1 |
| carinas-windows | 12 | 0 / 12 / 0 | 321 | 2.5 → 2.0 |
| tv-dator | 34 | 0 / 34 / 0 | 1,218 | 1.4 → 1.4 |
| lenovo-laptop | 24 | 0 / 24 / 0 | 481 | original 2.2; supplement 2.3 → 2.3 |
| Total | 102 | 0 / 102 / 0 | 2,704 | Canonical discovery, no manual factor changes |

All five predecessor raw ledgers have exactly the planned rows, no extra/duplicate files, attempt 1 and no retried rows. Each controller log identifies the exact predecessor head. Direct test blobs are identical for all 102 pairs; no missing or changed tests were copied backwards. Runner-owner blobs (`scripts/lab/probe.js`, `scripts/run-classified-test-files.js`, `scripts/run-test-files.js`) also match across the pair. Production dependencies are not all identical: ten production files changed between these heads, so test-byte equality alone does not establish causal equivalence. Discovered host factors differ as shown; this is the same canonical policy and host assignment, not numerically identical effective budgets or load.

## First visible material causes

`comparison.json` contains all 102 exact test blob IDs, original and predecessor log paths/line numbers, verdicts, durations, first reported failing assertion and bounded diagnostic excerpts. The index is a reading aid; full raw logs retain later failures. Its `preservedLog` paths are restoration targets for the final evidence packet and asset mapping, not proof that publication has occurred.

For 97 pairs, the first reported `not ok` text is identical after removal of TAP's elapsed-time suffix. Five pairs differ:

- `index-maintenance-consistency.property`: random seed differs; the minimized counterexample and false predicate match.
- `raft-leader-election.integration`: the same 15-second bootstrap assertion fails at 39,392 ms on candidate and 38,774 ms on predecessor. This is not an equal-latency claim.
- `table-partition-structure.property`: seed/shrink differ and minimized table name is `A` versus `A0`; both report the false predicate with the same zero-valued row shape.
- `distributed-transaction-coordinator.property`: seeds, inputs and exact worktree paths differ; both expose the typed participant-outcome refusal at `sql-query-engine-participant-wire.js:193`, through 257, initializer 205 and participant-set 78.
- `cdc-generation.property`: seeds/shrink counts differ; the minimized counterexample and false predicate match.

The four root-prioritized cases now have actual same-host predecessor observations, extending the earlier source-only `changed-candidate-393-first-four-attribution-2026-10-21.md`:

| Test | First current and predecessor observation | Exact raw log lines (candidate / predecessor) | Attribution ceiling |
| --- | --- | --- | --- |
| `test/config/code-path-uniqueness.property.test.js` | Test line 259 reports the same five ENABLE-symbol core-feature-flag findings in participant release, cutover constants, WASM opening/publication/constants. | original controller 2036 / adam controller 23 | Matching detector findings, not a new candidate-only feature flag. |
| `test/node/replica-handler-owner-path-bypass.test.js` | First CREATE child at test line 182 is unfinished; later children cascade, four reported assertions on each. | original 4958 / adam 843 | Same visible pending completion; the precise internal pending await is not proven by stdout. |
| `test/node/replica-create-admission-recovery.test.js` | First child passes; current-boot CREATING takeover child cancels after the logged missing `semantic_raft_status` refusal; later cancellation is consequential. | original 1323 / adams 277, preceding diagnostics retained | Same explicit owner-fact refusal and first cancellation; not proof every later case is defective. |
| `test/message-group/message-group-native-custody-handoff.test.js` | Native source/CDC custody flow engages, but recipient proposal count at test line 146 is 0 rather than 1. | original 878 / adams 406 | Matching asserted first divergence; no inference that durable debt was lost or cross-host safety established. |

The prior historical ledger at exact `bdc94775708e357c5b0129fded70be4cea48079b` remains research context. Its 119/1,898 and 115 predecessor-red observations are a different selection and are neither imported acceptance nor a waiver. This new 102-file same-host slice does not reproduce the other 1,159 candidate-green files on the predecessor and does not prove the candidate free of masked regressions or new failures behind an earlier assertion.

## Preservation and remaining owner work

Each host's `sha256.json` binds its complete controller log, raw placement log/error, plan, terminal times and isolated native ledger. `preparation-manifest.json` binds the original runner/input preparation; `packet-manifest.json` binds the final packet. The original preparation README deliberately retains its pre-execution wording as history; this report records the subsequent authorized executions and terminal outcomes.

Root owns publication of the original bytes through the existing Solver evidence owner, plus final Quest records and independent review. `publication-candidates.json` identifies the sole raw log above 1 MB and the three `.mjs` preparation/runner files for asset publication; these must not be rewritten, truncated or renamed into apparent compliance. Restore targets are explicit. No publication, acceptance, gate repair, baseline adjustment, source repair or main merge is claimed by this packet. Final composition, full change proof and the existing release/serving gates remain separately authoritative.
