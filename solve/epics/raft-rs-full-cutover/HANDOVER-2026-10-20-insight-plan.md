# Handover: approved rs-raft insight execution plan

Date: 2026-10-20. Repository: `psvensson/lagrange`.
Purpose: continue from the approved plan without repeating the research or
mistaking planning/model evidence for implementation acceptance.

## 1. Exact preservation references

- Planning branch: `planning/rsraft-insight-execution-20261020`.
- Plan/evidence commit: `45a0388b570dfde4c764c2d3193e40de6c041032`.
- Plan/evidence tree: `55c95798af4faae2a558c9663edc01ea46f96509`.
- Product/analysis base: `be25caa5f0c3612feec662d4feaa9ba28f8f34df`, from
  `work/u1-integration-candidate-20261020` when rechecked for persistence.
- This handover is an additive follow-up to the plan/evidence commit. The
  published branch head and PR identify its containing commit; the document
  does not attempt to embed its own self-referential commit hash.

These are preservation references, not an instruction to reset an integration
or working checkout to the old analysis base. The next integration owner must
select the actual execution candidate after checking live branches, current
owner contracts and any ongoing work. Do not overwrite another agent's staged
paths or assume a dated merge order is still applicable.

## 2. Operator decision and scope

The operator approved the proposed execution plan and asked to write/persist
it, commit and push the changes, and create this handover. This publication
preserves planning and evidence only. It does not amend a sealed acceptance,
seal a new Quest, approve production changes, move main, or certify U1, TX1,
FreshMG, activation, the cutover or a release.

One existing epic owns the work: `raft-rs-full-cutover`. Keep U1 closure and
historical failure/release recovery connected but separately bounded. Older
failures remain obligations; they are not waived, and unrelated improvements
must not silently expand U1's seal.

## 3. Durable contents and navigation

All paths below are relative to `solve/epics/raft-rs-full-cutover/`.

| File | Purpose |
| --- | --- |
| [insight-execution-plan-2026-10-20.md](insight-execution-plan-2026-10-20.md) | Approved planning direction, five work packages, dependencies, first-unit charter, proof gates, integration rules and milestones |
| [insight-proof-matrix-2026-10-20.md](insight-proof-matrix-2026-10-20.md) | Eight design claims mapped to existing owners and required real-owner witnesses; production verdicts remain UNRESOLVED |
| [insight-execution-inputs-2026-10-20.json](insight-execution-inputs-2026-10-20.json) | Exact input hashes, preserved Git blobs, proposal provenance, standalone re-execution and explicit limits |
| [evidence/insight-review-2026-10-20/README.md](evidence/insight-review-2026-10-20/README.md) | Entry point for the original review packet |
| `evidence/insight-review-2026-10-20/REVIEW.md` | Full source-bound assessment, rejected alternatives, assumptions and primary research references |
| `evidence/insight-review-2026-10-20/check_models.py` | Standard-library-only finite counterexample checker, Python 3.10+ |
| `evidence/insight-review-2026-10-20/model-results.json` | Original executed results and shortest counterexample traces |
| `evidence/insight-review-2026-10-20/source-manifest.json` | Exact inspected source files, Git blobs and read ranges |
| `evidence/insight-review-2026-10-20/SHA256SUMS` | Original packet integrity checks |
| [contract-first-2026-10-08.md](contract-first-2026-10-08.md) | Existing entry receives only a dated 23-line navigation/decision addition; all earlier content is retained |

The six original review-packet files are byte-identical to the supplied
verification archive. The proposed execution-plan text was adapted only for
approved planning status, repository navigation, provenance references and a
dated persistence decision; its work packages and proof requirements remain.
The original proposal and archive hashes are recorded in the input manifest.

## 4. What was verified during preservation

The standalone abstract checker was executed again with Python 3.13.5. All
eight defective abstractions produced a counterexample. Each revised
abstraction had an engaged positive case and no violation within its finite
model. Output was byte-identical to the earlier `model-results.json`:

`763a084dd3d017569f5252e121b955ece9fa73b0d322a25198b65d838229cb67`

The committed review-packet blob identities were checked against the original
files. The comparison of the plan/evidence commit to its base showed ten
changed paths, all under this epic directory: nine additions and the dated
append-only addition to the existing contract-first document, with zero
removed lines. This handover adds one further file.

No Lagrange source tests, repository static audits, lab/GCP run, production
reproduction, independent implementation review, Solver landing or release
publisher were executed for this preservation task. A GitHub preservation
commit/push is not the canonical publication or main-merge certification.
The models do not import Lagrange and do not prove production reachability,
unbounded liveness, native I/O atomicity, or cross-host safety.

To reproduce only the abstract evidence, from repository root:

```sh
(
  set -eu
  EVIDENCE=solve/epics/raft-rs-full-cutover/evidence/insight-review-2026-10-20
  (cd "$EVIDENCE" && sha256sum -c SHA256SUMS)
  OUT="$(mktemp)"
  trap 'rm -f -- "$OUT"' EXIT
  python3 "$EVIDENCE/check_models.py" --output "$OUT"
  cmp "$EVIDENCE/model-results.json" "$OUT"
)
```

Do not interpret this command as a substitute for an owner test or a release
gate. Run actual project commands through the existing catalog, Solver,
authorized runner and publication owners.

## 5. First actions for the receiving agent

Read `AGENTS.md`, current steering/routing, the current authority-and-recovery
contract, and the relevant existing Quest seals before writing source.
Recheck branch/ref state and select one execution candidate. Preserve this
analysis base and historical failing artifacts; do not blindly replay merges.

**Primary unit A: participant-release/control-authority recovery.** Trace the
first actual `current_control_owner_fact` refusal through its producer,
durable origin, construction, registration, publication and handoff. Identify
blocking prerequisites, distinguishing permission, authoritative evidence,
cached observation and wake. A circular dependency is still a hypothesis.

Produce a real-owner discriminator through the actual entry path. If it
exposes a reachable defect, independently review the bounded contract and
witness, then repair the existing interaction. If the suspected schedule is
already protected or excluded, record the enforced reason and find the real
first divergence. Failed setup or lack of reproduction is not proof of safety.

**Direct U1 safety unit B: exact physical effects and cleanup custody.**
Follow `stopReplica` into the lower physical owner. The caller's admitted-memo
checks are not sufficient evidence of sink-side fencing. Demonstrate old
pending effects cannot select a successor and that uncertain native work
retains its resource obligation. Coordinate A/B changes wherever they touch
the same lifecycle or release interaction.

Read-only C/D/E review may proceed in parallel: existing placement
sanction/shared-budget enforcement; existing TX1/TX2 decision, prepared work,
replay transfer and safe reclamation; snapshot/CDC lineage and coverage.
Continue established TX1 work within its prerequisites rather than blocking
it for a cosmetic serial plan. One writer owns each changing interaction.

For every activated unit record:

`trigger -> current authoritative facts -> permitted effect -> durable commit
-> lost-response/restart behavior -> remaining obligation and release owner`

Required evidence climbs from source/contract correspondence to a real-owner
positive and targeted semantic negative, exact-candidate composition, and
physical distributed witnesses where required. Keep safety, recovery progress
and resource/performance verdicts separate. The original U1/TX1/FreshMG and
frozen-head cutover/closeout requirements remain authoritative.

## 6. Related work preserved, not merged by this task

The following PR metadata was re-read on 2026-10-20. All four were open,
draft and unmerged. Their bodies retain previous execution evidence; these
results were not rerun as product tests during this preservation task.

| PR | Exact head at read | Role and required caution |
| --- | --- | --- |
| [#137](https://github.com/psvensson/lagrange/pull/137) | `ba2b08ce01969ad0a0c8835a31689a09247fad0a` | Generic REPLACE simulated journal-reader fixture and generated seal; narrow evidence, not whole-U1 approval |
| [#139](https://github.com/psvensson/lagrange/pull/139) | `e14736eeda2dd5d9dc9f36227e18fcc320e892f2` | Three exact-handler test-contract repairs plus generated seal; shared fixture cause, not proof of every production transport |
| [#140](https://github.com/psvensson/lagrange/pull/140) | `6b4ce36c8e7d9595473366573e2809816dc09612` | CDC partition factory test double and generated seal; final composed checks still needed |
| [#141](https://github.com/psvensson/lagrange/pull/141) | `bdc94775708e357c5b0129fded70be4cea48079b` | Historical failure ledger and source ancestry; research input, not acceptance |

The historical ledger records 119 failed files in the original 1,898-file
selection, of which 115 also failed at the predecessor. Those are historical
file-level observations, not a current clean-suite claim or 119 independently
proven bugs. Follow the original artifacts and first material causes. The
local fixture cases L-01/L-02 are recorded there; their broader test-double
contract-drift pattern is systemic. No other problem becomes purely local
because it is old, intermittent or only seen in one test.

## 7. Rejected shortcuts and stop conditions

Do not introduce a parallel metadata database/bootstrap controller, universal
workflow engine, collapsed epoch, per-request global topology lookup or a new
ledger duplicating existing authority. Do not promote unavailable or cached
absence to permission, lease expiry to cancellation of committed facts,
request timeout to proof native cleanup stopped, a global CDC maximum to
coverage, or a local TTL to safe retry-record reclamation.

Do not relax a test, timeout, baseline, or sealed contract to make a result
look green. Do not merge unreviewed diagnostic/mutation branches, declare a
new Quest already satisfied, or present this plan's approval as independent
source review. Append findings and supersession decisions through existing
owners; never rewrite their historical records.

Current milestone: planning/evidence is preserved. Selecting the execution
candidate, sealing or reusing the first bounded unit, production witnesses,
repairs, independent approvals, integrated corpus and physical certification
remain to be done. The next deliverable is a source-bound causal explanation
and discriminator for one complete operation, not another broad redesign.
