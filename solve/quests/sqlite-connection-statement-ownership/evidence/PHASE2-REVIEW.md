# Phase2 frozen review candidate - 2026-11-12

Status: frozen for fresh independent review, NOT migration complete. Only
`/mnt/data/peter/projects/lagrange-codex-statement-owner-20261112` was edited.
No commit, push, primary checkout or integration write. Parent owns review,
permission-worker composition, final production composition and lab acceptance.

## Exact scope

Read `phase2-candidate-manifest.json` first. The 95-path Phase2 delta comprises
14 production modules, 80 test/helper files and the impact contract registry.
It is separated from the unchanged approved four-file Phase1 and the 55-file
reviewed F carry-in. There are no unassigned source paths.

- Checkout HEAD: `1b51362e0f7af24a5e373b8a57619d4cf13ec706`.
- Original frozen F tree: `b8f0f6474fa013c8393460fa54e40a5be4793ea5`.
- HEAD plus the exact F carry-in: `d37078c8120e028fe91ef01bf50a051fe88104c0`.
- F plus approved Phase1 baseline: `671776ed958372170c1bbcd643f5d55c32cb9e45`.
- Phase2 source review tree: `6c4cc931f37e859e3fd70a429229a569027b5f09`.
- With locally regenerated metadata: `d5a04ef63685e9e61cad804772f2f7c31943a12d`.

These are trees, not commits or approvals. The Phase2-only patch is external at
`/tmp/lagrange-sqlite-phase2-max-20261112/phase2-only.patch`, SHA256
`877be0a2136bcd2997a423507c8ca44042514e221b03f59ad4f11d9714318e22`.
Generated metadata is separately enumerated; parent must regenerate it after
composition. Do not apply an old whole-branch patch as this delta.

## Change and caller evidence

Production acquisition now creates the canonical SQLiteConnection at ten sites:
replica opening, original-allocation custody, readonly lifecycle inspection,
memory/file hydration snapshots, checkpoint copy/validation and snapshot
installation. Supplied foreign handles are rejected before DDL, stamping,
reservation mutation or successful absence at the mapped cached-SQL boundaries.
The approved Phase1 private brand, caches and close ordering are unchanged.

`phase2-caller-provenance.json` records producer-to-consumer routes, all fourteen
retained production raw acquisitions, indirect fixture producers and the manual
shared-Database export resolution. The constructor census covers 396 sites:
124 owned and 272 native, including assignment and dynamic-import producers.
The reference audit complements it; neither is a whole-program execution proof.
The impact contract includes 26 owners/fixture producers and 79 tests.

Raw direct-SQL inspection/control-ledger/query fixtures remain native. Four
readonly observers that actually call cached readers were converted. The learner
process worker and persistence gateway default were also indirect producers.
The temporary createTable-only fixture conversions were reverted after tracing;
they are absent from this delta. Existing unrelated fallback/debt is not waived.

Connection Proxies cannot carry the private brand. Fault fixtures now instrument
the real connection and its statements without overriding the canonical bridge.
The history fault records its counter after setup, requires a positive delta at
the refused open before status inspection, and checks HOST_FAILURE at
DURABLE_RECORD_READ with the actual history IOERR/SQLITE_IOERR cause and no native
entry. Setup alone cannot satisfy engagement. All three original proxy failures,
the stale-name lint failure and the overpinned counter failure are retained.

## Separate F fixture causes

1. F-ao partial-schema witness lacked explicit birth. Scratch, capped and partial
   databases now use the canonical creator before deliberate partial durable DDL;
   the scratch budget includes lifecycle overhead. Six cases pass. F runtime
   freshness was not relaxed.
2. Receiver fixture construction had relied on implicit birth. Born never-opened
   receivers now use the canonical creator; malformed histories remain deliberate
   corruptions. The historyless empty-shell positive is explicitly superseded by
   refusal under reviewed F and the user's instruction. No Quest statement or
   doneWhen sealing that old positive was found; no seal was changed. The original
   64-pass/8-fail record is retained. **The complete 72-case receiver file remains
   explicitly UNRUN on repaired bytes until parent lab. Lint proves no runtime
   or staged-fault engagement.**
3. Load/replacement isolated copies omitted the new replica-database-fixture
   imported by partition-node-cluster. Both copy owners now copy and hash it.
   Each relative-import closure has 235 modules and no uncovered import;
   replica-lifecycle-fixture is not reachable. No source symlink fallback was
   added. Twelve final child receipts prove native trap engagement and exact
   copied-source identities. Original F lab failures (4 load, 8 replacement) are
   retained as fixture-copy failures, before native entry.

The permission test still has its original `skip: RUNS_AS_ROOT` condition and
assertions. Only constructor/import migration overlaps it. Newton
`01a1ce9a-e326` owns the separate no-skip change; parent composes it.

## Verification and remaining gates

`phase2-verification.json` binds the results and states their proof limits.
Fifteen focused files passed, reporting 187 cases. This includes boundary22,
checkpoint/install85, history16, load4 and replacement8. The two child files ran
on final source bytes; their receipts match every named copied source hash.
Other component results remain focused evidence, not full migration acceptance.

Scoped ESLint, strict size, cyclomatic/cognitive checks, runtime grammar and the
impact audit pass. Metadata was regenerated. The durable-store 801-line failure
was repaired by shortening a comment; an AST comparison confirms unchanged code.
The first AST helper failed on BigInt serialization; that evidence failure is
also retained and corrected without changing product bytes.

Three scoped guideline checks still report six inherited sites, proven against
the frozen F source and routed to parent:

- Hydration page: images_held literal at line139, independent semantic returns at
  line129, raw-null reason at line131.
- Lifecycle observation: retirementEvidenceOf catch/default at line238 and two
  retiredRefusalReason identifier sites at lines17/85. Site hashes match F.

No baseline was increased and these findings are not waived. The Quest remains
open: metric3, target0. Production-composition, independent-review and
static-guards receipts remain false. The full affected cone, receiver72 and final
permission-worker/production composition await parent lab and fresh review.

## Preservation and integration packet

`phase2-required-proof.json` is the compact inclusion list. Do not stage the whole
Quest directory: it also contains historical failed-source corpora that must
remain intact. `phase2-failure-ledger.json` retains every first failure and its
causal disposition, including earlier stopped implementations and F lab reds.

Additional external preservation archive:
`/tmp/lagrange-sqlite-phase2-max-20261112-raw-preservation.tar.gz`, SHA256
`b9867ee5d631c3970000547829ab13338e8e62d0dc89cac0efbd86cca2191486`.
Its 724 members were reopened and individually hash-verified. The inventory is
`/tmp/lagrange-sqlite-phase2-max-20261112-raw-inventory.json`, SHA256
`829e2cd72132915a594eeb0be92903cb7516ca80cd2d27ac8ca23751df2c37c1`.
All originals remain in place. Parent owns canonical evidence-store upload and
verification before any future retention decision; no upload is claimed here.
