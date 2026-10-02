import fs from 'node:fs';
import {execFileSync, spawnSync} from 'node:child_process';

const BASE_SHA = 'b5ca38e336da1c613414d2e4b9bf52ee835e9798';
const REVIEW_FILES = Object.freeze([
  'src/partition/split-key-comparator.js',
  'src/partition/partition-split-merge-manager-core-methods.js',
  'src/partition/partition-split-merge-manager-evaluation-methods.js',
  'test/partition/routing-key-comparator.test.js',
  'test/partition/merge-auto-execution.test.js',
]);
const REQUIRED_CATEGORIES = Object.freeze([
  'single-owner',
  'sqlite-binary',
  'existing-contracts',
  'controlled-negative',
  'scope',
  'implementation-hazards',
]);
const OUTPUT = '/tmp/a1-independent-review.json';
const MAX_BUFFER = 16 * 1024 * 1024;

function numbered(source) {
  return source.split('\n')
    .map((line, index) => String(index + 1).padStart(5, ' ') + '  ' + line)
    .join('\n');
}

function questContext() {
  const quest = JSON.parse(fs.readFileSync(
    'solve/quests/partition-key-ordering-owner-completion/quest.json',
    'utf8',
  ));
  return [
    '# Quest statement',
    quest.statement,
    '',
    '# Quest constraints',
    JSON.stringify(quest.constraints, null, 2),
  ].join('\n');
}

function candidateDiff() {
  return execFileSync(
    'git',
    [
      'diff',
      '--no-ext-diff',
      '--unified=120',
      BASE_SHA + '...HEAD',
      '--',
      ...REVIEW_FILES,
    ],
    {encoding: 'utf8', maxBuffer: MAX_BUFFER},
  );
}

function candidateFiles() {
  return REVIEW_FILES.map((file) => [
    '## ' + file,
    numbered(fs.readFileSync(file, 'utf8')),
  ].join('\n')).join('\n\n');
}

function requiredOutput() {
  return String.raw`
# Required output

Return ONLY one JSON object, with no markdown fence or surrounding prose:

{
  "verdict": "approve" | "reject",
  "categories": [
    {"id":"single-owner","verdict":"pass"|"fail","evidence":["path:line - concrete observation"],"findings":[]},
    {"id":"sqlite-binary","verdict":"pass"|"fail","evidence":["path:line - concrete observation"],"findings":[]},
    {"id":"existing-contracts","verdict":"pass"|"fail","evidence":["path:line - concrete observation"],"findings":[]},
    {"id":"controlled-negative","verdict":"pass"|"fail","evidence":["path:line - concrete observation"],"findings":[]},
    {"id":"scope","verdict":"pass"|"fail","evidence":["path:line - concrete observation"],"findings":[]},
    {"id":"implementation-hazards","verdict":"pass"|"fail","evidence":["path:line - concrete observation"],"findings":[]}
  ],
  "findings": [
    {"severity":"critical"|"high"|"medium"|"low","category":"category id","path":"repository path","line":0,"summary":"short defect","rationale":"why it violates the Quest or can fail"}
  ],
  "summary": "category-complete conclusion"
}

Rules:
- Enumerate every finding you can reach; do not stop at the first.
- "approve" is allowed only when all six categories pass and findings is empty.
- Do not reward intent. Judge only the supplied source, tests, and diff.
- Treat tests as evidence only when they actually discriminate old and new behavior.
- A stylistic preference is not a finding.
- Every category needs at least one concrete path:line evidence item.
`;
}

function buildPrompt() {
  return [
    fs.readFileSync('.github/copilot-instructions.md', 'utf8'),
    questContext(),
    '# Candidate diff against source-clean Quest branch',
    candidateDiff(),
    '# Candidate files with stable line numbers',
    candidateFiles(),
    requiredOutput(),
  ].join('\n\n');
}

function extractJson(output) {
  const trimmed = String(output || '').trim();
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first < 0 || last < first) {
    throw new Error('Copilot output contained no JSON object');
  }
  return JSON.parse(trimmed.slice(first, last + 1));
}

function validate(review) {
  if (!review || typeof review !== 'object' || Array.isArray(review)) {
    throw new Error('review is not an object');
  }
  if (!['approve', 'reject'].includes(review.verdict)) {
    throw new Error('invalid overall verdict');
  }
  if (!Array.isArray(review.categories)) {
    throw new Error('categories missing');
  }
  if (!Array.isArray(review.findings)) {
    throw new Error('findings missing');
  }

  const byId = new Map(review.categories.map((category) => [
    category?.id,
    category,
  ]));
  for (const id of REQUIRED_CATEGORIES) {
    const category = byId.get(id);
    if (!category) {
      throw new Error('missing review category: ' + id);
    }
    if (!['pass', 'fail'].includes(category.verdict)) {
      throw new Error('invalid category verdict: ' + id);
    }
    if (!Array.isArray(category.evidence) || category.evidence.length === 0) {
      throw new Error('missing category evidence: ' + id);
    }
    if (!Array.isArray(category.findings)) {
      throw new Error('missing category findings: ' + id);
    }
  }

  if (
    review.verdict === 'approve' &&
    (
      review.findings.length !== 0 ||
      REQUIRED_CATEGORIES.some((id) => byId.get(id).verdict !== 'pass')
    )
  ) {
    throw new Error('approve inconsistent with categories/findings');
  }
}

const prompt = buildPrompt();
fs.writeFileSync('/tmp/a1-review-prompt.txt', prompt);

const copilot = spawnSync(
  'copilot',
  ['-p', prompt, '-s'],
  {
    encoding: 'utf8',
    maxBuffer: MAX_BUFFER,
    env: process.env,
  },
);
if (copilot.status !== 0) {
  process.stderr.write(copilot.stdout || '');
  process.stderr.write(copilot.stderr || '');
  process.exit(copilot.status || 1);
}

const review = extractJson(copilot.stdout);
validate(review);
fs.writeFileSync(OUTPUT, JSON.stringify(review, null, 2) + '\n');
process.stdout.write(JSON.stringify(review, null, 2) + '\n');
