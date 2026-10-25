# Independent metric-report provenance review

Verdict: **REVISE** exact candidate
`c95ec0abe2361c3c31a471f024442a330b6095e2` (tree
`34394a5cbb5ea7434d292832b8a4c2dbd0f12c15`) against
`ddc34a6a6272a94415b989d33ad79968426aac71`.

Reviewer: `subagent:/root/q6_review`. One required correction: the sealed input
set omits files the real cycle analyzer consumes. Both identified forms reach
the actual inventory consumer and still reproduce the stale-report mechanism
this Quest promises to remove. This is an incomplete repair, not a claim that
the predecessor was correct or that a new runtime regression was introduced.

The isolated reviewer tree is
`/mnt/data/peter/projects/.worktrees/codex-metric-review-20261025`.
No author/integration files or production code were edited. Only two existing
test files were extended there. All 14 committed JavaScript hashes match the
author source manifest and clean author tree; source digest is
`084f0f7f63fc82d945a4a9f8690867ee36544600ea24cd7ad20cdabbc97d5323`.
The independently generated 28-path candidate patch SHA256 is
`ec31d9e9f2be758ad417596f3461682aaffeacd3ea5ceba7948510d516629eec`.
`source-validation.json` and `review-witnesses.patch` bind these facts.

Authority: supplied handoff, current AGENTS -> rules -> router (rule revision
2026-10-26), sealed metric-report-provenance Quest/receipt, verification and
test owners. The committed AUTHOR-HANDOFF.md describes an earlier staged
freeze; the current immutable SHA and committed broad evidence supersede that
historical custody statement. No broad metrics, native tests, hooks, lab,
commits, publication or acceptance action were launched by this reviewer.

## M1. Input discovery does not cover the actual analyzer dependency closure

Severity: required/high for the freshness claim. Violates Quest statement,
R03/R05/R08 and the report owner's claimed source binding.

`scripts/metric-report-inputs.js:14,24` excludes every directory named `.cache`.
`sourceDigest` at lines 48-65 also collects only declared target roots, scripts,
and matching immediate root configuration files. Those are entry roots, not
the set of all files consumed by Madge. `check-circular-dependencies.js` calls
the real Madge API on src/scripts/test. Installed `madge/lib/tree.js:121-147`
calls dependency-tree recursively and filters npm/git dependencies; it does
not restrict ordinary imported modules to those entry directories or reject
`.cache` imports. Thus the provenance owner independently narrows the
analyzer's actual input set.

The same real producer/owner/consumer experiment was run for both omitted
input classes, with source mtime restored after changing bytes:

| Controlled imported dependency | Exact ddc predecessor: before / consumer after fresh graph / actual remeasurement | Exact c95: before / consumer after fresh graph / actual remeasurement |
| --- | --- | --- |
| `src/.cache/dependency.js`, imported by `src/subject.js` | 0 / 0 / 1 | 0 / 0 / 1 |
| `metric-shared/dependency.js`, imported by `src/subject.js` via `../metric-shared/dependency.js` | 0 / 0 / 1 | 0 / 0 / 1 |

In each case the dependency initially has no back edge. The only content
change adds an import back to the subject. The current report reader still
returns the previous sealed zero-cycle report. After the canonical import
graph is refreshed, actual `collectLiveInputs` also consumes zero. Running
the actual cycle producer measures one cycle and exits 1 under its unchanged
zero-cycle ratchet. Therefore neither a missing tool, parser refusal, graph
staleness, unchanged source, nor vacuous assertion explains the failure.

`dependency-witness-final.log` contains four intended failing leaf assertions:
seal invalidation and actual inventory freshness for each class. Initial
zero-cycle controls and fresh measured-one-cycle/exit-1 controls pass. The
file completes in 12.3 seconds under the existing timeout. Exact predecessor
scripts and both consumers' required helper files are reconstructed with
`git show ddc...:<path>` in the control fixture; `predecessor-controls.log`
passes the explicit expected-old-bug tuples. Those expected-negative controls
are not positive candidate certification.

Required repair direction: bind every actual measurement dependency through
the one provenance owner while retaining analyzer selection with the real
analyzer. Do not fix only the `.cache` name: the outside-entry-root import is
an independently measured second hole in the same assumption. A conservative
input superset or producer-owned discovered dependency/resolution manifest
must include actual imported bytes and relevant resolution changes; if an
input cannot be bound, fail explicitly. Do not add another analyzer, consumer
fallback, mtime rule or exception accepting unsealed reports. Retain both
paired witnesses and the existing selective-refresh/matching-input tests.

These are small real-tool fixtures on the controller, not claims about a
current hidden cycle in the full production tree. Their ceiling is sufficient
to refute the general provenance/consumer contract the candidate introduces.

## Confirmed behavior and complete changed-surface census

All four producers and five reports were inspected. Complexity, cognitive
complexity and cycles use begin/finish measurement directly. Duplication uses
its existing jscpd JSON output, then the same sealer; `--target` allows one
stale duplication report to refresh without rerunning its sibling. The
external jscpd writer can transiently leave unsealed JSON, which consumers
reject; it is not an accepted compatibility representation. The final seal
uses a same-directory temporary file and rename. No second threshold or
metric-count policy was introduced.

Both reachable repository consumers use the shared report reader: inventory
through ensureMetricReports, and the complexity closure oracle through
readCurrentMetricReport. Repository-wide report-path and removed-helper
searches found no old raw-reader bypass, old writer/root wrapper, or old
unconditional refresh list. The oracle still intentionally runs its two
ratchets, records their exit status, and requires a current seal; it cannot
claim done from a nonzero run. This is distinct from the inventory fast path.

Validated semantic inventory identities exclude local provenance. Complexity,
cognitive and cycle identities hash the semantic payload; duplication retains
its existing statistics projection. This keeps differing valid runtime seals
out of committed inventory identity. No count, threshold or baseline was
raised. Full-repository complexity 1765/1755 remains an inherited red gate.

The original candidate tests independently pass: provenance 32 runner
assertions, inputs 15, ordinal inventory 24, and ratchet closure 4, totaling
75 runner assertions across four unchanged files. Their leaf counts differ
because TAP includes subtest containers. They cover valid producer seals;
scoped/unsealed/null/malformed/tampered/cross-ID rejection; source/config/tool
and transitive installed dependency bytes with unchanged mtimes; relocation;
generated-output exclusions; semantic identity under differing runtime seals;
selective refresh and byte/inode preservation; input-change refusal preserving
prior sealed bytes; crashes with no/partial unsealed output; and a genuine
cycle ratchet exit 1 with valid current output. M1 shows why these greens do
not establish complete measurement dependency coverage.

The first reviewer command named a nonexistent inventory test and was rejected
before execution (`focused.log`). The corrected command is retained in
`focused-corrected.log`. An initial placement of both new probes in the slower
provenance suite reached and proved the `.cache` case, then hit the existing
file timeout during the second case; its follow-on ENOENT was fixture teardown
after that timeout. That second attempt is not proof. Its first log/patch are
retained. The probes were moved to the existing fast input suite; no timeout,
runner or production setting was raised or bypassed.

## Checklist dispositions

PASS below means the bounded cited fact, not overall approval. SOURCE is
inspection rather than an executed claim. N/A names a mechanism absent from
this local artifact contract.

| Item | Disposition and invariant/evidence |
| --- | --- |
| Owner 1 one semantic question | PASS structure: metric-report-provenance owns reuse; M1 means its input evidence is incomplete. |
| Owner 2 typed seam | PASS: one schema/input/payload seal, shared reader, no unsealed fallback. |
| Owner 3 paired invariant | FAIL M1: fast reuse must coexist with actual-input freshness; real producer/consumer pairs fail both omitted-input classes. |
| Owner 4 stale then fresh | PASS for covered source/config inputs; FAIL M1. Explicit producer rerun repairs the omitted-input observation. |
| Owner 5 pressure | PASS/SOURCE: only stale reports execute, duplication target selection; no new retry loop or force-success route. Concurrent demand may duplicate local measurement, not grant conflicting domain authority. |
| Owner 6 release/progress | PASS covered inputs: stale reports regenerate through canonical commands; finite bad-output attempts throw and later valid producer can satisfy reader. M1 prevents required invalidation. |
| Owner 7 projection authority | FAIL M1: accepted sealed projection can describe older analyzer inputs; semantic/local identity separation otherwise correct. |
| Owner 8 controlled negative | PASS: exact ddc scripts, actual Madge/consumer, back-edge mutation and fresh count/exit controls; expected negatives segregated. |
| Owner 9 escape hatch | PASS census: no old raw report consumer, refresh list or writer fallback found. |
| Owner 10 contract/proof | FAIL complete input contract under M1. Named Quest/tests exist; no dedicated new metric pair was added to impact-contracts, so current coverage is import-cone/test metadata rather than a separately registered pair. |
| Harness 1 right red cause | PASS final probes: four semantic failures after intended setup, not missing methods or timeouts. Initial timeout remains excluded. |
| Harness 2 honest seam | PASS: actual tools/producers, canonical graph, report owner and actual collectLiveInputs. |
| Harness 3 time | PASS: unchanged canonical runner budget; no mtime authority; source mtime restored. |
| Harness 4 fields | PASS: real producer JSON/seals, ordinary static imports; no hand-authored success report in the defect witnesses. |
| Harness 5 nonvacuity | PASS: measured baseline 0, back edge, fresh cycle count 1 and exit 1. |
| Harness 6 entry/owner | PASS: consumer via collectLiveInputs/ensureMetricReports; predecessor consumer dynamically imported from exact reconstructed source. |
| Harness 7 ceiling | One-host real filesystem/Node/installed tools, compressed project fixture; no service/native/physical/full-corpus claim. |
| Harness 8 failure/progress | Product input-coverage defect, command typo and fixture timeout distinguished. Current-input safety fails M1; covered-input recovery works. |
| Admission 1 same authority | PASS reader shared by both consumers; FAIL M1 inputs do not predict what analyzer enforcement observes. |
| Admission 2 transient/hard | PASS: stale/invalid reports regenerate, unreadable I/O or invalid refresh throws; no quiet acceptance route. |
| Admission 3 budget | N/A new wait budget: sequential local tool commands use existing execution owner; no new timeout or retry tuning. |
| Admission 4 reason shape | PASS: null means unavailable current report, ensure throws report-specific refresh error; consumers share shape. |
| Admission 5 hold release | PASS covered bytes invalidation; FAIL M1 omitted bytes do not invalidate. |
| Admission 6 freshness | FAIL M1; pre/post capture and current reader otherwise compare content, not timestamps. |
| Admission 7 message honesty | PASS/SOURCE: errors identify metric id; no unrelated entity identifiers. |
| Admission 8 progress | PASS bounded source/config repair/refresh; no useful progress claim for an omitted dependency until M1 fixed. |
| Concurrency 1 serialization | SOURCE: final seal writes/rename synchronous; temporary names differ by PID. No new distributed claim/CAS. |
| Concurrency 2 TOCTOU | PASS bounded pre/post mutation check; source/tool/config quiescence is explicitly assumed. Mutate-and-restore races are not certified. M1 is independent of concurrency. |
| Concurrency 3 single winner | N/A durable single-winner authority: reports are replaceable derived material, not durable effects. |
| Concurrency 4 timers | N/A no timer or periodic refresh introduced. |
| Concurrency 5 lock scope | N/A new lock; concurrent tool processes were not stress-tested or claimed single-flight. |
| Concurrency 6 crash custody | PASS safety for invalid/unsealed output and atomic final sealing; abandoned PID temp-file cleanup/resource endurance not measured. |
| JS 1 numeric lattice | N/A new numeric policy: real metric producers own counts; this owner verifies provenance/content, not another metric validator. |
| JS 2 own fields | SOURCE: filesystem JSON parse produces data objects; internal measurement descriptors are trusted. Hostile inherited in-process descriptors are not a public boundary. |
| JS 3 accessors | N/A JSON report path has no accessor-bearing values; trusted in-process producer payloads only. |
| JS 4 prototype pollution | No polluted-runtime robustness claim; ordinary malformed/tampered JSON is measured and refused. |
| JS 5 exotic primitives | PASS JSON/null/malformed rejection; boxed JS inputs are not external disk encodings. |
| JS 6 mutable intrinsics | N/A global runtime replacement contract; Node/tool bytes and stated runtime identity bound, no hostile process claim. |
| JS 7 hashing coercion | PASS/SOURCE: file bytes and JSON-serializable internal records; payload digest checked; M1 concerns absent bytes, not coercion. |
| JS 8 arrays | SOURCE: canonical descriptor arrays and parsed report data, not adversarial in-process iterators; no duplicate domain array policy added. |

## History, research and remaining gates

History was independently inspected at f9f9fb797 (prior stale jscpd inventory),
b8a51c1e8 (shared jscpd cache nondeterminism) and 954caf554 (valid measurements
despite red ratchets). The candidate retains uncached jscpd analysis and keeps
ratchet enforcement separate from inventory measurement.

Primary cache references were checked: [Bazel remote caching](https://bazel.build/remote/caching)
describes action identity including declared inputs/commands/environment;
[Gradle build-cache concepts](https://docs.gradle.org/current/userguide/build_cache_concepts.html)
describes implementation/input identity and reproducible reusable results.
They support investigating complete inputs; they do not prescribe this
repository's local contract or justify narrowing its actual analyzer inputs.

The committed real broad measurement and matching-input 3.133-second,
five-report byte/inode plus inventory-byte preservation evidence are retained
as author/root evidence. No broad rerun was attempted during the reserved
native/heavy window. Those results do not refute M1's different input classes.
Normal-hook preservation is not independent approval. Quest receipt correctly
remains FAIL for independent review/applicable gates. Source repair, renewed
exact-source verification and applicable gates are required; whole-corpus,
publication and release acceptance remain separate.
