#!/usr/bin/env node

import {setTimeout as sleep} from 'node:timers/promises';
import {
  buildEndpointSyncConfig,
} from '../src/runtime/endpoint-sync-config.js';
import {
  EndpointSyncSourceClient,
} from '../src/runtime/endpoint-sync-source-client.js';
import {
  EndpointSyncController,
} from '../src/runtime/endpoint-sync-controller.js';
import {
  EndpointSyncK8sClient,
} from '../src/runtime/endpoint-sync-k8s-client.js';

const EXIT_CODE = Object.freeze({
  SUCCESS: 0,
  CONFIG_ERROR: 1,
  STARTUP_ERROR: 2,
});

const SIGNAL = Object.freeze({
  SIGINT: 'SIGINT',
  SIGTERM: 'SIGTERM',
});

const LOG_TAG = Object.freeze({
  START: 'endpoint_sync.start',
  RUN: 'endpoint_sync.run',
  RUN_FAILED: 'endpoint_sync.run_failed',
  CONFIG_INVALID: 'endpoint_sync.config_invalid',
  STOP: 'endpoint_sync.stop',
});

const RUN_TRIGGER = Object.freeze({
  STARTUP: 'startup',
  INTERVAL: 'interval',
});

const DRAIN_WAIT = Object.freeze({
  POLL_MS: 50,
  MAX_MS: 10000,
});

function resolveControllerNamespace(config, k8sClient) {
  if (typeof config.targetNamespace === 'string' &&
    config.targetNamespace.trim().length > 0) {
    return config.targetNamespace.trim();
  }
  if (typeof config.leaseNamespace === 'string' &&
    config.leaseNamespace.trim().length > 0) {
    return config.leaseNamespace.trim();
  }
  return k8sClient.getDefaultNamespace();
}

async function main() {
  const configResult = buildEndpointSyncConfig(process.env);
  if (!configResult.valid) {
    console.error(LOG_TAG.CONFIG_INVALID, {
      errors: configResult.errors,
    });
    process.exitCode = EXIT_CODE.CONFIG_ERROR;
    return;
  }
  const config = configResult.config;

  const k8sClient = await EndpointSyncK8sClient.create();
  const namespace = resolveControllerNamespace(config, k8sClient);
  if (!namespace) {
    console.error(LOG_TAG.CONFIG_INVALID, {
      errors: [
        'namespace is required via ENDPOINT_SYNC_TARGET_NAMESPACE, ' +
        'ENDPOINT_SYNC_LEASE_NAMESPACE, or in-cluster service account namespace',
      ],
    });
    process.exitCode = EXIT_CODE.CONFIG_ERROR;
    return;
  }

  const sourceClient = new EndpointSyncSourceClient();
  const controller = new EndpointSyncController({
    sourceClient,
    k8sClient,
    config,
    namespace,
    logger: console,
  });

  let stopping = false;
  let running = false;
  let timer = null;

  const runCycle = async (trigger) => {
    if (stopping || running) {
      return;
    }
    running = true;

    try {
      const summary = await controller.runOnce();
      console.info(LOG_TAG.RUN, {
        trigger,
        namespace,
        sourceRowCount: summary.sourceRowCount,
        filteredRowCount: summary.filteredRowCount,
        plannedExportCount: summary.plannedExportCount,
        conflictCount: summary.conflictCount,
        skippedAsFollower: summary.skippedAsFollower,
        upsertedServices: summary.reconcileSummary.upsertedServices,
        upsertedEndpointSlices: summary.reconcileSummary.upsertedEndpointSlices,
        exportedEndpoints: summary.reconcileSummary.exportedEndpoints,
        deletedServices: summary.reconcileSummary.deletedServices,
        deletedEndpointSlices: summary.reconcileSummary.deletedEndpointSlices,
      });
    } catch (error) {
      console.error(LOG_TAG.RUN_FAILED, {
        trigger,
        namespace,
        error: error.message,
      });
    } finally {
      running = false;
    }
  };

  const drainInFlightRun = async () => {
    const startedAt = Date.now();
    while (running && Date.now() - startedAt < DRAIN_WAIT.MAX_MS) {
      await sleep(DRAIN_WAIT.POLL_MS);
    }
  };

  const stop = async (signal) => {
    if (stopping) {
      return;
    }
    stopping = true;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    await drainInFlightRun();
    console.info(LOG_TAG.STOP, {signal});
    process.exitCode = EXIT_CODE.SUCCESS;
  };

  process.on(SIGNAL.SIGINT, () => {
    void stop(SIGNAL.SIGINT);
  });
  process.on(SIGNAL.SIGTERM, () => {
    void stop(SIGNAL.SIGTERM);
  });

  console.info(LOG_TAG.START, {
    namespace,
    intervalMs: config.intervalMs,
    leaderElectionEnabled: config.leaderElectionEnabled,
    leaseName: config.leaseName,
  });

  await runCycle(RUN_TRIGGER.STARTUP);
  if (stopping) {
    return;
  }

  timer = setInterval(() => {
    void runCycle(RUN_TRIGGER.INTERVAL);
  }, config.intervalMs);
}

main().catch((error) => {
  console.error(LOG_TAG.RUN_FAILED, {error: error.message});
  process.exitCode = EXIT_CODE.STARTUP_ERROR;
});
