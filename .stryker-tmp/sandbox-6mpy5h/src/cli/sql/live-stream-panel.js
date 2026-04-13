/**
 * LiveStreamPanel - Displays live query events in a streaming panel
 *
 * Shows INSERT, UPDATE, DELETE events with color coding and supports
 * scrolling through historical events.
 *
 * Requirements: 32.3, 32.4, 32.5, 32.12
 */
// @ts-nocheck


/**
 * Event type color mapping
 * Requirements: 32.5
 */function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
export const EVENT_COLORS = stryMutAct_9fa48("46609") ? {} : (stryCov_9fa48("46609"), {
  INSERT: stryMutAct_9fa48("46610") ? "" : (stryCov_9fa48("46610"), 'green'),
  UPDATE: stryMutAct_9fa48("46611") ? "" : (stryCov_9fa48("46611"), 'yellow'),
  DELETE: stryMutAct_9fa48("46612") ? "" : (stryCov_9fa48("46612"), 'red')
});

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
    if (stryMutAct_9fa48("46613")) {
      {}
    } else {
      stryCov_9fa48("46613");
      this.screen = stryMutAct_9fa48("46616") ? options.screen && null : stryMutAct_9fa48("46615") ? false : stryMutAct_9fa48("46614") ? true : (stryCov_9fa48("46614", "46615", "46616"), options.screen || null);
      this.eventBus = stryMutAct_9fa48("46619") ? options.eventBus && null : stryMutAct_9fa48("46618") ? false : stryMutAct_9fa48("46617") ? true : (stryCov_9fa48("46617", "46618", "46619"), options.eventBus || null);

      /** @type {LiveStreamEvent[]} */
      this.events = stryMutAct_9fa48("46620") ? ["Stryker was here"] : (stryCov_9fa48("46620"), []);

      /** @type {number} */
      this.maxEvents = stryMutAct_9fa48("46623") ? options.maxEvents && 1000 : stryMutAct_9fa48("46622") ? false : stryMutAct_9fa48("46621") ? true : (stryCov_9fa48("46621", "46622", "46623"), options.maxEvents || 1000);

      /** @type {number} */
      this.visibleHeight = stryMutAct_9fa48("46626") ? options.visibleHeight && 10 : stryMutAct_9fa48("46625") ? false : stryMutAct_9fa48("46624") ? true : (stryCov_9fa48("46624", "46625", "46626"), options.visibleHeight || 10);

      /** @type {number} */
      this.scrollPosition = 0;

      /** @type {Object|null} */
      this.widget = null;
    }
  }

  /**
   * Add an event to the stream
   * Requirements: 32.3, 32.4
   * @param {'INSERT'|'UPDATE'|'DELETE'} eventType - Event type
   * @param {Object} data - Row data
   * @param {number} [timestamp] - Event timestamp (defaults to now)
   */
  addEvent(eventType, data, timestamp = Date.now()) {
    if (stryMutAct_9fa48("46627")) {
      {}
    } else {
      stryCov_9fa48("46627");
      const event = stryMutAct_9fa48("46628") ? {} : (stryCov_9fa48("46628"), {
        eventType,
        data,
        timestamp
      });
      this.events.push(event);

      // Trim events if exceeding max
      if (stryMutAct_9fa48("46632") ? this.events.length <= this.maxEvents : stryMutAct_9fa48("46631") ? this.events.length >= this.maxEvents : stryMutAct_9fa48("46630") ? false : stryMutAct_9fa48("46629") ? true : (stryCov_9fa48("46629", "46630", "46631", "46632"), this.events.length > this.maxEvents)) {
        if (stryMutAct_9fa48("46633")) {
          {}
        } else {
          stryCov_9fa48("46633");
          this.events.shift();
          // Adjust scroll position if needed
          if (stryMutAct_9fa48("46637") ? this.scrollPosition <= 0 : stryMutAct_9fa48("46636") ? this.scrollPosition >= 0 : stryMutAct_9fa48("46635") ? false : stryMutAct_9fa48("46634") ? true : (stryCov_9fa48("46634", "46635", "46636", "46637"), this.scrollPosition > 0)) {
            if (stryMutAct_9fa48("46638")) {
              {}
            } else {
              stryCov_9fa48("46638");
              this.scrollPosition = stryMutAct_9fa48("46639") ? Math.min(0, this.scrollPosition - 1) : (stryCov_9fa48("46639"), Math.max(0, stryMutAct_9fa48("46640") ? this.scrollPosition + 1 : (stryCov_9fa48("46640"), this.scrollPosition - 1)));
            }
          }
        }
      }
      this.emitEvent(stryMutAct_9fa48("46641") ? "" : (stryCov_9fa48("46641"), 'livestream:event'), event);
      this.render();
    }
  }

  /**
   * Get the color for an event type
   * Requirements: 32.5
   * @param {'INSERT'|'UPDATE'|'DELETE'} eventType - Event type
   * @return {string} Color name
   */
  getEventColor(eventType) {
    if (stryMutAct_9fa48("46642")) {
      {}
    } else {
      stryCov_9fa48("46642");
      return Object.hasOwn(EVENT_COLORS, eventType) ? EVENT_COLORS[eventType] : stryMutAct_9fa48("46643") ? "" : (stryCov_9fa48("46643"), 'white');
    }
  }

  /**
   * Format an event for display
   * Requirements: 32.4
   * @param {LiveStreamEvent} event - Event to format
   * @return {string} Formatted event string
   */
  formatEvent(event) {
    if (stryMutAct_9fa48("46644")) {
      {}
    } else {
      stryCov_9fa48("46644");
      const time = stryMutAct_9fa48("46645") ? new Date(event.timestamp).toISOString() : (stryCov_9fa48("46645"), new Date(event.timestamp).toISOString().substring(11, 23));
      const color = this.getEventColor(event.eventType);
      const dataStr = this.formatEventData(event.data);
      return stryMutAct_9fa48("46646") ? `` : (stryCov_9fa48("46646"), `{${color}-fg}${time} ${event.eventType.padEnd(6)}{/} ${dataStr}`);
    }
  }

  /**
   * Format event data for display
   * @param {Object} data - Event data
   * @return {string} Formatted data string
   */
  formatEventData(data) {
    if (stryMutAct_9fa48("46647")) {
      {}
    } else {
      stryCov_9fa48("46647");
      try {
        if (stryMutAct_9fa48("46648")) {
          {}
        } else {
          stryCov_9fa48("46648");
          const str = JSON.stringify(data);
          // Truncate if too long
          if (stryMutAct_9fa48("46652") ? str.length <= 80 : stryMutAct_9fa48("46651") ? str.length >= 80 : stryMutAct_9fa48("46650") ? false : stryMutAct_9fa48("46649") ? true : (stryCov_9fa48("46649", "46650", "46651", "46652"), str.length > 80)) {
            if (stryMutAct_9fa48("46653")) {
              {}
            } else {
              stryCov_9fa48("46653");
              return (stryMutAct_9fa48("46654") ? str : (stryCov_9fa48("46654"), str.substring(0, 77))) + (stryMutAct_9fa48("46655") ? "" : (stryCov_9fa48("46655"), '...'));
            }
          }
          return str;
        }
      } catch (_err) {
        if (stryMutAct_9fa48("46656")) {
          {}
        } else {
          stryCov_9fa48("46656");
          return stryMutAct_9fa48("46657") ? "" : (stryCov_9fa48("46657"), '[Invalid data]');
        }
      }
    }
  }

  /**
   * Get visible events based on scroll position
   * Requirements: 32.12
   * @return {LiveStreamEvent[]} Visible events
   */
  getVisibleEvents() {
    if (stryMutAct_9fa48("46658")) {
      {}
    } else {
      stryCov_9fa48("46658");
      const totalEvents = this.events.length;
      if (stryMutAct_9fa48("46661") ? totalEvents !== 0 : stryMutAct_9fa48("46660") ? false : stryMutAct_9fa48("46659") ? true : (stryCov_9fa48("46659", "46660", "46661"), totalEvents === 0)) {
        if (stryMutAct_9fa48("46662")) {
          {}
        } else {
          stryCov_9fa48("46662");
          return stryMutAct_9fa48("46663") ? ["Stryker was here"] : (stryCov_9fa48("46663"), []);
        }
      }

      // Calculate start and end indices
      // scrollPosition 0 = show most recent events (bottom of list)
      // scrollPosition > 0 = scroll up to see older events
      const end = stryMutAct_9fa48("46664") ? Math.min(0, totalEvents - this.scrollPosition) : (stryCov_9fa48("46664"), Math.max(0, stryMutAct_9fa48("46665") ? totalEvents + this.scrollPosition : (stryCov_9fa48("46665"), totalEvents - this.scrollPosition)));
      const start = stryMutAct_9fa48("46666") ? Math.min(0, end - this.visibleHeight) : (stryCov_9fa48("46666"), Math.max(0, stryMutAct_9fa48("46667") ? end + this.visibleHeight : (stryCov_9fa48("46667"), end - this.visibleHeight)));
      return stryMutAct_9fa48("46668") ? this.events : (stryCov_9fa48("46668"), this.events.slice(start, end));
    }
  }

  /**
   * Scroll up to see older events
   * Requirements: 32.12
   * @return {boolean} True if scrolled
   */
  scrollUp() {
    if (stryMutAct_9fa48("46669")) {
      {}
    } else {
      stryCov_9fa48("46669");
      const maxScroll = stryMutAct_9fa48("46670") ? Math.min(0, this.events.length - this.visibleHeight) : (stryCov_9fa48("46670"), Math.max(0, stryMutAct_9fa48("46671") ? this.events.length + this.visibleHeight : (stryCov_9fa48("46671"), this.events.length - this.visibleHeight)));
      if (stryMutAct_9fa48("46675") ? this.scrollPosition >= maxScroll : stryMutAct_9fa48("46674") ? this.scrollPosition <= maxScroll : stryMutAct_9fa48("46673") ? false : stryMutAct_9fa48("46672") ? true : (stryCov_9fa48("46672", "46673", "46674", "46675"), this.scrollPosition < maxScroll)) {
        if (stryMutAct_9fa48("46676")) {
          {}
        } else {
          stryCov_9fa48("46676");
          stryMutAct_9fa48("46677") ? this.scrollPosition-- : (stryCov_9fa48("46677"), this.scrollPosition++);
          this.emitEvent(stryMutAct_9fa48("46678") ? "" : (stryCov_9fa48("46678"), 'livestream:scroll'), stryMutAct_9fa48("46679") ? {} : (stryCov_9fa48("46679"), {
            position: this.scrollPosition
          }));
          this.render();
          return stryMutAct_9fa48("46680") ? false : (stryCov_9fa48("46680"), true);
        }
      }
      return stryMutAct_9fa48("46681") ? true : (stryCov_9fa48("46681"), false);
    }
  }

  /**
   * Scroll down to see newer events
   * Requirements: 32.12
   * @return {boolean} True if scrolled
   */
  scrollDown() {
    if (stryMutAct_9fa48("46682")) {
      {}
    } else {
      stryCov_9fa48("46682");
      if (stryMutAct_9fa48("46686") ? this.scrollPosition <= 0 : stryMutAct_9fa48("46685") ? this.scrollPosition >= 0 : stryMutAct_9fa48("46684") ? false : stryMutAct_9fa48("46683") ? true : (stryCov_9fa48("46683", "46684", "46685", "46686"), this.scrollPosition > 0)) {
        if (stryMutAct_9fa48("46687")) {
          {}
        } else {
          stryCov_9fa48("46687");
          stryMutAct_9fa48("46688") ? this.scrollPosition++ : (stryCov_9fa48("46688"), this.scrollPosition--);
          this.emitEvent(stryMutAct_9fa48("46689") ? "" : (stryCov_9fa48("46689"), 'livestream:scroll'), stryMutAct_9fa48("46690") ? {} : (stryCov_9fa48("46690"), {
            position: this.scrollPosition
          }));
          this.render();
          return stryMutAct_9fa48("46691") ? false : (stryCov_9fa48("46691"), true);
        }
      }
      return stryMutAct_9fa48("46692") ? true : (stryCov_9fa48("46692"), false);
    }
  }

  /**
   * Scroll to the bottom (most recent events)
   * @return {boolean} True if scrolled
   */
  scrollToBottom() {
    if (stryMutAct_9fa48("46693")) {
      {}
    } else {
      stryCov_9fa48("46693");
      if (stryMutAct_9fa48("46696") ? this.scrollPosition === 0 : stryMutAct_9fa48("46695") ? false : stryMutAct_9fa48("46694") ? true : (stryCov_9fa48("46694", "46695", "46696"), this.scrollPosition !== 0)) {
        if (stryMutAct_9fa48("46697")) {
          {}
        } else {
          stryCov_9fa48("46697");
          this.scrollPosition = 0;
          this.emitEvent(stryMutAct_9fa48("46698") ? "" : (stryCov_9fa48("46698"), 'livestream:scroll'), stryMutAct_9fa48("46699") ? {} : (stryCov_9fa48("46699"), {
            position: this.scrollPosition
          }));
          this.render();
          return stryMutAct_9fa48("46700") ? false : (stryCov_9fa48("46700"), true);
        }
      }
      return stryMutAct_9fa48("46701") ? true : (stryCov_9fa48("46701"), false);
    }
  }

  /**
   * Scroll to the top (oldest events)
   * @return {boolean} True if scrolled
   */
  scrollToTop() {
    if (stryMutAct_9fa48("46702")) {
      {}
    } else {
      stryCov_9fa48("46702");
      const maxScroll = stryMutAct_9fa48("46703") ? Math.min(0, this.events.length - this.visibleHeight) : (stryCov_9fa48("46703"), Math.max(0, stryMutAct_9fa48("46704") ? this.events.length + this.visibleHeight : (stryCov_9fa48("46704"), this.events.length - this.visibleHeight)));
      if (stryMutAct_9fa48("46707") ? this.scrollPosition === maxScroll : stryMutAct_9fa48("46706") ? false : stryMutAct_9fa48("46705") ? true : (stryCov_9fa48("46705", "46706", "46707"), this.scrollPosition !== maxScroll)) {
        if (stryMutAct_9fa48("46708")) {
          {}
        } else {
          stryCov_9fa48("46708");
          this.scrollPosition = maxScroll;
          this.emitEvent(stryMutAct_9fa48("46709") ? "" : (stryCov_9fa48("46709"), 'livestream:scroll'), stryMutAct_9fa48("46710") ? {} : (stryCov_9fa48("46710"), {
            position: this.scrollPosition
          }));
          this.render();
          return stryMutAct_9fa48("46711") ? false : (stryCov_9fa48("46711"), true);
        }
      }
      return stryMutAct_9fa48("46712") ? true : (stryCov_9fa48("46712"), false);
    }
  }

  /**
   * Get the current scroll position
   * @return {number} Scroll position
   */
  getScrollPosition() {
    if (stryMutAct_9fa48("46713")) {
      {}
    } else {
      stryCov_9fa48("46713");
      return this.scrollPosition;
    }
  }

  /**
   * Get the maximum scroll position
   * @return {number} Maximum scroll position
   */
  getMaxScrollPosition() {
    if (stryMutAct_9fa48("46714")) {
      {}
    } else {
      stryCov_9fa48("46714");
      return stryMutAct_9fa48("46715") ? Math.min(0, this.events.length - this.visibleHeight) : (stryCov_9fa48("46715"), Math.max(0, stryMutAct_9fa48("46716") ? this.events.length + this.visibleHeight : (stryCov_9fa48("46716"), this.events.length - this.visibleHeight)));
    }
  }

  /**
   * Check if scrolled to bottom
   * @return {boolean} True if at bottom
   */
  isAtBottom() {
    if (stryMutAct_9fa48("46717")) {
      {}
    } else {
      stryCov_9fa48("46717");
      return stryMutAct_9fa48("46720") ? this.scrollPosition !== 0 : stryMutAct_9fa48("46719") ? false : stryMutAct_9fa48("46718") ? true : (stryCov_9fa48("46718", "46719", "46720"), this.scrollPosition === 0);
    }
  }

  /**
   * Check if scrolled to top
   * @return {boolean} True if at top
   */
  isAtTop() {
    if (stryMutAct_9fa48("46721")) {
      {}
    } else {
      stryCov_9fa48("46721");
      return stryMutAct_9fa48("46725") ? this.scrollPosition < this.getMaxScrollPosition() : stryMutAct_9fa48("46724") ? this.scrollPosition > this.getMaxScrollPosition() : stryMutAct_9fa48("46723") ? false : stryMutAct_9fa48("46722") ? true : (stryCov_9fa48("46722", "46723", "46724", "46725"), this.scrollPosition >= this.getMaxScrollPosition());
    }
  }

  /**
   * Get total event count
   * @return {number} Event count
   */
  getEventCount() {
    if (stryMutAct_9fa48("46726")) {
      {}
    } else {
      stryCov_9fa48("46726");
      return this.events.length;
    }
  }

  /**
   * Get all events
   * @return {LiveStreamEvent[]} All events
   */
  getAllEvents() {
    if (stryMutAct_9fa48("46727")) {
      {}
    } else {
      stryCov_9fa48("46727");
      return stryMutAct_9fa48("46728") ? [] : (stryCov_9fa48("46728"), [...this.events]);
    }
  }

  /**
   * Clear all events
   */
  clear() {
    if (stryMutAct_9fa48("46729")) {
      {}
    } else {
      stryCov_9fa48("46729");
      this.events = stryMutAct_9fa48("46730") ? ["Stryker was here"] : (stryCov_9fa48("46730"), []);
      this.scrollPosition = 0;
      this.emitEvent(stryMutAct_9fa48("46731") ? "" : (stryCov_9fa48("46731"), 'livestream:cleared'), {});
      this.render();
    }
  }

  /**
   * Set the visible height
   * @param {number} height - Visible height in rows
   */
  setVisibleHeight(height) {
    if (stryMutAct_9fa48("46732")) {
      {}
    } else {
      stryCov_9fa48("46732");
      this.visibleHeight = stryMutAct_9fa48("46733") ? Math.min(1, height) : (stryCov_9fa48("46733"), Math.max(1, height));
      // Adjust scroll position if needed
      const maxScroll = this.getMaxScrollPosition();
      if (stryMutAct_9fa48("46737") ? this.scrollPosition <= maxScroll : stryMutAct_9fa48("46736") ? this.scrollPosition >= maxScroll : stryMutAct_9fa48("46735") ? false : stryMutAct_9fa48("46734") ? true : (stryCov_9fa48("46734", "46735", "46736", "46737"), this.scrollPosition > maxScroll)) {
        if (stryMutAct_9fa48("46738")) {
          {}
        } else {
          stryCov_9fa48("46738");
          this.scrollPosition = maxScroll;
        }
      }
      this.render();
    }
  }

  /**
   * Get the visible height
   * @return {number} Visible height
   */
  getVisibleHeight() {
    if (stryMutAct_9fa48("46739")) {
      {}
    } else {
      stryCov_9fa48("46739");
      return this.visibleHeight;
    }
  }

  /**
   * Render the panel
   */
  render() {
    if (stryMutAct_9fa48("46740")) {
      {}
    } else {
      stryCov_9fa48("46740");
      if (stryMutAct_9fa48("46743") ? false : stryMutAct_9fa48("46742") ? true : stryMutAct_9fa48("46741") ? this.widget : (stryCov_9fa48("46741", "46742", "46743"), !this.widget)) {
        if (stryMutAct_9fa48("46744")) {
          {}
        } else {
          stryCov_9fa48("46744");
          return;
        }
      }
      const visibleEvents = this.getVisibleEvents();
      const lines = visibleEvents.map(stryMutAct_9fa48("46745") ? () => undefined : (stryCov_9fa48("46745"), event => this.formatEvent(event)));
      this.widget.setContent(lines.join(stryMutAct_9fa48("46746") ? "" : (stryCov_9fa48("46746"), '\n')));
      if (stryMutAct_9fa48("46748") ? false : stryMutAct_9fa48("46747") ? true : (stryCov_9fa48("46747", "46748"), this.screen)) {
        if (stryMutAct_9fa48("46749")) {
          {}
        } else {
          stryCov_9fa48("46749");
          this.screen.render();
        }
      }
    }
  }

  /**
   * Set the widget for rendering
   * @param {Object} widget - Blessed widget
   */
  setWidget(widget) {
    if (stryMutAct_9fa48("46750")) {
      {}
    } else {
      stryCov_9fa48("46750");
      this.widget = widget;
    }
  }

  /**
   * Get the widget
   * @return {Object|null} Widget
   */
  getWidget() {
    if (stryMutAct_9fa48("46751")) {
      {}
    } else {
      stryCov_9fa48("46751");
      return this.widget;
    }
  }

  /**
   * Emit an event via the event bus
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  emitEvent(event, data = {}) {
    if (stryMutAct_9fa48("46752")) {
      {}
    } else {
      stryCov_9fa48("46752");
      if (stryMutAct_9fa48("46754") ? false : stryMutAct_9fa48("46753") ? true : (stryCov_9fa48("46753", "46754"), this.eventBus)) {
        if (stryMutAct_9fa48("46755")) {
          {}
        } else {
          stryCov_9fa48("46755");
          this.eventBus.emit(event, data);
        }
      }
    }
  }

  /**
   * Get formatted lines for display (without widget)
   * @return {string[]} Formatted lines
   */
  getFormattedLines() {
    if (stryMutAct_9fa48("46756")) {
      {}
    } else {
      stryCov_9fa48("46756");
      const visibleEvents = this.getVisibleEvents();
      return visibleEvents.map(stryMutAct_9fa48("46757") ? () => undefined : (stryCov_9fa48("46757"), event => this.formatEvent(event)));
    }
  }

  /**
   * Get plain text lines (without color codes)
   * @return {string[]} Plain text lines
   */
  getPlainTextLines() {
    if (stryMutAct_9fa48("46758")) {
      {}
    } else {
      stryCov_9fa48("46758");
      const visibleEvents = this.getVisibleEvents();
      return visibleEvents.map(event => {
        if (stryMutAct_9fa48("46759")) {
          {}
        } else {
          stryCov_9fa48("46759");
          const time = stryMutAct_9fa48("46760") ? new Date(event.timestamp).toISOString() : (stryCov_9fa48("46760"), new Date(event.timestamp).toISOString().substring(11, 23));
          const dataStr = this.formatEventData(event.data);
          return stryMutAct_9fa48("46761") ? `` : (stryCov_9fa48("46761"), `${time} ${event.eventType.padEnd(6)} ${dataStr}`);
        }
      });
    }
  }
}