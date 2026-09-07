#!/usr/bin/env node
/**
 * The rule set matches its sealed manifest (`npm run audit:rule-set`).
 *
 * A count is not a design. Holding the rules to "exactly N" makes the integer
 * the thing the model is fitted to, and the pressure that creates is to fold
 * two independently violable invariants into one rule rather than to admit the
 * model grew. That is precisely what happened at the previous revision, so the
 * criterion is no longer a number.
 *
 * `docs/steering/rule-set.json` is the authority: one entry per independently
 * violable invariant, each naming the invariant it carries and exactly one
 * owner key. `docs/steering/rules.md` carries exactly one body per entry, in
 * the same order and under the same id and owner. The count follows from the
 * manifest and is reported, never asserted against a literal, so adding a rule
 * means revising the manifest deliberately rather than editing a threshold.
 *
 * What this owner checks is composition. Whether an owner key resolves to a
 * real authority is the router's business, and whether a rule's prose leaks an
 * implementation identity is the steering-diet checker's; both are consumed
 * here rather than restated.
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {alwaysLoadClosure, declaredRules} from './check-steering-diet.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MANIFEST = 'docs/steering/rule-set.json';
const MANIFEST_SCHEMA = 'rule-set/1';
const TEXT_ENCODING = 'utf8';
const LINE_SEPARATOR = '\n';
const ID_PATTERN = /^R(\d{2})$/u;
const COMMIT_SHA = /^[0-9a-f]{40}$/u;
const OWNER_FENCE = '`';
const EMPTY_TEXT = '';
const COUNT_WORD = '\\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|' +
  'eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|' +
  'nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred';
const COUNT_ADJECTIVES = 6;
const EMPHASIS = /[*_`]/gu;
const WHITESPACE = /\s+/gu;
const SPACE = ' ';
// A number of rules, written down, however it is phrased. A count in prose
// turns the count back into the criterion, which is the pressure this owner
// exists to remove. Words between the number and the noun are allowed for,
// because "26 numbered invariants" is the same assertion as "26 rules".
const COUNT_ASSERTION = new RegExp(
  `\\b(?:${COUNT_WORD})(?:-(?:${COUNT_WORD}))?\\s+` +
  `(?:[a-z,()-]+\\s+){0,${COUNT_ADJECTIVES}}` +
  '(?:invariants|rules|entries|clauses|rows|sections|items)\\b', 'iu');
const OFFENCE = Object.freeze({
  ORDER: 'the manifest and the rule bodies are in different orders',
  DUPLICATE_INVARIANT: 'which another rule already carries',
  UNREVISED_PREFIX: 'the sealed rule set changed while the revision stayed at ',
  UNREVISED_SUFFIX: '; changing which rules exist is a revision',
  NO_HEAD_SUFFIX: 'supersedes: a revision follows a head that exists, not a label',
});
const FIRST_RULE_NUMBER = 1;
const ID_DIGITS = 2;
const ID_PAD = '0';
const JSON_INDENT = 2;
const EXIT_OK = 0;
const EXIT_VIOLATION = 1;
const ARGV_OFFSET = 2;
const METRIC_FLAG = '--metric';
const GIT = 'git';
const GIT_ROOT_FLAG = '-C';
const HEAD_REV = 'HEAD';
const MAX_BUFFER = 8 * 1024 * 1024;
const FIRST_REVISION = 1;
const SHOW_COMMAND = 'show';
const STDIO_IGNORE = 'ignore';
const STDIO_PIPE = 'pipe';
const SILENT_STDIO = Object.freeze([STDIO_IGNORE, STDIO_PIPE, STDIO_IGNORE]);

const arrayMap = Function.call.bind(Array.prototype.map);
const stringPadStart = Function.call.bind(String.prototype.padStart);
const stringReplace = Function.call.bind(String.prototype.replace);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const stringReplaceAll = Function.call.bind(String.prototype.replaceAll);

/**
 * The sealed rule-set manifest, or null when it is absent or not the shape
 * this owner understands.
 * @param {string} [root]
 * @return {?Object}
 */
function ruleSetManifest(root = REPO_ROOT) {
  const absolute = path.join(root, MANIFEST);
  if (!fs.existsSync(absolute)) return null;
  const manifest = JSON.parse(fs.readFileSync(absolute, TEXT_ENCODING));
  return manifest.schema === MANIFEST_SCHEMA && Array.isArray(manifest.rules) ?
    manifest : null;
}

function ruleNumber(id) {
  const match = ID_PATTERN.exec(id);
  return match ? Number(match[1]) : null;
}

function ownerOf(rule) {
  return stringReplaceAll(rule.fields.Owner || '', OWNER_FENCE, '');
}

// The manifest and the bodies must agree entry for entry: same ids, same
// order, same owner. A body with no entry is an unsealed rule; an entry with
// no body is a rule that was declared and never written.
function agreementOffences(manifest, rules) {
  const offences = [];
  const bodies = new Map(arrayMap(rules, (rule) => [rule.id, rule]));
  const entries = new Map(arrayMap(manifest.rules, (entry) => [entry.id, entry]));
  for (const rule of rules) {
    if (!entries.has(rule.id)) offences.push(`${rule.id} has no manifest entry`);
  }
  for (const entry of manifest.rules) {
    const body = bodies.get(entry.id);
    if (!body) {
      offences.push(`${entry.id} is sealed in the manifest but has no rule body`);
      continue;
    }
    if (ownerOf(body) !== entry.owner) {
      offences.push(`${entry.id} is owned by ${entry.owner} in the manifest ` +
        `and by ${ownerOf(body)} in its body`);
    }
  }
  const manifestOrder = arrayMap(manifest.rules, (entry) => entry.id);
  const bodyOrder = arrayMap(rules, (rule) => rule.id);
  if (manifestOrder.join() !== bodyOrder.join()) {
    offences.push(OFFENCE.ORDER);
  }
  return offences;
}

// Ids are unique and contiguous from R01, and every entry carries exactly one
// invariant and exactly one owner key.
function structureOffences(manifest) {
  const offences = [];
  const seen = new Set();
  const invariants = new Set();
  manifest.rules.forEach((entry, index) => {
    const expected = FIRST_RULE_NUMBER + index;
    if (ruleNumber(entry.id) !== expected) {
      offences.push(`${entry.id} is not contiguous: expected R` +
        stringPadStart(String(expected), ID_DIGITS, ID_PAD));
    }
    if (seen.has(entry.id)) offences.push(`${entry.id} appears twice`);
    seen.add(entry.id);
    if (typeof entry.invariant !== 'string' || entry.invariant === '') {
      offences.push(`${entry.id} names no invariant`);
    } else if (invariants.has(entry.invariant)) {
      offences.push(`${entry.id} carries the invariant ${entry.invariant}, ` +
        OFFENCE.DUPLICATE_INVARIANT);
    }
    invariants.add(entry.invariant);
    if (typeof entry.owner !== 'string' || entry.owner === '') {
      offences.push(`${entry.id} names no owner key`);
    }
  });
  return offences;
}

// The manifest as the last commit sealed it, or null when this tree has none
// to compare against.
function committedManifest(root) {
  try {
    return JSON.parse(execFileSync(GIT,
      [GIT_ROOT_FLAG, root, SHOW_COMMAND, `${HEAD_REV}:${MANIFEST}`],
      {encoding: TEXT_ENCODING, maxBuffer: MAX_BUFFER, stdio: [...SILENT_STDIO]}));
  } catch {
    return null;
  }
}

function sealedTriples(manifest) {
  return JSON.stringify(arrayMap(manifest.rules,
    (entry) => [entry.id, entry.invariant, entry.owner]));
}

// Changing which rules exist is a revision, not an edit. Two coordinated file
// edits would otherwise grow the set silently, which is exactly the casual
// path the manifest exists to close.
function revisionOffences(root, manifest) {
  return supersessionOffences(committedManifest(root), manifest);
}

/**
 * Every way a rule-set revision fails to be a revision: an absent number, a
 * supersession that names no predecessor, head or reason, or a changed rule
 * set carrying the revision it changed. Pure over the two manifests so the
 * property is provable without a repository that already carries one.
 * @param {?Object} previous the manifest as the last commit sealed it
 * @param {Object} current the manifest in the working tree
 * @return {string[]}
 */
// How many rules the predecessor actually sealed. The manifest at the last
// commit is normally this same revision, not the one it supersedes, so it can
// only answer this when its revision is the superseded one; otherwise the
// recorded number is the only account there is and is taken as given.
function previousRuleCount(previous, supersededRevision) {
  if (!previous || !Array.isArray(previous.rules)) return undefined;
  return previous.revision === supersededRevision ? previous.rules.length :
    undefined;
}

function supersessionOffences(previous, current) {
  if (typeof current.revision !== 'number') return [`${MANIFEST} declares no revision`];
  const offences = current.revision > FIRST_REVISION ?
    supersededOffences(previous, current) : [];
  if (previous && Array.isArray(previous.rules) &&
      sealedTriples(previous) !== sealedTriples(current) &&
      previous.revision === current.revision) {
    offences.push(`${OFFENCE.UNREVISED_PREFIX}${current.revision}` +
      OFFENCE.UNREVISED_SUFFIX);
  }
  return offences;
}

// What a revision must say about the one it replaces: which revision it was,
// the published head it was true of, how many entries it sealed, and why it no
// longer holds.
function supersededOffences(previous, current) {
  const superseded = current.supersedes || {};
  const offences = [];
  if (superseded.revision !== current.revision - FIRST_REVISION) {
    offences.push(`revision ${current.revision} does not supersede ` +
      `revision ${current.revision - FIRST_REVISION}`);
  }
  if (!COMMIT_SHA.test(String(superseded.head || EMPTY_TEXT))) {
    offences.push(`revision ${current.revision} names no published head it ` +
      OFFENCE.NO_HEAD_SUFFIX);
  }
  if (typeof superseded.reason !== 'string' || superseded.reason === EMPTY_TEXT) {
    offences.push(`revision ${current.revision} gives no reason for superseding`);
  }
  const sealedThen = previousRuleCount(previous, superseded.revision);
  if (sealedThen !== undefined && superseded.rules !== sealedThen) {
    offences.push(`revision ${current.revision} says it supersedes ` +
      `${superseded.rules} entries where the predecessor sealed ${sealedThen}`);
  }
  return offences;
}

// No document an agent must read before acting may state how many rules there
// are: the manifest is the criterion and a written count can only drift from
// it or become the thing the model is fitted to.
function countAssertionOffences(root) {
  const offences = [];
  for (const file of alwaysLoadClosure(root).files) {
    const absolute = path.join(root, file);
    if (!fs.existsSync(absolute)) continue;
    const found = COUNT_ASSERTION.exec(readable(fs.readFileSync(absolute, TEXT_ENCODING)));
    if (found) {
      offences.push(`${file} states a rule count, which the manifest owns: ` +
        found[0]);
    }
  }
  return offences;
}

// What the document says, not how it is typeset. These files are hard-wrapped
// and use emphasis freely, so a count written across a line break or around a
// bold number would otherwise pass a scan that reads one line at a time - the
// most likely way for a count to reappear, not the cleverest.
function readable(text) {
  return stringReplace(stringReplace(text, EMPHASIS, EMPTY_TEXT), WHITESPACE, SPACE);
}

/**
 * Every way the current rules disagree with the sealed manifest.
 * @param {string} [root]
 * @return {string[]}
 */
function ruleSetOffences(root = REPO_ROOT) {
  const manifest = ruleSetManifest(root);
  if (!manifest) return [`${MANIFEST} is absent or is not a ${MANIFEST_SCHEMA} manifest`];
  const rules = declaredRules(root);
  return [...structureOffences(manifest), ...agreementOffences(manifest, rules),
    ...revisionOffences(root, manifest), ...countAssertionOffences(root)];
}

/**
 * The number of rules the manifest seals. Reported, never asserted against a
 * literal: the manifest is the criterion and this integer follows from it.
 * @param {string} [root]
 * @return {number}
 */
function sealedRuleCount(root = REPO_ROOT) {
  const manifest = ruleSetManifest(root);
  return manifest ? manifest.rules.length : 0;
}

function main(argv) {
  const offences = ruleSetOffences();
  if (arrayIncludes(argv, METRIC_FLAG)) {
    process.stdout.write(`${offences.length}${LINE_SEPARATOR}`);
    return offences.length === 0 ? EXIT_OK : EXIT_VIOLATION;
  }
  const manifest = ruleSetManifest();
  process.stdout.write(`${JSON.stringify({
    revision: manifest ? manifest.revision : null,
    sealedRules: sealedRuleCount(),
    ruleBodies: declaredRules().length,
    offences,
  }, null, JSON_INDENT)}${LINE_SEPARATOR}`);
  return offences.length === 0 ? EXIT_OK : EXIT_VIOLATION;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(ARGV_OFFSET));
}

export {
  MANIFEST, ruleSetManifest, ruleSetOffences, sealedRuleCount,
  supersessionOffences,
};
