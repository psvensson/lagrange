// A bounded structural contract for the three-owner release interaction.
// These fragments specify control edges and original input flow, not a file
// digest. Unsupported rewrites fail closed until their contract is reviewed.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {collectJavaScriptFiles, parseSourceFile, walkAst} from './guideline-check-shared.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OWNER = 'src/node/participant-release-client.js';
const FRESH = 'src/node/replica-handler-release-recovery.js';
const SEED = 'src/bootstrap/bootstrap-service-seed-workflow.js';
const NAME = 'completeParticipantRelease';
const KIND = 'participant_release_completion_contract';
const CONSTANTS = 'src/partition/partition-participant-transaction-cutover-constants.js';
const BUILD = 'src/diagnostics/runtime-build-provenance.js';
const CLIENT_MODULE = 'participant-release-client.js';
const FRESH_FACTORY = 'createParticipantReleaseRecovery';
const SEED_FACTORY = 'createBootstrapServiceSeedWorkflowMethods';
const TABLE_MODULE = 'src/constants/index.js';
const OBSERVATIONS = 'src/node/participant-release-diagnostic-observation.js';
const TYPE = Object.freeze({FUNCTION: 'FunctionDeclaration', PROPERTY: 'Property',
  IDENTIFIER: 'Identifier', IMPORT: 'ImportDeclaration', IMPORT_SPECIFIER: 'ImportSpecifier',
  EXPORT_SPECIFIER: 'ExportSpecifier', CALL: 'CallExpression', VARIABLE: 'VariableDeclaration',
  DO_WHILE: 'DoWhileStatement', LITERAL: 'Literal', DECLARATOR: 'VariableDeclarator',
  FUNCTION_EXPRESSION: 'FunctionExpression', ARROW: 'ArrowFunctionExpression',
  CATCH: 'CatchClause', ASSIGNMENT: 'AssignmentExpression', UPDATE: 'UpdateExpression',
  FOR_IN: 'ForInStatement', FOR_OF: 'ForOfStatement', RETURN: 'ReturnStatement',
  OBJECT: 'ObjectExpression', IMPORT_DEFAULT: 'ImportDefaultSpecifier',
  IMPORT_NAMESPACE: 'ImportNamespaceSpecifier', CLASS: 'ClassDeclaration',
  CLASS_EXPRESSION: 'ClassExpression'});
const IMPORT_BINDINGS = new Set([TYPE.IMPORT_SPECIFIER, TYPE.IMPORT_DEFAULT,
  TYPE.IMPORT_NAMESPACE]);
const CLASS_BINDINGS = new Set([TYPE.CLASS, TYPE.CLASS_EXPRESSION]);
const FACTORY_STATEMENTS = new Set([TYPE.FUNCTION, TYPE.VARIABLE, TYPE.RETURN]);
const TRIVIA = new Set(['loc', 'range', 'start', 'end', 'raw', 'comments', 'tokens']);
const CONTEXTS = new WeakMap();
const POLICY_IMPORTS = Object.freeze({OUTCOME: 'PARTICIPANT_CUTOVER_OUTCOME',
  BOUND: 'PARTICIPANT_CUTOVER_BOUND', TRIGGER: 'PARTICIPANT_RELEASE_TRIGGER'});
const SEED_IMPORTS = Object.freeze({PARTICIPANT_CUTOVER_OUTCOME: 'PARTICIPANT_CUTOVER_OUTCOME',
  PARTICIPANT_RELEASE_TRIGGER: 'PARTICIPANT_RELEASE_TRIGGER'});
const ACTION_IMPORT = Object.freeze({ACTION: 'PARTICIPANT_RELEASE_ACTION'});
const OWNER_BINDINGS = Object.freeze([NAME, 'requestParticipantRelease',
  'retainFirstReleaseObservation', 'OUTCOME', 'BOUND', 'TRIGGER', 'ACTION',
  'objectFreeze', 'mathMin', 'mathMax', 'EMPTY_PARTICIPANT_RELEASE_DIAGNOSTIC_OBSERVATION',
  'askParticipantRelease', 'releaseNodeOfAddress']);
const SEED_BINDINGS = Object.freeze([SEED_FACTORY, 'PARTICIPANT_CUTOVER_OUTCOME',
  'PARTICIPANT_RELEASE_TRIGGER', 'TABLES', 'observeParticipantReleaseClockValue',
  'readParticipantReleaseClock', 'participantReleaseSeedBudgetObservation']);
const FRESH_BINDINGS = Object.freeze([FRESH_FACTORY, 'handler', 'now', 'sleep',
  'OUTCOME', 'BOUND', 'TRIGGER']);
const COMMON_BINDINGS = Object.freeze([NAME, 'runtimeBuildProvenance', 'RUNTIME_BUILD_STATE']);
const INTRINSICS = Object.freeze(['Object', 'Math', 'Number', 'Promise']);
const FRESH_PARAMETERS = Object.freeze(['handler']);
const TABLE_IMPORTS = Object.freeze({TABLES: 'TABLES'});
const BUILD_IMPORTS = Object.freeze({runtimeBuildProvenance: 'runtimeBuildProvenance',
  RUNTIME_BUILD_STATE: 'RUNTIME_BUILD_STATE'});
const OBSERVATION_IMPORTS = Object.freeze({
  observeParticipantReleaseClockValue: 'observeParticipantReleaseClockValue',
  readParticipantReleaseClock: 'readParticipantReleaseClock',
  participantReleaseSeedBudgetObservation: 'participantReleaseSeedBudgetObservation'});
const OWNER_DECLARATIONS = Object.freeze(['const objectFreeze = Object.freeze;',
  'const mathMin = Math.min;', 'const mathMax = Math.max;',
  'const EMPTY_PARTICIPANT_RELEASE_DIAGNOSTIC_OBSERVATION = null;']);
const NOW_DECLARATION = 'const now = () => handler.timeSource.now();';
const RULE_REFERENCE = 'architecture/contracts/authority-and-recovery.md: one decision algorithm';
const REASON = Object.freeze({BODY: 'completion input, control-flow or canonical binding contract differs',
  CENSUS: 'completion must have exactly the seed and fresh CREATE caller census'});
const SOURCE_DIRECTORY = 'src';
const FREEZE_EXPRESSION = 'Object.freeze';


const OWNER_CONTRACT = `async function completeParticipantRelease(owner, request, clock) {
  const intent = objectFreeze({...request});
  const deadline = intent.deadlineAtMs;
  const seed = intent.trigger === TRIGGER.FRESH_SEED;
  let answer = null;
  let completed = false;
  let attemptCount = 0;
  let firstBlockedDrain = EMPTY_PARTICIPANT_RELEASE_DIAGNOSTIC_OBSERVATION;
  let firstJoinedAttempt = EMPTY_PARTICIPANT_RELEASE_DIAGNOSTIC_OBSERVATION;
  do {
    attemptCount += 1;
    answer = await requestParticipantRelease(owner, intent);
    if (seed) {
      firstBlockedDrain = retainFirstReleaseObservation(firstBlockedDrain, answer.blockedDrain);
      firstJoinedAttempt = retainFirstReleaseObservation(firstJoinedAttempt, answer.joinedAttempt);
    }
    if (answer.outcome === OUTCOME.CUT_OVER) {
      completed = true;
      break;
    }
    const retryAfterMs = answer.outcome === OUTCOME.NOT_LEADER ?
      BOUND.PAUSE_RETRY_AFTER_MS : answer.retryAfterMs;
    if (!Number.isSafeInteger(retryAfterMs) || retryAfterMs < 0 ||
        clock.now() + retryAfterMs > deadline) break;
    const remaining = deadline - clock.now();
    if (!seed && remaining <= 0) break;
    await clock.sleep(mathMin(retryAfterMs, mathMax(0, remaining)));
  } while (clock.now() <= deadline);
  return {answer, completed, attemptCount, firstBlockedDrain, firstJoinedAttempt};
}`;
const FIRST_OBSERVATION_CONTRACT = `function retainFirstReleaseObservation(current, value) {
  return current === null && value !== undefined ? value : current;
}`;
const REQUEST_CONTRACT = `async function requestParticipantRelease(owner, request) {
  const payload = {...request, action: ACTION.RELEASE};
  const first = await askParticipantRelease(owner, request.nodeId ?? owner.nodeId, payload);
  if (first.outcome !== OUTCOME.NOT_LEADER) return first;
  const nodeId = releaseNodeOfAddress(first.leaderAddress);
  return nodeId === null ? first : askParticipantRelease(owner, nodeId,
    {...payload, replicaId: first.leaderReplicaId});
}`;
const FRESH_CONTRACT = `({async releaseFreshCreate(partitionId, options = {}) {
  const build = await runtimeBuildProvenance();
  if (build.state !== RUNTIME_BUILD_STATE.MEASURED) {
    throw new Error(\`Fresh replica release build unavailable: \${build.reason}\`);
  }
  const deadline = options.deadlineAtMs;
  if (!Number.isSafeInteger(deadline) || deadline <= now()) {
    throw new Error(RELEASE_RECOVERY_ERROR.FRESH_DEADLINE);
  }
  const authorization = await handler.participantReleaseAuthorizationOwner
    .authorizeFreshCreate({partitionId, targetBuildDigest: build.digest,
      createAdmissionEvidence: options.createAdmissionEvidence,
      identityExisted: options.identityExisted});
  if (authorization === null) {
    throw new Error(RELEASE_RECOVERY_ERROR.FRESH_AUTHORITY);
  }
  const {answer, completed} = await completeParticipantRelease(handler, {partitionId,
    targetBuildDigest: build.digest, trigger: TRIGGER.FRESH_CREATE,
    deadlineAtMs: deadline, authorization}, {now, sleep});
  if (completed) return answer;
  throw new Error(RELEASE_RECOVERY_ERROR.FRESH_FAILED + JSON.stringify({partitionId, answer}));
}})`;
const SLEEP_CONTRACT = `function sleep(delayMs) {
  return new Promise((resolve) => {
    const handle = handler.timeSource.setTimeout(() => resolve(), delayMs);
    handle?.unref?.();
  });
}`;
const SEED_CONTRACT = `({async releaseSeedParticipantCohorts() {
  const build = await runtimeBuildProvenance();
  if (build.state !== RUNTIME_BUILD_STATE.MEASURED) {
    throw new Error(\`Seed participant release build unavailable: \${build.reason}\`);
  }
  const services = [...this.partitionServices.values()].sort((left, right) => {
    const leftControl = left.tableName === TABLES.SQL_TRANSACTIONS ? 0 : 1;
    const rightControl = right.tableName === TABLES.SQL_TRANSACTIONS ? 0 : 1;
    return leftControl - rightControl || left.partitionId.localeCompare(right.partitionId);
  });
  const selectedPartitionIds = new Set();
  const cohorts = services.filter((service) => {
    if (selectedPartitionIds.has(service.partitionId)) return false;
    selectedPartitionIds.add(service.partitionId);
    return true;
  });
  const timeSource = this.nodeService.getTimeSource();
  const budgetMs = this.config.leadershipWaitTimeoutMs;
  const startMs = timeSource.now();
  const startObservation = observeParticipantReleaseClockValue(startMs);
  const deadline = startMs + budgetMs;
  let completed = 0;
  for (const service of cohorts) {
    const authorization = this.replicaHandler.participantReleaseAuthorizationOwner
      .authorizeFreshSeed({partitionId: service.partitionId, targetBuildDigest: build.digest,
        membershipOwnerOutcome: this.membershipOwnerOutcome});
    if (authorization === null) {
      throw new Error(SEED_PARTICIPANT_RELEASE_ERROR.AUTHORITY_UNAVAILABLE);
    }
    const {answer, attemptCount, firstBlockedDrain, firstJoinedAttempt} =
      await completeParticipantRelease(this.replicaHandler, {
        partitionId: service.partitionId, targetBuildDigest: build.digest,
        trigger: PARTICIPANT_RELEASE_TRIGGER.FRESH_SEED,
        deadlineAtMs: deadline, authorization,
      }, {now: () => timeSource.now(), sleep: (delayMs) => this.sleep(delayMs)});
    if (answer?.outcome !== PARTICIPANT_CUTOVER_OUTCOME.CUT_OVER) {
      const terminalObservation = readParticipantReleaseClock(timeSource);
      const seedRelease = seedReleaseFailureProjection({startObservation,
        terminalObservation, budgetMs, ordinal: completed + 1,
        total: cohorts.length, completed, attemptCount, firstBlockedDrain, firstJoinedAttempt});
      throw new Error(SEED_PARTICIPANT_RELEASE_ERROR.FAILED_PREFIX +
        JSON.stringify({partitionId: service.partitionId, answer, seedRelease}));
    }
    completed += 1;
  }
}})`;

function semanticAst(value) {
  if (Array.isArray(value)) return value.map(semanticAst);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !TRIVIA.has(key)).map(([key, child]) => [key, semanticAst(child)]));
}

function sameAst(actual, expected) {
  return actual !== undefined && isDeepStrictEqual(semanticAst(actual), semanticAst(expected));
}

function namedFunctions(ast, name) {
  const found = [];
  walkAst(ast, (node) => {
    if (node.type === TYPE.FUNCTION && node.id?.name === name) found.push(node);
    if (node.type === TYPE.PROPERTY && node.key?.name === name && node.method) {
      found.push(node.value);
    }
  });
  return found;
}

function functionMatches(ast, contract, scope = ast.body) {
  const expected = parseSourceFile(contract).body[0];
  const found = namedFunctions(ast, expected.id.name);
  return found.length === 1 && scope.includes(found[0]) && sameAst(found[0], expected);
}

function declarationMatches(scope, contract) {
  const expected = parseSourceFile(contract).body[0];
  return scope.filter((node) =>
    node.type === TYPE.VARIABLE && sameAst(node, expected)).length === 1;
}

function factoryOf(ast, name, parameters) {
  const found = ast.body.filter((node) =>
    node.type === TYPE.FUNCTION && node.id?.name === name);
  if (found.length !== 1) return null;
  const factory = found[0];
  return !factory.async && !factory.generator &&
    factory.body.body.every((node) => FACTORY_STATEMENTS.has(node.type)) &&
    factory.params.every((parameter) => parameter.type === TYPE.IDENTIFIER) &&
    isDeepStrictEqual(factory.params.map((parameter) => parameter.name), parameters) ?
    factory : null;
}

function returnedMethodObject(factory, frozen) {
  const returns = factory.body.body.filter((node) => node.type === TYPE.RETURN);
  if (returns.length !== 1 || factory.body.body.at(-1) !== returns[0]) return null;
  const returned = returns[0].argument;
  if (!frozen) return returned;
  if (returned?.type !== TYPE.CALL || returned.optional || returned.arguments.length !== 1 ||
      !sameAst(returned.callee, parseSourceFile(FREEZE_EXPRESSION).body[0].expression)) {
    return null;
  }
  return returned.arguments[0];
}

function directUniqueProperties(object) {
  const names = new Set();
  return object.properties.every((property) => {
    if (property.type !== TYPE.PROPERTY || property.computed ||
        property.key?.type !== TYPE.IDENTIFIER || names.has(property.key.name)) return false;
    names.add(property.key.name);
    return true;
  });
}

function callerMethodMatches(ast, factory, contract, frozen) {
  const expectedProperty = parseSourceFile(contract).body[0].expression.properties[0];
  const object = returnedMethodObject(factory, frozen);
  if (object?.type !== TYPE.OBJECT || !directUniqueProperties(object)) return false;
  const found = namedFunctions(ast, expectedProperty.key.name);
  return found.length === 1 && object.properties.some((property) =>
    property.value === found[0] && sameAst(property, expectedProperty));
}

function importsFrom(ast, file, module, bindings) {
  const imports = ast.body.filter((node) => node.type === TYPE.IMPORT &&
    path.posix.normalize(path.posix.join(path.posix.dirname(file), node.source.value)) === module);
  return Object.entries(bindings).every(([local, imported]) => imports.some((node) =>
    node.specifiers.some((specifier) => specifier.type === TYPE.IMPORT_SPECIFIER &&
      specifier.local.name === local && specifier.imported.name === imported)));
}

function constantsMatch(ast, file, seed = false) {
  return importsFrom(ast, file, CONSTANTS, seed ? SEED_IMPORTS : POLICY_IMPORTS);
}

function bindingCounts(ast, names, expected = 1) {
  const counts = new Map(names.map((name) => [name, 0]));
  const count = (pattern) => walkAst(pattern, (node) => {
    if (node.type === TYPE.IDENTIFIER && counts.has(node.name)) {
      counts.set(node.name, counts.get(node.name) + 1);
    }
  });
  walkAst(ast, (node) => {
    if (IMPORT_BINDINGS.has(node.type)) count(node.local);
    if (CLASS_BINDINGS.has(node.type)) count(node.id);
    if (node.type === TYPE.DECLARATOR) count(node.id);
    if (node.type === TYPE.CATCH) count(node.param);
    if ([TYPE.FUNCTION, TYPE.FUNCTION_EXPRESSION, TYPE.ARROW].includes(node.type)) {
      count(node.id);
      for (const parameter of node.params) count(parameter);
    }
  });
  return [...counts.values()].every((value) => value === expected);
}

function guardedBindingsUnchanged(ast, names, expected = 1) {
  let valid = true;
  walkAst(ast, (node) => {
    let target;
    if (node.type === TYPE.ASSIGNMENT || node.type === TYPE.FOR_IN || node.type === TYPE.FOR_OF) {
      target = node.left;
    }
    if (node.type === TYPE.UPDATE) target = node.argument;
    walkAst(target, (part) => {
      if (part.type === TYPE.IDENTIFIER && names.includes(part.name)) valid = false;
    });
  });
  return valid && bindingCounts(ast, names, expected);
}

function ownerMatches(ast) {
  return guardedBindingsUnchanged(ast, INTRINSICS, 0) &&
    guardedBindingsUnchanged(ast, OWNER_BINDINGS) && functionMatches(ast, OWNER_CONTRACT) &&
    functionMatches(ast, FIRST_OBSERVATION_CONTRACT) && functionMatches(ast, REQUEST_CONTRACT) &&
    constantsMatch(ast, OWNER) && importsFrom(ast, OWNER, CONSTANTS, ACTION_IMPORT) &&
    OWNER_DECLARATIONS.every((contract) => declarationMatches(ast.body, contract));
}

function seedCallerMatches(ast) {
  const factory = factoryOf(ast, SEED_FACTORY, []);
  return factory !== null && guardedBindingsUnchanged(ast, SEED_BINDINGS) &&
    constantsMatch(ast, SEED, true) && importsFrom(ast, SEED, TABLE_MODULE, TABLE_IMPORTS) &&
    importsFrom(ast, SEED, OBSERVATIONS, OBSERVATION_IMPORTS) &&
    callerMethodMatches(ast, factory, SEED_CONTRACT, false);
}

function freshCallerMatches(ast) {
  const factory = factoryOf(ast, FRESH_FACTORY, FRESH_PARAMETERS);
  return factory !== null && guardedBindingsUnchanged(ast, FRESH_BINDINGS) &&
    constantsMatch(ast, FRESH) && callerMethodMatches(ast, factory, FRESH_CONTRACT, true) &&
    functionMatches(ast, SLEEP_CONTRACT, factory.body.body) &&
    declarationMatches(factory.body.body, NOW_DECLARATION);
}

function callerMatches(ast, file) {
  return guardedBindingsUnchanged(ast, INTRINSICS, 0) &&
    guardedBindingsUnchanged(ast, COMMON_BINDINGS) &&
    importsFrom(ast, file, OWNER, {[NAME]: NAME}) &&
    importsFrom(ast, file, BUILD, BUILD_IMPORTS) &&
    (file === SEED ? seedCallerMatches(ast) : freshCallerMatches(ast));
}

function allowedReference(node, parent, file) {
  if (file === OWNER) {
    return (parent.type === TYPE.FUNCTION && parent.id === node) ||
      (parent.type === TYPE.EXPORT_SPECIFIER &&
        parent.local?.name === NAME && parent.exported?.name === NAME);
  }
  if (file !== SEED && file !== FRESH) return false;
  return parent.type === TYPE.IMPORT_SPECIFIER ||
    (parent.type === TYPE.CALL && parent.callee === node);
}

function clientImportValid(node, file) {
  if (typeof node.source?.value !== 'string') return true;
  const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), node.source.value));
  if (target !== OWNER) return true;
  if (node.type !== TYPE.IMPORT) return false;
  return node.specifiers.every((specifier) => specifier.type === TYPE.IMPORT_SPECIFIER &&
    (specifier.imported.name !== NAME ||
      ((file === SEED || file === FRESH) && specifier.local.name === NAME)));
}

function referenceCensus(ast, file) {
  let calls = 0;
  let valid = true;
  walkAst(ast, (node, parent) => {
    if (!clientImportValid(node, file)) valid = false;
    if (node.type === TYPE.LITERAL && node.value === NAME) valid = false;
    if (node.type !== TYPE.IDENTIFIER || node.name !== NAME) return;
    if (!allowedReference(node, parent, file)) valid = false;
    if (parent.type === TYPE.CALL && parent.callee === node) calls += 1;
  });
  return valid && calls === (file === SEED || file === FRESH ? 1 : 0);
}

function violation(filePath, reason) {
  return {filePath, line: 1, column: 1, functionName: NAME, kind: KIND, reason,
    ruleReference: RULE_REFERENCE};
}

// Supplied source maps let adversarial tests exercise the real audit, not a
// second classifier. No context is issued unless every contract is validated.
function inspectParticipantReleaseCompletion(sources, root = ROOT) {
  const violations = [];
  const parsed = new Map();
  for (const [file, source] of sources) {
    if ([OWNER, FRESH, SEED].includes(file) ||
        source.includes(NAME) || source.includes(CLIENT_MODULE)) {
      parsed.set(file, parseSourceFile(source));
    }
  }
  const checks = [[OWNER, ownerMatches], [FRESH, (ast) => callerMatches(ast, FRESH)],
    [SEED, (ast) => callerMatches(ast, SEED)]];
  for (const [file, check] of checks) {
    if (!parsed.has(file) || !check(parsed.get(file))) {
      violations.push(violation(file, REASON.BODY));
    }
  }
  for (const [file, ast] of parsed) {
    if (!referenceCensus(ast, file)) {
      violations.push(violation(file, REASON.CENSUS));
    }
  }
  const context = Object.freeze({});
  if (violations.length === 0) {
    const owner = namedFunctions(parsed.get(OWNER), NAME)[0];
    const loop = owner.body.body.find((node) => node.type === TYPE.DO_WHILE);
    CONTEXTS.set(context, {root, source: sources.get(OWNER), range: loop.range});
  }
  return {context, violations};
}

async function loadParticipantReleaseCompletionAudit(root = ROOT) {
  const sources = new Map();
  for (const file of await collectJavaScriptFiles(
    path.relative(process.cwd(), path.join(root, SOURCE_DIRECTORY)))) {
    const source = await fs.readFile(file, 'utf8');
    const relative = path.relative(root, path.resolve(file)).split(path.sep).join('/');
    if ([OWNER, FRESH, SEED].includes(relative) ||
        source.includes(NAME) || source.includes(CLIENT_MODULE)) {
      sources.set(relative, source);
    }
  }
  return inspectParticipantReleaseCompletion(sources, root);
}

function isOwnedParticipantReleaseCompletionLoop(node, source, file, context) {
  const proof = CONTEXTS.get(context);
  return proof !== undefined && source === proof.source &&
    path.resolve(file) === path.resolve(proof.root, OWNER) &&
    node.range?.[0] === proof.range[0] && node.range?.[1] === proof.range[1];
}

export {inspectParticipantReleaseCompletion, loadParticipantReleaseCompletionAudit,
  isOwnedParticipantReleaseCompletionLoop};
