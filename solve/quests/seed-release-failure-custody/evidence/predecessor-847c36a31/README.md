# Predecessor comparison preparation — no execution yet

Candidate: `393f411ca09449898465cc3cb7320c03fba2aba8`.
Predecessor: `847c36a31ea3e84880dbf5e16b7e4ffb81cdd3eb`.

Root must first preserve the five final candidate ledgers and signal readiness.
The ongoing candidate run and its source, metadata, logs and Quest records are
not modified by this preparation. No host has been contacted or test launched.

Create a final-ledger input JSON in this directory with `candidate`,
`predecessor`, `final: true`, and `ledgers` mapping each original host name
(`adam-laptop`, `adams-gamla`, `carinas-windows`, `lenovo-laptop`, `tv-dator`)
to its absolute preserved ledger path. Run `node prepare.mjs <input.json>`.
Account for all 1,261 unique selected files. If a shard ends before reporting,
supply `unreported` as a host-to-file-list map; these are preserved separately
and are never promoted to measured reds or selected for this comparison. A
root-preserved log-derived ledger may be explicitly named through `ledgerKinds`
using `root-preserved-log-derived`; it retains missing attempt metadata rather
than manufacturing it. Ordinary ledgers require one attempt with no retry.
The preparation selects only reported red files, preserves original hosts and compares exact
test Git blobs. Changed tests remain separately labelled; absent predecessor
tests are not invented or copied backward. Outputs use exclusive creation.

After root authorizes launch, invoke `node run-host.mjs HOST --launch-authorized`
once per nonempty host input. Independent host jobs may run in parallel, subject
to canonical discovery and machine locks. No alternate-host fallback is used.
Do not launch lenovo before root releases it. A setup/thermal/busy refusal is
not a product verdict or permission to rerun silently.

The runner uses canonical `labTestCommit`, `planClassifiedTestFiles`,
`estimateFileCosts`, `runLabTest` and `labTestDeps`. Retry is zero; no timeout,
factor, lane-cap or thermal override is supplied. Normal canonical temporary
planner worktrees, placement transport logs and lab discovery state are owner
side effects; root is informed before execution. Per-host controller output,
plans and copied ledgers are isolated beneath this directory, so concurrent
jobs cannot overwrite the candidate's shared report files.

After each attempt, retain and hash all logs/ledgers before any next job on that
host. Check actual placement-head, dependency readiness, host factors and caps,
file census, attempt counts, semantic first causes and unreported files.
Compare exact original393 and predecessor failures; unchanged test/source alone
never establishes an inherited failure. A predecessor pass is evidence of a
candidate-only failure on this measurement, not automatically a product defect;
a predecessor failure must be compared by material cause, not merely filename.
Every red file remains an obligation regardless of attribution.

Read owner documents: AGENTS, steering rules/router, test/guidelines/harness.md,
docs/development/home-lab.md (machine locks/placement), and solver-runbook.md
(thermal and runner policy). The three runner owners inspected are byte-identical
between847 and393; this preparation changes neither their classification nor
execution policy. The final run selection is pending final ledgers.
