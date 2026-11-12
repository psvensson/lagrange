---
audience: development
documentClass: planning
epic: quest-agent-tooling-integration
---

# Quest agent tooling integration: implementation plan

## Claim, scope and current evidence

The [owning epic](../../epics/quest-agent-tooling-integration.md) records current status,
dependencies and the continuation owner. This document defines the intended
implementation and proof; it does not declare installed capabilities or executed
results. The eight linked Quests were created as drafts; the epic's current
summary records their subsequent seals and implementation state.

The user requested improvements to code exploration, systematic investigation,
independent review and reuse of verified lessons. The motivating failure families
are invented collaborator contracts, incomplete producer-to-consumer tests,
repeated local repairs, and claims that exceed the evidence. Existing
[contract-first authoring](../../quests/contract-first-authoring-and-producer-fidelity/quest.json)
and [content-bound review](../../quests/content-bound-review-and-interaction-proof/quest.json)
remain the owners of those requirements. This integration makes the practices
easier to execute and inspect.

Initial acceptance targets a real Codex CLI installation. Q1 records the actual
client version and supported project discovery/configuration mechanism before
implementation. Codex app, Claude Code and other hosts have no support claim
until the same relevant journey is measured on each host. A missing executable,
unavailable account or unavailable tool call is an execution gap, never a pass.

## Architecture and ownership

| Concern | Existing authority | Integration responsibility |
| --- | --- | --- |
| Scope, statements, seals and terminal state | Current Solver schema, store, commands and Quest records | Read and invoke these owners; no second task ledger or scheduler |
| Rules and contract ownership | AGENTS, rules, router and routed architecture/contracts | Resolve and cite the applicable owner before interpreting a tool result |
| Code identity and callers | Actual worktree files, Git and source owner/index producers | Serena supplies navigation evidence tied to those bytes |
| Investigation and proposed changes | Assigned Quest author and design-note owner | Adapt selected Superpowers procedures into the existing dossier/log |
| Review and applicability | Existing independent verifier, verification templates and proof owners | Adapt selected review instructions; preserve independent judgment |
| Learning and corrections | Existing regression/check/code/documentation owner and append-only findings | Capture verified reasoning at its owner; retrieval is derived |
| External API facts | Dependency identity plus attributable primary documentation | Context7 retrieves evidence; it does not define internal contracts |
| Tool installation and sessions | One project integration profile and the host's documented configuration owner | Pin capabilities, track owned resources and expose failures explicitly |
| Formation and comparative measurements | Existing product Quest, lab and benchmark evidence owners | No alternative runner, simulated result or substitute acceptance |

Prefer a small project-owned set of skills that points to these owners.
Use the host's existing plugin/MCP mechanism; do not build another agent runtime.
A project profile may select pinned upstream capabilities and adaptations, but
must not copy task state, contract decisions or measured outcomes into a new
authority. Resolve its exact file format and location in Q1 from actual host
support. Proposed integration paths in the epic's scope are destinations, not
claims that those implementations already exist.

The profile records upstream repository and immutable revision/digest, license
and required attribution, selected skills/tools, client/backend versions,
project root, adapted instruction locations, and which process owns each
resource. Derived indexes and client configuration cannot override that profile
or the repository's semantic owners.

One selected implementation serves each phase. Do not leave the upstream
autonomous pipeline active alongside the Quest adapter. An unavailable tool or
required document yields a named unavailable outcome and an owned next action;
it never selects an older version, fabricates a result or silently downgrades
the evidence class. Independent source investigation may continue within its
own claim while the missing capability remains unmeasured.

## Q1: Owner contract and pinned profile

**Quest:** [quest-tooling-owner-and-profile](../../quests/quest-tooling-owner-and-profile/quest.json).
**Prerequisite:** none. **Owner:** project integration author, with the existing
workflow and steering owners reviewing the boundary.

Implementation:

- Inventory the actual host, existing project/global configuration, relevant
  scripts and skills. Preserve the shared checkout's unrelated work and record
  which new files/configuration entries this integration owns.
- Resolve immutable upstream revisions for the selected Superpowers, Compound
  Engineering, Serena and Context7 capabilities. Record licenses and provenance
  for adapted material. Documentation links alone are not installed versions.
- Review the current upstream instructions against the existing owners. Resolve
  automatic design approvals, subagent dispatch, commits, PRs, task folders,
  memory writes and baseline updates explicitly. Standing user authority
  persists; repeated failed attempts do not create a fixed human-approval loop.
- Define the normal invocation path: identify Quest and source, load applicable
  owners, invoke the selected capability, record attributable findings, and
  return control to the existing Quest roles. Explain capability loss and restart.
- Use the existing design-note template to record identities, action authority,
  refusal consequences, remaining obligations and resource lifetimes. Reconcile
  the stale epic README with current Solver schema/commands without inventing a
  new format or rewriting historical records.
- Keep global personal memory and unrelated host settings outside this work.
  Repository scope declarations do not grant external account or publishing
  authority. Activation belongs to an implementation attempt, not this plan.

Proof: an independently reviewed profile names actual available surfaces and
their versions, identifies every instruction conflict and demonstrates rejection
of unpinned or conflicting activation inputs. Check the real host configuration
reader, not only YAML/JSON parse success. Retain the observed pre-change state;
do not bootstrap the Quest with invented failing receipts.

## Q2: Serena source navigation

**Quest:** [quest-tooling-serena-navigation](../../quests/quest-tooling-serena-navigation/quest.json).
**Prerequisite:** Q1. **Owner:** source-navigation integration author.

Implementation:

- Connect the actual pinned Serena MCP service to the selected host and the
  intended worktree. Begin with read-only symbol and reference retrieval.
- Bind each recorded investigation to the full commit, worktree root, relevant
  dirty-file digests, language-server/backend version and index/session identity.
  Revalidate evidence after checkout or content changes; branch names alone do
  not establish identity.
- Demonstrate a real producer, persistence/decoder boundary and consumer trace
  in Lagrange. Read the actual returned source and owner-defined shape before
  proposing a guard or test. Exercise each claimed language, initially
  JavaScript and Rust only where the installed backends actually support them.
- Identify dynamic imports, prototype composition and indirect dispatch that
  the language server cannot enumerate. Check actual exports/imports and
  runtime wiring through the existing owner tools. Never turn an empty reference
  result into proof that a caller, alternative path or obligation is absent.
- Keep semantic decisions with the code owner. Do not silently invoke Serena
  editing/refactoring tools under a navigation-only permission.
- Give service processes, indexes and temporary resources bounded ownership,
  cancellation and cleanup.

Proof: retain actual tool calls/responses and source references from a real
client session; include worktree switching, stale-index/source changes and a
dynamic reference limitation. Verify that incomplete results prevent the
unsupported completeness claim and that cleanup terminates owned resources.
A fixture repository or canned MCP transcript does not establish Lagrange support.

## Q3: Systematic investigation and contract-first authoring

**Quest:** [quest-tooling-systematic-investigation](../../quests/quest-tooling-systematic-investigation/quest.json).
**Prerequisites:** Q1, Q2. **Owner:** investigation skill author and existing
contract-first authoring owner.

Implementation:

- Adapt Superpowers' systematic debugging procedure into the existing Quest
  dossier and attempt sequence. Start with an actual failure artifact, its
  source identity and the smallest discriminating observation.
- Treat a problem as systematic until evidence proves a local boundary. Search
  relevant Git history, prior Quest findings and actual failed/fixed witnesses;
  explain applicability instead of treating an old fix as current truth.
- Trace the first causal divergence and complete the existing eight-part
  contract checklist: endpoints, owner-defined shape, identity/generation,
  ordering, absence/unavailability, commit, retained obligations, wake/cleanup.
- Record a falsifiable hypothesis and ruled-out causes. Compare appropriate
  related systems using primary sources where that helps; name their different
  assumptions before borrowing an approach.
- Exercise the actual producer and consumer. Fixtures must derive their shape
  from the real producer; a hand-authored collaborator that merely agrees with
  the proposed implementation cannot establish the boundary claim.
- Repeated refutation of the same assumption triggers an architecture and
  witness reassessment by existing roles. Preserve current evidence, narrow
  the next observation and identify the responsible owner. Do not equate a
  fixed attempt count with proof of architectural failure or mandatory escalation.
- Implement the proven cause with one canonical semantic path. No aliases,
  compatibility readers, silent fallbacks, larger deadlines or extra retries
  may conceal the failure. A justified change to a deadline/retry contract needs
  its owner's explicit reasoning and proof.

Proof: apply the procedure to an actual defect or a retained historical failing
checkout, then a fresh discriminating reproduction through the relevant owners.
Show that a wrong shape or stale assumption is detected before dependent edits.
Separate source diagnosis, historical observations and new executed proof.
A useful bounded repair does not need a full lab campaign in its inner loop.

## Q4: Independent review and evidence admission

**Quest:** [quest-tooling-review-and-evidence](../../quests/quest-tooling-review-and-evidence/quest.json).
**Prerequisite:** Q1. **Owner:** existing independent verification/proof owners.

Implementation:

- Adapt Superpowers' verification discipline and Compound Engineering's
  report-only review capability to the current Quest review dossier. Select
  applicable existing verification templates from the actual changed interaction.
- Bind review to candidate/base commits, dirty-file content when present, changed
  contracts, reachable callers, fixtures, proof machinery and relevant
  dependencies. A changed candidate requires an applicability decision.
- Keep the author and verifier independent. Return all material findings in the
  bounded surface together, with source or execution evidence and consequences.
  Reviewer agreement, confidence scores and a plugin's own completion text are
  not acceptance. Route unrelated findings without silently widening scope.
- Use the smallest discriminating proof first, then the affected production
  interaction and required broader gates. Preserve applicable evidence through
  its owner; do not rerun the full census or entire suite merely because another
  message was sent or a plugin demands fresh output in every response.
- Implement the proposed read-only epic checker
  `scripts/checks/quest-agent-tooling-acceptance.js` using existing evidence and
  provenance owners. It validates underlying artifacts and their applicability,
  not just receipt booleans, file existence, test counts or matching labels.
- Keep retained proof in the existing Quest receipt/log and evidence store.
  Large transcripts and run outputs follow the existing upload, re-download and
  digest verification path. Record the actual upstream/host/config versions with
  each tool-dependent observation.
- Preserve absolute separation between isolated validator tests and comparative
  systems measurements. No mock, fake or emulated observation may be used,
  created or generated in a comparative measurement campaign or admitted to
  its summaries. Missing measurements remain explicitly unavailable.

Proof: validate a genuine completed component execution and reject missing source,
wrong worktree/version, altered digest, stale candidate, missing output,
self-review, unresolved material findings and a manually asserted success flag.
Exercise negative controls by withholding or altering copies in isolated checker
tests; retain originals and never emit those controls as measured system results.
Show that the checker makes no network requests, starts no agent, server, test
or workload subprocess, and performs no writes.
Review the checker independently, including its actual production invocation.
Every component Quest invokes this same admission algorithm through its script
probe. The existing probe owner validates and retains its explicitly declared
artifact paths; the validator consumes that declared set. A flag-only receipt
reader is not on these closure paths. Q4 proves a real component-positive control
and proves the composed gate remains incomplete without Q8. Q8 supplies the
complete journey-positive control.

## Q5: Compound Engineering verified learning

**Quest:** [quest-tooling-verified-learning](../../quests/quest-tooling-verified-learning/quest.json).
**Prerequisites:** Q3, Q4. **Owner:** selected learning skill and existing
documentation/regression owners.

Implementation:

- Trigger capture after a verified resolution when non-obvious reasoning would
  otherwise be lost. Preserve a useful unresolved hypothesis as a typed finding,
  with its limits, rather than promoting it into guidance.
- Prefer the smallest enforceable prevention: improve the existing regression,
  check, type or invariant; otherwise retain rationale with its code/contract
  owner. Product changes stay inside their responsible Quest's scope.
- Record the cause, relevant failed approaches, exact evidence and applicability
  in the existing append-only log. Link to the canonical prevention. Do not
  duplicate them into a parallel solutions database, task ledger or global memory.
- Adapt the upstream capture behavior before activation: no increased ratchet
  baselines, blanket exemptions, automatic steering changes or undocumented
  personal-memory writes. Current owner guidance changes through ordinary review.
- Make later investigation discover these findings via existing history and
  owner references. Any retrieval index is disposable, content-bound and
  regenerable; it cannot decide semantic authority.
- Correct stale lessons with a new finding in an open owning/successor Quest and
  the proper current-owner edit, preserving earlier evidence and its limits.
  Never append to or reopen a terminal Quest.

Proof: capture a lesson from a genuinely verified resolution; have a separate
real session discover it and check current source applicability. Include an
outdated lesson and an unverified hypothesis that must not be accepted as current
guidance. Demonstrate that the existing owner holds the prevention and that no
baseline, historical log or unrelated memory is rewritten.

## Q6: Context7 versioned dependency documentation

**Quest:** [quest-tooling-versioned-documentation](../../quests/quest-tooling-versioned-documentation/quest.json).
**Prerequisite:** Q1. **Owner:** external-documentation integration author.

Implementation:

- Connect the actual Context7 capability through the supported host mechanism.
  Resolve library identity from the installed package/lockfile, including package,
  language and exact version; record the resolved documentation identity.
- Retrieve documentation for that version and retain attributable source URLs
  and the returned version/scope. If exact-version coverage is unavailable,
  report that gap. A request mentioning a version does not prove the response
  actually covers it.
- Check relevant returned API guidance against primary documentation or the
  installed source before relying on it. Label any cross-version inference.
  Do not use generic current examples to invent an unavailable API.
- Keep internal Lagrange shape and ownership questions with repository owners.
  External documentation never establishes that a product operation executed.
- Scope queries to necessary public API questions; credentials and unrelated
  local files are not evidence payloads. Use existing credential/configuration
  mechanisms rather than introducing a credential store.
- Keep this capability optional for work that needs no external-library facts.
  Its own acceptance still requires a real invocation, not a simulated response.

Proof: execute a relevant query for an actual project dependency, retain the
resolved library/version and response attribution, and exercise missing or
mismatched version handling. An unavailable service is an unavailable measurement;
it does not become a failure of the product or a passing plugin check.

## Q7: Installation, upgrade and removal lifecycle

**Quest:** [quest-tooling-lifecycle-and-upgrades](../../quests/quest-tooling-lifecycle-and-upgrades/quest.json).
**Prerequisites:** Q2-Q6. **Owner:** project integration profile owner.

Implementation:

- Establish one explicit setup and discovery procedure with the real host.
  Repeated setup must preserve existing settings, retain selected pinned content
  and create no duplicate skill, MCP registration or process.
- Track integration-owned entries and files. Use a separate actual client
  profile for lifecycle tests; protect unrelated user configuration and secrets.
- An explicit upgrade resolves the new immutable content, reviews changed
  instructions/tools/licenses and revalidates the affected contracts and live
  journey. Do not follow moving branches silently or keep parallel old/new
  execution paths.
- Interrupted setup or a missing server must leave a clear failed/unavailable
  state and preserve prior unrelated configuration. Do not activate mixed
  versions, silently downgrade or invent health results.
- Bound process lifetime, concurrent sessions, retries, indexing and cancellation
  using actual host/service capabilities. Name the owner of outstanding cleanup.
- Removal deletes only integration-owned configuration/resources, preserves
  historical Quest evidence, and leaves ordinary Quest operation intact.
  Graduated operational guidance goes to its canonical current document.

Proof: perform actual setup twice, an explicit tested version/configuration
change, interruption/tool loss, restart and removal in the separate host profile.
Retain before/after content identities and resource observations. Restore only
the owned test profile as appropriate; never run destructive lifecycle tests
against the user's active global configuration.

## Q8: Real Quest pilot and composed acceptance

**Quest:** [quest-tooling-real-pilot-acceptance](../../quests/quest-tooling-real-pilot-acceptance/quest.json).
**Prerequisites:** Q1-Q7. **Owner:** integration owner, independent verifier and
the selected product Quest's existing author.

Before execution, select one bounded real Quest with a useful causal question,
a declared user-visible result and an affordable actual interaction witness.
Derive its task view from current owners, source and existing records: baseline,
candidate, scope, actual implementation/binding APIs, affected callers, relevant
prior failures and evidence obligations. Name the paired invariants and a
reachable counterexample to each material claim before choosing new machinery.
Upstream documentation or an empty reference search cannot establish API or
caller completeness. The existing product author owns the interaction; this
pickup applies Q8's current contract and does not change component seals or
expand the pilot into formation or comparison acceptance.

Required journey:

1. Start a real supported client session and load the measured project profile.
2. Read the Quest and current owners; retrieve actual code through Serena and
   inspect relevant prior findings. Context7's separate real dependency witness
   may supply its component proof when the pilot has no external-API question.
3. Record a discriminating hypothesis and actual contract before the bounded
   repair. Use the original failing observation and actual owner interaction.
4. Obtain independent review of the composed candidate and run the applicable
   canonical checks/proof. Capture the verified lesson and append its finding
   before landing the pilot Quest; then land through the existing Solver and
   publish its exact committed candidate where the workflow requires it.
5. Record later learning or corrections in the still-open Q8/successor record,
   referring to the closed pilot without changing its terminal log. Q8 checks
   the separate pilot's landing/publication, not Q8's own future terminal state.
6. In another real session, retrieve that lesson, check its source applicability
   and use it in a relevant investigation or review without relying on the first
   session's conversation as the sole source.

Retain original prompts, actual tool/session outputs, source/configuration
identities, test/runner artifacts, review findings and Quest records. Account
for session/model/tool differences; no replayed transcript or scripted success
message may stand in for a live client invocation.

Record observed time to a discriminating observation, review, proof queue,
execution and integration; invalid-contract proposals caught; repeated repairs
of the same cause; and tool costs where original timestamps or provider records
exist. Missing values are unmeasured, never estimated. Historical pilot comparisons
are descriptive unless task, source, model, configuration and execution conditions
support a matched comparison. One successful pilot cannot establish a percentage
productivity improvement or general defect-rate reduction.

The final verifier checks the entire declared integration and evidence chain.
Outstanding required capabilities, material findings, publication requirements
or execution gaps keep this epic open. Product/lab/benchmark claims remain with
their original owners regardless of whether the tooling pilot succeeds.

## Composed acceptance and evidence

The epic's script probe is a proposed implementation delivered by Q4. It must
use local retained evidence and existing owner contracts to require all of:

- Exact integration source, actual host and upstream content identities;
  reviewed adaptation/conflict dispositions and complete Q1-Q7 component proof.
- The actual Q8 client journey and separately observed lesson-reuse session.
- Canonical Quest scope/seal/log integrity, independent review of applicable
  content, genuine proof outputs and required landing/publication evidence.
- Provenance and digests for each claimed observation, with the producing
  invocation, subject, scope, outcome and known limitations preserved.
- No outstanding material findings, no invented observations and no mixed
  deployment/source results. A changed candidate needs verified applicability
  or fresh affected measurements through the existing proof owner.

Receipt producers validate actual inputs before deriving the standard retained
Quest receipt. The epic checker independently revalidates those inputs rather
than trusting its own generated output or the presence of required receipt IDs.
Use the existing evidence store's verified local materialization for large
artifacts; absent local evidence keeps the probe incomplete, and the probe
itself never fetches it. Do not add an independent success ledger or probe type.

All component and Epic `doneWhen` definitions invoke one scoped script validator.
Component probes declare their retained artifacts through the existing probe
owner; malformed, escaping or undeclared artifact reads are refused. Existing
sealed script probes that declare no artifacts keep their original contract.
These definitions are proof obligations, not fabricated receipt files.
Before sealing, prepare a genuine measuring negative witness through
the existing test/proof owners. If the required measuring surface is absent,
resolve that bounded proof-preparation work first; a missing file is
non-measuring and cannot stand in for a red reproduction. Refine unsealed drafts
as necessary; supersede a changed sealed premise instead of weakening it.
No feature implementation begins merely because this plan was authored.

Every implementation uses the actual producer-to-consumer path, a known-bad
control and appropriate focused checks. Broader proofs run when required by
changed contracts, not after every prompt edit. Do not raise thresholds, invent
receipts, add a fallback or weaken acceptance to obtain completion.

## Upstream research inputs

These primary sources were read for the 2026-11-10 recommendation. They explain
candidate capabilities; their changing default branches are not version pins
and their claims are not Lagrange acceptance evidence.

- [Superpowers](https://github.com/obra/superpowers), specifically
  [systematic debugging](https://github.com/obra/superpowers/blob/main/skills/systematic-debugging/SKILL.md)
  and [verification before completion](https://github.com/obra/superpowers/blob/main/skills/verification-before-completion/SKILL.md).
- [Compound Engineering](https://github.com/EveryInc/compound-engineering-plugin),
  [report-only review](https://github.com/EveryInc/compound-engineering-plugin/blob/main/docs/guides/ce-code-review.md)
  and [verified learning](https://github.com/EveryInc/compound-engineering-plugin/blob/main/docs/guides/ce-compound.md).
- [Serena](https://github.com/oraios/serena) for actual symbol/reference navigation.
- [Context7](https://github.com/upstash/context7) for version-attributed external
  documentation.
- [OpenAI skills concepts](https://developers.openai.com/plugins/concepts/skills)
  for the distinction between procedural skills and live MCP tools.

Recheck these sources at Q1 and each explicit upgrade. Select capabilities for
their demonstrated fit; do not import a complete competing methodology simply
because its components are available.
