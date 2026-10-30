---
scope: testing
status: canonical
always_load: false
source_of_truth: self
last_reviewed: 2026-10-30
---

> **Canonical source.** Scenario and release-gate Quest proof policy. Index:
> [`INDEX.md`](INDEX.md).

# Testing - Scenario And Release-Gate Quests

## Documentation-Only Changes

Documentation-only planning, roadmap and policy changes require the relevant
documentation, rule-set, roadmap, link and generated-consistency checks, plus
review against their canonical owners. They do not require runtime,
distributed, soak or full-system execution merely because they describe those
systems or future acceptance requirements. Existing evidence remains attributed
to its actual source and configuration, and unsupported capability or support
claims remain explicitly unverified. Adopting documentation does not discharge
sealed feature or release acceptance or create a new whole-corpus receipt.
Any accompanying change to runtime behavior, executable harnesses or enforced
acceptance predicates retains its own applicable proof requirements.

## Separate Acceptance Claims

Keep these verdicts explicit in existing Quest and epic evidence:

| Claim | Required evidence | What remains open |
| --- | --- | --- |
| Bounded causal repair | The named invariant and real owner path, focused regression, affected consumers, applicable guards, and independent review of the candidate. | Other scenario causes and wider service or release acceptance. |
| Representative distributed service milestone | The named workload through the real public WASI service entry path on the declared distributed topology, including failure and recovery behavior. | Stable-core and release requirements outside that envelope. |
| Stable core or release acceptance | All authoritative acceptance and exact-candidate release requirements, including required configurations, fault domains, resource bounds, and statistical or soak evidence. | Nothing may be inferred from a smaller milestone alone. |

The representative service scenario guides which repair matters next. It does
not become every repair's `doneWhen`. Name the originating scenario and causal
blocker in the repair record, and seal a probe that measures that bounded repair.
An independently proved repair can close and integrate while the scenario still
fails for a different, recorded cause. Preserve its regression as part of the
cumulative proof; the scenario and release verdicts remain failing or incomplete.

If a Quest already promises the whole scenario, keep that promise until it is
met or explicitly superseded through the existing lifecycle. Do not relabel a
failing scenario as a passing repair after measurement. Repeated migrations of
the dominant blocker prompt a causal reassessment by the current author,
reviewer, and integration owner, not an automatic architecture task.

A shared-contract repair includes its affected status, diagnostics, admin,
harness, and reporting consumers. The work is bounded by the changed contract
and reachable consequences, not by an obligation to repair every historical
defect encountered during review.

## Evidence Ceilings

For each acceptance claim name the source/candidate, configuration, workload,
entry path, production owners, dependency and test versions, execution substrate,
and artifact. Report safety, recovery progress, and resource behavior separately.
State the finite-failure assumptions under which progress is expected, and show
both retained obligations during refusal and useful work after the blocker clears.

Deterministic tests prove the exercised mechanism and ordering. Native tests
exercise the real runtime and dependencies. A physical distributed run can prove
the named network, process, host, and storage failure domains actually used.
Several processes or containers on one host do not establish independent host
failure evidence. None of these layers silently substitutes for another.

Use an existing supported configuration when it supplies the needed workload.
If a capability is proposed for exclusion, first compare completing it with
excluding it safely: inspect public, internal, and background reachability,
refusal before admission, and retained obligations across restart. A declaration
that a feature is out of scope, or a new test-only product mode, is not exclusion
proof. The integration owner records the supported envelope without weakening
the authoritative stable-core or release bar.

## Fixture Versus Runtime Proof

If a fixture or harness contract was wrong, fix it and prove why. If the fixture
contract was correct, the next repair targets the runtime owner that produced
the failure. Retain the first failure and classify product, fixture/harness,
verifier, and execution-unavailable causes separately. A broken fixture or
unavailable worker is inconclusive about product behavior; a correctly measured
product failure stays a failure even if it occurs before the repair's target
path. Record whether the target engaged and retain valid target-phase evidence.

Classification without a runtime fix is valid only when the existing record
contains the focused command, evidence path, reason a runtime repair is not
justified or cannot continue, and responsible owner with next action or truthful
terminal disposition. It cannot turn an unresolved product failure into a pass.

## Representative Rerun Order

Use this order for scenario-driven work:

1. Focused regression through the real owner path, including a meaningful
   red-on-revert control when it can discriminate the defect.
2. Static guardrails relevant to that boundary and affected consumers.
3. Shared unit or dependency gates required by the selected change proof.
4. Native, physical, or representative service evidence when the claim needs
   that layer and the target path is ready to measure.
5. Statistical certification only when the metric requires it.
6. Current Quest evidence, independent review, and landing steps.

The expensive non-deterministic statistical gate is reserved for claims that
need statistical evidence. It follows deterministic mechanism proof and never
becomes the routine repair loop. Necessary native or physical service evidence
has its own ceiling; it is not prohibited merely because its question is not a
pass rate. The statistical policy, allowed categories, preflight, sealed metric,
and N calibration remain single-homed in
[`operational-ground-truth.md`](../distributed/operational-ground-truth.md).

## Proof Must Reach The Binding Observable

A deterministic repair proof must reach the production owner and the observable
its contract promises. A test of a new helper's return value is insufficient
when production cannot reach it. Trace the real entry path and use a
red-on-revert witness at the actual seam; label source-only reachability arguments
as such. A deterministic fixture does not establish real in-cluster behavior
merely by giving its values the same names.

Before measuring an aggregate improvement, show that the repaired mechanism
engages and changes its intended observable. Retain separate verdicts for
mechanism correctness and for measured service or statistical improvement. If
the live target never engages, preserve the outer result, name the blocking
cause, and route the next repair; do not rerun unchanged to seek a passing sample.

## Major Feature User Journeys

Every major feature has a tangible, credible user journey as part of the
feature. It is complete only when a user can achieve the stated useful outcome
through a supported public entrypoint and real production composition on an
identified candidate. A major feature is an externally claimed product
capability or a product roadmap outcome, not every helper, refactor or bounded
causal repair. Research and documentation use acceptance appropriate to their
actual deliverable; they do not invent a product journey.

Define the journey in the existing owning specification before implementing a
major capability. Keep application code and ordinary user steps distinct from
harness orchestration. The specification and its existing Quest evidence name:

1. The user, useful outcome, declared prerequisites and supported configuration.
2. A reproducible invocation through the supported installed CLI, PostgreSQL
   wire, lifecycle SQL, public HTTP or documented subscription surface.
3. The real production factories and owners reached. Observation and named
   fault injection are allowed; fixtures cannot supply missing runtime wiring,
   seed internal authority, replace the feature mechanism or require
   undocumented private preparation. Public setup consumes the supported
   lifecycle/configuration owner rather than bypassing product admission.
4. A business result checked by an oracle independent of the mechanism under
   test, and evidence that the feature engaged in that execution. At least one
   positive witness contains the expected business effects; empty output is
   valid only when the oracle expects it. Catalog presence, a separate plan
   explanation or result parity alone cannot prove an access path was used.
5. A meaningful negative control and the concurrency, interruption, restart,
   topology or pressure behavior relevant to the claim. The control changes,
   disables or reproduces the pre-repair behavior at the real seam and makes
   the named acceptance assertion fail. A measured pre-repair or red-on-revert
   witness can be reused. An edge-case input alone is not automatically such
   a control; import, setup and missing-method failures do not discriminate the
   target behavior.
6. Honest refusal or uncertainty while a finite fault persists, preserved
   obligations, useful successor progress after it clears, and bounded cleanup
   even when the main journey fails. Record the actual affected owner, process,
   incarnation or durable-state transition: a no-op restart callback and equal
   snapshots do not demonstrate recovery. Across a lifecycle/topology change,
   exercise stale work and the owner's refusal or reconciliation, followed by
   fresh authorized work. Separate safety, progress and resource conclusions.
7. Source and dependency/runtime versions, actual artifact identity when
   applicable, topology/fault domains, invocation, result, original evidence
   and evidence applicability. Descriptive fixture metadata does not establish
   which artifact ran. Source processes or reused checkout dependencies do not
   prove installed-consumer usability; several processes on one host do not
   prove independent-host failure tolerance.

The journey is maintained with the feature. A semantic, packaging, startup or
owner-interaction change reruns the affected journey or establishes applicable
evidence through the current proof owner. Retain genuine CDC/receipt fields,
identity and deadline/ordering semantics when using controlled substitutes.
Bounded queues, replay, explicit reset or typed termination may satisfy the
declared pressure contract; silent loss of acknowledged obligations cannot.

Select one credible successful journey per capability and a bounded set of
shared owner-boundary witnesses. Reuse setup and unaffected evidence; do not
take the Cartesian product of distributions, key types, topologies and faults.
Keep a composed witness for the combination actually claimed. Use the existing
specifications, Quest records, proof authority and harnesses, without a second
acceptance ledger, test framework or approval stage. The measuring probe reads
retained evidence; execution remains in the attempt/harness.

A bounded repair may close and integrate before the whole feature journey
passes, with its remaining blocker and owner recorded. The broader journey does
not replace that repair's sealed predicate. A useful refusal is part of the
journey and cannot replace its promised successful outcome. Removing promised
scope requires an explicit product decision and safe exclusion across public,
internal, background and recovery paths; a dormant flag or alternate runtime
cannot manufacture completion.

Apply this requirement to the current milestone and newly completed or changed
major features. Reconcile existing advertised capabilities through the canonical
[capability source](../../docs/current-capabilities.json) and existing owners.
Credit applicable evidence, correct unsupported current claims, and assign
missing journeys a specific owner and version. This bounded reconciliation does
not silently make every historical capability a new correction-release gate or
require a whole-project rewrite.

## Static Gate Baselines Are A One-Way Ratchet

Committed static-gate baselines — the `BASELINE_COUNT` constants in
`scripts/check-complexity.js` / `scripts/check-cognitive-complexity.js`, the
file-size baselines in `scripts/check-file-size-thresholds.js`, and
known-violations files such as `.dependency-cruiser-known-violations.json` —
MUST NOT increase, with the single re-anchor exception below.

- An upward re-anchor MUST satisfy all of: the gate was silently red (never
  ran clean before), it happens at most once per gate, it anchors at
  measured reality, and the same commit records BOTH a dated in-code comment
  naming the measured value and the refactor target (the existing idiom) AND
  a decision-log entry in the owning epic.
- Do not treat a baseline increase lacking both same-commit artifacts as a
  judgment call; it is a guideline violation.
- Tighten a baseline in the same change that removes violations whenever the
  measured count drops below the committed one.

When a delegated worker reviews a scenario Quest, compare current evidence with
the sealed claim and recorded findings. Consolidate scoped findings with their
invariant, reachable path, and evidence; the Solver owns terminal status. The
integration owner updates the existing epic's current summary with the candidate,
first blocker, evidence ceiling, next action, and actual continuation owner.
