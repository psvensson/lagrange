// Every message-table member referenced anywhere under src is defined
// (line-regression-causes stage 3, item 4). A reference to a member a
// message table does not define answers an empty error (the provisioning
// deadline of 73fbf0576), logs `undefined`, or throws a TypeError where a
// named error was meant (a table member called as a function). The earlier
// census covered QUERY_ERROR_MSG under src/query only; this one covers every
// `<NAME>_MSG.<member>` access in every src module.
//
// A table is resolved the way the module resolves it: an imported table by
// importing the module the file imports it from (re-exports included), also
// when the module destructures it from an imported object
// (`const {X_MSG} = SHARED;`); a table the module defines itself by the keys
// of its own literal (a key anywhere in that literal counts, so the census
// never reports a member the literal defines). Computed (`TABLE[expr]`)
// accesses and tables bound otherwise (a function's destructured parameter)
// are not checked; they are counted and reported in the failure message.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {test} from 'node:test';

const SOURCE_ROOT = 'src';
const JS_SUFFIX = '.js';
const TABLE_NAME = '[A-Z][A-Z0-9_]*_MSG';
const MEMBER_ACCESS = new RegExp(`(?<![\\w$.])(${TABLE_NAME})\\.([A-Za-z_$][\\w$]*)`, 'gu');
const COMPUTED_ACCESS = new RegExp(`(?<![\\w$.])${TABLE_NAME}\\[`, 'gu');
const NAMED_IMPORT = /import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/gu;
const LOCAL_DEFINITION = new RegExp(
  `(?:^|\\n)[ \\t]*(?:export[ \\t]+)?(?:const|let|var)[ \\t]+(${TABLE_NAME})[ \\t]*=`, 'gu');
const LITERAL_KEY =
  /(?:^|[{,\n])\s*(?:\.\.\.([A-Z][A-Z0-9_]*)|['"]?([A-Za-z_$][\w$]*)['"]?\s*[:(])/gu;
const OBJECT_DESTRUCTURE = /(?:const|let)\s*\{([^}]*)\}\s*=\s*([A-Za-z_$][\w$]*)\s*;/gu;
const COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*)/u;

function sourceFiles(directory) {
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(entryPath);
    return entry.name.endsWith(JS_SUFFIX) ? [entryPath] : [];
  });
}

// The source with whole-line comments blanked (line numbers kept).
function codeOf(text) {
  return text.split('\n').map((line) => (COMMENT_LINE.test(line) ? '' : line)).join('\n');
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

// Every relatively imported binding, and every name the module destructures
// from one of them, as {modulePath, imported, property?}.
function importedBindings(text, file) {
  const bindings = new Map();
  for (const [, names, specifier] of text.matchAll(NAMED_IMPORT)) {
    if (!specifier.startsWith('.')) continue;
    const modulePath = path.resolve(path.dirname(file), specifier);
    for (const part of names.split(',')) {
      const [imported, local = imported] = part.trim().split(/\s+as\s+/u);
      if (local) bindings.set(local, {modulePath, imported});
    }
  }
  for (const [, pattern, source] of text.matchAll(OBJECT_DESTRUCTURE)) {
    const from = bindings.get(source);
    if (!from || from.property) continue;
    for (const part of pattern.split(',')) {
      const [property, local = property] = part.split('=')[0].trim().split(/\s*:\s*/u);
      if (/_MSG$/u.test(local)) bindings.set(local, {...from, property});
    }
  }
  return bindings;
}

// The text of the literal a definition assigns, from its first `{` to the
// matching `}`, skipping quoted text (a brace inside a message is text).
function literalAfter(text, index) {
  const open = text.indexOf('{', index);
  if (open < 0) return '';
  let depth = 0;
  let quote = null;
  for (let at = open; at < text.length; at += 1) {
    const character = text[at];
    if (quote) {
      if (character === '\\') at += 1;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '\'' || character === '"' || character === '`') quote = character;
    else if (character === '{') depth += 1;
    else if (character === '}' && --depth === 0) return text.slice(open, at + 1);
  }
  return text.slice(open);
}

function localDefinitions(text) {
  const tables = new Map();
  for (const match of text.matchAll(LOCAL_DEFINITION)) {
    const keys = new Set();
    const spreads = [];
    for (const [, spread, key] of literalAfter(text, match.index + match[0].length)
      .matchAll(LITERAL_KEY)) {
      if (spread) spreads.push(spread);
      else keys.add(key);
    }
    tables.set(match[1], {keys, spreads});
  }
  return tables;
}

const moduleCache = new Map();
async function importedTable({modulePath, imported, property}) {
  if (!moduleCache.has(modulePath)) {
    moduleCache.set(modulePath, import(pathToFileURL(modulePath).href));
  }
  const value = (await moduleCache.get(modulePath))[imported];
  return property === undefined ? value : value?.[property];
}

async function memberIsDefined(table, member, file, context, seen = new Set()) {
  if (seen.has(table)) return false;
  seen.add(table);
  const local = context.locals.get(table);
  if (local) {
    if (local.keys.has(member)) return true;
    for (const spread of local.spreads) {
      if (await memberIsDefined(spread, member, file, context, seen)) return true;
    }
    return false;
  }
  const binding = context.imports.get(table);
  if (!binding) return null;
  const value = await importedTable(binding);
  return value !== null && typeof value === 'object' && value[member] !== undefined;
}

test('every message-table member referenced under src is defined', async () => {
  const undefinedMembers = [];
  let checked = 0;
  let computedAccesses = 0;
  let otherwiseBound = 0;
  for (const file of sourceFiles(SOURCE_ROOT)) {
    const text = codeOf(fs.readFileSync(file, 'utf8'));
    const context = {imports: importedBindings(text, file), locals: localDefinitions(text)};
    computedAccesses += [...text.matchAll(COMPUTED_ACCESS)].length;
    for (const match of text.matchAll(MEMBER_ACCESS)) {
      const [, table, member] = match;
      const defined = await memberIsDefined(table, member, file, context);
      if (defined === null) {
        otherwiseBound += 1;
        continue;
      }
      checked += 1;
      if (!defined) {
        undefinedMembers.push(`${file}:${lineOf(text, match.index)} ${table}.${member}`);
      }
    }
  }
  assert.ok(checked > 0, 'the census checked member accesses');
  assert.deepEqual(undefinedMembers, [],
    `references to members no message table defines (${checked} accesses checked; not ` +
    `checked: ${computedAccesses} computed, ${otherwiseBound} on tables bound otherwise)`);
});
