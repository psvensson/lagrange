// The static half of "membership is reported by the core, not declared".
//
// The runtime half is the brand in forked-core-harness.js: a membership value
// exists only if the harness made it out of a core read, the durable record
// or the requested change, and `auditMembershipProvenance` refuses to build
// the artifact out of anything else.
//
// That alone does not stop a TEST from comparing a measured membership with a
// written-down one. Verification round 1 found four ways to do exactly that
// while the receipt stayed green:
//
//   (i)   route the literal through a const and compare to the const;
//   (ii)  use `assert.deepStrictEqual`, which the old lexical check did not
//         list;
//   (iii) compare `.length` or `.join()` instead of the array;
//   (iv)  hand the receipt a scenario record whose `after` is a declared
//         object.
//
// (iv) is closed by the brand. The first three are closed here, and not by
// widening the list of shapes an expectation may not have - that game cannot
// be won. The rule is the other way round: a membership value may not appear
// in a raw assertion AT ALL. It goes through `assertMembership*`, which
// refuses an unbranded actual and refuses an unbranded expectation. A literal,
// a const holding a literal, a `.length` and a `.join()` are then all refused
// by one rule, because none of them can produce a branded expectation.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {parse} from 'espree';
import {KEYS} from 'eslint-visitor-keys';

import {MEMBERSHIP_FIELD} from './forked-core-harness.js';

const here = path.dirname(fileURLToPath(import.meta.url));

const CENSUS = Object.freeze({
  UTF8: 'utf8',
  ASSERT: 'assert',
  // The files whose subject is membership. The identity and cost files name
  // the ids they hand to the core, which is an input, not a claim.
  SUBJECT_FILES: Object.freeze([
    'core-membership-scenarios.test.js',
    'core-membership-invariants.test.js',
    'core-restart-and-ordering.test.js',
  ]),
  REFUSAL: 'a membership value may not appear in a raw assertion: use ' +
    'assertMembershipEqual / Empty / Size / Includes / Excludes, which ' +
    'refuse an unbranded actual and an unbranded expectation',
});

function walk(node, visit) {
  if (!node || typeof node.type !== 'string') {
    return;
  }
  visit(node);
  for (const key of KEYS[node.type] || []) {
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        walk(child, visit);
      }
    } else if (value && typeof value.type === 'string') {
      walk(value, visit);
    }
  }
}

// `assert(...)`, `assert.equal(...)`, `assert.deepStrictEqual(...)` - every
// shape of the node assertion library, not a list of method names.
function assertionCalleeOf(node) {
  if (node.type !== 'CallExpression') {
    return null;
  }
  const callee = node.callee;
  if (callee?.type === 'Identifier' && callee.name === CENSUS.ASSERT) {
    return CENSUS.ASSERT;
  }
  if (callee?.type === 'MemberExpression' &&
      callee.object?.type === 'Identifier' &&
      callee.object.name === CENSUS.ASSERT) {
    return `assert.${callee.property?.name || '?'}`;
  }
  return null;
}

function memberNameOf(node) {
  if (node.type !== 'MemberExpression') {
    return null;
  }
  if (!node.computed && node.property?.type === 'Identifier') {
    return node.property.name;
  }
  return node.property?.type === 'Literal' &&
    typeof node.property.value === 'string' ? node.property.value : null;
}

function membershipReadsIn(node, aliases) {
  const names = [];
  walk(node, (child) => {
    const name = memberNameOf(child);
    if (name && MEMBERSHIP_FIELD.test(name)) {
      names.push(name);
      return;
    }
    if (child.type === 'Identifier' && aliases.has(child.name)) {
      names.push(`${child.name} (alias of ${aliases.get(child.name)})`);
    }
  });
  return names;
}

// A PREDICATE callback selects a record; it does not make the result a
// membership. `records.find((row) => row.voters.length > 0)` is a row, and
// asserting the row exists is not a membership claim. A MAPPING callback
// does: `rows.map((row) => row.voters)` is a list of memberships.
const PREDICATE_METHOD =
  /^(find|findLast|findIndex|filter|some|every|indexOf)$/u;

const CALLBACK = new Set(['ArrowFunctionExpression', 'FunctionExpression']);

function isPredicateCall(node) {
  return node.type === 'CallExpression' &&
    node.callee?.type === 'MemberExpression' &&
    PREDICATE_METHOD.test(node.callee.property?.name || '');
}

function predicateCallbacksOf(node) {
  const bodies = new Set();
  walk(node, (child) => {
    if (!isPredicateCall(child)) {
      return;
    }
    for (const argument of child.arguments || []) {
      if (CALLBACK.has(argument?.type)) {
        bodies.add(argument);
      }
    }
  });
  return bodies;
}

function membershipNameOf(node, aliases) {
  const name = memberNameOf(node);
  if (name && MEMBERSHIP_FIELD.test(name)) {
    return name;
  }
  return node.type === 'Identifier' && aliases.has(node.name) ?
    `${node.name} (alias of ${aliases.get(node.name)})` : null;
}

function walkSkipping(node, skip, visit) {
  if (!node || typeof node.type !== 'string' || skip.has(node)) {
    return;
  }
  visit(node);
  for (const key of KEYS[node.type] || []) {
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        walkSkipping(child, skip, visit);
      }
    } else if (value && typeof value.type === 'string') {
      walkSkipping(value, skip, visit);
    }
  }
}

function membershipReadsOutsidePredicates(node, aliases) {
  const skip = predicateCallbacksOf(node);
  const names = [];
  walkSkipping(node, skip, (child) => {
    const name = membershipNameOf(child, aliases);
    if (name) {
      names.push(name);
    }
  });
  return names;
}

// `const first = record.confStateByPeer[peers[0]].voters;` then
// `assert.equal(first.length, 3)` is the same claim wearing a different name,
// and verification round 1 showed that routing a value through a const is the
// first thing an attacker tries. Every binding whose initialiser reads a
// membership - directly or through an earlier alias - becomes an alias, to a
// fixed point, and an assertion that touches one is refused like the rest.
function membershipAliases(tree) {
  const aliases = new Map();
  let grew = true;
  while (grew) {
    grew = false;
    walk(tree, (node) => {
      if (node.type !== 'VariableDeclarator' ||
          node.id?.type !== 'Identifier' || !node.init ||
          aliases.has(node.id.name)) {
        return;
      }
      const reads = membershipReadsOutsidePredicates(node.init, aliases);
      if (reads.length > 0) {
        aliases.set(node.id.name, reads[0]);
        grew = true;
      }
    });
  }
  return aliases;
}

/**
 * Raw assertions that touch a membership value, in one source text.
 * @param {string} source
 * @param {string} name a label for the messages
 * @return {Array<Object>} one entry per refused assertion
 */
function rawMembershipAssertions(source, name) {
  const tree = parse(source,
    {ecmaVersion: 'latest', sourceType: 'module', loc: true});
  const aliases = membershipAliases(tree);
  const refused = [];
  walk(tree, (node) => {
    const callee = assertionCalleeOf(node);
    if (!callee) {
      return;
    }
    const touched = (node.arguments || [])
      .flatMap((argument) => membershipReadsIn(argument, aliases));
    if (touched.length > 0) {
      refused.push({
        file: name, line: node.loc.start.line, callee,
        fields: [...new Set(touched)].sort(),
        refusal: CENSUS.REFUSAL,
      });
    }
  });
  return refused;
}

/**
 * The same, over the membership test files in this directory.
 * @return {{files: Array<string>, refused: Array<Object>}}
 */
function membershipAssertionCensus() {
  const refused = [];
  for (const name of CENSUS.SUBJECT_FILES) {
    const source = fs.readFileSync(path.join(here, name), CENSUS.UTF8);
    refused.push(...rawMembershipAssertions(source, name));
  }
  return {files: [...CENSUS.SUBJECT_FILES], refused};
}

// The accessors that MINT evidence. A subject test file that imported one
// could manufacture a membership value of its own, so the receipts assert it
// imports none: what a receipt asserts on is a record the HARNESS built and
// the ledger audited.
//
// Verification round 2 bypassed the syntactic census six ways (aliased
// assert, destructuring, JSON.stringify through a helper, if/throw, an
// indexed loop, a computed key). Chasing those shapes is a game that cannot
// be won, and it is not what closed the attack: owner attack 11 - replacing
// a core read with a declared set - now fails the LEDGER audit, whatever
// syntax the comparison uses. The census below is kept as the cheap first
// line, and its limits are recorded rather than papered over.
const EVIDENCE_MINTING = Object.freeze([
  'membershipArray', 'coreField', 'derivedMembership', 'changedNodeIds',
  'selectMembers', 'fullMembershipFromCore']);

/**
 * Which evidence-minting accessors the subject test files import.
 * @return {{files: Array<string>, imported: Array<Object>,
 *   knownSyntacticBypasses: Array<string>}}
 */
function evidenceAccessorImportCensus() {
  const imported = [];
  for (const name of CENSUS.SUBJECT_FILES) {
    const source = fs.readFileSync(path.join(here, name), CENSUS.UTF8);
    const tree = parse(source,
      {ecmaVersion: 'latest', sourceType: 'module', loc: true});
    walk(tree, (node) => {
      if (node.type !== 'ImportDeclaration') {
        return;
      }
      for (const specifier of node.specifiers || []) {
        if (EVIDENCE_MINTING.includes(specifier.imported?.name)) {
          imported.push({file: name, accessor: specifier.imported.name});
        }
      }
    });
  }
  return {
    files: [...CENSUS.SUBJECT_FILES],
    imported,
    importsNoEvidenceMintingAccessor: imported.length === 0,
    knownSyntacticBypasses: [
      'an aliased assert (const check = assert)',
      'a destructured {voters}',
      'a JSON.stringify comparison through a helper',
      'an if/throw comparison',
      'an indexed loop over a destructured value',
      'a computed key (record[k] where k = "vot" + "ers")',
    ],
    whyThatIsAcceptable: 'each of those compares a REAL core read with a ' +
      'literal, which asserts a truth. The dangerous attack - replacing the ' +
      'core read itself with a declared set - is refused by the ledger ' +
      'audit whatever syntax the comparison uses, and the subject files ' +
      'import nothing that could mint a membership value of their own.',
  };
}

export {
  CENSUS,
  evidenceAccessorImportCensus,
  membershipAssertionCensus,
  rawMembershipAssertions,
};
