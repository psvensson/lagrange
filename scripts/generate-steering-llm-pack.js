#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_CONFIG_PATH = path.join(
  '.kiro',
  'steering',
  'llm-pack.config.json',
);

const HEADING_PATTERN = /^(\s{0,3})(#{1,6})\s+(.+)$/u;
const BULLET_PATTERN = /^\s*(?:[-*]|\d+\.)\s+(.+)$/u;
const TABLE_PATTERN = /^\s*\|/u;

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

function stripInlineMarkdown(value) {
  return normalizeWhitespace(
    String(value || '')
      .replace(/\[([^\]]+)\]\([^\)]+\)/gu, '$1')
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
  if (text.length < 16) {
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

    const bulletMatch = rawLine.match(BULLET_PATTERN);
    if (bulletMatch) {
      let text = bulletMatch[1];
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
  if (strengthDelta !== 0) {
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

  return String(domain || 'RULE').replace(/[^a-z0-9]/giu, '')
    .toUpperCase().slice(0, 6) || 'RULE';
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
    countsByDomain.set(rule.domain, currentCount + 1);
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
    process.exit(0);
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
    `${JSON.stringify(rulesJson, null, 2)}\n`,
    'utf8',
  );

  const manifest = {
    generatedAt: rulesJson.generatedAt,
    packs: manifestEntries,
  };

  await fs.writeFile(
    path.join(llmDir, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
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

main().catch((error) => {
  console.error(`Failed to generate steering LLM pack: ${error.message}`);
  process.exit(1);
});
