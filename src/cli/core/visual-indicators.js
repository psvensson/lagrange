const LOCAL_STR_HEALTHY = 'healthy';
const LOCAL_STR_WARNING = 'warning';
const LOCAL_STR_ERROR = 'error';
const LOCAL_STR_FAILED = 'failed';
const LOCAL_STR_UNKNOWN = 'unknown';
const LOCAL_STR_LOADING = 'loading';
const LOCAL_STR_GREEN = 'green';
const LOCAL_STR_YELLOW = 'yellow';
const LOCAL_STR_RED = 'red';
const LOCAL_STR_GRAY = 'gray';
const LOCAL_STR_CYAN = 'cyan';
const LOCAL_STR_BLUE = 'blue';
const LOCAL_STR_OK = '[OK]';
const LOCAL_STR_LBRACKET_BANG_RBRACKET = '[!]';
const LOCAL_STR_X = '[X]';
const LOCAL_STR_LBRACKET_QMARK_RBRACKET = '[?]';
const LOCAL_STR_LBRACKET_DOT_DOT = '[...]';
const LOCAL_STR_LBRACKET_PLUS_RBRACKET = '[+]';
const LOCAL_STR_LBRACKET_DASH_RBRACKET = '[-]';
const LOCAL_STR_LBRACKET_GT_RBRACKET = '[>]';
const LOCAL_STR_LBRACKET_LT_RBRACKET = '[<]';
const LOCAL_STR_LBRACKET_TILDE_RBRACKET = '[~]';
const LOCAL_STR_L = '[L]';
const LOCAL_STR_F = '[F]';
const LOCAL_STR_L58M3 = '◉';
const LOCAL_STR_INC6U = '◆';
const LOCAL_STR_1A48U = '▣';
const LOCAL_STR_LF87S = '◈';
const LOCAL_STR_18QAU = '▤';
const LOCAL_STR_IDCL5 = '◇';
const LOCAL_STR_1GHZP = '▸';
const LOCAL_STR_17CJG = '⚙';
const LOCAL_STR_KV90E = '◎';
const LOCAL_STR_1DG42 = '▷';
const LOCAL_STR_660PG = '✓';
const LOCAL_STR_19UFV = '⚠';
const LOCAL_STR_522AO = '✗';
const LOCAL_STR_WSWCG = '⟳';
const LOCAL_STR_N = '[N]';
const LOCAL_STR_S = '[S]';
const LOCAL_STR_P = '[P]';
const LOCAL_STR_M = '[M]';
const LOCAL_STR_T = '[T]';
const LOCAL_STR_R = '[R]';
const LOCAL_STR_C = '[C]';
const LOCAL_STR_Q = '[Q]';
const LOCAL_STR_LBRACKET_DOT_RBRACKET = '[.]';
const LOCAL_STR_2K1G8 = '┌';
const LOCAL_STR_5VWOJ = '┐';
const LOCAL_STR_4RY9S = '└';
const LOCAL_STR_83TI3 = '┘';
const LOCAL_STR_1G31G = '─';
const LOCAL_STR_2028U = '│';
const LOCAL_STR_6ZV3B = '├';
const LOCAL_STR_97RWV = '┤';
const LOCAL_STR_BFOQF = '┬';
const LOCAL_STR_DNLJZ = '┴';
const LOCAL_STR_FVIDI = '┼';
const LOCAL_STR_1M1RR = '╔';
const LOCAL_STR_1MBRD = '╗';
const LOCAL_STR_1PXM7 = '╚';
const LOCAL_STR_1NZOZ = '╝';
const LOCAL_STR_1N5Q6 = '═';
const LOCAL_STR_1MVQK = '║';
const LOCAL_STR_1SFIM = '╭';
const LOCAL_STR_1T9HF = '╮';
const LOCAL_STR_1W1DG = '╰';
const LOCAL_STR_1SZHT = '╯';
const LOCAL_STR_PLUS = '+';
const LOCAL_STR_HYPHEN = '-';
const LOCAL_STR_PIPE = '|';
const LOCAL_STR_EQUALS = '=';
const LOCAL_STR_3XSTV = '⠋';
const LOCAL_STR_7TN9L = '⠙';
const LOCAL_STR_GPAJS = '⠹';
const LOCAL_STR_GZA5H = '⠸';
const LOCAL_STR_FVBQP = '⠼';
const LOCAL_STR_DNEX5 = '⠴';
const LOCAL_STR_9RKHG = '⠦';
const LOCAL_STR_9HKVR = '⠧';
const LOCAL_STR_LXLK6 = '⠇';
const LOCAL_STR_2TUF3 = '⠏';
const LOCAL_STR_BACKSLASH = '\\';
const LOCAL_STR_SLASH = '/';
const LOCAL_STR_WHITE = 'white';
const LOCAL_STR_LP7TH = '○';
const LOCAL_NUM_ONE_HUNDRED = 100;
const LOCAL_STR_UNKNOWN_2 = 'Unknown';
const LOCAL_STR_LOADING_2 = 'Loading';
const LOCAL_NUM_TWENTY = 20;
const LOCAL_STR_INVERSE = 'inverse';
const LOCAL_STR_NORMAL = 'normal';

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
  HEALTHY: LOCAL_STR_HEALTHY,
  WARNING: LOCAL_STR_WARNING,
  ERROR: LOCAL_STR_ERROR,
  FAILED: LOCAL_STR_FAILED,
  UNKNOWN: LOCAL_STR_UNKNOWN,
  LOADING: LOCAL_STR_LOADING,
};

/**
 * Color mappings for statuses
 * Requirements: 17.1
 */
export const STATUS_COLORS = {
  healthy: LOCAL_STR_GREEN,
  warning: LOCAL_STR_YELLOW,
  error: LOCAL_STR_RED,
  failed: LOCAL_STR_RED,
  unknown: LOCAL_STR_GRAY,
  loading: LOCAL_STR_CYAN,
  // Additional status mappings
  active: LOCAL_STR_GREEN,
  inactive: LOCAL_STR_GRAY,
  starting: LOCAL_STR_YELLOW,
  stopping: LOCAL_STR_YELLOW,
  degraded: LOCAL_STR_YELLOW,
  leader: LOCAL_STR_GREEN,
  follower: LOCAL_STR_BLUE,
};

/**
 * Monochrome alternatives for statuses
 * Requirements: 17.6
 */
export const MONOCHROME_INDICATORS = {
  healthy: LOCAL_STR_OK,
  warning: LOCAL_STR_LBRACKET_BANG_RBRACKET,
  error: LOCAL_STR_X,
  failed: LOCAL_STR_X,
  unknown: LOCAL_STR_LBRACKET_QMARK_RBRACKET,
  loading: LOCAL_STR_LBRACKET_DOT_DOT,
  active: LOCAL_STR_LBRACKET_PLUS_RBRACKET,
  inactive: LOCAL_STR_LBRACKET_DASH_RBRACKET,
  starting: LOCAL_STR_LBRACKET_GT_RBRACKET,
  stopping: LOCAL_STR_LBRACKET_LT_RBRACKET,
  degraded: LOCAL_STR_LBRACKET_TILDE_RBRACKET,
  leader: LOCAL_STR_L,
  follower: LOCAL_STR_F,
};

/**
 * Entity type icons/symbols
 * Requirements: 17.2
 */
export const ENTITY_ICONS = {
  node: LOCAL_STR_L58M3,
  service: LOCAL_STR_INC6U,
  partition: LOCAL_STR_1A48U,
  message_group: LOCAL_STR_LF87S,
  table: LOCAL_STR_18QAU,
  replica: LOCAL_STR_IDCL5,
  log: LOCAL_STR_1GHZP,
  config: LOCAL_STR_17CJG,
  context: LOCAL_STR_KV90E,
  query: LOCAL_STR_1DG42,
  // Status icons
  healthy: LOCAL_STR_660PG,
  warning: LOCAL_STR_19UFV,
  error: LOCAL_STR_522AO,
  loading: LOCAL_STR_WSWCG,
};

/**
 * Monochrome entity icons
 * Requirements: 17.6
 */
export const MONOCHROME_ENTITY_ICONS = {
  node: LOCAL_STR_N,
  service: LOCAL_STR_S,
  partition: LOCAL_STR_P,
  message_group: LOCAL_STR_M,
  table: LOCAL_STR_T,
  replica: LOCAL_STR_R,
  log: LOCAL_STR_L,
  config: LOCAL_STR_C,
  context: LOCAL_STR_X,
  query: LOCAL_STR_Q,
  healthy: LOCAL_STR_LBRACKET_PLUS_RBRACKET,
  warning: LOCAL_STR_LBRACKET_BANG_RBRACKET,
  error: LOCAL_STR_X,
  loading: LOCAL_STR_LBRACKET_DOT_RBRACKET,
};

/**
 * Box-drawing characters
 * Requirements: 17.5
 */
export const BOX_CHARS = {
  // Single line
  topLeft: LOCAL_STR_2K1G8,
  topRight: LOCAL_STR_5VWOJ,
  bottomLeft: LOCAL_STR_4RY9S,
  bottomRight: LOCAL_STR_83TI3,
  horizontal: LOCAL_STR_1G31G,
  vertical: LOCAL_STR_2028U,
  teeLeft: LOCAL_STR_6ZV3B,
  teeRight: LOCAL_STR_97RWV,
  teeTop: LOCAL_STR_BFOQF,
  teeBottom: LOCAL_STR_DNLJZ,
  cross: LOCAL_STR_FVIDI,
  // Double line
  doubleTopLeft: LOCAL_STR_1M1RR,
  doubleTopRight: LOCAL_STR_1MBRD,
  doubleBottomLeft: LOCAL_STR_1PXM7,
  doubleBottomRight: LOCAL_STR_1NZOZ,
  doubleHorizontal: LOCAL_STR_1N5Q6,
  doubleVertical: LOCAL_STR_1MVQK,
  // Rounded corners
  roundTopLeft: LOCAL_STR_1SFIM,
  roundTopRight: LOCAL_STR_1T9HF,
  roundBottomLeft: LOCAL_STR_1W1DG,
  roundBottomRight: LOCAL_STR_1SZHT,
};

/**
 * ASCII box-drawing characters for monochrome mode
 * Requirements: 17.6
 */
export const ASCII_BOX_CHARS = {
  topLeft: LOCAL_STR_PLUS,
  topRight: LOCAL_STR_PLUS,
  bottomLeft: LOCAL_STR_PLUS,
  bottomRight: LOCAL_STR_PLUS,
  horizontal: LOCAL_STR_HYPHEN,
  vertical: LOCAL_STR_PIPE,
  teeLeft: LOCAL_STR_PLUS,
  teeRight: LOCAL_STR_PLUS,
  teeTop: LOCAL_STR_PLUS,
  teeBottom: LOCAL_STR_PLUS,
  cross: LOCAL_STR_PLUS,
  doubleTopLeft: LOCAL_STR_PLUS,
  doubleTopRight: LOCAL_STR_PLUS,
  doubleBottomLeft: LOCAL_STR_PLUS,
  doubleBottomRight: LOCAL_STR_PLUS,
  doubleHorizontal: LOCAL_STR_EQUALS,
  doubleVertical: LOCAL_STR_PIPE,
  roundTopLeft: LOCAL_STR_PLUS,
  roundTopRight: LOCAL_STR_PLUS,
  roundBottomLeft: LOCAL_STR_PLUS,
  roundBottomRight: LOCAL_STR_PLUS,
};

/**
 * Loading animation frames
 * Requirements: 17.4
 */
export const LOADING_FRAMES = [
  LOCAL_STR_3XSTV, LOCAL_STR_7TN9L, LOCAL_STR_GPAJS, LOCAL_STR_GZA5H, LOCAL_STR_FVBQP,
  LOCAL_STR_DNEX5, LOCAL_STR_9RKHG, LOCAL_STR_9HKVR, LOCAL_STR_LXLK6, LOCAL_STR_2TUF3,
];

/**
 * ASCII loading frames for monochrome mode
 */
export const ASCII_LOADING_FRAMES = [
  LOCAL_STR_HYPHEN, LOCAL_STR_BACKSLASH, LOCAL_STR_PIPE, LOCAL_STR_SLASH,
];

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
      return LOCAL_STR_WHITE;
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
      return MONOCHROME_ENTITY_ICONS[normalizedType] || LOCAL_STR_LBRACKET_QMARK_RBRACKET;
    }
    return ENTITY_ICONS[normalizedType] || LOCAL_STR_LP7TH;
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
  startLoadingAnimation(callback, interval = LOCAL_NUM_ONE_HUNDRED) {
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

    let text = status || LOCAL_STR_UNKNOWN_2;
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
  createLoadingIndicator(message = LOCAL_STR_LOADING_2) {
    const frame = this.getLoadingFrame();
    return {
      text: `${frame} ${message}...`,
      frame,
      message,
      color: this.getStatusColor(LOCAL_STR_LOADING),
    };
  }

  /**
   * Create a progress bar
   * @param {number} progress - Progress value (0-100)
   * @param {number} width - Bar width in characters
   * @return {Object} Progress bar
   */
  createProgressBar(progress, width = LOCAL_NUM_TWENTY) {
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
        style: LOCAL_STR_INVERSE,
        isSelected: true,
      };
    }
    return {
      text,
      style: LOCAL_STR_NORMAL,
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
      return {text, color: LOCAL_STR_WHITE};
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
