# Lagrange handover: stopped foundation takeover

Prepared on 13 November 2026 after the owner's instruction: **“please stop
carefully and give a complete handover.”** Development, new lab admissions and
evidence requests are stopped. Subsequent work is confined to preserving WIP
and this handover. This document is a dated checkpoint, not an acceptance
contract or a replacement for the owning Quest records.

**No repaired candidate has been executed during this takeover. No foundation
acceptance, Solver land, merge into main, final whole-corpus proof or native
publication has been completed.** Source review and WIP transport are the
achievements recorded here.

The [preceding consolidation handover](handover-2026-11-13-foundation-consolidation.md)
remains the full record of earlier repairs, measurements and rejected attempts.
Its cursor-zero instructions and two unimplemented source findings are
superseded by the more recent facts below. Its historical results remain intact.

## 1. Stop state and immediate ownership

- All three development/review agents have frozen. No project test, parser,
  generator, probe, lint or static audit ran in this cloud workspace.
- The takeover admitted **zero new source-executing workloads**. The two newly
  reviewed original-control scripts have no request IDs or issue numbers; no
  payload was constructed, admitted or delivered.
- Eleven read-only evidence requests for two previously completed executions
  finished. There is no pending evidence request or in-flight lab API call.
  One source-free fleet observation also completed.
- Original executions **3686 and 3687** remain failed, with their execution,
  container and thermal scopes closed. Their complete output has not been
  retrieved or interpreted. Their individual causal results remain unknown.
- Historical **2696 remains untouched and uncertain**. The absence of a new
  active job says nothing about that older request.
- The receipt repair is included in the root takeover tree. The process repair
  is frozen on a separate branch and has not been composed into that tree.
- The sole external coordinator at the stop is `subagent:/root/receipt_envelope`.
  It is authorized only to finish WIP preservation for this handover. No
  continuing background polling, test execution or automatic resumption is
  scheduled.

The coordinator's last lab-related GitHub write was evidence request 3706 at
`2026-11-13T10:57:01.009Z`; its stopped checkpoint was recorded at
`2026-11-13T10:58:01.845Z`. Later WIP-only GitHub transport writes are tracked
separately. A successor must establish a new single coordinator and use the
latest write timestamp before any further external write.

Local coordinator files are under
`/workspace/scratch/93cc85be551a/lab-coordination/`. The compact retained
[stop/evidence manifest](../../solve/quests/reviewed-foundation-integration/evidence/takeover-handover-20261113/takeover-stop-evidence-manifest.json)
indexes immutable mailbox providers, hashes, cursors, closure and unsubmitted
recipe identities. It is a custody index, not a native execution receipt.

## 2. Exact source checkpoints

### Root composition and current main

| Purpose | Identity |
| --- | --- |
| Repository | `psvensson/lagrange` |
| Root worktree / branch | `/workspace/scratch/93cc85be551a/lagrange`; `work/foundation-takeover-20261113` |
| Published checkpoint received at takeover | `43e217c014017831cd3485b2e3c117451560a29e` on `wip/reviewed-delivery-composition-20261113` |
| Received complete tree | `b0879cc404cef96a5f90869d0364afa24a16cc87` |
| Fresh main fetched during takeover | `348796bca4b896b123def681b18941490de4d393` |
| Earlier main in preceding handover | `f402575b0667bc02110849867cabacf013e61be6` |
| Local main reconciliation | `6edba473663ef3e1f7c3a5df2c9a4801ef50258d`; tree `5b1dc2db54eb363b3700d707cc9b7db9a273fbe4` |
| Local scope/design record | `4d8b72b8046103b102d5f9f172f7d7b62ad0001b`; tree `bf0bf2fc0dcf9320c56e599bd0a3d70e580b852a` |
| Frozen root implementation before handover-only edits | `f99088dcc589b8c3fc74c4f53815ab8443a6d5c5`; tree `87a09e614323da24f9c619d145be8e924c9a9d34` |
| Product `src` tree throughout this takeover | `ec5f4204f8031d859808495365fda27e831a5a72` |
| WIP handover destination | `wip/foundation-takeover-20261113`; use the verified commit containing this note |

The final handover commit adds documentation, compact manifests, unchanged
reviewed recipes and append-only findings to the frozen implementation. Its
transport record and final handover response give the exact local/remote
mapping. The remote handover is an exact-tree preservation with real remote
parents `43e217c0` and `348796bc`; it does not pretend unpublished local
component commits are remote ancestors. Native fetch and whole-tree comparison
must establish the mapping before it is described as published.

Main's intervening PR207 changed thirteen steering/documentation files and no
executable source, script or test. The merge resolved only `home-lab.md` and
`solver-runbook.md`, preserving the candidate's single-attempt, no-reassignment,
first-failure and evidence-custody policy alongside main's substrate and
independent-review guidance. Eleven other documents equal fetched main. The
lab planning owner reference was corrected to `scripts/lab/lab-test.js`.

`subagent:/root/integration_review` approved exact merge tree
`5b1dc2db54eb363b3700d707cc9b7db9a273fbe4` for source/WIP preservation. That
approval is not runtime acceptance or approval of a later combined repair tree.

Current steering remains rule-set **revision 5**. Rules blob:
`0e63cfe4e528a7c8b8a1a7892efba6c6d4fc3019`; manifest blob:
`089ee1db29faa5c88495f155a579f919151251db`. Read current `AGENTS.md`, rules,
router and relevant owners again when source or policy changes. Proof code,
fixtures, selectors and operative acceptance documents require independent
verification, as does product code.

### Original controls, preserved separately from repairs

| Component | Local commit | Tree |
| --- | --- | --- |
| Receipt original controls | `dcd5b9a11094edcda6da94a38643904df63a01fb` | `73542c3a1d6cb25316b9514652ebf05d1dd23127` |
| Process original controls | `bc49be5a7575c04fbc8f31c4c94b8fde759d9ef7` | `93623db7325bec30e55b082d1863cfabd25c34cb` |
| Combined original controls | `37db4f646da103e83ac6bd2483e2b26da4156d58` | `07668b03cac68d967717ff2b61910fe10702b078` |
| Published equivalent of combined controls | `56d12341a67d8680b16f8f06847a2499f73b24f6` | `07668b03cac68d967717ff2b61910fe10702b078` |

Published branch:
`wip/foundation-boundary-original-controls-20261113`, with actual remote parent
`43e217c014017831cd3485b2e3c117451560a29e`. Native fetch, ref inspection and
whole-tree comparison verified this mapping. All production is unchanged from
that parent. Exactly four paths differ: the two existing test roots and the
new receipt Quest proposal/log. Both individual control sets and their combined
source received independent source approval. **None has been executed.**

The unchanged production blobs guarded by these original recipes are:

| Path | Original blob |
| --- | --- |
| `scripts/proof-receipt-contract.js` | `559e1b230d2cba0a052195f49e64d94580873195` |
| `scripts/publish-local-corpus.js` | `6b4359edb79b3883d00317a5343c43944e439a1c` |
| `scripts/publish-head.js` | `c65ef69993672e34237c98b7106582d92f5cb6ce` |
| `test/scripts/proof-receipt-execution-report.test.js` | `db1e0c3e11c04d1ce4bac1770e7d08c10a01d4c4` |
| `test/scripts/local-corpus.test.js` | `60e3239e6c6415b4955b8c69b9d5e668d347ad3d` |

These controls measure the original behavior of the two selected boundaries
at the reviewed foundation checkpoint. They do not replace earlier original
production `24060f4b` or any of its measured failures.

## 3. Receipt-envelope repair

Author worktree:
`/workspace/scratch/93cc85be551a/lagrange-receipt-envelope`, branch
`work/receipt-envelope-20261113`.

Final author commit **`e1904302556159259cc376cf5d2ba0d89a3f6bb7`**, tree
`b14fb9b5bc14fa88b19c29a5189deb473523ab35`, was independently source-approved
and merged into root `f99088dc`. The final reader blob is
`a41d46b4c37787f146679e5692070f02da741d5e`; its test blob is the original-control
blob `db1e0c3e11c04d1ce4bac1770e7d08c10a01d4c4` above.

Four paths belong to this package: the existing receipt-contract owner, the
existing execution-report test root, and `quest.json`/`log.ndjson` under
`solve/quests/proof-receipt-current-execution-envelope/`.

The shared receipt evaluator now requires the current producer's execution
envelope before a stored receipt can satisfy exact lookup, identity lookup,
indexing or same-head reuse. It checks a SHA-256 report digest, producer
attribution, finite nonnegative named summary numbers, no passed-on-retry
result, successful command summaries, and well-formed allowed reused-proof
references. An empty plan requires a cited proof. All consumer paths use the
same contract owner.

The reader deliberately preserves current producer semantics: corpus receipts
remain identity-free; a release citing the exact corpus proof may have zero
direct execution counts; fractional assertion counts and unnamed successful
commands are not rejected by new arbitrary restrictions. The summary is an
audit envelope, not a replay or independent validation of the full report.
The patch changes no report schema, identity algorithm, historical object,
historical ref or sealed historical acceptance record.

The original-control source contains **28 intended causal-negative cases**:
five missing-envelope consumer cases, twenty-one malformed corpus-envelope
cases and two malformed release-citation cases. These are authored case counts,
not observed failures. Fixtures use native `recordProof` and real Git tags/refs,
with valid producer output minted separately before mutations are stored.
Positive cases preserve exact/reusable corpus and cited release behavior.

Review caught an empty-plan/no-citation omission in an earlier candidate. The
author added the missing original-compatible control and fixed the final
reader. Earlier checkpoints remain in local history; do not execute or describe
an earlier patch as the final approved correction. The reviewer found no need
to expand the patch into existing proof-authority attribution or release
identity-negative fixtures.

The new standalone fix Quest is **unsealed**. Its required receipts remain:

- `original-real-tag-ref-controls`
- `current-envelope-at-every-reader`
- `valid-corpus-and-cited-release`
- `historical-objects-and-refs-retained`
- `independent-verification`

Its explicit supersession concerns current applicability of pre-report
receipts, including the old decision at `207d4f792` and
`proof-receipt-bound-to-validated-execution`. It leaves the historical sealed
Quest and its evidence intact. Original physical measurement, actual sealing,
candidate proof and normal landing are still owed. The WIP implementation and
source approval do not supply those events.

## 4. Process-observation repair, kept separate

Author worktree:
`/workspace/scratch/93cc85be551a/lagrange-process-observation`, branch
`work/process-observation-20261113`.

Frozen local commit **`07d915e3d040ae21936366dd28508f5bec15ca64`**, tree
`d4ec3c601672f975a81cac9aa400e30ae9b3eed1`, parent
`bc49be5a7575c04fbc8f31c4c94b8fde759d9ef7`. The tree is clean.
Separate WIP destination: `wip/process-observation-unavailable-20261113`.
Verified remote commit **`e85f4520389853cff58bed7169279133ef4960ef`** has the same
complete tree and product `src` tree as local `07d915e3`. Native fetch, branch
inspection and whole-tree comparison passed. It is a normal exact-tree squash
onto actual remote parent `43e217c014017831cd3485b2e3c117451560a29e`, not an
invented publication of local author ancestry. The compact transport record is
retained beside the handover evidence as `process-candidate-native-verification.json`.

The independent reviewer completed its bounded read before the stop and
approved these exact four blobs:

| Path | Approved blob | Native lines |
| --- | --- | ---: |
| `scripts/publish-local-corpus.js` | `883a743eed16a3ccbe6af86fd051da08a614883c` | 743 |
| `scripts/publish-head.js` | `d4ca7a40144c19b81f3a0454e43be6db44f5f397` | 733 |
| `test/scripts/local-corpus.test.js` | `262417744b2ac286593d3123b3f2681605f503dc` | 1,150 |
| `docs/development/solver-runbook.md` | `e5c5a1db1f821fcf56c510177bdbbba4f7d496a6` | — |

The existing owner distinguishes `PRESENT`, `ABSENT` and `UNAVAILABLE`, with
platform selection before observation. Linux reads `/proc/<pid>/cmdline`;
Darwin uses `/bin/ps -ww -o command= -p <pid>`, with a five-second timeout,
one-MiB output bound and `SIGKILL` for timeout termination. It does not change
observers after a failed read.

A positive safe-integer PID is required. A signal-zero `ESRCH` establishes
absence; other probe errors remain unavailable. After successful signal zero,
any Linux command-read error, including an `ENOENT` race, remains unavailable.
Successfully observed empty zombie/unrelated commands retain the existing
marker-based classification. The patch does not claim exact process-incarnation
identity. Darwin failed spawn, timeout, output-bound error, signal, nonzero
status, empty output and incomplete output remain unavailable. Unsupported
platforms are explicitly unavailable; this creates no general Linux-only rule.

An unavailable observation leaves the running record byte-for-byte unchanged,
reports its diagnostic and continues to later records. Both real consumers,
`publishExactHead` and `proveMergedHead`, forward their existing writers. A later
fresh reconciliation can observe the same record again. No unavailable veto is
persisted, and this path authorizes no workload kill, restart, cleanup or new admission.

Six frozen original controls cover command-read `EACCES` and `ENOENT`, signal
zero `EPERM`, Darwin platform selection, invalid recorded PIDs and unsupported
platforms. Their applicable fixtures use acknowledged real children, actual
state files, narrowly substituted observation seams, a real forbidden-`ps`
witness, later-record continuity, fresh observation after the fault and bounded
close-aware teardown. All six bodies are unchanged in the candidate.

Three candidate-only cases add the controlled Darwin response table and writer
propagation through the two public consumers. They were not present in original
composition `56d12341` and must never be credited to an original measurement.
The existing zombie case's title/comment changed; its body did not. No original
or candidate case has run. Simulating the Darwin branch on Linux cannot prove
native macOS execution or actual macOS subprocess closure.

The pre-edit design remains in the foundation Quest at
`evidence/process-observation-transition-20261113.md`. This separate process
branch is based on the pre-PR207 foundation checkpoint. When composing it later,
retain the root's newer runbook guidance; blindly replacing the whole runbook
from this branch would discard that reconciliation. Review the actual combined
tree after composition. No such composition was performed after the stop.

### Separate unresolved concurrency finding

The author found a pre-existing potential terminal-state overwrite:

1. `reconcileLocalCorpus` snapshots a record as `RUNNING`.
2. The child writes its terminal result and exits.
3. Reconciliation observes `ESRCH`.
4. Reconciliation writes `LOST` using its stale snapshot, potentially
   overwriting the terminal result.

This is a material source finding **without a physical witness**. It was not
fixed, and another ordinary read would not make the transition atomic. The
independent reviewer explicitly excluded atomic terminal-state preservation
and universal publication custody from its bounded process approval.

The existing publication/state-custody owner must retain this finding, design
a deterministic concurrent-writer witness, and determine the owned transition
if reproduced. Any later acceptance claim encompassing concurrent terminal
custody needs an explicit resolution or a clearly bounded claim. This finding
has been appended to the foundation Quest log; it is not silently absorbed into
the observation repair or dropped because that repair passed source review.

## 5. Previously executed originals: partial output custody

Both jobs below executed before the takeover at original production
`24060f4b393a3f392dd55a7bf0a8f2071c1af04d`, branch
`wip/publication-boundary-original-controls-20261113`, tree
`74b6b10516573b7e8020ba41c7fd423e0e293bdc`, `src`
`bc9e83a24cee235aa7fd33ff9777dc97d229903c`.

| Original | Host and test roots | Closed result | Retained prefix / full bytes | Next offset |
| --- | --- | --- | ---: | ---: |
| [3686](https://github.com/psvensson/lagrange-lab/issues/3686) | `adams-gamla`: `publish-head.test.js`, `release-proof-identity.test.js` | Worker 1; execution/container/thermal scopes closed at 09:50:42 UTC | 48,000 / 306,993 | **48,000** |
| [3687](https://github.com/psvensson/lagrange-lab/issues/3687) | `local-workstation`: `test-placement.test.js`, `placement-failure-custody.test.js` | Worker 1; all three scopes closed at 09:53:13 UTC | 40,000 / 264,616 | **40,000** |

The full hashes and totals are completion-provider claims pending complete
local retrieval and full-stream hash verification. Each retained chunk has
individually verified native byte length and SHA-256. The prefixes were read;
most available content is verbose installation output. There is no completed
whole-run causal review, individual failure total or candidate verdict.

| Identity | Original 3686 | Original 3687 |
| --- | --- | --- |
| Logical ID | `c158bfe8-6fe6-4b09-8152-6ce52945a7cf` | `28e62bb2-bc9a-4802-b002-57cae2e0aa60` |
| Wire job ID | `c158bfe86fe64b0981526ce52945a7cf` | `28e62bb2bc9a4802b00257cae2e0aa60` |
| Stream ID | `fc978cf685f90abe94be74bdef8275f4244384c79b6d915f39fe46d437d7ab51` | `bb3d340faec00cc91d6843d8f61c360654da9b6ad39bea3c0bd3ccba252618f8` |
| Full SHA-256 | `a9a28e7e39f69078bf3408620c39b2b1a515ab8fda24ca3a3313938cc374cdb2` | `f5992c970282c1f23b489ac00d476a93fa5523badd32b2974a30984a272855e7` |
| Evidence issues in offset order | 3695, 3697, 3699, 3701, 3703, 3706 | 3696, 3698, 3700, 3702, 3704 |

Each request read one plain window of 8,000 bytes. Offsets begin at zero and
advance contiguously. The manifest records every request URL, chunk hash,
provider identity and local file path. No request is pending. The latest Adams
chunk, offset 40,000, has SHA-256
`cabb96a75be36d444e26d01f8d3e043eea3470a7b6e4602dae25cb508f49fba2`.

Raw chunks and providers remain in the local coordination directory and the
persistent private `psvensson/lagrange-lab` mailbox issues. New bulk raw output
was not added to Git. No canonical `solve-evidence` upload/re-download receipt
was created. Once complete, retain raw output through that existing evidence
owner on a qualified physical lab; do not fabricate an upload reference.

Continue with the installed supported `lagrange-lab-job/v1` **`evidence`**
operation, the same original wire job/host/stream identity and the next offsets
above. Controller ID:
`b4a2e06c193c44b09f1b67d02e8d80f4`. Create a fresh evidence request ID and valid
timestamps for each window; retain the original source, byte identity and
closure facts. The installed maximum plain window remains 8,000 bytes. There
is no supported batch-read shortcut established by this session. Do not widen
the window, use encoded export as a bypass, or rerun either original workload.

Prior complete original measurements, including requests 3410, 3488, 3491,
3529, 3656, 3657, 3669, 3670 and 3671, are summarized in the preceding handover
and recorded in the original Quest logs. Those results have not changed.
In particular, the older TV setup deadline 3670 remains a failed attempt that
did not admit its roots; later requests do not erase it.

## 6. Reviewed original recipes: never submitted

The retained directory is
`solve/quests/reviewed-foundation-integration/evidence/takeover-handover-20261113/`.

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `boundary-original-controls-review.sh` | 4,542 | `df6057191e62c27d799f0c5bb491679014370053b50f1981af093add066b0b6c` |
| `boundary-original-adams-gamla.sh` | 4,593 | `802fa58f3232aca5f17e1e5dc4c53df3ea05288f5f9aba80b722224f92f10013` |
| `boundary-original-tv-dator.sh` | 4,572 | `f798053c3e1d9e934cc70780917dbfdf75c1e182b20563fbca2975a4ee0ded9c` |

The template was independently reviewed. Its only allowed substitutions were
expected host, test root and mapped remote SHA. The bound copies use exact
remote original-control commit `56d12341a67d8680b16f8f06847a2499f73b24f6`:

| Planned host | One root | Initial request shape |
| --- | --- | --- |
| `adams-gamla` | `test/scripts/proof-receipt-execution-report.test.js` | Count 1, jobs 2, `/bin/bash`, 1,200 seconds |
| `tv-dator` | `test/scripts/local-corpus.test.js` | Count 1, jobs 2, `/bin/bash`, 1,200 seconds |

They guard the exact source/tree/src, three original production blobs, both
test blobs, clean checkout and absence of changes outside the four allowed
paths. Runtime guards require Node `v22.23.2`, SQLite `3.49.2`, source ID
`2025-05-07 10:39:52 17144570b0d96ae63cd6f3edca39e27ebd74925252bbaf6723bcb2f6b4861fb1`
and addon SHA-256
`d7d9272b12d11c1dc2bb787741b1b7c4037d336155f316ace3420410c28fda37`.

Installation uses `npm ci --no-audit --no-fund` at default verbosity. Separate
setup/native/test statuses and a final source guard preserve the first actual
failure. An expected negative original does not get normalized into successful
acceptance. These are source-reviewed recipes, not execution evidence.

The source-free fleet observation [3705](https://github.com/psvensson/lagrange-lab/issues/3705)
completed at `2026-11-13T10:54:22.737Z`, collector source
`53e262450fada3b4e706898201a3c732811ae4d0`, fleet SHA-256
`5ce8afd338a224a42e2bcdba5d63c7a77c27f6a7edfaa00b127cefcd43d1820b`.
It observed Adams/TV/local free, with CPU temperatures 39/49/62°C; Adams lacked
Node on the basic PATH. Every `readiness.ready` was null. The frozen scripts
bind the known Node path, but the observation is **not route qualification**,
an execution reservation or proof of current readiness. Obtain fresh facts
before any eventual admission. The user's stop superseded the earlier plan
to admit the pair; neither was sent.

## 7. Acceptance remains open

Two earlier sealed fix Quests retain their exact contracts and failed original
receipt indexes. Neither has a new accepted candidate receipt:

| Quest | Sealing head | Required receipt names |
| --- | --- | --- |
| `reviewed-foundation-integration` | `2136438fe481822ffec62c68e1389639386c6b33` | `reviewed-source-composition`; `canonical-generated-inputs-and-selection`; `complete-required-physical-lab-execution`; `static-and-ratchet-gates`; `independent-composition-review`; `canonical-publication-policy` |
| `publication-single-pass-evidence` | `52160e58a09b01f8d4871b7408bd244280a4d442` | `original-causal-controls`; `single-pass-runner-and-placement`; `publication-evidence-custody`; `strict-native-proof-and-caller-regressions`; `independent-review`; `lab-canonical-static-and-whole-corpus` |

The new receipt Quest remains an unsealed proposal. Source approvals are
retained with exact identities; they are not fabricated canonical Solver
verification/measurement events. No historical receipt, seal, terminal record,
baseline or ratchet was weakened or rewritten.

The preceding handover retains three unsubmitted preparation/focused/route
templates under `evidence/handover-20261113/`. They need review and rebinding:

- `foundation-final-preparation-review.sh` still hardcodes old main
  `f402575b...` in six places.
- `foundation-final-focused-review.sh` still uses that old base. Its 32 roots
  in groups 10/9/13 already include the local-corpus and receipt-report roots,
  but exact source, applicability and any added controls need fresh review.
- `native-explicit-path-observation-review.sh` is an unadmitted observation
  recipe, not saved execution configuration or native publication proof.

Do not run those templates unchanged, edit generated artifacts by hand or reuse
the old request 3392 generated patch. Fresh canonical generation, reviewed
outputs, exact source freezing, applicable static/ratchet/changed-JS/changed-src
checks and focused physical tests remain owed.

The canonical full-corpus route remains:

```text
node scripts/lab.js test all --lane all --sha <final-source> --split
```

This command has no supported `--hosts`/`--nodes` shortcut; `--split` does not
combine with `--on`. Normal inventory still lacks a proved current route with
explicit peer repo paths. The prior normal inventory hash is
`d10bc1b11c2724a157b45d21c07496b93192f32787b390387d23a5595df7ae80`.
`/home/peter/projects/lagrange` is prior supplied peer input, not current path
attestation. Any reviewed ephemeral execution inventory must consume fresh
facts; cached capabilities do not configure execution or prove origin,
cleanliness, candidate presence or source admission.

The 1,200-second small-job recipes are not a protocol ceiling for an initial
full corpus. Plan the initial reservation from actual native policies,
including the thirty-minute shard-deadline floor and lock wait. Never extend an
already admitted failed attempt or repeat it to obtain green.

One applicable canonical pre-land corpus may discharge the two shared pre-land
obligations. It cannot prove the later Solver-landed final HEAD. After intended
Solver land, ordinary native `npm run publish` must run at that final HEAD and
persist actual proof/delivery artifacts. Verify the real remote head, receipt,
refs and checks. An exit code alone is insufficient. `corpus-full-v1` remains
exact-only; there is no citable-proof substitute. Trusted native publication
credentials and proof-custody route are not established by this handover.

## 8. Resumption order and constraints

When the owner asks to resume, the next integration owner should:

1. Read this note, the preceding handover and current source owners. Fetch the
   three preserved WIP branches and current main. Confirm exact identities,
   clean worktrees and the sole coordinator. Reconcile changes since this stop.
2. Finish **the same** original streams 3686/3687 from offsets 48,000/40,000.
   Verify full byte totals/hashes, read the complete streams and append actual
   native case/first-divergence findings with their evidence ceilings. Preserve
   closed failures and upload raw evidence through its owner. No workload replay.
3. Reassess fresh placement for the two reviewed but unsubmitted original-control
   recipes. Measure the unchanged originals once, retain the true results, and
   satisfy the actual sealing/recording obligations before candidate acceptance.
4. Route the separate terminal-state race to publication/state custody and
   obtain its discriminating concurrent-writer evidence before any broader
   custody claim. Keep it distinct from the approved observation repair.
5. Compose the frozen process repair with the root receipt/main tree, preserving
   newer runbook policy. Review the complete composition and actual callers.
   Bind final candidate checks to that exact source and to the correct original
   versus candidate-only control lineage.
6. Freshly generate, review and commit canonical metadata; run applicable
   static, focused and canonical physical whole-corpus proof. Retain every
   failed/unavailable attempt and repair only its demonstrated cause.
7. Complete the existing Solver and actual final-HEAD publication obligations.
   Verify persisted delivery before describing the foundation as accepted.
8. Only then reconcile the broad formation WIP, the simplified CURRENT edit and
   the remaining service owner interactions onto the accepted foundation.

Standing constraints remain: all project execution on qualified physical labs;
local source/Git/hash bookkeeping only; one external coordinator; at least
45 seconds between **all** GitHub writes, including Git-object creation and
branch updates; supported lab interface only; no raw SSH, credential searches,
controller upgrades or alternate artifact route; no retried or widened original
attempt, last-green substitution, weakened baseline or fabricated receipt.

Preservation commits disable project hooks with `LAGRANGE_SKIP_PRECOMMIT=1` and
`core.hooksPath=/dev/null`. This prevents prohibited local project execution and
does not supply a passing gate or ordinary landing. Native HTTPS fetch works;
native push authentication was unavailable in the earlier session. Exact-tree
GitHub transport with honest real parents is the established WIP route.

## 9. Wider foundation and formation work retained

The four extracted foundation cuts remain the intended bounded base:

| Cut | Reviewed source / prior PR state |
| --- | --- |
| PR203 JSON capture | Part of `10f3e795981b45b68bdfbee93fa6d1674d2a1a7f` on `review/lagrange-split-base-20261112` |
| PR204 durable store / Quest | Same split-base checkpoint; retain immutable database ownership |
| PR205 timer/reentry | `346d214ab8a39a4f86960a8b761df92412264724`; previously open draft |
| PR206 frozen lifecycle | `751a1076ab9ff9fa8a3a98766ad150b2a5338cfa`; previously open draft |

The prior check found PR203/204 merged into the review branch, not main.
This takeover neither rechecked nor modified those PRs. The root retains the
prior reviewed tooling repairs, fixture partitions and source-owner extractions
described in the preceding handover. Their physical acceptance remains owed.

The broad WIP remains **excluded**:
`9b870241b43f7dec9e7428f10c63156bb131b39a` on
`wip/cloud-authority-cdc-composition-20261112`. Simplified CURRENT remains
separately preserved at remote `bb0a896dca77d5bae69598999ca1e7678f5008ea` on
`wip/formation-continuation-20261113`, local
`fc4b15193835d9d566b6fb5f711cdd96d78e9a6e`, tree
`fd16122dd9065f582941e47d909935bbfbac845e`. Do not import the whole broad branch
to obtain that one document change.

The earlier inventory against then-current main had 1,533 WIP-changed paths,
173 main-changed paths and 48 differing overlaps from common base
`103f132c13268321445369d3b4c1183ca2c39c66`. It is historical inventory, not a
fresh reconciliation against `348796bc`. No broad reconciliation happened here.

Formation/census progress, authority/CDC source-image and effect custody,
lifecycle/removal/recovery, SQLite/checkpoint ownership, native-role acceptance,
composed service journeys and release delivery remain open at their actual
recorded scope. Rejected native-role work stays excluded; broader SQLite
migration remains on hold. The main epic's formation receipt still fails and
its aggregate has no accepted receipt. Preserve newer main's failure bundles,
Quest verification, lockfile, steering, deletions and tighter ratchets.

The pre-existing observation about ambient Git repository pointers also remains
unmeasured: if publication helpers are extended to hook contexts, trace the
canonical environment owner and prove explicit targeting rather than assuming
`cwd` defeats `GIT_DIR`. It was not a demonstrated regression of strict cleanup.

## 10. Workspace and evidence map

| Location | Purpose |
| --- | --- |
| `/workspace/scratch/93cc85be551a/lagrange` | Root implementation, current epic summary, append-only findings and this handover |
| `/workspace/scratch/93cc85be551a/lagrange-receipt-envelope` | Frozen receipt author lineage |
| `/workspace/scratch/93cc85be551a/lagrange-process-observation` | Frozen separate process author lineage |
| `/workspace/scratch/93cc85be551a/lagrange-original-controls` | Combined tests-only original-control local source |
| `/workspace/scratch/93cc85be551a/lab-coordination` | Eleven original chunks, request/providers, exact recipe bytes, stopped coordinator and transport records |
| `/workspace/scratch/93cc85be551a/process-observation-design.md` | Author-side design note, also retained in the foundation Quest |
| `/workspace/scratch/b510748fe8f7/lagrange-reviewed-delivery-20261113` | Preceding session's composed checkpoint and complete earlier handover |
| `/workspace/scratch/b510748fe8f7/lab-coordination-20261113` | Earlier complete streams/providers, original payloads, installed protocol source and old templates |

All Git worktrees share the original Git object store. A worktree's presence
does not mean an agent is still writing. Exact remote tree preservation is the
durable source checkpoint; local intermediate ancestry remains useful history,
not claimed remote ancestry. Keep the private mailbox evidence URLs and compact
manifest if the local coordination directory is no longer available.

This stop changes no acceptance status. Work is ready for an informed successor
to resume from preserved source and explicit evidence gaps when requested.
