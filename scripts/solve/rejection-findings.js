// Structured, category-complete rejection findings and the sealed
// verification bar.
//
// A verifier rejection recorded as a bare receipt pointer carries zero durable
// content: the amendment excerpt rule and `theory option --from-rejection` are
// both satisfiable by text that explains nothing, and a later post-mortem
// cannot reconstruct why a round failed (measured: the 2026-07-27 benchmark
// rounds 2-4 and every base-correction round recorded only
// `independent landing verification rejected (subagent:<id>)`). Every
// rejection therefore names at least one categorized finding.
//
// The sealed bar bounds the NUMBER of rejection rounds the way
// category-complete rounds bound each round's yield: when a quest declares
// `verificationTemplates`, a rejection category outside that bar is accepted
// once (marked `out-of-bar:<slug>` — the escape hatch, so a real defect is
// never waived), and a repeat of the same out-of-bar category is refused until
// a `verification-bar-expansion` amendment adds the category to the sealed
// declaration. Requirements discovery moves into the declaration, not into an
// unbounded rejection sequence. A quest with no declared templates keeps
// free-form categories.

import {
  applyAmendments,
  questAmendments,
} from './amend.js';
import {EVENT_FINDING, EVENT_QUEST_DECLARED} from './constants.js';

const VERIFIER_REJECTION_FINDING_KIND = 'verifier-rejection';
const CATEGORY_SEPARATOR = ':';
const CATEGORY_PATTERN = /^[a-z0-9][a-z0-9-]*$/u;
// Below this, a "summary" is a token, not a finding — the same floor the
// amendment excerpt rule uses for the same reason.
const MIN_SUMMARY_LENGTH = 12;
const LOCAL_STR_OWNED_001 = 'out-of-bar:';
const PATH_SEPARATOR = ', ';
const CATEGORY_PLACEHOLDER = '<category>';
const REPEAT_REQUIRES_EXPANSION =
  'once; a repeat requires expanding the sealed bar: ';
const EXPANSION_EVIDENCE_SUFFIX =
  '--evidence <verifier-rejection reference>';
// Bar entries must be catalogued template categories, so a repeated
// out-of-bar category that has no template yet needs the catalog entry
// before the amendment can pass quest lint.
const CATALOG_FIRST_GUIDANCE =
  ' (if the category has no template yet, author ' +
  'docs/steering/verification-templates/<slug>.md with a categories ' +
  'front-matter line first)';
const LOCAL_STR_OWNED_002 =
  '--finding "<category>: <what concretely failed>" (repeatable; category is ' +
  'a kebab-case slug, out-of-bar:<slug> for a category outside the sealed bar)';
export const OUT_OF_BAR_PREFIX = LOCAL_STR_OWNED_001;
export const REJECTION_FINDING_USAGE = LOCAL_STR_OWNED_002;

function normalizeRawFindings(raw) {
  if (raw === undefined || raw === null || raw === true) return [];
  return Array.isArray(raw) ? raw : [raw];
}

function parseOneRejectionFinding(value) {
  const text = String(value || '');
  // The out-of-bar marker contains the separator character, so the
  // category/summary split searches after it.
  const separatorSearchStart = text.startsWith(OUT_OF_BAR_PREFIX) ?
    OUT_OF_BAR_PREFIX.length : 0;
  const separatorIndex = text.indexOf(CATEGORY_SEPARATOR, separatorSearchStart);
  const category = separatorIndex > 0 ?
    text.slice(0, separatorIndex).trim() : '';
  const slug = category.startsWith(OUT_OF_BAR_PREFIX) ?
    category.slice(OUT_OF_BAR_PREFIX.length) : category;
  const summary = separatorIndex > 0 ?
    text.slice(separatorIndex + 1).trim() : '';
  if (!CATEGORY_PATTERN.test(slug) || summary.length < MIN_SUMMARY_LENGTH) {
    throw new Error(
      `rejection finding "${text}" is not usable: expected ` +
      `${REJECTION_FINDING_USAGE}, with a summary of at least ` +
      `${MIN_SUMMARY_LENGTH} characters`);
  }
  return {category, summary};
}

// `--finding` values -> [{category, summary}]. Throws on any malformed entry;
// an empty list is returned (not an error) so callers own the "at least one"
// rule with their own command name in the message.
export function parseRejectionFindings(raw) {
  return normalizeRawFindings(raw).map(parseOneRejectionFinding);
}

// The effective sealed bar: declaration ⊕ bar-expansion amendments. Reads the
// sealed declaration event so a hand-edited quest file cannot widen the bar
// outside the amendment path.
export function sealedVerificationTemplates(quest, log) {
  const declared = (log || []).find(
    (event) => event.type === EVENT_QUEST_DECLARED);
  const effective = declared?.sealed ?
    applyAmendments(declared.sealed, questAmendments(log)) : quest;
  const templates = effective?.verificationTemplates;
  return Array.isArray(templates) ?
    templates.filter((entry) => typeof entry === 'string' && entry) : [];
}

function priorOutOfBarCategories(log) {
  const seen = new Set();
  for (const event of log || []) {
    if (event.type !== EVENT_FINDING ||
      event.kind !== VERIFIER_REJECTION_FINDING_KIND) continue;
    const findings = event.verification?.findings;
    if (!Array.isArray(findings)) continue;
    for (const finding of findings) {
      const category = String(finding?.category || '');
      if (category.startsWith(OUT_OF_BAR_PREFIX)) {
        seen.add(category.slice(OUT_OF_BAR_PREFIX.length));
      }
    }
  }
  return seen;
}

// Null when the findings respect the sealed bar; otherwise one actionable
// problem string. A quest without declared templates has no bar and every
// category passes.
export function rejectionFindingBarProblem(quest, log, findings) {
  const bar = new Set(sealedVerificationTemplates(quest, log));
  if (bar.size === 0) return null;
  const priorOutOfBar = priorOutOfBarCategories(log);
  for (const finding of findings) {
    const category = String(finding.category || '');
    if (bar.has(category)) continue;
    if (!category.startsWith(OUT_OF_BAR_PREFIX)) {
      return `rejection category "${category}" is outside the sealed ` +
        `verification bar [${[...bar].join(PATH_SEPARATOR)}]; record it ` +
        `once as ${OUT_OF_BAR_PREFIX}${category}, or expand the bar first: ` +
        `${expandCommand(quest.id, CATEGORY_PLACEHOLDER)}`;
    }
    const slug = category.slice(OUT_OF_BAR_PREFIX.length);
    if (bar.has(slug)) continue;
    if (priorOutOfBar.has(slug)) {
      return `rejection category "${slug}" was already recorded out-of-bar ` +
        REPEAT_REQUIRES_EXPANSION +
        `${expandCommand(quest.id, slug)}` + CATALOG_FIRST_GUIDANCE;
    }
  }
  return null;
}

function expandCommand(questId, template) {
  return `node scripts/solve.js amend --id ${questId} ` +
    `--kind verification-bar-expansion --template ${template} ` +
    EXPANSION_EVIDENCE_SUFFIX;
}
