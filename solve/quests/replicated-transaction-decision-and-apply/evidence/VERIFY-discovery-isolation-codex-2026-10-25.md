# Independent TX1 discovery-isolation review

Verdict: APPROVE the bounded source delta at 5ad35a427b70822fbf6d056abbe57d0675d644df against ce259dbfaf0da646df34c121ba0938a7a43e885a. This is not full TX1 acceptance, physical/native certification, or a claim that normal current-build BEGIN produces malformed retained rows.

Reviewer: subagent:/root/fresh_seed. Isolated candidate: /tmp/session-worktree-xEzrOc/tree. The author's worktree was read only. manifest.json binds all five changed paths; the sole production file SHA256 is 1826fbeabc5d9c52fddb17f8df6d666c5b1f2bd9fe65ab2371bdf9b680eee266. Candidate source was restored byte-exact after the base control; git status remains clean.

## Causal and owner assessment

runRecoverySweep now places discovery fetch and recoverFromSystemTables validation inside the same attributed discovery-refusal catch. The catch does not cover authoritative recovery or the per-session request owner. It neither repairs malformed rows nor reclassifies unknown authority as success. Its output retains the validator's errorCode, transactionId, sessionId and decisionDimension. Existing recoveryDiscovered obligations still enter redriveAuthoritativeRecovery under runTransactionOperation; the authoritative reader, decision validator and immutable decision remain the sole actuation authority.

The identity/epoch prevalidation loop in distributed-transaction-recovery.js remains before workflowCoordinator.recover. An input batch containing an otherwise valid new row followed by null epoch, missing transaction ID, or missing session ID installs neither row. Existing workflow and participant restoration algorithms are unchanged. Discovery may still refuse an entire batch; this repair promises progression for already retained IDs, not row-by-row salvage of a corrupt batch.

## Executed evidence

- existing.tap: four classified suites, 41 assertions pass, retries disabled. Covers owner-key, ownership/FIFO, recovered decision validation, and participant-set authority. Existing thermal gate held at 76C, then admitted at 72C; no override.
- independent-final.tap and probe.mjs: six independent cases pass. Three mixed-batch cases combine earlier valid discovery, malformed identity, an independently retained COMMIT, and a newer live owner under the same session. Direct refusal remains typed; neither discovery row is installed; unavailable authority causes no effect; later exact authority commits only the retained ID; newer live owner and object identity survive. Other cases cover typed fetch refusal, overlapping sweep exclusion and gate release after malformed discovery, and a later request-owner failure escaping the discovery catch while finally clears the gate.
- independent-base-control.tap: identical six-case probe with only the production recovery file restored from ce259dbfa fails all six. The three malformed batch cases fail from real TRANSACTION_RECOVERY_INCOMPLETE escaping runRecoverySweep before the retained authority read; the fetch case lacks the newly retained typed observation; the concurrent and downstream cases are intercepted by the old uncaught discovery refusal. Control source SHA256 baf0545c00233b55d59f0069e0485bf4b25a1bd8637747db71c96f00730c0c3e. This is a source treatment, not an altered success criterion.
- impact.log: registry PASS, 72 contracts / 44 coupled pairs, digest d0d848ea2bdbfefb632540b7956475e1733710129b8be297a25e230c37639dff. Both changed product/test paths remain covered by transaction-workflow-recovery-ownership; no new semantic owner or missing endpoint.

## Category-complete disposition

Recovery/replay: PASS. Existing live state and enlistment are not replaced; recovered obligations retain their exact ID, remain outside session binding and read authoritative state on each attempt. Missing/unavailable/invalid authority is held. Existing ownership and decision suites exercise stale participants, absent decision, inconsistent participant counts and exact immutable COMMIT completion. New mixed-batch probes demonstrate stale refusal followed by fresh authority within one owner lifetime. No durable replay or participant algorithm changed.

Owner interaction: PASS. Discovery supplies hints; query recovery owns admitted debt, workflow registry owns identity binding, authoritative transaction rows own progression. Paired safety/progress is exercised in the same mixed-batch cases and red on source restoration. The request FIFO, existing defer policy, timer and canonical retry entry are unchanged; no alternate raw reader, force flag, new queue or competing decision exists. Contract endpoints and witness classification remain live.

Retry/sweep: PASS within stated scope. A refused discovery does not block already retained IDs, including when discovery continues refusing after authority becomes available. One sweep scans the finite current registry and re-drives through the existing owner once per selected transaction; concurrent calls are skipped by recoverySweepInFlight. Existing defer checks run before discovery, per-owner deferrals remain unchanged and finally clears exclusion after refusal/failure. No cadence, retry budget, stop condition or timer ownership was changed. Completion removes recovery debt and prevents later sweep effects for that ended obligation. This is not an endurance or global registry-size bound.

Concurrency: PASS. The sweep marks in-flight before awaiting discovery; independent concurrent probe observes one fetch and a skipped overlapping call. The same per-session runTransactionOperation FIFO remains around actuation; existing ownership tests exercise delayed PREPARE/read and newer BEGIN boundaries. This change introduces no new check-then-act authority or independent claim.

Harness fidelity: PASS with limits. Existing author suites instantiate actual SQLQueryEngine/coordinator and SQLite persistence gateway while participant delivery is a deterministic protocol double. Independent probes exercise the actual coordinator/registry/validator/FIFO with explicit authoritative-reader and participant-effect seams. The authority changes from unavailable to an exact retained row; discovery never doubles as the authority. No timing compression is needed for the new causal distinction. These are deterministic component observations, not process-loss/native/distributed evidence.

## Preserved verifier observations and nonblocking inherited follow-up

The first independent probe mistakenly compared newly built getTransaction metadata by object identity; independent.tap and probe-verifier-error.mjs preserve that verifier error. After correcting to the actual workflow registry object, independent-corrected.tap found the inherited completed-workflow retention: a COMMITTED, recoveryDiscovered=false object remains in workflowsById after recovery debt is removed. probe-registry-observation.mjs preserves that assertion. The final probe asserts the existing registry semantics and preserves live identity; it does not assert size shrinkage. endTransaction and registry lifetime are byte-identical to the base and root confirms this is already an owned inherited follow-up, not a newly introduced defect or reason to invent TTL/cleanup here. Global retention/endurance remains outside this approval.

No source correction is requested. No author's files were edited, no commit/push/landing was performed, and no processes remain running for this review.

Reviewed at 2026-10-25T08:29:31.052807+00:00
