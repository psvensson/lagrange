/**
 * Tests for DetailPanel component
 *
 * Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6
 */
// @ts-nocheck


import {test} from '../../../src/test-helpers/tap.js';
import {DetailPanel, PANEL_POSITION} from '../../../src/cli/core/detail-panel.js';
import {EventBus} from '../../../src/cli/core/event-bus.js';

test('DetailPanel', async (t) => {
  t.test('constructor initializes with defaults', async (t) => {
    const panel = new DetailPanel();

    t.equal(panel.visible, false);
    t.equal(panel.position, PANEL_POSITION.SIDE);
    t.equal(panel.detailData, null);
    t.equal(panel.scrollOffset, 0);
    t.same(panel.renderedLines, []);
  });

  t.test('constructor accepts options', async (t) => {
    const eventBus = new EventBus();
    const panel = new DetailPanel({
      eventBus,
      position: PANEL_POSITION.BOTTOM,
      maxHeight: 20,
      maxWidth: 80,
    });

    t.equal(panel.position, PANEL_POSITION.BOTTOM);
    t.equal(panel.maxHeight, 20);
    t.equal(panel.maxWidth, 80);
    t.equal(panel.eventBus, eventBus);
  });

  t.test('show and hide toggle visibility', async (t) => {
    const panel = new DetailPanel();

    t.equal(panel.isVisible(), false);

    panel.show();
    t.equal(panel.isVisible(), true);

    panel.hide();
    t.equal(panel.isVisible(), false);
  });

  t.test('toggle switches visibility', async (t) => {
    const panel = new DetailPanel();

    t.equal(panel.isVisible(), false);

    panel.toggle();
    t.equal(panel.isVisible(), true);

    panel.toggle();
    t.equal(panel.isVisible(), false);
  });

  t.test('setDetailData stores data and renders content', async (t) => {
    const panel = new DetailPanel();

    const detailData = {
      title: 'Test Entity',
      sections: [
        {
          title: 'Section 1',
          fields: [
            {label: 'Field 1', value: 'Value 1'},
            {label: 'Field 2', value: 'Value 2'},
          ],
        },
      ],
    };

    panel.setDetailData(detailData);

    t.equal(panel.detailData, detailData);
    t.ok(panel.renderedLines.length > 0);
    t.equal(panel.scrollOffset, 0);
  });

  t.test('clearDetailData clears data and lines', async (t) => {
    const panel = new DetailPanel();

    panel.setDetailData({
      title: 'Test',
      sections: [{title: 'S1', fields: [{label: 'L', value: 'V'}]}],
    });

    t.ok(panel.detailData !== null);
    t.ok(panel.renderedLines.length > 0);

    panel.clearDetailData();

    t.equal(panel.detailData, null);
    t.same(panel.renderedLines, []);
    t.equal(panel.scrollOffset, 0);
  });

  t.test('scrollUp decreases scroll offset', async (t) => {
    const panel = new DetailPanel({maxHeight: 5});

    // Create enough content to scroll
    const fields = [];
    for (let i = 0; i < 20; i++) {
      fields.push({label: `Field ${i}`, value: `Value ${i}`});
    }

    panel.setDetailData({
      title: 'Test',
      sections: [{title: 'Section', fields}],
    });

    // Scroll down first
    panel.scrollDown(10);
    t.ok(panel.scrollOffset > 0);

    const offsetBefore = panel.scrollOffset;
    panel.scrollUp(3);

    t.equal(panel.scrollOffset, offsetBefore - 3);
  });

  t.test('scrollUp does not go below 0', async (t) => {
    const panel = new DetailPanel();

    panel.setDetailData({
      title: 'Test',
      sections: [{title: 'S', fields: [{label: 'L', value: 'V'}]}],
    });

    panel.scrollUp(100);
    t.equal(panel.scrollOffset, 0);
  });

  t.test('scrollDown increases scroll offset', async (t) => {
    const panel = new DetailPanel({maxHeight: 5});

    const fields = [];
    for (let i = 0; i < 20; i++) {
      fields.push({label: `Field ${i}`, value: `Value ${i}`});
    }

    panel.setDetailData({
      title: 'Test',
      sections: [{title: 'Section', fields}],
    });

    t.equal(panel.scrollOffset, 0);

    panel.scrollDown(3);
    t.equal(panel.scrollOffset, 3);
  });

  t.test('scrollDown does not exceed max scroll', async (t) => {
    const panel = new DetailPanel({maxHeight: 5});

    const fields = [];
    for (let i = 0; i < 10; i++) {
      fields.push({label: `Field ${i}`, value: `Value ${i}`});
    }

    panel.setDetailData({
      title: 'Test',
      sections: [{title: 'Section', fields}],
    });

    const maxScroll = Math.max(0, panel.renderedLines.length - panel.maxHeight);

    panel.scrollDown(1000);
    t.equal(panel.scrollOffset, maxScroll);
  });

  t.test('scrollToTop sets offset to 0', async (t) => {
    const panel = new DetailPanel({maxHeight: 5});

    const fields = [];
    for (let i = 0; i < 20; i++) {
      fields.push({label: `Field ${i}`, value: `Value ${i}`});
    }

    panel.setDetailData({
      title: 'Test',
      sections: [{title: 'Section', fields}],
    });

    panel.scrollDown(10);
    t.ok(panel.scrollOffset > 0);

    panel.scrollToTop();
    t.equal(panel.scrollOffset, 0);
  });

  t.test('scrollToBottom sets offset to max', async (t) => {
    const panel = new DetailPanel({maxHeight: 5});

    const fields = [];
    for (let i = 0; i < 20; i++) {
      fields.push({label: `Field ${i}`, value: `Value ${i}`});
    }

    panel.setDetailData({
      title: 'Test',
      sections: [{title: 'Section', fields}],
    });

    panel.scrollToBottom();

    const maxScroll = Math.max(0, panel.renderedLines.length - panel.maxHeight);
    t.equal(panel.scrollOffset, maxScroll);
  });

  t.test('getVisibleLines returns correct slice', async (t) => {
    const panel = new DetailPanel({maxHeight: 3});

    const fields = [];
    for (let i = 0; i < 10; i++) {
      fields.push({label: `Field ${i}`, value: `Value ${i}`});
    }

    panel.setDetailData({
      title: 'Test',
      sections: [{title: 'Section', fields}],
    });

    const visible = panel.getVisibleLines();
    t.equal(visible.length, 3);

    panel.scrollDown(2);
    const visible2 = panel.getVisibleLines();
    t.equal(visible2.length, 3);
    t.not(visible[0], visible2[0]);
  });

  t.test('render returns formatted output', async (t) => {
    const panel = new DetailPanel({maxHeight: 10});

    panel.setDetailData({
      title: 'Test Entity',
      sections: [
        {
          title: 'Info',
          fields: [
            {label: 'Name', value: 'Test'},
            {label: 'Status', value: 'Active'},
          ],
        },
      ],
    });

    panel.show();
    const output = panel.render();

    t.equal(output.visible, true);
    t.equal(output.position, PANEL_POSITION.SIDE);
    t.equal(output.title, 'Test Entity');
    t.ok(Array.isArray(output.lines));
    t.ok(output.lines.length > 0);
    t.equal(typeof output.canScrollUp, 'boolean');
    t.equal(typeof output.canScrollDown, 'boolean');
  });

  t.test('render with monochrome option', async (t) => {
    const panel = new DetailPanel();

    panel.setDetailData({
      title: 'Test',
      sections: [{title: 'S', fields: [{label: 'L', value: 'V'}]}],
    });

    const output = panel.render({monochrome: true});

    // All colors should be white in monochrome mode
    for (const line of output.lines) {
      if (line.color) {
        t.equal(line.color, 'white');
      }
      if (line.labelColor) {
        t.equal(line.labelColor, 'white');
      }
      if (line.valueColor) {
        t.equal(line.valueColor, 'white');
      }
    }
  });

  t.test('handleKey scrolls when visible', async (t) => {
    const panel = new DetailPanel({maxHeight: 5});

    const fields = [];
    for (let i = 0; i < 20; i++) {
      fields.push({label: `Field ${i}`, value: `Value ${i}`});
    }

    panel.setDetailData({
      title: 'Test',
      sections: [{title: 'Section', fields}],
    });

    panel.show();

    // Test scroll down
    const handled = panel.handleKey({name: 'down'});
    t.equal(handled, true);
    t.equal(panel.scrollOffset, 1);

    // Test scroll up
    panel.handleKey({name: 'up'});
    t.equal(panel.scrollOffset, 0);

    // Test page down
    panel.handleKey({name: 'pagedown'});
    t.ok(panel.scrollOffset > 0);

    // Test home
    panel.handleKey({name: 'home'});
    t.equal(panel.scrollOffset, 0);

    // Test end
    panel.handleKey({name: 'end'});
    const maxScroll = Math.max(0, panel.renderedLines.length - panel.maxHeight);
    t.equal(panel.scrollOffset, maxScroll);
  });

  t.test('handleKey returns false when not visible', async (t) => {
    const panel = new DetailPanel();

    panel.setDetailData({
      title: 'Test',
      sections: [{title: 'S', fields: [{label: 'L', value: 'V'}]}],
    });

    // Panel is not visible
    const handled = panel.handleKey({name: 'down'});
    t.equal(handled, false);
  });

  t.test('handleKey returns false for unhandled keys', async (t) => {
    const panel = new DetailPanel();
    panel.show();

    const handled = panel.handleKey({name: 'a'});
    t.equal(handled, false);
  });

  t.test('setPosition changes position', async (t) => {
    const panel = new DetailPanel();

    t.equal(panel.getPosition(), PANEL_POSITION.SIDE);

    panel.setPosition(PANEL_POSITION.BOTTOM);
    t.equal(panel.getPosition(), PANEL_POSITION.BOTTOM);

    panel.setPosition(PANEL_POSITION.OVERLAY);
    t.equal(panel.getPosition(), PANEL_POSITION.OVERLAY);
  });

  t.test('setPosition ignores invalid positions', async (t) => {
    const panel = new DetailPanel();

    panel.setPosition('invalid');
    t.equal(panel.getPosition(), PANEL_POSITION.SIDE);
  });

  t.test('getScrollInfo returns scroll information', async (t) => {
    const panel = new DetailPanel({maxHeight: 5});

    const fields = [];
    for (let i = 0; i < 20; i++) {
      fields.push({label: `Field ${i}`, value: `Value ${i}`});
    }

    panel.setDetailData({
      title: 'Test',
      sections: [{title: 'Section', fields}],
    });

    const info = panel.getScrollInfo();

    t.equal(info.offset, 0);
    t.ok(info.totalLines > 0);
    t.ok(info.visibleLines > 0);
    t.equal(typeof info.percentage, 'number');
  });

  t.test('handles multi-line field values', async (t) => {
    const panel = new DetailPanel();

    panel.setDetailData({
      title: 'Test',
      sections: [
        {
          title: 'Section',
          fields: [
            {label: 'Multi', value: 'Line 1\nLine 2\nLine 3'},
          ],
        },
      ],
    });

    // Should have separate lines for multi-line value
    const hasFieldLabel = panel.renderedLines.some((l) => l.type === 'fieldLabel');
    const hasFieldValueLine = panel.renderedLines.some(
      (l) => l.type === 'fieldValueLine',
    );

    t.ok(hasFieldLabel);
    t.ok(hasFieldValueLine);
  });

  t.test('handles related counts', async (t) => {
    const panel = new DetailPanel();

    panel.setDetailData({
      title: 'Test',
      sections: [{title: 'S', fields: [{label: 'L', value: 'V'}]}],
      relatedCounts: {
        Services: 5,
        Partitions: 10,
      },
    });

    // Should have related entities section
    const hasRelatedSection = panel.renderedLines.some(
      (l) => l.type === 'sectionHeader' && l.text === 'Related Entities',
    );

    t.ok(hasRelatedSection);
  });

  t.test('handles navigation links', async (t) => {
    const panel = new DetailPanel();

    panel.setDetailData({
      title: 'Test',
      sections: [{title: 'S', fields: [{label: 'L', value: 'V'}]}],
      navigationLinks: [
        {label: 'View Services', target: 'services', key: 's'},
      ],
    });

    // Should have navigation section
    const hasNavSection = panel.renderedLines.some(
      (l) => l.type === 'sectionHeader' && l.text === 'Quick Navigation',
    );

    t.ok(hasNavSection);

    // Should have link
    const hasLink = panel.renderedLines.some((l) => l.type === 'link');
    t.ok(hasLink);
  });

  t.test('truncates long values', async (t) => {
    const panel = new DetailPanel({maxWidth: 40});

    const longValue = 'A'.repeat(100);

    panel.setDetailData({
      title: 'Test',
      sections: [{title: 'S', fields: [{label: 'L', value: longValue}]}],
    });

    const output = panel.render();

    // Find the field line
    const fieldLine = output.lines.find((l) => l.type === 'field');
    if (fieldLine) {
      t.ok(fieldLine.value.length < longValue.length);
      t.ok(fieldLine.value.endsWith('...'));
    }
  });

  t.test('destroy cleans up state', async (t) => {
    const panel = new DetailPanel();

    panel.setDetailData({
      title: 'Test',
      sections: [{title: 'S', fields: [{label: 'L', value: 'V'}]}],
    });
    panel.show();

    panel.destroy();

    t.equal(panel.detailData, null);
    t.same(panel.renderedLines, []);
    t.equal(panel.visible, false);
  });

  t.test('responds to event bus events', async (t) => {
    const eventBus = new EventBus();
    const panel = new DetailPanel({eventBus});

    // Test detailUpdated event
    eventBus.emit('detailCoordinator:detailUpdated', {
      detailData: {
        title: 'Event Test',
        sections: [{title: 'S', fields: [{label: 'L', value: 'V'}]}],
      },
    });

    t.equal(panel.detailData.title, 'Event Test');

    // Test panelShown event
    eventBus.emit('detailCoordinator:panelShown', {});
    t.equal(panel.isVisible(), true);

    // Test panelHidden event
    eventBus.emit('detailCoordinator:panelHidden', {});
    t.equal(panel.isVisible(), false);

    // Test detailCleared event
    eventBus.emit('detailCoordinator:detailCleared', {});
    t.equal(panel.detailData, null);
  });
});
