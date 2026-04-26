import {test} from '../../src/test-helpers/tap.js';
import {
  parseMarkdownCandidates,
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
