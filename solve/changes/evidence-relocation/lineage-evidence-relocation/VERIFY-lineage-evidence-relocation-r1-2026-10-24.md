---
audience: development
documentClass: evidence
---

# VERIFY lineage-evidence-relocation r1 (2026-10-24)

## Verdict

**APPROVE for land.** One condition goes to the lead or owner: the sealed
`exact-measurement` clause "confirmed by test/scripts/closed-quest-shape.test.js and
test/scripts/solve-footprint-accounting.test.js green on a lab host" is NOT met by the recorded
evidence. Both tests timed out on adam-laptop and are green only locally (see section 8). If the
lead treats that sealed wording as binding without a disposition, it becomes the only REJECT
reason. Everything else checked out: relocation correctness, byte preservation, protection,
footprint, shape, archives, tool fidelity and current references. I found no mismatch.

## Identity

- Worktree: /mnt/data/peter/projects/.worktrees/lineage-evidence-relocation-20261024 (branch work/lineage-evidence-relocation-20261024, clean)
- HEAD a1a93b17693fc512e5e89021249daa51b8d95da1, tree fc9cb2d615d1fa7f10f898683e4a3633eb144861
- P = 31ee37359b142a976d880876bbfdf3e878ff3d97 (seal record); sealedAt 1538eeab9; pre-seal tooling be66e5034
- P..HEAD: a7f9dccda (relocation: 6089 D, 35 A, 32 M) and a1a93b176 (one log line). 0 paths outside solve/.

## Measured counts

| Item | Measured | Implementer |
|---|---|---|
| Deleted P..HEAD (`git diff --diff-filter=D`) | 6089 | 6089 |
| Inventory entries / unique paths | 6089 / 6089 | 6089 |
| Deleted set == inventory set (root + rel, LC_ALL=C sort, diff) | equal | - |
| Inventory paths still on disk / still tracked | 0 / 0 | - |
| Inventoried bytes | 102,563,964 | 102,563,964 |
| Bundles (index = shards = release assets = verification records) | 33 | 33 |
| Inventory sha256+size vs `git cat-file blob P:<path>` (all 6089) | 0 mismatches | 0 |
| solve-active-bytes | 19,172,198 of 20,971,520 (ok) | same |
| solve-files-over-1mb | 0 (only the allowlisted pre-v2 solve/quests/rolling-restart-core-stability/log.ndjson, 2,334,907 B, unchanged since 5271defb5, is over 1 MiB) | 0 |
| quest-dirs-off-shape | 0 | 0 |
| Archives under solve/ (`git ls-files solve \| grep -E '\.(gz\|xz\|zip\|tar\|tgz\|7z\|bz2)$'`) | 0 | 0 |
| Acceptance `--metric` | 0 (exit 0) | 0 |
| Acceptance `--json` | 8/8 conditions met, 0 problems each | 8/8 |

## Byte preservation: every bundle downloaded (all 33, not 3)

I downloaded all 33 assets (32 MB) with `gh release download solve-evidence -R psvensson/lagrange
--pattern <asset>`, each into its own directory. For each one I checked:

- the bundle's sha256 against the index's bundleSha256;
- no absolute, `..` or non-regular members;
- every member against its shard tuple (sha256 and bytes), against MANIFEST.json (path, sha256 and bytes), and against the blob at P;
- MANIFEST.sourceCommit == P;
- no unexpected and no missing members.

The release API digests (`gh release view --json assets`) also equal bundleSha256 for 33 of 33.
Script: `vscripts/bundles.js`. Log: `verify/bundle-verify.log`.

| Bundle (record quest / label) | Members | Bundle sha | Member mismatches | Unexpected | Missing | Manifest | Result |
|---|---|---|---|---|---|---|---|
| replicated-transaction-decision-and-apply (39,132,698 B, largest) | 1539 | ok | 0 | 0 | 0 | ok | PASS |
| lineage-evidence-relocation / seed-participant-release-native-startup-census | 22 | ok | 0 | 0 | 0 | ok | PASS |
| lineage-evidence-relocation / raft-rs-full-cutover-epic | 21 | ok | 0 | 0 | 0 | ok | PASS |
| lineage-evidence-relocation / changes-global-owner-debt-inventory | 1 | ok | 0 | 0 | 0 | ok | PASS |
| wasm-creation-genesis | 1394 | ok | 0 | 0 | 0 | ok | PASS |
| seed-participant-release-applied-position-barrier | 769 | ok | 0 | 0 | 0 | ok | PASS |
| seed-control-current-proof-amortization | 389 | ok | 0 | 0 | 0 | ok | PASS |
| retained-seed-original-handoff | 277 | ok | 0 | 0 | 0 | ok | PASS |
| runtime-captured-inbound-extent | 211 | ok | 0 | 0 | 0 | ok | PASS |
| participant-release-held-recovery-continuation | 199 | ok | 0 | 0 | 0 | ok | PASS |
| seed-participant-release-failure-projection-alpha | 175 | ok | 0 | 0 | 0 | ok | PASS |
| message-group-fresh-identity-membership | 171 | ok | 0 | 0 | 0 | ok | PASS |
| tx1-single-path-alpha | 143 | ok | 0 | 0 | 0 | ok | PASS |
| startup-refusal-cleanup-custody | 101 | ok | 0 | 0 | 0 | ok | PASS |
| message-group-c2-orphan-removal-alpha | 92 | ok | 0 | 0 | 0 | ok | PASS |
| replica-opening-history | 77 | ok | 0 | 0 | 0 | ok | PASS |
| runtime-ordering-completion-consumer-proof | 76 | ok | 0 | 0 | 0 | ok | PASS |
| seed-release-failure-custody | 70 | ok | 0 | 0 | 0 | ok | PASS |
| decision-audit-dependency-construction | 54 | ok | 0 | 0 | 0 | ok | PASS |
| participant-release-completion-owner | 52 | ok | 0 | 0 | 0 | ok | PASS |
| cleanup-exception-audit-correspondence | 47 | ok | 0 | 0 | 0 | ok | PASS |
| participant-release-owner-cycle-removal | 42 | ok | 0 | 0 | 0 | ok | PASS |
| participant-control-refusal-provenance | 40 | ok | 0 | 0 | 0 | ok | PASS |
| participant-release-deadline-recovery-witness | 33 | ok | 0 | 0 | 0 | ok | PASS |
| cutover-transition-authority-review | 23 | ok | 0 | 0 | 0 | ok | PASS |
| seed-control-authority-first-divergence | 23 | ok | 0 | 0 | 0 | ok | PASS |
| exact-handler-fixture-custody | 20 | ok | 0 | 0 | 0 | ok | PASS |
| wasm-writer-slots-v1 | 13 | ok | 0 | 0 | 0 | ok | PASS |
| replica-cleanup-host-custody | 4 | ok | 0 | 0 | 0 | ok | PASS |
| snapshot-receiver-admission | 4 | ok | 0 | 0 | 0 | ok | PASS |
| zero-liferaft-active-runtime | 3 | ok | 0 | 0 | 0 | ok | PASS |
| rs-raft-admitted-inbound-liveness | 3 | ok | 0 | 0 | 0 | ok | PASS |
| seed-release-once-per-partition-cohort | 1 | ok | 0 | 0 | 0 | ok | PASS |
| **Total** | **6089** | 33/33 | 0 | 0 | 0 | 33/33 | **33 PASS** |

The committed records are consistent with this:

- relocation-verification.json holds 33 records, all `verified: true`, 6089 members.
- Each record's shardSha256 equals its committed shard (the checker's bundles-verified condition is met).
- Each bundle's owner-appended evidence finding is on its quest's log, with sha256 == bundleSha256 and url == inventory url (33/33). The three lineage-evidence-relocation-labelled bundles are recorded on this quest's log.
- The index and verification files are 25,033 B and 41,433 B; the largest shard is 228,612 B. All are under 1 MiB.

## Findings by category

### 1. Inventory completeness: PASS

The deleted set equals the inventory set exactly (6089 each). No inventoried path exists on disk
or in the index. Every shard is indexed and every shard header equals its index entry.

Gap in the probe (not in this landing): the acceptance checker's `relocated-paths-absent`
condition is one-way (scripts/checks/evidence-relocation-acceptance.js, relocationAcceptance,
condition ABSENT). It reads only the tree, so a file removed but never inventoried would not
make it red. The sealed "inventory complete for every removed path" therefore rests on this
independent `git diff` check, which holds.

### 2. Byte preservation: PASS (all 33 bundles, all 6089 members; see the table above)

### 3. Protection: PASS

- doneWhen-required artifacts (`requiredProofArtifacts` from scripts/solve/probes.js, over every solve/quests/*/quest.json): 405 total; 95 under solve/quests or solve/epics, all present; 0 required paths in the deleted set; 309 legacy paths outside reach already missing (matches the sealed constraint's 309/405).
- No quest.json and no log.ndjson was deleted or modified, other than appends. 31 logs changed; for each, the bytes at P are an exact prefix of the bytes at HEAD: 30 logs gain +1 line, and lineage-evidence-relocation gains +6.
- seed-participant-release-native-startup-census: quest.json, log.ndjson and evidence/receipt.json have identical blob ids at P and HEAD, so its terminal entry (the last line, ts 2026-10-13T19:01:51Z) is byte-identical. It had 25 files at P; the other 22 exactly equal the census shard's 22 paths (diff empty). The census bundle passed every check.
- The relocation record for the census is solve/quests/lineage-evidence-relocation/log.ndjson line 4 (finding kind evidence, sha256:6f7bd69f… == the census bundleSha256).

### 4. Kept-set reasoning: PASS (with a note)

- Exact references: 133 distinct `solve/(quests|epics|changes)/…` path tokens in src/ scripts/ test/ .github/ package.json at HEAD; 0 are in the deleted set.
- Code-named documents are kept:
  - solve/quests/seed-control-current-proof-amortization/evidence/release-linearization-rev2-addendum-20261015.md (test/model/participant-release-disposition/model.js:3-4)
  - …/native-runtime-service-w07-20261015/WITNESS-PLAN.md (test/raft/raft-rs-backend/runtime-captured-inbound-service-native.test.js:2)
  - solve/quests/wasm-creation-genesis/evidence/recovery-20261017/u1-post-await-independent-oracle-verdict-20261019.md (test/wasm-service/bound-creation-physical-custody.integration.test.js:503-504)
  - solve/quests/replicated-transaction-decision-and-apply/evidence/runtime-load-recovery-20261012/recovery-load-order.patch (.github/workflows/rs-raft-load-recovery.yml:9,73)
  - solve/epics/raft-rs-full-cutover/census-bounded-waits-2026-10-04.md (test/distributed/harness/scenario-certification.js:127-129), not evidence
- Directory and prefix references from code into relocated directories are all producers or diff scopes, not readers:
  - the `DEST=…/evidence/<prefix>-$GITHUB_RUN_ID…` lines in 10 rs-raft-* workflows;
  - the `git diff -- solve/quests/<q>` lines (rs-raft-opening-history.yml:90, rs-raft-partition-tx1-admission.yml:88);
  - the classification lists in test/shards/subsystem-classes.json.
  This is consistent with the recorded lead ruling "directory/prefix references from code do not keep files".
- retained-seed-original-handoff: 356 files at P, 79 at HEAD. Every top-level 2026-10-23/24 CONTRACT/PLAN/DESIGN/DESIGN-VET/DOSSIER/REVIEW/LAB-REVIEW/FEASIBILITY/HANDOVER/MANIFEST/RECEIPT document is kept (75 files dated 10-23/24), plus design.md and receipt.json. No .md dated 10-23/24 was removed. Removed: older 10-21/22 HANDOVER/PLAN/REVIEW .md files (outside the sealed "at least 10-23/24") and raw measurement subdirectories, including mg-delivery-stop-state-2026-10-23/MANIFEST.json, a data manifest inside a relocated raw directory.
- wasm-creation-genesis/evidence/recovery-20261017: .md files 66 at P, 66 at HEAD (all kept).
- Note: the kept current retained-seed documents cite relocated paths, and I did not rewrite them. Counts: MANIFEST-mg-delivery-witnesses-r1-runtime 65; the fixture-trace manifests 33 + 33; the s2-baseline manifest 27; RECEIPT/MANIFEST user-handover 6 + 5; REVIEW-retained-effects-replacement 5; HANDOVER-retained-effects-recovery 1. These are recoverable through the retained-seed log's evidence finding and the inventory, which fits the owner's "Historical documents can remain unchanged when their evidence is recoverable". No pointer line was added inside those documents.

### 5. Footprint, shape and archives: PASS

- `solve-v2-budget.js --json` exits 1 only on legacy-corpus-drift ("no migration inventory: run migrate-v1 --inventory-from <commit>"). This is pre-existing: solve/epics/solve-v2/migration-inventory.json is absent at P, at d60c30921 and at origin/main (deleted by ad2b565cd). It is not a gated row of this quest.
- check-closed-quest-shape: "closed-quest shape: clean" (exit 0).
- audit:quest-log-append-only: "quest-log append-only: clean" (exit 0).

### 6. Tool fidelity: PASS (with notes)

- Refusals happen before any upload. relocationPlan (scripts/solve/commands.js:591-608) calls refuseListed(relocationRefusals(...)) for paths outside solve/, `..`, quest.json, log.ndjson, required artifacts and duplicates (evidence-store.js:252-277). It then refuses paths not a blob at the source commit and tree drift (evidence-store.js:345-361). Only after that does it bundle. The reasons are a named enum, RELOCATION_REFUSAL (evidence-store.js:187-196), which satisfies R07.
- The upload goes through the existing `evidenceAdd` (commands.js:529-546, called from uploadRelocation at commands.js:617-625). That routes to uploadAndVerify (evidence-store.js:103-145): no `--clobber` unless replace is authorized, and it re-downloads and re-hashes. This is reused, not copied.
- The second download is independent (verifyRelocationBundle, evidence-store.js:461-489, fresh mkdtemp). It refuses unsafe member names (403-420) and hashes members against both the manifest and the blob (422-445).
- bundleVerified (commands.js:610-614) gates everything. On failure it refuses before recordRelocation and removeRelocated (commands.js:650-657). removeRelocated does `git rm --pathspec-from-file` with NUL separators, never a glob (577-584).
- Note: on a failed verification the asset stays on the release, and evidenceAdd's evidence finding is already appended. Nothing is removed and no inventory is written, so this fits "nothing is removed on any mismatch". The test "records nothing" checks only the inventory.
- The acceptance checker (scripts/checks/evidence-relocation-acceptance.js) imports no child_process or network module and only reads files. The only spawns come from the consumed budget owner (solve-v2-budget.js:148 `git ls-files`, quest-record-transitions.js), which are local git reads. This satisfies R27.
- Unit tests (fixture repo with a fake release) cover: list parsing, every refusal class, absent or drifted sources, the manifest, member verification, dry-run touching nothing, a required artifact refused with `release.calls == []`, a tampered second download removing nothing, and an end-to-end run whose records meet acceptance. I ran `npm run -s test:file -- test/scripts/evidence-relocation.test.js test/scripts/evidence-relocation-acceptance.test.js`: 2 files pass, 18 assertions.

### 7. Current references: PASS

- solve/epics/raft-rs-full-cutover.md:961-962 and solve/epics/raft-rs-full-cutover/evidence/lineage-hygiene-2026-10-24/INVESTIGATION-closed-quest-audits-2026-10-24.md:344-345 each gain one appended pointer line (a pure append: two `+` lines, no `-`).
- The pointer's phrase "(bundle, sha256, URL per path)" is loose: per-path sha256 lives in the shards, while the index is per bundle.
- No script, test or workflow reads a removed file (section 4).

### 8. Lab

From lab-run1.log on adam-laptop:

- Placement head was a7f9dccda (HEAD a1a93b176 differs by one log line).
- 233 files: 230 pass, 3 fail.
- test/scripts/closed-quest-shape.test.js: 0 assertions, 600039 ms of a 600000 ms budget, SIGKILL (line 275-276).
- test/scripts/solve-footprint-accounting.test.js: 0 assertions, 600113 ms, SIGKILL (line 286-287). Eight lines of `fatal: Not a valid object name origin/main` come just before it (278-285).
- runtime-service-replace-canonical-target-handoff failed (line 74). The implementer calls it pre-existing; I did not check that.

From local-shape-footprint.log:

- Both tests pass locally (298,148 ms and 298,583 ms, 13 assertions).
- That log does not record which head it ran on (unknown).

Fact for the lead or owner: at speed factor 2.00, a test that takes about 298 s locally needs about 596 s or more on adam-laptop, against a 600 s budget. On top of that, the lab checkout has no origin/main ref, and the transition and base resolution needs one (quest-record-transitions.js and check-quest-log-append-only.js compute a merge base with origin/main). So the sealed wording "green on a lab host" is not satisfiable from the current evidence without one of these:

- a lab placement fix (an origin/main ref in the lab checkout, and/or budget headroom for these tests);
- a faster lab host. Whether one would pass is unknown; I did not test it.

I did not re-run on the lab.

### Other observations (non-blocking, outside the P..HEAD scope)

- Recurrence vector: 10 .github/workflows/rs-raft-*.yml jobs still write `raw-evidence.tar.gz` into solve/quests/*/evidence and commit with `LAGRANGE_SKIP_PRECOMMIT=1` (e.g. rs-raft-tx1-envelope-m1.yml:98-103). The new docs route (docs/development/quest-artifacts.md:38-70) and the binary guard (scripts/checks/check-solve-binary-guard.js:44) do not stop a skipped hook. These workflows pin old src trees, so they are probably dead, but that is unknown. Workflow changes are outside this quest's sealed scope.
- Pre-seal commit be66e5034 also changed solve/changes/global-owner-debt-inventory/inventory.json (regenerated digests) and test/shards/*.json (regenerated metadata). test/shards is not in the sealed scope list. It is pre-seal and not part of P..HEAD.
- The owner decision ("OWNER DECISION 2026-10-24 on the lineage evidence footprint", 08:45:33Z) is on the retained-seed log of work/mg-delivery-resume-r2-20261023 (and four other work branches), not in HEAD's ancestry. Its text says "Applied as process Quest … (epic raft-rs-full-cutover …)". The sealed quest is class fix with no epic, which constraint no-epic-by-design explains.
- The owner's D3 "explicit relocation record on the remediation quest" is met by line 4 of this quest's log, and the census log is untouched.

## What I ran (logs under /tmp/claude-1000/-mnt-data-peter-projects-lagrange/c74561e1-2969-4696-bd5a-1d3a410f38a7/scratchpad/relocation/verify/)

- `git diff --diff-filter=D --name-only P HEAD` > deleted.txt. Inventory flattening: vscripts/inv.js > inventory-paths.txt, inventory-entries.tsv, bundles.tsv. Set diff: equal.
- vscripts/blobs.js: 6089 inventory tuples against `git cat-file blob P:<path>`. Result: ok 6089, bad 0.
- `gh release view solve-evidence --json assets` > assets.json: 33/33 digests match.
- `gh release download` ×33 into dl/<n>/, extracted into x/<n>/. vscripts/bundles.js > bundle-verify.log: 33 PASS.
- vscripts/req.mjs: required-artifact census (405 / 95 / 0 missing / 0 deleted / 309 legacy).
- Log append-prefix check (31 logs), census blob identity, census 22-path diff.
- Grep of code references (code-refs.txt, code-ref-deleted.txt = empty).
- `node scripts/checks/solve-v2-budget.js --json` > budget.json; `node scripts/checks/check-closed-quest-shape.js` > shape.log; `npm run -s audit:quest-log-append-only` > append.log; acceptance `--metric` (0) and `--json` > acceptance.json. Combined console output is in the task output b9dm80rle.
- `npm run -s test:file -- test/scripts/evidence-relocation.test.js test/scripts/evidence-relocation-acceptance.test.js` > unit-tests.log.

## Limits

- I did not re-run closed-quest-shape.test.js or solve-footprint-accounting.test.js, locally or on the lab. I relied on the implementer's logs.
- I did not run `solve land` guards or `npm test`.
- I did not verify the implementer's claim that runtime-service-replace-canonical-target-handoff is pre-existing.
- The head that local-shape-footprint.log ran on is unknown.
- The release's no-overwrite property was verified from code (no `--clobber` without an authorized replace), not exercised against GitHub.
