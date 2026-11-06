/**
 * Fixture derivation worker: the thread starts and exits before deriving
 * anything. That is an infrastructure failure, not a property of the
 * component, so it must not become a permanent refusal for the digest.
 */
const WORKER_EXIT_CODE = 1;

process.exit(WORKER_EXIT_CODE);
