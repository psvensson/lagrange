#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

const DEFAULT_CONFIG_PATH = path.join(
  '.kiro',
  'steering',
  'llm-pack.config.json',
);

const HEADING_PATTERN = /^(\s{0,3})(#{1,6})\s+(.+)$/u;
const BULLET_PATTERN = /^\s*(?:[-*]|\d+\.)\s+(.+)$/u;
const BULLET_WITH_INDENT_PATTERN = /^(\s*)(?:[-*]|\d+\.)\s+(.+)$/u;
const TABLE_PATTERN = /^\s*\|/u;
const TRAILING_COLON_PATTERN = /:\s*$/u;
const CHILD_RULE_PREFIX = '- ';
const CHILD_RULE_JOINER = '; ';
const RULE_BODY_JOINER = ' ';
const EMPTY_TEXT = '';
const PROCESS_ARG_SCRIPT_INDEX = 1;
const COMPARE_EQUAL = 0;
const RULE_ID_PREFIX_START_INDEX = 0;
const RULE_ID_PREFIX_MAX_LENGTH = 6;
const RULE_COUNT_INCREMENT = 1;
const EXIT_CODE_SUCCESS = 0;
const EXIT_CODE_FAILURE = 1;
const JSON_INDENT_SPACES = 2;
const DEFAULT_RULE_PREFIX = 'RULE';

const NORMATIVE_PATTERN =
  /\b(MUST\s+NOT|SHALL\s+NOT|MUST|SHALL|NEVER|SHOULD|MAY|REQUIRED|FORBIDDEN|DO\s+NOT|ONLY)\b/iu;

const STRENGTH_PRIORITY = Object.freeze({
  must_not: 5,
  must: 4,
  should: 3,
  may: 2,
  info: 1,
});

const DOMAIN_TAG_KEYWORDS = Object.freeze({
  ownership: ['owner', 'ownership', 'single-owner', 'canonical owner'],
  lifecycle: ['lifecycle', 'phase', 'sub-phase', 'state machine'],
  readiness: ['readiness', 'ready lease', 'ready'],
  cdc: ['cdc'],
  cache: ['cache', 'system table cache'],
  rebalancing: ['rebalance', 'rebalancer', 'replica operation'],
  routing: ['routing', 'router'],
  timeout: ['timeout', 'budget', 'deadline'],
  testing: ['test', 'integration', 'unit test', 'failing test'],
  style: ['eslint', 'lint', 'naming', 'magic values', 'constants'],
  governance: ['roadmap', 'edition', 'scope', 'agpl'],
});

const NON_RULE_SECTION_HEADINGS = new Set([
  'document role',
  'document authority map',
  'audit procedure',
]);

function printUsage() {
  console.log(
    'Usage: node scripts/generate-steering-llm-pack.js ' +
    '[optional-config-path]',
  );
}

function estimateTokens(text) {
  return Math.ceil(String(text || '').length / 4);
}

function isBlank(line) {
  return line.trim().length === 0;
}

function isHeading(line) {
  return HEADING_PATTERN.test(line);
}

function isBullet(line) {
  return BULLET_PATTERN.test(line);
}

function isTable(line) {
  return TABLE_PATTERN.test(line);
}

function normalizeWhitespace(value) {
  return String(value || '').replace(/\s+/gu, ' ').trim();
}

function shouldIgnoreSection(sectionPath = '') {
  return String(sectionPath || '')
    .split('>')
    .map((part) => normalizeWhitespace(part).toLowerCase())
    .some((part) => NON_RULE_SECTION_HEADINGS.has(part));
}

function isPathOnlyText(text = '') {
  const normalized = normalizeWhitespace(text);
  return /^[./\p{L}\p{N}_*\- ]+\.(?:md|json)$/u.test(normalized);
}

function isIncompleteRuleText(text = '') {
  return TRAILING_COLON_PATTERN.test(normalizeWhitespace(text));
}

function stripInlineMarkdown(value) {
  return normalizeWhitespace(
    String(value || '')
      .replace(/\[([^\]]+)\]\([^)]+\)/gu, '$1')
      .replace(/`([^`]+)`/gu, '$1')
      .replace(/\*\*([^*]+)\*\*/gu, '$1')
      .replace(/__([^_]+)__/gu, '$1')
      .replace(/\*([^*]+)\*/gu, '$1')
      .replace(/_([^_]+)_/gu, '$1')
      .replace(/^>\s*/gu, ''),
  );
}

function normalizeRuleKey(value) {
  return normalizeWhitespace(
    String(value || '')
      .toLowerCase()
      .replace(/[“”"'`]/gu, '')
      .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
      .replace(/\s+/gu, ' '),
  );
}

function inferStrength(text) {
  const normalized = String(text || '').toUpperCase();
  if (/(MUST\s+NOT|SHALL\s+NOT|NEVER|FORBIDDEN|DO\s+NOT)/u.test(normalized)) {
    return 'must_not';
  }
  if (/(MUST|SHALL|REQUIRED)/u.test(normalized)) {
    return 'must';
  }
  if (/SHOULD/u.test(normalized)) {
    return 'should';
  }
  if (/(MAY|ONLY)/u.test(normalized)) {
    return 'may';
  }
  return 'info';
}

function inferTags(text) {
  const normalized = String(text || '').toLowerCase();
  const tags = [];
  for (const [tag, keywords] of Object.entries(DOMAIN_TAG_KEYWORDS)) {
    if (keywords.some((keyword) => normalized.includes(keyword))) {
      tags.push(tag);
    }
  }
  return tags;
}

function splitNormativeSentences(paragraph) {
  const normalizedParagraph = normalizeWhitespace(paragraph);
  if (!normalizedParagraph) {
    return [];
  }

  const sentences = normalizedParagraph.split(/(?<=[.!?])\s+/u)
    .map((sentence) => normalizeWhitespace(sentence))
    .filter(Boolean);

  if (sentences.length === 0) {
    return [];
  }

  const normative = sentences.filter((sentence) =>
    NORMATIVE_PATTERN.test(sentence),
  );

  if (normative.length > 0) {
    return normative;
  }

  if (NORMATIVE_PATTERN.test(normalizedParagraph)) {
    return [normalizedParagraph];
  }

  return [];
}

function scoreCandidate(candidate) {
  const strength = candidate.strength;
  let score = Number(candidate.sourcePriority || 0);

  if (strength === 'must_not') {
    score += 90;
  } else if (strength === 'must') {
    score += 72;
  } else if (strength === 'should') {
    score += 40;
  } else if (strength === 'may') {
    score += 24;
  } else {
    score += 12;
  }

  if (candidate.kind === 'bullet') {
    score += 10;
  }

  const text = candidate.text;
  const textLength = text.length;

  if (textLength < 30) {
    score -= 8;
  }
  if (textLength > 220) {
    score -= 24;
  }

  const lowered = text.toLowerCase();
  if (lowered.includes('example')) {
    score -= 12;
  }
  if (lowered.startsWith('note:')) {
    score -= 10;
  }

  score += Math.max(0, 6 - Math.floor(candidate.line / 250));

  return score;
}

function ensureRelativePath(workspaceRoot, value) {
  if (path.isAbsolute(value)) {
    return value;
  }
  return path.join(workspaceRoot, value);
}

function sectionPathFromStack(sectionStack) {
  const parts = sectionStack.filter(Boolean);
  return parts.length > 0 ? parts.join(' > ') : 'root';
}

function pushCandidate(container, options = {}) {
  const text = stripInlineMarkdown(options.text || '');
  if (!text) {
    return;
  }
  if (shouldIgnoreSection(options.section)) {
    return;
  }
  if (text.length < 16) {
    return;
  }
  if (isPathOnlyText(text)) {
    return;
  }
  if (isIncompleteRuleText(text)) {
    return;
  }

  const strength = inferStrength(text);
  if (strength === 'info' && options.kind !== 'bullet') {
    return;
  }

  const candidate = {
    text,
    normalizedText: normalizeRuleKey(text),
    domain: options.domain,
    sourceFile: options.sourceFile,
    sourcePriority: options.sourcePriority,
    line: options.line,
    section: options.section,
    kind: options.kind,
    strength,
    tags: inferTags(text),
  };

  if (!candidate.normalizedText) {
    return;
  }

  candidate.score = scoreCandidate(candidate);
  container.push(candidate);
}

function collectBulletListText(lines = [], startIndex = 0, options = {}) {
  const items = [];
  let cursor = startIndex;
  const minimumIndent = Number.isFinite(options.minimumIndent) ?
    options.minimumIndent :
    0;

  while (cursor < lines.length) {
    const rawLine = lines[cursor];
    const bulletMatch = rawLine.match(BULLET_WITH_INDENT_PATTERN);
    if (!bulletMatch || bulletMatch[1].length < minimumIndent) {
      break;
    }

    let text = bulletMatch[2];
    let itemCursor = cursor + 1;

    while (itemCursor < lines.length) {
      const nextLine = lines[itemCursor];
      if (isBlank(nextLine) || isHeading(nextLine) ||
          isBullet(nextLine) || isTable(nextLine)) {
        break;
      }
      text += `${RULE_BODY_JOINER}${nextLine.trim()}`;
      itemCursor += 1;
    }

    items.push(text.trim());
    cursor = itemCursor;
  }

  return {items, nextIndex: cursor};
}

function appendChildBulletsForParentRule(
  paragraph,
  lines = [],
  cursor = 0,
  options = {},
) {
  if (!TRAILING_COLON_PATTERN.test(paragraph)) {
    return {text: paragraph, nextIndex: cursor};
  }

  const collected = collectBulletListText(lines, cursor, options);
  if (collected.items.length === 0) {
    return {text: paragraph, nextIndex: cursor};
  }

  const childText = collected.items
    .map((item) => `${CHILD_RULE_PREFIX}${item}`)
    .join(CHILD_RULE_JOINER);

  return {
    text: `${paragraph}${RULE_BODY_JOINER}${childText}`,
    nextIndex: collected.nextIndex,
  };
}

function parseMarkdownCandidates(content, source = {}) {
  const lines = String(content || '').split(/\r?\n/u);
  const sectionStack = [];
  const candidates = [];

  for (let index = 0; index < lines.length; index++) {
    const rawLine = lines[index];

    const headingMatch = rawLine.match(HEADING_PATTERN);
    if (headingMatch) {
      const level = headingMatch[2].length;
      const headingText = stripInlineMarkdown(headingMatch[3]);
      sectionStack.length = Math.max(level - 1, 0);
      sectionStack[level - 1] = headingText;
      continue;
    }

    const bulletMatch = rawLine.match(BULLET_WITH_INDENT_PATTERN);
    if (bulletMatch) {
      let text = bulletMatch[2];
      let cursor = index + 1;

      while (cursor < lines.length) {
        const nextLine = lines[cursor];
        if (isBlank(nextLine) || isHeading(nextLine) || isBullet(nextLine) ||
            isTable(nextLine)) {
          break;
        }
        text += ` ${nextLine.trim()}`;
        cursor += 1;
      }

      const expandedRule = appendChildBulletsForParentRule(
        text,
        lines,
        cursor,
        {minimumIndent: bulletMatch[1].length + 1},
      );
      text = expandedRule.text;
      cursor = expandedRule.nextIndex;

      pushCandidate(candidates, {
        text,
        domain: source.domain,
        sourceFile: source.file,
        sourcePriority: source.priority,
        line: index + 1,
        section: sectionPathFromStack(sectionStack),
        kind: 'bullet',
      });

      index = cursor - 1;
      continue;
    }

    if (isBlank(rawLine) || isTable(rawLine)) {
      continue;
    }

    let paragraph = rawLine.trim();
    let cursor = index + 1;
    while (cursor < lines.length) {
      const nextLine = lines[cursor];
      if (isBlank(nextLine) || isHeading(nextLine) || isBullet(nextLine) ||
          isTable(nextLine)) {
        break;
      }
      paragraph += ` ${nextLine.trim()}`;
      cursor += 1;
    }

    const expandedRule = appendChildBulletsForParentRule(
      paragraph,
      lines,
      cursor,
    );
    paragraph = expandedRule.text;
    cursor = expandedRule.nextIndex;

    const sentences = splitNormativeSentences(paragraph);
    for (const sentence of sentences) {
      pushCandidate(candidates, {
        text: sentence,
        domain: source.domain,
        sourceFile: source.file,
        sourcePriority: source.priority,
        line: index + 1,
        section: sectionPathFromStack(sectionStack),
        kind: 'paragraph',
      });
    }

    index = cursor - 1;
  }

  return candidates;
}

function mergeSourceRefs(existing = [], sourceRef = {}) {
  const key = `${sourceRef.file}:${sourceRef.line}`;
  if (existing.some((entry) => `${entry.file}:${entry.line}` === key)) {
    return existing;
  }

  return [...existing, sourceRef];
}

function dedupeCandidates(candidates = []) {
  const deduped = new Map();

  for (const candidate of candidates) {
    const key = candidate.normalizedText;
    const sourceRef = {
      file: candidate.sourceFile,
      line: candidate.line,
      section: candidate.section,
    };

    if (!deduped.has(key)) {
      deduped.set(key, {
        ...candidate,
        sources: [sourceRef],
      });
      continue;
    }

    const existing = deduped.get(key);
    const mergedSources = mergeSourceRefs(existing.sources, sourceRef);

    if (candidate.score > existing.score) {
      deduped.set(key, {
        ...candidate,
        sources: mergedSources,
      });
      continue;
    }

    deduped.set(key, {
      ...existing,
      sources: mergedSources,
    });
  }

  return [...deduped.values()];
}

function compareRules(left, right) {
  if (left.score !== right.score) {
    return right.score - left.score;
  }

  const strengthDelta =
    (STRENGTH_PRIORITY[right.strength] || 0) -
    (STRENGTH_PRIORITY[left.strength] || 0);
  if (strengthDelta !== COMPARE_EQUAL) {
    return strengthDelta;
  }

  if (left.domain !== right.domain) {
    return left.domain.localeCompare(right.domain);
  }

  if (left.sourceFile !== right.sourceFile) {
    return left.sourceFile.localeCompare(right.sourceFile);
  }

  if (left.line !== right.line) {
    return left.line - right.line;
  }

  return left.text.localeCompare(right.text);
}

function ruleIdPrefix(domain, domainPrefixes = {}) {
  if (domainPrefixes[domain]) {
    return String(domainPrefixes[domain]).toUpperCase();
  }

  return String(domain || DEFAULT_RULE_PREFIX).replace(/[^a-z0-9]/giu, EMPTY_TEXT)
    .toUpperCase().slice(
      RULE_ID_PREFIX_START_INDEX,
      RULE_ID_PREFIX_MAX_LENGTH,
    ) || DEFAULT_RULE_PREFIX;
}

function assignRuleIds(rules = [], domainPrefixes = {}) {
  const grouped = new Map();
  for (const rule of rules) {
    if (!grouped.has(rule.domain)) {
      grouped.set(rule.domain, []);
    }
    grouped.get(rule.domain).push(rule);
  }

  const byDomain = new Map();
  for (const [domain, domainRules] of grouped.entries()) {
    const sorted = [...domainRules].sort(compareRules);
    const prefix = ruleIdPrefix(domain, domainPrefixes);

    byDomain.set(domain, sorted.map((rule, index) => ({
      ...rule,
      id: `${prefix}-${String(index + 1).padStart(4, '0')}`,
    })));
  }

  const allRules = [...byDomain.values()].flat().sort(compareRules);
  return {allRules, byDomain};
}

function selectOutputRules(allRules = [], output = {}) {
  const domains = new Set(output.domains || []);
  const maxRules = Number.isFinite(output.maxRules) ? output.maxRules : 80;
  const domainCaps = output.domainCaps || {};

  const selected = [];
  const countsByDomain = new Map();

  for (const rule of allRules) {
    if (!domains.has(rule.domain)) {
      continue;
    }

    if (selected.length >= maxRules) {
      break;
    }

    const currentCount = countsByDomain.get(rule.domain) || 0;
    const cap = Number.isFinite(domainCaps[rule.domain]) ?
      Number(domainCaps[rule.domain]) :
      Number.POSITIVE_INFINITY;

    if (currentCount >= cap) {
      continue;
    }

    selected.push(rule);
    countsByDomain.set(rule.domain, currentCount + RULE_COUNT_INCREMENT);
  }

  return selected;
}

function renderPackMarkdown(output = {}, rules = []) {
  const ruleLines = rules.map((rule, index) =>
    `${index + 1}. [${rule.id}] ${rule.text}`,
  );

  const domainSummary = [...new Set(rules.map((rule) => rule.domain))]
    .sort()
    .join(', ');

  const body = [
    `# ${output.title || 'LLM Steering Pack'}`,
    '',
    output.description || '',
    '',
    `Generated rules: ${rules.length}`,
    `Estimated tokens: ${estimateTokens(ruleLines.join('\n'))}`,
    `Domains: ${domainSummary || 'none'}`,
    '',
    '## Rules',
    '',
    ...ruleLines,
    '',
  ];

  return body.join('\n');
}

function buildManifest(outputs = [], selectedByOutput = new Map()) {
  return outputs.map((output) => {
    const rules = selectedByOutput.get(output.name) || [];
    const estimatedRuleTokens = estimateTokens(
      rules.map((rule) => `[${rule.id}] ${rule.text}`).join('\n'),
    );

    return {
      name: output.name,
      title: output.title,
      description: output.description,
      ruleCount: rules.length,
      estimatedTokens: estimatedRuleTokens,
      domains: output.domains || [],
    };
  });
}

function renderReadme(manifestEntries = []) {
  const lines = [
    '# Steering LLM Pack',
    '',
    'This directory contains generated low-token steering artifacts.',
    '',
    'Generation command:',
    '',
    '```bash',
    'npm run steering:llm:pack',
    '```',
    '',
    'Recommended load strategy:',
    '',
    '1. Always load `core.md`.',
    '2. Load one domain pack based on task:',
    '   - `architecture.md` for runtime/control-plane/bootstrap/join/rebalance work',
    '   - `testing.md` for test design and regression policy',
    '   - `style.md` for lint/style/naming policy',
    '   - `governance.md` for roadmap/scope checks',
    '3. Use `rules.json` when you need IDs + source traceability.',
    '',
    '## Pack Sizes',
    '',
    '| Pack | Rules | Estimated Tokens |',
    '| --- | ---: | ---: |',
    ...manifestEntries.map((entry) =>
      `| ${entry.name} | ${entry.ruleCount} | ${entry.estimatedTokens} |`,
    ),
    '',
    '## Notes',
    '',
    '- `rules.json` is the complete machine-readable source with IDs and citations.',
    '- Markdown packs are intentionally compact for prompt loading.',
    '',
  ];

  return lines.join('\n');
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function main() {
  const arg = process.argv[2];
  if (arg === '--help' || arg === '-h') {
    printUsage();
    process.exit(EXIT_CODE_SUCCESS);
  }

  const workspaceRoot = process.cwd();
  const configPath = ensureRelativePath(
    workspaceRoot,
    arg || DEFAULT_CONFIG_PATH,
  );

  const config = await readJson(configPath);
  const sourceDir = ensureRelativePath(workspaceRoot, config.sourceDir);
  const llmDir = ensureRelativePath(workspaceRoot, config.llmDir);

  const candidates = [];
  for (const source of config.sources || []) {
    const absoluteFilePath = path.join(sourceDir, source.file);
    const content = await fs.readFile(absoluteFilePath, 'utf8');
    const sourceCandidates = parseMarkdownCandidates(content, {
      file: source.file,
      domain: source.domain,
      priority: source.priority,
    });
    candidates.push(...sourceCandidates);
  }

  const deduped = dedupeCandidates(candidates).sort(compareRules);
  const {allRules} = assignRuleIds(deduped, config.domainPrefixes || {});

  await fs.mkdir(llmDir, {recursive: true});

  const selectedByOutput = new Map();
  for (const output of config.outputs || []) {
    const selected = selectOutputRules(allRules, output);
    selectedByOutput.set(output.name, selected);

    const markdown = renderPackMarkdown(output, selected);
    await fs.writeFile(
      path.join(llmDir, `${output.name}.md`),
      `${markdown}`,
      'utf8',
    );
  }

  const manifestEntries = buildManifest(config.outputs || [], selectedByOutput);
  const rulesJson = {
    generatedAt: new Date().toISOString(),
    sourceDir: config.sourceDir,
    llmDir: config.llmDir,
    sourceFiles: (config.sources || []).map((entry) => ({
      file: entry.file,
      domain: entry.domain,
      priority: entry.priority,
    })),
    stats: {
      candidateCount: candidates.length,
      dedupedRuleCount: deduped.length,
      exportedRuleCount: allRules.length,
      estimatedAllRulesTokens: estimateTokens(
        allRules.map((rule) => `${rule.id} ${rule.text}`).join('\n'),
      ),
    },
    rules: allRules.map((rule) => ({
      id: rule.id,
      domain: rule.domain,
      strength: rule.strength,
      tags: rule.tags,
      rule: rule.text,
      score: rule.score,
      sources: rule.sources,
    })),
  };

  await fs.writeFile(
    path.join(llmDir, 'rules.json'),
    `${JSON.stringify(rulesJson, null, JSON_INDENT_SPACES)}\n`,
    'utf8',
  );

  const manifest = {
    generatedAt: rulesJson.generatedAt,
    packs: manifestEntries,
  };

  await fs.writeFile(
    path.join(llmDir, 'manifest.json'),
    `${JSON.stringify(manifest, null, JSON_INDENT_SPACES)}\n`,
    'utf8',
  );

  const readme = renderReadme(manifestEntries);
  await fs.writeFile(
    path.join(llmDir, 'README.md'),
    `${readme}`,
    'utf8',
  );

  console.log('Generated steering LLM pack');
  for (const entry of manifestEntries) {
    console.log(
      `- ${entry.name}: ${entry.ruleCount} rules ` +
      `(estimated ${entry.estimatedTokens} tokens)`,
    );
  }
}

function isDirectRun() {
  return path.resolve(process.argv[PROCESS_ARG_SCRIPT_INDEX] || EMPTY_TEXT) ===
    fileURLToPath(import.meta.url);
}

if (isDirectRun()) {
  main().catch((error) => {
    console.error(`Failed to generate steering LLM pack: ${error.message}`);
    process.exit(EXIT_CODE_FAILURE);
  });
}

export {
  appendChildBulletsForParentRule,
  collectBulletListText,
  parseMarkdownCandidates,
};
