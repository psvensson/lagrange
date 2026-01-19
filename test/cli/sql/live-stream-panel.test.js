/**
 * Unit tests for LiveStreamPanel
 *
 * Tests live stream event display, color coding, and scrolling.
 *
 * Requirements: 32.3, 32.4, 32.5, 32.12
 */

import {test} from 'tap';
import {LiveStreamPanel, EVENT_COLORS} from '../../../src/cli/sql/live-stream-panel.js';
import {EventBus} from '../../../src/cli/core/event-bus.js';

test('LiveStreamPanel', async (t) => {
  await t.test('constructor initializes with defaults', async (t) => {
    const panel = new LiveStreamPanel();

    t.equal(panel.getEventCount(), 0);
    t.equal(panel.getScrollPosition(), 0);
    t.equal(panel.getVisibleHeight(), 10);
    t.same(panel.getAllEvents(), []);
  });

  await t.test('constructor accepts custom options', async (t) => {
    const eventBus = new EventBus();
    const panel = new LiveStreamPanel({
      maxEvents: 50,
      visibleHeight: 5,
      eventBus,
    });

    t.equal(panel.maxEvents, 50);
    t.equal(panel.getVisibleHeight(), 5);
    t.equal(panel.eventBus, eventBus);
  });

  await t.test('addEvent adds event to the list', async (t) => {
    const panel = new LiveStreamPanel();

    panel.addEvent('INSERT', {id: 1, name: 'Alice'}, 1000);

    t.equal(panel.getEventCount(), 1);
    const events = panel.getAllEvents();
    t.equal(events[0].eventType, 'INSERT');
    t.same(events[0].data, {id: 1, name: 'Alice'});
    t.equal(events[0].timestamp, 1000);
  });

  await t.test('addEvent trims events when exceeding max', async (t) => {
    const panel = new LiveStreamPanel({maxEvents: 3});

    panel.addEvent('INSERT', {id: 1}, 1000);
    panel.addEvent('INSERT', {id: 2}, 2000);
    panel.addEvent('INSERT', {id: 3}, 3000);
    panel.addEvent('INSERT', {id: 4}, 4000);

    t.equal(panel.getEventCount(), 3);
    const events = panel.getAllEvents();
    t.equal(events[0].data.id, 2);
    t.equal(events[2].data.id, 4);
  });

  await t.test('getEventColor returns correct colors', async (t) => {
    const panel = new LiveStreamPanel();

    t.equal(panel.getEventColor('INSERT'), 'green');
    t.equal(panel.getEventColor('UPDATE'), 'yellow');
    t.equal(panel.getEventColor('DELETE'), 'red');
    t.equal(panel.getEventColor('UNKNOWN'), 'white');
  });

  await t.test('EVENT_COLORS constant has correct values', async (t) => {
    t.equal(EVENT_COLORS.INSERT, 'green');
    t.equal(EVENT_COLORS.UPDATE, 'yellow');
    t.equal(EVENT_COLORS.DELETE, 'red');
  });

  await t.test('formatEvent includes timestamp, type, and data', async (t) => {
    const panel = new LiveStreamPanel();
    const timestamp = new Date('2024-01-15T10:30:45.123Z').getTime();

    const formatted = panel.formatEvent({
      eventType: 'INSERT',
      data: {id: 1},
      timestamp,
    });

    t.ok(formatted.includes('10:30:45.123'));
    t.ok(formatted.includes('INSERT'));
    t.ok(formatted.includes('{green-fg}'));
  });

  await t.test('formatEventData truncates long data', async (t) => {
    const panel = new LiveStreamPanel();
    const longData = {
      field1: 'a'.repeat(50),
      field2: 'b'.repeat(50),
    };

    const formatted = panel.formatEventData(longData);

    t.ok(formatted.length <= 83); // 80 + '...'
    t.ok(formatted.endsWith('...'));
  });

  await t.test('getVisibleEvents returns correct events', async (t) => {
    const panel = new LiveStreamPanel({visibleHeight: 3});

    for (let i = 1; i <= 5; i++) {
      panel.addEvent('INSERT', {id: i}, i * 1000);
    }

    const visible = panel.getVisibleEvents();

    t.equal(visible.length, 3);
    // Should show most recent events (3, 4, 5)
    t.equal(visible[0].data.id, 3);
    t.equal(visible[2].data.id, 5);
  });

  await t.test('scrollUp shows older events', async (t) => {
    const panel = new LiveStreamPanel({visibleHeight: 3});

    for (let i = 1; i <= 5; i++) {
      panel.addEvent('INSERT', {id: i}, i * 1000);
    }

    panel.scrollUp();

    const visible = panel.getVisibleEvents();
    t.equal(visible[0].data.id, 2);
    t.equal(visible[2].data.id, 4);
  });

  await t.test('scrollDown shows newer events', async (t) => {
    const panel = new LiveStreamPanel({visibleHeight: 3});

    for (let i = 1; i <= 5; i++) {
      panel.addEvent('INSERT', {id: i}, i * 1000);
    }

    panel.scrollUp();
    panel.scrollUp();
    panel.scrollDown();

    const visible = panel.getVisibleEvents();
    t.equal(visible[0].data.id, 2);
    t.equal(visible[2].data.id, 4);
  });

  await t.test('scrollUp returns false at top', async (t) => {
    const panel = new LiveStreamPanel({visibleHeight: 3});

    for (let i = 1; i <= 5; i++) {
      panel.addEvent('INSERT', {id: i}, i * 1000);
    }

    // Scroll to top
    panel.scrollUp();
    panel.scrollUp();

    // Should return false when at top
    const result = panel.scrollUp();
    t.equal(result, false);
  });

  await t.test('scrollDown returns false at bottom', async (t) => {
    const panel = new LiveStreamPanel({visibleHeight: 3});

    for (let i = 1; i <= 5; i++) {
      panel.addEvent('INSERT', {id: i}, i * 1000);
    }

    // Already at bottom
    const result = panel.scrollDown();
    t.equal(result, false);
  });

  await t.test('scrollToBottom resets scroll position', async (t) => {
    const panel = new LiveStreamPanel({visibleHeight: 3});

    for (let i = 1; i <= 5; i++) {
      panel.addEvent('INSERT', {id: i}, i * 1000);
    }

    panel.scrollUp();
    panel.scrollUp();
    panel.scrollToBottom();

    t.equal(panel.getScrollPosition(), 0);
    t.equal(panel.isAtBottom(), true);
  });

  await t.test('scrollToTop scrolls to oldest events', async (t) => {
    const panel = new LiveStreamPanel({visibleHeight: 3});

    for (let i = 1; i <= 5; i++) {
      panel.addEvent('INSERT', {id: i}, i * 1000);
    }

    panel.scrollToTop();

    t.equal(panel.isAtTop(), true);
    const visible = panel.getVisibleEvents();
    t.equal(visible[0].data.id, 1);
  });

  await t.test('clear removes all events', async (t) => {
    const panel = new LiveStreamPanel();

    panel.addEvent('INSERT', {id: 1}, 1000);
    panel.addEvent('INSERT', {id: 2}, 2000);
    panel.clear();

    t.equal(panel.getEventCount(), 0);
    t.equal(panel.getScrollPosition(), 0);
  });

  await t.test('setVisibleHeight updates height', async (t) => {
    const panel = new LiveStreamPanel({visibleHeight: 10});

    panel.setVisibleHeight(5);

    t.equal(panel.getVisibleHeight(), 5);
  });

  await t.test('setVisibleHeight adjusts scroll position', async (t) => {
    const panel = new LiveStreamPanel({visibleHeight: 3});

    for (let i = 1; i <= 10; i++) {
      panel.addEvent('INSERT', {id: i}, i * 1000);
    }

    panel.scrollToTop();
    panel.setVisibleHeight(8);

    // Scroll position should be adjusted
    t.ok(panel.getScrollPosition() <= panel.getMaxScrollPosition());
  });

  await t.test('getMaxScrollPosition returns correct value', async (t) => {
    const panel = new LiveStreamPanel({visibleHeight: 3});

    for (let i = 1; i <= 10; i++) {
      panel.addEvent('INSERT', {id: i}, i * 1000);
    }

    t.equal(panel.getMaxScrollPosition(), 7); // 10 - 3
  });

  await t.test('getPlainTextLines returns lines without color codes', async (t) => {
    const panel = new LiveStreamPanel({visibleHeight: 3});
    const timestamp = new Date('2024-01-15T10:30:45.123Z').getTime();

    panel.addEvent('INSERT', {id: 1}, timestamp);

    const lines = panel.getPlainTextLines();

    t.equal(lines.length, 1);
    t.ok(!lines[0].includes('{green-fg}'));
    t.ok(lines[0].includes('INSERT'));
    t.ok(lines[0].includes('10:30:45.123'));
  });

  await t.test('emits events via event bus', async (t) => {
    const eventBus = new EventBus();
    const panel = new LiveStreamPanel({eventBus});

    let emittedEvent = null;
    eventBus.on('livestream:event', (data) => {
      emittedEvent = data;
    });

    panel.addEvent('INSERT', {id: 1}, 1000);

    t.ok(emittedEvent);
    t.equal(emittedEvent.eventType, 'INSERT');
  });
});
