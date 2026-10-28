---
audience: development
documentClass: planning
---

# 0.2.7 stabilization requirements and work packages

## Purpose and authority

The [release epic](../../epics/release-0-2-7-stabilization.md) owns coordination.
This document owns the proposed multi-Quest acceptance contract for the user's
2026-10-28 stabilization request. The
[verification dossier](../../epics/release-0-2-7-stabilization/verification-2026-10-28.md)
owns the audit observations and their evidence ceilings. Runtime contracts,
bounded Quest seals and immutable proof receipts retain their existing authority.

Baseline: `v0.2.6` at `a1e26f6de84433a3913c2ef855d1b787e926d7eb`, rechecked
against `main` at `98e69ba13db8f9a5bbf6bc919d6e9c941b07ac8e`. The affected
production implementation is unchanged. This plan establishes no repaired
runtime, completed Quest, production SLA or published 0.2.7 release.

The outcome is a usable corrective release: admitted SQL preserves its declared
meaning; internal ingress has an explicit trust boundary; supported runtime
resources have owned bounds; published artifacts run their advertised journeys;
and the operating envelope and proof provenance are accurate.

## Acceptance discipline

- **P1** is a release-blocking correctness, admission, packaging or resource
  obligation. A reproducer measures the named interaction; a bounded success
  never substitutes for the final public-service proof.
- **P2** is required release assurance or operational clarity in this plan.
  Its acceptance is proportionate to the claim. A deployment or support-envelope
  change must be explicit and tested, not an undocumented workaround.
- Every package names one owner interaction. Split further only when distinct
  durable application contracts require it; do not create one broad repair Quest.
- Before behavior changes, seal the bounded Quest against an executed red
  witness and its read-only receipt probe. Probes never start clusters or make
  network requests. No Quest is sealed by this planning change.
- A source change needs independent verification and a meaningful negative
  direction: reverting its load-bearing correction restores the defect or
  violates the declared bound. Supported-path and native evidence are required
  where mocks cannot establish the claim.
- Preserve original failures, retries, command/environment identity and evidence
  ceilings. Reuse accepted proof only through its owner; do not run the entire
  corpus repeatedly to compensate for a missing focused semantic oracle.
- All numeric resource/time bars are chosen and sealed from the supported
  workload before the success run. The observed 10,000-message failure is not
  automatically the correct admission limit.

## Work packages

### Q01 - Preserve or refuse mutation expressions (P1)

**Owner:** `src/query/sql-parser-expression-methods.js`, `sql-parser.js`,
statement execution and SQL command rendering. **Finding:** F01.

Replace lossy AST-to-value conversion with the existing canonical expression
contract for the supported subset. Unsupported node kinds must return a typed
error before any mutation. Preserve deterministic replicated-SQL admission;
do not add raw-SQL bypasses or different semantics in each public adapter.

**Acceptance:** the five retained arithmetic/dollar-string/CAST/function
reproducers either store their declared correct values or refuse before effect
according to an explicit supported-expression matrix. Already promised forms
must remain supported; narrowing a promised contract requires a separate product
decision. Literal NULL, negative
numbers, quoted strings and parameters remain correct; nondeterministic
expressions still refuse where required. Exercise direct core, PGwire and
embedded ingress, with actual native stored rows as the oracle. Reverting the
correction restores at least one successful NULL corruption. No TX1 rewrite is
needed. Sequence first; serialize shared parser integration with Q02.

### Q02 - Make schema admission and physical enforcement agree (P1)

**Owner:** CREATE parser -> durable table intent -> catalog schema -> physical
partition bootstrap and recovery. **Finding:** F02.

Use one supported-constraint representation through every transition. Preserve
and enforce supported constraints; refuse unsupported declarations before
recording CREATE intent. Inline and table-level forms claimed equivalent must
remain equivalent. Per-partition uniqueness is not global uniqueness.

**Acceptance:** inline/table UNIQUE, single/composite PRIMARY KEY, CHECK and FK
each enforce the declared semantics or refuse before creation. Validate real
invalid writes, with foreign keys enabled and a rejecting positive control.
Preserve supported constraints across metadata roundtrip, new replica
provisioning, interrupted provisioning recovery and snapshot/restart. Repeated
CREATE with incompatible intent remains a conflict. Check retained schemas
created by 0.2.6: do not claim historical intent can be reconstructed if it was
discarded; detect/classify affected layouts and document validated recreation.
Reverting the fix restores the admission/enforcement mismatch. Coordinate Q01.

### Q03 - Unify storage-compatible key ordering (P1)

**Owner:** typed key ordering, split/merge placement, normal query routing,
range pruning and relevant live-query consumers. **Finding:** F03.

All consumers use one type/collation contract. Define it against supported
storage semantics: replacing localeCompare with JavaScript relational order
alone does not prove agreement with SQLite UTF-8 binary order for all Unicode.
Decide persisted-boundary revalidation/migration before changing live order.

**Acceptance:** the Z/a witness finds Z exactly once after split; point reads,
writes, mirrored writes and physical child placement agree. Range results match
an unsplit native SQLite oracle. Cover case, punctuation, accents, supplementary
Unicode, boundary equality, numeric keys against persisted numeric text bounds,
and binary keys if supported. Test restart and old-boundary refusal/revalidation.
Preserve the solved numeric routing evidence. A bounded split/read proof plus
the appropriate composed path must become red when the correction is reverted.
Use a successor under the split/merge owner; do not reopen solved seals.

### Q04 - Protect internal cluster HTTP ingress (P1)

**Owner:** `src/bootstrap/bootstrap-api-server-methods.js`, bootstrap route
handlers and service-registration handoff; application HTTP authentication owner.
**Finding:** F04.

Choose and document one node/control ingress boundary: a separately private
listener or authenticated internal routes with owned admission. Protect all
equivalent registration/bootstrap/control paths, not only the three sampled
routes. An application Basic-auth setting must not imply those routes are
protected when they bypass it. Do not add enterprise tenancy or an alternate
registration authority.

**Acceptance:** neither an unauthenticated caller nor an ordinary authenticated
application client on public application ingress can
inspect protected topology, admit bootstrap work or reach registration mutation;
invalid credentials/identity fail before effect. Legitimate node startup,
service registration and recovery still work through their owned boundary.
Test direct listener, ordinary proxy configuration and duplicate/malformed
requests. Cover all route aliases from an explicit census. Retain the existing
application-auth control and the no-storage-mutation negative. Full node mTLS
remains separately owned unless explicitly brought into a bounded contract.

### Q05 - Ship an executable with its complete runtime (P1)

**Owner:** `scripts/build-sea.js`, executable build and release asset selection.
**Finding:** F05.

Publish a complete supported platform archive containing the external native
modules, worker entrypoints and vendored WASM it needs, or make the executable
truly self-contained. Name platform/architecture and native ABI assumptions.
Do not market the current bare file as a standalone installation.

**Acceptance:** download/unpack the exact candidate into an empty directory
without checkout/node_modules assistance; version, dry-run, actual startup,
write/read, clean shutdown and persistent restart succeed. Missing required
runtime content produces a clear early error. Workers/native/WASM paths engage.
Checksum checks cover the artifact the user downloads. Reverting the packaging
change fails the clean installation journey, not merely a directory-name check.
Coordinate dependency repairs in Q07 and final publication checks in Q16/Q17.

### Q06 - Make npm service authoring complete (P1)

**Owner:** `src/service/service-component-build.js`, package files/dependencies
and `scripts/release-npm-package.js`. **Finding:** F06.

Distribute the required component compiler and WIT inputs in the supported
authoring installation. A deliberately separate authoring package is acceptable
only if the published instructions, version pairing and consumer journey use
it consistently. Do not rely on this repository's development dependencies.

**Acceptance:** a clean production consumer installs the candidate package and
runs the documented service init -> generate -> build -> deploy/invoke journey.
WIT resolution works outside the checkout; the resulting component is valid
and runs on the supported service path. Missing source, generated records,
compiler and WIT produce accurate distinct diagnostics. Current misleading
"generate first" output must not mask a missing compiler. Reverting compiler
or WIT packaging makes its respective consumer witness fail. Coordinate Q07.

### Q07 - Repair the dependency trees users actually receive (P1)

**Owner:** runtime/CLI dependency declarations, lockfile, container and npm
consumer audit in existing release tooling. **Finding:** F07.

Patch or replace affected reachable dependencies in the source-locked image
and fresh installed-package tree. Root overrides alone do not patch a package
consumer. Separate optional terminal UI dependencies where that reduces the
server's dependency surface without breaking the supported CLI installation.

**Acceptance:** report versions and advisory disposition for Piscina, Fastify,
fast-uri, find-my-way, lodash and xml2js in each delivered tree. Remediate the
observed affected versions and run owner-relevant compatibility checks. Record
fresh audit time, lockfile/tree identity, advisory severity and reachability
qualification. No unexamined high/critical production entry may be called clean;
a remaining item requires an explicit evidence-backed disposition. Audit
parent meta-vulnerabilities are not counted as independent exploits. Reverting
the real dependency correction must reintroduce its affected installed version.

### Q08 - Bound production diagnostic retention (P1)

**Owner:** `src/raft/raft-rs-durable-store.js`; existing cutover RS2. **Finding:** F08.

Make detailed diagnostic retention test-only or bounded by a fixed-capacity
owner; keep cumulative counters separate. Do not remove durable log records or
application obligations to make a diagnostic-memory measurement pass.

**Acceptance:** actual operation-port/WASM/SQLite writes well beyond the chosen
bound retain at most that bound. Observation enabled/disabled cannot change
write results, applied positions, must-sync ordering or restart recovery.
Closing the group releases observation resources. Reverting the correction
restores the retained-record growth. Count the production array directly;
fixture heap growth and an unmeasured OOM are different claims.

### Q09 - Make inbound draining stack-safe and pressure-bounded (P1)

**Owner:** serialized `src/raft/raft-rs-runtime-owner.js` admission/drain and its
transport consequence. **Finding:** F09.

Replace unbounded synchronous recursive draining with an owned iterative or
trampolined mechanism. Specify count/byte admission bounds and honest refusal
before acceptance. Preserve the complete captured preaccepted extent before
its command, later-arrival custody, generation fences and Ready ordering.
Never silently evict accepted work or arbitrarily coalesce message semantics.

**Acceptance:** the retained 10,000-heartbeat case and a larger bounded case
drain or refuse before acceptance without stack exhaustion. Measure maximum
accepted bytes/count, handles and progress of other groups. Cover asynchronous
Ready boundaries, persistence refusal, runtime reconstruction, later arrivals,
close and idle liveness. Reverting iteration restores the stack negative;
reverting admission bounds exceeds the declared bound. Use a successor: the
existing liveness Quest excludes queue-semantic changes and the captured-extent
seal cannot be weakened into "some messages before command".

### Q10 - Complete safe retained-log lifecycle coverage (P1)

**Owner:** existing snapshot/checkpoint, durable log and each group application
owner. **Finding:** F10. **Dependency:** Q11 observation before endurance proof.

First author a retention table for data leaders, healthy followers that never
lead, control-plane partitions and message groups. Implement safe reclamation
using each owner's committed application state and durable checkpoint proof.
Split this package into bounded Quests where application contracts differ.
There is no generic TTL solution for CDC custody, transaction decisions,
deduplication identities, learners or lifecycle obligations.

**Acceptance:** at least two compaction cycles under a fixed leader and
continuously caught-up followers stay within sealed log/checkpoint bounds and
preserve exact application data. Restart every supported role; force a lagging
follower to install a genuine snapshot while foreground writes continue.
Exercise actual control-plane/message-group recovery semantics. Missing,
corrupt or stale checkpoint proof refuses pruning; nothing beyond a proven
applied checkpoint is deleted. Source census is complete; disk-exhaustion and
whole-group boundedness are still unmeasured. An unsupported case stays an
open gate unless product authority explicitly changes the supported envelope.

### Q11 - Expose snapshot outcomes and retained-history debt (P2)

**Owner:** existing partition cadence -> diagnostics/health interaction.
**Finding:** F11.

Consume the typed cadence outcome currently discarded by the timer caller.
Retain bounded last-success/failure/refusal, checkpoint/compaction position and
outstanding history bytes/count/age. Health decisions stay with the health
owner; do not add another readiness authority, retry loop or per-tick error log.

**Acceptance:** injected checkpoint/compaction I/O failure becomes inspectable
with growing debt; recovery records success and resolves active failure by the
owned rule. No unhandled rejection, stuck inFlight or false success occurs.
Below-threshold and ordinary nonleader states remain quiet. Reverting result
consumption loses the observable typed failure and fails the witness.

### Q12 - Bind reusable proof to attributable evidence (P2)

**Owner:** `scripts/proof-authority.js`, producer/recorder and existing release
proof owners. **Finding:** F12.

Retain producer identity, exact command/environment, source and proof-contract
identity, result summary and a durable evidence manifest/digest. Validate the
producer-result binding at the owned recording boundary. Preserve exact-SHA
and approved content-identity reuse, original proving SHA and failure history.

**Acceptance:** a new successful proof resolves to its genuine retained
measurement; missing/mismatched producer, subject, result or evidence fails
closed. Eligible reused proof does not rerun its full suite, while an
inapplicable input change cannot reuse it. Preserve existing immutable receipts;
use a versioned successor contract if acceptance changes, with explicit legacy
disposition. The empty 0.2.6 producer field is an attribution gap, not evidence
that its registered proof never ran. No new workflow/checker merely for this epic.

### Q13 - Make native artifact provenance internally consistent (P2)

**Owner:** `vendor/raft-rs-wasm` manifest/build records and binding integrity
checks. **Finding:** F13.

Bind the current artifact to actual source, Cargo.lock, toolchain, build command
and result hashes; correct current production-role/path descriptions. Preserve
historical attempts as history. If the original linkage cannot be reconstructed,
state the gap and retain an attributable build rather than fabricate provenance.

**Acceptance:** the designated current build record matches actual WASM/glue
hashes and retained inputs; current-attempt digest contradictions fail a focused
consistency witness. Changed/corrupt bytes still fail runtime loader checks.
Byte-for-byte reproducible builds are a separate measured claim, not assumed.

### Q14 - Publish and rehearse the actual operating contract (P2)

**Owner:** canonical capabilities and their producer/checker, SQL public
adapters, operations guide and existing pilot-envelope owners. **Finding:** F14.

Document ordinary replica-read semantics, one nonterminal transaction per
partition, partition-generation conflicts, replay/staging bounds and unknown
outcomes. Internal SQL execution already supports a caller idempotency key;
PGwire and the embedded application facade do not expose a general equivalent
contract. Preserve that internal owner and avoid a second deduplication ledger.
Reconcile "can be left partly committed" wording with forward-only TX1 recovery.

**Acceptance:** code, capability JSON, generated docs and runnable examples
agree. Lost-answer/restart demonstrations distinguish completed, failed and
unknown outcomes and never recommend blind non-idempotent retries. If public
retry identity is added, seal its payload-conflict, lifetime and outcome-lookup
contract separately. State unsupported pre-0.2.6 moved-message-group histories
and prohibit untested in-place upgrade claims. Rehearse a named fresh/rebuilt
evaluation deployment and, where data transfer is claimed, a separately
validated export/reload with parity and preserved old data. Replica snapshots
are not a user backup product; no backup/PITR, mixed-version upgrade, RPO/RTO or
global snapshot guarantee is invented. Preserve existing edition boundaries.

### Q15 - Test a private deployment profile (P2)

**Owner:** `charts/lagrange-node`, container runtime and existing deployment
documentation. **Finding:** F15. **Dependency:** Q04 ingress boundary.

Provide a supported private-cluster evaluation profile with explicit persistent
storage, identity, node exposure, failure-domain placement and shutdown
assumptions. Address nonroot execution/security context, topology spread,
network policy and disruption policy through current chart owners. Choose
defaults compatible with the named profile; do not pretend one configuration
fits both a single-node demo and a multi-machine pilot.

**Acceptance:** render/lint the profile, boot it on the supported environment,
write/read/restart with its volume permissions, and verify real endpoint
exposure and graceful disruption. Preserve existing loopback-admin protection,
durable identity and health probes. A container version command alone is
insufficient. Network policy enforcement depends on the tested cluster plugin;
state that assumption. Enterprise identity/tenancy stays out of scope.

### Q16 - Align release artifacts, metadata and documented journeys (P2)

**Owner:** existing publication pipeline and package/chart/executable producers.
**Findings:** F16; consumes Q05-Q07 and Q13-Q15.

Make checksum paths match the delivered download layout, synchronize packaged
chart examples/caveats, and make npm dist-tag policy intentional and visible.
Advertise the actual supported platform matrix. Keep source commit, npm
integrity, image digest and chart version in the release receipt.

**Candidate acceptance (before publication):** fresh consumers verify hashes
using the documented commands and perform the executable, npm authoring and
image/chart startup journeys on the exact candidate artifacts. Q17 consumes
this phase before normal release authority and gates permit publication.

**Publication confirmation (after publication):** compare observed registry
bytes/digests with the candidate artifacts, receipt and source identities.
This phase gates epic closure, not permission to start publication. A lagging
next tag is acceptable only as
an explicit channel policy, not accidental misleading metadata. Publication
requires its normal version-specific authority; this epic does not grant it.

### Q17 - Prove one composed release candidate (P1 terminal acceptance)

**Owner:** release integration and existing public-path/distributed harness
owners. **Findings:** F17 and every Q01-Q16 acceptance obligation, in the
pre-publication/post-publication order below.

Implement the named `release-0-2-7-stabilization` terminal scenario within the
existing harness and evidence protocol. Freeze the supported configuration,
artifacts, workload, failure injection and resource bars before its pass run.
Before measuring acceptance, bind the epic probe's `recordedLog` to the actual
certification Quest's append-only log when that Quest is created/sealed, and
select its evidence directory if different from the existing default. The
current draft has neither that execution binding nor archived measurements;
archives alone cannot make the existing certification owner return done without
the log cross-check. Do not synthesize a Quest/log or pass receipt to fill it.

Candidate qualification binds Q01-Q15 and Q16's pre-publication artifacts and
journeys to the same candidate or owner-approved proof applicability. The
normal release authority and gates then permit publication. Q16 subsequently
confirms observed registry artifacts. Final epic certification retains both
the original measured candidate evidence and that fresh confirmation, without
rewriting earlier runs as new executions. The final report is not a manually
edited checklist or green tests collected from incompatible revisions.

**Candidate acceptance:** start from packaged installation, build/invoke the supported
code-first WASI service through public HTTP and exercise SQL writes and
transactions, text-key movement, leader loss, participant restart, lagging
follower snapshot catch-up and lost responses. Use an independent data/value
oracle, stable operation identities where supported, and a declared
quiescence/recovery point for comparisons. Measure retained diagnostics,
queue bytes/count, log/checkpoint debt and application correctness through the
declared endurance workload. Local native evidence cannot certify independent
machine fault domains. Use the supported multi-machine profile for that claim;
retain the cutover's separate sealed physical certification obligation.

Run normal exact-candidate change, corpus and release proof gates through their
owners and preserve failures/retries. Final artifact publication verification
is freshness-bound and follows candidate qualification. Preserve the
[certification owner's classifications](../../../test/distributed/harness/certification-evidence-streak.js):
refused admission before a measurement is not a sample; interrupted, partial or
unverifiable archived attempts retain their failed-sample/reset behavior.
Measured safety, liveness and resource failures, including deadlines, unfinished
recovery and refusal of a promised workload, remain red with their original
artifacts. No evidence is retargeted to another SHA. The epic probe is currently
not measuring and cannot become done without its actual log binding and real
verified archived terminal evidence.

### Q18 - Simplify touched decisions; route broader cleanup (P2 on contact)

**Owner:** each touched semantic owner and existing core-convergence/apparatus
epics. **Findings:** F18 and documentation-owner debt discovered during planning.

Remove duplicate interpretations exposed by these repairs, such as competing
key comparison or schema projections. Prefer one existing owner and an explicit
interaction over new wrappers, state stores, compatibility paths or retry loops.

**Acceptance:** reviewers identify the authority removed or unified, preserve
its legitimate consumers and recovery obligations, and retain a falsifier.
Do not raise ratchet baselines. The inherited 1,738 cyclomatic and 149 cognitive
violations from the audited CI are debt signals, not a requirement to rewrite
the project for this patch. Route broad cleanup to existing convergence work;
correct stale active instructions when encountered through their own owner.

## Existing work and scope boundaries

| Existing authority | Reuse and boundary |
| --- | --- |
| [Raft full cutover](../../epics/raft-rs-full-cutover.md) | Preserve landed TX1, FreshMG, SN1 and native durability; RS2 already owns diagnostic lifetime; physical certification stays separate |
| [Inbound liveness Quest](../../quests/rs-raft-admitted-inbound-liveness/quest.json) | Its seal forbids queue-semantics changes; Q09 is a successor |
| [Captured-extent Quest](../../quests/runtime-captured-inbound-extent/quest.json) | Preserve all preaccepted work before command and later-arrival custody |
| [Split/merge integrity](../../epics/split-merge-transition-integrity.md) | Q03 bounded successor; do not reopen solved comparator/numeric fixes |
| [Numeric routing Quest](../../quests/numeric-key-routing/quest.json) | Preserve measured numeric behavior; text collation is a distinct mismatch |
| [AGPL feature map](../../../docs/development/agpl-feature-map.md) | Broader `RM-0.3-qs-typed-key-ordering` remains a separate scope, including persisted boundaries |
| [Apparatus and release consolidation](../../epics/apparatus-release-consolidation.md) | Existing proof provenance, release journeys and workflow-budget owners; no generic tooling expansion |
| [Pilot readiness](../../epics/pilot-readiness-and-public-proof.md) | Existing public-path, transport trust and support-envelope homes; no blanket pilot-readiness claim from this patch |
| [Core architecture convergence](../../epics/core-architecture-convergence.md) | Broad owner/decision cleanup retains its activation and proof gates |
| [Edition matrix](../../../edition-matrix.md) | First-party commercial backup/restore/PITR and enterprise tenancy/identity remain external |

The release integration owner links actual Quest IDs into the epic as they are
created or selected. A linked existing Quest keeps its owning epic and seal;
release coordination is not reassignment. Existing proved TX1/SN1 behavior is
protected, not relabelled missing because a historic record remains OPEN.

## Release exclusions and decisions still required

The patch does not promise arbitrary PostgreSQL compatibility, secondary
indexes, general serializable/linearizable reads, unconstrained transactions,
multi-operation/paged WASI calls, public multi-tenant deployment, commercial
backup/PITR, rolling/mixed-version upgrades, a broad performance advantage or
production SLAs. These remain in their existing roadmaps and owners.

Before sealing the affected packages, their owners must decide the supported
expression/constraint subset, persistent key-order migration policy, HTTP
control boundary, runtime distribution form, per-group retention bounds and
the named deployment/certification profile. These are concrete design steps,
not permission to mark current defects accepted. A material product exclusion
needs the user's authority; routine bounded repair choices stay with the owner.
