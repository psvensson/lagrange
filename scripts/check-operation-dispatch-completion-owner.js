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
const OWNER_REGISTRY_PATH =
  'src/rebalancer/operation-workflow-owner-retry-registry.js';
const OBSERVED_RETENTION_PATH =
  'src/rebalancer/operation-workflow-observed-progress-retention.js';
const RECOVERY_STATUS_RECONCILE_PATH =
  'src/rebalancer/operation-workflow-recovery-status-reconcile.js';
const TRANSITION_PERSISTENCE_PATH =
  'src/rebalancer/operation-workflow-transition-persistence.js';
const CANONICAL_DISPATCH_FUNCTION = 'executeOperationInternal';
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

function collectSites(sourceByPath) {
  const calls = [];
  const retiredNames = [];
  const responseStatuses = new Set();
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
  }
  return {
    calls,
    deliveredCreateMapCount,
    ownerShutdownClearsRegistry,
    ownerShutdownClearsTimer,
    responseStatuses,
    replaceTargetActiveClearsRetention,
    retiredNames,
    terminalCleanup,
  };
}

function collectOperationDispatchCompletionViolations(sourceByPath) {
  const sites = collectSites(sourceByPath);
  const violations = [];
  const deliveryCalls = sites.calls.filter((site) =>
    site.name === DELIVERY_CALL,
  );
  const retentionCalls = sites.calls.filter((site) =>
    site.name === RETENTION_CALL,
  );
  const responseCalls = sites.calls.filter((site) =>
    site.name === RESPONSE_RECONCILE_CALL,
  );
  const canonicalDelivery = deliveryCalls.find((site) =>
    site.filePath === CANONICAL_DISPATCH_PATH &&
    site.functionName === CANONICAL_DISPATCH_FUNCTION,
  );
  const canonicalRetention = retentionCalls.find((site) =>
    site.filePath === CANONICAL_DISPATCH_PATH &&
    site.functionName === CANONICAL_DISPATCH_FUNCTION,
  );
  const canonicalResponse = responseCalls.find((site) =>
    site.filePath === CANONICAL_DISPATCH_PATH &&
    site.functionName === CANONICAL_DISPATCH_FUNCTION,
  );

  if (deliveryCalls.length !== 1 || !canonicalDelivery) {
    violations.push({
      kind: 'create_delivery_sink_census',
      detail: `expected one canonical delivery call, found ${deliveryCalls.length}`,
    });
  }
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
  collectOperationDispatchCompletionViolations,
  loadSourceByPath,
};
