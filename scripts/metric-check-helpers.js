import path from 'node:path';

// Repo-relative so the report bytes are identical across checkouts (the
// owner-debt inventory pins these report files' digests).
export function collectRuleViolations(results, ruleId) {
  return results.flatMap((result) =>
    result.messages
      .filter((message) => message.ruleId === ruleId)
      .map((message) => ({
        filePath: path.relative(process.cwd(), result.filePath),
        line: message.line,
        column: message.column,
        message: message.message,
      })));
}

export function printRatchetTighteningHint(label, current, baseline, filePath) {
  if (current < baseline) {
    console.log(
      `Baseline can be tightened from ${baseline} to ${current} in ${label}: ` +
      `${filePath}.`,
    );
  }
}
