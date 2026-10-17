# Event-to-reconciliation implementation checkpoint

Implemented and author-reviewed locally. NOT pushed; no home-lab job submitted.
Base: PR133, `6ba84863490bff9a43874a03f69ad2afff4b5898`.

The bounded change connects native role/applied-progress events to the same
OwnerKeyReconcileQueue continuation used by explicit bound startup. It preserves
original creation identity and all serving holds. See REVIEW.md for ownership,
review findings, exact local evidence, fixture limits and open gates.

## Contents

- changes.patch: complete reviewed delta, including tests, generated metadata and
  two review records. Apply this once; the split patches contain the same changes.
- source.patch, tests-and-metadata.patch, review.patch: split inspection views.
- MANIFEST.json: exact published base, every changed preimage/postimage, source and
  test subtree identities, patch digest and final local result binding.
- evidence/: retained initial failures, successful local runs, full source-mutation
  outputs, static results, exact input-file fingerprints and session publication hold.
- lab-test-files.txt: 21 named files for subsequent use of the ordinary authorized
  private lab executor. This is a selection, not a submitted job or a lab receipt.
- verify-and-apply.py: guarded patch check/application, no network/test/commit/push.
- author-frozen-measurement.py and author-mutations.py: forensic copies of the cloud
  measurement scripts. Their original absolute paths identify the author workspace;
  they are not installation or home-lab launch scripts.

## Safe application to real ancestry

Use a NEW clean worktree at the exact published base, never the shared staged
checkout and never the cloud's synthetic reconstruction history. With the source
repository already present locally, the following only creates an isolated worktree:

```bash
git -C "$LAGRANGE_REPO" fetch --no-tags origin \
  refs/heads/work/rs-raft-genesis-observation-20261016
git -C "$LAGRANGE_REPO" worktree add --detach "$NEW_WORKTREE" \
  6ba84863490bff9a43874a03f69ad2afff4b5898
python3 /path/to/checkpoint/verify-and-apply.py "$NEW_WORKTREE"
python3 /path/to/checkpoint/verify-and-apply.py "$NEW_WORKTREE" --apply
```

Choose an unused NEW_WORKTREE path outside the checkpoint package. The verifier
refuses main/master, wrong base, dirty/index changes, unexpected files and mismatched
hashes. It applies/stages only after a dry application check, then verifies all
postimages and exact source/test subtrees. It never commits, pushes or tests.
If an unexpected post-application check fails, it leaves evidence intact rather
than resetting the worktree. Follow the repository's existing WIP review/publication
rules before creating a real branch, committing or publishing; this package waives
no gates. Do not repeatedly apply the same patch.

After legitimate publication to a named exact branch tip, run the selected tests
through the existing private lab bridge. Preserve first results. Do not install a
public self-hosted runner, weaken the bridge policy, or submit shell commands as
lab issue bodies. Current tools did not expose a write operation, so this checkpoint
contains no fresh ping, request ID or purported home-machine result.

## Measured, not inferred

The final frozen cloud run passed 21 distinct files / 733 runner-reported assertions.
New mechanism/native files contribute 8 + 4 cases; these are not 733 independent
cluster scenarios. Native RF3 uses real raft-rs and durable SQLite, but metadata,
transport and guest collaborators remain explicitly described in REVIEW.md.

Scoped static checks and generated metadata passed apart from four unchanged
pre-existing lifecycle decision findings. Full precommit/global analysis/change
cone/corpus, home-lab verification, serving/retirement and release acceptance remain
open. Main and shared local staging were not changed.

Verify all package members with `sha256sum --check SHA256SUMS` after extraction.
