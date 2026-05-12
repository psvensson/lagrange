import {test} from '../../src/test-helpers/tap.js';
import {
  buildManifest,
  countMarkdownRules,
  parseMarkdownCandidates,
  renderPackMarkdown,
  validateCompleteRules,
} from '../../scripts/generate-steering-llm-pack.js';

const TEST_SOURCE_FILE = 'system guidelines.md';
const TEST_DOMAIN = 'architecture';
const TEST_PRIORITY = 140;
const TEST_PARENT_RULE_TEXT =
  'When multiple signals determine one outcome, the code must:';
const TEST_FIRST_CHILD_RULE_TEXT = 'collect evidence';
const TEST_SECOND_CHILD_RULE_TEXT = 'normalize one snapshot';
const TEST_THIRD_CHILD_RULE_TEXT = 'emit one canonical outcome and reasons';
const TEST_UNRELATED_RULE_TEXT = 'Do not create a second owner.';
const TEST_CONTEXT_ANTECEDENT_TEXT =
  'docs/ is reserved for end-user or operator-facing documentation.';
const TEST_CONTEXT_DEPENDENT_RULE_TEXT =
  'Internal planning, work-package execution, and sprint tracking must not live there.';
const TEST_ORDERED_PARENT_RULE_TEXT =
  'Semantic decision boundaries must not be implemented as bags of if statements. ' +
  TEST_PARENT_RULE_TEXT;
const TEST_MARKDOWN_WITH_CHILD_RULES = [
  '# Rules',
  '',
  TEST_PARENT_RULE_TEXT,
  '- ' + TEST_FIRST_CHILD_RULE_TEXT,
  '- ' + TEST_SECOND_CHILD_RULE_TEXT,
  '- ' + TEST_THIRD_CHILD_RULE_TEXT,
  '',
  TEST_UNRELATED_RULE_TEXT,
  '',
].join('\n');
const TEST_ORDERED_MARKDOWN_WITH_CHILD_RULES = [
  '# Rules',
  '',
  '1. ' + TEST_ORDERED_PARENT_RULE_TEXT,
  '   - ' + TEST_FIRST_CHILD_RULE_TEXT,
  '   - ' + TEST_SECOND_CHILD_RULE_TEXT,
  '2. Small local guards are allowed.',
  '',
].join('\n');
const TEST_INCOMPLETE_MARKDOWN = [
  '# Rules',
  '',
  'Required workflow:',
  '',
].join('\n');
const TEST_CONTEXT_DEPENDENT_MARKDOWN = [
  '# Rules',
  '',
  TEST_CONTEXT_ANTECEDENT_TEXT + ' ' + TEST_CONTEXT_DEPENDENT_RULE_TEXT,
  '',
].join('\n');
const TEST_CODE_EXAMPLE_TEXT = 'const timeoutPromise = new Promise(() => {});';
const TEST_CODE_FENCE_MARKDOWN = [
  '# Rules',
  '',
  'Do not create a second owner.',
  '',
  '**Common violations:**',
  '```javascript',
  '// MUST NOT become a generated rule',
  TEST_CODE_EXAMPLE_TEXT,
  '```',
  '',
].join('\n');
const TEST_FORBIDDEN_PREAMBLE = 'It is FORBIDDEN to:';
const TEST_FORBIDDEN_BULLET_TEXT =
  'Introduce optional parameters that only bypass real logic for tests.';
const TEST_FORBIDDEN_PREAMBLE_MARKDOWN = [
  '# Rules',
  '',
  TEST_FORBIDDEN_PREAMBLE,
  '',
  '- ' + TEST_FORBIDDEN_BULLET_TEXT,
  '',
].join('\n');
const TEST_FRAGMENT_MARKDOWN = [
  '# Rules',
  '',
  '- one declared list of forbidden reinterpretations',
  '',
].join('\n');
const TEST_OUTPUT_NAME = 'core';
const TEST_OUTPUT = Object.freeze({
  name: TEST_OUTPUT_NAME,
  title: 'Core',
  description: 'Core rules.',
});
const TEST_MANUAL_OUTPUT = Object.freeze({
  name: TEST_OUTPUT_NAME,
  title: 'Core',
  description: 'Core rules.',
  manual: true,
});
const TEST_MANUAL_CORE_MARKDOWN = [
  '# Core',
  '',
  '## Rules',
  '',
  '1. First rule.',
  '2. Second rule.',
  '',
].join('\n');
const TEST_INCOMPLETE_RULE = Object.freeze({
  id: 'ARCH-0001',
  text: 'Required workflow:',
});
const TEST_COMPLETE_RULE = Object.freeze({
  id: 'ARCH-0002',
  text: 'Do not create a second owner.',
  domain: TEST_DOMAIN,
});

function parseTestCandidates(markdown) {
  return parseMarkdownCandidates(markdown, {
    file: TEST_SOURCE_FILE,
    domain: TEST_DOMAIN,
    priority: TEST_PRIORITY,
  });
}

test('steering pack parser attaches indented child bullets to ordered rules',
  (t) => {
    const candidates = parseTestCandidates(TEST_ORDERED_MARKDOWN_WITH_CHILD_RULES);
    const parentRule = candidates.find((candidate) =>
      candidate.text.startsWith(
        'Semantic decision boundaries must not be implemented',
      ),
    );

    t.ok(parentRule, 'ordered parent rule should be emitted');
    t.match(parentRule.text, TEST_FIRST_CHILD_RULE_TEXT);
    t.match(parentRule.text, TEST_SECOND_CHILD_RULE_TEXT);
    t.notMatch(parentRule.text, 'Small local guards');
    t.end();
  });

test('steering pack parser attaches child bullets to colon-ended parent rule',
  (t) => {
    const candidates = parseTestCandidates(TEST_MARKDOWN_WITH_CHILD_RULES);
    const parentRule = candidates.find((candidate) =>
      candidate.text.startsWith(TEST_PARENT_RULE_TEXT),
    );

    t.ok(parentRule, 'parent rule should be emitted');
    t.match(parentRule.text, TEST_FIRST_CHILD_RULE_TEXT);
    t.match(parentRule.text, TEST_SECOND_CHILD_RULE_TEXT);
    t.match(parentRule.text, TEST_THIRD_CHILD_RULE_TEXT);
    t.equal(
      parentRule.text.endsWith(TEST_PARENT_RULE_TEXT),
      false,
      'parent rule should not remain as a truncated colon-only rule',
    );
    t.equal(
      candidates.some((candidate) =>
        candidate.text === TEST_UNRELATED_RULE_TEXT),
      true,
      'unrelated normative paragraph should still be emitted',
    );
    t.end();
  });

test('steering pack parser rejects colon-ended rules without child bullets',
  (t) => {
    const candidates = parseTestCandidates(TEST_INCOMPLETE_MARKDOWN);

    t.same(candidates, []);
    t.end();
  });

test('steering pack parser preserves antecedent for context-dependent rules',
  (t) => {
    const candidates = parseTestCandidates(TEST_CONTEXT_DEPENDENT_MARKDOWN);
    const contextualRule = candidates.find((candidate) =>
      candidate.text.includes(TEST_CONTEXT_DEPENDENT_RULE_TEXT),
    );

    t.ok(contextualRule, 'context-dependent rule should be emitted');
    t.equal(
      contextualRule.text,
      TEST_CONTEXT_ANTECEDENT_TEXT + ' ' + TEST_CONTEXT_DEPENDENT_RULE_TEXT,
      'rule should keep the sentence that defines "there"',
    );
    t.end();
  });

test('steering pack parser ignores fenced code examples', (t) => {
  const candidates = parseTestCandidates(TEST_CODE_FENCE_MARKDOWN);

  t.equal(
    candidates.some((candidate) => candidate.text.includes(TEST_CODE_EXAMPLE_TEXT)),
    false,
    'code inside fenced examples should not become rules',
  );
  t.equal(
    candidates.some((candidate) => candidate.text === TEST_UNRELATED_RULE_TEXT),
    true,
    'normative prose outside the fence should still be emitted',
  );
  t.end();
});

test('steering pack parser preserves forbidden list preambles across blanks',
  (t) => {
    const candidates = parseTestCandidates(TEST_FORBIDDEN_PREAMBLE_MARKDOWN);
    const forbiddenRule = candidates.find((candidate) =>
      candidate.text.includes(TEST_FORBIDDEN_BULLET_TEXT),
    );

    t.ok(forbiddenRule, 'forbidden child bullet should be emitted');
    t.match(forbiddenRule.text, /^It is FORBIDDEN to:/u);
    t.match(forbiddenRule.text, TEST_FORBIDDEN_BULLET_TEXT);
    t.end();
  });

test('steering pack parser rejects non-normative fragments', (t) => {
  const candidates = parseTestCandidates(TEST_FRAGMENT_MARKDOWN);

  t.same(candidates, []);
  t.end();
});

test('steering pack renderer rejects incomplete generated rule text', (t) => {
  t.throws(
    () => validateCompleteRules([TEST_INCOMPLETE_RULE], TEST_OUTPUT_NAME),
    /Incomplete generated steering rule/u,
    'validation should fail before incomplete rules enter generated packs',
  );
  t.throws(
    () => renderPackMarkdown(TEST_OUTPUT, [TEST_INCOMPLETE_RULE]),
    /Incomplete generated steering rule/u,
    'rendering should enforce the same quality gate',
  );
  t.doesNotThrow(
    () => renderPackMarkdown(TEST_OUTPUT, [TEST_COMPLETE_RULE]),
    'complete rules should still render',
  );
  t.end();
});

test('steering pack manifest supports manual core packs', (t) => {
  const manualContentByOutput = new Map([
    [TEST_OUTPUT_NAME, TEST_MANUAL_CORE_MARKDOWN],
  ]);
  const manifest = buildManifest(
    [TEST_MANUAL_OUTPUT],
    new Map(),
    manualContentByOutput,
  );

  t.equal(countMarkdownRules(TEST_MANUAL_CORE_MARKDOWN), 2);
  t.equal(manifest[0].mode, 'manual');
  t.equal(manifest[0].ruleCount, 2);
  t.ok(manifest[0].estimatedTokens > 0);
  t.end();
});
