/**
 * Tests for VisualIndicators component
 *
 * Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6
 */
// @ts-nocheck


import {test} from '../../../src/test-helpers/tap.js';
import {
  VisualIndicators,
  STATUS,
  STATUS_COLORS,
  ENTITY_ICONS,
  BOX_CHARS,
  ASCII_BOX_CHARS,
  LOADING_FRAMES,
  ASCII_LOADING_FRAMES,
  MONOCHROME_INDICATORS,
  MONOCHROME_ENTITY_ICONS,
} from '../../../src/cli/core/visual-indicators.js';

test('VisualIndicators', async (t) => {
  t.test('constructor initializes with defaults', async (t) => {
    const vi = new VisualIndicators();

    t.equal(vi.monochrome, false);
    t.equal(vi.loadingFrame, 0);
    t.equal(vi.loadingInterval, null);
  });

  t.test('constructor accepts monochrome option', async (t) => {
    const vi = new VisualIndicators({monochrome: true});

    t.equal(vi.isMonochrome(), true);
  });

  t.test('setMonochrome changes mode', async (t) => {
    const vi = new VisualIndicators();

    t.equal(vi.isMonochrome(), false);

    vi.setMonochrome(true);
    t.equal(vi.isMonochrome(), true);

    vi.setMonochrome(false);
    t.equal(vi.isMonochrome(), false);
  });

  t.test('getStatusColor returns correct colors', async (t) => {
    const vi = new VisualIndicators();

    t.equal(vi.getStatusColor('healthy'), 'green');
    t.equal(vi.getStatusColor('warning'), 'yellow');
    t.equal(vi.getStatusColor('error'), 'red');
    t.equal(vi.getStatusColor('failed'), 'red');
    t.equal(vi.getStatusColor('unknown'), 'gray');
    t.equal(vi.getStatusColor('loading'), 'cyan');
  });

  t.test('getStatusColor returns white in monochrome mode', async (t) => {
    const vi = new VisualIndicators({monochrome: true});

    t.equal(vi.getStatusColor('healthy'), 'white');
    t.equal(vi.getStatusColor('error'), 'white');
    t.equal(vi.getStatusColor('warning'), 'white');
  });

  t.test('getStatusColor handles case insensitivity', async (t) => {
    const vi = new VisualIndicators();

    t.equal(vi.getStatusColor('HEALTHY'), 'green');
    t.equal(vi.getStatusColor('Warning'), 'yellow');
    t.equal(vi.getStatusColor('ERROR'), 'red');
  });

  t.test('getStatusColor handles null/undefined', async (t) => {
    const vi = new VisualIndicators();

    t.equal(vi.getStatusColor(null), 'gray');
    t.equal(vi.getStatusColor(undefined), 'gray');
  });

  t.test('getStatusIndicator returns indicators in monochrome mode', async (t) => {
    const vi = new VisualIndicators({monochrome: true});

    t.equal(vi.getStatusIndicator('healthy'), '[OK]');
    t.equal(vi.getStatusIndicator('warning'), '[!]');
    t.equal(vi.getStatusIndicator('error'), '[X]');
  });

  t.test('getStatusIndicator returns empty in color mode', async (t) => {
    const vi = new VisualIndicators({monochrome: false});

    t.equal(vi.getStatusIndicator('healthy'), '');
    t.equal(vi.getStatusIndicator('error'), '');
  });

  t.test('getEntityIcon returns correct icons', async (t) => {
    const vi = new VisualIndicators();

    t.equal(vi.getEntityIcon('node'), '◉');
    t.equal(vi.getEntityIcon('service'), '◆');
    t.equal(vi.getEntityIcon('partition'), '▣');
    t.equal(vi.getEntityIcon('message_group'), '◈');
    t.equal(vi.getEntityIcon('table'), '▤');
  });

  t.test('getEntityIcon returns ASCII icons in monochrome mode', async (t) => {
    const vi = new VisualIndicators({monochrome: true});

    t.equal(vi.getEntityIcon('node'), '[N]');
    t.equal(vi.getEntityIcon('service'), '[S]');
    t.equal(vi.getEntityIcon('partition'), '[P]');
    t.equal(vi.getEntityIcon('table'), '[T]');
  });

  t.test('getEntityIcon handles unknown types', async (t) => {
    const vi = new VisualIndicators();

    t.equal(vi.getEntityIcon('unknown'), '○');
    t.equal(vi.getEntityIcon(''), '○');
    t.equal(vi.getEntityIcon(null), '○');
  });

  t.test('getBoxChars returns Unicode chars by default', async (t) => {
    const vi = new VisualIndicators();
    const chars = vi.getBoxChars();

    t.equal(chars.topLeft, '┌');
    t.equal(chars.horizontal, '─');
    t.equal(chars.vertical, '│');
  });

  t.test('getBoxChars returns ASCII chars in monochrome mode', async (t) => {
    const vi = new VisualIndicators({monochrome: true});
    const chars = vi.getBoxChars();

    t.equal(chars.topLeft, '+');
    t.equal(chars.horizontal, '-');
    t.equal(chars.vertical, '|');
  });

  t.test('drawBox creates correct border strings', async (t) => {
    const vi = new VisualIndicators();
    const box = vi.drawBox(10, 5);

    t.equal(box.width, 10);
    t.equal(box.height, 5);
    t.ok(box.top.startsWith('┌'));
    t.ok(box.top.endsWith('┐'));
    t.ok(box.bottom.startsWith('└'));
    t.ok(box.bottom.endsWith('┘'));
    t.equal(box.left, '│');
    t.equal(box.right, '│');
  });

  t.test('drawBox with double lines', async (t) => {
    const vi = new VisualIndicators();
    const box = vi.drawBox(10, 5, {double: true});

    t.ok(box.top.startsWith('╔'));
    t.ok(box.top.endsWith('╗'));
    t.ok(box.bottom.startsWith('╚'));
    t.ok(box.bottom.endsWith('╝'));
  });

  t.test('drawBox with rounded corners', async (t) => {
    const vi = new VisualIndicators();
    const box = vi.drawBox(10, 5, {rounded: true});

    t.ok(box.top.startsWith('╭'));
    t.ok(box.top.endsWith('╮'));
    t.ok(box.bottom.startsWith('╰'));
    t.ok(box.bottom.endsWith('╯'));
  });

  t.test('drawBox in monochrome mode uses ASCII', async (t) => {
    const vi = new VisualIndicators({monochrome: true});
    const box = vi.drawBox(10, 5);

    t.ok(box.top.startsWith('+'));
    t.ok(box.top.includes('-'));
    t.equal(box.left, '|');
  });

  t.test('getLoadingFrame returns current frame', async (t) => {
    const vi = new VisualIndicators();

    const frame = vi.getLoadingFrame();
    t.ok(LOADING_FRAMES.includes(frame));
  });

  t.test('getLoadingFrame returns ASCII frame in monochrome mode', async (t) => {
    const vi = new VisualIndicators({monochrome: true});

    const frame = vi.getLoadingFrame();
    t.ok(ASCII_LOADING_FRAMES.includes(frame));
  });

  t.test('advanceLoadingFrame cycles through frames', async (t) => {
    const vi = new VisualIndicators();

    const frames = [];
    for (let i = 0; i < LOADING_FRAMES.length + 2; i++) {
      frames.push(vi.getLoadingFrame());
      vi.advanceLoadingFrame();
    }

    // Should cycle back to beginning
    t.equal(frames[0], frames[LOADING_FRAMES.length]);
  });

  t.test('formatStatus returns formatted status object', async (t) => {
    const vi = new VisualIndicators();

    const result = vi.formatStatus('healthy');

    t.equal(result.text, 'healthy');
    t.equal(result.color, 'green');
    t.equal(result.status, 'healthy');
  });

  t.test('formatStatus with icon option', async (t) => {
    const vi = new VisualIndicators();

    const result = vi.formatStatus('healthy', {includeIcon: true});

    t.ok(result.text.includes('✓'));
  });

  t.test('formatStatus in monochrome mode includes indicator', async (t) => {
    const vi = new VisualIndicators({monochrome: true});

    const result = vi.formatStatus('healthy');

    t.ok(result.text.includes('[OK]'));
    t.equal(result.color, 'white');
  });

  t.test('formatEntity returns formatted entity object', async (t) => {
    const vi = new VisualIndicators();

    const result = vi.formatEntity('node', 'node-1');

    t.ok(result.text.includes('◉'));
    t.ok(result.text.includes('node-1'));
    t.equal(result.icon, '◉');
    t.equal(result.entityType, 'node');
    t.equal(result.entityId, 'node-1');
  });

  t.test('createLoadingIndicator returns loading info', async (t) => {
    const vi = new VisualIndicators();

    const result = vi.createLoadingIndicator('Fetching data');

    t.ok(result.text.includes('Fetching data'));
    t.ok(result.text.includes('...'));
    t.equal(result.message, 'Fetching data');
    t.equal(result.color, 'cyan');
  });

  t.test('createProgressBar creates correct bar', async (t) => {
    const vi = new VisualIndicators();

    const result = vi.createProgressBar(50, 20);

    t.equal(result.progress, 50);
    t.equal(result.width, 20);
    t.ok(result.text.includes('█'));
    t.ok(result.text.includes('░'));
  });

  t.test('createProgressBar clamps progress to 0-100', async (t) => {
    const vi = new VisualIndicators();

    const result1 = vi.createProgressBar(-10, 20);
    t.equal(result1.progress, 0);

    const result2 = vi.createProgressBar(150, 20);
    t.equal(result2.progress, 100);
  });

  t.test('createProgressBar in monochrome mode', async (t) => {
    const vi = new VisualIndicators({monochrome: true});

    const result = vi.createProgressBar(50, 20);

    t.ok(result.text.includes('#'));
    t.ok(result.text.includes('-'));
  });

  t.test('highlightSelected returns correct style', async (t) => {
    const vi = new VisualIndicators();

    const selected = vi.highlightSelected('Row text', true);
    t.equal(selected.style, 'inverse');
    t.equal(selected.isSelected, true);

    const notSelected = vi.highlightSelected('Row text', false);
    t.equal(notSelected.style, 'normal');
    t.equal(notSelected.isSelected, false);
  });

  t.test('colorize returns color info', async (t) => {
    const vi = new VisualIndicators();

    const result = vi.colorize('Text', 'green');
    t.equal(result.text, 'Text');
    t.equal(result.color, 'green');
  });

  t.test('colorize returns white in monochrome mode', async (t) => {
    const vi = new VisualIndicators({monochrome: true});

    const result = vi.colorize('Text', 'green');
    t.equal(result.color, 'white');
  });

  t.test('createSeparator creates horizontal line', async (t) => {
    const vi = new VisualIndicators();

    const sep = vi.createSeparator(10);
    t.equal(sep.length, 10);
    t.ok(sep.includes('─'));
  });

  t.test('createSeparator with double line', async (t) => {
    const vi = new VisualIndicators();

    const sep = vi.createSeparator(10, {double: true});
    t.ok(sep.includes('═'));
  });

  t.test('createVerticalSeparator creates vertical lines', async (t) => {
    const vi = new VisualIndicators();

    const sep = vi.createVerticalSeparator(5);
    t.equal(sep.length, 5);
    t.ok(sep.every((c) => c === '│'));
  });

  t.test('startLoadingAnimation and stopLoadingAnimation', async (t) => {
    const vi = new VisualIndicators();

    let callCount = 0;
    vi.startLoadingAnimation(() => {
      callCount++;
    }, 10);

    // Wait a bit for animation to run
    await new Promise((resolve) => setTimeout(resolve, 50));

    vi.stopLoadingAnimation();

    t.ok(callCount > 0);
    t.equal(vi.loadingInterval, null);
    t.equal(vi.loadingFrame, 0);
  });

  t.test('destroy stops animation', async (t) => {
    const vi = new VisualIndicators();

    vi.startLoadingAnimation(() => {}, 10);
    t.ok(vi.loadingInterval !== null);

    vi.destroy();

    t.equal(vi.loadingInterval, null);
  });
});

test('STATUS constants', async (t) => {
  t.test('STATUS has expected values', async (t) => {
    t.equal(STATUS.HEALTHY, 'healthy');
    t.equal(STATUS.WARNING, 'warning');
    t.equal(STATUS.ERROR, 'error');
    t.equal(STATUS.FAILED, 'failed');
    t.equal(STATUS.UNKNOWN, 'unknown');
    t.equal(STATUS.LOADING, 'loading');
  });
});

test('STATUS_COLORS constants', async (t) => {
  t.test('STATUS_COLORS has expected mappings', async (t) => {
    t.equal(STATUS_COLORS.healthy, 'green');
    t.equal(STATUS_COLORS.warning, 'yellow');
    t.equal(STATUS_COLORS.error, 'red');
    t.equal(STATUS_COLORS.failed, 'red');
  });
});

test('ENTITY_ICONS constants', async (t) => {
  t.test('ENTITY_ICONS has expected icons', async (t) => {
    t.equal(ENTITY_ICONS.node, '◉');
    t.equal(ENTITY_ICONS.service, '◆');
    t.equal(ENTITY_ICONS.partition, '▣');
    t.equal(ENTITY_ICONS.table, '▤');
  });
});

test('BOX_CHARS constants', async (t) => {
  t.test('BOX_CHARS has expected characters', async (t) => {
    t.equal(BOX_CHARS.topLeft, '┌');
    t.equal(BOX_CHARS.topRight, '┐');
    t.equal(BOX_CHARS.bottomLeft, '└');
    t.equal(BOX_CHARS.bottomRight, '┘');
    t.equal(BOX_CHARS.horizontal, '─');
    t.equal(BOX_CHARS.vertical, '│');
  });
});

test('ASCII_BOX_CHARS constants', async (t) => {
  t.test('ASCII_BOX_CHARS has expected characters', async (t) => {
    t.equal(ASCII_BOX_CHARS.topLeft, '+');
    t.equal(ASCII_BOX_CHARS.topRight, '+');
    t.equal(ASCII_BOX_CHARS.horizontal, '-');
    t.equal(ASCII_BOX_CHARS.vertical, '|');
  });
});

test('MONOCHROME_INDICATORS constants', async (t) => {
  t.test('MONOCHROME_INDICATORS has expected values', async (t) => {
    t.equal(MONOCHROME_INDICATORS.healthy, '[OK]');
    t.equal(MONOCHROME_INDICATORS.warning, '[!]');
    t.equal(MONOCHROME_INDICATORS.error, '[X]');
  });
});

test('MONOCHROME_ENTITY_ICONS constants', async (t) => {
  t.test('MONOCHROME_ENTITY_ICONS has expected values', async (t) => {
    t.equal(MONOCHROME_ENTITY_ICONS.node, '[N]');
    t.equal(MONOCHROME_ENTITY_ICONS.service, '[S]');
    t.equal(MONOCHROME_ENTITY_ICONS.partition, '[P]');
  });
});
