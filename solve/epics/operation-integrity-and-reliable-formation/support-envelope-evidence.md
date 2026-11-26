---
audience: agent
documentClass: planning
status: proposed
---

# Support-envelope defaults and execution admission: bounded proposal

Prepared 20 November 2026 for programme item 07 under the existing open
`quest-evidence-and-candidate-binding` owner. Investigation source:
`6c0bdff11f24e32459178e9d2c0d9f563e7cd790`, rule-set revision 5. The source investigation led to a managed negative witness.
The existing [evidence Quest log](../../quests/quest-evidence-and-candidate-binding/log.ndjson)
records its independent review and original execution. The recorded WIP
included the bounded admission repair in the support-envelope, management and
rolling-upgrade owners. The design below records that original assignment.
Consult [current work](../operation-integrity-and-reliable-formation.md#current-work)
for reconciled source, assignments and remaining qualification.

Loaded sources: AGENTS, rules/router, Quest workflow, artifact custody owner,
the investigation/navigation skills, current operation-integrity summary and
the concrete source/records below. Navigation used source/Git reads; no successful
Serena invocation is claimed. One writer must own this coupled contract and its
fixtures. The author of this note cannot independently approve its implementation.

## Current review of the WIP admission path

At `8f446cc0f` the management and rolling-upgrade entrypoints reject
policy-only data. Their seven selected managed files passed on tv-dator.
No qualifying five-drill archive or deployed release binding was found.
[Seven managed source files](https://github.com/psvensson/lagrange/releases/download/solve-evidence/quest-evidence-and-candidate-binding--support-policy-and-management-8f446-nov20.tar.gz).

The changed management tests also call `RollingUpgradeOwner.initiatePlan`
directly. That method accepts an omitted support binding and invokes drain
and restart. These cases cover workflow sequencing. They cannot establish
admission before the first effect. Production calls the method from
`startUpgrade`. On reconstruction, `resumeFromPersistedState` restores
the saved plan and `beginNextNodeDrain` can issue a subsequent effect.
The evidence owner must cover both entrypoints. Preserve the identity and
debt of a genuinely started operation, refuse a fresh effect derived solely
from an unbound plan, and distinguish the resulting hold from a completed
upgrade. Trace the actual persisted state supplied by management and the
release-preparation source of the recorded run before accepting this WIP.
Physical qualification remains with the pilot owner.
[Reviewed source](https://github.com/psvensson/lagrange/blob/8f446cc0fca629f68155dd6cc6873276e4e3d896/src/bootstrap/owners/rolling-upgrade-owner.js)
and [workflow tests](https://github.com/psvensson/lagrange/blob/8f446cc0fca629f68155dd6cc6873276e4e3d896/test/bootstrap/management-v1-l4-l3.test.js).

## Decision and acceptance boundary

SupportEnvelopeOwner owns whether an envelope authorizes a named upgrade or
recovery claim. The existing execution and evidence owners establish what ran;
SupportEnvelopeOwner must consume their admitted observations, not create them.
Policy configuration, simulated execution and physical certification are
different facts. A policy-compatible version pair is insufficient authority to
invoke a release transition advertised as supported.

The 0.4.1 correction removes manufactured execution and certification defaults,
rejects explicit synthetic records at the same boundary, and makes every
consumer present that distinction accurately. The five genuine physical drills,
actual old/new artifacts, named supported modes and pilot dependency acceptance
remain programme item 14 / pilot 0.5 obligations. No marker count, component test,
or policy-only pass discharges them. This bounded package also does not close the
whole evidence-and-candidate-binding Quest or general programme item 07.

## Source findings and first divergence

1. `src/bootstrap/owners/support-envelope-owner.js:503-547` builds five
   `executed:true` records with literal timings/bytes and dependencies marked
   `verified:true` with placeholder `sha256:<quest>-certified` strings.
   `buildSupportEnvelopeRecord` (581-593) installs these when input omits them.
2. `checkSingleDrillReceipt`, `isValidDependencyReceipt`, and
   `validateEnvelopeSnapshot` (608-710) consume self-asserted fields and a digest
   computed from the same supplied record. A self-consistent hash establishes
   content identity, not execution. Required drill-specific effects and numeric
   domains are not completely checked: for example, missing recovery duration
   does not exceed a bound, and negative lost-write counts pass the current
   greater-than-zero check. This is a validator contract finding, not evidence
   that a physical upgrade occurred or lost data.
3. `getManagementSummary` (752-777) calls all supplied drill keys certified even
   when overall validation fails. `ManagementV1Owner` also exposes raw supplied
   envelope data in release facts.
4. `validateVersionPairAdmission`, `evaluateRollbackEligibility`, and
   `validateMixedVersionNodeAdmission` use that same validator. RollingUpgradeOwner
   preflight and rollback therefore consume the synthetic certification if it is
   supplied explicitly. Removing only the default builder leaves this path open.
5. Credit the current default-null constructors. SupportEnvelopeOwner and
   ManagementV1Owner do not silently construct a certified envelope. The join
   handshake's exact integer cluster-format fence is separate and must remain.
6. `scripts/check-current-capabilities.js:327-333` currently requires
   `docs/support-envelope.json` to pass this certification validator. Its current
   JSON includes placeholders/literal drills and an mTLS protocol declaration;
   current capability data says node transport is plain WebSocket. This default
   declaration is not measured authenticated-transport support.
7. The distributed scenario uses simulated drain/restart callbacks, literal
   recovery records and an in-memory partition backup fixture. Its cluster
   argument only receives `reportDetail`. The unit test invokes it with `{}`
   and calls its output five certified drills. Running this source on physical
   hardware would not turn those callbacks into physical drills.

**Falsifiable hypothesis:** default or explicitly copied synthetic envelope
records can reach production support validation and management/upgrade consumers
as certified without original physical execution. The initial real-path red
must observe that behavior through the actual owners, not merely search markers.

## Finite producer and consumer census

| Role | Concrete surface and migration obligation |
| --- | --- |
| Policy/record producer and validator | `src/bootstrap/owners/support-envelope-owner.js`: builder, defaults, snapshot/digest, policy fields, drill/dependency checks, three admission functions, owner construction and management summary. One canonical interpretation. |
| Release effect consumer | `src/bootstrap/owners/rolling-upgrade-owner.js`: `isOutsideSupportEnvelope`, preflight, rollback; consume full admitted claim for exact artifacts/pair, not a raw asserted valid field. |
| Construction and public facts | `src/bootstrap/owners/management-v1-owner.js`: constructor lines 418-425, release section/facts, shared rolling owner. Preserve default-null, bind one validated snapshot and stop presenting raw drill claims as certified. Trace BootstrapAPI's existing construction and route tests to keep actual attachment covered. |
| Separate format authority | `bootstrap-join-admission-owner.js`, `resolveJoinSupportEnvelopeConflict` and cluster-format helpers: preserve exact format admission and own-property/single-read safeguards. Do not make ordinary same-build joins depend on a physical upgrade certificate. |
| Canonical declaration/checker | `docs/support-envelope.json`, `scripts/check-current-capabilities.js`, current capability source/generated page and operations/migration prose. Canonical JSON may declare policy without execution; checker must positively validate that narrower claim and refuse any unsupported physical assertion. |
| Simulation and classification | `test/distributed/scenarios/supported-upgrade-and-recovery-envelope.js`; `PILOT_CERTIFICATION_SCENARIO_MATRIX` in scenario-registry. Preserve useful policy simulation with explicit non-physical outcome; it must not fill the physical obligation or satisfy certification selection. Reconcile affected classification/impact metadata through existing generators. |
| Current marker guard | `scripts/checks/q12-supported-upgrade-and-recovery-envelope-guard.js`: source-presence check only. Do not reuse it as runtime certification or change the historical sealed probe to manufacture a new meaning. If migrated symbols/data change its source contract, record prospective applicability under the open owner. |
| Coupled fixtures | `test/bootstrap/support-envelope-owner.test.js`, `management-v1-l4-l3.test.js`, `management-v1-route-authority.test.js`, `release-version-fence.test.js`; scenario imports and callers; checker tests located by import/reference census before sealing. Their synthetic “certified” builders currently authorize unrelated management exercises and must be migrated coherently. |
| Evidence owner | `scripts/test-execution-report.js`, `scripts/proof-authority.js`, managed lab reports/collection, `scripts/solve/evidence-store.js`, and the existing Quest receipt adapter/probe. Reuse their validators and custody; no alternate execution-report schema, ledger, uploader or scheduler. |

The table is a source-reference census, not proof of absence of dynamic injected
callers. Recheck all builder/admission/summary references and constructor ports
before implementation review. Do not migrate only tests with “support” in their
filename; the management fixtures are actual consumers of the weak producer.

## Historical lineage and evidence ceiling

Q12 `supported-upgrade-and-recovery-envelope` sealed at
`228385ccb8354f415fa349bb34f5afc2e9e9158e`. Its 1 November record reports source
metric 7 to 0, 138 assertions and a terminal solved entry; its statement and
verification prose call the records five live drills. The inspected guard only
checks source strings. Preserve its quest, log, original receipt and seal. Append
the correction to the open evidence-and-candidate-binding owner and link Q12;
do not accuse intent, rewrite the original result, or reopen the closed record.

Git history includes original implementation `ed8618e6f` and subsequent integration
`73c06f635`; the latter includes the fail-closed format/runtime construction
improvements. Consume those protections. No same-host predecessor reproduction
has been executed in this investigation and no new-regression claim is made.

Related solved proof owners already teach this distinction:
`proof-receipt-bound-to-validated-execution` validates actual runner sections;
`lab-census-benchmark-evidence-custody` separates executed cases and actual
deployment bindings. Its benchmark admission functions are useful examples but
do not become a second upgrade authority. Their tests establish their own scope,
not these five drills. The open Quest explicitly retains those precedents and
already requires rejection of forged passed flags and marker-only success.

## Proposed contract and transition

### Policy is explicit; execution is never defaulted

Keep supported policy inputs (pair, format/schema/protocol/ABI, topology, rollback
cutoff and resource/time bounds) under SupportEnvelopeOwner. Retain defaults only
where they are policy defaults with units/domain validation. Do not default a
measurement, a proof identity, executed/verified success, dependency satisfaction,
or claimed deployed transport. Omitted evidence means missing evidence.

Recommend distinct owner results for policy validation and support admission,
using the repository's named-outcome conventions. A valid policy can be reported
as such while physical evidence is missing, simulated, incomplete, refused or
failed. A single overloaded `valid` must no longer mean both. Existing callable
API names may be migrated once, but no optional legacy arm may treat the old
shape as physical certification. The builder copies/freezes retained inputs and
does not mutate the original evidence.

The canonical JSON records policy and explicit unqualified status with no fake
drill results. Its digest binds only those bytes. If required drill IDs must be
listed, list them as policy obligations, not executed records. Remove synthetic
success-default functions from production. Useful simulation data stays in
test-owned fixtures and carries its actual substrate; it cannot create a
production admission result merely by setting `evidenceKind: physical`.

### Admission consumes original evidence through existing owners

Use a bounded adapter under the existing evidence/proof owner to materialize and
validate the original bundle. It must call `executionReportProblems` for actual
runner files/commands/phases and use the existing custody materializer to check
retained hashes/lengths. The support owner additionally checks the physical
claim against managed run metadata and drill-specific outputs. Never copy the
execution validator into the support owner or make runtime bootstrap import a
CLI and contact GitHub. Evidence collection/admission belongs to preparation;
runtime consumes its content-bound result through one explicit constructor port.

Required original binding includes: request/run identity; source SHA/tree and
proof inputs; actual old/new binary or image digests; runtime/native dependencies;
physical host identities/failure domains and topology; configuration/policy digest;
all required phases with original terminal statuses; write/request identities,
outcomes and reconciliation; actual elapsed/resource observations; raw output
references and verified hashes; cleanup. Match each dependency to its required
claim and applicable original proof, not to a nonempty digest or solved Quest ID.
Self-asserted hashes, `verified`, `executed`, counts or final summaries cannot
override contradicting originals. Wrong/missing metadata is unavailable evidence.

`test-execution-report.js` explicitly states that reports are producer records,
not signed attestations. `proof-authority.js` admits immutable source proofs;
those alone do not establish physical topology or a current support profile.
An existing genuine source proof may be consumed at its narrower scope, while
physical run metadata/output supplies the rest. This repair claims auditable
execution custody and admission, not security against a malicious host.

The precise runtime construction bridge must be frozen during implementation
design review: an admitted envelope must be bound to the exact policy, evidence
bundle and deployed artifact identities before the rolling owner receives it.
Do not accept an arbitrary caller-provided `{admitted:true}` object or turn an
unverified supplied JSON document into authority. The current production path has
no automatic certified-envelope loader; preserve that fact and default-null.
If the existing release/bootstrap attachment cannot supply verified evidence,
remain explicitly unqualified and route the missing attachment to its existing
owner. Do not introduce a token service, signing system, background verifier or
automatic network fetch. This is a concrete remaining design boundary, not a
claim that the current source already provides the bridge.

Full certification means all required drills/dependencies qualify for the exact
policy/artifacts. Partial measured drills may be listed as measured with their
own identities but never presented as the full certified envelope. Management
`certifiedDrillIds` must derive from admitted evidence; supplied keys on invalid
or simulated records yield no certified IDs. Expose the reason and next missing
owner/action. Pair/rollback/mixed-version support consumers use the same admission
result, retaining format and cutoff refusals before effects.

Reconstruction revalidates the retained bundle/policy/artifact binding through
the same construction owner; a cache boolean cannot survive as independent
authority. Missing/corrupt evidence refuses new support admission. This check
must not erase or reverse an upgrade operation already admitted and started:
its existing persisted operation and rollback-cutoff owner retain recovery.
Review whether recovery currently repeats preflight before making this migration;
do not strand an in-progress durable obligation by changing a display validator.

## Witnesses, proof route and stopping conditions

### Concrete construction choices for subsequent review

The actual chain is `BootstrapAPI(options.managementAdapters)`
(`src/bootstrap/bootstrap-api.js:216`) -> `getManagementV1Owner`
(`bootstrap-api-server-methods.js:324-333`) -> ManagementV1Owner -> its constructed
RollingUpgradeOwner. Production composition installs no physical adapters by
default. ManagementV1Owner already accepts `supportEnvelopeOwner`, but immediately
calls `getEnvelope` and forwards raw data, dropping any evidence admission
authority. Its other raw `supportEnvelope` constructor option reaches the same
path. Rolling persisted state records operations/artifacts but currently no
evidence-bundle/policy binding.

Recommended direction for the later contract review: retain a declared
SupportEnvelopeOwner collaborator through that existing constructor chain. Its
policy projection supplies diagnostics; its single admission operation supplies
the decision for the exact current/target artifact and policy. Remove raw JSON's
ability to authorize effects. The preparation-side existing evidence adapter
must resolve and validate original artifacts before constructing that owner;
reconstruction must repeat that binding from retained references. Missing
preparation remains unqualified, not an owner with a fabricated success answer.
This recommendation does not yet specify a trusted production loader: the
actual registered release/deployment attachment still needs to be selected and
reviewed before full implementation. Constructor injection alone is not that
proof, and an arbitrary caller-supplied admission callback is not acceptable.

An alternative is making the support owner validate a local complete original
bundle itself, using the existing execution validator through a deliberately
reviewed shared module boundary. That requires moving or exposing the existing
validator for runtime use and defining bounded I/O/lifetime; it cannot copy the
validator, import a CLI, or add network fetch during preflight. Prefer the
existing preparation/constructor route unless its actual production attachment
cannot be established. Neither choice authorizes an attestation service.

Preserve recovery: `resumeFromPersistedState` restores active operation/node
state without rerunning new-operation preflight; `executeRollback` presently
consults the envelope again. Review both when binding evidence references so
lost declaration availability cannot delete a started operation or invent
rollback eligibility past its durable cutoff. Do not retrofit a made-up proof
reference into historical persisted operations.

The official [SLSA build provenance structure](https://slsa.dev/spec/v1.2/build-provenance)
separates declared build inputs from builder invocation details and byproducts.
The useful analogy is binding a claim to its actual producer and original
execution, rather than accepting a digest of the claim itself. This proposal
does not adopt SLSA, assert SLSA compliance, add signatures or claim that build
provenance proves physical service behavior.

### Measured baseline

Managed request `3883b67b-2d12-459c-a08e-d8a5f64b4ebe` ran
`test/bootstrap/support-envelope-execution-evidence.test.js` on adam-laptop
at `58a208033`. The policy, default-null and same-build control passed.
Five negative cases failed. Default-built and explicitly rehashed synthetic
records produced certified claims, including admission through the real
rolling-upgrade and management constructors. The effect callbacks counted
drain and restart calls. The run did not restart a physical node.
[Original support witness output](https://github.com/psvensson/lagrange/releases/download/solve-evidence/strict-operation-outcomes--strict-outcomes-and-support-original-red-3883b67b.tar.gz).

Include an explicitly rehashed synthetic record so removing just defaults cannot
make the witness pass; malformed/missing evidence and failed overall validation
must not leak certified drill IDs. Keep before/after durable-operation checks
separate: refusal before admission must have no new effect, whereas interrupted
already-admitted work must retain the existing recovery obligation.

After the repair, discriminating controls cover wrong source/artifact/policy or
host identity; missing phases; zero executed assertions; skipped native/physical
work; corrupt raw output; forged passed fields; lost acknowledged writes;
invalid/missing/negative/nonfinite measurements; wrong drill identity; synthetic
callbacks and placeholder dependencies; missing cleanup where required. Restoring
the old default builder and restoring the weak admission consumer must each fail
the relevant witness. Do not generate expected decisions from the validator's
own table. The public checker positively accepts truthful policy-only JSON and
rejects unsupported support wording; it need not require certification to pass.

Policy simulation positives prove policy only. Existing unrelated management
tests may substitute a declared admission collaborator only at an explicit test
boundary; they cannot supply acceptance for that collaborator. At least one
production-construction negative must consume the real evidence admission path.
Do not add a production `allowFixture` option or globally weaken upgrade preflight
to preserve unrelated tests. Freeze the fixture/construction choice before edits.

A real, complete original execution bundle must remain admissible when available.
Test it through the same admission path, then corrupt individual bindings and
show refusal. A hand-authored schema example can test parsing, never supply that
positive execution claim. No qualifying five-drill original was established by
this investigation. Until one exists, leave physical-envelope acceptance open;
do not implement an unconditional rejection and call the entire admission path
complete. Generic original-run admission can be proved with actual current runs
at their own scope, without promoting them to upgrade evidence.

All execution uses managed lab requests and retained run identities. The open
Quest's existing test-receipt path may project these original results only through
its reviewed evidence adapter; its current `passed:true` probe alone does not
prove execution. Coordinate shared adapter/probe files with the strict-outcome
author; one writer owns that changing interaction. Preserve original red, distinct
non-measuring attempts and known-bad mutation identities. Seal/extend the bounded
unit through the existing workflow after genuine measuring red, without altering
Q12's sealed terms. Independent review covers source, proof admission and fixtures.

Stop the 0.4.1 correction when all censused consumers distinguish policy from
execution, real-path false-certification controls and policy positives pass,
affected gates pass, and current guidance is truthful. Record any still-unproved
genuine physical admission/attachment precisely; closing the correction cannot
close that broader claim. Programme item 14 separately freezes actual artifacts,
supported modes/topology/bounds and prerequisites, executes the five physical
drills plus any advertised full-stop case, admits original results and establishes
the runtime attachment before advertising support. No policy limit is enlarged
retrospectively to certify a failed run.

The bounded implementation separates policy validation from execution
admission. Management and rolling-upgrade preflight use that admission
decision. On `42d9199f8` the two affected suites passed on adams-gamla,
including the typed refusal for a fractional topology request. The next
integration action is to preserve those controls on the composed source.
The pilot owner still needs genuine physical drill originals for a qualified
version pair and an end-to-end positive through the runtime attachment.
[Support decision results](https://github.com/psvensson/lagrange/releases/download/solve-evidence/quest-evidence-and-candidate-binding--support-topology-capture-nov21.tar.gz).
