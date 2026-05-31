// Commit And Push Ledger hardening for `work:close`.
//
// The close commit cannot contain its own SHA, so the ledger's
// "Focused package commit" value is necessarily written before the commit
// exists and then rewritten to the real SHA via `git commit --amend`. This
// helper performs that rewrite robustly: it replaces whatever the line
// currently holds — a template placeholder (`<sha>`), a stale SHA, or the
// pre-commit parent SHA — so no manual hash entry is ever required.

const FOCUSED_PACKAGE_COMMIT_LINE_PATTERN =
  /^([ \t]*(?:[-*]|\d+\.)\s*Focused package commit:\s*)(`?)[^`\n]*(`?)[ \t]*$/mu;

// Replace the first "Focused package commit" ledger line's value with
// newCommitSha, preserving the line prefix and any backtick wrapping. As a
// safety net, also rewrite any other lingering reference to the pre-commit
// parent SHA. Pure and total: returns the input unchanged when there is
// nothing to harden or inputs are invalid.
function hardenCommitLedgerContent(content, newCommitSha, parentCommitSha) {
  if (
    typeof content !== 'string' ||
    typeof newCommitSha !== 'string' ||
    newCommitSha.length === 0
  ) {
    return content;
  }
  let next = content;
  if (FOCUSED_PACKAGE_COMMIT_LINE_PATTERN.test(next)) {
    next = next.replace(
      FOCUSED_PACKAGE_COMMIT_LINE_PATTERN,
      (_match, prefix, openTick, closeTick) => {
        const wrap = openTick === '`' || closeTick === '`';
        const tick = wrap ? '`' : '';
        return `${prefix}${tick}${newCommitSha}${tick}`;
      },
    );
  }
  if (
    typeof parentCommitSha === 'string' &&
    parentCommitSha.length > 0 &&
    parentCommitSha !== newCommitSha &&
    next.includes(parentCommitSha)
  ) {
    next = next.split(parentCommitSha).join(newCommitSha);
  }
  return next;
}

export {hardenCommitLedgerContent, FOCUSED_PACKAGE_COMMIT_LINE_PATTERN};
