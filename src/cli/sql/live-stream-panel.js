/**
 * LiveStreamPanel - Displays live query events in a streaming panel
 *
 * Shows INSERT, UPDATE, DELETE events with color coding and supports
 * scrolling through historical events.
 *
 * Requirements: 32.3, 32.4, 32.5, 32.12
 */

/**
 * Event type color mapping
 * Requirements: 32.5
 */
export const EVENT_COLORS = {
  INSERT: 'green',
  UPDATE: 'yellow',
  DELETE: 'red',
};

/**
 * @typedef {Object} LiveStreamEvent
 * @property {'INSERT'|'UPDATE'|'DELETE'} eventType - Type of change
 * @property {Object} data - Row data
 * @property {number} timestamp - Event timestamp
 */

export class LiveStreamPanel {
  /**
   * Creates a new LiveStreamPanel
   * @param {Object} [options] - Panel options
   * @param {Object} [options.screen] - Blessed screen instance
   * @param {number} [options.maxEvents=1000] - Maximum events to keep
   * @param {number} [options.visibleHeight=10] - Visible height in rows
   * @param {import('../core/event-bus.js').EventBus} [options.eventBus] - Event bus
   */
  constructor(options = {}) {
    this.screen = options.screen || null;
    this.eventBus = options.eventBus || null;

    /** @type {LiveStreamEvent[]} */
    this.events = [];

    /** @type {number} */
    this.maxEvents = options.maxEvents || 1000;

    /** @type {number} */
    this.visibleHeight = options.visibleHeight || 10;

    /** @type {number} */
    this.scrollPosition = 0;

    /** @type {Object|null} */
    this.widget = null;
  }

  /**
   * Add an event to the stream
   * Requirements: 32.3, 32.4
   * @param {'INSERT'|'UPDATE'|'DELETE'} eventType - Event type
   * @param {Object} data - Row data
   * @param {number} [timestamp] - Event timestamp (defaults to now)
   */
  addEvent(eventType, data, timestamp = Date.now()) {
    const event = {eventType, data, timestamp};
    this.events.push(event);

    // Trim events if exceeding max
    if (this.events.length > this.maxEvents) {
      this.events.shift();
      // Adjust scroll position if needed
      if (this.scrollPosition > 0) {
        this.scrollPosition = Math.max(0, this.scrollPosition - 1);
      }
    }

    this.emitEvent('livestream:event', event);
    this.render();
  }

  /**
   * Get the color for an event type
   * Requirements: 32.5
   * @param {'INSERT'|'UPDATE'|'DELETE'} eventType - Event type
   * @return {string} Color name
   */
  getEventColor(eventType) {
    return Object.hasOwn(EVENT_COLORS, eventType) ?
      EVENT_COLORS[eventType] : 'white';
  }

  /**
   * Format an event for display
   * Requirements: 32.4
   * @param {LiveStreamEvent} event - Event to format
   * @return {string} Formatted event string
   */
  formatEvent(event) {
    const time = new Date(event.timestamp).toISOString().substring(11, 23);
    const color = this.getEventColor(event.eventType);
    const dataStr = this.formatEventData(event.data);

    return `{${color}-fg}${time} ${event.eventType.padEnd(6)}{/} ${dataStr}`;
  }

  /**
   * Format event data for display
   * @param {Object} data - Event data
   * @return {string} Formatted data string
   */
  formatEventData(data) {
    try {
      const str = JSON.stringify(data);
      // Truncate if too long
      if (str.length > 80) {
        return str.substring(0, 77) + '...';
      }
      return str;
    } catch (_err) {
      return '[Invalid data]';
    }
  }

  /**
   * Get visible events based on scroll position
   * Requirements: 32.12
   * @return {LiveStreamEvent[]} Visible events
   */
  getVisibleEvents() {
    const totalEvents = this.events.length;

    if (totalEvents === 0) {
      return [];
    }

    // Calculate start and end indices
    // scrollPosition 0 = show most recent events (bottom of list)
    // scrollPosition > 0 = scroll up to see older events
    const end = Math.max(0, totalEvents - this.scrollPosition);
    const start = Math.max(0, end - this.visibleHeight);

    return this.events.slice(start, end);
  }

  /**
   * Scroll up to see older events
   * Requirements: 32.12
   * @return {boolean} True if scrolled
   */
  scrollUp() {
    const maxScroll = Math.max(0, this.events.length - this.visibleHeight);

    if (this.scrollPosition < maxScroll) {
      this.scrollPosition++;
      this.emitEvent('livestream:scroll', {position: this.scrollPosition});
      this.render();
      return true;
    }

    return false;
  }

  /**
   * Scroll down to see newer events
   * Requirements: 32.12
   * @return {boolean} True if scrolled
   */
  scrollDown() {
    if (this.scrollPosition > 0) {
      this.scrollPosition--;
      this.emitEvent('livestream:scroll', {position: this.scrollPosition});
      this.render();
      return true;
    }

    return false;
  }

  /**
   * Scroll to the bottom (most recent events)
   * @return {boolean} True if scrolled
   */
  scrollToBottom() {
    if (this.scrollPosition !== 0) {
      this.scrollPosition = 0;
      this.emitEvent('livestream:scroll', {position: this.scrollPosition});
      this.render();
      return true;
    }

    return false;
  }

  /**
   * Scroll to the top (oldest events)
   * @return {boolean} True if scrolled
   */
  scrollToTop() {
    const maxScroll = Math.max(0, this.events.length - this.visibleHeight);

    if (this.scrollPosition !== maxScroll) {
      this.scrollPosition = maxScroll;
      this.emitEvent('livestream:scroll', {position: this.scrollPosition});
      this.render();
      return true;
    }

    return false;
  }

  /**
   * Get the current scroll position
   * @return {number} Scroll position
   */
  getScrollPosition() {
    return this.scrollPosition;
  }

  /**
   * Get the maximum scroll position
   * @return {number} Maximum scroll position
   */
  getMaxScrollPosition() {
    return Math.max(0, this.events.length - this.visibleHeight);
  }

  /**
   * Check if scrolled to bottom
   * @return {boolean} True if at bottom
   */
  isAtBottom() {
    return this.scrollPosition === 0;
  }

  /**
   * Check if scrolled to top
   * @return {boolean} True if at top
   */
  isAtTop() {
    return this.scrollPosition >= this.getMaxScrollPosition();
  }

  /**
   * Get total event count
   * @return {number} Event count
   */
  getEventCount() {
    return this.events.length;
  }

  /**
   * Get all events
   * @return {LiveStreamEvent[]} All events
   */
  getAllEvents() {
    return [...this.events];
  }

  /**
   * Clear all events
   */
  clear() {
    this.events = [];
    this.scrollPosition = 0;
    this.emitEvent('livestream:cleared', {});
    this.render();
  }

  /**
   * Set the visible height
   * @param {number} height - Visible height in rows
   */
  setVisibleHeight(height) {
    this.visibleHeight = Math.max(1, height);
    // Adjust scroll position if needed
    const maxScroll = this.getMaxScrollPosition();
    if (this.scrollPosition > maxScroll) {
      this.scrollPosition = maxScroll;
    }
    this.render();
  }

  /**
   * Get the visible height
   * @return {number} Visible height
   */
  getVisibleHeight() {
    return this.visibleHeight;
  }

  /**
   * Render the panel
   */
  render() {
    if (!this.widget) {
      return;
    }

    const visibleEvents = this.getVisibleEvents();
    const lines = visibleEvents.map((event) => this.formatEvent(event));

    this.widget.setContent(lines.join('\n'));

    if (this.screen) {
      this.screen.render();
    }
  }

  /**
   * Set the widget for rendering
   * @param {Object} widget - Blessed widget
   */
  setWidget(widget) {
    this.widget = widget;
  }

  /**
   * Get the widget
   * @return {Object|null} Widget
   */
  getWidget() {
    return this.widget;
  }

  /**
   * Emit an event via the event bus
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  emitEvent(event, data = {}) {
    if (this.eventBus) {
      this.eventBus.emit(event, data);
    }
  }

  /**
   * Get formatted lines for display (without widget)
   * @return {string[]} Formatted lines
   */
  getFormattedLines() {
    const visibleEvents = this.getVisibleEvents();
    return visibleEvents.map((event) => this.formatEvent(event));
  }

  /**
   * Get plain text lines (without color codes)
   * @return {string[]} Plain text lines
   */
  getPlainTextLines() {
    const visibleEvents = this.getVisibleEvents();
    return visibleEvents.map((event) => {
      const time = new Date(event.timestamp).toISOString().substring(11, 23);
      const dataStr = this.formatEventData(event.data);
      return `${time} ${event.eventType.padEnd(6)} ${dataStr}`;
    });
  }
}
