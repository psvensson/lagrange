# LLM Ergonomics Improvement Plan (WS8–WS12)

Status: IMPLEMENTED + VERIFIED (adversarial subagent passes on both the plan and
the implementation, 2026-06-15; no workstream invalidated). Author: analysis of the
working model + work of 2026-06-15.

> Implementation note: WS8–WS12 shipped. Deferred by design: WS8.1 (normalize a
> `### STATE` block onto all 38 CL records) and the CI `--check` drift guard that
> depends on it; the board works today via a tolerant parser that reads the
> authored index as current status and flags the 10 drifted records as the WS8.1
> worklist. Memory consolidation (WS12) removed the retracted entry and pointed the
> convergence handoff at the new board; deeper merging of the convergence-memory
> cluster was left to avoid losing hard-won findings.

> Corrections from the verification pass are marked **[V]** inline. The
> load-bearing one: **all closure-ledger paths are under
> `.kiro/specs/membership-lifecycle-placement-hard-cutover/`** — the bare
> `closure-ledger.md` / `closure-ledger/CL-###.md` paths in an earlier draft were a
> shorthand and are corrected throughout WS8. (Ignore the stale duplicate copies
> under `.claude/worktrees/…` and `.stryker-tmp/…`.) Two more: the gate's feasible
> stale-source hook is the **log grep**, not a report field (WS10); and tests run
> under **`tap`**, so the repro runner must invoke `tap` (WS11).

This is **Phase 2** of the process work begun in
[`llm-dev-process-improvement-plan.md`](llm-dev-process-improvement-plan.md)
(WS1–WS7). That plan targeted the *convergence/bugfix loop*; this one targets the
two largest remaining LLM taxes the first plan did not address: **boot/context
cost** (how many files an LLM must read before it can act) and **loop latency**
(how long until a candidate fix is falsified). Each workstream below was grounded
in concrete `file:line` references gathered before writing; corrections found
during grounding are marked **[G]** inline (the same convention WS1–WS7 used for
its `[V]` verification corrections).

The headline grounding corrections, up front, because they shrink the work:

- **[G] WS10 is small, not large.** `scripts/rolling-restart-stat-gate.sh` ALREADY
  force-removes `ddb-test-reuse-*` containers (`:41`), computes `SRC_FP` (`:46`),
  and detects `"Stale source detected"` counting `staleSourceRuns` (`:96-98`). It
  simply does NOT abort — stale runs are silently folded into the distribution and
  reported (`:177`). WS10 makes the existing detection **load-bearing**; it does not
  build new machinery.
- **[G] WS11 must NOT build a simulator.** Two in-process deterministic harnesses
  already exist — `test/distributed/harness/deterministic-simulator.js` (441 lines:
  fake-clock, partition/heal, message delivery, replay, trace-minimization) and
  `test/convergence/deterministic-convergence-harness.js` (fake-clock, invariant
  registration). Recent CL fixes already ship deterministic tests (CL-035
  `test/control-plane/cl-035-voter-ready-row-seed.test.js`, CL-038
  `test/rebalancer/cl-038-source-removed-handoff-terminalizes.test.js`, RED-ON-REVERT
  proven). The closure-grammar `reproduced` rung (`closure-grammar.md:117-138`)
  already MANDATES a deterministic repro before `fix_in_progress`. The gap is
  *systematization and discovery*, not construction. (Heeds
  `[[research-existing-mechanisms-first]]`.)
- **[G] WS8 has a prerequisite.** WS3's machine-readable `### STATE` header exists on
  **CL-001 only**; CL-033/037/039 still use the old inline `- Status:` format. A
  board parser needs the STATE block normalized across all 38 records (or a tolerant
  inline fallback).

Sequencing rationale: WS9 + WS10 are the cheapest and pay back every session (one is
a doc/tooling fix, one makes a latent guard real). WS8 and WS11 are medium and remove
the two structural taxes. WS12 is hygiene, independent of the rest.

| Order | WS | What it removes | Size | Risk |
|------|-----|-----------------|------|------|
| 1 | WS10 fail-close gate preflight | wasted gate wall on stale/perturbed runs | S | low |
| 2 | WS9 rule lookup + index | a cited-but-unreadable 137KB dead-end | S | low |
| 3 | WS8 generated frontier board | boot fan-out across ~6 docs + a drifting index | M | low |
| 4 | WS11 systematized deterministic repro tier | ~50-min docker verdicts for fixes a unit test could falsify | M | low |
| 5 | WS12 recall-memory hygiene | stale background context that misleads | S | low |

---

## WS8 — Generated frontier board (collapse boot fan-out to one call)

**Recommendation #1.** Largest boot-cost reducer.

### Problem statement (grounded)
**[V] Base path for this whole workstream:**
`.kiro/specs/membership-lifecycle-placement-hard-cutover/` — the index is
`<base>/closure-ledger.md` and records are `<base>/closure-ledger/CL-###.md`.

To learn "where is everything right now," an LLM reassembles state from four places:
the `convergence-work-handoff` memory (prose), the ledger index
`<base>/closure-ledger.md` "Status Summary" table (`:21`, heading), 38 per-CL
`<base>/closure-ledger/CL-###.md` files, and the `ledger:`/`fix:` commit stream. The
quest half is partly served by `node scripts/solve.js portfolio`
(`scripts/solve/portfolio.js:143`, `runPortfolioCommand` → `buildPortfolio` →
`renderPortfolio`), but **nothing aggregates the CL closure frontier**, and:

- **[G] The index table is hand-maintained.** Grep found no script that writes
  `closure-ledger.md`; every row is added by a human `ledger:` commit, so it drifts
  from the per-file STATE.
- **[G] STATE blocks are not uniform.** Only `CL-001.md:3` has the WS3 `### STATE`
  header. `CL-033/037/039` use inline `- Status:` / `## GATE VERDICT` headers. A
  parser must tolerate both, and the records should be normalized.

### Concrete steps
1. **Normalize STATE across all CL records (prerequisite, finishes WS3).** Add a
   `### STATE` block to every `<base>/closure-ledger/CL-###.md` containing at minimum:
   `status`, `concern`, `firstViolatedInvariant`, `authoritativeOwner`, `lastGate`
   (ts + verdict), `liveHead` (boolean/marker for the binding frontier),
   `nextFalsificationStep`. Mechanical doc surgery; preserve all narrative below the
   existing `## LOG`/`## GATE VERDICT` headers (move, don't rewrite).
2. **`scripts/closure-ledger-state.js` — tolerant read-only parser.** Extracts the
   STATE fields from each CL file; falls back to a regex over `- Status:` for any
   record not yet normalized (so the board works during the WS8.1 migration). Returns
   `[{id, status, concern, firstViolatedInvariant, owner, lastGate, liveHead, nextStep, file}]`.
3. **Regenerate the index from STATE + add a drift check.** A `--write` mode rebuilds
   the `<base>/closure-ledger.md` Status Summary table from parsed STATE; a `--check`
   mode exits non-zero if the committed table differs from the generated one (CI guard
   so the index can never silently drift again). **[V] HARD ORDERING:** the `--check`
   guard MUST NOT land until WS8.1 has normalized all 38 records and humans have
   stopped hand-editing the table — otherwise it red-CIs every future `ledger:`
   commit. Nothing else consumes the table's format (verified: only the file itself
   references "Status Summary"), so regenerating it is safe once 8.1 is complete.
4. **`node scripts/solve.js frontier` (new subcommand).** Add `cmdFrontier(root,args)`
   to `scripts/solve.js` (registry `:516-536`) delegating to a new
   `scripts/solve/frontier.js`. Prints ONE screen:
   - **(a)** the live/binding CL (the record whose STATE marks `liveHead`) with its
     full STATE block,
   - **(b)** a compact table of all non-`guarded`/non-closed CLs (`open` / `narrowed`
     / `reproduced` / `fix-landed`),
   - **(c)** open quests with `doneWhen` status — reuse `buildPortfolio(root)`
     (`portfolio.js:97`) + `projectState` (`store.js:279`),
   - **(d)** the last gate verdict + ts (from the live CL's `lastGate`).
   This collapses the per-session reassembly into one tool call.

### Guard / verification
- A fixture ledger dir with two CL files (one normalized, one inline) → `frontier`
  parses both; `--check` passes when the index matches and fails when a row is
  edited. Snapshot test under `test/scripts/`.
- `closure-ledger.md` regenerated == committed (drift check green in CI).

### Effort / risk
Medium. Risk: low — read-only generator + doc normalization; the only non-trivial
piece is normalizing STATE across 38 files (WS8.1). No `src/` change.

---

## WS9 — Make `rules.json` reachable (retire the cited dead-end)

**Recommendation #2.**

### Problem statement (grounded)
`AGENTS.md:42` and `.kiro/steering/llm/README.md:28` both cite
`.kiro/steering/llm/rules.json` as the lookup for "Rule IDs and source citations,"
but it is **137 KB / 260 rules** — it truncates on a single `Read`, so an LLM sent
there cannot load it. Each rule is
`{id, domain, strength, tags, rule, score, sources:[{file,line,section}]}` (**[V]**
`score` field included; generator: `scripts/generate-steering-llm-pack.js`, emitted
by `npm run steering:llm:pack`).
**[G] No lookup tool exists** — grep of `scripts/` and `package.json` found none.

### Concrete steps
1. **`npm run rule -- <query>` → `scripts/lookup-rule.js` (read-only).** Loads
   `rules.json`, filters, prints matching rules WITH their `sources`. Sub-1k-token
   output for a single rule. Support `--id ARCH-0001`, `--tag cdc`,
   `--domain testing --strength must_not`, and a free-text substring over `rule`.
2. **Emit a compact index from the generator.** Extend
   `generate-steering-llm-pack.js` to also write `rules-index.md` (or `.json`): one
   line per rule — `id  strength  domain  <first 80 chars>` — ~260 lines, loadable in
   one `Read`, each pointing to full text via `npm run rule -- --id <id>`. Wiring it
   into the generator means it cannot drift from `rules.json`.
3. **Fix the pointers.** Update `AGENTS.md:42` and `README.md:28` to point at
   `npm run rule` + `rules-index.md`, with an explicit note that `rules.json` is
   generator output, not a `Read` target.

### Guard / verification
- `npm run rule -- --id <known-id>` returns exactly that rule + sources.
- Generator asserts `rules-index` line count === `rules.length` (no silent drop).

### Effort / risk
Small. Risk: low — new read-only script + generator addition + doc edit. Run
`npm run steering:llm:pack` after, per the standing pack-refresh rule.

---

## WS10 — Fail-close gate preflight (make the latent guard real)

**Recommendation #3.**

### Problem statement (grounded — SHARPENED)
The three landmines CLAUDE.md says "repeatedly cost agents large amounts of time"
(stale containers, debug-logs observer effect, single-run conclusions) are partly
guarded already, but the guards **warn instead of abort**:

- `scripts/rolling-restart-stat-gate.sh` force-removes `ddb-test-reuse-*` containers
  (`:41`) and networks (`:42`) every iteration, and computes the working-tree
  `SRC_FP` (`:46`).
- The boot self-check recomputes the fingerprint in-container and sets
  `srcFingerprintMatches` (`src/index.js:705-720`, env `SRC_FINGERPRINT`,
  `src/diagnostics/source-fingerprint.js:73-93`).
- **[G] But stale runs are not fatal.** The gate greps `"Stale source detected"` and
  counts `staleSourceRuns` (`:96-98`), then **folds those runs into the statistical
  distribution and only reports them** (`:177`). A stale-code run silently pollutes a
  verdict.
- **[G] Debug-logs is stamped, not guarded.** `debugLogs` is recorded into the report
  (`:149`) but `LAGRANGE_DEBUG_LOGS` / `LAGRANGE_CAPTURE_LOGS`
  (`cluster-class-lifecycle-base.js:423-426`) being set on a measurement gate is not
  refused — and that mode perturbs convergence (`[[debug-logs-observer-effect-on-seed]]`).
- **[G] No `npm run gate` alias** — operators invoke the `.sh` directly, easy to call
  a one-off run that skips the wrapper's cleanup entirely.

### Concrete steps
1. **Fail-closed container preflight.** After `clean_containers`, re-query
   `docker ps -aq --filter name=ddb-test-reuse-`; if any remain, `exit` non-zero with
   a clear message (cleanup failed — do not measure on leftovers).
2. **Stale-source HARD FAIL.** When the existing `"Stale source detected"` grep fires
   (`:96`), **abort the gate** (non-zero exit) instead of incrementing
   `staleSourceRuns` and continuing (`:177`). **[V] Use the log grep as the hook, NOT
   a report field** — `srcFingerprintMatches` lives on per-node boot log lines
   (`cluster-class-lifecycle-base.js:1022,1111-1115`) which the harness collapses into
   the stderr `"Stale source detected"` string (`:1038`); the per-run report JSON does
   not carry `srcFingerprintMatches`. (`src/index.js:808` already reacts to
   `=== false` at boot — a separate, real signal.) **[V] The abort path MUST run
   `clean_containers` (and the network cleanup at `:42`) before exiting** — the gate
   only cleans at the *start* of each iteration and the `trap … EXIT` removes the temp
   config + ndjson, NOT docker resources, so a naive mid-gate `exit` would strand
   `ddb-test-reuse-*` containers and trip WS10.1's preflight on the next run.
3. **Debug-logs guard.** If `LAGRANGE_DEBUG_LOGS`/`LAGRANGE_CAPTURE_LOGS` is set,
   refuse to run a measurement gate unless `--allow-perturbing-logs` is passed
   explicitly. Print why (observer effect on the seed).
4. **`npm run gate` alias** → `scripts/rolling-restart-stat-gate.sh` as the single
   canonical entry, and on completion print the run dir + the read recipe:
   `zcat test-output/reports/.playback/<run>/.full-logs/rolling-restart/<node>.log.gz`
   (the gzipped default-mode path; NOT `node.ndjson`).

### Guard / verification
- Seed a synthetic run report with `srcFingerprintMatches:false` → gate exits
  non-zero (test under `test/scripts/`).
- Invoke with `LAGRANGE_DEBUG_LOGS=true` and no override → aborts before any docker
  run; with `--allow-perturbing-logs` → proceeds.
- Normal clean invocation still completes and writes
  `test-output/reports/stat-gate-<ts>.{json,md}` (`:32-36`).

### Effort / risk
Small (bash + one npm alias + a guard test). Risk: low — converts soft-warn to
fail-close. Expected side effect: previously-silent stale/perturbed runs now abort
loudly. That is the intent; it may surface latent flakiness in how containers are
torn down, which is worth knowing.

---

## WS11 — Systematize the deterministic repro tier (the loop-latency win)

**Recommendation #4.** Biggest loop-latency reducer.

### Problem statement (grounded — SHARPENED, near-miss avoided)
The docker stat-gate is the dominant cost: N≥8 × ~400s ≈ 50 min per verdict, and
today several fixes were *inert* (WS5 reverted; CL-001 variant A engaged 0/8) — gate
wall spent to discover a fix never fired. The cheap-falsification model already
exists and is partially practiced; the gap is that it is **ad-hoc and undiscoverable**,
not absent:

- **[G] The substrate already exists.** `test/distributed/harness/deterministic-simulator.js`
  (fake-clock `:69-71`, `partition`/`heal` `:159-173`, `send`/`deliver` `:175-251`,
  `runUntilIdle` `:253-269`, `replayDeterministicSimulation` `:366-407`,
  `minimizeDeterministicTrace` `:409-430`) and `test/convergence/deterministic-convergence-harness.js`
  (fake-clock, `registerInvariant` `:49-62`, convergence artifacts `:106-110`) are
  in-process, sub-second, docker-free.
- **[G] The rung already mandates it.** `closure-grammar.md:117-138` forbids entering
  `fix_in_progress` until `reproduced` = (a) a deterministic targeted repro OR (b)
  measured recurrence; `reproducedBy:` records the branch.
- **[G] Recent fixes already do it** — but scattered: CL-035's test lives in
  `test/control-plane/`, CL-038's in `test/rebalancer/`, with no uniform name, no
  CL→test map, and nothing that CHECKS a `reproduced` record actually has a
  red-on-revert test before its fix lands.

So the gap is three missing conventions, not a missing harness.

### Concrete steps
1. **Document the substrate as canonical** (`docs/deterministic-repro-tier.md` + a
   `closure-grammar.md` pointer): when authoring a branch-(a) repro, use
   `deterministic-simulator.js` for topology/messaging invariants,
   `deterministic-convergence-harness.js` for heartbeat/CDC/readiness invariants, and
   a service-level unit test (the CL-035/038 pattern) when the invariant is local.
   This is the `[[research-existing-mechanisms-first]]` capture so the next agent does
   not rebuild a third simulator.
2. **One discoverable repro per CL.** Establish `test/closure/CL-###.repro.test.js`
   naming and require `reproducedBy:` to point at it. Adopt CL-035/CL-038's existing
   tests as the first exemplars (reference them from the new map; only relocate if
   low-risk).
3. **`npm run repro -- CL-###` runner** → runs the matching
   `test/closure/CL-###.repro.test.js` in sub-second, so a candidate fix is falsified
   *before* paying for the docker gate. **[V] The runner MUST invoke `tap`**
   (`tap test/closure/CL-$1.repro.test.js`), not `node --test` — the repo's test
   runner is `tap` (v21.5.0; `npm test` → `tap`), so a bare `node` invocation would
   bypass the harness/reporters. (A new `repro` script has no `prerepro` hook, so the
   `pretest → audit:state-machine-pressure` step does not fire — runs stay sub-second.)
   Add a warn-only checker: every CL whose STATE is `reproduced`|`fix-landed` should
   have a repro file (escalate to hard-fail later).
4. **Close the loop with WS10:** the gate preflight prints "run `npm run repro -- CL-###`
   first?" naming the targeted CL.

### Guard / verification
- `npm run repro -- CL-035` is green on HEAD and **red on the fix revert**
  (`e76f0ac0`); CL-038's test already proves RED-ON-REVERT — reuse as the pattern.
- The warn-only checker lists any `reproduced`/`fix-landed` CL lacking a repro file.

### Effort / risk
Medium — mostly convention, docs, and a thin runner; the harness exists. Risk: low.
**Explicit: do NOT build a new simulator** — the two existing harnesses are the
substrate (recurring parallel-mechanism warning across the memories).

---

## WS12 — Recall-memory hygiene (stop stale background context misleading)

**Recommendation #5.** Operates on the user's `~/.claude` auto-memory, not the repo.

### Problem statement
The recall index (~25 entries) carries drift. Recalled memories surface as background
`<system-reminder>` context and can mislead when stale (the harness itself warns to
re-verify any file a memory names):

- At least one RETRACTED entry: `owner-driver-dead-after-runtime-handoff` (its
  correction already lives in `leader-backpressure-logs-table-storm`).
- 4–5 overlapping convergence/ledger pointers: `convergence-work-handoff`,
  `closure-ledger-now-per-file`, `cutover-structures-and-closure-ladder`,
  `membership-centralization-already-designed`, `leader-backpressure-logs-table-storm`.

### Concrete steps
1. Delete the RETRACTED entry from the memory dir and its `MEMORY.md` line.
2. Consolidate the convergence cluster into ONE canonical `convergence-work-handoff`
   that points at the WS8 `node scripts/solve.js frontier` board as the live-state
   source of truth; reduce the others to a one-line cross-link or merge their unique
   facts in. Keep each fact in exactly one place.
3. Add a standing line to the handoff: "Live state = `node scripts/solve.js frontier`.
   This memory is orientation only; re-verify file/flag names before acting."

### Guard / verification
- `MEMORY.md` index has no RETRACTED entry and one convergence-handoff pointer.
- Word-count diff before/after confirms unique facts were merged, not dropped.

### Effort / risk
Small. Risk: low — information-loss; mitigate by merging (not deleting) facts. WS12.2
forward-references WS8, so do it after (or alongside) WS8.

---

## Dependencies & sequencing

- **WS8.1 (STATE normalization)** unblocks WS8.2–8.4 and is the only non-trivial doc
  effort here.
- **WS12.2** points at WS8's board → do WS12 after WS8 (or land WS12 with a forward
  reference).
- **WS10.4** hint references WS11's `npm run repro` → loosely couple; either order
  works, WS11 first makes the hint live.
- **WS9, WS10** are independent and should land first (smallest, highest per-session
  payback).

## Open questions (for the verifier)
1. WS8: store `liveHead` as a STATE field, or derive it (e.g. the single non-guarded
   CL the handoff names)? A field is explicit but is another hand-maintained bit.
2. WS8.3: is replacing the hand-maintained index table acceptable, or should the
   generated table live in a sibling file (`closure-ledger.generated.md`) to avoid
   churn in the human-edited index?
3. WS11.2: relocate CL-035/038 tests into `test/closure/` (uniform, but git churn +
   touches passing suites) vs reference-in-place (less clean, zero churn)?
4. WS9: index as `.md` (LLM-loadable in one Read) vs `.json` (machine-queryable) —
   or both?
