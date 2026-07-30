#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

const LOCAL_STR_USAGE_NODE_SCRIPTS_GENERATE_STEERING_LLM = 'Usage: node scripts/generate-steering-llm-pack.js ';
const LOCAL_STR_OPTIONAL_CONFIG_PATH = '[optional-config-path]';
const LOCAL_NUM_FOUR = 4;
const LOCAL_STR_SPACE = ' ';
const LOCAL_STR_GT = '>';
const LOCAL_STR_DOLLAR_1 = '$1';
const LOCAL_STR_MUST_NOT = 'must_not';
const LOCAL_STR_MUST = 'must';
const LOCAL_STR_SHOULD = 'should';
const LOCAL_STR_MAY = 'may';
const LOCAL_STR_INFO = 'info';
const LOCAL_NUM_NINETY = 90;
const LOCAL_NUM_SEVENTY_TWO = 72;
const LOCAL_NUM_FORTY = 40;
const LOCAL_NUM_TWENTY_FOUR = 24;
const LOCAL_NUM_TWELVE = 12;
const LOCAL_STR_BULLET = 'bullet';
const LOCAL_NUM_TEN = 10;
const LOCAL_NUM_THIRTY = 30;
const LOCAL_NUM_EIGHT = 8;
const LOCAL_NUM_TWO_HUNDRED_TWENTY = 220;
const LOCAL_STR_EXAMPLE = 'example';
const LOCAL_STR_NOTE = 'note:';
const LOCAL_NUM_SIX = 6;
const LOCAL_NUM_TWO_HUNDRED_FIFTY = 250;
const LOCAL_STR_SPACE_GT_SPACE = ' > ';
const LOCAL_STR_ROOT = 'root';
const LOCAL_NUM_SIXTEEN = 16;
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
const LOCAL_STR_GENERATED_STEERING_LLM_PACK = 'Generated steering LLM pack';
const LOCAL_STR_INCOMPLETE_RULE = 'Incomplete generated steering rule';
const LOCAL_STR_UNKNOWN_RULE = '<unknown-rule>';
const LOCAL_STR_UNKNOWN_OUTPUT = '<unknown-output>';
const LOCAL_STR_MANUAL = 'manual';
const LOCAL_STR_GENERATED = 'generated';
const LOCAL_STR_REGEX_FLAGS_CASE_INSENSITIVE_UNICODE = 'iu';
const LOCAL_STR_CANONICAL = 'canonical';
const LOCAL_STR_ALIAS = 'alias';
const LOCAL_STR_FRONTMATTER_DELIMITER = '---';
const LOCAL_STR_ALIAS_MATCH_REQUIREMENT =
  'Every ruleAliases ref must carry a match substring of the rule text ' +
  'so a shifted line anchor fails loudly instead of silently repointing.';
const LOCAL_STR_ALIAS_ANCHOR_DRIFT =
  're-locate the rule in the source file and update llm-pack.config.json.';
const LOCAL_STR_PIN_MATCH_UPDATE =
  'to the current rule text in that source file.';
const LOCAL_STR_SOURCE_CONTRIBUTION_HEADER =
  'Per-source role and complete-pack contribution:';
const LOCAL_STR_POINTER = 'pointer';
const LOCAL_STR_ALIAS_REFERENCE_FAILURE =
  'ruleAliases references not found (line anchor drifted or rule text ' +
  'no longer extracted):\n  - ';
const LOCAL_STR_LIST_ITEM_SEPARATOR = '\n  - ';
const LOCAL_STR_FULL_RULE_CORPUS = 'full rule corpus';
const LOCAL_STR_PACKED = 'packed';
const LOCAL_STR_DIRECT_LOAD = 'direct-load';
const LOCAL_STR_REFERENCE_ONLY = 'reference-only';
const LOCAL_STR_COMPLETE = 'complete';
const LOCAL_STR_INCOMPLETE = 'incomplete';
const LOCAL_STR_MISSING = '<missing>';
const LOCAL_STR_MISSING_FILE = '<missing-file>';
const LOCAL_STR_MISSING_NAME = '<missing-name>';
const LOCAL_STR_COMMA_SPACE = ', ';
const LOCAL_STR_MAX_RULES = 'maxRules';
const LOCAL_STR_DOMAIN_CAPS = 'domainCaps';
const LOCAL_STR_PINNED_RULES = 'pinnedRules';
const LOCAL_STR_INVALID_SOURCE_ENTRY =
  'Every steering source must have one unique file; invalid entry: ';
const LOCAL_STR_OUTPUT_DOMAIN_REQUIRED = 'declare at least one domain.';
const LOCAL_STR_COMPLETE_EMISSION_REQUIRED =
  'Every master steering rule must appear in exactly one complete domain ';
const LOCAL_STR_ALIAS_MASTER_REQUIRED =
  'Steering aliases must point to an emitted master rule: ';
const LOCAL_STR_ZERO_CONTRIBUTION_REMEDIATION =
  'contribution; extract at least one rule or assign an explicit ' +
  'direct-load/reference-only role.';
const LOCAL_STR_POINTER_REMEDIATION =
  'reference-only or replace it with the canonical source.';
const OUTPUT_LIMIT_KEYS = Object.freeze([
  LOCAL_STR_MAX_RULES,
  LOCAL_STR_DOMAIN_CAPS,
  LOCAL_STR_PINNED_RULES,
]);
const SOURCE_ROLES = new Set([
  LOCAL_STR_PACKED,
  LOCAL_STR_DIRECT_LOAD,
  LOCAL_STR_REFERENCE_ONLY,
]);
const FRONTMATTER_STATUS_MISSING = Object.freeze({
  found: false,
  status: '',
});

const DEFAULT_CONFIG_PATH = path.join(
  'docs',
  'steering',
  'llm-pack.config.json',
);

const HEADING_PATTERN = /^(\s{0,3})(#{1,6})\s+(.+)$/u;
const BULLET_PATTERN = /^\s*(?:[-*]|\d+\.)\s+(.+)$/u;
const BULLET_WITH_INDENT_PATTERN = /^(\s*)(?:[-*]|\d+\.)\s+(.+)$/u;
const TABLE_PATTERN = /^\s*\|/u;
const FENCED_CODE_PATTERN = /^\s*```/u;
const TRAILING_COLON_PATTERN = /:\s*$/u;
const NORMATIVE_LIST_DIRECTIVE_PATTERN =
  /\b(MUST\s+NOT|SHALL\s+NOT|DO\s+NOT|NEVER|MUST|SHALL|SHOULD|MAY)\b/iu;
const NORMATIVE_LIST_LABEL_PATTERN = /^(REQUIRED|FORBIDDEN)\b/iu;
const NORMATIVE_LIST_PREDICATE_PATTERN =
  /\b(IS|ARE|BE)\s+(REQUIRED|FORBIDDEN)\b/iu;
const CONDITIONAL_REQUIRED_PREDICATE_PATTERN =
  /\b(WHETHER|IF)\b[^:]*\b(IS|ARE|BE)\s+REQUIRED\b/iu;
const POSITIVE_NORMATIVE_LIST_PREAMBLE_PATTERN =
  /\b(MUST|SHALL|REQUIRED|SHOULD|MAY)\b[^:]*:\s*$/iu;
const SENTENCE_BOUNDARY_PATTERN =
  /(?<!\be\.g\.)(?<!\bi\.e\.)(?<=[.!?])\s+/iu;
const INLINE_CODE_SEGMENT_PATTERN = /(`[^`]+`)/gu;
const INLINE_CODE_EXACT_PATTERN = /^`[^`]+`$/u;
const CHILD_RULE_PREFIX = '- ';
const CHILD_RULE_JOINER = '; ';
const RULE_BODY_JOINER = ' ';
const LIST_CONTEXT_SEPARATOR = ' — ';
const EMPTY_TEXT = '';
const PROCESS_ARG_SCRIPT_INDEX = 1;
const COMPARE_EQUAL = 0;
const RULE_ID_PREFIX_START_INDEX = 0;
const RULE_ID_PREFIX_MAX_LENGTH = 6;
const EXIT_CODE_SUCCESS = 0;
const EXIT_CODE_FAILURE = 1;
const JSON_INDENT_SPACES = 2;
const DEFAULT_RULE_PREFIX = 'RULE';

// FORBIDDEN is recognized in every authoring shape findings/README.md promises:
// "is/are/be FORBIDDEN", "FORBIDDEN TO", "FORBIDDEN:", "FORBIDDEN —", and bare
// FORBIDDEN as the sentence lead ("FORBIDDEN: do X").
const FORBIDDEN_PATTERN =
  /\b(?:IS|ARE|BE)\s+FORBIDDEN\b|\bFORBIDDEN\s+TO\b|\bFORBIDDEN\s*[:—–-]|^FORBIDDEN\b/iu;
const NORMATIVE_PATTERN = new RegExp(
  '\\b(MUST\\s+NOT|SHALL\\s+NOT|MUST|SHALL|NEVER|SHOULD|MAY|REQUIRED|DO\\s+NOT)\\b|^ONLY\\b|' +
  FORBIDDEN_PATTERN.source,
  'iu',
);
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

// Word-boundary matchers for DOMAIN_TAG_KEYWORDS. Substring matching misfiled
// rules ('ready' matched "already", 'test' matched "test ≤ 1500"), which put
// them under the wrong pack section heading. Multi-word keywords tolerate any
// whitespace run between words.
function buildKeywordPattern(keyword) {
  const escaped = String(keyword)
    .split(/\s+/u)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'))
    .join('\\s+');
  return new RegExp(
    `(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`,
    LOCAL_STR_REGEX_FLAGS_CASE_INSENSITIVE_UNICODE,
  );
}

const DOMAIN_TAG_PATTERNS = Object.freeze(
  Object.fromEntries(
    Object.entries(DOMAIN_TAG_KEYWORDS).map(([tag, keywords]) => [
      tag,
      keywords.map(buildKeywordPattern),
    ]),
  ),
);

const NON_RULE_SECTION_HEADINGS = new Set([
  'document role',
  'document authority map',
  'audit procedure',
]);

function printUsage() {
  console.log(
    LOCAL_STR_USAGE_NODE_SCRIPTS_GENERATE_STEERING_LLM +
    LOCAL_STR_OPTIONAL_CONFIG_PATH,
  );
}

function estimateTokens(text) {
  return Math.ceil(String(text || '').length / LOCAL_NUM_FOUR);
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

function isFencedCodeBoundary(line) {
  return FENCED_CODE_PATTERN.test(line);
}

function isNormativeListPreamble(text = '') {
  const normalized = stripInlineMarkdown(normalizeWhitespace(text));
  if (!TRAILING_COLON_PATTERN.test(normalized)) {
    return false;
  }
  if (
    NORMATIVE_LIST_DIRECTIVE_PATTERN.test(normalized) ||
    NORMATIVE_LIST_LABEL_PATTERN.test(normalized)
  ) {
    return true;
  }
  return NORMATIVE_LIST_PREDICATE_PATTERN.test(normalized) &&
    !CONDITIONAL_REQUIRED_PREDICATE_PATTERN.test(normalized);
}

function isFragmentLikeBullet(text = '') {
  const normalized = normalizeWhitespace(text);
  return /^[a-z]/u.test(normalized) && !/[.!?)]$/u.test(normalized);
}

function normalizeWhitespace(value) {
  return String(value || '').replace(/\s+/gu, LOCAL_STR_SPACE).trim();
}

function shouldIgnoreSection(sectionPath = '') {
  return String(sectionPath || '')
    .split(LOCAL_STR_GT)
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

const APHORISM_ADMONITION_PATTERN =
  /^(?:STOP|DO\s+NOT\s+IGNORE|DO\s+NOT\s+DEFER|ANALYZE|ANALYSE|INVESTIGATE|VERIFY|FIX|WARNING|CAUTION|NOTE)\b\s*[-—:]/u;
const APHORISM_ALLCAPS_LABEL_PATTERN = /^[A-Z][A-Z\s]{1,30}[A-Z]\s*[-—:]\s/u;
// Sentence-leading pronoun + verb (including copulas/possession: is/are/was/
// were/has/have/had) with no antecedent in the rule text — the rule cannot be
// understood standalone. The verb group matches case-insensitively: this
// corpus's house style UPPERCASES modals ("This MUST be respected."), and a
// case-sensitive verb list made exactly those danglers invisible. An optional
// NEVER/ALWAYS adverb between pronoun and verb is covered for the same reason.
// Expletive normative constructions ("It is FORBIDDEN to ...", "It is
// REQUIRED to ...") are exempt in any casing: there the "It" is a dummy
// subject, not a dangling reference.
const APHORISM_EXPLETIVE_NORMATIVE_PATTERN =
  /^It\s+is\s+(?:not\s+)?(?:forbidden|required|mandatory)\b/iu;
const APHORISM_DANGLING_PRONOUN_PATTERN =
  /^(?:They|It|This|That|These|Those)\s+(?:(?:never|always)\s+)?(?:is|are|was|were|has|have|had|do|does|did|must|should|shall|will|can|cannot|may|might|need|needs|require|requires|replace|replaces|prevent|prevents|apply|applies|run|runs|use|uses|fail|fails|own|owns|hold|holds|enforce|enforces)\b/iu;
const APHORISM_DANGLING_POSSESSIVE_PATTERN = /^(?:Their|Its)\b/iu;

function classifyAphoristicText(text = '') {
  const normalized = normalizeWhitespace(text);
  if (!normalized) {
    return null;
  }
  if (APHORISM_ADMONITION_PATTERN.test(normalized)) {
    return 'admonition_marker';
  }
  if (APHORISM_ALLCAPS_LABEL_PATTERN.test(normalized)) {
    return 'allcaps_label';
  }
  if (
    (APHORISM_DANGLING_PRONOUN_PATTERN.test(normalized) ||
      APHORISM_DANGLING_POSSESSIVE_PATTERN.test(normalized)) &&
    !APHORISM_EXPLETIVE_NORMATIVE_PATTERN.test(normalized)
  ) {
    return 'dangling_pronoun';
  }
  return null;
}

function isAphoristicText(text = '') {
  return classifyAphoristicText(text) !== null;
}

function formatRuleCitation(rule = {}) {
  const sources = Array.isArray(rule.sources) ? rule.sources : [];
  if (sources.length === 0) {
    return '';
  }
  const primary = sources[0] || {};
  const file = primary.file ? String(primary.file) : '';
  const line = primary.line ? String(primary.line) : '';
  if (!file) {
    return '';
  }
  return line ? `${file}:${line}` : file;
}

function stripInlineMarkdown(value) {
  const segments = String(value || '').split(INLINE_CODE_SEGMENT_PATTERN);
  return normalizeWhitespace(
    segments.map((segment) => {
      if (INLINE_CODE_EXACT_PATTERN.test(segment)) {
        return segment.slice(1, -1);
      }
      return segment
        .replace(/\[([^\]]+)\]\([^)]+\)/gu, LOCAL_STR_DOLLAR_1)
        .replace(/\*\*([^*]+)\*\*/gu, LOCAL_STR_DOLLAR_1)
        .replace(/__([^_]+)__/gu, LOCAL_STR_DOLLAR_1)
        .replace(/\*([^*]+)\*/gu, LOCAL_STR_DOLLAR_1)
        // Underscore emphasis only at word boundaries; never strip snake_case
        // (e.g. MAX_CYCLES, THEORY_REQUIRED) where underscores are intra-word.
        .replace(/(?<![A-Za-z0-9])_([^_]+?)_(?![A-Za-z0-9])/gu, LOCAL_STR_DOLLAR_1)
        .replace(/^>\s*/gu, '');
    }).join(EMPTY_TEXT),
  );
}

function normalizeRuleKey(value) {
  return normalizeWhitespace(
    String(value || '')
      .toLowerCase()
      .replace(/[“”"'`]/gu, '')
      .replace(/[^\p{L}\p{N}\s-]/gu, LOCAL_STR_SPACE)
      .replace(/\s+/gu, LOCAL_STR_SPACE),
  );
}

function inferStrength(text) {
  const normalized = String(text || '').toUpperCase();
  if (
    /(MUST\s+NOT|SHALL\s+NOT|MAY\s+NOT|NEVER|DO\s+NOT)/u.test(normalized) ||
    FORBIDDEN_PATTERN.test(normalized)
  ) {
    return LOCAL_STR_MUST_NOT;
  }
  if (/\bAT\s+MOST\b[^.]*\bMAY\b/u.test(normalized)) {
    return LOCAL_STR_MUST;
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

// Parenthesized asides ("(e.g. in scripts/solve/, src/rebalancer/, and some
// test names)") illustrate a rule; they do not define its subject. Keywords
// inside them misfile rules under unrelated pack section headings, so strip
// them before tag inference. Repeats until stable to unwrap nesting.
function stripParentheticalAsides(text) {
  let current = String(text || '');
  let previous;
  do {
    previous = current;
    current = current.replace(/\([^()]*\)/gu, LOCAL_STR_SPACE);
  } while (current !== previous);
  return current;
}

function inferTags(text) {
  const normalized = stripParentheticalAsides(text);
  const tags = [];
  for (const [tag, patterns] of Object.entries(DOMAIN_TAG_PATTERNS)) {
    if (patterns.some((pattern) => pattern.test(normalized))) {
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

  const sentences = normalizedParagraph.split(SENTENCE_BOUNDARY_PATTERN)
    .map((sentence) => normalizeWhitespace(sentence))
    .filter(Boolean);

  if (sentences.length === 0) {
    return [];
  }

  const normative = [];
  for (let index = 0; index < sentences.length; index++) {
    const sentence = sentences[index];
    if (!NORMATIVE_PATTERN.test(sentence)) {
      continue;
    }
    const previousSentence = sentences[index - 1];
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

  if (normative.length > 0) {
    return normative;
  }

  if (NORMATIVE_PATTERN.test(normalizedParagraph)) {
    return [normalizedParagraph];
  }

  return [];
}

// Map each emitted normative sentence to the physical source line where it begins,
// so two distinct rules drawn from the same multi-sentence paragraph cite distinct
// lines instead of both citing the paragraph's first line. physicalLines are the raw
// source lines composing the paragraph in order; firstLineNumber is the 1-based line
// number of physicalLines[0]. Falls back to firstLineNumber when a sentence cannot be
// located (e.g. text reshaped by inline-markdown stripping).
function attributeSentenceLines(sentences, physicalLines, firstLineNumber) {
  const stream = [];
  physicalLines.forEach((raw, offset) => {
    const words = normalizeWhitespace(stripInlineMarkdown(raw))
      .toLowerCase()
      .split(LOCAL_STR_SPACE)
      .filter(Boolean);
    for (const word of words) {
      stream.push({word, line: firstLineNumber + offset});
    }
  });
  let pointer = 0;
  return sentences.map((sentence) => {
    const words = normalizeWhitespace(stripInlineMarkdown(sentence))
      .toLowerCase()
      .split(LOCAL_STR_SPACE)
      .filter(Boolean);
    if (words.length === 0) {
      return firstLineNumber;
    }
    const needle = words.slice(0, Math.min(LOCAL_NUM_FOUR, words.length));
    let matchIndex = -1;
    for (let i = pointer; i + needle.length <= stream.length; i++) {
      let matched = true;
      for (let j = 0; j < needle.length; j++) {
        if (stream[i + j].word !== needle[j]) {
          matched = false;
          break;
        }
      }
      if (matched) {
        matchIndex = i;
        break;
      }
    }
    if (matchIndex < 0) {
      return firstLineNumber;
    }
    pointer = matchIndex + words.length;
    return stream[matchIndex].line;
  });
}

function scoreCandidate(candidate) {
  const strength = candidate.strength;
  let score = Number(candidate.sourcePriority || 0);

  if (strength === LOCAL_STR_MUST_NOT) {
    score += LOCAL_NUM_NINETY;
  } else if (strength === LOCAL_STR_MUST) {
    score += LOCAL_NUM_SEVENTY_TWO;
  } else if (strength === LOCAL_STR_SHOULD) {
    score += LOCAL_NUM_FORTY;
  } else if (strength === LOCAL_STR_MAY) {
    score += LOCAL_NUM_TWENTY_FOUR;
  } else {
    score += LOCAL_NUM_TWELVE;
  }

  if (candidate.kind === LOCAL_STR_BULLET) {
    score += LOCAL_NUM_TEN;
  }

  const text = candidate.text;
  const textLength = text.length;

  if (textLength < LOCAL_NUM_THIRTY) {
    score -= LOCAL_NUM_EIGHT;
  }
  if (textLength > LOCAL_NUM_TWO_HUNDRED_TWENTY) {
    score -= LOCAL_NUM_TWENTY_FOUR;
  }

  const lowered = text.toLowerCase();
  if (lowered.includes(LOCAL_STR_EXAMPLE)) {
    score -= LOCAL_NUM_TWELVE;
  }
  if (lowered.startsWith(LOCAL_STR_NOTE)) {
    score -= LOCAL_NUM_TEN;
  }

  score += Math.max(0, LOCAL_NUM_SIX - Math.floor(candidate.line / LOCAL_NUM_TWO_HUNDRED_FIFTY));

  return score;
}

function ensureRelativePath(workspaceRoot, value) {
  if (path.isAbsolute(value)) {
    return value;
  }
  return path.join(workspaceRoot, value);
}

function validateSourceRoleDetails(source) {
  if (source.role === LOCAL_STR_PACKED && !Number.isFinite(source.priority)) {
    throw new Error(
      `Packed steering source ${source.file} must declare a numeric priority.`,
    );
  }
  if (source.role === LOCAL_STR_DIRECT_LOAD && !source.loadWhen) {
    throw new Error(
      `Direct-load steering source ${source.file} must declare loadWhen.`,
    );
  }
  if (source.role === LOCAL_STR_REFERENCE_ONLY && !source.reason) {
    throw new Error(
      `Reference-only steering source ${source.file} must declare a reason.`,
    );
  }
}

function validateSourceRoles(sources = []) {
  const seenFiles = new Set();
  for (const source of sources) {
    if (!source.file || seenFiles.has(source.file)) {
      throw new Error(
        LOCAL_STR_INVALID_SOURCE_ENTRY +
        `${source.file || LOCAL_STR_MISSING_FILE}.`,
      );
    }
    seenFiles.add(source.file);
    if (!SOURCE_ROLES.has(source.role)) {
      throw new Error(
        `Steering source ${source.file} must declare role ` +
        `${[...SOURCE_ROLES].join(LOCAL_STR_COMMA_SPACE)}; received ` +
        `${source.role || LOCAL_STR_MISSING}.`,
      );
    }
    if (!source.domain) {
      throw new Error(
        `Steering source ${source.file} must declare its domain provenance.`,
      );
    }
    validateSourceRoleDetails(source);
  }
}

function validateCompleteOutputConfig(outputs = []) {
  for (const output of outputs) {
    const capKeys = OUTPUT_LIMIT_KEYS
      .filter((key) => output[key] !== undefined);
    if (capKeys.length > 0) {
      throw new Error(
        `Steering output ${output.name || LOCAL_STR_MISSING_NAME} must be ` +
        `complete; remove limiting keys: ${capKeys.join(LOCAL_STR_COMMA_SPACE)}.`,
      );
    }
    if (!output.manual && (!Array.isArray(output.domains) ||
        output.domains.length === 0)) {
      throw new Error(
        `Generated steering output ${output.name || LOCAL_STR_MISSING_NAME} must ` +
        LOCAL_STR_OUTPUT_DOMAIN_REQUIRED,
      );
    }
  }
}

function sectionPathFromStack(sectionStack) {
  const parts = sectionStack.filter(Boolean);
  return parts.length > 0 ? parts.join(LOCAL_STR_SPACE_GT_SPACE) : LOCAL_STR_ROOT;
}

function contextualizeListPreamble(preamble, sectionStack = []) {
  const normalized = stripInlineMarkdown(preamble);
  if (!POSITIVE_NORMATIVE_LIST_PREAMBLE_PATTERN.test(normalized)) {
    return normalized;
  }
  const subject = [...sectionStack].reverse().find(Boolean);
  return subject ?
    `${stripInlineMarkdown(subject)}${LIST_CONTEXT_SEPARATOR}${normalized}` :
    normalized;
}

function pushCandidate(container, options = {}) {
  const text = stripInlineMarkdown(options.text || '');
  if (!text) {
    return;
  }
  if (shouldIgnoreSection(options.section)) {
    return;
  }
  if (text.length < LOCAL_NUM_SIXTEEN) {
    return;
  }
  if (isPathOnlyText(text)) {
    return;
  }
  if (isIncompleteRuleText(text)) {
    return;
  }

  const strength = options.strength || inferStrength(text);
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
    preserveDistinctRule: options.preserveDistinctRule === true,
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
          isBullet(nextLine) || isTable(nextLine) ||
          isFencedCodeBoundary(nextLine)) {
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
  let inCodeFence = false;
  let pendingListPreamble = '';
  let pendingListPreambleStrength = null;
  let pendingListPreambleAllowsBlank = false;
  let pendingListPreambleInList = false;

  for (let index = 0; index < lines.length; index++) {
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
      pendingListPreamble = '';
      pendingListPreambleStrength = null;
      pendingListPreambleAllowsBlank = false;
      pendingListPreambleInList = false;
      const level = headingMatch[2].length;
      const headingText = stripInlineMarkdown(headingMatch[3]);
      sectionStack.length = Math.max(level - 1, 0);
      sectionStack[level - 1] = headingText;
      continue;
    }

    const bulletMatch = rawLine.match(BULLET_WITH_INDENT_PATTERN);
    if (bulletMatch) {
      let text = bulletMatch[2];
      const inheritedListPreamble = Boolean(pendingListPreamble);
      const inheritedListPreambleStrength = pendingListPreambleStrength;
      let cursor = index + 1;

      while (cursor < lines.length) {
        const nextLine = lines[cursor];
        if (isBlank(nextLine) || isHeading(nextLine) || isBullet(nextLine) ||
            isTable(nextLine) || isFencedCodeBoundary(nextLine)) {
          break;
        }
        text += ` ${nextLine.trim()}`;
        cursor += 1;
      }

      const expandedChildRule = appendChildBulletsForParentRule(
        text,
        lines,
        cursor,
        {minimumIndent: bulletMatch[1].length + 1},
      );
      const expandedChildList = expandedChildRule.text !== text;
      text = expandedChildRule.text;
      cursor = expandedChildRule.nextIndex;
      const explicitChildStrength = inferStrength(text);
      if (pendingListPreamble) {
        text = `${pendingListPreamble}${RULE_BODY_JOINER}${text}`;
        pendingListPreambleAllowsBlank = false;
        pendingListPreambleInList = true;
      }

      pushCandidate(candidates, {
        text,
        domain: source.domain,
        sourceFile: source.file,
        sourcePriority: source.priority,
        line: index + 1,
        section: sectionPathFromStack(sectionStack),
        kind: LOCAL_STR_BULLET,
        preserveDistinctRule: inheritedListPreamble || expandedChildList,
        strength: inheritedListPreamble ?
          (inheritedListPreambleStrength === LOCAL_STR_MUST_NOT ?
            LOCAL_STR_MUST_NOT :
            (explicitChildStrength === LOCAL_STR_INFO ?
              inheritedListPreambleStrength :
              explicitChildStrength)) :
          null,
      });

      index = cursor - 1;
      continue;
    }

    if (isBlank(rawLine)) {
      if (pendingListPreambleInList || !pendingListPreambleAllowsBlank) {
        pendingListPreamble = '';
        pendingListPreambleStrength = null;
        pendingListPreambleAllowsBlank = false;
        pendingListPreambleInList = false;
        continue;
      }
      pendingListPreambleAllowsBlank = false;
      continue;
    }

    if (isTable(rawLine)) {
      pendingListPreamble = '';
      pendingListPreambleStrength = null;
      pendingListPreambleAllowsBlank = false;
      pendingListPreambleInList = false;
      continue;
    }

    pendingListPreamble = '';
    pendingListPreambleStrength = null;
    pendingListPreambleAllowsBlank = false;
    pendingListPreambleInList = false;

    let paragraph = rawLine.trim();
    let cursor = index + 1;
    while (cursor < lines.length) {
      const nextLine = lines[cursor];
      if (isBlank(nextLine) || isHeading(nextLine) || isBullet(nextLine) ||
          isTable(nextLine) || isFencedCodeBoundary(nextLine)) {
        break;
      }
      paragraph += ` ${nextLine.trim()}`;
      cursor += 1;
    }

    const baseParagraph = paragraph;
    const baseParagraphLines = lines.slice(index, cursor);

    const expandedRule = appendChildBulletsForParentRule(
      paragraph,
      lines,
      cursor,
    );
    const expandedChildList = expandedRule.text !== paragraph;
    paragraph = expandedRule.text;
    cursor = expandedRule.nextIndex;

    if (
      isIncompleteRuleText(paragraph) &&
      isNormativeListPreamble(paragraph)
    ) {
      pendingListPreamble = contextualizeListPreamble(
        paragraph,
        sectionStack,
      );
      pendingListPreambleStrength = inferStrength(paragraph);
      pendingListPreambleAllowsBlank = true;
      pendingListPreambleInList = false;
      index = cursor - 1;
      continue;
    }

    const sentences = splitNormativeSentences(paragraph);
    // When the paragraph yields more than one rule and was not reshaped by
    // child-bullet expansion, attribute each sentence to its own source line so
    // distinct rules from one paragraph cite distinct lines (not all the first line).
    const sentenceLines = (paragraph === baseParagraph && sentences.length > 1) ?
      attributeSentenceLines(sentences, baseParagraphLines, index + 1) :
      null;
    sentences.forEach((sentence, sentenceIndex) => {
      pushCandidate(candidates, {
        text: sentence,
        domain: source.domain,
        sourceFile: source.file,
        sourcePriority: source.priority,
        line: sentenceLines ? sentenceLines[sentenceIndex] : index + 1,
        section: sectionPathFromStack(sectionStack),
        kind: LOCAL_STR_PARAGRAPH,
        preserveDistinctRule: expandedChildList,
      });
    });

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

function getWordSet(text) {
  return new Set(
    String(text || '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .map((w) => w.slice(0, 4))
      .filter((w) => w.length >= 3),
  );
}

function isExtremelySimilar(wordsA, wordsB) {
  if (wordsA.size === 0 || wordsB.size === 0) return false;
  const intersection = new Set([...wordsA].filter((x) => wordsB.has(x)));
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
      // A normative list's shared preamble makes distinct child obligations
      // look extremely similar. Exact-text duplicates were already folded
      // above; fuzzy merging here would retain only one child body while
      // attaching every sibling citation to it.
      if (candidate.preserveDistinctRule || existing.preserveDistinctRule) {
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
        preserveDistinctRule:
          candidate.preserveDistinctRule || existing.preserveDistinctRule,
        sources: mergedSources,
      });
      continue;
    }

    deduped.set(key, {
      ...existing,
      preserveDistinctRule:
        existing.preserveDistinctRule || candidate.preserveDistinctRule,
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
      id: `${prefix}-${String(index + 1).padStart(LOCAL_NUM_FOUR, LOCAL_STR_0)}`,
    })));
  }

  const allRules = [...byDomain.values()].flat().sort(compareRules);
  return {allRules, byDomain};
}

function ruleSourceKey(sourceRef = {}) {
  const file = sourceRef.file || '';
  const line = sourceRef.line;
  return `${file}:${line}`;
}

function locateRuleBySourceRef(rules = [], target = {}) {
  const targetKey = ruleSourceKey(target);
  for (const rule of rules) {
    for (const source of rule.sources || []) {
      if (ruleSourceKey(source) === targetKey) {
        return rule;
      }
    }
  }
  return null;
}

// Line anchors rot silently when a source doc gains or loses lines above the
// anchored rule (a doc edit once repointed the "synonyms ban" alias at an
// unrelated rule). Every alias ref therefore carries a REQUIRED `match`
// substring of the rule text, asserted here at generation time.
function assertAliasMatch(rule, ref = {}, role, note) {
  const where = `${ref.file || '<no file>'}:${ref.line ?? '<no line>'}`;
  const label = note ? ` ("${note}")` : '';
  if (typeof ref.match !== 'string' || ref.match.length === 0) {
    throw new Error(
      `ruleAliases ${role} ref ${where}${label} has no \`match\` field. ` +
      LOCAL_STR_ALIAS_MATCH_REQUIREMENT,
    );
  }
  if (!rule.text.includes(ref.match)) {
    throw new Error(
      `ruleAliases ${role} ref ${where}${label} resolved to a rule that does ` +
      `not contain its \`match\` substring.\n  expected match: "${ref.match}"` +
      `\n  actual rule text: "${rule.text}"\n  The line anchor has drifted — ` +
      LOCAL_STR_ALIAS_ANCHOR_DRIFT,
    );
  }
}

function applyRuleAliases(allRules = [], ruleAliases = []) {
  const aliasStats = {pairs: 0, missing: []};
  for (const entry of ruleAliases) {
    const canonicalRule = locateRuleBySourceRef(allRules, entry.canonical || {});
    if (!canonicalRule) {
      aliasStats.missing.push({role: 'canonical', ref: entry.canonical || null});
      continue;
    }
    assertAliasMatch(
      canonicalRule,
      entry.canonical,
      LOCAL_STR_CANONICAL,
      entry.note,
    );
    for (const aliasRef of entry.aliases || []) {
      const aliasRule = locateRuleBySourceRef(allRules, aliasRef);
      if (!aliasRule) {
        aliasStats.missing.push({role: 'alias', ref: aliasRef});
        continue;
      }
      assertAliasMatch(aliasRule, aliasRef, LOCAL_STR_ALIAS, entry.note);
      if (aliasRule.id === canonicalRule.id) {
        continue;
      }
      aliasRule.canonical_of = canonicalRule.id;
      canonicalRule.aliases = canonicalRule.aliases || [];
      if (!canonicalRule.aliases.includes(aliasRule.id)) {
        canonicalRule.aliases.push(aliasRule.id);
      }
      aliasStats.pairs += 1;
    }
  }
  return aliasStats;
}

function selectOutputRules(allRules = [], output = {}) {
  const domains = new Set(output.domains || []);
  return allRules.filter((rule) =>
    domains.has(rule.domain) && !rule.canonical_of);
}

function applySourceRoles(allRules = [], sources = []) {
  const rolesByFile = new Map(
    sources.map((source) => [source.file, source.role]),
  );
  for (const rule of allRules) {
    for (const sourceRef of rule.sources || []) {
      const role = rolesByFile.get(sourceRef.file);
      if (!role) {
        throw new Error(
          `Rule ${rule.id || LOCAL_STR_UNKNOWN_RULE} cites unclassified ` +
          `steering source ${sourceRef.file}.`,
        );
      }
      sourceRef.role = role;
    }
  }
}

function validateCompleteOutputCoverage(
  allRules = [],
  outputs = [],
  selectedByOutput = new Map(),
) {
  const generatedOutputs = outputs.filter((output) => !output.manual);
  const emissionCountByRuleId = new Map();

  for (const output of generatedOutputs) {
    const expected = allRules.filter((rule) =>
      !rule.canonical_of && (output.domains || []).includes(rule.domain));
    const selected = selectedByOutput.get(output.name) || [];
    const expectedIds = new Set(expected.map((rule) => rule.id));
    const selectedIds = new Set(selected.map((rule) => rule.id));
    if (expectedIds.size !== selectedIds.size ||
        [...expectedIds].some((id) => !selectedIds.has(id))) {
      throw new Error(
        `Steering output ${output.name} is incomplete: selected ` +
        `${selectedIds.size} of ${expectedIds.size} master rules.`,
      );
    }
    for (const id of selectedIds) {
      emissionCountByRuleId.set(
        id,
        (emissionCountByRuleId.get(id) || 0) + 1,
      );
    }
  }

  const masterRules = allRules.filter((rule) => !rule.canonical_of);
  const coverageFailures = masterRules.filter(
    (rule) => emissionCountByRuleId.get(rule.id) !== 1,
  );
  if (coverageFailures.length > 0) {
    throw new Error(
      LOCAL_STR_COMPLETE_EMISSION_REQUIRED +
      `pack; invalid emissions: ${coverageFailures.map((rule) =>
        `${rule.id}=${emissionCountByRuleId.get(rule.id) || 0}`)
        .join(LOCAL_STR_COMMA_SPACE)}.`,
    );
  }

  const knownMasterIds = new Set(masterRules.map((rule) => rule.id));
  const invalidAliases = allRules.filter((rule) =>
    rule.canonical_of && !knownMasterIds.has(rule.canonical_of));
  if (invalidAliases.length > 0) {
    throw new Error(
      LOCAL_STR_ALIAS_MASTER_REQUIRED +
      `${invalidAliases.map((rule) => rule.id).join(LOCAL_STR_COMMA_SPACE)}.`,
    );
  }
}

function buildSourceManifest(
  sources = [],
  allRules = [],
  selectedByOutput = new Map(),
) {
  const emittedIds = new Set(
    [...selectedByOutput.values()].flat().map((rule) => rule.id),
  );
  return sources.map((source) => {
    const sourceRules = allRules.filter((rule) =>
      (rule.sources || []).some((ref) => ref.file === source.file));
    const masterRules = sourceRules.filter((rule) => !rule.canonical_of);
    const aliasRules = sourceRules.filter((rule) => rule.canonical_of);
    const emittedMasterRuleCount = masterRules.filter((rule) =>
      emittedIds.has(rule.id)).length;

    if (source.role === LOCAL_STR_PACKED && sourceRules.length === 0) {
      throw new Error(
        `Packed steering source ${source.file} has unexplained zero ` +
        LOCAL_STR_ZERO_CONTRIBUTION_REMEDIATION,
      );
    }
    if (source.role !== LOCAL_STR_PACKED && sourceRules.length > 0) {
      throw new Error(
        `Non-pack steering source ${source.file} unexpectedly contributed ` +
        `${sourceRules.length} rules.`,
      );
    }

    const entry = {
      file: source.file,
      role: source.role,
      domain: source.domain,
      ruleCount: sourceRules.length,
      masterRuleCount: masterRules.length,
      aliasRuleCount: aliasRules.length,
      emittedMasterRuleCount,
    };
    if (source.loadWhen) {
      entry.loadWhen = source.loadWhen;
    }
    if (source.reason) {
      entry.reason = source.reason;
    }
    return entry;
  });
}

// Attach a `machine_check` marker to every rule matched by a config
// machineChecks entry (file + match substring -> the command that actually
// enforces the rule). Zero matches is a hard failure so entries cannot rot.
function applyMachineChecks(allRules = [], machineChecks = []) {
  for (const entry of machineChecks) {
    const matched = allRules.filter((rule) =>
      (rule.sources || []).some((source) => source.file === entry.file) &&
      rule.text.includes(entry.match));
    if (matched.length === 0) {
      throw new Error(
        `machineChecks entry matched no rule: file=${entry.file} ` +
        `match="${entry.match}". Update the match substring to the current ` +
        LOCAL_STR_PIN_MATCH_UPDATE,
      );
    }
    for (const rule of matched) {
      rule.machine_check = entry.check;
    }
  }
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

function validateRulesHaveTriggerAndCitation(
  rules = [],
  outputName = LOCAL_STR_UNKNOWN_OUTPUT,
) {
  const failures = [];
  for (const rule of rules) {
    const ruleId = rule.id || LOCAL_STR_UNKNOWN_RULE;
    const aphorismKind = classifyAphoristicText(rule.text);
    if (aphorismKind) {
      const where = formatRuleCitation(rule) || 'unknown source';
      failures.push(
        `${ruleId} (${where}) is aphoristic (${aphorismKind}): "${rule.text}". ` +
          'Rephrase the source paragraph so the rule names its trigger condition ' +
          'or subject (avoid bare admonition markers and dangling pronouns).',
      );
      continue;
    }
    if (!formatRuleCitation(rule)) {
      failures.push(
        `${ruleId} has no source citation. Every emitted rule must record ` +
          'at least one {file, line} entry in rules.json sources.',
      );
    }
  }
  if (failures.length > 0) {
    throw new Error(
      `Aphoristic or uncitable rules in ${outputName}:\n  - ` +
        failures.join('\n  - '),
    );
  }
}

function countMarkdownRules(content = '') {
  return String(content || '')
    .split(/\r?\n/u)
    .filter((line) => /^\s*\d+\.\s+/u.test(line))
    .length;
}

function renderPackMarkdown(
  output = {},
  rules = [],
  domainTotal = null,
  domainTotalWithAliases = null,
) {
  validateCompleteRules(rules, output.name);
  validateRulesHaveTriggerAndCitation(rules, output.name);

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
    governance: 'Governance & Scope Controls',
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
      const citation = formatRuleCitation(rule);
      const suffix = citation ? ` _(see ${citation})_` : '';
      rulesBody.push(`${absoluteIndex}. [${rule.id}] ${rule.text}${suffix}`);
      absoluteIndex++;
    }
    rulesBody.push('');
  }

  const sourceForScope = output.name || 'pack';
  // rules-index.md lists every rule INCLUDING canonical_of aliases, while pack
  // totals count masters only. Surface both so the artifacts reconcile.
  const aliasSuffix =
    (Number.isFinite(domainTotalWithAliases) &&
      Number.isFinite(domainTotal) &&
      domainTotalWithAliases > domainTotal) ?
      ` (${domainTotalWithAliases} incl. cross-domain aliases; alias rows are marked in \`rules-index.md\`)` :
      '';
  const body = [
    '---',
    `scope: ${sourceForScope}`,
    'status: compiled',
    'always_load: false',
    `source_of_truth: docs/steering/ (see llm-pack.config.json sources for ${sourceForScope})`,
    'regenerate_with: npm run steering:llm:pack',
    '---',
    '',
    '> **Compiled pack — do not hand-edit.** Regenerate with `npm run steering:llm:pack` after editing canonical sources under `docs/steering/`.',
    '',
    `# ${output.title || 'LLM Steering Pack'}`,
    '',
    output.description || '',
    '',
    'Rule count, token estimate, and domain coverage live in `manifest.json` (regenerated on each `npm run steering:llm:pack`). Do not maintain those numbers inline.',
    '',
    `> **Complete selectively loaded pack.** All ${rules.length} ` +
      `${sourceForScope} master rules are included below${aliasSuffix}.`,
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
  options = {},
) {
  const allRules = options.allRules || [];
  const sourceManifest = options.sourceManifest || [];
  return outputs.map((output) => {
    if (output.manual) {
      const manualContent = manualContentByOutput.get(output.name) ||
        '';
      return {
        name: output.name,
        title: output.title,
        description: output.description,
        ruleCount: countMarkdownRules(manualContent),
        estimatedTokens: estimateTokens(manualContent),
        domains: output.domains || [],
        mode: LOCAL_STR_MANUAL,
        completeness: LOCAL_STR_MANUAL,
      };
    }

    const rules = selectedByOutput.get(output.name) || [];
    const domainRules = allRules.filter((rule) =>
      (output.domains || []).includes(rule.domain));
    const masterRuleCount = domainRules.filter(
      (rule) => !rule.canonical_of,
    ).length || rules.length;
    const aliasRuleCount = domainRules.filter(
      (rule) => rule.canonical_of,
    ).length;
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
      completeness: rules.length === masterRuleCount ?
        LOCAL_STR_COMPLETE :
        LOCAL_STR_INCOMPLETE,
      masterRuleCount,
      aliasRuleCount,
      indexedRuleCount: masterRuleCount + aliasRuleCount,
      sourceFiles: sourceManifest
        .filter((source) => (output.domains || []).includes(source.domain))
        .map((source) => source.file),
    };
  });
}

function renderReadme(manifestEntries = [], sourceManifest = []) {
  // Pure index. Load order is owned by AGENTS.md; do not duplicate it here.
  // Pack sizes live in manifest.json (regenerated alongside this file).
  const purpose = {
    core: 'Always-load operating contract, must-not checklist, Quest shape picker.',
    boot: 'Authority order, Quest vocabulary pointer, first commands, conflict rule.',
    architecture: 'Runtime/control-plane/bootstrap/join/rebalance/lifecycle policy.',
    testing: 'Test design, fixtures, regression policy, harness rules.',
    style: 'Lint, formatting, naming policy.',
    governance: 'Roadmap, scope, edition-boundary policy.',
  };
  const lines = [
    '---',
    'scope: index',
    'status: generated',
    'always_load: false',
    'source_of_truth: self',
    '---',
    '',
    '> **Generated — do not hand-edit.** This file is emitted by `renderReadme` in [`scripts/generate-steering-llm-pack.js`](../../../scripts/generate-steering-llm-pack.js); regenerate with `npm run steering:llm:pack`. A direct edit is overwritten on the next run. This is a pure file index for the LLM steering pack directory; load order is owned by [`AGENTS.md`](../../../AGENTS.md). Do not duplicate the load sequence here.',
    '',
    '# Steering LLM Pack — Index',
    '',
    'For the architecture domain tree, see [`architecture/INDEX.md`](../../../architecture/INDEX.md).',
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
    '| `core.md` | manual | Always-load operating contract, must-not checklist, Quest shape picker. |',
    '| `boot.md` | manual | Authority order, Quest vocabulary pointer, first commands, conflict rule. |',
    ...manifestEntries
      .filter((entry) => entry.name !== 'core')
      .map((entry) =>
        `| \`${entry.name}.md\` | ${entry.mode || LOCAL_STR_GENERATED} | ${purpose[entry.name] || entry.description || ''} |`,
      ),
    '| `rules.json` | generated | Complete generated rule corpus with IDs and source citations. **Too large to Read whole** — query it with `npm run rule -- --id <ID>` (or `--tag`/`--domain`/free-text), or browse `rules-index.md`. |',
    '| `rules-index.md` | generated | One line per rule (id, strength, domain, summary), loadable in one Read; points to `npm run rule` for full text. Regenerated by `npm run steering:llm:pack`. |',
    '| `manifest.json` | generated | Pack completeness, source roles and provenance, rule counts, token estimates, domains, and mode. |',
    '',
    '## Conflict Resolution',
    '',
    'At execution time, follow the three-level Authority Order in [`boot.md`](boot.md): user instructions and safety limits, then Quest workflow canon plus the active Quest file, then the selectively loaded domain packs. Each domain pack is complete; no binding rule in a packed source is hidden behind a priority cap. Sources assigned `direct-load` are read under their recorded load condition instead of being compiled into a pack. Sources assigned `reference-only` are nonbinding navigation or explanation.',
    '',
    'If a domain pack rule looks wrong, fix the underlying source file under `docs/steering/` and regenerate with `npm run steering:llm:pack`. Do not silently prefer the source at runtime — that hides drift instead of repairing it.',
    '',
    '## Notes',
    '',
    '- `core.md` and `boot.md` are manually curated so the always-load contract stays memorable.',
    '- Domain Markdown packs are generated, selectively loaded, and complete.',
    '- Pack sizes (rule counts, token estimates) are recorded in `manifest.json` at generation time; do not maintain a separate static table.',
    `- Source inventory: ${sourceManifest.length} classified sources; ` +
      'see `manifest.json` and `rules-index.md` for role and provenance.',
    '- Cross-pack duplicates are collapsed via `ruleAliases` in [`../llm-pack.config.json`](../llm-pack.config.json): each alias rule carries `canonical_of: <master-id>` in `rules.json` and is suppressed from per-domain pack emission, so the same rule never appears under multiple IDs in the markdown packs. Master rules keep an `aliases: [...]` array listing the suppressed IDs for traceability.',
    '',
  ];

  return lines.join(LOCAL_STR_NEWLINE);
}

// Extract `status:` from a leading YAML frontmatter block, if any.
function frontmatterStatus(content = '') {
  const text = String(content || '');
  if (!text.startsWith(LOCAL_STR_FRONTMATTER_DELIMITER)) {
    return FRONTMATTER_STATUS_MISSING;
  }
  const end = text.indexOf('\n---', 3);
  if (end === -1) {
    return FRONTMATTER_STATUS_MISSING;
  }
  const match = text.slice(0, end).match(/^status:\s*(\S+)\s*$/mu);
  return match ? {found: true, status: match[1]} : FRONTMATTER_STATUS_MISSING;
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

function reportPerSourceContribution(sourceManifest) {
  console.log(LOCAL_STR_SOURCE_CONTRIBUTION_HEADER);
  for (const source of sourceManifest) {
    console.log(
      `- ${source.file}: role=${source.role}, masters=` +
      `${source.emittedMasterRuleCount}/${source.masterRuleCount}, ` +
      `aliases=${source.aliasRuleCount}`,
    );
  }
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
  validateSourceRoles(config.sources || []);
  validateCompleteOutputConfig(config.outputs || []);
  const sourceDir = ensureRelativePath(workspaceRoot, config.sourceDir);
  const llmDir = ensureRelativePath(workspaceRoot, config.llmDir);

  const candidates = [];
  for (const source of config.sources || []) {
    const absoluteFilePath = path.join(sourceDir, source.file);
    const content = await fs.readFile(absoluteFilePath, 'utf8');
    if (source.role !== LOCAL_STR_PACKED) {
      continue;
    }
    const frontmatter = frontmatterStatus(content);
    if (frontmatter.found && frontmatter.status === LOCAL_STR_POINTER) {
      throw new Error(
        `Packed steering source ${source.file} is a pointer; classify it as ` +
        LOCAL_STR_POINTER_REMEDIATION,
      );
    }
    const sourceCandidates = parseMarkdownCandidates(content, {
      file: source.file,
      domain: source.domain,
      priority: source.priority,
    });
    candidates.push(...sourceCandidates);
  }

  const deduped = dedupeCandidates(candidates).sort(compareRules);
  const {allRules} = assignRuleIds(deduped, config.domainPrefixes || {});
  applySourceRoles(allRules, config.sources || []);
  const aliasStats = applyRuleAliases(allRules, config.ruleAliases || []);
  if (aliasStats.missing.length > 0) {
    const details = aliasStats.missing.map((missing) => {
      const ref = missing.ref || {};
      return `${missing.role}: ${ref.file || '<no file>'}:${ref.line ?? '<no line>'}`;
    });
    throw new Error(
      LOCAL_STR_ALIAS_REFERENCE_FAILURE +
      details.join(LOCAL_STR_LIST_ITEM_SEPARATOR),
    );
  }
  applyMachineChecks(allRules, config.machineChecks || []);

  // Corpus-wide aphorism/citation lint: every extracted rule must be
  // self-contained, not only the pack-selected subset (below-cap rules are
  // still queryable via `npm run rule` and equally binding).
  validateRulesHaveTriggerAndCitation(allRules, LOCAL_STR_FULL_RULE_CORPUS);

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

    const domainTotal = allRules.filter(
      (rule) => (output.domains || []).includes(rule.domain) && !rule.canonical_of,
    ).length;
    const domainTotalWithAliases = allRules.filter(
      (rule) => (output.domains || []).includes(rule.domain),
    ).length;
    const markdown = renderPackMarkdown(
      output,
      selected,
      domainTotal,
      domainTotalWithAliases,
    );
    await writeTextIfChanged(
      path.join(llmDir, `${output.name}.md`),
      `${markdown}`,
    );
  }

  validateCompleteOutputCoverage(
    allRules,
    config.outputs || [],
    selectedByOutput,
  );
  const sourceManifest = buildSourceManifest(
    config.sources || [],
    allRules,
    selectedByOutput,
  );
  reportPerSourceContribution(sourceManifest);

  const manifestEntries = buildManifest(
    config.outputs || [],
    selectedByOutput,
    manualContentByOutput,
    {allRules, sourceManifest},
  );
  const rulesJsonPath = path.join(llmDir, LOCAL_STR_RULES_JSON);
  const manifestPath = path.join(llmDir, LOCAL_STR_MANIFEST_JSON);
  const rulesJson = {
    sourceDir: config.sourceDir,
    llmDir: config.llmDir,
    sourceFiles: sourceManifest,
    stats: {
      candidateCount: candidates.length,
      dedupedRuleCount: deduped.length,
      exportedRuleCount: allRules.length,
      aliasRuleCount: allRules.filter((rule) => rule.canonical_of).length,
      masterRuleCount: allRules.filter((rule) => !rule.canonical_of).length,
      emittedMasterRuleCount: [...selectedByOutput.values()].flat().length,
      estimatedAllRulesTokens: estimateTokens(
        allRules.map((rule) => `${rule.id} ${rule.text}`).join('\n'),
      ),
    },
    rules: allRules.map((rule) => {
      const entry = {
        id: rule.id,
        domain: rule.domain,
        strength: rule.strength,
        tags: rule.tags,
        rule: rule.text,
        score: rule.score,
        sources: rule.sources,
      };
      if (rule.canonical_of) {
        entry.canonical_of = rule.canonical_of;
      }
      if (rule.aliases && rule.aliases.length > 0) {
        entry.aliases = [...rule.aliases];
      }
      if (rule.machine_check) {
        entry.machine_check = rule.machine_check;
      }
      return entry;
    }),
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
    stats: rulesJson.stats,
    sources: sourceManifest,
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

  const readme = renderReadme(manifestEntries, sourceManifest);
  await writeTextIfChanged(
    path.join(llmDir, LOCAL_STR_README_MD),
    `${readme}`,
  );

  console.log(LOCAL_STR_GENERATED_STEERING_LLM_PACK);
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
  applyRuleAliases,
  applySourceRoles,
  buildManifest,
  buildSourceManifest,
  classifyAphoristicText,
  collectBulletListText,
  countMarkdownRules,
  dedupeCandidates,
  formatRuleCitation,
  isAphoristicText,
  locateRuleBySourceRef,
  parseMarkdownCandidates,
  renderPackMarkdown,
  renderReadme,
  selectOutputRules,
  validateCompleteOutputConfig,
  validateCompleteOutputCoverage,
  validateCompleteRules,
  validateRulesHaveTriggerAndCitation,
  validateSourceRoles,
};
