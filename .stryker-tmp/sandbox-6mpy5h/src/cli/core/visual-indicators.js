/**
 * VisualIndicators - Visual feedback components for the Admin CLI
 *
 * Provides color coding, entity icons, loading indicators, and box-drawing.
 * Supports monochrome mode for terminals without color support.
 *
 * Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6
 */
// @ts-nocheck


/**
 * Status types for color coding
 * Requirements: 17.1
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
export const STATUS = stryMutAct_9fa48("44863") ? {} : (stryCov_9fa48("44863"), {
  HEALTHY: stryMutAct_9fa48("44864") ? "" : (stryCov_9fa48("44864"), 'healthy'),
  WARNING: stryMutAct_9fa48("44865") ? "" : (stryCov_9fa48("44865"), 'warning'),
  ERROR: stryMutAct_9fa48("44866") ? "" : (stryCov_9fa48("44866"), 'error'),
  FAILED: stryMutAct_9fa48("44867") ? "" : (stryCov_9fa48("44867"), 'failed'),
  UNKNOWN: stryMutAct_9fa48("44868") ? "" : (stryCov_9fa48("44868"), 'unknown'),
  LOADING: stryMutAct_9fa48("44869") ? "" : (stryCov_9fa48("44869"), 'loading')
});

/**
 * Color mappings for statuses
 * Requirements: 17.1
 */
export const STATUS_COLORS = stryMutAct_9fa48("44870") ? {} : (stryCov_9fa48("44870"), {
  healthy: stryMutAct_9fa48("44871") ? "" : (stryCov_9fa48("44871"), 'green'),
  warning: stryMutAct_9fa48("44872") ? "" : (stryCov_9fa48("44872"), 'yellow'),
  error: stryMutAct_9fa48("44873") ? "" : (stryCov_9fa48("44873"), 'red'),
  failed: stryMutAct_9fa48("44874") ? "" : (stryCov_9fa48("44874"), 'red'),
  unknown: stryMutAct_9fa48("44875") ? "" : (stryCov_9fa48("44875"), 'gray'),
  loading: stryMutAct_9fa48("44876") ? "" : (stryCov_9fa48("44876"), 'cyan'),
  // Additional status mappings
  active: stryMutAct_9fa48("44877") ? "" : (stryCov_9fa48("44877"), 'green'),
  inactive: stryMutAct_9fa48("44878") ? "" : (stryCov_9fa48("44878"), 'gray'),
  starting: stryMutAct_9fa48("44879") ? "" : (stryCov_9fa48("44879"), 'yellow'),
  stopping: stryMutAct_9fa48("44880") ? "" : (stryCov_9fa48("44880"), 'yellow'),
  degraded: stryMutAct_9fa48("44881") ? "" : (stryCov_9fa48("44881"), 'yellow'),
  leader: stryMutAct_9fa48("44882") ? "" : (stryCov_9fa48("44882"), 'green'),
  follower: stryMutAct_9fa48("44883") ? "" : (stryCov_9fa48("44883"), 'blue')
});

/**
 * Monochrome alternatives for statuses
 * Requirements: 17.6
 */
export const MONOCHROME_INDICATORS = stryMutAct_9fa48("44884") ? {} : (stryCov_9fa48("44884"), {
  healthy: stryMutAct_9fa48("44885") ? "" : (stryCov_9fa48("44885"), '[OK]'),
  warning: stryMutAct_9fa48("44886") ? "" : (stryCov_9fa48("44886"), '[!]'),
  error: stryMutAct_9fa48("44887") ? "" : (stryCov_9fa48("44887"), '[X]'),
  failed: stryMutAct_9fa48("44888") ? "" : (stryCov_9fa48("44888"), '[X]'),
  unknown: stryMutAct_9fa48("44889") ? "" : (stryCov_9fa48("44889"), '[?]'),
  loading: stryMutAct_9fa48("44890") ? "" : (stryCov_9fa48("44890"), '[...]'),
  active: stryMutAct_9fa48("44891") ? "" : (stryCov_9fa48("44891"), '[+]'),
  inactive: stryMutAct_9fa48("44892") ? "" : (stryCov_9fa48("44892"), '[-]'),
  starting: stryMutAct_9fa48("44893") ? "" : (stryCov_9fa48("44893"), '[>]'),
  stopping: stryMutAct_9fa48("44894") ? "" : (stryCov_9fa48("44894"), '[<]'),
  degraded: stryMutAct_9fa48("44895") ? "" : (stryCov_9fa48("44895"), '[~]'),
  leader: stryMutAct_9fa48("44896") ? "" : (stryCov_9fa48("44896"), '[L]'),
  follower: stryMutAct_9fa48("44897") ? "" : (stryCov_9fa48("44897"), '[F]')
});

/**
 * Entity type icons/symbols
 * Requirements: 17.2
 */
export const ENTITY_ICONS = stryMutAct_9fa48("44898") ? {} : (stryCov_9fa48("44898"), {
  node: stryMutAct_9fa48("44899") ? "" : (stryCov_9fa48("44899"), '◉'),
  service: stryMutAct_9fa48("44900") ? "" : (stryCov_9fa48("44900"), '◆'),
  partition: stryMutAct_9fa48("44901") ? "" : (stryCov_9fa48("44901"), '▣'),
  message_group: stryMutAct_9fa48("44902") ? "" : (stryCov_9fa48("44902"), '◈'),
  table: stryMutAct_9fa48("44903") ? "" : (stryCov_9fa48("44903"), '▤'),
  replica: stryMutAct_9fa48("44904") ? "" : (stryCov_9fa48("44904"), '◇'),
  log: stryMutAct_9fa48("44905") ? "" : (stryCov_9fa48("44905"), '▸'),
  config: stryMutAct_9fa48("44906") ? "" : (stryCov_9fa48("44906"), '⚙'),
  context: stryMutAct_9fa48("44907") ? "" : (stryCov_9fa48("44907"), '◎'),
  query: stryMutAct_9fa48("44908") ? "" : (stryCov_9fa48("44908"), '▷'),
  // Status icons
  healthy: stryMutAct_9fa48("44909") ? "" : (stryCov_9fa48("44909"), '✓'),
  warning: stryMutAct_9fa48("44910") ? "" : (stryCov_9fa48("44910"), '⚠'),
  error: stryMutAct_9fa48("44911") ? "" : (stryCov_9fa48("44911"), '✗'),
  loading: stryMutAct_9fa48("44912") ? "" : (stryCov_9fa48("44912"), '⟳')
});

/**
 * Monochrome entity icons
 * Requirements: 17.6
 */
export const MONOCHROME_ENTITY_ICONS = stryMutAct_9fa48("44913") ? {} : (stryCov_9fa48("44913"), {
  node: stryMutAct_9fa48("44914") ? "" : (stryCov_9fa48("44914"), '[N]'),
  service: stryMutAct_9fa48("44915") ? "" : (stryCov_9fa48("44915"), '[S]'),
  partition: stryMutAct_9fa48("44916") ? "" : (stryCov_9fa48("44916"), '[P]'),
  message_group: stryMutAct_9fa48("44917") ? "" : (stryCov_9fa48("44917"), '[M]'),
  table: stryMutAct_9fa48("44918") ? "" : (stryCov_9fa48("44918"), '[T]'),
  replica: stryMutAct_9fa48("44919") ? "" : (stryCov_9fa48("44919"), '[R]'),
  log: stryMutAct_9fa48("44920") ? "" : (stryCov_9fa48("44920"), '[L]'),
  config: stryMutAct_9fa48("44921") ? "" : (stryCov_9fa48("44921"), '[C]'),
  context: stryMutAct_9fa48("44922") ? "" : (stryCov_9fa48("44922"), '[X]'),
  query: stryMutAct_9fa48("44923") ? "" : (stryCov_9fa48("44923"), '[Q]'),
  healthy: stryMutAct_9fa48("44924") ? "" : (stryCov_9fa48("44924"), '[+]'),
  warning: stryMutAct_9fa48("44925") ? "" : (stryCov_9fa48("44925"), '[!]'),
  error: stryMutAct_9fa48("44926") ? "" : (stryCov_9fa48("44926"), '[X]'),
  loading: stryMutAct_9fa48("44927") ? "" : (stryCov_9fa48("44927"), '[.]')
});

/**
 * Box-drawing characters
 * Requirements: 17.5
 */
export const BOX_CHARS = stryMutAct_9fa48("44928") ? {} : (stryCov_9fa48("44928"), {
  // Single line
  topLeft: stryMutAct_9fa48("44929") ? "" : (stryCov_9fa48("44929"), '┌'),
  topRight: stryMutAct_9fa48("44930") ? "" : (stryCov_9fa48("44930"), '┐'),
  bottomLeft: stryMutAct_9fa48("44931") ? "" : (stryCov_9fa48("44931"), '└'),
  bottomRight: stryMutAct_9fa48("44932") ? "" : (stryCov_9fa48("44932"), '┘'),
  horizontal: stryMutAct_9fa48("44933") ? "" : (stryCov_9fa48("44933"), '─'),
  vertical: stryMutAct_9fa48("44934") ? "" : (stryCov_9fa48("44934"), '│'),
  teeLeft: stryMutAct_9fa48("44935") ? "" : (stryCov_9fa48("44935"), '├'),
  teeRight: stryMutAct_9fa48("44936") ? "" : (stryCov_9fa48("44936"), '┤'),
  teeTop: stryMutAct_9fa48("44937") ? "" : (stryCov_9fa48("44937"), '┬'),
  teeBottom: stryMutAct_9fa48("44938") ? "" : (stryCov_9fa48("44938"), '┴'),
  cross: stryMutAct_9fa48("44939") ? "" : (stryCov_9fa48("44939"), '┼'),
  // Double line
  doubleTopLeft: stryMutAct_9fa48("44940") ? "" : (stryCov_9fa48("44940"), '╔'),
  doubleTopRight: stryMutAct_9fa48("44941") ? "" : (stryCov_9fa48("44941"), '╗'),
  doubleBottomLeft: stryMutAct_9fa48("44942") ? "" : (stryCov_9fa48("44942"), '╚'),
  doubleBottomRight: stryMutAct_9fa48("44943") ? "" : (stryCov_9fa48("44943"), '╝'),
  doubleHorizontal: stryMutAct_9fa48("44944") ? "" : (stryCov_9fa48("44944"), '═'),
  doubleVertical: stryMutAct_9fa48("44945") ? "" : (stryCov_9fa48("44945"), '║'),
  // Rounded corners
  roundTopLeft: stryMutAct_9fa48("44946") ? "" : (stryCov_9fa48("44946"), '╭'),
  roundTopRight: stryMutAct_9fa48("44947") ? "" : (stryCov_9fa48("44947"), '╮'),
  roundBottomLeft: stryMutAct_9fa48("44948") ? "" : (stryCov_9fa48("44948"), '╰'),
  roundBottomRight: stryMutAct_9fa48("44949") ? "" : (stryCov_9fa48("44949"), '╯')
});

/**
 * ASCII box-drawing characters for monochrome mode
 * Requirements: 17.6
 */
export const ASCII_BOX_CHARS = stryMutAct_9fa48("44950") ? {} : (stryCov_9fa48("44950"), {
  topLeft: stryMutAct_9fa48("44951") ? "" : (stryCov_9fa48("44951"), '+'),
  topRight: stryMutAct_9fa48("44952") ? "" : (stryCov_9fa48("44952"), '+'),
  bottomLeft: stryMutAct_9fa48("44953") ? "" : (stryCov_9fa48("44953"), '+'),
  bottomRight: stryMutAct_9fa48("44954") ? "" : (stryCov_9fa48("44954"), '+'),
  horizontal: stryMutAct_9fa48("44955") ? "" : (stryCov_9fa48("44955"), '-'),
  vertical: stryMutAct_9fa48("44956") ? "" : (stryCov_9fa48("44956"), '|'),
  teeLeft: stryMutAct_9fa48("44957") ? "" : (stryCov_9fa48("44957"), '+'),
  teeRight: stryMutAct_9fa48("44958") ? "" : (stryCov_9fa48("44958"), '+'),
  teeTop: stryMutAct_9fa48("44959") ? "" : (stryCov_9fa48("44959"), '+'),
  teeBottom: stryMutAct_9fa48("44960") ? "" : (stryCov_9fa48("44960"), '+'),
  cross: stryMutAct_9fa48("44961") ? "" : (stryCov_9fa48("44961"), '+'),
  doubleTopLeft: stryMutAct_9fa48("44962") ? "" : (stryCov_9fa48("44962"), '+'),
  doubleTopRight: stryMutAct_9fa48("44963") ? "" : (stryCov_9fa48("44963"), '+'),
  doubleBottomLeft: stryMutAct_9fa48("44964") ? "" : (stryCov_9fa48("44964"), '+'),
  doubleBottomRight: stryMutAct_9fa48("44965") ? "" : (stryCov_9fa48("44965"), '+'),
  doubleHorizontal: stryMutAct_9fa48("44966") ? "" : (stryCov_9fa48("44966"), '='),
  doubleVertical: stryMutAct_9fa48("44967") ? "" : (stryCov_9fa48("44967"), '|'),
  roundTopLeft: stryMutAct_9fa48("44968") ? "" : (stryCov_9fa48("44968"), '+'),
  roundTopRight: stryMutAct_9fa48("44969") ? "" : (stryCov_9fa48("44969"), '+'),
  roundBottomLeft: stryMutAct_9fa48("44970") ? "" : (stryCov_9fa48("44970"), '+'),
  roundBottomRight: stryMutAct_9fa48("44971") ? "" : (stryCov_9fa48("44971"), '+')
});

/**
 * Loading animation frames
 * Requirements: 17.4
 */
export const LOADING_FRAMES = stryMutAct_9fa48("44972") ? [] : (stryCov_9fa48("44972"), [stryMutAct_9fa48("44973") ? "" : (stryCov_9fa48("44973"), '⠋'), stryMutAct_9fa48("44974") ? "" : (stryCov_9fa48("44974"), '⠙'), stryMutAct_9fa48("44975") ? "" : (stryCov_9fa48("44975"), '⠹'), stryMutAct_9fa48("44976") ? "" : (stryCov_9fa48("44976"), '⠸'), stryMutAct_9fa48("44977") ? "" : (stryCov_9fa48("44977"), '⠼'), stryMutAct_9fa48("44978") ? "" : (stryCov_9fa48("44978"), '⠴'), stryMutAct_9fa48("44979") ? "" : (stryCov_9fa48("44979"), '⠦'), stryMutAct_9fa48("44980") ? "" : (stryCov_9fa48("44980"), '⠧'), stryMutAct_9fa48("44981") ? "" : (stryCov_9fa48("44981"), '⠇'), stryMutAct_9fa48("44982") ? "" : (stryCov_9fa48("44982"), '⠏')]);

/**
 * ASCII loading frames for monochrome mode
 */
export const ASCII_LOADING_FRAMES = stryMutAct_9fa48("44983") ? [] : (stryCov_9fa48("44983"), [stryMutAct_9fa48("44984") ? "" : (stryCov_9fa48("44984"), '-'), stryMutAct_9fa48("44985") ? "" : (stryCov_9fa48("44985"), '\\'), stryMutAct_9fa48("44986") ? "" : (stryCov_9fa48("44986"), '|'), stryMutAct_9fa48("44987") ? "" : (stryCov_9fa48("44987"), '/')]);

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
    if (stryMutAct_9fa48("44988")) {
      {}
    } else {
      stryCov_9fa48("44988");
      this.monochrome = stryMutAct_9fa48("44991") ? options.monochrome && false : stryMutAct_9fa48("44990") ? false : stryMutAct_9fa48("44989") ? true : (stryCov_9fa48("44989", "44990", "44991"), options.monochrome || (stryMutAct_9fa48("44992") ? true : (stryCov_9fa48("44992"), false)));
      this.loadingFrame = 0;
      this.loadingInterval = null;
    }
  }

  /**
   * Set monochrome mode
   * Requirements: 17.6
   * @param {boolean} enabled - Whether monochrome mode is enabled
   */
  setMonochrome(enabled) {
    if (stryMutAct_9fa48("44993")) {
      {}
    } else {
      stryCov_9fa48("44993");
      this.monochrome = enabled;
    }
  }

  /**
   * Check if monochrome mode is enabled
   * @return {boolean}
   */
  isMonochrome() {
    if (stryMutAct_9fa48("44994")) {
      {}
    } else {
      stryCov_9fa48("44994");
      return this.monochrome;
    }
  }

  /**
   * Get color for a status
   * Requirements: 17.1
   * @param {string} status - Status string
   * @return {string} Color name
   */
  getStatusColor(status) {
    if (stryMutAct_9fa48("44995")) {
      {}
    } else {
      stryCov_9fa48("44995");
      if (stryMutAct_9fa48("44997") ? false : stryMutAct_9fa48("44996") ? true : (stryCov_9fa48("44996", "44997"), this.monochrome)) {
        if (stryMutAct_9fa48("44998")) {
          {}
        } else {
          stryCov_9fa48("44998");
          return stryMutAct_9fa48("44999") ? "" : (stryCov_9fa48("44999"), 'white');
        }
      }
      const normalizedStatus = stryMutAct_9fa48("45000") ? (status || 'unknown').toUpperCase() : (stryCov_9fa48("45000"), (stryMutAct_9fa48("45003") ? status && 'unknown' : stryMutAct_9fa48("45002") ? false : stryMutAct_9fa48("45001") ? true : (stryCov_9fa48("45001", "45002", "45003"), status || (stryMutAct_9fa48("45004") ? "" : (stryCov_9fa48("45004"), 'unknown')))).toLowerCase());
      return stryMutAct_9fa48("45007") ? STATUS_COLORS[normalizedStatus] && STATUS_COLORS.unknown : stryMutAct_9fa48("45006") ? false : stryMutAct_9fa48("45005") ? true : (stryCov_9fa48("45005", "45006", "45007"), STATUS_COLORS[normalizedStatus] || STATUS_COLORS.unknown);
    }
  }

  /**
   * Get indicator for a status (for monochrome mode)
   * Requirements: 17.6
   * @param {string} status - Status string
   * @return {string} Status indicator
   */
  getStatusIndicator(status) {
    if (stryMutAct_9fa48("45008")) {
      {}
    } else {
      stryCov_9fa48("45008");
      const normalizedStatus = stryMutAct_9fa48("45009") ? (status || 'unknown').toUpperCase() : (stryCov_9fa48("45009"), (stryMutAct_9fa48("45012") ? status && 'unknown' : stryMutAct_9fa48("45011") ? false : stryMutAct_9fa48("45010") ? true : (stryCov_9fa48("45010", "45011", "45012"), status || (stryMutAct_9fa48("45013") ? "" : (stryCov_9fa48("45013"), 'unknown')))).toLowerCase());
      if (stryMutAct_9fa48("45015") ? false : stryMutAct_9fa48("45014") ? true : (stryCov_9fa48("45014", "45015"), this.monochrome)) {
        if (stryMutAct_9fa48("45016")) {
          {}
        } else {
          stryCov_9fa48("45016");
          return stryMutAct_9fa48("45019") ? MONOCHROME_INDICATORS[normalizedStatus] && MONOCHROME_INDICATORS.unknown : stryMutAct_9fa48("45018") ? false : stryMutAct_9fa48("45017") ? true : (stryCov_9fa48("45017", "45018", "45019"), MONOCHROME_INDICATORS[normalizedStatus] || MONOCHROME_INDICATORS.unknown);
        }
      }
      return stryMutAct_9fa48("45020") ? "Stryker was here!" : (stryCov_9fa48("45020"), '');
    }
  }

  /**
   * Get icon for an entity type
   * Requirements: 17.2
   * @param {string} entityType - Entity type
   * @return {string} Entity icon
   */
  getEntityIcon(entityType) {
    if (stryMutAct_9fa48("45021")) {
      {}
    } else {
      stryCov_9fa48("45021");
      const normalizedType = stryMutAct_9fa48("45022") ? (entityType || '').toUpperCase() : (stryCov_9fa48("45022"), (stryMutAct_9fa48("45025") ? entityType && '' : stryMutAct_9fa48("45024") ? false : stryMutAct_9fa48("45023") ? true : (stryCov_9fa48("45023", "45024", "45025"), entityType || (stryMutAct_9fa48("45026") ? "Stryker was here!" : (stryCov_9fa48("45026"), '')))).toLowerCase());
      if (stryMutAct_9fa48("45028") ? false : stryMutAct_9fa48("45027") ? true : (stryCov_9fa48("45027", "45028"), this.monochrome)) {
        if (stryMutAct_9fa48("45029")) {
          {}
        } else {
          stryCov_9fa48("45029");
          return stryMutAct_9fa48("45032") ? MONOCHROME_ENTITY_ICONS[normalizedType] && '[?]' : stryMutAct_9fa48("45031") ? false : stryMutAct_9fa48("45030") ? true : (stryCov_9fa48("45030", "45031", "45032"), MONOCHROME_ENTITY_ICONS[normalizedType] || (stryMutAct_9fa48("45033") ? "" : (stryCov_9fa48("45033"), '[?]')));
        }
      }
      return stryMutAct_9fa48("45036") ? ENTITY_ICONS[normalizedType] && '○' : stryMutAct_9fa48("45035") ? false : stryMutAct_9fa48("45034") ? true : (stryCov_9fa48("45034", "45035", "45036"), ENTITY_ICONS[normalizedType] || (stryMutAct_9fa48("45037") ? "" : (stryCov_9fa48("45037"), '○')));
    }
  }

  /**
   * Get box-drawing characters
   * Requirements: 17.5, 17.6
   * @return {Object} Box characters
   */
  getBoxChars() {
    if (stryMutAct_9fa48("45038")) {
      {}
    } else {
      stryCov_9fa48("45038");
      return this.monochrome ? ASCII_BOX_CHARS : BOX_CHARS;
    }
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
    if (stryMutAct_9fa48("45039")) {
      {}
    } else {
      stryCov_9fa48("45039");
      const chars = this.getBoxChars();
      const double = stryMutAct_9fa48("45042") ? options.double && false : stryMutAct_9fa48("45041") ? false : stryMutAct_9fa48("45040") ? true : (stryCov_9fa48("45040", "45041", "45042"), options.double || (stryMutAct_9fa48("45043") ? true : (stryCov_9fa48("45043"), false)));
      const rounded = stryMutAct_9fa48("45046") ? options.rounded && false : stryMutAct_9fa48("45045") ? false : stryMutAct_9fa48("45044") ? true : (stryCov_9fa48("45044", "45045", "45046"), options.rounded || (stryMutAct_9fa48("45047") ? true : (stryCov_9fa48("45047"), false)));
      let topLeft;
      let topRight;
      let bottomLeft;
      let bottomRight;
      let horizontal;
      let vertical;
      if (stryMutAct_9fa48("45049") ? false : stryMutAct_9fa48("45048") ? true : (stryCov_9fa48("45048", "45049"), double)) {
        if (stryMutAct_9fa48("45050")) {
          {}
        } else {
          stryCov_9fa48("45050");
          topLeft = chars.doubleTopLeft;
          topRight = chars.doubleTopRight;
          bottomLeft = chars.doubleBottomLeft;
          bottomRight = chars.doubleBottomRight;
          horizontal = chars.doubleHorizontal;
          vertical = chars.doubleVertical;
        }
      } else if (stryMutAct_9fa48("45053") ? rounded || !this.monochrome : stryMutAct_9fa48("45052") ? false : stryMutAct_9fa48("45051") ? true : (stryCov_9fa48("45051", "45052", "45053"), rounded && (stryMutAct_9fa48("45054") ? this.monochrome : (stryCov_9fa48("45054"), !this.monochrome)))) {
        if (stryMutAct_9fa48("45055")) {
          {}
        } else {
          stryCov_9fa48("45055");
          topLeft = chars.roundTopLeft;
          topRight = chars.roundTopRight;
          bottomLeft = chars.roundBottomLeft;
          bottomRight = chars.roundBottomRight;
          horizontal = chars.horizontal;
          vertical = chars.vertical;
        }
      } else {
        if (stryMutAct_9fa48("45056")) {
          {}
        } else {
          stryCov_9fa48("45056");
          topLeft = chars.topLeft;
          topRight = chars.topRight;
          bottomLeft = chars.bottomLeft;
          bottomRight = chars.bottomRight;
          horizontal = chars.horizontal;
          vertical = chars.vertical;
        }
      }
      const innerWidth = stryMutAct_9fa48("45057") ? width + 2 : (stryCov_9fa48("45057"), width - 2);
      const topBorder = stryMutAct_9fa48("45058") ? topLeft + horizontal.repeat(innerWidth) - topRight : (stryCov_9fa48("45058"), (stryMutAct_9fa48("45059") ? topLeft - horizontal.repeat(innerWidth) : (stryCov_9fa48("45059"), topLeft + horizontal.repeat(innerWidth))) + topRight);
      const bottomBorder = stryMutAct_9fa48("45060") ? bottomLeft + horizontal.repeat(innerWidth) - bottomRight : (stryCov_9fa48("45060"), (stryMutAct_9fa48("45061") ? bottomLeft - horizontal.repeat(innerWidth) : (stryCov_9fa48("45061"), bottomLeft + horizontal.repeat(innerWidth))) + bottomRight);
      const sideBorder = vertical;
      return stryMutAct_9fa48("45062") ? {} : (stryCov_9fa48("45062"), {
        top: topBorder,
        bottom: bottomBorder,
        left: sideBorder,
        right: sideBorder,
        width,
        height
      });
    }
  }

  /**
   * Get current loading frame
   * Requirements: 17.4
   * @return {string} Loading frame character
   */
  getLoadingFrame() {
    if (stryMutAct_9fa48("45063")) {
      {}
    } else {
      stryCov_9fa48("45063");
      const frames = this.monochrome ? ASCII_LOADING_FRAMES : LOADING_FRAMES;
      return frames[stryMutAct_9fa48("45064") ? this.loadingFrame * frames.length : (stryCov_9fa48("45064"), this.loadingFrame % frames.length)];
    }
  }

  /**
   * Advance loading animation
   * Requirements: 17.4
   */
  advanceLoadingFrame() {
    if (stryMutAct_9fa48("45065")) {
      {}
    } else {
      stryCov_9fa48("45065");
      const frames = this.monochrome ? ASCII_LOADING_FRAMES : LOADING_FRAMES;
      this.loadingFrame = stryMutAct_9fa48("45066") ? (this.loadingFrame + 1) * frames.length : (stryCov_9fa48("45066"), (stryMutAct_9fa48("45067") ? this.loadingFrame - 1 : (stryCov_9fa48("45067"), this.loadingFrame + 1)) % frames.length);
    }
  }

  /**
   * Start loading animation
   * Requirements: 17.4
   * @param {Function} callback - Callback to call on each frame
   * @param {number} [interval=100] - Animation interval in ms
   */
  startLoadingAnimation(callback, interval = 100) {
    if (stryMutAct_9fa48("45068")) {
      {}
    } else {
      stryCov_9fa48("45068");
      this.stopLoadingAnimation();
      this.loadingInterval = setInterval(() => {
        if (stryMutAct_9fa48("45069")) {
          {}
        } else {
          stryCov_9fa48("45069");
          this.advanceLoadingFrame();
          if (stryMutAct_9fa48("45071") ? false : stryMutAct_9fa48("45070") ? true : (stryCov_9fa48("45070", "45071"), callback)) {
            if (stryMutAct_9fa48("45072")) {
              {}
            } else {
              stryCov_9fa48("45072");
              callback(this.getLoadingFrame());
            }
          }
        }
      }, interval);
    }
  }

  /**
   * Stop loading animation
   */
  stopLoadingAnimation() {
    if (stryMutAct_9fa48("45073")) {
      {}
    } else {
      stryCov_9fa48("45073");
      if (stryMutAct_9fa48("45075") ? false : stryMutAct_9fa48("45074") ? true : (stryCov_9fa48("45074", "45075"), this.loadingInterval)) {
        if (stryMutAct_9fa48("45076")) {
          {}
        } else {
          stryCov_9fa48("45076");
          clearInterval(this.loadingInterval);
          this.loadingInterval = null;
        }
      }
      this.loadingFrame = 0;
    }
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
    if (stryMutAct_9fa48("45077")) {
      {}
    } else {
      stryCov_9fa48("45077");
      const normalizedStatus = stryMutAct_9fa48("45078") ? (status || 'unknown').toUpperCase() : (stryCov_9fa48("45078"), (stryMutAct_9fa48("45081") ? status && 'unknown' : stryMutAct_9fa48("45080") ? false : stryMutAct_9fa48("45079") ? true : (stryCov_9fa48("45079", "45080", "45081"), status || (stryMutAct_9fa48("45082") ? "" : (stryCov_9fa48("45082"), 'unknown')))).toLowerCase());
      const color = this.getStatusColor(normalizedStatus);
      const indicator = this.getStatusIndicator(normalizedStatus);
      let text = stryMutAct_9fa48("45085") ? status && 'Unknown' : stryMutAct_9fa48("45084") ? false : stryMutAct_9fa48("45083") ? true : (stryCov_9fa48("45083", "45084", "45085"), status || (stryMutAct_9fa48("45086") ? "" : (stryCov_9fa48("45086"), 'Unknown')));
      if (stryMutAct_9fa48("45089") ? this.monochrome || indicator : stryMutAct_9fa48("45088") ? false : stryMutAct_9fa48("45087") ? true : (stryCov_9fa48("45087", "45088", "45089"), this.monochrome && indicator)) {
        if (stryMutAct_9fa48("45090")) {
          {}
        } else {
          stryCov_9fa48("45090");
          text = stryMutAct_9fa48("45091") ? `` : (stryCov_9fa48("45091"), `${indicator} ${text}`);
        }
      } else if (stryMutAct_9fa48("45094") ? options.includeIcon || !this.monochrome : stryMutAct_9fa48("45093") ? false : stryMutAct_9fa48("45092") ? true : (stryCov_9fa48("45092", "45093", "45094"), options.includeIcon && (stryMutAct_9fa48("45095") ? this.monochrome : (stryCov_9fa48("45095"), !this.monochrome)))) {
        if (stryMutAct_9fa48("45096")) {
          {}
        } else {
          stryCov_9fa48("45096");
          const icon = stryMutAct_9fa48("45099") ? ENTITY_ICONS[normalizedStatus] && '' : stryMutAct_9fa48("45098") ? false : stryMutAct_9fa48("45097") ? true : (stryCov_9fa48("45097", "45098", "45099"), ENTITY_ICONS[normalizedStatus] || (stryMutAct_9fa48("45100") ? "Stryker was here!" : (stryCov_9fa48("45100"), '')));
          if (stryMutAct_9fa48("45102") ? false : stryMutAct_9fa48("45101") ? true : (stryCov_9fa48("45101", "45102"), icon)) {
            if (stryMutAct_9fa48("45103")) {
              {}
            } else {
              stryCov_9fa48("45103");
              text = stryMutAct_9fa48("45104") ? `` : (stryCov_9fa48("45104"), `${icon} ${text}`);
            }
          }
        }
      }
      return stryMutAct_9fa48("45105") ? {} : (stryCov_9fa48("45105"), {
        text,
        color,
        status: normalizedStatus
      });
    }
  }

  /**
   * Format an entity with icon
   * Requirements: 17.2
   * @param {string} entityType - Entity type
   * @param {string} entityId - Entity ID or name
   * @return {Object} Formatted entity
   */
  formatEntity(entityType, entityId) {
    if (stryMutAct_9fa48("45106")) {
      {}
    } else {
      stryCov_9fa48("45106");
      const icon = this.getEntityIcon(entityType);
      return stryMutAct_9fa48("45107") ? {} : (stryCov_9fa48("45107"), {
        text: stryMutAct_9fa48("45108") ? `` : (stryCov_9fa48("45108"), `${icon} ${entityId}`),
        icon,
        entityType,
        entityId
      });
    }
  }

  /**
   * Create a loading indicator string
   * Requirements: 17.4
   * @param {string} [message] - Optional loading message
   * @return {Object} Loading indicator
   */
  createLoadingIndicator(message = stryMutAct_9fa48("45109") ? "" : (stryCov_9fa48("45109"), 'Loading')) {
    if (stryMutAct_9fa48("45110")) {
      {}
    } else {
      stryCov_9fa48("45110");
      const frame = this.getLoadingFrame();
      return stryMutAct_9fa48("45111") ? {} : (stryCov_9fa48("45111"), {
        text: stryMutAct_9fa48("45112") ? `` : (stryCov_9fa48("45112"), `${frame} ${message}...`),
        frame,
        message,
        color: this.getStatusColor(stryMutAct_9fa48("45113") ? "" : (stryCov_9fa48("45113"), 'loading'))
      });
    }
  }

  /**
   * Create a progress bar
   * @param {number} progress - Progress value (0-100)
   * @param {number} width - Bar width in characters
   * @return {Object} Progress bar
   */
  createProgressBar(progress, width = 20) {
    if (stryMutAct_9fa48("45114")) {
      {}
    } else {
      stryCov_9fa48("45114");
      const clampedProgress = stryMutAct_9fa48("45115") ? Math.min(0, Math.min(100, progress)) : (stryCov_9fa48("45115"), Math.max(0, stryMutAct_9fa48("45116") ? Math.max(100, progress) : (stryCov_9fa48("45116"), Math.min(100, progress))));
      const filledWidth = Math.round(stryMutAct_9fa48("45117") ? clampedProgress / 100 / (width - 2) : (stryCov_9fa48("45117"), (stryMutAct_9fa48("45118") ? clampedProgress * 100 : (stryCov_9fa48("45118"), clampedProgress / 100)) * (stryMutAct_9fa48("45119") ? width + 2 : (stryCov_9fa48("45119"), width - 2))));
      const emptyWidth = stryMutAct_9fa48("45120") ? width - 2 + filledWidth : (stryCov_9fa48("45120"), (stryMutAct_9fa48("45121") ? width + 2 : (stryCov_9fa48("45121"), width - 2)) - filledWidth);
      const chars = this.getBoxChars();
      const filled = this.monochrome ? stryMutAct_9fa48("45122") ? "" : (stryCov_9fa48("45122"), '#') : stryMutAct_9fa48("45123") ? "" : (stryCov_9fa48("45123"), '█');
      const empty = this.monochrome ? stryMutAct_9fa48("45124") ? "" : (stryCov_9fa48("45124"), '-') : stryMutAct_9fa48("45125") ? "" : (stryCov_9fa48("45125"), '░');
      const bar = stryMutAct_9fa48("45126") ? chars.vertical + filled.repeat(filledWidth) + empty.repeat(emptyWidth) - chars.vertical : (stryCov_9fa48("45126"), (stryMutAct_9fa48("45127") ? chars.vertical + filled.repeat(filledWidth) - empty.repeat(emptyWidth) : (stryCov_9fa48("45127"), (stryMutAct_9fa48("45128") ? chars.vertical - filled.repeat(filledWidth) : (stryCov_9fa48("45128"), chars.vertical + filled.repeat(filledWidth))) + empty.repeat(emptyWidth))) + chars.vertical);
      return stryMutAct_9fa48("45129") ? {} : (stryCov_9fa48("45129"), {
        text: bar,
        progress: clampedProgress,
        width
      });
    }
  }

  /**
   * Highlight selected row
   * Requirements: 17.3
   * @param {string} text - Row text
   * @param {boolean} isSelected - Whether row is selected
   * @return {Object} Highlighted row
   */
  highlightSelected(text, isSelected) {
    if (stryMutAct_9fa48("45130")) {
      {}
    } else {
      stryCov_9fa48("45130");
      if (stryMutAct_9fa48("45132") ? false : stryMutAct_9fa48("45131") ? true : (stryCov_9fa48("45131", "45132"), isSelected)) {
        if (stryMutAct_9fa48("45133")) {
          {}
        } else {
          stryCov_9fa48("45133");
          return stryMutAct_9fa48("45134") ? {} : (stryCov_9fa48("45134"), {
            text,
            style: stryMutAct_9fa48("45135") ? "" : (stryCov_9fa48("45135"), 'inverse'),
            isSelected: stryMutAct_9fa48("45136") ? false : (stryCov_9fa48("45136"), true)
          });
        }
      }
      return stryMutAct_9fa48("45137") ? {} : (stryCov_9fa48("45137"), {
        text,
        style: stryMutAct_9fa48("45138") ? "" : (stryCov_9fa48("45138"), 'normal'),
        isSelected: stryMutAct_9fa48("45139") ? true : (stryCov_9fa48("45139"), false)
      });
    }
  }

  /**
   * Apply color to text (returns formatting info)
   * @param {string} text - Text to color
   * @param {string} color - Color name
   * @return {Object} Colored text info
   */
  colorize(text, color) {
    if (stryMutAct_9fa48("45140")) {
      {}
    } else {
      stryCov_9fa48("45140");
      if (stryMutAct_9fa48("45142") ? false : stryMutAct_9fa48("45141") ? true : (stryCov_9fa48("45141", "45142"), this.monochrome)) {
        if (stryMutAct_9fa48("45143")) {
          {}
        } else {
          stryCov_9fa48("45143");
          return stryMutAct_9fa48("45144") ? {} : (stryCov_9fa48("45144"), {
            text,
            color: stryMutAct_9fa48("45145") ? "" : (stryCov_9fa48("45145"), 'white')
          });
        }
      }
      return stryMutAct_9fa48("45146") ? {} : (stryCov_9fa48("45146"), {
        text,
        color
      });
    }
  }

  /**
   * Create a horizontal separator
   * @param {number} width - Separator width
   * @param {Object} options - Options
   * @param {boolean} [options.double] - Use double line
   * @return {string} Separator string
   */
  createSeparator(width, options = {}) {
    if (stryMutAct_9fa48("45147")) {
      {}
    } else {
      stryCov_9fa48("45147");
      const chars = this.getBoxChars();
      const char = options.double ? chars.doubleHorizontal : chars.horizontal;
      return char.repeat(width);
    }
  }

  /**
   * Create a vertical separator
   * @param {number} height - Separator height
   * @param {Object} options - Options
   * @param {boolean} [options.double] - Use double line
   * @return {Array<string>} Separator lines
   */
  createVerticalSeparator(height, options = {}) {
    if (stryMutAct_9fa48("45148")) {
      {}
    } else {
      stryCov_9fa48("45148");
      const chars = this.getBoxChars();
      const char = options.double ? chars.doubleVertical : chars.vertical;
      return stryMutAct_9fa48("45149") ? Array().fill(char) : (stryCov_9fa48("45149"), Array(height).fill(char));
    }
  }

  /**
   * Destroy and cleanup
   */
  destroy() {
    if (stryMutAct_9fa48("45150")) {
      {}
    } else {
      stryCov_9fa48("45150");
      this.stopLoadingAnimation();
    }
  }
}