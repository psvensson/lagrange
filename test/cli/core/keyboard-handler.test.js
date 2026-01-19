/**
 * Unit tests for KeyboardHandler
 *
 * Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.8
 */

import {test} from 'tap';
import {
  KeyboardHandler,
  INPUT_MODE,
  VIEW_KEYS,
} from '../../../src/cli/core/keyboard-handler.js';
import {EventBus} from '../../../src/cli/core/event-bus.js';
import {CommandParser} from '../../../src/cli/core/command-parser.js';
import {HelpOverlay} from '../../../src/cli/core/help-overlay.js';

test('KeyboardHandler', async (t) => {
  await t.test('constructor initializes in normal mode', async (t) => {
    const handler = new KeyboardHandler();
    t.equal(handler.getMode(), INPUT_MODE.NORMAL);
    t.equal(handler.getInputBuffer(), '');
  });

  await t.test('arrow keys emit navigation actions', async (t) => {
    const handler = new KeyboardHandler();

    const upAction = handler.handleKey({name: 'up'});
    t.equal(upAction.type, 'navigate:up');

    const downAction = handler.handleKey({name: 'down'});
    t.equal(downAction.type, 'navigate:down');
  });

  await t.test('Page Up/Down emit navigation with count', async (t) => {
    const handler = new KeyboardHandler({pageSize: 20});

    const pageUpAction = handler.handleKey({name: 'pageup'});
    t.equal(pageUpAction.type, 'navigate:pageup');
    t.equal(pageUpAction.count, 20);

    const pageDownAction = handler.handleKey({name: 'pagedown'});
    t.equal(pageDownAction.type, 'navigate:pagedown');
    t.equal(pageDownAction.count, 20);
  });

  await t.test('Home/End emit first/last navigation', async (t) => {
    const handler = new KeyboardHandler();

    const homeAction = handler.handleKey({name: 'home'});
    t.equal(homeAction.type, 'navigate:first');

    const endAction = handler.handleKey({name: 'end'});
    t.equal(endAction.type, 'navigate:last');
  });

  await t.test('Enter emits select action', async (t) => {
    const handler = new KeyboardHandler();

    const action = handler.handleKey({name: 'enter'});
    t.equal(action.type, 'navigate:select');
  });

  await t.test('Escape/Backspace emit back action', async (t) => {
    const handler = new KeyboardHandler();

    const escAction = handler.handleKey({name: 'escape'});
    t.equal(escAction.type, 'navigate:back');

    const bsAction = handler.handleKey({name: 'backspace'});
    t.equal(bsAction.type, 'navigate:back');
  });

  await t.test('number keys switch views', async (t) => {
    const handler = new KeyboardHandler();

    for (const [key, view] of Object.entries(VIEW_KEYS)) {
      const action = handler.handleKey({ch: key});
      t.equal(action.type, 'view:switch');
      t.equal(action.view, view);
    }
  });

  await t.test('/ enters filter mode', async (t) => {
    const handler = new KeyboardHandler();

    const action = handler.handleKey({ch: '/'});
    t.equal(action.type, 'mode:filter');
    t.equal(handler.getMode(), INPUT_MODE.FILTER);
  });

  await t.test(': enters command mode', async (t) => {
    const handler = new KeyboardHandler();

    const action = handler.handleKey({ch: ':'});
    t.equal(action.type, 'mode:command');
    t.equal(handler.getMode(), INPUT_MODE.COMMAND);
  });

  await t.test('? shows help', async (t) => {
    const helpOverlay = new HelpOverlay();
    const handler = new KeyboardHandler({helpOverlay});

    const action = handler.handleKey({ch: '?'});
    t.equal(action.type, 'help:show');
    t.equal(helpOverlay.isVisible(), true);
  });

  await t.test('q emits quit action', async (t) => {
    const handler = new KeyboardHandler();

    const action = handler.handleKey({ch: 'q'});
    t.equal(action.type, 'app:quit');
  });

  await t.test('d toggles detail panel', async (t) => {
    const handler = new KeyboardHandler();

    const action = handler.handleKey({ch: 'd'});
    t.equal(action.type, 'detail:toggle');
  });

  await t.test('r refreshes cache', async (t) => {
    const handler = new KeyboardHandler();

    const action = handler.handleKey({ch: 'r'});
    t.equal(action.type, 'cache:refresh');
  });

  await t.test('s triggers sort', async (t) => {
    const handler = new KeyboardHandler();

    const action = handler.handleKey({ch: 's'});
    t.equal(action.type, 'view:sort');
  });

  await t.test('p toggles CDC pause/resume', async (t) => {
    const handler = new KeyboardHandler();

    const action = handler.handleKey({ch: 'p'});
    t.equal(action.type, 'cdc:toggle-pause');
  });

  await t.test('Ctrl+C emits force quit', async (t) => {
    const handler = new KeyboardHandler();

    const action = handler.handleKey({ch: 'c', ctrl: true});
    t.equal(action.type, 'app:force-quit');
  });

  await t.test('filter mode: typing adds to buffer', async (t) => {
    const handler = new KeyboardHandler();
    handler.enterFilterMode();

    handler.handleKey({ch: 'a'});
    handler.handleKey({ch: 'b'});
    handler.handleKey({ch: 'c'});

    t.equal(handler.getInputBuffer(), 'abc');
  });

  await t.test('filter mode: backspace removes from buffer', async (t) => {
    const handler = new KeyboardHandler();
    handler.enterFilterMode();

    handler.handleKey({ch: 'a'});
    handler.handleKey({ch: 'b'});
    handler.handleKey({name: 'backspace'});

    t.equal(handler.getInputBuffer(), 'a');
  });

  await t.test('filter mode: escape cancels', async (t) => {
    const handler = new KeyboardHandler();
    handler.enterFilterMode();
    handler.handleKey({ch: 'a'});

    const action = handler.handleKey({name: 'escape'});
    t.equal(action.type, 'filter:cancel');
    t.equal(handler.getMode(), INPUT_MODE.NORMAL);
    t.equal(handler.getInputBuffer(), '');
  });

  await t.test('filter mode: enter applies filter', async (t) => {
    const handler = new KeyboardHandler();
    handler.enterFilterMode();
    handler.handleKey({ch: 't'});
    handler.handleKey({ch: 'e'});
    handler.handleKey({ch: 's'});
    handler.handleKey({ch: 't'});

    const action = handler.handleKey({name: 'enter'});
    t.equal(action.type, 'filter:apply');
    t.equal(action.pattern, 'test');
    t.equal(handler.getMode(), INPUT_MODE.NORMAL);
  });

  await t.test('command mode: typing adds to buffer', async (t) => {
    const handler = new KeyboardHandler();
    handler.enterCommandMode();

    handler.handleKey({ch: 'h'});
    handler.handleKey({ch: 'e'});
    handler.handleKey({ch: 'l'});
    handler.handleKey({ch: 'p'});

    t.equal(handler.getInputBuffer(), 'help');
  });

  await t.test('command mode: enter executes with parser', async (t) => {
    const commandParser = new CommandParser();
    const handler = new KeyboardHandler({commandParser});
    handler.enterCommandMode();

    handler.handleKey({ch: 'r'});
    handler.handleKey({ch: 'e'});
    handler.handleKey({ch: 'f'});
    handler.handleKey({ch: 'r'});
    handler.handleKey({ch: 'e'});
    handler.handleKey({ch: 's'});
    handler.handleKey({ch: 'h'});

    const action = handler.handleKey({name: 'enter'});
    t.equal(action.type, 'command:execute');
    t.equal(action.command, 'refresh');
  });

  await t.test('command mode: invalid command returns error', async (t) => {
    const commandParser = new CommandParser();
    const handler = new KeyboardHandler({commandParser});
    handler.enterCommandMode();

    handler.handleKey({ch: 'x'});
    handler.handleKey({ch: 'y'});
    handler.handleKey({ch: 'z'});

    const action = handler.handleKey({name: 'enter'});
    t.equal(action.type, 'command:error');
    t.ok(action.error);
  });

  await t.test('command mode: tab autocompletes', async (t) => {
    const commandParser = new CommandParser();
    const handler = new KeyboardHandler({commandParser});
    handler.enterCommandMode();

    handler.handleKey({ch: 'r'});
    handler.handleKey({ch: 'e'});
    handler.handleKey({ch: 'f'});

    handler.handleKey({name: 'tab'});
    t.equal(handler.getInputBuffer(), 'refresh');
  });

  await t.test('help overlay dismisses on any key', async (t) => {
    const helpOverlay = new HelpOverlay();
    const handler = new KeyboardHandler({helpOverlay});

    helpOverlay.show();
    t.equal(helpOverlay.isVisible(), true);

    const action = handler.handleKey({ch: 'x'});
    t.equal(action.type, 'help:dismiss');
    t.equal(helpOverlay.isVisible(), false);
  });

  await t.test('isInInputMode() returns correct state', async (t) => {
    const handler = new KeyboardHandler();

    t.equal(handler.isInInputMode(), false);

    handler.enterFilterMode();
    t.equal(handler.isInInputMode(), true);

    handler.exitInputMode();
    t.equal(handler.isInInputMode(), false);

    handler.enterCommandMode();
    t.equal(handler.isInInputMode(), true);
  });

  await t.test('getStatusBarText() returns mode-specific text', async (t) => {
    const handler = new KeyboardHandler();

    t.equal(handler.getStatusBarText(), '');

    handler.enterFilterMode();
    handler.handleKey({ch: 'a'});
    t.ok(handler.getStatusBarText().includes('Filter:'));
    t.ok(handler.getStatusBarText().includes('a'));

    handler.exitInputMode();
    handler.enterCommandMode();
    handler.handleKey({ch: 'h'});
    t.ok(handler.getStatusBarText().includes(':h'));
  });

  await t.test('getAvailableShortcuts() returns mode-specific shortcuts', async (t) => {
    const handler = new KeyboardHandler();

    const normalShortcuts = handler.getAvailableShortcuts();
    t.ok(normalShortcuts.some((s) => s.key.includes('↑')));
    t.ok(normalShortcuts.some((s) => s.key === 'q'));

    handler.enterFilterMode();
    const filterShortcuts = handler.getAvailableShortcuts();
    t.ok(filterShortcuts.some((s) => s.key === 'Enter'));
    t.ok(filterShortcuts.some((s) => s.key === 'Escape'));

    handler.exitInputMode();
    handler.enterCommandMode();
    const commandShortcuts = handler.getAvailableShortcuts();
    t.ok(commandShortcuts.some((s) => s.key === 'Tab'));
  });

  await t.test('emits events via eventBus', async (t) => {
    const eventBus = new EventBus();
    const handler = new KeyboardHandler({eventBus});

    let emittedEvent = null;
    eventBus.on('keyboard:navigate:up', (data) => {
      emittedEvent = data;
    });

    handler.handleKey({name: 'up'});
    t.ok(emittedEvent !== null, 'event was emitted');
  });

  await t.test('calls onAction callback', async (t) => {
    let calledAction = null;
    const handler = new KeyboardHandler({
      onAction: (action) => {
        calledAction = action;
      },
    });

    handler.handleKey({name: 'up'});
    t.equal(calledAction.type, 'navigate:up');
  });

  await t.test('calls onModeChange callback', async (t) => {
    let calledMode = null;
    const handler = new KeyboardHandler({
      onModeChange: (mode) => {
        calledMode = mode;
      },
    });

    handler.enterFilterMode();
    t.equal(calledMode, INPUT_MODE.FILTER);
  });

  await t.test('calls onInputChange callback', async (t) => {
    let calledValue = null;
    const handler = new KeyboardHandler({
      onInputChange: (value) => {
        calledValue = value;
      },
    });

    handler.enterFilterMode();
    handler.handleKey({ch: 'x'});
    t.equal(calledValue, 'x');
  });

  await t.test('isNavigationKey() identifies nav keys', async (t) => {
    const handler = new KeyboardHandler();

    t.equal(handler.isNavigationKey({name: 'up'}), true);
    t.equal(handler.isNavigationKey({name: 'down'}), true);
    t.equal(handler.isNavigationKey({name: 'pageup'}), true);
    t.equal(handler.isNavigationKey({name: 'home'}), true);
    t.equal(handler.isNavigationKey({ch: 'a'}), false);
  });

  await t.test('isViewSwitchKey() identifies view keys', async (t) => {
    const handler = new KeyboardHandler();

    t.equal(handler.isViewSwitchKey({ch: '1'}), true);
    t.equal(handler.isViewSwitchKey({ch: '9'}), true);
    t.equal(handler.isViewSwitchKey({ch: '0'}), false);
    t.equal(handler.isViewSwitchKey({ch: 'a'}), false);
  });

  await t.test('getViewForKey() returns correct view', async (t) => {
    const handler = new KeyboardHandler();

    t.equal(handler.getViewForKey({ch: '1'}), 'nodes');
    t.equal(handler.getViewForKey({ch: '6'}), 'sql');
    t.equal(handler.getViewForKey({ch: 'x'}), null);
  });

  await t.test('setInputBuffer() updates buffer', async (t) => {
    const handler = new KeyboardHandler();
    handler.enterFilterMode();

    handler.setInputBuffer('test');
    t.equal(handler.getInputBuffer(), 'test');
  });
});
