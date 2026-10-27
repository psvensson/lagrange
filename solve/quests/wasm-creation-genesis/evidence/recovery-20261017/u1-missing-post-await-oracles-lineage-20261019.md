# U1 missing actual-return oracles: preservation lineage

Date: 2026-10-19. Investigator: `subagent:/root/lifecycle_design_research`.
Read-only investigation of source, history and the GitHub repository. Root
authorized this new evidence file; no source or test was edited, restored,
reconstructed or executed by this investigator.

## Finding

**The five approved additional physical actual-return oracles are missing
from the current published candidate. No deliberate supersession was found.**
The evidence identifies their authored checkpoint as a local commit whose
source bytes were not carried into the published evidence checkpoint.
The continuing candidate contains the unchanged earlier fourteen-case file.

This is an evidence-preservation and integration gap. It is not evidence that
the five tests passed, that their obligations were waived, or that any
unrecovered reconstructed file is identical to the originally reviewed bytes.

## Exact lineage

| Checkpoint or record | Observed identity and meaning |
| --- | --- |
| `7597e046f498980250de77b87ddb779f4542597e` | Reachable test-history entry adding the original nine independent physical-custody cases. |
| `9f815cf46f72cfdcd5d9ca4c7f95b23d6ace55b4` | Reachable test-history entry extending the file to fourteen cases. Its Git blob is `e7f4638a6d2b8353267d2efb3c5af9723682239e`. |
| Current candidate `a55ab41296faf30a4c404c56117eacbaa993c903` | The same physical test path has exactly the same Git blob `e7f4638a6d2b8353267d2efb3c5af9723682239e`, 461 lines and SHA256 `fa02bf81ef0e12dcef88a4be502bc3cec59e4fa6541cb59291136f0b1e618cad`. |
| `u1-post-await-independent-oracle-verdict-20261019.md` | Records independent oracle APPROVE for a 714-line, nineteen-case version with SHA256 `f0c173a391906e94c0d31d480b4515bb7546176066ce69a2f4442d3529f11bb7`, against production source tree `10a9c9d676d5b71e1b5d522f84882c596440e26a`. It expressly requires preserving and executing those expanded bytes and their distinct controls; it grants no U1 acceptance. |
| `u1-first-failure-and-set-b-checkpoint-20261019.json` | The `additionalOracle.localCommit` field names `b47c77b749cd39d3d4fd526d910ab51b366de583`, repeats the nineteen-case SHA256 and unexecuted oracle-only verdict, and retains the open gate for the complete frozen candidate including expanded lifetime oracles. |
| Published evidence commit `6f9193a71834816ac5a60bfb66aa47172f0e8665` | Its actual GitHub changed-file list contains the independent verdict, manifest, quest-log entry and lab/evidence files. It contains no change to `test/wasm-service/bound-creation-physical-custody.integration.test.js` or another source copy of those five tests. Its own commit message says evidence-only preservation. |

The quest log's original entry 61 corroborates the local checkpoint and hash.
The prior verdict describes five separately paused completed owner returns:
driver prepare to manager; physical PUBLISHED to driver; authoritative
PUBLISHED confirmation to manager; completed ACTIVE services writer to
runtime; completed endpoint writer to runtime. It also describes a changed
assertion order in the existing pre-start witness. These are recorded
requirements and descriptions; the missing source bytes were not available
to independently compare their implementation.

## Search and access results

The search covered the current checked-out repository and its locally known
branch/ref history, the quest's retained recovery evidence, and the connected
`psvensson/lagrange` GitHub repository. Specifically:

- `git log --all -- <physical-test-path>` returned only the original nine-case
  and fourteen-case additions. No reachable addition of the five cases or
  later removal/supersession appeared in this path history.
- `git ls-tree` independently confirmed the identical physical-test blob in
  `9f815cf4` and `a55ab412`.
- A local `GIT_NO_LAZY_FETCH=1 git cat-file --batch-check` reported the exact
  `b47c77b7` commit missing. This did not trigger an implicit network fetch.
- The connected GitHub commit endpoint returned HTTP 422, “No commit found
  for SHA”, for the full `b47c77b7` identity. The same connector successfully
  retrieved the published `6f9193a7` evidence commit and its changed-file list.
- Filtered local branch/ref names and recent commit subjects did not identify
  a separate retained U1 nineteen-case or actual-return checkpoint. A GitHub
  search for U1 post-await commits returned no result; the branch search
  returned an unrelated October 14 deadline branch. These search absences are
  supporting observations, not proof about unreachable server objects.
- Focused searches of test source, retained patches, manifests and review
  documents found the approval/manifest descriptions and earlier physical
  test, but no source copy of `pauseOwnerReturn` or the missing five bodies.

This investigation did not search a prior session's unavailable filesystem,
private backups, the user's external machines or conversation attachments.
It therefore does not claim that every possible copy has been destroyed.
The exact authored commit and expected complete-file hash are known; an
accessible source artifact with matching bytes was not found in the searched
scope.

## Consequence for continuation

The current fourteen-case file cannot inherit the nineteen-case review's
coverage. Its passing lab results remain evidence for the actual submitted
fourteen cases only. The five separate actual-return guard obligations and
their meaningful source-only controls remain open.

If the original local object or artifact becomes available, recovery should
verify the complete file against the recorded 714-line SHA256 before calling
it a restoration. If it cannot be recovered, recreate the five tests as new,
explicitly identified bytes, obtain an independent oracle review of their
real owner engagements and cleanup, preserve that new test checkpoint, and
execute it against the complete immutable candidate. A reconstruction cannot
reuse the old file hash or be described as an execution of the old reviewed
checkpoint. Root has acknowledged this distinction and assigned new test
drafting separately; this file author has not drafted those tests.

## Evidence bindings

| File, relative to this evidence directory unless a test path is shown | SHA256 |
| --- | --- |
| `u1-post-await-independent-oracle-verdict-20261019.md` | `a911e3308aa0aab2475fa424bf5ec37bd51fa294f5d0f3175a461e7165b130fc` |
| `u1-first-failure-and-set-b-checkpoint-20261019.json` | `e2d8a9c35dd158474979bfaabd5d1c11864eea2d4b2b46fbc870f523b470d9c0` |
| `test/wasm-service/bound-creation-physical-custody.integration.test.js` at current `a55ab412` | `fa02bf81ef0e12dcef88a4be502bc3cec59e4fa6541cb59291136f0b1e618cad` |

Authoritative published lineage URLs:

- [Fourteen-case preservation commit](https://github.com/psvensson/lagrange/commit/9f815cf46f72cfdcd5d9ca4c7f95b23d6ace55b4)
- [Evidence-only checkpoint](https://github.com/psvensson/lagrange/commit/6f9193a71834816ac5a60bfb66aa47172f0e8665)
- [Current published physical test](https://github.com/psvensson/lagrange/blob/a55ab41296faf30a4c404c56117eacbaa993c903/test/wasm-service/bound-creation-physical-custody.integration.test.js)

No original bytes or execution receipts were invented, and no historical
verdict, manifest or lab result was rewritten.
