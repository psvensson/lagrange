/**
 * VisualIndicators - Visual feedback components for the Admin CLI
 *
 * Provides color coding, entity icons, loading indicators, and box-drawing.
 * Supports monochrome mode for terminals without color support.
 *
 * Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6
 */

/**
 * Status types for color coding
 * Requirements: 17.1
 */
export const STATUS = {
  HEALTHY: 'healthy',
  WARNING: 'warning',
  ERROR: 'error',
  FAILED: 'failed',
  UNKNOWN: 'unknown',
  LOADING: 'loading',
};

/**
 * Color mappings for statuses
 * Requirements: 17.1
 */
export const STATUS_COLORS = {
  healthy: 'green',
  warning: 'yellow',
  error: 'red',
  failed: 'red',
  unknown: 'gray',
  loading: 'cyan',
  // Additional status mappings
  active: 'green',
  inactive: 'gray',
  starting: 'yellow',
  stopping: 'yellow',
  degraded: 'yellow',
  leader: 'green',
  follower: 'blue',
};

/**
 * Monochrome alternatives for statuses
 * Requirements: 17.6
 */
export const MONOCHROME_INDICATORS = {
  healthy: '[OK]',
  warning: '[!]',
  error: '[X]',
  failed: '[X]',
  unknown: '[?]',
  loading: '[...]',
  active: '[+]',
  inactive: '[-]',
  starting: '[>]',
  stopping: '[<]',
  degraded: '[~]',
  leader: '[L]',
  follower: '[F]',
};

/**
 * Entity type icons/symbols
 * Requirements: 17.2
 */
export const ENTITY_ICONS = {
  node: '◉',
  service: '◆',
  partition: '▣',
  message_group: '◈',
  table: '▤',
  replica: '◇',
  log: '▸',
  config: '⚙',
  context: '◎',
  query: '▷',
  // Status icons
  healthy: '✓',
  warning: '⚠',
  error: '✗',
  loading: '⟳',
};

/**
 * Monochrome entity icons
 * Requirements: 17.6
 */
export const MONOCHROME_ENTITY_ICONS = {
  node: '[N]',
  service: '[S]',
  partition: '[P]',
  message_group: '[M]',
  table: '[T]',
  replica: '[R]',
  log: '[L]',
  config: '[C]',
  context: '[X]',
  query: '[Q]',
  healthy: '[+]',
  warning: '[!]',
  error: '[X]',
  loading: '[.]',
};

/**
 * Box-drawing characters
 * Requirements: 17.5
 */
export const BOX_CHARS = {
  // Single line
  topLeft: '┌',
  topRight: '┐',
  bottomLeft: '└',
  bottomRight: '┘',
  horizontal: '─',
  vertical: '│',
  teeLeft: '├',
  teeRight: '┤',
  teeTop: '┬',
  teeBottom: '┴',
  cross: '┼',
  // Double line
  doubleTopLeft: '╔',
  doubleTopRight: '╗',
  doubleBottomLeft: '╚',
  doubleBottomRight: '╝',
  doubleHorizontal: '═',
  doubleVertical: '║',
  // Rounded corners
  roundTopLeft: '╭',
  roundTopRight: '╮',
  roundBottomLeft: '╰',
  roundBottomRight: '╯',
};

/**
 * ASCII box-drawing characters for monochrome mode
 * Requirements: 17.6
 */
export const ASCII_BOX_CHARS = {
  topLeft: '+',
  topRight: '+',
  bottomLeft: '+',
  bottomRight: '+',
  horizontal: '-',
  vertical: '|',
  teeLeft: '+',
  teeRight: '+',
  teeTop: '+',
  teeBottom: '+',
  cross: '+',
  doubleTopLeft: '+',
  doubleTopRight: '+',
  doubleBottomLeft: '+',
  doubleBottomRight: '+',
  doubleHorizontal: '=',
  doubleVertical: '|',
  roundTopLeft: '+',
  roundTopRight: '+',
  roundBottomLeft: '+',
  roundBottomRight: '+',
};

/**
 * Loading animation frames
 * Requirements: 17.4
 */
export const LOADING_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * ASCII loading frames for monochrome mode
 */
export const ASCII_LOADING_FRAMES = ['-', '\\', '|', '/'];

/**
 * VisualIndicators class for managing visual feedback
 */
export class VisualIndicators {
  /**
   * Creates a new VisualIndicators instance
   * @param {Object} options - Options
   * @param {boolean} [options.monochrome] - Use monochrome mode
   */
  constructor(options = {}) {
    this.monochrome = options.monochrome || false;
    this.loadingFrame = 0;
    this.loadingInterval = null;
  }

  /**
   * Set monochrome mode
   * Requirements: 17.6
   * @param {boolean} enabled - Whether monochrome mode is enabled
   */
  setMonochrome(enabled) {
    this.monochrome = enabled;
  }

  /**
   * Check if monochrome mode is enabled
   * @return {boolean}
   */
  isMonochrome() {
    return this.monochrome;
  }

  /**
   * Get color for a status
   * Requirements: 17.1
   * @param {string} status - Status string
   * @return {string} Color name
   */
  getStatusColor(status) {
    if (this.monochrome) {
      return 'white';
    }
    const normalizedStatus = (status || 'unknown').toLowerCase();
    return STATUS_COLORS[normalizedStatus] || STATUS_COLORS.unknown;
  }

  /**
   * Get indicator for a status (for monochrome mode)
   * Requirements: 17.6
   * @param {string} status - Status string
   * @return {string} Status indicator
   */
  getStatusIndicator(status) {
    const normalizedStatus = (status || 'unknown').toLowerCase();
    if (this.monochrome) {
      return MONOCHROME_INDICATORS[normalizedStatus] ||
        MONOCHROME_INDICATORS.unknown;
    }
    return '';
  }

  /**
   * Get icon for an entity type
   * Requirements: 17.2
   * @param {string} entityType - Entity type
   * @return {string} Entity icon
   */
  getEntityIcon(entityType) {
    const normalizedType = (entityType || '').toLowerCase();
    if (this.monochrome) {
      return MONOCHROME_ENTITY_ICONS[normalizedType] || '[?]';
    }
    return ENTITY_ICONS[normalizedType] || '○';
  }

  /**
   * Get box-drawing characters
   * Requirements: 17.5, 17.6
   * @return {Object} Box characters
   */
  getBoxChars() {
    return this.monochrome ? ASCII_BOX_CHARS : BOX_CHARS;
  }

  /**
   * Draw a box border
   * Requirements: 17.5
   * @param {number} width - Box width
   * @param {number} height - Box height
   * @param {Object} options - Options
   * @param {boolean} [options.double] - Use double lines
   * @param {boolean} [options.rounded] - Use rounded corners
   * @return {Object} Box border strings
   */
  drawBox(width, height, options = {}) {
    const chars = this.getBoxChars();
    const double = options.double || false;
    const rounded = options.rounded || false;

    let topLeft; let topRight; let bottomLeft; let bottomRight;
    let horizontal; let vertical;

    if (double) {
      topLeft = chars.doubleTopLeft;
      topRight = chars.doubleTopRight;
      bottomLeft = chars.doubleBottomLeft;
      bottomRight = chars.doubleBottomRight;
      horizontal = chars.doubleHorizontal;
      vertical = chars.doubleVertical;
    } else if (rounded && !this.monochrome) {
      topLeft = chars.roundTopLeft;
      topRight = chars.roundTopRight;
      bottomLeft = chars.roundBottomLeft;
      bottomRight = chars.roundBottomRight;
      horizontal = chars.horizontal;
      vertical = chars.vertical;
    } else {
      topLeft = chars.topLeft;
      topRight = chars.topRight;
      bottomLeft = chars.bottomLeft;
      bottomRight = chars.bottomRight;
      horizontal = chars.horizontal;
      vertical = chars.vertical;
    }

    const innerWidth = width - 2;
    const topBorder = topLeft + horizontal.repeat(innerWidth) + topRight;
    const bottomBorder = bottomLeft + horizontal.repeat(innerWidth) + bottomRight;
    const sideBorder = vertical;

    return {
      top: topBorder,
      bottom: bottomBorder,
      left: sideBorder,
      right: sideBorder,
      width,
      height,
    };
  }

  /**
   * Get current loading frame
   * Requirements: 17.4
   * @return {string} Loading frame character
   */
  getLoadingFrame() {
    const frames = this.monochrome ? ASCII_LOADING_FRAMES : LOADING_FRAMES;
    return frames[this.loadingFrame % frames.length];
  }

  /**
   * Advance loading animation
   * Requirements: 17.4
   */
  advanceLoadingFrame() {
    const frames = this.monochrome ? ASCII_LOADING_FRAMES : LOADING_FRAMES;
    this.loadingFrame = (this.loadingFrame + 1) % frames.length;
  }

  /**
   * Start loading animation
   * Requirements: 17.4
   * @param {Function} callback - Callback to call on each frame
   * @param {number} [interval=100] - Animation interval in ms
   */
  startLoadingAnimation(callback, interval = 100) {
    this.stopLoadingAnimation();
    this.loadingInterval = setInterval(() => {
      this.advanceLoadingFrame();
      if (callback) {
        callback(this.getLoadingFrame());
      }
    }, interval);
  }

  /**
   * Stop loading animation
   */
  stopLoadingAnimation() {
    if (this.loadingInterval) {
      clearInterval(this.loadingInterval);
      this.loadingInterval = null;
    }
    this.loadingFrame = 0;
  }

  /**
   * Format a status with color/indicator
   * Requirements: 17.1, 17.6
   * @param {string} status - Status string
   * @param {Object} options - Options
   * @param {boolean} [options.includeIcon] - Include status icon
   * @return {Object} Formatted status
   */
  formatStatus(status, options = {}) {
    const normalizedStatus = (status || 'unknown').toLowerCase();
    const color = this.getStatusColor(normalizedStatus);
    const indicator = this.getStatusIndicator(normalizedStatus);

    let text = status || 'Unknown';
    if (this.monochrome && indicator) {
      text = `${indicator} ${text}`;
    } else if (options.includeIcon && !this.monochrome) {
      const icon = ENTITY_ICONS[normalizedStatus] || '';
      if (icon) {
        text = `${icon} ${text}`;
      }
    }

    return {
      text,
      color,
      status: normalizedStatus,
    };
  }

  /**
   * Format an entity with icon
   * Requirements: 17.2
   * @param {string} entityType - Entity type
   * @param {string} entityId - Entity ID or name
   * @return {Object} Formatted entity
   */
  formatEntity(entityType, entityId) {
    const icon = this.getEntityIcon(entityType);
    return {
      text: `${icon} ${entityId}`,
      icon,
      entityType,
      entityId,
    };
  }

  /**
   * Create a loading indicator string
   * Requirements: 17.4
   * @param {string} [message] - Optional loading message
   * @return {Object} Loading indicator
   */
  createLoadingIndicator(message = 'Loading') {
    const frame = this.getLoadingFrame();
    return {
      text: `${frame} ${message}...`,
      frame,
      message,
      color: this.getStatusColor('loading'),
    };
  }

  /**
   * Create a progress bar
   * @param {number} progress - Progress value (0-100)
   * @param {number} width - Bar width in characters
   * @return {Object} Progress bar
   */
  createProgressBar(progress, width = 20) {
    const clampedProgress = Math.max(0, Math.min(100, progress));
    const filledWidth = Math.round((clampedProgress / 100) * (width - 2));
    const emptyWidth = width - 2 - filledWidth;

    const chars = this.getBoxChars();
    const filled = this.monochrome ? '#' : '█';
    const empty = this.monochrome ? '-' : '░';

    const bar = chars.vertical +
      filled.repeat(filledWidth) +
      empty.repeat(emptyWidth) +
      chars.vertical;

    return {
      text: bar,
      progress: clampedProgress,
      width,
    };
  }

  /**
   * Highlight selected row
   * Requirements: 17.3
   * @param {string} text - Row text
   * @param {boolean} isSelected - Whether row is selected
   * @return {Object} Highlighted row
   */
  highlightSelected(text, isSelected) {
    if (isSelected) {
      return {
        text,
        style: 'inverse',
        isSelected: true,
      };
    }
    return {
      text,
      style: 'normal',
      isSelected: false,
    };
  }

  /**
   * Apply color to text (returns formatting info)
   * @param {string} text - Text to color
   * @param {string} color - Color name
   * @return {Object} Colored text info
   */
  colorize(text, color) {
    if (this.monochrome) {
      return {text, color: 'white'};
    }
    return {text, color};
  }

  /**
   * Create a horizontal separator
   * @param {number} width - Separator width
   * @param {Object} options - Options
   * @param {boolean} [options.double] - Use double line
   * @return {string} Separator string
   */
  createSeparator(width, options = {}) {
    const chars = this.getBoxChars();
    const char = options.double ? chars.doubleHorizontal : chars.horizontal;
    return char.repeat(width);
  }

  /**
   * Create a vertical separator
   * @param {number} height - Separator height
   * @param {Object} options - Options
   * @param {boolean} [options.double] - Use double line
   * @return {Array<string>} Separator lines
   */
  createVerticalSeparator(height, options = {}) {
    const chars = this.getBoxChars();
    const char = options.double ? chars.doubleVertical : chars.vertical;
    return Array(height).fill(char);
  }

  /**
   * Destroy and cleanup
   */
  destroy() {
    this.stopLoadingAnimation();
  }
}
