#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {
  getEnclosingFunctionName,
  parseSourceFile,
  walkAst,
} from './guideline-check-shared.js';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const SOURCE_ROOT = path.join(REPO_ROOT, 'src');
const CANONICAL_DISPATCH_PATH =
  'src/rebalancer/operation-workflow-dispatch-response-reconcile.js';
const CLEANUP_RELEASE_PATH =
  'src/rebalancer/operation-workflow-terminal-transition-repair.js';
const CLEANUP_CLAIM_PATH =
  'src/rebalancer/operation-workflow-replace-terminal-admission.js';
const OWNER_REGISTRY_PATH =
  'src/rebalancer/operation-workflow-owner-retry-registry.js';
const OBSERVED_RETENTION_PATH =
  'src/rebalancer/operation-workflow-observed-progress-retention.js';
const RECOVERY_STATUS_RECONCILE_PATH =
  'src/rebalancer/operation-workflow-recovery-status-reconcile.js';
const TRANSITION_PERSISTENCE_PATH =
  'src/rebalancer/operation-workflow-transition-persistence.js';
const CANONICAL_DISPATCH_FUNCTION = 'executeOperationInternal';
const CLEANUP_RELEASE_FUNCTION = 'deliverFailedCreateCleanupRelease';
const CLEANUP_CLAIM_FUNCTION = 'deliverClaimFailedCreateCleanup';
const EXPECTED_DELIVERY_SINK_COUNT = 3;
const AST_MEMBER_EXPRESSION = 'MemberExpression';
const AST_IDENTIFIER = 'Identifier';
const REPLICA_MESSAGE_TYPE_ENUM = 'ReplicaOperationMessageType';
const REPLICA_FIELD_ENUM = 'ReplicaOperationField';
const REMOVE_REPLICA_MESSAGE_TYPE = 'REMOVE_REPLICA';
const CLAIM_FAILED_CREATE_CLEANUP_MESSAGE_TYPE =
  'CLAIM_FAILED_CREATE_CLEANUP';
const FAILED_CREATE_PRECONDITION_FIELD =
  'FAILED_CREATE_TARGET_LIFECYCLE_PRECONDITION';
const DELIVERY_CALL = 'deliverReplicaOperationRequest';
const RETENTION_CALL = 'retainDeliveredCreateProgress';
const RESPONSE_RECONCILE_CALL = '_handleDispatchResponse';
const RESPONSE_STATUS_SET =
  'DELIVERED_CREATE_PROGRESS_RESPONSE_STATUSES';
const EXPECTED_CREATE_SUCCESS_STATUSES = Object.freeze(
  new Set(['INITIATED', 'IN_PROGRESS', 'ALREADY_EXISTS', 'COMPLETED']),
);
const RETIRED_CALLER_LOCAL_NAMES = Object.freeze(new Set([
  'scheduleRuntimeTargetProgressDispatchVerification',
  'RETAINED_TARGET_PROGRESS_VERIFICATION',
  'RETAINED_TARGET_PROGRESS_VERIFICATION_PROVENANCE',
]));
const REQUIRED_TERMINAL_CLEAR_FUNCTIONS = Object.freeze(
  new Set(['completeOperation', 'failOperation']),
);
// The terminal retention clear may be owned by this shared helper: each
// required terminal function must call it (or clear directly), and the
// helper itself must perform the strong delivered-create cleanup. The
// indirection exists because quest terminal-write-refusal-retry-ownership
// moved the clear from function entry to the proven-terminal arms —
// clearing retry ownership is a consequence of a proven terminal, never a
// precondition of attempting one.
const TERMINAL_CLEAR_HELPER_FUNCTION = 'clearTerminalOperationRetryState';
const STRONG_TERMINAL_CLEAR_CALL = 'clearObservedProgressRetry';
const CLEANUP_RELEASE_REMOVE_LITERAL =
  'ReplicaOperationMessageType.REMOVE_REPLICA';
const CLEANUP_RELEASE_PRECONDITION_LITERAL =
  'FAILED_CREATE_TARGET_LIFECYCLE_PRECONDITION';
const CLEANUP_RELEASE_ATTEMPT_LITERAL =
  'typeof precondition?.create_attempt_token === \'string\'';
const CLEANUP_CLAIM_ATTEMPT_LITERAL =
  'observation.lifecyclePrecondition.create_attempt_token !== attemptToken';
const CREATE_DELIVERY_SINK_CENSUS_KIND = 'create_delivery_sink_census';
const CREATE_DELIVERY_SINK_CENSUS_DETAIL =
  'expected one canonical operation delivery, one typed cleanup release, ' +
  'and one typed cleanup claim';
const CLEANUP_RELEASE_SHAPE_KIND = 'cleanup_release_delivery_shape';
const CLEANUP_RELEASE_SHAPE_DETAIL =
  'cleanup release must be REMOVE-only and carry an exact cleanup plus ' +
  'create-attempt precondition';
const CLEANUP_CLAIM_SHAPE_KIND = 'cleanup_claim_delivery_shape';
const CLEANUP_CLAIM_SHAPE_DETAIL =
  'cleanup claim must be CLAIM_FAILED_CREATE_CLEANUP-only and carry an ' +
  'exact create-attempt precondition';

/**
 * Record one terminal-retention cleanup census site.
 * @param {Object} site - {filePath, callName, enclosingFunction, node}
 * @param {Object} terminalCleanup - Mutable census accumulator.
 * @return {void}
 */
function recordTerminalRetentionCleanupSite(site, terminalCleanup) {
  const {filePath, callName, enclosingFunction, node} = site;
  if (filePath !== TRANSITION_PERSISTENCE_PATH) {
    return;
  }
  if (
    callName === STRONG_TERMINAL_CLEAR_CALL &&
    hasStrongDeliveredCreateCleanupOption(node)
  ) {
    if (REQUIRED_TERMINAL_CLEAR_FUNCTIONS.has(enclosingFunction)) {
      terminalCleanup.directClears.add(enclosingFunction);
    } else if (enclosingFunction === TERMINAL_CLEAR_HELPER_FUNCTION) {
      terminalCleanup.helperHasStrongCleanup = true;
    }
    return;
  }
  if (
    callName === TERMINAL_CLEAR_HELPER_FUNCTION &&
    REQUIRED_TERMINAL_CLEAR_FUNCTIONS.has(enclosingFunction)
  ) {
    terminalCleanup.helperCallers.add(enclosingFunction);
  }
}

function normalizePath(filePath) {
  return path.relative(REPO_ROOT, filePath).split(path.sep).join('/');
}

async function collectSourceFiles(directoryPath) {
  const entries = await fs.readdir(directoryPath, {withFileTypes: true});
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectSourceFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(entryPath);
    }
  }
  return files;
}

async function loadSourceByPath() {
  const files = await collectSourceFiles(SOURCE_ROOT);
  return new Map(await Promise.all(files.map(async (filePath) => [
    normalizePath(filePath),
    await fs.readFile(filePath, 'utf8'),
  ])));
}

function getMemberName(node) {
  if (node?.type !== 'MemberExpression') {
    return null;
  }
  if (!node.computed && node.property?.type === 'Identifier') {
    return node.property.name;
  }
  if (node.computed && node.property?.type === 'Literal') {
    return node.property.value;
  }
  return null;
}

function getCallName(node) {
  if (node?.type !== 'CallExpression') {
    return null;
  }
  if (node.callee?.type === 'Identifier') {
    return node.callee.name;
  }
  return getMemberName(node.callee);
}

function getDeclaredName(node, ancestors) {
  if (node?.type === 'VariableDeclarator' && node.id?.type === 'Identifier') {
    return node.id.name;
  }
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const ancestor = ancestors[index];
    if (
      ancestor?.type === 'VariableDeclarator' &&
      ancestor.id?.type === 'Identifier'
    ) {
      return ancestor.id.name;
    }
  }
  return null;
}

function hasStrongDeliveredCreateCleanupOption(node) {
  if (node?.type !== 'CallExpression') {
    return false;
  }
  const options = node.arguments?.[1];
  if (options?.type !== 'ObjectExpression') {
    return false;
  }
  return options.properties.some((property) => {
    const propertyName = property.computed ?
      property.key?.value :
      property.key?.name;
    return (
      property.type === 'Property' &&
      propertyName === 'includeDeliveredCreateProgress' &&
      property.value?.type === 'Literal' &&
      property.value.value === true
    );
  });
}

function recordCleanupDeliveryMember(node, messageTypes, requestFields) {
  if (node.type !== AST_MEMBER_EXPRESSION ||
      node.object?.type !== AST_IDENTIFIER) {
    return;
  }
  const memberName = getMemberName(node);
  if (!memberName) {
    return;
  }
  if (node.object.name === REPLICA_MESSAGE_TYPE_ENUM) {
    messageTypes.add(memberName);
  } else if (node.object.name === REPLICA_FIELD_ENUM) {
    requestFields.add(memberName);
  }
}

function collectFileSites(filePath, source) {
  const calls = [];
  const retiredNames = [];
  const responseStatuses = new Set();
  const cleanupReleaseMessageTypes = new Set();
  const cleanupReleaseRequestFields = new Set();
  const cleanupClaimMessageTypes = new Set();
  const cleanupClaimRequestFields = new Set();
  const terminalCleanup = {
    directClears: new Set(),
    helperCallers: new Set(),
    helperHasStrongCleanup: false,
  };
  let ownerShutdownClearsRegistry = false;
  let ownerShutdownClearsTimer = false;
  let replaceTargetActiveClearsRetention = false;
  let deliveredCreateMapCount = 0;

  const ast = parseSourceFile(source);
  walkAst(ast, (node, _parent, ancestors) => {
    const enclosingFunction = getEnclosingFunctionName(ancestors);
    const callName = getCallName(node);
    if (callName) {
      calls.push({
        filePath,
        functionName: enclosingFunction,
        name: callName,
        rangeStart: node.range?.[0] ?? -1,
      });
    }
    if (
      node.type === 'Identifier' &&
      RETIRED_CALLER_LOCAL_NAMES.has(node.name)
    ) {
      retiredNames.push({filePath, name: node.name});
    }
    if (
      filePath === OBSERVED_RETENTION_PATH &&
      node.type === 'MemberExpression' &&
      node.object?.type === 'Identifier' &&
      node.object.name === 'ReplicaOperationResponseStatus' &&
      getDeclaredName(node, ancestors) === RESPONSE_STATUS_SET
    ) {
      responseStatuses.add(getMemberName(node));
    }
    if (
      filePath === CLEANUP_RELEASE_PATH &&
      enclosingFunction === CLEANUP_RELEASE_FUNCTION
    ) {
      recordCleanupDeliveryMember(
        node,
        cleanupReleaseMessageTypes,
        cleanupReleaseRequestFields,
      );
    }
    if (
      filePath === CLEANUP_CLAIM_PATH &&
      enclosingFunction === CLEANUP_CLAIM_FUNCTION
    ) {
      recordCleanupDeliveryMember(
        node,
        cleanupClaimMessageTypes,
        cleanupClaimRequestFields,
      );
    }
    recordTerminalRetentionCleanupSite(
      {filePath, callName, enclosingFunction, node},
      terminalCleanup,
    );
    if (
      filePath === RECOVERY_STATUS_RECONCILE_PATH &&
      enclosingFunction === 'reconcileActiveReplicaStatus' &&
      callName === 'clearObservedProgressRetry' &&
      hasStrongDeliveredCreateCleanupOption(node)
    ) {
      replaceTargetActiveClearsRetention = true;
    }
    if (
      filePath === OWNER_REGISTRY_PATH &&
      enclosingFunction === 'shutdown' &&
      callName === 'clearTimeoutFn'
    ) {
      ownerShutdownClearsTimer = true;
    }
    if (
      filePath === OWNER_REGISTRY_PATH &&
      enclosingFunction === 'shutdown' &&
      callName === 'clear' &&
      node.callee?.object?.property?.name ===
        'observedProgressRetryTimerByOperationId'
    ) {
      ownerShutdownClearsRegistry = true;
    }
    if (
      node.type === 'AssignmentExpression' &&
      typeof getMemberName(node.left) === 'string' &&
      getMemberName(node.left).includes('DeliveredCreate') &&
      node.right?.type === 'NewExpression' &&
      node.right.callee?.name === 'Map'
    ) {
      deliveredCreateMapCount += 1;
    }
  });
  return {
    calls,
    cleanupClaimMessageTypes,
    cleanupClaimRequestFields,
    cleanupReleaseMessageTypes,
    cleanupReleaseRequestFields,
    deliveredCreateMapCount,
    ownerShutdownClearsRegistry,
    ownerShutdownClearsTimer,
    replaceTargetActiveClearsRetention,
    responseStatuses,
    retiredNames,
    terminalCleanup,
  };
}

function buildOperationDispatchCompletionBaseline(sourceByPath) {
  const fileSitesByPath = new Map();
  for (const [filePath, source] of sourceByPath.entries()) {
    fileSitesByPath.set(filePath, collectFileSites(filePath, source));
  }
  return Object.freeze({
    sourceByPath: new Map(sourceByPath),
    fileSitesByPath,
  });
}

function addAllToSet(target, values) {
  for (const value of values) {
    target.add(value);
  }
}

function collectSites(sourceByPath, baseline = null) {
  const calls = [];
  const retiredNames = [];
  const responseStatuses = new Set();
  const cleanupReleaseMessageTypes = new Set();
  const cleanupReleaseRequestFields = new Set();
  const cleanupClaimMessageTypes = new Set();
  const cleanupClaimRequestFields = new Set();
  const terminalCleanup = {
    directClears: new Set(),
    helperCallers: new Set(),
    helperHasStrongCleanup: false,
  };
  let ownerShutdownClearsRegistry = false;
  let ownerShutdownClearsTimer = false;
  let replaceTargetActiveClearsRetention = false;
  let deliveredCreateMapCount = 0;

  for (const [filePath, source] of sourceByPath.entries()) {
    const fileSites = baseline && baseline.sourceByPath.get(filePath) === source ?
      baseline.fileSitesByPath.get(filePath) :
      collectFileSites(filePath, source);
    calls.push(...fileSites.calls);
    retiredNames.push(...fileSites.retiredNames);
    addAllToSet(responseStatuses, fileSites.responseStatuses);
    addAllToSet(cleanupReleaseMessageTypes, fileSites.cleanupReleaseMessageTypes);
    addAllToSet(cleanupReleaseRequestFields, fileSites.cleanupReleaseRequestFields);
    addAllToSet(cleanupClaimMessageTypes, fileSites.cleanupClaimMessageTypes);
    addAllToSet(cleanupClaimRequestFields, fileSites.cleanupClaimRequestFields);
    addAllToSet(terminalCleanup.directClears, fileSites.terminalCleanup.directClears);
    addAllToSet(terminalCleanup.helperCallers, fileSites.terminalCleanup.helperCallers);
    terminalCleanup.helperHasStrongCleanup =
      terminalCleanup.helperHasStrongCleanup ||
      fileSites.terminalCleanup.helperHasStrongCleanup;
    ownerShutdownClearsRegistry =
      ownerShutdownClearsRegistry || fileSites.ownerShutdownClearsRegistry;
    ownerShutdownClearsTimer =
      ownerShutdownClearsTimer || fileSites.ownerShutdownClearsTimer;
    replaceTargetActiveClearsRetention =
      replaceTargetActiveClearsRetention ||
      fileSites.replaceTargetActiveClearsRetention;
    deliveredCreateMapCount += fileSites.deliveredCreateMapCount;
  }
  return {
    calls,
    cleanupClaimMessageTypes,
    cleanupClaimRequestFields,
    cleanupReleaseMessageTypes,
    cleanupReleaseRequestFields,
    deliveredCreateMapCount,
    ownerShutdownClearsRegistry,
    ownerShutdownClearsTimer,
    responseStatuses,
    replaceTargetActiveClearsRetention,
    retiredNames,
    terminalCleanup,
  };
}

function hasExpectedCleanupReleaseShape(sites, cleanupReleaseDelivery, source) {
  return Boolean(cleanupReleaseDelivery) &&
    sites.cleanupReleaseMessageTypes.size === 1 &&
    sites.cleanupReleaseMessageTypes.has(REMOVE_REPLICA_MESSAGE_TYPE) &&
    sites.cleanupReleaseRequestFields.has(FAILED_CREATE_PRECONDITION_FIELD) &&
    source.includes(CLEANUP_RELEASE_REMOVE_LITERAL) &&
    source.includes(CLEANUP_RELEASE_PRECONDITION_LITERAL) &&
    source.includes(CLEANUP_RELEASE_ATTEMPT_LITERAL);
}

function hasExpectedCleanupClaimShape(sites, cleanupClaimDelivery, source) {
  return Boolean(cleanupClaimDelivery) &&
    sites.cleanupClaimMessageTypes.size === 1 &&
    sites.cleanupClaimMessageTypes.has(
      CLAIM_FAILED_CREATE_CLEANUP_MESSAGE_TYPE,
    ) &&
    sites.cleanupClaimRequestFields.has(FAILED_CREATE_PRECONDITION_FIELD) &&
    source.includes(CLEANUP_CLAIM_ATTEMPT_LITERAL);
}

function recordDeliverySinkViolations(sites, sourceByPath, violations) {
  const deliveryCalls = sites.calls.filter((site) =>
    site.name === DELIVERY_CALL,
  );
  const canonicalDelivery = deliveryCalls.find((site) =>
    site.filePath === CANONICAL_DISPATCH_PATH &&
    site.functionName === CANONICAL_DISPATCH_FUNCTION,
  );
  const cleanupReleaseDelivery = deliveryCalls.find((site) =>
    site.filePath === CLEANUP_RELEASE_PATH &&
    site.functionName === CLEANUP_RELEASE_FUNCTION,
  );
  const cleanupClaimDelivery = deliveryCalls.find((site) =>
    site.filePath === CLEANUP_CLAIM_PATH &&
    site.functionName === CLEANUP_CLAIM_FUNCTION,
  );
  if (deliveryCalls.length !== EXPECTED_DELIVERY_SINK_COUNT ||
      !canonicalDelivery ||
      !cleanupReleaseDelivery ||
      !cleanupClaimDelivery) {
    violations.push({
      kind: CREATE_DELIVERY_SINK_CENSUS_KIND,
      detail: `${CREATE_DELIVERY_SINK_CENSUS_DETAIL}, found ` +
        deliveryCalls.length,
    });
  }
  const cleanupReleaseSource = sourceByPath.get(CLEANUP_RELEASE_PATH) || '';
  if (!hasExpectedCleanupReleaseShape(
    sites,
    cleanupReleaseDelivery,
    cleanupReleaseSource,
  )) {
    violations.push({
      kind: CLEANUP_RELEASE_SHAPE_KIND,
      detail: CLEANUP_RELEASE_SHAPE_DETAIL,
    });
  }
  const cleanupClaimSource = sourceByPath.get(CLEANUP_CLAIM_PATH) || '';
  if (!hasExpectedCleanupClaimShape(
    sites,
    cleanupClaimDelivery,
    cleanupClaimSource,
  )) {
    violations.push({
      kind: CLEANUP_CLAIM_SHAPE_KIND,
      detail: CLEANUP_CLAIM_SHAPE_DETAIL,
    });
  }
  return canonicalDelivery;
}

function collectOperationDispatchCompletionViolations(
  sourceByPath,
  baseline = null,
) {
  const sites = collectSites(sourceByPath, baseline);
  const violations = [];
  const canonicalDelivery = recordDeliverySinkViolations(
    sites,
    sourceByPath,
    violations,
  );
  const retentionCalls = sites.calls.filter((site) =>
    site.name === RETENTION_CALL,
  );
  const responseCalls = sites.calls.filter((site) =>
    site.name === RESPONSE_RECONCILE_CALL,
  );
  const canonicalRetention = retentionCalls.find((site) =>
    site.filePath === CANONICAL_DISPATCH_PATH &&
    site.functionName === CANONICAL_DISPATCH_FUNCTION,
  );
  const canonicalResponse = responseCalls.find((site) =>
    site.filePath === CANONICAL_DISPATCH_PATH &&
    site.functionName === CANONICAL_DISPATCH_FUNCTION,
  );
  if (retentionCalls.length !== 1 || !canonicalRetention) {
    violations.push({
      kind: 'delivered_create_owner_submission_census',
      detail: `expected one canonical retention call, found ${retentionCalls.length}`,
    });
  }
  if (
    !canonicalDelivery ||
    !canonicalRetention ||
    !canonicalResponse ||
    !(
      canonicalDelivery.rangeStart < canonicalRetention.rangeStart &&
      canonicalRetention.rangeStart < canonicalResponse.rangeStart
    )
  ) {
    violations.push({
      kind: 'delivered_create_owner_dominance',
      detail: 'delivery must flow through owner retention before response exits',
    });
  }
  for (const retiredSite of sites.retiredNames) {
    violations.push({
      kind: 'caller_local_retention_site',
      detail: `${retiredSite.filePath}:${retiredSite.name}`,
    });
  }
  const missingStatuses = [...EXPECTED_CREATE_SUCCESS_STATUSES].filter(
    (status) => !sites.responseStatuses.has(status),
  );
  const extraStatuses = [...sites.responseStatuses].filter(
    (status) => !EXPECTED_CREATE_SUCCESS_STATUSES.has(status),
  );
  if (missingStatuses.length > 0 || extraStatuses.length > 0) {
    violations.push({
      kind: 'create_success_status_coverage',
      detail: `missing=${missingStatuses.join(',')} extra=${extraStatuses.join(',')}`,
    });
  }
  for (const functionName of REQUIRED_TERMINAL_CLEAR_FUNCTIONS) {
    const clearsDirectly =
      sites.terminalCleanup.directClears.has(functionName);
    const clearsViaHelper =
      sites.terminalCleanup.helperHasStrongCleanup &&
      sites.terminalCleanup.helperCallers.has(functionName);
    if (!clearsDirectly && !clearsViaHelper) {
      violations.push({
        kind: 'terminal_retention_cleanup',
        detail: functionName,
      });
    }
  }
  if (!sites.replaceTargetActiveClearsRetention) {
    violations.push({
      kind: 'replace_target_active_retention_cleanup',
      detail: 'reconcileActiveReplicaStatus',
    });
  }
  if (!sites.ownerShutdownClearsRegistry || !sites.ownerShutdownClearsTimer) {
    violations.push({
      kind: 'shutdown_retention_cleanup',
      detail: 'owner shutdown must clear timer handles and the shared registry',
    });
  }
  if (sites.deliveredCreateMapCount > 0) {
    violations.push({
      kind: 'parallel_retention_registry',
      detail: `found ${sites.deliveredCreateMapCount} delivered-create Map(s)`,
    });
  }
  return violations;
}

async function main() {
  const sourceByPath = await loadSourceByPath();
  const violations =
    collectOperationDispatchCompletionViolations(sourceByPath);
  const payload = {
    metric: violations.length,
    target: 0,
    classification: 'operation-dispatch-completion-owner-census',
    violations,
  };
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  return violations.length === 0 ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then((exitCode) => {
    process.exitCode = exitCode;
  }).catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}

export {
  buildOperationDispatchCompletionBaseline,
  collectOperationDispatchCompletionViolations,
  loadSourceByPath,
};
