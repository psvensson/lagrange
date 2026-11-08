/**
 * The fallback family of code-navigability patterns (epic
 * code-navigability-and-mistake-resistance): two sources for one fact,
 * typeof dual paths, catch-and-default, re-export-only modules, alias
 * exports and legacy vocabulary. Each pattern is a visitor
 * `{row, visit(node, parent, parsed, sites)}`; the detector module
 * (code-navigability-detectors.js) is the single import point and runs them.
 *
 * legacy_term_identifiers counts identifier TOKENS (a shorthand specifier is
 * one) and excludes a property read on another object (`x.legacyThing`):
 * that name is the other object's vocabulary, not this file's;
 * `this.legacyThing` and bare names count.
 *
 * The three census rows (two-source, typeof dual path, catch-default) also
 * carry `sides: {primary, fallback}` source ranges: executing `primary`
 * means the primary path ran, executing `fallback` that the fallback ran.
 * The coverage census reads them.
 *
 * Governed by the ambient-intrinsic audit: prototype methods are captured at
 * module load.
 */
import {
  NODE,
  childNodes,
  fallbackChainTerms,
  isTypeofFunctionComparison,
  makeSite,
  memberObjectKey,
  memberOf,
  rangeOf,
} from './code-navigability-source.js';

const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySome = Function.call.bind(Array.prototype.some);
const stringSplit = Function.call.bind(String.prototype.split);
const stringToLowerCase = Function.call.bind(String.prototype.toLowerCase);

const ROW = Object.freeze({
  TWO_SOURCE: 'two_source_fallback_reads',
  TYPEOF_DUAL: 'typeof_dual_paths',
  CATCH_DEFAULT: 'catch_returns_default',
  REEXPORT_ONLY: 'reexport_only_modules',
  ALIAS_EXPORTS: 'alias_exports',
  LEGACY_TERMS: 'legacy_term_identifiers',
});

const STRICT_EQUALITY = '===';
const NOT_OPERATOR = '!';
const DEFAULT_IDENTIFIERS = Object.freeze(new Set(['null', 'undefined']));
const DEFAULT_ARGUMENT_TYPES = Object.freeze(new Set([
  'Literal', 'ObjectExpression', 'ArrayExpression']));
const REEXPORT_STATEMENT_TYPES = Object.freeze(new Set(['ImportDeclaration',
  'ExportAllDeclaration']));
const LEGACY_TERM = new RegExp(['legacy', 'compat', 'fallback', 'deprecat',
  'shim', 'interim', 'transitional', 'backward', 'retired', 'obsolete',
  'polyfill', 'workaround', 'temporar'].join('|'), 'iu');
const LEGACY_WORDS = Object.freeze(new Set(['old', 'v1']));
const WORD_BOUNDARY = /_|(?<=[a-z0-9])(?=[A-Z])/u;

const NODE_TYPE = Object.freeze({
  CATCH: 'CatchClause',
  CONDITIONAL: 'ConditionalExpression',
  EXPORT_SPECIFIER: 'ExportSpecifier',
  IF: 'IfStatement',
  PROGRAM: 'Program',
  RETURN: 'ReturnStatement',
  THIS: 'ThisExpression',
});

function isMemberTerm(node) {
  return Boolean(memberOf(node));
}

// Member terms read two objects when their objects' structural keys differ:
// two roots (`a.x || b.y`), or one root at two object paths
// (`options.x || options.diagnostics?.x`), never two fields of one object
// (`this.a.x || this.a.y`, `def[COLUMN.SERVICE_ID] || def.service_id`).
function readsTwoSources(memberTerms) {
  const objects = new Set(arrayMap(memberTerms, (term) =>
    memberObjectKey(memberOf(term))));
  return objects.size >= 2;
}

const twoSourceFallbackReads = Object.freeze({
  row: ROW.TWO_SOURCE,
  visit(node, parent, parsed, sites) {
    const terms = fallbackChainTerms(node, parent);
    if (!terms) return;
    const memberTerms = arrayFilter(terms, isMemberTerm);
    if (memberTerms.length < 2 || !readsTwoSources(memberTerms)) return;
    const site = makeSite(parsed, ROW.TWO_SOURCE, node, node.operator);
    site.terms = arrayMap(terms, rangeOf);
    site.sides = {primary: rangeOf(terms[0]), fallback: rangeOf(terms[terms.length - 1])};
    sites.push(site);
  },
});

// The first typeof-function comparison inside a test, with the number of
// `!` operators enclosing it within that test.
function typeofComparisonWithin(node, negations) {
  if (isTypeofFunctionComparison(node)) return {comparison: node, negations};
  const nested = negations +
    (node.type === NODE.UNARY && node.operator === NOT_OPERATOR ? 1 : 0);
  for (const child of childNodes(node)) {
    const found = typeofComparisonWithin(child, nested);
    if (found.comparison) return found;
  }
  return {comparison: undefined, negations};
}

function dualPathSides(node, found) {
  const positive = found.comparison.operator === STRICT_EQUALITY;
  const polarity = positive !== (found.negations % 2 === 1);
  const taken = rangeOf(node.consequent);
  const other = rangeOf(node.alternate);
  return polarity ? {primary: taken, fallback: other} : {primary: other, fallback: taken};
}

const typeofDualPaths = Object.freeze({
  row: ROW.TYPEOF_DUAL,
  visit(node, _parent, parsed, sites) {
    if (node.type !== NODE_TYPE.IF && node.type !== NODE_TYPE.CONDITIONAL) return;
    if (!node.alternate) return;
    const found = typeofComparisonWithin(node.test, 0);
    if (!found.comparison) return;
    const site = makeSite(parsed, ROW.TYPEOF_DUAL, node, found.comparison.operator);
    site.sides = dualPathSides(node, found);
    sites.push(site);
  },
});

function returnsDefault(statement) {
  if (!statement || statement.type !== NODE_TYPE.RETURN) return false;
  const argument = statement.argument;
  if (!argument) return true;
  if (DEFAULT_ARGUMENT_TYPES.has(argument.type)) return true;
  return argument.type === NODE.IDENTIFIER && DEFAULT_IDENTIFIERS.has(argument.name);
}

const catchReturnsDefault = Object.freeze({
  row: ROW.CATCH_DEFAULT,
  visit(node, parent, parsed, sites) {
    if (node.type !== NODE_TYPE.CATCH) return;
    const statements = node.body.body;
    if (!returnsDefault(statements[statements.length - 1])) return;
    const site = makeSite(parsed, ROW.CATCH_DEFAULT, node, parent.type);
    site.sides = {primary: rangeOf(parent.block), fallback: rangeOf(node.body)};
    sites.push(site);
  },
});

function isReexportStatement(statement) {
  return REEXPORT_STATEMENT_TYPES.has(statement.type) ||
    (statement.type === NODE.EXPORT_NAMED && !statement.declaration);
}

const reexportOnlyModules = Object.freeze({
  row: ROW.REEXPORT_ONLY,
  visit(node, _parent, parsed, sites) {
    if (node.type !== NODE_TYPE.PROGRAM || node.body.length === 0) return;
    if (!arrayEvery(node.body, isReexportStatement)) return;
    sites.push(makeSite(parsed, ROW.REEXPORT_ONLY, node, parsed.file));
  },
});

const aliasExports = Object.freeze({
  row: ROW.ALIAS_EXPORTS,
  visit(node, _parent, parsed, sites) {
    if (node.type !== NODE_TYPE.EXPORT_SPECIFIER) return;
    if (node.local.name === node.exported.name) return;
    sites.push(makeSite(parsed, ROW.ALIAS_EXPORTS, node, node.local.name));
  },
});

// Legacy vocabulary: a legacy term anywhere in the name, or `old` / `v1` as
// a whole word (words split at `_` and at a lowercase-to-uppercase step),
// so oldValue, OLD_LEASE and holdOld count and placeholders does not.
function isLegacyTerm(name) {
  if (LEGACY_TERM.test(name)) return true;
  return arraySome(stringSplit(name, WORD_BOUNDARY), (word) =>
    LEGACY_WORDS.has(stringToLowerCase(word)));
}

// A property read on another object (`x.legacyThing`) is that object's
// vocabulary, counted where that object declares it; `this.legacyThing` is
// this owner's and counts here.
function isForeignMemberProperty(node, parent) {
  return Boolean(parent) && parent.type === NODE.MEMBER && parent.property === node &&
    !parent.computed && parent.object.type !== NODE_TYPE.THIS;
}

const legacyTermIdentifiers = Object.freeze({
  row: ROW.LEGACY_TERMS,
  visit(node, parent, parsed, sites) {
    if (node.type !== NODE.IDENTIFIER || !isLegacyTerm(node.name)) return;
    if (isForeignMemberProperty(node, parent)) return;
    // One token, one site: a shorthand specifier or property (`{legacyX}`)
    // carries two nodes over the same source range.
    const last = sites[sites.length - 1];
    if (last && last.range[0] === node.range[0] && last.range[1] === node.range[1]) return;
    sites.push(makeSite(parsed, ROW.LEGACY_TERMS, node, node.name));
  },
});

const FALLBACK_VISITORS = Object.freeze([
  twoSourceFallbackReads,
  typeofDualPaths,
  catchReturnsDefault,
  reexportOnlyModules,
  aliasExports,
  legacyTermIdentifiers,
]);

export {
  FALLBACK_VISITORS,
  aliasExports,
  catchReturnsDefault,
  legacyTermIdentifiers,
  reexportOnlyModules,
  twoSourceFallbackReads,
  typeofDualPaths,
};
