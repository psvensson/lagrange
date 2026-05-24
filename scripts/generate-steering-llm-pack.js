#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

const LOCAL_STR_1YILH = 'Usage: node scripts/generate-steering-llm-pack.js ';
const LOCAL_STR_WXJQD = '[optional-config-path]';
const LOCAL_STR_EMPTY = '';
const LOCAL_NUM_FOUR = 4;
const LOCAL_NUM_ZERO = 0;
const LOCAL_STR_SPACE = ' ';
const LOCAL_STR_GDTVK = '>';
const LOCAL_STR_1 = '$1';
const LOCAL_STR_MUST_NOT = 'must_not';
const LOCAL_STR_MUST = 'must';
const LOCAL_STR_SHOULD = 'should';
const LOCAL_STR_MAY = 'may';
const LOCAL_STR_INFO = 'info';
const LOCAL_NUM_90 = 90;
const LOCAL_NUM_72 = 72;
const LOCAL_NUM_40 = 40;
const LOCAL_NUM_24 = 24;
const LOCAL_NUM_12 = 12;
const LOCAL_STR_BULLET = 'bullet';
const LOCAL_NUM_10 = 10;
const LOCAL_NUM_30 = 30;
const LOCAL_NUM_EIGHT = 8;
const LOCAL_NUM_220 = 220;
const LOCAL_STR_EXAMPLE = 'example';
const LOCAL_STR_NOTE = 'note:';
const LOCAL_NUM_SIX = 6;
const LOCAL_NUM_250 = 250;
const LOCAL_STR_592WI = ' > ';
const LOCAL_STR_ROOT = 'root';
const LOCAL_NUM_16 = 16;
const LOCAL_NUM_ONE = 1;
const LOCAL_NUM_TWO = 2;
const LOCAL_STR_PARAGRAPH = 'paragraph';
const LOCAL_STR_0 = '0';
const LOCAL_STR_NEWLINE = '\n';
const LOCAL_STR_SENTENCE_JOINER = ' ';
const LOCAL_STR_HELP = '--help';
const LOCAL_STR_H = '-h';
const LOCAL_STR_UTF8 = 'utf8';
const LOCAL_STR_RULES_JSON = 'rules.json';
const LOCAL_STR_MANIFEST_JSON = 'manifest.json';
const LOCAL_STR_README_MD = 'README.md';
const LOCAL_STR_1WFBO = 'Generated steering LLM pack';
const LOCAL_STR_INCOMPLETE_RULE = 'Incomplete generated steering rule';
const LOCAL_STR_UNKNOWN_RULE = '<unknown-rule>';
const LOCAL_STR_UNKNOWN_OUTPUT = '<unknown-output>';
const LOCAL_STR_MANUAL = 'manual';
const LOCAL_STR_GENERATED = 'generated';

const DEFAULT_CONFIG_PATH = path.join(
  '.kiro',
  'steering',
  'llm-pack.config.json',
);

const HEADING_PATTERN = /^(\s{0,3})(#{1,6})\s+(.+)$/u;
const BULLET_PATTERN = /^\s*(?:[-*]|\d+\.)\s+(.+)$/u;
const BULLET_WITH_INDENT_PATTERN = /^(\s*)(?:[-*]|\d+\.)\s+(.+)$/u;
const TABLE_PATTERN = /^\s*\|/u;
const FENCED_CODE_PATTERN = /^\s*```/u;
const TRAILING_COLON_PATTERN = /:\s*$/u;
const NORMATIVE_LIST_PREAMBLE_PATTERN =
  /\b(FORBIDDEN|MUST\s+NOT|SHALL\s+NOT|DO\s+NOT|NEVER)\b[^:]*:\s*$/iu;
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
  /\b(MUST\s+NOT|SHALL\s+NOT|MUST|SHALL|NEVER|SHOULD|MAY|REQUIRED|DO\s+NOT)\b|^ONLY\b|\b(?:IS|ARE|BE)\s+FORBIDDEN\b|\bFORBIDDEN\s+TO\b/iu;
const CONTEXT_DEPENDENT_NORMATIVE_PATTERN =
  /\bthere\b/iu;

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
    LOCAL_STR_1YILH +
    LOCAL_STR_WXJQD,
  );
}

function estimateTokens(text) {
  return Math.ceil(String(text || LOCAL_STR_EMPTY).length / LOCAL_NUM_FOUR);
}

function isBlank(line) {
  return line.trim().length === LOCAL_NUM_ZERO;
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

function isFencedCodeBoundary(line) {
  return FENCED_CODE_PATTERN.test(line);
}

function isNormativeListPreamble(text = LOCAL_STR_EMPTY) {
  return NORMATIVE_LIST_PREAMBLE_PATTERN.test(normalizeWhitespace(text));
}

function isFragmentLikeBullet(text = LOCAL_STR_EMPTY) {
  const normalized = normalizeWhitespace(text);
  return /^[a-z]/u.test(normalized) && !/[.!?)]$/u.test(normalized);
}

function normalizeWhitespace(value) {
  return String(value || LOCAL_STR_EMPTY).replace(/\s+/gu, LOCAL_STR_SPACE).trim();
}

function shouldIgnoreSection(sectionPath = LOCAL_STR_EMPTY) {
  return String(sectionPath || LOCAL_STR_EMPTY)
    .split(LOCAL_STR_GDTVK)
    .map((part) => normalizeWhitespace(part).toLowerCase())
    .some((part) => NON_RULE_SECTION_HEADINGS.has(part));
}

function isPathOnlyText(text = LOCAL_STR_EMPTY) {
  const normalized = normalizeWhitespace(text);
  return /^[./\p{L}\p{N}_*\- ]+\.(?:md|json)$/u.test(normalized);
}

function isIncompleteRuleText(text = LOCAL_STR_EMPTY) {
  return TRAILING_COLON_PATTERN.test(normalizeWhitespace(text));
}

function stripInlineMarkdown(value) {
  return normalizeWhitespace(
    String(value || LOCAL_STR_EMPTY)
      .replace(/\[([^\]]+)\]\([^)]+\)/gu, LOCAL_STR_1)
      .replace(/`([^`]+)`/gu, LOCAL_STR_1)
      .replace(/\*\*([^*]+)\*\*/gu, LOCAL_STR_1)
      .replace(/__([^_]+)__/gu, LOCAL_STR_1)
      .replace(/\*([^*]+)\*/gu, LOCAL_STR_1)
      .replace(/_([^_]+)_/gu, LOCAL_STR_1)
      .replace(/^>\s*/gu, LOCAL_STR_EMPTY),
  );
}

function normalizeRuleKey(value) {
  return normalizeWhitespace(
    String(value || LOCAL_STR_EMPTY)
      .toLowerCase()
      .replace(/[“”"'`]/gu, LOCAL_STR_EMPTY)
      .replace(/[^\p{L}\p{N}\s-]/gu, LOCAL_STR_SPACE)
      .replace(/\s+/gu, LOCAL_STR_SPACE),
  );
}

function inferStrength(text) {
  const normalized = String(text || '').toUpperCase();
  if (
    /(MUST\s+NOT|SHALL\s+NOT|NEVER|DO\s+NOT)/u.test(normalized) ||
    /\b(?:IS|ARE|BE)\s+FORBIDDEN\b|\bFORBIDDEN\s+TO\b/u.test(normalized)
  ) {
    return LOCAL_STR_MUST_NOT;
  }
  if (/(MUST|SHALL|REQUIRED)/u.test(normalized)) {
    return LOCAL_STR_MUST;
  }
  if (/SHOULD/u.test(normalized)) {
    return LOCAL_STR_SHOULD;
  }
  if (/MAY/u.test(normalized) || /^ONLY\b/u.test(normalized)) {
    return LOCAL_STR_MAY;
  }
  return LOCAL_STR_INFO;
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

  if (sentences.length === LOCAL_NUM_ZERO) {
    return [];
  }

  const normative = [];
  for (let index = LOCAL_NUM_ZERO; index < sentences.length; index++) {
    const sentence = sentences[index];
    if (!NORMATIVE_PATTERN.test(sentence)) {
      continue;
    }
    const previousSentence = sentences[index - LOCAL_NUM_ONE];
    if (
      previousSentence &&
      !NORMATIVE_PATTERN.test(previousSentence) &&
      CONTEXT_DEPENDENT_NORMATIVE_PATTERN.test(sentence)
    ) {
      normative.push(
        `${previousSentence}${LOCAL_STR_SENTENCE_JOINER}${sentence}`,
      );
      continue;
    }
    normative.push(sentence);
  }

  if (normative.length > LOCAL_NUM_ZERO) {
    return normative;
  }

  if (NORMATIVE_PATTERN.test(normalizedParagraph)) {
    return [normalizedParagraph];
  }

  return [];
}

function scoreCandidate(candidate) {
  const strength = candidate.strength;
  let score = Number(candidate.sourcePriority || LOCAL_NUM_ZERO);

  if (strength === LOCAL_STR_MUST_NOT) {
    score += LOCAL_NUM_90;
  } else if (strength === LOCAL_STR_MUST) {
    score += LOCAL_NUM_72;
  } else if (strength === LOCAL_STR_SHOULD) {
    score += LOCAL_NUM_40;
  } else if (strength === LOCAL_STR_MAY) {
    score += LOCAL_NUM_24;
  } else {
    score += LOCAL_NUM_12;
  }

  if (candidate.kind === LOCAL_STR_BULLET) {
    score += LOCAL_NUM_10;
  }

  const text = candidate.text;
  const textLength = text.length;

  if (textLength < LOCAL_NUM_30) {
    score -= LOCAL_NUM_EIGHT;
  }
  if (textLength > LOCAL_NUM_220) {
    score -= LOCAL_NUM_24;
  }

  const lowered = text.toLowerCase();
  if (lowered.includes(LOCAL_STR_EXAMPLE)) {
    score -= LOCAL_NUM_12;
  }
  if (lowered.startsWith(LOCAL_STR_NOTE)) {
    score -= LOCAL_NUM_10;
  }

  score += Math.max(LOCAL_NUM_ZERO, LOCAL_NUM_SIX - Math.floor(candidate.line / LOCAL_NUM_250));

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
  return parts.length > LOCAL_NUM_ZERO ? parts.join(LOCAL_STR_592WI) : LOCAL_STR_ROOT;
}

function pushCandidate(container, options = {}) {
  const text = stripInlineMarkdown(options.text || '');
  if (!text) {
    return;
  }
  if (shouldIgnoreSection(options.section)) {
    return;
  }
  if (text.length < LOCAL_NUM_16) {
    return;
  }
  if (isPathOnlyText(text)) {
    return;
  }
  if (isIncompleteRuleText(text)) {
    return;
  }

  const strength = inferStrength(text);
  if (options.kind === LOCAL_STR_BULLET && isFragmentLikeBullet(text)) {
    return;
  }
  if (strength === LOCAL_STR_INFO) {
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

function collectBulletListText(lines = [], startIndex = LOCAL_NUM_ZERO, options = {}) {
  const items = [];
  let cursor = startIndex;
  const minimumIndent = Number.isFinite(options.minimumIndent) ?
    options.minimumIndent :
    0;

  while (cursor < lines.length) {
    const rawLine = lines[cursor];
    const bulletMatch = rawLine.match(BULLET_WITH_INDENT_PATTERN);
    if (!bulletMatch || bulletMatch[LOCAL_NUM_ONE].length < minimumIndent) {
      break;
    }

    let text = bulletMatch[LOCAL_NUM_TWO];
    let itemCursor = cursor + LOCAL_NUM_ONE;

    while (itemCursor < lines.length) {
      const nextLine = lines[itemCursor];
      if (isBlank(nextLine) || isHeading(nextLine) ||
          isBullet(nextLine) || isTable(nextLine) ||
          isFencedCodeBoundary(nextLine)) {
        break;
      }
      text += `${RULE_BODY_JOINER}${nextLine.trim()}`;
      itemCursor += LOCAL_NUM_ONE;
    }

    items.push(text.trim());
    cursor = itemCursor;
  }

  return {items, nextIndex: cursor};
}

function appendChildBulletsForParentRule(
  paragraph,
  lines = [],
  cursor = LOCAL_NUM_ZERO,
  options = {},
) {
  if (!TRAILING_COLON_PATTERN.test(paragraph)) {
    return {text: paragraph, nextIndex: cursor};
  }

  const collected = collectBulletListText(lines, cursor, options);
  if (collected.items.length === LOCAL_NUM_ZERO) {
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
  let inCodeFence = false;
  let pendingListPreamble = LOCAL_STR_EMPTY;
  let pendingListPreambleAllowsBlank = false;
  let pendingListPreambleInList = false;

  for (let index = LOCAL_NUM_ZERO; index < lines.length; index++) {
    const rawLine = lines[index];

    if (isFencedCodeBoundary(rawLine)) {
      inCodeFence = !inCodeFence;
      continue;
    }

    if (inCodeFence) {
      continue;
    }

    const headingMatch = rawLine.match(HEADING_PATTERN);
    if (headingMatch) {
      pendingListPreamble = LOCAL_STR_EMPTY;
      pendingListPreambleAllowsBlank = false;
      pendingListPreambleInList = false;
      const level = headingMatch[2].length;
      const headingText = stripInlineMarkdown(headingMatch[3]);
      sectionStack.length = Math.max(level - LOCAL_NUM_ONE, LOCAL_NUM_ZERO);
      sectionStack[level - LOCAL_NUM_ONE] = headingText;
      continue;
    }

    const bulletMatch = rawLine.match(BULLET_WITH_INDENT_PATTERN);
    if (bulletMatch) {
      let text = bulletMatch[LOCAL_NUM_TWO];
      if (pendingListPreamble) {
        text = `${pendingListPreamble}${RULE_BODY_JOINER}${text}`;
        pendingListPreambleAllowsBlank = false;
        pendingListPreambleInList = true;
      }
      let cursor = index + LOCAL_NUM_ONE;

      while (cursor < lines.length) {
        const nextLine = lines[cursor];
        if (isBlank(nextLine) || isHeading(nextLine) || isBullet(nextLine) ||
            isTable(nextLine) || isFencedCodeBoundary(nextLine)) {
          break;
        }
        text += ` ${nextLine.trim()}`;
        cursor += LOCAL_NUM_ONE;
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
        line: index + LOCAL_NUM_ONE,
        section: sectionPathFromStack(sectionStack),
        kind: LOCAL_STR_BULLET,
      });

      index = cursor - LOCAL_NUM_ONE;
      continue;
    }

    if (isBlank(rawLine)) {
      if (pendingListPreambleInList || !pendingListPreambleAllowsBlank) {
        pendingListPreamble = LOCAL_STR_EMPTY;
        pendingListPreambleAllowsBlank = false;
        pendingListPreambleInList = false;
        continue;
      }
      pendingListPreambleAllowsBlank = false;
      continue;
    }

    if (isTable(rawLine)) {
      pendingListPreamble = LOCAL_STR_EMPTY;
      pendingListPreambleAllowsBlank = false;
      pendingListPreambleInList = false;
      continue;
    }

    pendingListPreamble = LOCAL_STR_EMPTY;
    pendingListPreambleAllowsBlank = false;
    pendingListPreambleInList = false;

    let paragraph = rawLine.trim();
    let cursor = index + LOCAL_NUM_ONE;
    while (cursor < lines.length) {
      const nextLine = lines[cursor];
      if (isBlank(nextLine) || isHeading(nextLine) || isBullet(nextLine) ||
          isTable(nextLine) || isFencedCodeBoundary(nextLine)) {
        break;
      }
      paragraph += ` ${nextLine.trim()}`;
      cursor += LOCAL_NUM_ONE;
    }

    const expandedRule = appendChildBulletsForParentRule(
      paragraph,
      lines,
      cursor,
    );
    paragraph = expandedRule.text;
    cursor = expandedRule.nextIndex;

    if (
      paragraph === rawLine.trim() &&
      isIncompleteRuleText(paragraph) &&
      isNormativeListPreamble(paragraph)
    ) {
      pendingListPreamble = stripInlineMarkdown(paragraph);
      pendingListPreambleAllowsBlank = true;
      pendingListPreambleInList = false;
      index = cursor - LOCAL_NUM_ONE;
      continue;
    }

    const sentences = splitNormativeSentences(paragraph);
    for (const sentence of sentences) {
      pushCandidate(candidates, {
        text: sentence,
        domain: source.domain,
        sourceFile: source.file,
        sourcePriority: source.priority,
        line: index + LOCAL_NUM_ONE,
        section: sectionPathFromStack(sectionStack),
        kind: LOCAL_STR_PARAGRAPH,
      });
    }

    index = cursor - LOCAL_NUM_ONE;
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

function getWordSet(text) {
  return new Set(
    String(text || '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .map(w => w.slice(0, 4))
      .filter(w => w.length >= 3)
  );
}

function isExtremelySimilar(wordsA, wordsB) {
  if (wordsA.size === 0 || wordsB.size === 0) return false;
  const intersection = new Set([...wordsA].filter(x => wordsB.has(x)));
  const union = new Set([...wordsA, ...wordsB]);
  const jaccard = intersection.size / union.size;
  if (jaccard >= 0.55) {
    return true;
  }
  const minSize = Math.min(wordsA.size, wordsB.size);
  if (minSize >= 3 && intersection.size === minSize) {
    return true;
  }
  return false;
}

function semanticDedupe(candidates) {
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const result = [];

  for (const candidate of sorted) {
    const wordsCandidate = getWordSet(candidate.text);
    let duplicateOf = null;

    for (const existing of result) {
      if (existing.domain !== candidate.domain) {
        continue;
      }
      const wordsExisting = getWordSet(existing.text);
      if (isExtremelySimilar(wordsCandidate, wordsExisting)) {
        duplicateOf = existing;
        break;
      }
    }

    if (duplicateOf) {
      for (const src of candidate.sources) {
        duplicateOf.sources = mergeSourceRefs(duplicateOf.sources, src);
      }
    } else {
      result.push(candidate);
    }
  }

  return result;
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

  const rawList = [...deduped.values()];
  return semanticDedupe(rawList);
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
      id: `${prefix}-${String(index + LOCAL_NUM_ONE).padStart(LOCAL_NUM_FOUR, LOCAL_STR_0)}`,
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

function validateCompleteRules(rules = [], outputName = LOCAL_STR_UNKNOWN_OUTPUT) {
  for (const rule of rules) {
    if (!isIncompleteRuleText(rule.text)) {
      continue;
    }
    const ruleId = rule.id || LOCAL_STR_UNKNOWN_RULE;
    throw new Error(
      `${LOCAL_STR_INCOMPLETE_RULE} in ${outputName}: ${ruleId}`,
    );
  }
}

function countMarkdownRules(content = LOCAL_STR_EMPTY) {
  return String(content || LOCAL_STR_EMPTY)
    .split(/\r?\n/u)
    .filter((line) => /^\s*\d+\.\s+/u.test(line))
    .length;
}

function renderPackMarkdown(output = {}, rules = []) {
  validateCompleteRules(rules, output.name);

  // Group rules by primary tag (or first tag in list), falling back to 'general'
  const groups = new Map();
  groups.set('general', []);
  for (const tag of Object.keys(DOMAIN_TAG_KEYWORDS)) {
    groups.set(tag, []);
  }

  for (const rule of rules) {
    const primaryTag = rule.tags && rule.tags.length > 0 ? rule.tags[0] : 'general';
    if (groups.has(primaryTag)) {
      groups.get(primaryTag).push(rule);
    } else {
      groups.get('general').push(rule);
    }
  }

  const tagTitles = {
    general: 'General Guidelines',
    ownership: 'Ownership & Authority Policies',
    lifecycle: 'Lifecycle & State Machine Rules',
    readiness: 'Readiness & Health Contracts',
    cdc: 'Change Data Capture (CDC) Policies',
    cache: 'Caching & Observation Rules',
    rebalancing: 'Rebalancing & Replica Constraints',
    routing: 'Routing & Message Dissemination',
    timeout: 'Timeouts & Budget Management',
    testing: 'Testing & Harness Guidelines',
    style: 'Code Style & Formatting Guidelines',
    governance: 'Governance & Scope Controls'
  };

  const rulesBody = [];
  let absoluteIndex = 1;

  // Order sections according to DOMAIN_TAG_KEYWORDS order
  const order = ['general', ...Object.keys(DOMAIN_TAG_KEYWORDS)];
  for (const tag of order) {
    const groupRules = groups.get(tag) || [];
    if (groupRules.length === 0) {
      continue;
    }
    const title = tagTitles[tag] || 'General Rules';
    rulesBody.push(`### ${title}`, '');
    for (const rule of groupRules) {
      rulesBody.push(`${absoluteIndex}. [${rule.id}] ${rule.text}`);
      absoluteIndex++;
    }
    rulesBody.push('');
  }

  const domainSummary = [...new Set(rules.map((rule) => rule.domain))]
    .sort()
    .join(', ');

  const sourceForScope = output.name || 'pack';
  const body = [
    '---',
    `scope: ${sourceForScope}`,
    'status: compiled',
    'always_load: false',
    `source_of_truth: .kiro/steering/ (see llm-pack.config.json sources for ${sourceForScope})`,
    'regenerate_with: npm run steering:llm:pack',
    '---',
    '',
    `> **Compiled pack — do not hand-edit.** Regenerate with \`npm run steering:llm:pack\` after editing canonical sources under \`.kiro/steering/\`.`,
    '',
    `# ${output.title || 'LLM Steering Pack'}`,
    '',
    output.description || '',
    '',
    `Generated rules: ${rules.length}`,
    `Estimated tokens: ${estimateTokens(rulesBody.join('\n'))}`,
    `Domains: ${domainSummary || 'none'}`,
    '',
    '## Rules',
    '',
    ...rulesBody,
  ];

  return body.join(LOCAL_STR_NEWLINE);
}

function buildManifest(
  outputs = [],
  selectedByOutput = new Map(),
  manualContentByOutput = new Map(),
) {
  return outputs.map((output) => {
    if (output.manual) {
      const manualContent = manualContentByOutput.get(output.name) ||
        LOCAL_STR_EMPTY;
      return {
        name: output.name,
        title: output.title,
        description: output.description,
        ruleCount: countMarkdownRules(manualContent),
        estimatedTokens: estimateTokens(manualContent),
        domains: output.domains || [],
        mode: LOCAL_STR_MANUAL,
      };
    }

    const rules = selectedByOutput.get(output.name) || [];
    const estimatedRuleTokens = estimateTokens(
      rules.map((rule, index) => `${index + 1}. [${rule.id}] ${rule.text}`)
        .join('\n'),
    );

    return {
      name: output.name,
      title: output.title,
      description: output.description,
      ruleCount: rules.length,
      estimatedTokens: estimatedRuleTokens,
      domains: output.domains || [],
      mode: LOCAL_STR_GENERATED,
    };
  });
}

function renderReadme(manifestEntries = []) {
  // Pure index. Load order is owned by AGENTS.md; do not duplicate it here.
  // Pack sizes live in manifest.json (regenerated alongside this file).
  const purpose = {
    core: 'Always-load operating contract, must-not checklist, template picker.',
    boot: 'Authority order, lane vocabulary aliases, per-lane first commands, conflict rule.',
    architecture: 'Runtime/control-plane/bootstrap/join/rebalance/lifecycle policy.',
    testing: 'Test design, fixtures, regression policy, harness rules.',
    style: 'Lint, formatting, naming policy.',
    governance: 'Roadmap, scope, edition-boundary policy.',
  };
  const lines = [
    '---',
    'scope: index',
    'status: manual-pack',
    'always_load: false',
    'source_of_truth: self',
    '---',
    '',
    '> **Manual pack — edit here directly.** This is a pure file index for the LLM steering pack directory. Load order is owned by [`AGENTS.md`](../../../AGENTS.md). Do not duplicate the load sequence here.',
    '',
    '# Steering LLM Pack — Index',
    '',
    'Regenerate the generated packs with:',
    '',
    '```bash',
    'npm run steering:llm:pack',
    '```',
    '',
    '## Files',
    '',
    '| File | Mode | Purpose |',
    '| --- | --- | --- |',
    '| `core.md` | manual | Always-load operating contract, must-not checklist, template picker. |',
    '| `boot.md` | manual | Authority order, lane vocabulary aliases, per-lane first commands, conflict rule. |',
    ...manifestEntries
      .filter((entry) => entry.name !== 'core')
      .map((entry) =>
        `| \`${entry.name}.md\` | ${entry.mode || LOCAL_STR_GENERATED} | ${purpose[entry.name] || entry.description || ''} |`,
      ),
    '| `rules.json` | generated | Complete generated rule corpus with IDs and source citations. |',
    '| `manifest.json` | generated | Pack metadata (rule counts, token estimates, domains, mode). |',
    '',
    '## Conflict Resolution',
    '',
    'If a generated pack disagrees with its canonical source under `.kiro/steering/`, the source wins. Regenerate the pack with `npm run steering:llm:pack`. For policy conflicts between sources, follow the Authority Order in [`boot.md`](boot.md).',
    '',
    '## Notes',
    '',
    '- `core.md` and `boot.md` are manually curated so the always-load contract stays memorable.',
    '- Domain Markdown packs are generated and compact for prompt loading.',
    '- Pack sizes (rule counts, token estimates) are recorded in `manifest.json` at generation time; do not maintain a separate static table.',
    '',
  ];

  return lines.join(LOCAL_STR_NEWLINE);
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function readOptionalJson(filePath) {
  try {
    return await readJson(filePath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    return null;
  }
}

async function readOptionalText(filePath) {
  try {
    return await fs.readFile(filePath, LOCAL_STR_UTF8);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function withoutGeneratedAt(value) {
  if (!value || typeof value !== 'object') {
    return value;
  }
  const clone = JSON.parse(JSON.stringify(value));
  delete clone.generatedAt;
  return clone;
}

function generatedPayloadMatches(existingPayload, nextPayload) {
  return JSON.stringify(withoutGeneratedAt(existingPayload)) ===
    JSON.stringify(withoutGeneratedAt(nextPayload));
}

async function writeTextIfChanged(filePath, content) {
  const existingContent = await readOptionalText(filePath);
  if (existingContent === content) {
    return false;
  }
  await fs.writeFile(filePath, content, LOCAL_STR_UTF8);
  return true;
}

function stableGeneratedAt(existingPayload, nextPayload) {
  return existingPayload &&
    existingPayload.generatedAt &&
    generatedPayloadMatches(existingPayload, nextPayload) ?
    existingPayload.generatedAt :
    new Date().toISOString();
}

async function main() {
  const arg = process.argv[2];
  if (arg === LOCAL_STR_HELP || arg === LOCAL_STR_H) {
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
  const manualContentByOutput = new Map();
  for (const output of config.outputs || []) {
    if (output.manual) {
      const manualPath = path.join(llmDir, `${output.name}.md`);
      const manualContent = await fs.readFile(manualPath, LOCAL_STR_UTF8);
      manualContentByOutput.set(output.name, manualContent);
      selectedByOutput.set(output.name, []);
      continue;
    }

    const selected = selectOutputRules(allRules, output);
    selectedByOutput.set(output.name, selected);

    const markdown = renderPackMarkdown(output, selected);
    await writeTextIfChanged(
      path.join(llmDir, `${output.name}.md`),
      `${markdown}`,
    );
  }

  const manifestEntries = buildManifest(
    config.outputs || [],
    selectedByOutput,
    manualContentByOutput,
  );
  const rulesJsonPath = path.join(llmDir, LOCAL_STR_RULES_JSON);
  const manifestPath = path.join(llmDir, LOCAL_STR_MANIFEST_JSON);
  const rulesJson = {
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
  rulesJson.generatedAt = stableGeneratedAt(
    await readOptionalJson(rulesJsonPath),
    rulesJson,
  );

  await writeTextIfChanged(
    rulesJsonPath,
    `${JSON.stringify(rulesJson, null, JSON_INDENT_SPACES)}\n`,
  );

  const manifest = {
    generatedAt: rulesJson.generatedAt,
    packs: manifestEntries,
  };
  manifest.generatedAt = stableGeneratedAt(
    await readOptionalJson(manifestPath),
    manifest,
  );

  await writeTextIfChanged(
    manifestPath,
    `${JSON.stringify(manifest, null, JSON_INDENT_SPACES)}\n`,
  );

  const readme = renderReadme(manifestEntries);
  await writeTextIfChanged(
    path.join(llmDir, LOCAL_STR_README_MD),
    `${readme}`,
  );

  console.log(LOCAL_STR_1WFBO);
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
  buildManifest,
  collectBulletListText,
  countMarkdownRules,
  parseMarkdownCandidates,
  renderPackMarkdown,
  validateCompleteRules,
};
