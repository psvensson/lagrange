// A mechanical census of what production asks of a Raft node and of the
// provider seam today, derived from `src` by parsing it - never from a
// convenience API and never from a hand-kept list.
//
// The census is the evidence behind the minimum backend contract: a backend
// that does not answer everything in here cannot host today's partition
// service, and everything a committed-membership backend would additionally
// need is, by construction, absent from it.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {parse} from 'espree';
import {KEYS} from 'eslint-visitor-keys';

const CENSUS = Object.freeze({
  SOURCE_ROOT: 'src',
  // The earlier contained spike is not the production seam; it drives
  // raft-logic's own shell and would pollute the contract with that shell's
  // vocabulary.
  EXCLUDED_PREFIX: 'src/raft/spike/',
  FILE_SUFFIX: '.js',
  NODE_HOLDER: 'raft',
  NODE_IDENTIFIERS: Object.freeze(['raft', 'raftNode']),
  PROVIDER_HOLDER: 'raftProvider',
  PROVIDER_IDENTIFIERS: Object.freeze(['raftProvider']),
  // `<receiver>.raft` only counts when the receiver is one that actually
  // holds a node. `DEFAULT_CONFIG.raft.*` is a configuration namespace that
  // happens to be called raft, and it is not part of the seam.
  NODE_RECEIVERS: Object.freeze([
    'this', 'self', 'service', 'partitionService', 'replica']),
  SUBSCRIBE_METHODS: Object.freeze(['on', 'once', 'off', 'removeListener']),
  EMIT_METHOD: 'emit',
  PATH_SEPARATOR: '/',
  UTF8: 'utf8',
  HASHBANG: /^#!.*(?:\r?\n|$)/u,
  NEWLINE: '\n',
});

const NODE_TYPE = Object.freeze({
  CALL: 'CallExpression',
  IDENTIFIER: 'Identifier',
  LITERAL: 'Literal',
  MEMBER: 'MemberExpression',
  THIS: 'ThisExpression',
});

// The receiver of `<receiver>.raft`, as written. `this` is spelled by its own
// node type; everything else is an identifier.
function receiverName(node) {
  if (node?.type === NODE_TYPE.THIS) {
    return 'this';
  }
  return node?.type === NODE_TYPE.IDENTIFIER ? node.name : null;
}

// The event name as production writes it: a string literal where one is
// used, otherwise the constant reference itself (`RAFT_EVENT.DATA`), which
// is what the source actually says.
function eventExpressionName(node) {
  if (node?.type === NODE_TYPE.LITERAL && typeof node.value === 'string') {
    return node.value;
  }
  if (node?.type === NODE_TYPE.IDENTIFIER) {
    return node.name;
  }
  if (node?.type === NODE_TYPE.MEMBER && !node.computed) {
    const object = eventExpressionName(node.object);
    const property = node.property?.name;
    return object && property ? `${object}.${property}` : null;
  }
  return null;
}

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function collectSourceFiles(directory, collected) {
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(absolute, collected);
    } else if (entry.isFile() && entry.name.endsWith(CENSUS.FILE_SUFFIX)) {
      collected.push(absolute);
    }
  }
  return collected;
}

function repositoryRelative(absolute) {
  return path.relative(repositoryRoot, absolute)
    .split(path.sep).join(CENSUS.PATH_SEPARATOR);
}

function parseSource(source) {
  const options = {ecmaVersion: 'latest', loc: true};
  const normalized = source.replace(CENSUS.HASHBANG, CENSUS.NEWLINE);
  try {
    return parse(normalized, {...options, sourceType: 'module'});
  } catch (_moduleError) {
    return parse(normalized, {...options, sourceType: 'script'});
  }
}

function walk(node, visit, parent) {
  if (!node || typeof node.type !== 'string') {
    return;
  }
  visit(node, parent);
  for (const key of KEYS[node.type] || []) {
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        walk(child, visit, node);
      }
    } else if (value && typeof value.type === 'string') {
      walk(value, visit, node);
    }
  }
}

// `raft`, `raftNode`, `this.raft`, `service.raft`, `partitionService.raft`:
// every spelling production uses for the handle it holds.
function holderForName(name) {
  if (CENSUS.NODE_IDENTIFIERS.includes(name)) {
    return CENSUS.NODE_HOLDER;
  }
  return CENSUS.PROVIDER_IDENTIFIERS.includes(name) ?
    CENSUS.PROVIDER_HOLDER : null;
}

function holderForProperty(name) {
  if (name === CENSUS.NODE_HOLDER) {
    return CENSUS.NODE_HOLDER;
  }
  return name === CENSUS.PROVIDER_HOLDER ? CENSUS.PROVIDER_HOLDER : null;
}

function holderKind(objectNode) {
  if (objectNode?.type === NODE_TYPE.IDENTIFIER) {
    return holderForName(objectNode.name);
  }
  const isNamedMember = objectNode?.type === NODE_TYPE.MEMBER &&
    !objectNode.computed &&
    objectNode.property?.type === NODE_TYPE.IDENTIFIER;
  if (!isNamedMember) {
    return null;
  }
  const receiver = receiverName(objectNode.object);
  return receiver && CENSUS.NODE_RECEIVERS.includes(receiver) ?
    holderForProperty(objectNode.property.name) : null;
}

function record(bucket, name, site) {
  if (!Object.hasOwn(bucket, name)) {
    bucket[name] = {count: 0, firstSite: site};
  }
  bucket[name].count += 1;
}

function emptyCensus() {
  return {
    nodeMethods: {},
    nodeProperties: {},
    nodeEvents: {},
    providerMethods: {},
  };
}

function recordNodeCall(name, site, parent, census) {
  record(census.nodeMethods, name, site);
  const listensOrEmits = CENSUS.SUBSCRIBE_METHODS.includes(name) ||
    name === CENSUS.EMIT_METHOD;
  if (!listensOrEmits) {
    return;
  }
  const eventName = eventExpressionName(parent.arguments?.[0]);
  if (eventName) {
    record(census.nodeEvents, eventName, site);
  }
}

function visitMember(node, parent, census, file) {
  const kind = holderKind(node.object);
  if (!kind || node.computed ||
      node.property?.type !== NODE_TYPE.IDENTIFIER) {
    return;
  }
  const name = node.property.name;
  const site = `${file}:${node.loc.start.line}`;
  const called = parent?.type === NODE_TYPE.CALL && parent.callee === node;
  if (kind === CENSUS.PROVIDER_HOLDER) {
    if (called) {
      record(census.providerMethods, name, site);
    }
    return;
  }
  if (!called) {
    record(census.nodeProperties, name, site);
    return;
  }
  recordNodeCall(name, site, parent, census);
}

/**
 * Derive the census from the current contents of `src`.
 * @return {{nodeMethods: Object, nodeProperties: Object,
 *   nodeEvents: Object, providerMethods: Object}}
 */
function deriveProductionRaftCallCensus() {
  const census = emptyCensus();
  const files = collectSourceFiles(
    path.join(repositoryRoot, CENSUS.SOURCE_ROOT), []);
  for (const absolute of files) {
    const relative = repositoryRelative(absolute);
    if (relative.startsWith(CENSUS.EXCLUDED_PREFIX)) {
      continue;
    }
    const tree = parseSource(fs.readFileSync(absolute, CENSUS.UTF8));
    walk(tree, (node, parent) => {
      if (node.type === NODE_TYPE.MEMBER) {
        visitMember(node, parent, census, relative);
      }
    }, null);
  }
  return census;
}

/**
 * The census reduced to sorted name lists, which is the shape the evaluation
 * document records and the shape a contract can be compared against.
 * @param {Object} census
 * @return {{nodeMethods: Array<string>, nodeProperties: Array<string>,
 *   nodeEvents: Array<string>, providerMethods: Array<string>}}
 */
function censusNames(census) {
  const names = (bucket) => Object.keys(bucket).sort();
  return {
    nodeMethods: names(census.nodeMethods),
    nodeProperties: names(census.nodeProperties),
    nodeEvents: names(census.nodeEvents),
    providerMethods: names(census.providerMethods),
  };
}

export {
  censusNames,
  deriveProductionRaftCallCensus,
};
