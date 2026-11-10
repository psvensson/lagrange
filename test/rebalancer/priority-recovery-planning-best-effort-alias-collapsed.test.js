/**
 * The best-effort planning alias family is collapsed onto the one planning
 * answer (quest priority-recovery-owner-read-snapshot-await, receipt
 * best-effort-alias-family-collapsed).
 *
 * getPriorityRecoveryPlanningSnapshotBestEffort (and, before PR #201,
 * getMembershipPublicationPlanningSnapshotBestEffort) were `async` wrappers
 * that returned getPriorityRecoveryPlanningAnswerSync: the same answer one
 * microtask later, which a synchronous consumer read as a Promise. Every
 * consumer now reads the one planning answer (the service itself, or
 * readPriorityRecoveryPlanningAnswerSync / the read-policy owner's AVAILABLE
 * read). This static witness fails if any planning BestEffort name is
 * defined or called anywhere under src/ again, or the readiness service
 * grows one.
 */

import fs from 'node:fs';
import path from 'node:path';

import {test} from '../../src/test-helpers/tap.js';
import {
  ControlPlaneReadinessService,
} from '../../src/control-plane/control-plane-readiness-service.js';

const SRC_ROOT = path.resolve(process.cwd(), 'src');
// Any planning surface whose name ends in BestEffort is the alias family:
// getPriorityRecoveryPlanningSnapshotBestEffort,
// getMembershipPublicationPlanningSnapshotBestEffort and their *Answer*
// relatives.
const PLANNING_BEST_EFFORT_ALIAS = /\b\w*Planning\w*BestEffort\b/gu;

function sourceFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...sourceFiles(entryPath));
    } else if (entry.name.endsWith('.js')) {
      files.push(entryPath);
    }
  }
  return files;
}

test('best-effort-alias-family-collapsed: no planning BestEffort alias under src/',
  async (t) => {
    const hits = [];
    for (const file of sourceFiles(SRC_ROOT)) {
      const source = fs.readFileSync(file, 'utf8');
      for (const match of source.matchAll(PLANNING_BEST_EFFORT_ALIAS)) {
        hits.push(`${path.relative(process.cwd(), file)}: ${match[0]}`);
      }
    }
    t.same(hits, [], 'no planning BestEffort alias is defined or called in src/');
    const surface = Object.getOwnPropertyNames(ControlPlaneReadinessService.prototype)
      .filter((name) => /Planning\w*BestEffort$/u.test(name));
    t.same(surface, [], 'the readiness service carries no BestEffort planning surface');
    t.equal(
      typeof ControlPlaneReadinessService.prototype.getPriorityRecoveryPlanningAnswerSync,
      'function',
      'the one planning answer remains',
    );
  });
