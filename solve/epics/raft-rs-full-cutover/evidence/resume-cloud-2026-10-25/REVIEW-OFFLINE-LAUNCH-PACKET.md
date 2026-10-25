# Source review of the offline launch packet

Reviewer: `subagent:/root/metric_review`. Date: 2026-10-25.

**APPROVE the corrected canonical-startup launcher and marker measurement invocation for their stated source-level purpose.** Nothing was submitted or executed by this reviewer. The marker implementation remains HOLD pending its actual boundary measurement, and no canonical startup receipt has been produced by this check.

## Canonical startup launcher

Reviewed `launch-canonical-startup.sh` SHA256: `0850464c4c09578c0a99c3ec81c1bfda26bc6bd8d6e3b6a1ae611951437e06a1`.

The launcher requires clean exact integration `709dc2bebd4abdbec9a5d4fb2232c2621d7897f7`, checks for the installed dependencies and Node, and copies the existing controller to a new temporary run directory. It verifies controller SHA256 `0abad2b9ecbb448a5137a34256ccbdc563057673601a6f3b7b6519e2e15ab7a9` before invoking it. The inspected controller bytes match that hash. The wrapper checks `LAB_REQUEST_ID` and tells the operator to launch from the ordinary controller terminal, outside the generic worker. This preserves the existing controller as the machine-lock and thermal-admission owner rather than nesting the same lock.

The unchanged controller retains the original group custody, file-backed stdout/stderr, thermal gate, exact clean source checks before and after acquisition, sealed writer, post-writer source check and cleanup before lock release. The wrapper adds no product source cleanup, forced process termination, retry, second receipt writer or replacement acceptance predicate. After an ordinary controller return, collection records its status and hashes, archives the retained run directory, and exits with that controller status when collection succeeds. Collection failure remains a visible wrapper failure, with the run directory retained.

### F-PACKET-1, corrected in source

The first wrapper used `run_root.with_suffix('.zip')`. Because the mktemp directory ends in a dot followed by its unique random suffix, that operation discards the uniqueness and targets the same `/tmp/lagrange-fresh-seed-709dc2b.zip` for every invocation. Exclusive-create ZIP mode then makes later collection fail while an earlier archive remains. This was a source-derived packaging defect, not a measured controller or product failure.

The correction appends `.zip` to the complete path with `Path(str(run_root)+'.zip')`, retaining the unique run identity without deleting, overwriting or retrying an older archive. A bounded source census of this packet and repository lab/check scripts, plus Python/shell/MJS files under scripts/src/test, found no second occurrence of the same archive construction. No exhaustive pre-existing commit-history claim is made. Python's primary `pathlib` documentation confirms that `with_suffix` replaces an existing suffix: https://docs.python.org/3/library/pathlib.html#pathlib.PurePath.with_suffix.

## Marker measurement invocation

The prepared marker job names exact source `701d7c6af40ba25afa88cdc2ba1b2b30534bb213` and checks HEAD and clean status before measurement. It retains the declared zero-retry, single-lane local execution policy. The embedded payload decodes to the exact previously reviewed witness, SHA256 `86645892da9d2b2aa2ebcc6254bd969728eace5ac8cdc59742022cb0ef565dd6`, and its generated `prepared-marker/work.sh` matches the job script exactly. The witness is written once into `LAB_WORK_DIR` and receives the actual source working directory as its root argument.

The four protected marker source files were independently fetched from GitHub at that exact remote SHA. Their Git blob identities match the reviewed local bytes, and all four local SHA256 values match the witness's embedded source assertions. Those checks are recorded in `launch-packet-source-review-binding.json`. This resolves the local checkout's absence of the remote commit object without substituting an unverified local source version.

The invocation is suitable for the declared isolated real HTTP/owner/gateway/CDC-SQLite boundary measurement. It supplies no physical partition, distributed CDC, or native three-replica acceptance. Actual dependency installation, runner capability/admission, execution and terminal collection are still unmeasured.

## Packaging binding

The inspected ZIP has SHA256 `1118099a4079648e3c7498b81b88d0429c84029cce8da0e173c3827c6685e77c`. Its launcher, jobs JSON, marker witness and prepared marker script exactly match the reviewed disk files. Jobs JSON SHA256 is `0840cfbfc8981f8ba0a06fdb08cf3cf06b0e55aac71b2d799f79db42ce823b6c`.

This review covers the launcher and marker invocation requested by the coordinator. The other jobs and protocol-generator behavior are not independently approved by this report. Prepared files are not submissions, and source review is not runtime acceptance.
