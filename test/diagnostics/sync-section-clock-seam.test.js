// Seam proof (formation-sim, bounded-seams constraint): the watchdog's
// sync-section registry stamps its sections on an injectable clock, and the
// shared registry can be handed a deterministic clock and given back the
// ambient one. RED on revert: with performance.now() hard-wired in enter and
// exit, the injected clock below would never be read and the section's
// total would be a real elapsed time, not 7 ms.

import {test} from '../../src/test-helpers/tap.js';
import {
  SyncSectionRegistry,
  configureSharedSyncSectionClock,
  getSharedSyncSectionRegistry,
  trackSyncSection,
} from '../../src/diagnostics/event-loop-gap-watchdog.js';

const SITE = 'seam-test-section';
const ENTER_MS = 100;
const EXIT_MS = 107;
const SECTION_MS = EXIT_MS - ENTER_MS;

test('a registry stamps its sections on the injected clock', (t) => {
  const stamps = [ENTER_MS, EXIT_MS];
  const registry = new SyncSectionRegistry({clock: () => stamps.shift()});
  const token = registry.enter(SITE);
  registry.exit(SITE, token);
  t.equal(registry.sites.get(SITE).totalMs, SECTION_MS, 'seven virtual milliseconds');
  t.equal(registry.sites.get(SITE).count, 1);
  t.end();
});

test('the shared registry takes a deterministic clock and gives back the ambient one', (t) => {
  const shared = getSharedSyncSectionRegistry();
  const stamps = [ENTER_MS, EXIT_MS];
  configureSharedSyncSectionClock(() => stamps.shift());
  try {
    const before = shared.sites.get(SITE)?.totalMs || 0;
    trackSyncSection(SITE, () => null);
    t.equal(shared.sites.get(SITE).totalMs - before, SECTION_MS,
      'tagging inside a dispatch read the injected clock, not performance.now');
  } finally {
    configureSharedSyncSectionClock(null);
  }
  t.equal(typeof shared.clock(), 'number', 'the ambient clock is restored');
  t.end();
});
