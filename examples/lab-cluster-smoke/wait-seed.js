#!/usr/bin/env node
/**
 * Bounded pre-exec joiner wrapper for Lagrange cluster formation.
 *
 * Polls the seed node's /livez endpoint strictly as HTTP contact liveness before
 * executing the genuine release CLI once without retry or restart.
 *
 * Contact liveness is explicitly NOT join admission, quorum readiness, or cluster formation.
 */

import {spawnSync} from 'node:child_process';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

const DEFAULT_DEADLINE_MS = 15000;
const DEFAULT_INTERVAL_MS = 200;
const HTTP_STATUS_OK = 200;

/**
 * Poll seed /livez endpoint until contact liveness is established or deadline expires.
 * @param {Object} options
 * @param {string} options.seedLivezUrl
 * @param {number} [options.deadlineMs]
 * @param {number} [options.intervalMs]
 * @param {Function} [options.fetchFn]
 * @param {Function} [options.nowFn]
 * @param {Function} [options.sleepFn]
 * @return {Promise<Object>}
 */
async function waitForSeedLivez(options = {}) {
  const seedLivezUrl = options.seedLivezUrl;
  if (!seedLivezUrl) {
    throw new Error('seedLivezUrl is required');
  }

  const deadlineMs = Number.isFinite(options.deadlineMs) && options.deadlineMs > 0 ?
    options.deadlineMs :
    DEFAULT_DEADLINE_MS;
  const intervalMs = Number.isFinite(options.intervalMs) && options.intervalMs > 0 ?
    options.intervalMs :
    DEFAULT_INTERVAL_MS;

  const nowFn = options.nowFn || Date.now;
  const fetchFn = options.fetchFn || fetch;
  const sleepFn = options.sleepFn || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));

  const wrapperStartedAtMs = nowFn();
  let attempts = 0;
  let lastError = null;

  while (nowFn() - wrapperStartedAtMs < deadlineMs) {
    attempts += 1;
    try {
      const response = await fetchFn(seedLivezUrl);
      if (response && response.status === HTTP_STATUS_OK) {
        let body = null;
        try {
          body = typeof response.json === 'function' ? await response.json() : null;
        } catch (jsonError) {
          lastError = jsonError;
        }

        if (body && body.alive === true) {
          const execStartedAtMs = nowFn();
          return {
            ok: true,
            wrapperStartedAtMs,
            execStartedAtMs,
            attempts,
            nodeId: body.nodeId || null,
            state: body.state || null,
          };
        }
      } else if (response) {
        lastError = new Error(`Seed livez returned HTTP status ${response.status}`);
      }
    } catch (networkError) {
      lastError = networkError;
    }

    const elapsed = nowFn() - wrapperStartedAtMs;
    if (elapsed + intervalMs >= deadlineMs) {
      break;
    }
    await sleepFn(intervalMs);
  }

  const spentMs = nowFn() - wrapperStartedAtMs;
  return {
    ok: false,
    error: `Timed out after ${spentMs}ms waiting for seed contact liveness at ${seedLivezUrl}` +
      (lastError ? `: ${lastError.message}` : ''),
    wrapperStartedAtMs,
    spentMs,
    attempts,
  };
}

/**
 * Parse CLI arguments for wait-seed.js.
 * @param {string[]} argv
 * @return {{seedLivezUrl: string, deadlineMs: number, intervalMs: number, targetArgv: string[]}}
 */
function parseCliArgs(argv) {
  let seedLivezUrl = 'http://127.0.0.1:18080/livez';
  let deadlineMs = DEFAULT_DEADLINE_MS;
  let intervalMs = DEFAULT_INTERVAL_MS;
  const targetArgv = [];

  const doubleDashIndex = argv.indexOf('--');
  const optionArgs = doubleDashIndex !== -1 ? argv.slice(0, doubleDashIndex) : argv;
  if (doubleDashIndex !== -1) {
    targetArgv.push(...argv.slice(doubleDashIndex + 1));
  }

  for (let i = 0; i < optionArgs.length; i += 1) {
    const arg = optionArgs[i];
    if (arg === '--seed-livez-url' && i + 1 < optionArgs.length) {
      seedLivezUrl = optionArgs[i + 1];
      i += 1;
    } else if (arg === '--deadline-ms' && i + 1 < optionArgs.length) {
      deadlineMs = Number(optionArgs[i + 1]);
      i += 1;
    } else if (arg === '--interval-ms' && i + 1 < optionArgs.length) {
      intervalMs = Number(optionArgs[i + 1]);
      i += 1;
    }
  }

  return {seedLivezUrl, deadlineMs, intervalMs, targetArgv};
}

async function main() {
  const {seedLivezUrl, deadlineMs, intervalMs, targetArgv} = parseCliArgs(process.argv.slice(2));
  const result = await waitForSeedLivez({seedLivezUrl, deadlineMs, intervalMs});

  if (!result.ok) {
    process.stderr.write(`wait-seed: ${result.error}\n`);
    process.exit(1);
  }

  if (targetArgv.length > 0) {
    const [command, ...args] = targetArgv;
    const child = spawnSync(command, args, {stdio: 'inherit'});
    process.exit(child.status !== null ? child.status : 1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((fatalError) => {
    process.stderr.write(`wait-seed fatal: ${fatalError.message}\n`);
    process.exit(1);
  });
}

export {
  DEFAULT_DEADLINE_MS,
  DEFAULT_INTERVAL_MS,
  parseCliArgs,
  waitForSeedLivez,
};
