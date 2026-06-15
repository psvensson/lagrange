# Export Plan — Portable "Way of Working" (Project Operating System)

**Goal.** Extract the *method* of this repository — its steering doctrine, the
Quest/Solver execution engine, the closure-ledger debugging grammar, the
subagent-verification discipline, and the validator/guardrail gate — into a
self-contained bundle under `exports/llm-project-operating-system/`: a
**general-purpose, best-practices starting point for any non-trivial project
that uses LLMs as efficiently as possible.** It can be dropped into a new repo
and applied directly, with **no `.kiro/` paths** and no domain-specific
(distributed-DB) content leaking in. The intended audience is *any* complicated
project — likely open-source — so the machinery ships in full, generalized, not
slimmed.

**This document is the plan, not the export.** It defines what to copy, how to
normalize it, what to rewrite, what to deliberately leave behind, and how to
prove the bundle works in a fresh repo. Execution is staged so each phase is
independently verifiable.

---

## 0. Two framing decisions (settled)

### 0.1 Licensing — settled: permissive open

The bundle is a general-purpose starter, not a commercial-only asset, and will
most likely be used for open-source projects. So:

- **Default license: permissive open (Apache-2.0, or MIT).** The source repo is
  AGPL-3.0, but the bundle's contents are your own work and are deliberately
  re-released under the permissive license via a `LICENSE` + `NOTICE` in the
  export root. Apache-2.0 is the recommendation (patent grant + NOTICE
  convention suit a tooling/method bundle); MIT if you prefer minimalism.
- This is a **recorded relicense**, not an accident: the `NOTICE` states the
  bundle is derived from `<repo>@<sha>` and released under the chosen license by
  the copyright holder. No AGPL obligation travels with it.
- Not a blocker. Pick Apache-2.0 vs MIT at Phase 1 step 1; everything else
  proceeds regardless.

### 0.2 Generic mechanism + marked examples — the export shape

The machinery must be **equally useful for any complicated project**, so the
rule is *include everything, generalized* — not "slim it down." Two
consequences:

- **Mechanism ships in full, made domain-neutral.** The Quest/Solver engine, the
  closure-ledger grammar, the full validator/guardrail family, the steering-pack
  machinery, the proof-ladder + regression discipline — all ship. Wherever a
  piece is phrased in distributed-DB terms (owner boundaries for
  membership/placement, CDC rules, Raft/rebalancer invariants, the "stale
  container / sparse bundle" harness doctrine), it is **rewritten as a
  domain-neutral principle**, with the distributed-DB version preserved only as
  a clearly-marked example.
- **Every concrete instance is a marked example, never live content.** Real
  domain rules, real CL-### records, real architecture contracts, and live Quest
  data are replaced by *worked examples* that demonstrate the structure. Empty
  templates are hard to fill from cold, so each template carries one neutral
  worked example (a generic web-service / library domain), explicitly fenced.

Banner convention on every file:
- Generic mechanism: `> Method kernel — portable. Keep the mechanism; this file
  is domain-neutral.`
- Example/template: `> EXAMPLE — illustrative only. Replace with this project's
  own content.`

Domain-bound checkers and contracts that *cannot* be made fully generic (e.g.
owner-trace, scenario-policy, metadata-gateway checks) still ship — as the
**generic mechanism + a marked example wiring**, so a new project adapts rather
than reinvents. Nothing is simply "left behind" except live project data and
secrets (see §6).

---

## 1. Inventory — what constitutes the "way of working"

Mapped from source paths to the eight subsystems that make up the operating
system. Columns: **Source → Export disposition.**

| # | Subsystem | Source (in this repo) | Disposition |
|---|---|---|---|
| 1 | **Boot / entry contract** | `AGENTS.md`, `.kiro/steering/llm/{core,boot}.md` | Kernel — rewrite boot section, drop distributed "ground truth" block (generalize to a stub) |
| 2 | **Steering doctrine (source)** | `.kiro/steering/{system-guidelines,runtime-contracts,architecture,code-style,roadmap}.md`, `.kiro/steering/doctrine/**`, `.kiro/steering/{testing,workflow}-guidelines/**` | Split: workflow/style/doctrine *shapes* = kernel; architecture/runtime/system-guidelines bodies = **templates** |
| 3 | **Compiled LLM packs + generator** | `.kiro/steering/llm/**` (core/architecture/testing/style/governance, `rules.json`, `manifest.json`), `.kiro/steering/llm-pack.config.json`, `scripts/generate-steering-llm-pack.js`, `npm run steering:llm:pack` | Kernel — generator is portable; **reconfigure `sourceDir`/`llmDir`**; regenerate packs from new location |
| 4 | **Quest / Solver engine** | `scripts/solve.js`, `scripts/solve/**` (executor, attempt, ladder, closure-kind, evidence, honesty, report, probe…), `solve/quests/<id>.json` layout, `docs/solver-runbook.md`, `npm run solve:*` | Kernel — copy whole engine (no external deps); ship schema + empty `quests/` dir, **not** existing quest data |
| 5 | **Closure ledger grammar** | `.kiro/specs/membership-lifecycle-placement-hard-cutover/closure-grammar.md`, `closure-ledger/CL-###.md`, `closure-ledger.md` (index) | Kernel grammar + template + **one** worked example record; drop the real CL-### bodies |
| 6 | **Subagent delegation + verification** | `.kiro/steering/workflow-guidelines/subagents.md`, `validators.md`, the "verify implementation via subagent" working default | Kernel — copy as-is, light rewrite |
| 7 | **Validator / guardrail gate** | `scripts/check-*.js` (26) + `scripts/guideline-check-*.js` (2) = 28, `npm run {test:complexity,test:cycles,test:duplication,test:deps,steering:check,guard:*}`, devDeps (eslint, knip, madge, dependency-cruiser, tap, stryker) | Kernel — ship the **full** family: generic checkers (complexity, cognitive-complexity, cycles, duplication, unused, file-size, constant-names, literals, hot-path, decision-boundaries, statechart/decision-table *mechanism*) + `check-TEMPLATE.js`. Domain-bound checkers (owner-traces, scenario-policy, metadata-gateway, system-contracts) ship as **mechanism + marked example wiring**, not omitted |
| 8 | **Hooks + gate wiring** | `scripts/install-git-hooks.js` (sets `core.hooksPath` only), **`.githooks/{pre-commit,pre-push}`** (the actual payload + scripts they call: `check-staged-constant-names.js`, `audit:*`, `test:unused`), `npm run hooks:install`, `.claude/settings.json` | Kernel — copy installer **and** the `.githooks/` payload (installer is inert without it); ship a curated scripts fragment + a **sanitized** `.claude/settings.json` (strip the external-`gc`-binary hooks) |

Supporting/cross-cutting (each gets a mention below, not its own table row):
edition-matrix/governance gate, the rule-ID registry, the architecture-INDEX
decomposition pattern, the proof-ladder + statistical-gate discipline, the
memory convention, and provenance/sync-back.

---

## 2. Normalized target layout (no `.kiro/`, no ordinal/grab-bag names)

The export flattens the Kiro-specific `.kiro/` nesting into plain top-level
directories. This honors the repo's own ARCH-0007 (no `segment`/`part-N`/`misc`
names) and the "normalize file placement" request.

```
exports/llm-project-operating-system/
├── LICENSE                      # the license chosen in §0.1
├── NOTICE                       # copyright + provenance (derived from <repo>@<sha>)
├── EXPORT-PLAN.md               # this file
├── README.md                    # what this is + 60-second apply guide
├── AGENTS.md                    # boot entry (rewritten, paths point inside bundle)
├── apply.js                     # installer: copies bundle into a target repo, merges package.json scripts, runs hooks:install
│
├── steering/                    # was .kiro/steering/
│   ├── INDEX.md
│   ├── pack.config.json         # was llm-pack.config.json (sourceDir/llmDir rewritten)
│   ├── packs/                   # was steering/llm/  (compiled, regenerated)
│   │   ├── core.md  architecture.md  testing.md  style.md  governance.md
│   │   ├── rules.json  manifest.json
│   ├── doctrine/                # single-path, owner-boundaries, state-encoding, decision-experiments  (kernel)
│   ├── workflow/                # was workflow-guidelines/  (kernel: lifecycle, closure, subagents, validators, quest-artifacts, solver-quests)
│   ├── testing/                 # was testing-guidelines/   (kernel shapes: proof-ladders, regression-policy, release-gate, harness, fixtures)
│   ├── style.md                 # was code-style.md         (kernel)
│   └── templates/               # DOMAIN templates the new project fills in
│       ├── system-guidelines.template.md
│       ├── runtime-contracts.template.md
│       ├── architecture.template.md
│       └── roadmap.template.md
│
├── ledger/                      # was .kiro/specs/<spec>/closure-*
│   ├── closure-grammar.md       # kernel (verbatim, links rewritten)
│   ├── INDEX.md                 # ledger index template
│   └── records/
│       └── CL-000.example.md    # one worked example using the canonical template
│
├── tooling/
│   ├── solve/                   # was scripts/solve.js + scripts/solve/**
│   │   ├── solve.js
│   │   ├── quest-context.js     # NOTE: lives at scripts/quest-context.js (OUTSIDE scripts/solve/) — copy explicitly
│   │   └── ... (engine modules, unchanged)
│   ├── steering-pack/generate.js   # was scripts/generate-steering-llm-pack.js (emits .kiro paths — see §3.3)
│   ├── hooks/
│   │   ├── install.js              # was scripts/install-git-hooks.js (only sets core.hooksPath — installs nothing itself)
│   │   └── githooks/               # was .githooks/ — the ACTUAL payload: pre-commit, pre-push (+ scripts they call)
│   ├── validators/                 # FULL family + template (steering:check is an npm script, NOT a file)
│   │   ├── check-complexity.js  check-cognitive-complexity.js
│   │   ├── check-circular-dependencies.js  check-duplication.js
│   │   ├── check-file-size-thresholds.js  check-guideline-constant-names.js
│   │   ├── check-staged-constant-names.js   # invoked by .githooks/pre-commit — must ship
│   │   ├── check-guideline-literals.js  check-guideline-hot-path-diagnostics.js
│   │   ├── check-guideline-decision-boundaries.js  check-decision-tables.js  check-statecharts.js
│   │   └── check-TEMPLATE.js        # how to add a project-specific guardrail
│   └── package.scripts.json        # npm-script fragment apply.js merges in (incl. steering:check, audit:*, test:unused that hooks call)
│
├── quests/                      # empty Quest store (schema + .gitkeep), was solve/quests/
│   └── _schema.md
│
├── governance/
│   ├── edition-matrix.template.md  # scope-gate mechanism, reseeded for commercial
│   └── scope-discipline.md         # "only in-home rows drive work" rule, generalized
│
├── docs/
│   └── solver-runbook.md           # operator quickstart (rewritten paths)
│
└── .claude/
    ├── settings.json               # starter (minimal, permissive-but-safe)
    └── memory-convention.md        # the per-file memory discipline, documented
```

---

## 3. The mechanical core: reference rewrite + pack reconfiguration

Moving out of `.kiro/` is **not** a file move — the docs and config hardcode
`.kiro/...` paths everywhere, and the pack generator is configured against
`.kiro/steering`. This is the highest-risk step; treat it as a first-class task
with an automated rewrite + a zero-tolerance verification.

**3.1 Build a path-rewrite map** (old → new), e.g.:
- `.kiro/steering/` → `steering/`
- `.kiro/steering/llm/` → `steering/packs/`
- `.kiro/steering/llm-pack.config.json` → `steering/pack.config.json`
- `.kiro/steering/code-style.md` → `steering/style.md`
- `.kiro/steering/workflow-guidelines/` → `steering/workflow/`
- `.kiro/steering/testing-guidelines/` → `steering/testing/`
- `.kiro/specs/<spec>/closure-grammar.md` → `ledger/closure-grammar.md`
- `.kiro/specs/<spec>/closure-ledger/` → `ledger/records/`
- `scripts/solve.js` → `tooling/solve/solve.js`
- `scripts/generate-steering-llm-pack.js` → `tooling/steering-pack/generate.js`

**3.2 Apply it** with a small, reviewable rewrite script over **markdown AND
code**. The rewrite must cover four surfaces, not just prose:
- markdown links + frontmatter (`source_of_truth`/`compiled_pack`/`parent_index`);
- the JSON config `sourceDir`/`llmDir` + each source `file` path;
- **hardcoded `.kiro` strings inside engine/generator JS** (verified to exist):
  `generate-steering-llm-pack.js` (the `'.kiro'` ignore-scan entry **and** the
  `.kiro/steering/` text it bakes into every generated pack's
  `source_of_truth`/banner/footer — lines ~58, 993, 997, 1098),
  `solve/change-artifact.js:27` (`'.kiro/steering/'` in the workflow-path list),
  `solve/scope-pressure.js:22` (`segments[0] === '.kiro'`);
- the `steering:check` npm script body (`git diff --quiet -- .kiro/steering/llm`).
Do **not** hand-edit dozens of files.

**3.3 Reconfigure the pack generator**: in `steering/pack.config.json` set
`sourceDir: "steering"`, `llmDir: "steering/packs"`, and update each source
`file` path to the flattened location. **Critically, the generator itself emits
`.kiro/steering/` into every pack it produces** (the `source_of_truth` line, the
"do not hand-edit" banner, the footer) — so the generator's own emitted strings
must be parameterized off the configured `sourceDir`, or regenerated packs will
reintroduce `.kiro` and fail the §3.4 gate.

**3.4 Verification gate (must pass before Phase 4 closes):**
- `grep -rn '\.kiro' exports/llm-project-operating-system/` returns **zero**
  hits (no stray references survived).
- Re-running the generator from the new location regenerates the packs and the
  diff vs. the copied packs is **only** the expected path/text changes — the
  rule set and IDs are stable. (Dogfood: the repo's own rule that packs are
  generated, never hand-edited.)
- Every relative markdown link in the bundle resolves to a file that exists
  (link-check pass).

---

## 4. Phased execution

Each phase ends with a concrete, checkable artifact. Land them as separate
commits on `main`.

**Phase 1 — License + skeleton.** Create the export root, write `LICENSE` +
`NOTICE` (§0.1), the directory skeleton (§2), `README.md`, and `.gitkeep`s.
Nothing copied yet. *Exit: skeleton exists, license declared.*

**Phase 2 — Method kernel (prose).** Copy the portable steering prose
(workflow/, doctrine/, testing/ shapes, style.md, subagents/validators),
`closure-grammar.md`, `solver-runbook.md`, and `AGENTS.md`. Apply the rewrite
map (§3.1–3.2). Add kernel/template banners (§0.2). *Exit: §3.4 grep+link
checks pass on prose.*

**Phase 3 — Engine + generator + validators (code).** Copy `solve/**`, the
pack generator, the hooks installer, and the **generic** checkers. Confirm no
non-relative requires broke (engine is stdlib-only; checkers pull standard
devDeps). Write `tooling/package.scripts.json` (the curated `solve:*`,
`steering:*`, `test:complexity|cycles|duplication|deps`, `hooks:install`
subset) and the devDeps list. *Exit: `node tooling/solve/solve.js --help` and
the generator both run from the bundle.*

**Phase 4 — Reconfigure + regenerate + verify.** Point the pack config at the
new layout (§3.3), regenerate packs, run the full §3.4 verification gate.
*Exit: packs regenerate clean, zero `.kiro` hits, links resolve.*

**Phase 5 — Templates + examples + installer.** Write the domain templates
(`system-guidelines`, `runtime-contracts`, `architecture`, `roadmap`,
`edition-matrix`), the `CL-000.example.md` worked record, the empty Quest store
schema, the starter `.claude/settings.json`, and `apply.js` (copies bundle into
a target repo, merges the script fragment into the target `package.json`, runs
`hooks:install`). *Exit: end-to-end dry run (Phase 6).*

**Phase 6 — Dogfood in a throwaway repo.** `git init` a scratch dir, run
`apply.js`, then: regenerate packs, author + run one trivial Quest to a terminal
state, open + close one example CL-### record, and trip one validator on purpose
to confirm the hook blocks a bad commit. *Exit: all four work cold; capture the
transcript in `README.md` as the proof.*

---

## 5. Things you didn't list but need their own mention

You asked specifically. These are the gaps:

1. **License (§0.1).** Settled: permissive open (Apache-2.0/MIT). Still worth
   its own mention because the relicense from the AGPL source must be *recorded*
   in `NOTICE`, not silent — otherwise the provenance is ambiguous.
2. **Method-vs-domain separation (§0.2).** Without it the new project inherits
   distributed-DB invariants (CDC, Raft, placement, owner-boundaries for
   membership) that are simply false there. Ship the mechanism generalized, with
   the distributed-DB version demoted to a marked example.
3. **Reference-rewrite + pack reconfiguration (§3).** "No `.kiro` things" is a
   path-rewrite task across every doc link + the generator config, not a move.
   It's the most failure-prone step and deserves its own verification gate.
4. **Tooling dependency manifest.** The engine is stdlib-only (verified: zero
   non-relative requires), but the validators need `eslint`, `knip`, `madge`,
   `dependency-cruiser`, `tap`, `stryker`. The export must ship a devDeps list
   or the gate silently no-ops in the new repo.
5. **`package.json` script wiring.** The method is invoked through ~30 `npm run`
   entries (`solve:*`, `steering:*`, `guard:*`, `test:*`). They must travel as a
   mergeable fragment (`tooling/package.scripts.json`) — otherwise "directly
   applied" isn't true.
6. **Git-hooks installer is inert without the `.githooks/` payload.** Verified:
   `install-git-hooks.js` only runs `git config core.hooksPath .githooks` — it
   installs nothing itself. The export MUST also copy `.githooks/pre-commit`,
   `.githooks/pre-push`, and every script they invoke
   (`check-staged-constant-names.js`, the `audit:*` scripts, `test:unused`), or
   the headline gate silently does nothing in the new repo. There is no CI here
   (`.github/workflows` absent); ship a sample CI stub too, since most projects
   will want CI to run the same gate.
7. **Quest store schema + empty store.** `solve.js` assumes a `quests/`
   directory and a JSON Quest shape. Export the **schema and an empty store**,
   never the live quest data from this repo.
8. **Rule-ID registry (`rules.json`) discipline.** Rules are cited as
   `ARCH-####`/`TEST-####` across docs and enforced by `steering:check`. The
   export needs the registry *mechanism* reseeded with the kernel rules only —
   decide whether to keep the `ARCH/TEST/STYLE/GOV` prefixes or renumber.
9. **Architecture-INDEX decomposition pattern.** The "narrow domain file +
   INDEX, contracts/, models/ (TLA+/Alloy/fast-check)" structure is part of the
   way of working. Ship it as an empty `architecture/INDEX.md` scaffold + the
   contract-record template, not the membership contracts.
10. **Proof-ladder + statistical-gate discipline.** `proof-ladders.md`,
    `regression-policy.md`, `release-gate.md`, and the stat-gate run-count
    judgment (N=3–4 mechanistic, N≥8 promotion). The *grammar* is portable; the
    `rolling-restart-stat-gate.sh` script itself is domain-specific — ship the
    policy, gate the script behind "example."
11. **Memory convention.** The per-file `MEMORY.md` + frontmatter discipline is
    part of how work persists across sessions. Document it in
    `.claude/memory-convention.md` so the new project adopts it deliberately.
12. **Provenance + sync-back (anti-drift).** Record `source repo @ <sha>` in
    `NOTICE`, and ship a `regenerate` note describing how to re-derive the
    bundle when the method evolves here — the same lesson as the steering packs:
    a hand-maintained copy drifts; a re-derivable one doesn't.
13. **Starter `.claude/settings.json` needs sanitizing — both files.** The
    `settings.local.json` allowlist is full of this repo's exact file paths
    (~24 hits) and is useless/leaky elsewhere. **Also** the base `settings.json`
    wires four hooks (PreCompact/SessionStart/Stop/UserPromptSubmit) to an
    external `gc` binary — shipping it as-is injects a dependency on an unrelated
    tool. Ship a *minimal, generic, hook-free* starter, not a copy of either.

---

## 6. Explicit non-goals (the only things genuinely left behind)

Per §0.2 the rule is *include everything, generalized*. The sole exclusions are
**live project data and secrets**, which carry no reusable mechanism:

- Real Quest data (`solve/quests/*.json`), real CL-### record bodies, real
  architecture contracts, the edition-matrix's current rows.
- The repo-specific `.claude/settings.local.json` permission allowlist (full of
  this repo's exact file paths) — replaced by a minimal generic starter.
- Live distributed run artifacts (`test-output/**`, `.playback/**`).

Everything else — including the distributed harness discipline, the analyzers,
the scenario-gate and statistical-gate patterns, and the domain checkers — ships
as a **generalized principle + a clearly-marked distributed-DB example**, not as
an omission.

---

## 7. Decisions (locked)

| # | Decision | Resolution |
|---|---|---|
| 1 | **License** | Permissive open — **Apache-2.0** default (MIT acceptable), recorded as a deliberate relicense in `NOTICE`. |
| 2 | **Generality** | Ship the **full** machinery, made domain-neutral; equally useful for any complicated project. Nothing slimmed. |
| 3 | **Examples** | Keep one neutral worked example per template/mechanism, **explicitly marked** (`EXAMPLE` banner). |
| 4 | **Validators** | Ship the **full** guideline-check family + generic checkers + template; domain-bound checkers as mechanism + marked example. |
| 5 | **Bundle name** | `llm-project-operating-system`. |
| 6 | **Rule-ID prefixes** | Keep `ARCH/TEST/STYLE/GOV` (proven, cited by `steering:check`); reseed bodies, not the scheme. *(flag if you'd rather renumber.)* |

Phase 1 can start. License decision is **Apache-2.0**, rule-IDs stay
`ARCH/TEST/STYLE/GOV` — both confirmed.

---

## 8. Independent verification pass (subagent, recorded)

The plan was independently verified against the repo by a separate subagent.
**Verdict: TRUSTED-WITH-NOTES.** Confirmed accurate: all source paths, the
stdlib-only portability claim (engine uses only `node:` + relative imports), the
devDeps list, AGPL source license, no-CI, the `sourceDir`/`llmDir` config
fields, the closure-ledger location, and that `.kiro` is pervasive in steering
markdown (33 files / 72 occurrences — the §3 "highest-risk" framing is
justified). The following findings were verified by me and folded into the plan
above:

1. **`.githooks/` payload omission (most important).** `install-git-hooks.js`
   only sets `core.hooksPath`; without copying `.githooks/{pre-commit,pre-push}`
   and the scripts they call, the gate is inert. → fixed in §1 row 8, §2, §5.6.
2. **§3.2/§3.4 self-contradiction.** `.kiro` is hardcoded in engine/generator JS
   (`generate-steering-llm-pack.js:58/993/997/1098`, `change-artifact.js:27`,
   `scope-pressure.js:22`) and emitted into generated packs, so a
   markdown-only rewrite would fail the plan's own zero-`.kiro` gate. → §3.2/§3.3
   broadened to code + generator-emit reconfiguration.
3. **`steering-check.js` phantom file.** `steering:check` is an npm script
   (`steering:llm:pack && git diff --quiet -- .kiro/steering/llm`), not a file.
   → removed from §2.
4. **`quest-context.js` lives outside `scripts/solve/`** but is an engine
   module. → added to §2 with an explicit-copy note.
5. **Base `.claude/settings.json` is not benign** — wires hooks to an external
   `gc` binary. → §5.13 now says sanitize both settings files.
6. **Count drift** `~40 → 28` checkers. → fixed in §1 row 7.

No design flaws were found; all notes were scope corrections. The plan is a
sound, executable basis for the export.

---

## 9. Build status (executed)

The plan was executed end-to-end. Bundle: **116 files, ~1.7M**, at this
directory. Verified by a second independent subagent that ran it cold.

**Working and verified:**
- Quest/Solver engine boots and runs `new`/`status`/`report` (writes `solve/quests/`);
  all relocated relative imports resolve, including the vendored
  `tooling/solve/work-theory-ledger.js` + `work-package-schema.js` that `theory.js` needs.
- Pack generator regenerates from `steering/pack.config.json` with **provably zero
  drift**; all 20 configured sources exist.
- Zero `.kiro` / `_legacy_work` / `LAGRANGE_` / dangling self-`scripts/` refs in shipped content.
- **Dogfood passed:** `node apply.js <fresh git repo>` copied 114 files, placed
  `.githooks/` + wired `core.hooksPath`, merged 26 scripts into `package.json`;
  in the target the engine, `steering:llm:pack`, and the staged-constant hook path all work.
- Banners correct (Method kernel vs EXAMPLE); LICENSE Apache-2.0; NOTICE records the relicense + provenance `8816a694`.

**Defects found by the second verifier and FIXED in-build:**
1. `check-decision-tables.js` / `check-statecharts.js` imported an unshipped
   `system-contract-utils.js` → **shipped it** (node-only; both now run, exit 0).
2. `package.scripts.json` `devDependencies` under-declared and its comment mislabeled
   several validators "node-only" → **added** `espree`, `eslint-visitor-keys`,
   `eslint-plugin-sonarjs`, `jscpd`; **rewrote** the comment with the verified
   per-validator dependency map.

**Known residue (acceptable / project-supplied):** steering docs reference
domain checkers a new project writes (`check-{owner-traces,invariants,runtime-grammar,
system-contracts,alloy-models}.js`); node-only project scanners crash with a raw stack
(not a clean message) when run with no `src/`. None block applying the bundle or
running the engine/packs/hooks gate.

---

## 10. Domain-neutral rewrite (executed)

After the build, the four EXAMPLE steering files plus every other source still
carrying distributed-database content were rewritten to genuinely domain-neutral
doctrine — the **mechanism** kept, distributed specifics replaced with neutral
illustrations (cache, job queue, API service, billing ledger) or generalized.

**Rewritten (via per-file subagents, then regenerated):**
- `steering/{system-guidelines,runtime-contracts,architecture,roadmap}.md` (the 4 EXAMPLE files → now Method-kernel, domain-neutral).
- `steering/doctrine/{INDEX,single-path,owner-boundaries,state-encoding,decision-experiments}.md`.
- `steering/testing/{regression-policy,fixtures,harness,proof-ladders}.md`.
- `steering/workflow/solver-quests.md`.
- `ledger/closure-grammar.md` (+ `CL-000.example.md`, `ledger/INDEX.md`): concern/failure-class
  taxonomies reframed as project-defined with neutral examples; `convergenceTrigger`
  field renamed `progressTrigger` consistently.
- `docs/solver-runbook.md`: distributed scenarios → neutral Quests (checkout latency, duplicate-job, cache settle).
- The **generator itself** (`tooling/steering-pack/generate.js`): emitted `.kiro` paths,
  the `architecture` README description, and the `DOMAIN_TAG_KEYWORDS`/`tagTitles`
  maps (dropped `cdc`/`rebalancing`, added `maintenance`).

**Reset as origin data (not doctrine):** `check-guideline-decision-boundaries-baseline.json`
(7069→6 lines) and `check-guideline-hot-path-diagnostics-baseline.json` reset to empty;
the hardcoded origin hot-path module list emptied; `mechanism-card.js` classifier and the
`test/{distributed,rebalancer,cdc}/` path classifiers genericized.

**Verification:** the entire **doctrine surface** (steering sources + regenerated packs +
ledger + docs + governance + architecture + AGENTS + README) scans **zero** distributed-DB
terms. Packs regenerate with **zero drift**; the engine boots; the previously-broken
validators run.

**Engine-internal residue — now RESOLVED (§11).**
```

---

## 11. Engine-internal rr-* rename (executed)

The disclosed engine-internal residue from §10 was fully renamed (not left). The
critical pre-check: **all 32 `rr-*` tokens were comments — zero string literals
or identifiers** — so renaming carried no runtime risk; the live identifiers
(`CONVERGENCE_GUARDS`, the module, the enums) were renamed atomically with
verification between each stage.

- `rr-A`..`rr-G` (comments, **and** the `solver-quests.md` doctrine labels + the
  generated `rules.json`) → `LG-A`..`LG-G` (Loop Guard).
- `CONVERGENCE_GUARDS` → `LOOP_GUARDS` across 6 files (reconciles the doc, which
  the neutralization had already moved to `LOOP_GUARDS`); guard sub-keys unchanged.
- Module `convergence-guards.js` → `loop-guards.js` + its 4 importers.
- Comment phrasings "Convergence-FORCING"→"Stall-forcing", "convergence gates"→
  "loop-stability gates", "distributed harness reports"→"scenario reports".
- Enums: `THEORY_LAYER_TOPOLOGY='topology'` → `THEORY_LAYER_STRUCTURE='structure'`
  (kept in sync with the `work-package-schema.js` vocabulary mirror); `'publication'`
  keyword → `'propagation'` (theory.js + decision-boundaries validator).
- `scenario-harness.js` probe: origin report-schema field/tag names neutralized
  (`missingPublishedCount`→`pendingItemCount`, `prioritySpreadPending`→
  `workImbalancePending`, `priorityRecoveryInvariants`→`scenarioInvariants`,
  `publication_converged`→`items_settled`, `priority_spread_settled`→`work_balanced`)
  + a header note that the schema is an adaptable example.

**Bonus robustness fix found while testing:** `guideline-check-shared.js` crashed
with ENOENT when a conventional scan dir (`src`/`scripts`/`test`) was absent — fatal
for a fresh project. Now skips a missing scan root gracefully. Also wired
`audit:constant-names` to pass a `src` path (the checker requires one).

**Verification:** all 59 tooling JS files parse; the full engine lifecycle
(`new`/`status`/`health`/`report`) runs; the renamed probe runs; the layer-enum
vocabularies stay in sync; packs regenerate with zero drift. **A whole-bundle scan
(excluding EXPORT-PLAN.md/NOTICE) is now ZERO** for every distributed term *and*
`rr-`/`CONVERGENCE_GUARDS`/`convergence`. No residue remains.
