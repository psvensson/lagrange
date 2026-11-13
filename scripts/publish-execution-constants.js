// Shared publisher command, proof invocation, and checkout custody values.
// Each value keeps one owner across publication and the detached corpus.

const PIPE_STDIO = 'pipe';
const INHERIT_STDIO = 'inherit';
const NEWLINE = '\n';
const ARG_SEPARATOR = ' ';
// Where the publisher's clean temporary checkouts live (gitignored).
const PUBLISH_WORKTREE_PARENT = Object.freeze(['test-output', 'publish-worktrees']);
const PUBLISH_WORKTREE_PREFIX = 'head-';
const WORKTREE_COMMAND = 'worktree';
const WORKTREE_ADD = 'add';
const QUIET_ARGUMENT = '--quiet';
const DETACH_ARGUMENT = '--detach';
const PUBLISH_CLEANUP_UNAVAILABLE = 'publish: checkout cleanup unavailable at ';
const PUBLISH_ACQUISITION_UNAVAILABLE =
  'publish: checkout acquisition unavailable; original kept at ';
const PUBLISH_VERIFIED_HEAD = '; verified published head ';
const PUBLISH_RECEIPT_AT = '; publication receipt ';
const PUBLISH_RECEIPT_UNAVAILABLE = '; publication receipt was not written';
const ORIGIN_REMOTE = 'origin';
const MAIN_BRANCH = 'main';
const FETCH_COMMAND = 'fetch';
// The whole corpus is a fact about the commit, so a gate run that proved it
// leaves a durable receipt - but only AFTER the push, when the commit is on
// origin/main and the receipt's own push is exempt from the gate. Recording
// inside the gate re-entered it and always timed out
// (proof-ref-push-fast-path). The gate's scope file is the fact: the run that
// decided writes it, and it names the sha it proved.
const PROOF_AUTHORITY_SCRIPT = 'scripts/proof-authority.js';
const PROOF_RECORD_COMMAND = 'record';
// The receipt is recorded only from the run's execution report
// (proof-receipt-bound-to-validated-execution).
const PROOF_REPORT_FLAG = '--report';
const CORPUS_PROOF_ID = 'corpus-full-v1';
const RECORD_TIMEOUT_MS = 60000;
const FIELD_FULL_CORPUS = 'fullCorpus';
const FIELD_SHA = 'sha';
const RECEIPT_NO_REASON = 'the authority gave no reason';
const FILE_ALREADY_EXISTS = 'EEXIST';
const FILE_NOT_FOUND = 'ENOENT';
const UTF8 = 'utf8';
const REV_PARSE_COMMAND = 'rev-parse';

export {
  ARG_SEPARATOR, CORPUS_PROOF_ID, DETACH_ARGUMENT, FETCH_COMMAND,
  FIELD_FULL_CORPUS, FIELD_SHA, FILE_ALREADY_EXISTS, FILE_NOT_FOUND,
  INHERIT_STDIO, MAIN_BRANCH, NEWLINE, ORIGIN_REMOTE, PIPE_STDIO,
  PROOF_AUTHORITY_SCRIPT, PROOF_RECORD_COMMAND, PROOF_REPORT_FLAG,
  PUBLISH_ACQUISITION_UNAVAILABLE, PUBLISH_CLEANUP_UNAVAILABLE,
  PUBLISH_RECEIPT_AT, PUBLISH_RECEIPT_UNAVAILABLE, PUBLISH_VERIFIED_HEAD,
  PUBLISH_WORKTREE_PARENT, PUBLISH_WORKTREE_PREFIX, QUIET_ARGUMENT,
  RECEIPT_NO_REASON, RECORD_TIMEOUT_MS, REV_PARSE_COMMAND, UTF8,
  WORKTREE_ADD, WORKTREE_COMMAND,
};
