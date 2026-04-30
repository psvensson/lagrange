const LOCAL_STR_SIDE = 'side';
const LOCAL_STR_BOTTOM = 'bottom';
const LOCAL_STR_OVERLAY = 'overlay';
const LOCAL_NUM_30 = 30;
const LOCAL_NUM_60 = 60;
const LOCAL_NUM_ZERO = 0;
const LOCAL_STR_1N3ZR = 'detailCoordinator:detailUpdated';
const LOCAL_STR_1I2PP = 'detailCoordinator:detailCleared';
const LOCAL_STR_1MVFP = 'detailCoordinator:panelShown';
const LOCAL_STR_1N52F = 'detailCoordinator:panelHidden';
const LOCAL_STR_DETAILPANEL_SHOWN = 'detailPanel:shown';
const LOCAL_STR_DETAILPANEL_HIDDEN = 'detailPanel:hidden';
const LOCAL_NUM_ONE = 1;
const LOCAL_NUM_TWO = 2;
const LOCAL_STR_BLANK = 'blank';
const LOCAL_STR_SECTIONHEADER = 'sectionHeader';
const LOCAL_STR_TITLE = 'title';
const LOCAL_STR_SEPARATOR = 'separator';
const LOCAL_STR_FIELD = 'field';
const LOCAL_STR_LINK = 'link';
const LOCAL_STR_NEWLINE = '\n';
const LOCAL_STR_FIELDLABEL = 'fieldLabel';
const LOCAL_STR_FIELDVALUELINE = 'fieldValueLine';
const LOCAL_STR_EMPTY = '';
const LOCAL_STR_1G31G = '─';
const LOCAL_STR_TEXT = 'text';
const LOCAL_NUM_THREE = 3;
const LOCAL_STR_2ZI04 = '...';
const LOCAL_STR_UP = 'up';
const LOCAL_STR_DOWN = 'down';
const LOCAL_STR_PAGEUP = 'pageup';
const LOCAL_STR_PAGEDOWN = 'pagedown';
const LOCAL_STR_HOME = 'home';
const LOCAL_STR_END = 'end';
const LOCAL_NUM_100 = 100;

/**
 * DetailPanel - Reusable detail panel component for displaying entity details
 *
 * Provides scrollable detail views with sections and fields.
 * Supports multiple layouts (side, bottom, overlay).
 *
 * Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6
 */

/**
 * Detail panel position types
 */
export const PANEL_POSITION = {
  SIDE: LOCAL_STR_SIDE,
  BOTTOM: LOCAL_STR_BOTTOM,
  OVERLAY: LOCAL_STR_OVERLAY,
};

const DETAIL_PANEL_SECTION_TITLE = Object.freeze({
  NAVIGATION: 'Quick Navigation',
  RELATED_ENTITIES: 'Related Entities',
});

/**
 * DetailPanel class for displaying entity details with scrolling support
 */
export class DetailPanel {
  /**
   * Creates a new DetailPanel
   * @param {Object} options - Panel options
   * @param {import('./event-bus.js').EventBus} [options.eventBus] - Event bus
   * @param {string} [options.position] - Panel position (side, bottom, overlay)
   * @param {number} [options.maxHeight] - Maximum height in lines
   * @param {number} [options.maxWidth] - Maximum width in characters
   */
  constructor(options = {}) {
    this.eventBus = options.eventBus || null;
    this.position = options.position || PANEL_POSITION.SIDE;
    this.maxHeight = options.maxHeight || LOCAL_NUM_30;
    this.maxWidth = options.maxWidth || LOCAL_NUM_60;

    // Panel state
    this.visible = false;
    this.detailData = null;
    this.scrollOffset = LOCAL_NUM_ZERO;
    this.renderedLines = [];

    // Setup event listeners
    this.setupEventListeners();
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    if (this.eventBus) {
      this.eventBus.on(LOCAL_STR_1N3ZR, (data) => {
        this.setDetailData(data.detailData);
      });

      this.eventBus.on(LOCAL_STR_1I2PP, () => {
        this.clearDetailData();
      });

      this.eventBus.on(LOCAL_STR_1MVFP, () => {
        this.show();
      });

      this.eventBus.on(LOCAL_STR_1N52F, () => {
        this.hide();
      });
    }
  }

  /**
   * Set the detail data to display
   * @param {Object|null} detailData - Detail data with title and sections
   */
  setDetailData(detailData) {
    this.detailData = detailData;
    this.scrollOffset = LOCAL_NUM_ZERO;
    this.renderContent();
  }

  /**
   * Clear the detail data
   */
  clearDetailData() {
    this.detailData = null;
    this.scrollOffset = LOCAL_NUM_ZERO;
    this.renderedLines = [];
  }

  /**
   * Show the panel
   */
  show() {
    this.visible = true;
    if (this.eventBus) {
      this.eventBus.emit(LOCAL_STR_DETAILPANEL_SHOWN, {position: this.position});
    }
  }

  /**
   * Hide the panel
   */
  hide() {
    this.visible = false;
    if (this.eventBus) {
      this.eventBus.emit(LOCAL_STR_DETAILPANEL_HIDDEN, {});
    }
  }

  /**
   * Toggle panel visibility
   */
  toggle() {
    if (this.visible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Check if panel is visible
   * @return {boolean}
   */
  isVisible() {
    return this.visible;
  }

  /**
   * Set panel position
   * @param {string} position - Panel position
   */
  setPosition(position) {
    if (Object.values(PANEL_POSITION).includes(position)) {
      this.position = position;
    }
  }

  /**
   * Get panel position
   * @return {string}
   */
  getPosition() {
    return this.position;
  }

  /**
   * Scroll up in the detail panel
   * Requirements: 16.4
   * @param {number} [lines=1] - Number of lines to scroll
   */
  scrollUp(lines = LOCAL_NUM_ONE) {
    this.scrollOffset = Math.max(LOCAL_NUM_ZERO, this.scrollOffset - lines);
  }

  /**
   * Scroll down in the detail panel
   * Requirements: 16.4
   * @param {number} [lines=1] - Number of lines to scroll
   */
  scrollDown(lines = LOCAL_NUM_ONE) {
    const maxScroll = Math.max(0, this.renderedLines.length - this.maxHeight);
    this.scrollOffset = Math.min(maxScroll, this.scrollOffset + lines);
  }

  /**
   * Scroll to top
   */
  scrollToTop() {
    this.scrollOffset = LOCAL_NUM_ZERO;
  }

  /**
   * Scroll to bottom
   */
  scrollToBottom() {
    const maxScroll = Math.max(0, this.renderedLines.length - this.maxHeight);
    this.scrollOffset = maxScroll;
  }

  /**
   * Page up in the detail panel
   */
  pageUp() {
    this.scrollUp(this.maxHeight - LOCAL_NUM_TWO);
  }

  /**
   * Page down in the detail panel
   */
  pageDown() {
    this.scrollDown(this.maxHeight - LOCAL_NUM_TWO);
  }

  addSectionHeader(title, options = {}) {
    if (options.leadingBlank === true) {
      this.renderedLines.push({type: LOCAL_STR_BLANK});
    }
    this.renderedLines.push({
      type: LOCAL_STR_SECTIONHEADER,
      text: title,
    });
  }

  renderTitleBlock() {
    if (!this.detailData?.title) {
      return;
    }

    this.renderedLines.push({
      type: LOCAL_STR_TITLE,
      text: this.detailData.title,
    });
    this.renderedLines.push({type: LOCAL_STR_SEPARATOR});
  }

  renderSections() {
    const sections = this.detailData?.sections;
    if (!sections) {
      return;
    }

    for (const [index, section] of sections.entries()) {
      if (section.title) {
        this.addSectionHeader(section.title, {
          leadingBlank: index > LOCAL_NUM_ZERO,
        });
      }

      if (section.fields) {
        for (const field of section.fields) {
          this.addFieldLines(field);
        }
      }
    }
  }

  renderRelatedCounts() {
    const relatedCounts = this.detailData?.relatedCounts;
    if (!relatedCounts) {
      return;
    }

    this.addSectionHeader(DETAIL_PANEL_SECTION_TITLE.RELATED_ENTITIES, {
      leadingBlank: true,
    });

    for (const [entity, count] of Object.entries(relatedCounts)) {
      this.renderedLines.push({
        type: LOCAL_STR_FIELD,
        label: entity,
        value: String(count),
      });
    }
  }

  renderNavigationLinks() {
    const navigationLinks = this.detailData?.navigationLinks;
    if (!navigationLinks || navigationLinks.length === LOCAL_NUM_ZERO) {
      return;
    }

    this.addSectionHeader(DETAIL_PANEL_SECTION_TITLE.NAVIGATION, {
      leadingBlank: true,
    });

    for (const link of navigationLinks) {
      this.renderedLines.push({
        type: LOCAL_STR_LINK,
        label: link.label,
        target: link.target,
        key: link.key,
      });
    }
  }

  /**
   * Render the detail content into lines
   */
  renderContent() {
    this.renderedLines = [];

    if (!this.detailData) {
      return;
    }

    this.renderTitleBlock();
    this.renderSections();
    this.renderRelatedCounts();
    this.renderNavigationLinks();
  }

  /**
   * Add field lines, handling multi-line values
   * @param {Object} field - Field with label and value
   */
  addFieldLines(field) {
    const value = field.value !== null && field.value !== undefined ?
      String(field.value) : 'N/A';

    // Check if value is multi-line
    if (value.includes(LOCAL_STR_NEWLINE)) {
      // Add label on its own line
      this.renderedLines.push({
        type: LOCAL_STR_FIELDLABEL,
        label: field.label,
      });

      // Add each line of the value
      const lines = value.split('\n');
      for (const line of lines) {
        this.renderedLines.push({
          type: LOCAL_STR_FIELDVALUELINE,
          text: line,
        });
      }
    } else {
      // Single line field
      this.renderedLines.push({
        type: LOCAL_STR_FIELD,
        label: field.label,
        value: value,
      });
    }
  }

  /**
   * Get the visible lines based on scroll offset
   * @return {Array} Visible lines
   */
  getVisibleLines() {
    const start = this.scrollOffset;
    const end = start + this.maxHeight;
    return this.renderedLines.slice(start, end);
  }

  /**
   * Render the panel to a formatted output
   * @param {Object} options - Render options
   * @param {boolean} [options.monochrome] - Use monochrome mode
   * @return {Object} Rendered panel data
   */
  render(options = {}) {
    const monochrome = options.monochrome || false;
    const visibleLines = this.getVisibleLines();

    const formattedLines = visibleLines.map((line) =>
      this.formatLine(line, monochrome),
    );

    // Add scroll indicators
    const canScrollUp = this.scrollOffset > 0;
    const canScrollDown = this.scrollOffset <
      Math.max(0, this.renderedLines.length - this.maxHeight);

    return {
      visible: this.visible,
      position: this.position,
      title: this.detailData?.title || LOCAL_STR_EMPTY,
      lines: formattedLines,
      totalLines: this.renderedLines.length,
      visibleLines: visibleLines.length,
      scrollOffset: this.scrollOffset,
      canScrollUp,
      canScrollDown,
      maxHeight: this.maxHeight,
      maxWidth: this.maxWidth,
    };
  }

  /**
   * Format a single line for display
   * @param {Object} line - Line data
   * @param {boolean} monochrome - Use monochrome mode
   * @return {Object} Formatted line
   */
  formatLine(line, monochrome) {
    const colors = monochrome ? {
      title: 'white',
      sectionHeader: 'white',
      label: 'white',
      value: 'white',
      link: 'white',
    } : {
      title: 'cyan',
      sectionHeader: 'yellow',
      label: 'gray',
      value: 'white',
      link: 'blue',
    };

    switch (line.type) {
    case LOCAL_STR_TITLE:
      return {
        type: LOCAL_STR_TITLE,
        text: line.text,
        color: colors.title,
        bold: true,
      };

    case LOCAL_STR_SEPARATOR:
      return {
        type: LOCAL_STR_SEPARATOR,
        text: LOCAL_STR_1G31G.repeat(this.maxWidth - LOCAL_NUM_TWO),
        color: colors.label,
      };

    case LOCAL_STR_SECTIONHEADER:
      return {
        type: LOCAL_STR_SECTIONHEADER,
        text: `▸ ${line.text}`,
        color: colors.sectionHeader,
        bold: true,
      };

    case LOCAL_STR_FIELD:
      return {
        type: LOCAL_STR_FIELD,
        label: line.label,
        value: this.truncateValue(line.value),
        labelColor: colors.label,
        valueColor: colors.value,
      };

    case LOCAL_STR_FIELDLABEL:
      return {
        type: LOCAL_STR_FIELDLABEL,
        label: line.label,
        color: colors.label,
      };

    case LOCAL_STR_FIELDVALUELINE:
      return {
        type: LOCAL_STR_FIELDVALUELINE,
        text: this.truncateValue(line.text),
        color: colors.value,
      };

    case LOCAL_STR_LINK:
      return {
        type: LOCAL_STR_LINK,
        label: line.label,
        key: line.key,
        color: colors.link,
      };

    case LOCAL_STR_BLANK:
      return {
        type: LOCAL_STR_BLANK,
        text: LOCAL_STR_EMPTY,
      };

    default:
      return {
        type: LOCAL_STR_TEXT,
        text: line.text || LOCAL_STR_EMPTY,
        color: colors.value,
      };
    }
  }

  /**
   * Truncate a value to fit within max width
   * @param {string} value - Value to truncate
   * @return {string} Truncated value
   */
  truncateValue(value) {
    const maxValueWidth = this.maxWidth - 4;
    if (value.length <= maxValueWidth) {
      return value;
    }
    return value.substring(LOCAL_NUM_ZERO, maxValueWidth - LOCAL_NUM_THREE) + LOCAL_STR_2ZI04;
  }

  /**
   * Handle key input for scrolling
   * @param {Object} key - Key event
   * @return {boolean} True if key was handled
   */
  handleKey(key) {
    if (!this.visible) {
      return false;
    }

    switch (key.name) {
    case LOCAL_STR_UP:
      this.scrollUp();
      return true;
    case LOCAL_STR_DOWN:
      this.scrollDown();
      return true;
    case LOCAL_STR_PAGEUP:
      this.pageUp();
      return true;
    case LOCAL_STR_PAGEDOWN:
      this.pageDown();
      return true;
    case LOCAL_STR_HOME:
      this.scrollToTop();
      return true;
    case LOCAL_STR_END:
      this.scrollToBottom();
      return true;
    default:
      return false;
    }
  }

  /**
   * Get scroll position info
   * @return {Object} Scroll position info
   */
  getScrollInfo() {
    return {
      offset: this.scrollOffset,
      totalLines: this.renderedLines.length,
      visibleLines: Math.min(this.maxHeight, this.renderedLines.length),
      percentage: this.renderedLines.length > LOCAL_NUM_ZERO ?
        Math.round((this.scrollOffset / Math.max(LOCAL_NUM_ONE,
          this.renderedLines.length - this.maxHeight)) * LOCAL_NUM_100) : LOCAL_NUM_ZERO,
    };
  }

  /**
   * Destroy the panel and cleanup
   */
  destroy() {
    this.detailData = null;
    this.renderedLines = [];
    this.visible = false;
  }
}
