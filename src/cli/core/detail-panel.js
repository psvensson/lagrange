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
  SIDE: 'side',
  BOTTOM: 'bottom',
  OVERLAY: 'overlay',
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
    this.maxHeight = options.maxHeight || 30;
    this.maxWidth = options.maxWidth || 60;

    // Panel state
    this.visible = false;
    this.detailData = null;
    this.scrollOffset = 0;
    this.renderedLines = [];

    // Setup event listeners
    this.setupEventListeners();
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    if (this.eventBus) {
      this.eventBus.on('detailCoordinator:detailUpdated', (data) => {
        this.setDetailData(data.detailData);
      });

      this.eventBus.on('detailCoordinator:detailCleared', () => {
        this.clearDetailData();
      });

      this.eventBus.on('detailCoordinator:panelShown', () => {
        this.show();
      });

      this.eventBus.on('detailCoordinator:panelHidden', () => {
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
    this.scrollOffset = 0;
    this.renderContent();
  }

  /**
   * Clear the detail data
   */
  clearDetailData() {
    this.detailData = null;
    this.scrollOffset = 0;
    this.renderedLines = [];
  }

  /**
   * Show the panel
   */
  show() {
    this.visible = true;
    if (this.eventBus) {
      this.eventBus.emit('detailPanel:shown', {position: this.position});
    }
  }

  /**
   * Hide the panel
   */
  hide() {
    this.visible = false;
    if (this.eventBus) {
      this.eventBus.emit('detailPanel:hidden', {});
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
  scrollUp(lines = 1) {
    this.scrollOffset = Math.max(0, this.scrollOffset - lines);
  }

  /**
   * Scroll down in the detail panel
   * Requirements: 16.4
   * @param {number} [lines=1] - Number of lines to scroll
   */
  scrollDown(lines = 1) {
    const maxScroll = Math.max(0, this.renderedLines.length - this.maxHeight);
    this.scrollOffset = Math.min(maxScroll, this.scrollOffset + lines);
  }

  /**
   * Scroll to top
   */
  scrollToTop() {
    this.scrollOffset = 0;
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
    this.scrollUp(this.maxHeight - 2);
  }

  /**
   * Page down in the detail panel
   */
  pageDown() {
    this.scrollDown(this.maxHeight - 2);
  }

  addSectionHeader(title, options = {}) {
    if (options.leadingBlank === true) {
      this.renderedLines.push({type: 'blank'});
    }
    this.renderedLines.push({
      type: 'sectionHeader',
      text: title,
    });
  }

  renderTitleBlock() {
    if (!this.detailData?.title) {
      return;
    }

    this.renderedLines.push({
      type: 'title',
      text: this.detailData.title,
    });
    this.renderedLines.push({type: 'separator'});
  }

  renderSections() {
    const sections = this.detailData?.sections;
    if (!sections) {
      return;
    }

    for (const [index, section] of sections.entries()) {
      if (section.title) {
        this.addSectionHeader(section.title, {
          leadingBlank: index > 0,
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
        type: 'field',
        label: entity,
        value: String(count),
      });
    }
  }

  renderNavigationLinks() {
    const navigationLinks = this.detailData?.navigationLinks;
    if (!navigationLinks || navigationLinks.length === 0) {
      return;
    }

    this.addSectionHeader(DETAIL_PANEL_SECTION_TITLE.NAVIGATION, {
      leadingBlank: true,
    });

    for (const link of navigationLinks) {
      this.renderedLines.push({
        type: 'link',
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
    if (value.includes('\n')) {
      // Add label on its own line
      this.renderedLines.push({
        type: 'fieldLabel',
        label: field.label,
      });

      // Add each line of the value
      const lines = value.split('\n');
      for (const line of lines) {
        this.renderedLines.push({
          type: 'fieldValueLine',
          text: line,
        });
      }
    } else {
      // Single line field
      this.renderedLines.push({
        type: 'field',
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
      title: this.detailData?.title || '',
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
    case 'title':
      return {
        type: 'title',
        text: line.text,
        color: colors.title,
        bold: true,
      };

    case 'separator':
      return {
        type: 'separator',
        text: '─'.repeat(this.maxWidth - 2),
        color: colors.label,
      };

    case 'sectionHeader':
      return {
        type: 'sectionHeader',
        text: `▸ ${line.text}`,
        color: colors.sectionHeader,
        bold: true,
      };

    case 'field':
      return {
        type: 'field',
        label: line.label,
        value: this.truncateValue(line.value),
        labelColor: colors.label,
        valueColor: colors.value,
      };

    case 'fieldLabel':
      return {
        type: 'fieldLabel',
        label: line.label,
        color: colors.label,
      };

    case 'fieldValueLine':
      return {
        type: 'fieldValueLine',
        text: this.truncateValue(line.text),
        color: colors.value,
      };

    case 'link':
      return {
        type: 'link',
        label: line.label,
        key: line.key,
        color: colors.link,
      };

    case 'blank':
      return {
        type: 'blank',
        text: '',
      };

    default:
      return {
        type: 'text',
        text: line.text || '',
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
    return value.substring(0, maxValueWidth - 3) + '...';
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
    case 'up':
      this.scrollUp();
      return true;
    case 'down':
      this.scrollDown();
      return true;
    case 'pageup':
      this.pageUp();
      return true;
    case 'pagedown':
      this.pageDown();
      return true;
    case 'home':
      this.scrollToTop();
      return true;
    case 'end':
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
      percentage: this.renderedLines.length > 0 ?
        Math.round((this.scrollOffset / Math.max(1,
          this.renderedLines.length - this.maxHeight)) * 100) : 0,
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
