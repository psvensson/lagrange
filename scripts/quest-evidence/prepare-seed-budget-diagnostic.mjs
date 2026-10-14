#!/usr/bin/env node
// DIAGNOSTIC ONLY. Replace the test's fixture release budget and add a
// synchronous passive wall/CPU measurement around its real seed-release method.
// No production source changes, no virtual clock, no deadline modification
// beyond the explicitly logged fixture setting. The original test source is
// preserved in its own hash and full original copied text.
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const [file, budgetText, destination] = process.argv.slice(2);
assert.ok(file && budgetText && destination, 'usage: prepare-seed-budget-diagnostic.mjs <test> <budget> <output>');
const budgetMs = Number(budgetText);
assert.ok([1000, 3000, 5000, 10000].includes(budgetMs),
  'diagnostic only permits enumerated empirical budgets');
const source = readFileSync(file, 'utf8');
const oldConfig = 'config: {...TEST_CONFIG.bootstrap, replicaStaggerDelayMs: 0}});';
assert.equal(source.split(oldConfig).length - 1, 1, 'one exact original test fixture setting');
const newConfig =
  'config: {...TEST_CONFIG.bootstrap, leadershipWaitTimeoutMs: ' +
  budgetMs + ', replicaStaggerDelayMs: 0}});';
const oldBootstrap = '      booted = await bootstrap.bootstrap();';
assert.equal(source.split(oldBootstrap).length - 1, 1,
  'one exact real bootstrap call inside original integration case');
const replacementBootstrap = `      // Passive test-only phase timing; the original method is called once.
      // The RealTimeSource remains the original Date.now-backed clock.
      const originalSeedRelease = bootstrap.releaseSeedParticipantCohorts;
      let phaseMeasured = false;
      bootstrap.releaseSeedParticipantCohorts = async function(...args) {
        const wallStarted = performance.now();
        const wallSourceStarted = this.nodeService?.getTimeSource?.()?.now?.() ?? null;
        const cpuStarted = process.cpuUsage();
        const cpuAtStart = process.cpuUsage();
        let outcome = 'returned';
        try {
          return await Reflect.apply(originalSeedRelease, this, args);
        } catch (error) {
          outcome = 'threw';
          throw error;
        } finally {
          if (phaseMeasured) {
            throw new Error('Diagnostic found more than one seed release owner call');
          }
          phaseMeasured = true;
          const cpu = process.cpuUsage(cpuStarted);
          console.log(JSON.stringify({
            schema: 'seed-release-real-hardware-timing/1',
            budgetMs: ${budgetMs},
            clockKind: 'RealTimeSource(Date.now)',
            outcome,
            measuredWallMs: Math.round((performance.now() - wallStarted) * 100) / 100,
            timeSourceElapsedMs: wallSourceStarted === null ? null :
              this.nodeService.getTimeSource().now() - wallSourceStarted,
            cpuUserMs: Math.round(cpu.user / 1000 * 100) / 100,
            cpuSystemMs: Math.round(cpu.system / 1000 * 100) / 100,
            cpuAtStartUserUs: cpuAtStart.user,
            cpuAtStartSystemUs: cpuAtStart.system,
          }));
        }
      };
      booted = await bootstrap.bootstrap();`;
const result = source.replace(oldConfig, newConfig)
  .replace(oldBootstrap, replacementBootstrap);
assert.equal(result.includes('leadershipWaitTimeoutMs: ' + budgetMs), true);
writeFileSync(destination, result);
const sha = (data) => createHash('sha256').update(data).digest('hex');
console.log(JSON.stringify({schema: 'seed-budget-test-source-diagnostic/1',
  originalSha256: sha(source),
  diagnosticSha256: sha(result),
  originalBytes: Buffer.byteLength(source),
  diagnosticBytes: Buffer.byteLength(result),
  budgetMs,
  changes: ['one bootstrap fixture budget', 'one synchronous seed release phase observer'],
  productionSourceChanged: false,
}));
