# Verification — workflow-friction recommendations

Scope: independent, read-only verification of recommendations R1-R6 for `formation-ledger-self-move-blocks-cluster-ops`. I wrote only this report file.

## Pack / memory-boundary constraints

- `docs/steering/llm-pack.config.json` feeds pack generation from explicit `docs/steering` source entries: architecture/testing/style/governance sources including `memory-boundary.md` (`docs/steering/llm-pack.config.json:10-115`) and generated finding files (`docs/steering/llm-pack.config.json:117-155`). The `core` output is marked manual (`docs/steering/llm-pack.config.json:157-176`). `operational-ground-truth.md` and `AGENTS.md` are not explicit source entries in this config, while AGENTS says to run `npm run steering:llm:pack` after editing listed/nested steering sources (`AGENTS.md:105-107`).
- `memory-boundary.md` says durable shared rules belong in in-repo steering, not external memory (`docs/steering/memory-boundary.md:9-16`, `docs/steering/memory-boundary.md:20-25`). It also makes `operational-ground-truth.md` the single canonical home for distributed-work traps (`docs/steering/memory-boundary.md:26-28`), so distributed-harness artifact and engagement rules should live there or link to it, not be duplicated elsewhere.

## R1 — Don't seal the ROOT theory into the quest statement

**VERDICT: ACCURATE.**

- The quest statement embeds a long `ROOT (run-4/run-3 forensics...)` causal narrative inside the sealed statement (`solve/quests/formation-ledger-self-move-blocks-cluster-ops.json:3`). The actual sealed closure is separately the scenario-harness `doneWhen` (`solve/quests/formation-ledger-self-move-blocks-cluster-ops.json:13-20`).
- The log falsifies that ROOT path: line 2 says the interlock counts were early, double-counted `MOVE_SKIPPED` records and that ledger self-move progress writes completed cleanly (`solve/log/formation-ledger-self-move-blocks-cluster-ops.ndjson:2`); line 3 moves the true root to an unfit-leader deadlock (`solve/log/formation-ledger-self-move-blocks-cluster-ops.ndjson:3`); lines 12-15 move the head again to coverage/operation-ledger non-terminalization and then readback/nonterminal driver issues (`solve/log/formation-ledger-self-move-blocks-cluster-ops.ndjson:12-15`).
- The reverted wrong-leg commits are visible in git history: `a9344058 fix(partition): roll back...`, followed by `066bf78d revert(partition): ... wrong leg, precondition never occurs live` (command evidence: `git --no-pager log --oneline --all --grep='formation-ledger\|self-move\|ledger\|C3\|operation-ledger\|unfit\|over-target'`). The log also records the fix fired 0 times and was reverted (`solve/log/formation-ledger-self-move-blocks-cluster-ops.ndjson:1`).
- Existing docs/tools partially cover the desired separation. Quest anatomy defines `doneWhen` as artifact-bound and sealed and says metric/doneWhen are separate (`docs/steering/workflow-guidelines/solver-quests.md:62-75`). The code template comments say the statement should be a one-line terminal success condition and narrative belongs in `planDoc` (`scripts/solve.js:75-99`). The theory mechanism exists (`docs/steering/workflow-guidelines/solver-quests.md:339-367`; `scripts/solve/theory.js:563-593`; selected state is projected in `scripts/solve/store.js:203-209`, `scripts/solve/store.js:251-256`). But I found no explicit steering sentence saying "do not put causal ROOT theory in the sealed statement."

**ALREADY COVERED?** Partly: sealed `doneWhen`, planDoc comments, and Quest-native theory exist. Not explicitly covered as a rule.

**STEERING-ADDRESSABLE vs TOOLING-ONLY:** Steering-addressable now in `solver-quests.md` → `Quest Anatomy`; tooling could later lint statements containing `ROOT`/long narratives.

**RISK:** Low. This reinforces sealed-statement discipline. Do not edit historical quest statements mid-quest; record superseding findings/theories instead.

## R2 — Make the resume point structured

**VERDICT: PARTLY ACCURATE.** The null current-blocker claim is accurate; the ~90s timing was not reproduced in this verification.

- Verification command output: `node scripts/solve.js status --id formation-ledger-self-move-blocks-cluster-ops | ...currentBlocker...` returned `owner: null`, `boundary: null`, `dominantReason: null`, `mechanism: null`, `selectedTheory: null`, `movement: "no_evidence"`, and `nextAction: "continue supervised step..."`; measured elapsed time was `0:30.58`, not ~90s.
- The log contains rich prose with the binding head and next move: line 15 names the readback mismatch and says "Fix order: Leg B first..., Leg A second" (`solve/log/formation-ledger-self-move-blocks-cluster-ops.ndjson:15`).
- `currentBlocker` is computed from structured `evidence-ingested` events, not parsed prose findings: `evidenceEvents()` filters only `EVENT_EVIDENCE_INGESTED` (`scripts/solve/current-blocker.js:42-47`), `blockerFromEvidence()` reads structured `owner`, `boundary`, `dominantReason`, `mechanism`, `nextAction`, etc. (`scripts/solve/current-blocker.js:49-68`), and `buildCurrentBlocker()` derives the card from that movement plus selected theory (`scripts/solve/current-blocker.js:304-350`). Findings are only summarized as `claim/rulesOut/evidence` (`scripts/solve/current-blocker.js:189-198`) and feed only `noLongerCurrentBlockers` when `rulesOut` exists (`scripts/solve/current-blocker.js:327-329`).
- `finding` accepts no structured binding-head / next-move fields: CLI parsing accepts `--claim`, optional `--evidence`, optional `--rulesOut`, regression and scope-pressure metadata (`scripts/solve.js:267-309`), and storage persists only those fields (`scripts/solve/store.js:163-172`, `scripts/solve/store.js:426-434`).
- There is no `current`, `resume`, or `last` subcommand in the generated command list; `solve-commands.md` lists the 24 commands (`docs/steering/llm/solve-commands.md:19-48`).

**ALREADY COVERED?** Current-blocker is documented as the active failure surface (`docs/steering/workflow-guidelines/solver-quests.md:153-160`), but the existing command cannot recover prose-only binding heads.

**STEERING-ADDRESSABLE vs TOOLING-ONLY:** Mostly tooling: add structured finding/evidence fields or a resume command. Interim steering can require that resume-critical findings be mirrored into structured evidence/theory fields.

**RISK:** Medium. Do not make steering scrape prose; `solver-quests.md` explicitly warns that machine checks key on structured fields rather than prose in the metadata consistency section (`docs/steering/workflow-guidelines/solver-quests.md:877-881`).

## R3 — Immutable run artifacts

**VERDICT: PARTLY ACCURATE / PARTLY OUTDATED.** Playback per-run artifacts are confirmed. The live demo no longer simply overwrites without archiving, but its active log path remains mutable and only the newest three archives are retained.

- The demo writes node logs to the fixed active directory `data/examples/service-data-affinity-demo`: `CLUSTER_DATA_ROOT` is fixed (`examples/service-data-affinity/run-affinity-demo.js:61`), `startNode()` writes `node-${index}.log` under that root (`examples/service-data-affinity/run-affinity-demo.js:109-115`), and each run removes/recreates the active root (`examples/service-data-affinity/run-affinity-demo.js:437-441`).
- However, current code archives the previous run before wiping it: `ARCHIVE_ROOT = ${CLUSTER_DATA_ROOT}-archive`, retention is 3, and `archivePreviousRun()` tars the old active root with a timestamp before the wipe (`examples/service-data-affinity/run-affinity-demo.js:399-435`). This directly contradicts the absolute claim that the previous artifact is overwritten with no protection.
- The old finding cites a mutable-style location (`node-1.log:2770`) without an immutable archive path (`solve/log/formation-ledger-self-move-blocks-cluster-ops.ndjson:3`), so the citation can still rot once the active dir is wiped and the bounded archive ages out.
- The distributed harness playback convention exists: operational ground truth says full per-node logs live under `test-output/reports/.playback/<run>/.full-logs/` (`docs/steering/operational-ground-truth.md:17-19`); the gate prints a read recipe for `${REPORT_DIR}/.playback/<run>/.full-logs/...` (`scripts/rolling-restart-stat-gate.sh:305-310`); analyzers resolve report-sibling full logs as `.playback/<report>/.full-logs/<scenario>` (`scripts/rolling-restart-liveness-full-log-replay.js:148-159`).

**ALREADY COVERED?** Partly by live demo archival code and playback docs. I found no general steering mandate that every live/demo artifact citation use an immutable run id/path. `solver-quests.md` only says evidence tiers land in `test-output/reports/` and track relevant `solve/changes` artifacts (`docs/steering/workflow-guidelines/solver-quests.md:78-91`, `docs/steering/workflow-guidelines/solver-quests.md:847-850`).

**STEERING-ADDRESSABLE vs TOOLING-ONLY:** Steering-addressable in `operational-ground-truth.md`; tooling/harness should enforce per-run directories or print immutable archive ids.

**RISK:** Medium storage/retention risk. A blanket "never prune" rule would conflict with retention; require stable evidence references for cited findings instead.

## R4 — Machine-readable epic↔quest links

**VERDICT: PARTLY ACCURATE.** Accurate for the target quest and `trace` result; inaccurate if read as "no quest has any epic-like field" because one quest has an ad hoc ignored `links.epic`.

- The target quest's `links` are all null/empty and it has no `epic` field (`solve/quests/formation-ledger-self-move-blocks-cluster-ops.json:6-12`). `solve.js trace --quest formation-ledger-self-move-blocks-cluster-ops` printed empty roadmap/spec/closes/parent and zero child quests (command evidence).
- The Solver template supports only `roadmapRow`, `specRef`, `closesCL`, `parentQuest`, and `planDoc` (`scripts/solve.js:84-98`). `trace` joins only row/cl/spec/quest selectors, and the quest reverse view prints roadmap/spec/closes/parent plus children via `parentQuest` (`scripts/solve.js:634-675`, `scripts/solve.js:680-690`). There is no first-class epic selector.
- Other quests do populate links: a repository scan found `quests=97 populatedLinks=74` (command evidence). Example: `transition-mutation-budget-doom-loop` and `coordinator-reconcile-lane-ledger-write-head-of-line` have `parentQuest: "movielens-affinity-placement-demo"` (`solve/quests/transition-mutation-budget-doom-loop.json:6-12`; `solve/quests/coordinator-reconcile-lane-ledger-write-head-of-line.json:6-12`). One quest has an ad hoc `links.epic` (`solve/quests/latency-group-zone-affinity-demo.json:6-13`), but tooling ignores it.
- No epic references the target quest (`grep formation-ledger-self-move-blocks-cluster-ops solve/epics` returned no matches). Many epic files do reference other quest ids (command scan found 12 epic files with quest-id references), so the pattern exists but is not enforced for this quest.
- `solver-quests.md` has a link hygiene warning in audit, not a hard mandate: product quests with no planning link are invisible to trace/frontier/overview (`scripts/solve/audit.js:296-310`).

**ALREADY COVERED?** Partly: `links`/`trace` exist and audits warn on empty product links. Epic is not first-class and the target quest is unlinked.

**STEERING-ADDRESSABLE vs TOOLING-ONLY:** Both. Steering can require `planDoc` or `parentQuest` at quest creation; first-class epic linking and trace support require tooling.

**RISK:** Medium. Adding a new `epic` field without tooling may create a false sense of traceability. Prefer `planDoc` until `trace` supports `--epic`.

## R5 — Cross-quest routing as first-class

**VERDICT: PARTLY ACCURATE.** The sibling-falsification and missing routed logs are accurate. The claim that there is no way to record a finding against another quest is not literally true: `finding --id <otherQuest>` can do it manually.

- This quest's findings explicitly falsify the over-target sibling premise: line 3 says surplus-drain evidence should go to the over-target sibling and that its self-clearing-transient premise is `FALSIFIED at 4/3 for 6min` (`solve/log/formation-ledger-self-move-blocks-cluster-ops.ndjson:3`). The sibling statement says the over-target 4th voter is a formation transient that existing caps and surplus drain clear (`solve/quests/formation-ledger-over-target-accounting-drain-phase-replace-blind-spot.json:3`).
- The target findings also touch nearby declared quests, though this is less cleanly machine-verifiable: line 14 discusses operation-ledger terminalization and explicitly distinguishes it from the 1ms budget doom-loop (`solve/log/formation-ledger-self-move-blocks-cluster-ops.ndjson:14`); the budget quest exists and is declared (`solve/quests/transition-mutation-budget-doom-loop.json:1-12`). The coordinator head-of-line quest exists and names slow ledger writes blocking reconcile lanes (`solve/quests/coordinator-reconcile-lane-ledger-write-head-of-line.json:1-12`), while this quest's findings discuss ledger row-write/operation latency and terminalization loops (`solve/log/formation-ledger-self-move-blocks-cluster-ops.ndjson:13-15`).
- None of the three affected quest logs exist: `solve/log/formation-ledger-over-target-accounting-drain-phase-replace-blind-spot.ndjson`, `solve/log/transition-mutation-budget-doom-loop.ndjson`, and `solve/log/coordinator-reconcile-lane-ledger-write-head-of-line.ndjson` are missing (command evidence), so no routed finding was recorded there.
- Manual cross-quest recording is possible because `cmdFinding` accepts any `--id`, loads that quest, and appends to that id's log (`scripts/solve.js:267-309`). The generated command docs present `finding --id <id>` generically (`docs/steering/llm/solve-commands.md:31-33`). But there is no dedicated `route-finding`, no backlink semantics, and no documentation for cross-quest routing.
- There is a quest list/status surface (`portfolio`, `frontier`, `overview`) in the command list (`docs/steering/llm/solve-commands.md:25-28`), but portfolio rows are id/class/closure/outcome/attempts/reopens/cannot-measure only (`scripts/solve/portfolio.js:122-151`) and do not index owner/mechanism.

**ALREADY COVERED?** Partly by generic findings and portfolio/frontier/trace. Not first-class cross-quest routing.

**STEERING-ADDRESSABLE vs TOOLING-ONLY:** Steering can require manual duplicate/backlink findings when one quest falsifies another; first-class routing/indexing is tooling.

**RISK:** Medium. Cross-quest findings must not move another quest's sealed `doneWhen`; they should be labeled evidence/falsification/backlink, not silently edit the sibling quest statement.

## R6 — Enforce the precondition-witness gate mechanically

**VERDICT: ACCURATE.** Existing steering already says to prove engagement/wiring; `step --commit` does not mechanically require a precondition/engagement witness for source-changing attempts.

- Wrong-leg history is confirmed. The E-cheap fix `fba0b477` was committed on DT red-on-revert, then reverted as `96a0917f`; research records it as "DT-proven but wrong leg, live regression" and says it did not clear `[2/4]` (`solve/changes/formation-ledger-self-move-blocks-cluster-ops/research-SYNTHESIS.md:107-121`). `diagnose-run6-demo-stall.md` says the fix targets the wrong leg and made the stall worse (`solve/changes/formation-ledger-self-move-blocks-cluster-ops/diagnose-run6-demo-stall.md:1-20`, `solve/changes/formation-ledger-self-move-blocks-cluster-ops/diagnose-run6-demo-stall.md:80-88`).
- The stranded-ACTIVE fix `a9344058` was likewise wrong-leg: live validation at that HEAD says the rollback never fired, zero ACTIVE participant BEGINs opened, and the precondition never occurs (`solve/changes/formation-ledger-self-move-blocks-cluster-ops/live-validation-LEG1-is-wrong-leg.md:1-27`); the quest log says the fix fired 0 times and was reverted (`solve/log/formation-ledger-self-move-blocks-cluster-ops.ndjson:1`). Git history includes the revert `066bf78d` (command evidence from the git log above).
- Steering already prescribes engagement checks: operational ground truth says to verify a mechanism is wired and actually fires with `analyze:fix-engagement`, red-on-revert DT, or code trace (`docs/steering/operational-ground-truth.md:86-97`); `package.json` exposes `analyze:fix-engagement` and `analyze:precondition-recurrence` (`package.json:108-110`). `solver-quests.md` requires engagement proof for cutover closures (`docs/steering/workflow-guidelines/solver-quests.md:97-102`).
- `step --commit` enforces: pending step exists; `changeRef` resolves as a valid diff (`scripts/solve/step.js:166-181`); theory-gate readiness (`scripts/solve/step.js:193-204`); then `finalizeAttempt()` validates metric evidence/changeRef/rung reset and theory gates (`scripts/solve/loop.js:240-365`; `scripts/solve/honesty.js:25-91`). The checkpoint/commit gate requires later subagent verification for source changes (`scripts/solve/audit.js:370-417`) and auto-commit scopes only in-scope files (`scripts/solve/handoff.js:240-275`). I found no validation of "precondition occurred", "fix engaged", or an `analyze:fix-engagement` witness in this path.

**ALREADY COVERED?** Steering-covered, tooling-not-enforced. Ground-truth and cutover sections already state the practice; step/commit does not require the evidence.

**STEERING-ADDRESSABLE vs TOOLING-ONLY:** Tooling is needed for enforcement (`--engagement` / `--precondition-witness` / structured evidence). Interim steering belongs in `operational-ground-truth.md` for distributed traps and in `solver-quests.md` near supervised `step --commit`/attempt evidence.

**RISK:** Medium. A universal live witness gate could over-block pure refactors or building-block DTs. Scope it to source-changing attempts whose theory depends on a live/distributed precondition, and allow code-trace/DT witness when live evidence is not required.

## Final recommendation table

| Recommendation | Verdict | Steering file/section to edit | Exact rule text suggestion |
| --- | --- | --- | --- |
| R1 — Don't seal ROOT theory into quest statement | Accurate | `docs/steering/workflow-guidelines/solver-quests.md` → `Quest Anatomy` | "A Quest statement is a sealed result predicate, not a causal theory. Put causal roots, suspected mechanisms, and falsifiable next-leg rationale in findings, `planDoc`, or Quest-native theory records; if a root is falsified, record the new learning without editing the sealed statement/doneWhen." |
| R2 — Make resume point structured | Partly | `docs/steering/workflow-guidelines/solver-quests.md` → `Current Blocker And Diagnostic Movement` | "A resume-critical finding must leave a structured resume surface: either ingest evidence with owner/boundary/reason/mechanism/nextAction fields or select/record a frontier theory whose owner path names the current head. Prose-only binding-head notes are not enough, because `status` does not parse finding prose." |
| R3 — Immutable run artifacts | Partly / outdated | `docs/steering/operational-ground-truth.md` → `Absence proves nothing` / artifact paragraph | "Every live/demo finding that cites logs must cite an immutable run artifact path or archive id, not the mutable active data directory. If a runner still uses a fixed active directory, archive/rename it before the next run and put that archive path in the finding evidence." |
| R4 — Machine-readable epic↔quest links | Partly | `docs/steering/workflow-guidelines/solver-quests.md` → `Quest Anatomy` and metadata consistency | "Product quests should carry at least one planning link at creation: `planDoc` for the epic/spec page, `parentQuest` for quest lineage, or `closesCL`/`specRef`/`roadmapRow` where applicable. An unlinked product quest is a temporary defect to backfill before handoff, because `trace`/`frontier` cannot show what it advances." |
| R5 — Cross-quest routing first-class | Partly | `docs/steering/workflow-guidelines/solver-quests.md` → findings / two-layer theory | "When a finding materially falsifies or constrains another declared quest, record a finding on the affected quest as well, with a backlink to the source quest evidence. Until a route-finding command exists, use `node scripts/solve.js finding --id <affected-quest> ...` manually; do not edit the sibling's sealed goal in place." |
| R6 — Mechanical precondition-witness gate | Accurate | `docs/steering/operational-ground-truth.md` → `Research existing mechanisms first`; plus `solver-quests.md` supervised attempt evidence | "Before committing a source change whose proof depends on a live/distributed precondition, record a precondition/engagement witness: `analyze:fix-engagement`, `analyze:precondition-recurrence`, a red-on-revert directed test that exercises the real seam, or a code trace showing the precondition fires. A green DT on an injected seam is not enough unless the witness proves the real run reaches that seam." |
