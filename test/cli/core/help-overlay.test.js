/**
 * Unit tests for HelpOverlay
 *
 * Requirements: 20.1, 20.2, 20.3, 20.4, 20.5
 */

import {test} from '../../../src/test-helpers/tap.js';
import fs from 'node:fs';
import {HelpOverlay} from '../../../src/cli/core/help-overlay.js';
import {EventBus} from '../../../src/cli/core/event-bus.js';
import {LISTENER_PORT_DEFAULT} from
  '../../../src/config/listener-port-model.js';

const ADMIN_CLI_TARGET_PATTERN =
  /(?:lagrange-admin|LAGRANGE_NODE_ADDRESS|NODE_ADDRESS|:connect|:c\s|node_address)[^\n]*:8080/iu;

test('HelpOverlay', async (t) => {
  await t.test('constructor initializes with shortcuts', async (t) => {
    const overlay = new HelpOverlay();

    const shortcuts = overlay.getAllShortcuts();
    t.ok(shortcuts.length > 0, 'has shortcuts');
    t.ok(shortcuts.some((s) => s.key === '?'), 'has help shortcut');
    t.ok(shortcuts.some((s) => s.key === 'q'), 'has quit shortcut');
  });

  await t.test('getGlobalShortcuts() returns categorized shortcuts', async (t) => {
    const overlay = new HelpOverlay();

    const categories = overlay.getGlobalShortcuts();
    t.ok(categories.length > 0, 'has categories');

    const categoryNames = categories.map((c) => c.name);
    t.ok(categoryNames.includes('Navigation'), 'has Navigation category');
    t.ok(categoryNames.includes('Views'), 'has Views category');
    t.ok(categoryNames.includes('Actions'), 'has Actions category');
    t.ok(categoryNames.includes('General'), 'has General category');
  });

  await t.test('getViewHelp() returns help for all views', async (t) => {
    const overlay = new HelpOverlay();

    const viewHelp = overlay.getViewHelp();
    const views = [
      'nodes', 'services', 'replicas', 'tables', 'partitions',
      'message_groups', 'sql', 'logs', 'config', 'contexts',
    ];

    for (const view of views) {
      t.ok(viewHelp[view], `has help for ${view}`);
      t.ok(viewHelp[view].title, `${view} has title`);
      t.ok(viewHelp[view].description, `${view} has description`);
      t.ok(Array.isArray(viewHelp[view].shortcuts), `${view} has shortcuts`);
    }
  });

  await t.test('getHelpContent() returns combined content', async (t) => {
    const overlay = new HelpOverlay();

    const content = overlay.getHelpContent('nodes');
    t.ok(content.globalShortcuts, 'has global shortcuts');
    t.ok(content.viewHelp, 'has view help');
    t.equal(content.currentView, 'nodes', 'has current view');
  });

  await t.test('getHelpContent() handles unknown view', async (t) => {
    const overlay = new HelpOverlay();

    const content = overlay.getHelpContent('unknown');
    t.ok(content.globalShortcuts, 'has global shortcuts');
    t.equal(content.viewHelp, null, 'view help is null');
  });

  await t.test('formatHelpText() returns formatted string', async (t) => {
    const overlay = new HelpOverlay();

    const text = overlay.formatHelpText('nodes');
    t.ok(text.includes('KEYBOARD SHORTCUTS'), 'has title');
    t.ok(text.includes('Nodes View'), 'has view title');
    t.ok(text.includes('Navigation'), 'has navigation category');
    t.ok(text.includes('Press any key'), 'has dismiss hint');
  });

  await t.test('getStatusBarHints() returns hints for view', async (t) => {
    const overlay = new HelpOverlay();

    const hints = overlay.getStatusBarHints('nodes');
    t.ok(hints.includes('?:Help'), 'has help hint');
    t.ok(hints.includes('q:Quit'), 'has quit hint');
    t.ok(hints.includes('Drill Down'), 'has drill down hint');
  });

  await t.test('getStatusBarHints() returns SQL-specific hints', async (t) => {
    const overlay = new HelpOverlay();

    const hints = overlay.getStatusBarHints('sql');
    t.ok(hints.includes('Execute'), 'has execute hint');
  });

  await t.test('getUsageText() returns CLI usage', async (t) => {
    const overlay = new HelpOverlay();

    const usage = overlay.getUsageText();
    t.ok(usage.includes('USAGE'), 'has usage section');
    t.ok(usage.includes('OPTIONS'), 'has options section');
    t.ok(usage.includes('--help'), 'has help option');
    t.ok(usage.includes('EXAMPLES'), 'has examples');
    t.ok(
      usage.includes(
        `localhost:${LISTENER_PORT_DEFAULT.ADMIN_WEBSOCKET}`,
      ),
      'usage targets the canonical admin WebSocket default',
    );
    t.notMatch(
      usage,
      ADMIN_CLI_TARGET_PATTERN,
      'usage must not direct the admin CLI to the REST default',
    );
  });

  await t.test('show() sets visible and emits event', async (t) => {
    const eventBus = new EventBus();
    const overlay = new HelpOverlay({eventBus});

    let emitted = false;
    eventBus.on('help:show', () => {
      emitted = true;
    });

    overlay.show();
    t.equal(overlay.isVisible(), true);
    t.equal(emitted, true, 'emitted help:show');
  });

  await t.test('hide() clears visible and emits event', async (t) => {
    const eventBus = new EventBus();
    const overlay = new HelpOverlay({eventBus});

    overlay.show();

    let emitted = false;
    eventBus.on('help:hide', () => {
      emitted = true;
    });

    overlay.hide();
    t.equal(overlay.isVisible(), false);
    t.equal(emitted, true, 'emitted help:hide');
  });

  await t.test('toggle() toggles visibility', async (t) => {
    const overlay = new HelpOverlay();

    t.equal(overlay.isVisible(), false);
    overlay.toggle();
    t.equal(overlay.isVisible(), true);
    overlay.toggle();
    t.equal(overlay.isVisible(), false);
  });

  await t.test('handleKey() dismisses when visible', async (t) => {
    const overlay = new HelpOverlay();

    overlay.show();
    const handled = overlay.handleKey({});
    t.equal(handled, true, 'key was handled');
    t.equal(overlay.isVisible(), false, 'overlay hidden');
  });

  await t.test('handleKey() returns false when not visible', async (t) => {
    const overlay = new HelpOverlay();

    const handled = overlay.handleKey({});
    t.equal(handled, false, 'key was not handled');
  });

  await t.test('getShortcutsByCategory() returns category shortcuts', async (t) => {
    const overlay = new HelpOverlay();

    const navShortcuts = overlay.getShortcutsByCategory('Navigation');
    t.ok(navShortcuts.length > 0, 'has navigation shortcuts');
    t.ok(navShortcuts.some((s) => s.key.includes('↑')), 'has arrow keys');
  });

  await t.test('getShortcutsByCategory() returns empty for unknown', async (t) => {
    const overlay = new HelpOverlay();

    const shortcuts = overlay.getShortcutsByCategory('Unknown');
    t.same(shortcuts, []);
  });

  await t.test('getViewShortcuts() returns view shortcuts', async (t) => {
    const overlay = new HelpOverlay();

    const sqlShortcuts = overlay.getViewShortcuts('sql');
    t.ok(sqlShortcuts.length > 0, 'has SQL shortcuts');
    t.ok(sqlShortcuts.some((s) => s.description.includes('Execute')),
      'has execute shortcut');
  });

  await t.test('getViewShortcuts() returns empty for unknown', async (t) => {
    const overlay = new HelpOverlay();

    const shortcuts = overlay.getViewShortcuts('unknown');
    t.same(shortcuts, []);
  });
});

test('admin CLI documentation does not target the REST default', async (t) => {
  const surfaces = [
    'src/cli/README.md',
    'src/cli/COMMAND_REFERENCE.md',
    'src/cli/USER_GUIDE.md',
    'src/cli/core/help-overlay.js',
  ];

  for (const path of surfaces) {
    const source = fs.readFileSync(path, 'utf8');
    t.notMatch(
      source,
      ADMIN_CLI_TARGET_PATTERN,
      `${path} must not direct admin CLI users to port 8080`,
    );
  }
});
