# Process-custody stage 2: measured finding and correction review

Author review under the operator's 16 October instruction; not an independent
verifier, terminal Quest receipt or merge approval.

## First frozen lab measurement

At 9712d2633ed3d188faa2a418cca58c87db08045b, private lab request
7b43ae4b28004534be9666f9c653c21c completed on lenovo-laptop at
2026-10-16T11:36:24Z with exit 1: nine cases, eight passing and one intended
semantic failure in process-custody-review.integration.test.js. Whole-file
measurement was 11179 ms. No retries, timeout override or test edits.
Executor log: 5968 bytes, SHA256
34caf6515ca9be0ed9ee4066064af6fff1bdab9770ae7e1b9639ce1e60d3c7b8.
Request SHA256:
16b87678036cbac81faadca399827fdd2f2cf99b19340ca3dfea865007576755.
The controller's returned text was inspected; the raw local archive has not
been exported and no independent whole-archive verification is claimed.

The real startup collaborator recorded initialize then shutdown; its SQLite
resource stayed open, a contender remained refused, but cleanupErrorVisible
was false. The exact failing assertion was
STARTUP_MUST_PRESERVE_ORIGINAL_AND_CLEANUP_FAILURES. Healthy cleanup released
its directory and preserved the original startup rejection. Actual wrapper
collection, five falsy rejection controls, and native release failure passed.
Thus F1 is engaged by production startup, not inferred from setup failure.

## Bounded design amendment, accepted for measurement

The startup source is 796 lines, close to its unchanged 800-line ceiling.
Move its existing runStartupWithCleanup into the already-authoritative
entrypoint-startup-acquisition-ledger module and import that one function at
the unchanged call site. This consolidates the ledger's error handoff in its
existing owner; it does not add an owner, wrapper path or unrelated extraction.

After an initiating failure, wait for ordinary cleanup. If cleanup also
rejects, report AggregateError with exact original error first, exact cleanup
rejection second, and cause equal to the initiating error. No truthiness test
may turn undefined/null/false/zero/empty rejection into success. If cleanup
succeeds, rethrow the original value unchanged. A successful startup still
releases the ledger bookkeeping and returns its exact runtime.

Admission, cleanup order, directory lifetime, acquisition-before-abort,
registration-before-abort and the public facade's error normalization do not
change. No production or test budget changes. Existing and newly frozen
witness files must remain byte-identical for candidate measurement.

Review verdict: ACCEPT this correction for a candidate measurement. The
original repair is not yet accepted as a complete stage; candidate results
and controlled negatives are still required. The wider static/owner-debt
hold and full creation/genesis receipts remain unchanged.

## Premeasurement static observations

Scoped ESLint passes for all three original repair owners and frozen new tests.
Strict cyclomatic and cognitive checks pass for storage/ledger. Existing
classification and canonical import-graph refresh completed successfully with
normal dependencies. No limit, baseline, heap option or frozen test changed.
Two earlier graph commands and an accidentally unscoped complexity command
were interrupted by the cloud command limit; these are retained tool-attempt
failures, not behavioral evidence or claimed full-static results. The explicit
scoped complexity command completed successfully. Full global owner-debt
regeneration remains held; graph refresh is not that gate.
