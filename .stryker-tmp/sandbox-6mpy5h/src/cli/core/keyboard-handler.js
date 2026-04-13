/**
 * KeyboardHandler - Centralized keyboard navigation and input handling
 *
 * Handles arrow keys, Page Up/Down, Home/End, number keys for view switching,
 * filter mode ('/'), command mode (':'), quit ('q'), and Escape for cancel/back.
 *
 * Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.8
 */
// @ts-nocheck


/**
 * Input modes for the keyboard handler
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
export const INPUT_MODE = stryMutAct_9fa48("42735") ? {} : (stryCov_9fa48("42735"), {
  NORMAL: stryMutAct_9fa48("42736") ? "" : (stryCov_9fa48("42736"), 'normal'),
  FILTER: stryMutAct_9fa48("42737") ? "" : (stryCov_9fa48("42737"), 'filter'),
  COMMAND: stryMutAct_9fa48("42738") ? "" : (stryCov_9fa48("42738"), 'command')
});

/**
 * View mapping for number keys
 */
export const VIEW_KEYS = stryMutAct_9fa48("42739") ? {} : (stryCov_9fa48("42739"), {
  '1': stryMutAct_9fa48("42740") ? "" : (stryCov_9fa48("42740"), 'nodes'),
  '2': stryMutAct_9fa48("42741") ? "" : (stryCov_9fa48("42741"), 'replicas'),
  '3': stryMutAct_9fa48("42742") ? "" : (stryCov_9fa48("42742"), 'tables'),
  '4': stryMutAct_9fa48("42743") ? "" : (stryCov_9fa48("42743"), 'partitions'),
  '5': stryMutAct_9fa48("42744") ? "" : (stryCov_9fa48("42744"), 'message_groups'),
  '6': stryMutAct_9fa48("42745") ? "" : (stryCov_9fa48("42745"), 'sql'),
  '7': stryMutAct_9fa48("42746") ? "" : (stryCov_9fa48("42746"), 'logs'),
  '8': stryMutAct_9fa48("42747") ? "" : (stryCov_9fa48("42747"), 'config'),
  '9': stryMutAct_9fa48("42748") ? "" : (stryCov_9fa48("42748"), 'contexts'),
  '0': stryMutAct_9fa48("42749") ? "" : (stryCov_9fa48("42749"), 'services')
});

/**
 * @typedef {Object} KeyEvent
 * @property {string} name - Key name (e.g., 'up', 'down', 'enter')
 * @property {string} [ch] - Character for printable keys
 * @property {boolean} [ctrl] - Ctrl modifier
 * @property {boolean} [shift] - Shift modifier
 * @property {boolean} [meta] - Meta/Alt modifier
 * @property {string} [full] - Full key name with modifiers
 */

/**
 * @typedef {Object} KeyboardAction
 * @property {string} type - Action type
 * @property {*} [payload] - Action payload
 */

/**
 * KeyboardHandler class for centralized keyboard input handling
 */
export class KeyboardHandler {
  /**
   * @param {Object} options - Configuration options
   * @param {import('./event-bus.js').EventBus} [options.eventBus] - Event bus
   * @param {import('./state-manager.js').StateManager} [options.stateManager] - State
   * @param {import('./navigation-controller.js').NavigationController} [options.navigation]
   * @param {import('./command-parser.js').CommandParser} [options.commandParser] - Parser
   * @param {import('./help-overlay.js').HelpOverlay} [options.helpOverlay] - Help overlay
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("42750")) {
      {}
    } else {
      stryCov_9fa48("42750");
      this.eventBus = stryMutAct_9fa48("42753") ? options.eventBus && null : stryMutAct_9fa48("42752") ? false : stryMutAct_9fa48("42751") ? true : (stryCov_9fa48("42751", "42752", "42753"), options.eventBus || null);
      this.stateManager = stryMutAct_9fa48("42756") ? options.stateManager && null : stryMutAct_9fa48("42755") ? false : stryMutAct_9fa48("42754") ? true : (stryCov_9fa48("42754", "42755", "42756"), options.stateManager || null);
      this.navigation = stryMutAct_9fa48("42759") ? options.navigation && null : stryMutAct_9fa48("42758") ? false : stryMutAct_9fa48("42757") ? true : (stryCov_9fa48("42757", "42758", "42759"), options.navigation || null);
      this.commandParser = stryMutAct_9fa48("42762") ? options.commandParser && null : stryMutAct_9fa48("42761") ? false : stryMutAct_9fa48("42760") ? true : (stryCov_9fa48("42760", "42761", "42762"), options.commandParser || null);
      this.helpOverlay = stryMutAct_9fa48("42765") ? options.helpOverlay && null : stryMutAct_9fa48("42764") ? false : stryMutAct_9fa48("42763") ? true : (stryCov_9fa48("42763", "42764", "42765"), options.helpOverlay || null);

      // Current input mode
      this.mode = INPUT_MODE.NORMAL;

      // Input buffer for filter/command modes
      this.inputBuffer = stryMutAct_9fa48("42766") ? "Stryker was here!" : (stryCov_9fa48("42766"), '');

      // Page size for Page Up/Down
      this.pageSize = stryMutAct_9fa48("42769") ? options.pageSize && 10 : stryMutAct_9fa48("42768") ? false : stryMutAct_9fa48("42767") ? true : (stryCov_9fa48("42767", "42768", "42769"), options.pageSize || 10);

      // Callbacks for mode changes
      this.onModeChange = stryMutAct_9fa48("42772") ? options.onModeChange && null : stryMutAct_9fa48("42771") ? false : stryMutAct_9fa48("42770") ? true : (stryCov_9fa48("42770", "42771", "42772"), options.onModeChange || null);
      this.onInputChange = stryMutAct_9fa48("42775") ? options.onInputChange && null : stryMutAct_9fa48("42774") ? false : stryMutAct_9fa48("42773") ? true : (stryCov_9fa48("42773", "42774", "42775"), options.onInputChange || null);
      this.onAction = stryMutAct_9fa48("42778") ? options.onAction && null : stryMutAct_9fa48("42777") ? false : stryMutAct_9fa48("42776") ? true : (stryCov_9fa48("42776", "42777", "42778"), options.onAction || null);
    }
  }

  /**
   * Handle a key event
   * @param {KeyEvent} key - Key event
   * @returns {KeyboardAction|null} Action to perform, or null if not handled
   */
  handleKey(key) {
    if (stryMutAct_9fa48("42779")) {
      {}
    } else {
      stryCov_9fa48("42779");
      // Help overlay takes priority
      if (stryMutAct_9fa48("42782") ? this.helpOverlay || this.helpOverlay.isVisible() : stryMutAct_9fa48("42781") ? false : stryMutAct_9fa48("42780") ? true : (stryCov_9fa48("42780", "42781", "42782"), this.helpOverlay && this.helpOverlay.isVisible())) {
        if (stryMutAct_9fa48("42783")) {
          {}
        } else {
          stryCov_9fa48("42783");
          this.helpOverlay.handleKey(key);
          return stryMutAct_9fa48("42784") ? {} : (stryCov_9fa48("42784"), {
            type: stryMutAct_9fa48("42785") ? "" : (stryCov_9fa48("42785"), 'help:dismiss')
          });
        }
      }

      // Route based on current mode
      if (stryMutAct_9fa48("42788") ? this.mode !== INPUT_MODE.FILTER : stryMutAct_9fa48("42787") ? false : stryMutAct_9fa48("42786") ? true : (stryCov_9fa48("42786", "42787", "42788"), this.mode === INPUT_MODE.FILTER)) {
        if (stryMutAct_9fa48("42789")) {
          {}
        } else {
          stryCov_9fa48("42789");
          return this.handleFilterMode(key);
        }
      }
      if (stryMutAct_9fa48("42792") ? this.mode !== INPUT_MODE.COMMAND : stryMutAct_9fa48("42791") ? false : stryMutAct_9fa48("42790") ? true : (stryCov_9fa48("42790", "42791", "42792"), this.mode === INPUT_MODE.COMMAND)) {
        if (stryMutAct_9fa48("42793")) {
          {}
        } else {
          stryCov_9fa48("42793");
          return this.handleCommandMode(key);
        }
      }
      return this.handleNormalMode(key);
    }
  }

  /**
   * Handle key in normal mode
   * @param {KeyEvent} key - Key event
   * @returns {KeyboardAction|null}
   */
  handleNormalMode(key) {
    if (stryMutAct_9fa48("42794")) {
      {}
    } else {
      stryCov_9fa48("42794");
      const keyName = stryMutAct_9fa48("42797") ? (key.full || key.name) && '' : stryMutAct_9fa48("42796") ? false : stryMutAct_9fa48("42795") ? true : (stryCov_9fa48("42795", "42796", "42797"), (stryMutAct_9fa48("42799") ? key.full && key.name : stryMutAct_9fa48("42798") ? false : (stryCov_9fa48("42798", "42799"), key.full || key.name)) || (stryMutAct_9fa48("42800") ? "Stryker was here!" : (stryCov_9fa48("42800"), '')));

      // Navigation keys
      if (stryMutAct_9fa48("42803") ? keyName !== 'up' : stryMutAct_9fa48("42802") ? false : stryMutAct_9fa48("42801") ? true : (stryCov_9fa48("42801", "42802", "42803"), keyName === (stryMutAct_9fa48("42804") ? "" : (stryCov_9fa48("42804"), 'up')))) {
        if (stryMutAct_9fa48("42805")) {
          {}
        } else {
          stryCov_9fa48("42805");
          return this.emitAction(stryMutAct_9fa48("42806") ? "" : (stryCov_9fa48("42806"), 'navigate:up'));
        }
      }
      if (stryMutAct_9fa48("42809") ? keyName !== 'down' : stryMutAct_9fa48("42808") ? false : stryMutAct_9fa48("42807") ? true : (stryCov_9fa48("42807", "42808", "42809"), keyName === (stryMutAct_9fa48("42810") ? "" : (stryCov_9fa48("42810"), 'down')))) {
        if (stryMutAct_9fa48("42811")) {
          {}
        } else {
          stryCov_9fa48("42811");
          return this.emitAction(stryMutAct_9fa48("42812") ? "" : (stryCov_9fa48("42812"), 'navigate:down'));
        }
      }
      if (stryMutAct_9fa48("42815") ? keyName !== 'pageup' : stryMutAct_9fa48("42814") ? false : stryMutAct_9fa48("42813") ? true : (stryCov_9fa48("42813", "42814", "42815"), keyName === (stryMutAct_9fa48("42816") ? "" : (stryCov_9fa48("42816"), 'pageup')))) {
        if (stryMutAct_9fa48("42817")) {
          {}
        } else {
          stryCov_9fa48("42817");
          return this.emitAction(stryMutAct_9fa48("42818") ? "" : (stryCov_9fa48("42818"), 'navigate:pageup'), stryMutAct_9fa48("42819") ? {} : (stryCov_9fa48("42819"), {
            count: this.pageSize
          }));
        }
      }
      if (stryMutAct_9fa48("42822") ? keyName !== 'pagedown' : stryMutAct_9fa48("42821") ? false : stryMutAct_9fa48("42820") ? true : (stryCov_9fa48("42820", "42821", "42822"), keyName === (stryMutAct_9fa48("42823") ? "" : (stryCov_9fa48("42823"), 'pagedown')))) {
        if (stryMutAct_9fa48("42824")) {
          {}
        } else {
          stryCov_9fa48("42824");
          return this.emitAction(stryMutAct_9fa48("42825") ? "" : (stryCov_9fa48("42825"), 'navigate:pagedown'), stryMutAct_9fa48("42826") ? {} : (stryCov_9fa48("42826"), {
            count: this.pageSize
          }));
        }
      }
      if (stryMutAct_9fa48("42829") ? keyName !== 'home' : stryMutAct_9fa48("42828") ? false : stryMutAct_9fa48("42827") ? true : (stryCov_9fa48("42827", "42828", "42829"), keyName === (stryMutAct_9fa48("42830") ? "" : (stryCov_9fa48("42830"), 'home')))) {
        if (stryMutAct_9fa48("42831")) {
          {}
        } else {
          stryCov_9fa48("42831");
          return this.emitAction(stryMutAct_9fa48("42832") ? "" : (stryCov_9fa48("42832"), 'navigate:first'));
        }
      }
      if (stryMutAct_9fa48("42835") ? keyName !== 'end' : stryMutAct_9fa48("42834") ? false : stryMutAct_9fa48("42833") ? true : (stryCov_9fa48("42833", "42834", "42835"), keyName === (stryMutAct_9fa48("42836") ? "" : (stryCov_9fa48("42836"), 'end')))) {
        if (stryMutAct_9fa48("42837")) {
          {}
        } else {
          stryCov_9fa48("42837");
          return this.emitAction(stryMutAct_9fa48("42838") ? "" : (stryCov_9fa48("42838"), 'navigate:last'));
        }
      }
      if (stryMutAct_9fa48("42841") ? keyName !== 'enter' : stryMutAct_9fa48("42840") ? false : stryMutAct_9fa48("42839") ? true : (stryCov_9fa48("42839", "42840", "42841"), keyName === (stryMutAct_9fa48("42842") ? "" : (stryCov_9fa48("42842"), 'enter')))) {
        if (stryMutAct_9fa48("42843")) {
          {}
        } else {
          stryCov_9fa48("42843");
          return this.emitAction(stryMutAct_9fa48("42844") ? "" : (stryCov_9fa48("42844"), 'navigate:select'));
        }
      }
      if (stryMutAct_9fa48("42847") ? keyName === 'escape' && keyName === 'backspace' : stryMutAct_9fa48("42846") ? false : stryMutAct_9fa48("42845") ? true : (stryCov_9fa48("42845", "42846", "42847"), (stryMutAct_9fa48("42849") ? keyName !== 'escape' : stryMutAct_9fa48("42848") ? false : (stryCov_9fa48("42848", "42849"), keyName === (stryMutAct_9fa48("42850") ? "" : (stryCov_9fa48("42850"), 'escape')))) || (stryMutAct_9fa48("42852") ? keyName !== 'backspace' : stryMutAct_9fa48("42851") ? false : (stryCov_9fa48("42851", "42852"), keyName === (stryMutAct_9fa48("42853") ? "" : (stryCov_9fa48("42853"), 'backspace')))))) {
        if (stryMutAct_9fa48("42854")) {
          {}
        } else {
          stryCov_9fa48("42854");
          return this.emitAction(stryMutAct_9fa48("42855") ? "" : (stryCov_9fa48("42855"), 'navigate:back'));
        }
      }

      // Check for character keys
      const ch = stryMutAct_9fa48("42858") ? key.ch && '' : stryMutAct_9fa48("42857") ? false : stryMutAct_9fa48("42856") ? true : (stryCov_9fa48("42856", "42857", "42858"), key.ch || (stryMutAct_9fa48("42859") ? "Stryker was here!" : (stryCov_9fa48("42859"), '')));

      // Number keys for view switching
      if (stryMutAct_9fa48("42861") ? false : stryMutAct_9fa48("42860") ? true : (stryCov_9fa48("42860", "42861"), VIEW_KEYS[ch])) {
        if (stryMutAct_9fa48("42862")) {
          {}
        } else {
          stryCov_9fa48("42862");
          return this.emitAction(stryMutAct_9fa48("42863") ? "" : (stryCov_9fa48("42863"), 'view:switch'), stryMutAct_9fa48("42864") ? {} : (stryCov_9fa48("42864"), {
            view: VIEW_KEYS[ch]
          }));
        }
      }

      // Mode switching
      if (stryMutAct_9fa48("42867") ? ch !== '/' : stryMutAct_9fa48("42866") ? false : stryMutAct_9fa48("42865") ? true : (stryCov_9fa48("42865", "42866", "42867"), ch === (stryMutAct_9fa48("42868") ? "" : (stryCov_9fa48("42868"), '/')))) {
        if (stryMutAct_9fa48("42869")) {
          {}
        } else {
          stryCov_9fa48("42869");
          this.enterFilterMode();
          return stryMutAct_9fa48("42870") ? {} : (stryCov_9fa48("42870"), {
            type: stryMutAct_9fa48("42871") ? "" : (stryCov_9fa48("42871"), 'mode:filter')
          });
        }
      }
      if (stryMutAct_9fa48("42874") ? ch !== ':' : stryMutAct_9fa48("42873") ? false : stryMutAct_9fa48("42872") ? true : (stryCov_9fa48("42872", "42873", "42874"), ch === (stryMutAct_9fa48("42875") ? "" : (stryCov_9fa48("42875"), ':')))) {
        if (stryMutAct_9fa48("42876")) {
          {}
        } else {
          stryCov_9fa48("42876");
          this.enterCommandMode();
          return stryMutAct_9fa48("42877") ? {} : (stryCov_9fa48("42877"), {
            type: stryMutAct_9fa48("42878") ? "" : (stryCov_9fa48("42878"), 'mode:command')
          });
        }
      }

      // Help
      if (stryMutAct_9fa48("42881") ? ch !== '?' : stryMutAct_9fa48("42880") ? false : stryMutAct_9fa48("42879") ? true : (stryCov_9fa48("42879", "42880", "42881"), ch === (stryMutAct_9fa48("42882") ? "" : (stryCov_9fa48("42882"), '?')))) {
        if (stryMutAct_9fa48("42883")) {
          {}
        } else {
          stryCov_9fa48("42883");
          if (stryMutAct_9fa48("42885") ? false : stryMutAct_9fa48("42884") ? true : (stryCov_9fa48("42884", "42885"), this.helpOverlay)) {
            if (stryMutAct_9fa48("42886")) {
              {}
            } else {
              stryCov_9fa48("42886");
              this.helpOverlay.show();
            }
          }
          return stryMutAct_9fa48("42887") ? {} : (stryCov_9fa48("42887"), {
            type: stryMutAct_9fa48("42888") ? "" : (stryCov_9fa48("42888"), 'help:show')
          });
        }
      }

      // Quit
      if (stryMutAct_9fa48("42891") ? ch !== 'q' : stryMutAct_9fa48("42890") ? false : stryMutAct_9fa48("42889") ? true : (stryCov_9fa48("42889", "42890", "42891"), ch === (stryMutAct_9fa48("42892") ? "" : (stryCov_9fa48("42892"), 'q')))) {
        if (stryMutAct_9fa48("42893")) {
          {}
        } else {
          stryCov_9fa48("42893");
          return this.emitAction(stryMutAct_9fa48("42894") ? "" : (stryCov_9fa48("42894"), 'app:quit'));
        }
      }

      // Detail panel
      if (stryMutAct_9fa48("42897") ? ch !== 'd' : stryMutAct_9fa48("42896") ? false : stryMutAct_9fa48("42895") ? true : (stryCov_9fa48("42895", "42896", "42897"), ch === (stryMutAct_9fa48("42898") ? "" : (stryCov_9fa48("42898"), 'd')))) {
        if (stryMutAct_9fa48("42899")) {
          {}
        } else {
          stryCov_9fa48("42899");
          return this.emitAction(stryMutAct_9fa48("42900") ? "" : (stryCov_9fa48("42900"), 'detail:toggle'));
        }
      }

      // Refresh
      if (stryMutAct_9fa48("42903") ? ch !== 'r' : stryMutAct_9fa48("42902") ? false : stryMutAct_9fa48("42901") ? true : (stryCov_9fa48("42901", "42902", "42903"), ch === (stryMutAct_9fa48("42904") ? "" : (stryCov_9fa48("42904"), 'r')))) {
        if (stryMutAct_9fa48("42905")) {
          {}
        } else {
          stryCov_9fa48("42905");
          return this.emitAction(stryMutAct_9fa48("42906") ? "" : (stryCov_9fa48("42906"), 'cache:refresh'));
        }
      }

      // CDC Pause/Resume toggle
      // Requirements: 12.6
      if (stryMutAct_9fa48("42909") ? ch !== 'p' : stryMutAct_9fa48("42908") ? false : stryMutAct_9fa48("42907") ? true : (stryCov_9fa48("42907", "42908", "42909"), ch === (stryMutAct_9fa48("42910") ? "" : (stryCov_9fa48("42910"), 'p')))) {
        if (stryMutAct_9fa48("42911")) {
          {}
        } else {
          stryCov_9fa48("42911");
          return this.emitAction(stryMutAct_9fa48("42912") ? "" : (stryCov_9fa48("42912"), 'cdc:toggle-pause'));
        }
      }

      // Sort
      if (stryMutAct_9fa48("42915") ? ch !== 's' : stryMutAct_9fa48("42914") ? false : stryMutAct_9fa48("42913") ? true : (stryCov_9fa48("42913", "42914", "42915"), ch === (stryMutAct_9fa48("42916") ? "" : (stryCov_9fa48("42916"), 's')))) {
        if (stryMutAct_9fa48("42917")) {
          {}
        } else {
          stryCov_9fa48("42917");
          return this.emitAction(stryMutAct_9fa48("42918") ? "" : (stryCov_9fa48("42918"), 'view:sort'));
        }
      }

      // Edit (for config view)
      if (stryMutAct_9fa48("42921") ? ch !== 'e' : stryMutAct_9fa48("42920") ? false : stryMutAct_9fa48("42919") ? true : (stryCov_9fa48("42919", "42920", "42921"), ch === (stryMutAct_9fa48("42922") ? "" : (stryCov_9fa48("42922"), 'e')))) {
        if (stryMutAct_9fa48("42923")) {
          {}
        } else {
          stryCov_9fa48("42923");
          return this.emitAction(stryMutAct_9fa48("42924") ? "" : (stryCov_9fa48("42924"), 'config:edit'));
        }
      }

      // Revert to default (for config view)
      if (stryMutAct_9fa48("42927") ? ch !== 'R' : stryMutAct_9fa48("42926") ? false : stryMutAct_9fa48("42925") ? true : (stryCov_9fa48("42925", "42926", "42927"), ch === (stryMutAct_9fa48("42928") ? "" : (stryCov_9fa48("42928"), 'R')))) {
        if (stryMutAct_9fa48("42929")) {
          {}
        } else {
          stryCov_9fa48("42929");
          return this.emitAction(stryMutAct_9fa48("42930") ? "" : (stryCov_9fa48("42930"), 'config:revert'));
        }
      }

      // Ctrl+C for force quit
      if (stryMutAct_9fa48("42933") ? key.ctrl || ch === 'c' : stryMutAct_9fa48("42932") ? false : stryMutAct_9fa48("42931") ? true : (stryCov_9fa48("42931", "42932", "42933"), key.ctrl && (stryMutAct_9fa48("42935") ? ch !== 'c' : stryMutAct_9fa48("42934") ? true : (stryCov_9fa48("42934", "42935"), ch === (stryMutAct_9fa48("42936") ? "" : (stryCov_9fa48("42936"), 'c')))))) {
        if (stryMutAct_9fa48("42937")) {
          {}
        } else {
          stryCov_9fa48("42937");
          return this.emitAction(stryMutAct_9fa48("42938") ? "" : (stryCov_9fa48("42938"), 'app:force-quit'));
        }
      }
      return null;
    }
  }

  /**
   * Handle key in filter mode
   * @param {KeyEvent} key - Key event
   * @returns {KeyboardAction|null}
   */
  handleFilterMode(key) {
    if (stryMutAct_9fa48("42939")) {
      {}
    } else {
      stryCov_9fa48("42939");
      const keyName = stryMutAct_9fa48("42942") ? (key.full || key.name) && '' : stryMutAct_9fa48("42941") ? false : stryMutAct_9fa48("42940") ? true : (stryCov_9fa48("42940", "42941", "42942"), (stryMutAct_9fa48("42944") ? key.full && key.name : stryMutAct_9fa48("42943") ? false : (stryCov_9fa48("42943", "42944"), key.full || key.name)) || (stryMutAct_9fa48("42945") ? "Stryker was here!" : (stryCov_9fa48("42945"), '')));

      // Escape exits filter mode
      if (stryMutAct_9fa48("42948") ? keyName !== 'escape' : stryMutAct_9fa48("42947") ? false : stryMutAct_9fa48("42946") ? true : (stryCov_9fa48("42946", "42947", "42948"), keyName === (stryMutAct_9fa48("42949") ? "" : (stryCov_9fa48("42949"), 'escape')))) {
        if (stryMutAct_9fa48("42950")) {
          {}
        } else {
          stryCov_9fa48("42950");
          this.exitInputMode();
          return stryMutAct_9fa48("42951") ? {} : (stryCov_9fa48("42951"), {
            type: stryMutAct_9fa48("42952") ? "" : (stryCov_9fa48("42952"), 'filter:cancel')
          });
        }
      }

      // Enter applies filter
      if (stryMutAct_9fa48("42955") ? keyName !== 'enter' : stryMutAct_9fa48("42954") ? false : stryMutAct_9fa48("42953") ? true : (stryCov_9fa48("42953", "42954", "42955"), keyName === (stryMutAct_9fa48("42956") ? "" : (stryCov_9fa48("42956"), 'enter')))) {
        if (stryMutAct_9fa48("42957")) {
          {}
        } else {
          stryCov_9fa48("42957");
          const filter = this.inputBuffer;
          this.exitInputMode();
          return this.emitAction(stryMutAct_9fa48("42958") ? "" : (stryCov_9fa48("42958"), 'filter:apply'), stryMutAct_9fa48("42959") ? {} : (stryCov_9fa48("42959"), {
            pattern: filter
          }));
        }
      }

      // Backspace removes character
      if (stryMutAct_9fa48("42962") ? keyName !== 'backspace' : stryMutAct_9fa48("42961") ? false : stryMutAct_9fa48("42960") ? true : (stryCov_9fa48("42960", "42961", "42962"), keyName === (stryMutAct_9fa48("42963") ? "" : (stryCov_9fa48("42963"), 'backspace')))) {
        if (stryMutAct_9fa48("42964")) {
          {}
        } else {
          stryCov_9fa48("42964");
          if (stryMutAct_9fa48("42968") ? this.inputBuffer.length <= 0 : stryMutAct_9fa48("42967") ? this.inputBuffer.length >= 0 : stryMutAct_9fa48("42966") ? false : stryMutAct_9fa48("42965") ? true : (stryCov_9fa48("42965", "42966", "42967", "42968"), this.inputBuffer.length > 0)) {
            if (stryMutAct_9fa48("42969")) {
              {}
            } else {
              stryCov_9fa48("42969");
              this.inputBuffer = stryMutAct_9fa48("42970") ? this.inputBuffer : (stryCov_9fa48("42970"), this.inputBuffer.slice(0, stryMutAct_9fa48("42971") ? +1 : (stryCov_9fa48("42971"), -1)));
              this.notifyInputChange();
            }
          }
          return stryMutAct_9fa48("42972") ? {} : (stryCov_9fa48("42972"), {
            type: stryMutAct_9fa48("42973") ? "" : (stryCov_9fa48("42973"), 'filter:input'),
            value: this.inputBuffer
          });
        }
      }

      // Add printable characters
      if (stryMutAct_9fa48("42976") ? key.ch || key.ch.length === 1 : stryMutAct_9fa48("42975") ? false : stryMutAct_9fa48("42974") ? true : (stryCov_9fa48("42974", "42975", "42976"), key.ch && (stryMutAct_9fa48("42978") ? key.ch.length !== 1 : stryMutAct_9fa48("42977") ? true : (stryCov_9fa48("42977", "42978"), key.ch.length === 1)))) {
        if (stryMutAct_9fa48("42979")) {
          {}
        } else {
          stryCov_9fa48("42979");
          stryMutAct_9fa48("42980") ? this.inputBuffer -= key.ch : (stryCov_9fa48("42980"), this.inputBuffer += key.ch);
          this.notifyInputChange();
          return stryMutAct_9fa48("42981") ? {} : (stryCov_9fa48("42981"), {
            type: stryMutAct_9fa48("42982") ? "" : (stryCov_9fa48("42982"), 'filter:input'),
            value: this.inputBuffer
          });
        }
      }
      return null;
    }
  }

  /**
   * Handle key in command mode
   * @param {KeyEvent} key - Key event
   * @returns {KeyboardAction|null}
   */
  handleCommandMode(key) {
    if (stryMutAct_9fa48("42983")) {
      {}
    } else {
      stryCov_9fa48("42983");
      const keyName = stryMutAct_9fa48("42986") ? (key.full || key.name) && '' : stryMutAct_9fa48("42985") ? false : stryMutAct_9fa48("42984") ? true : (stryCov_9fa48("42984", "42985", "42986"), (stryMutAct_9fa48("42988") ? key.full && key.name : stryMutAct_9fa48("42987") ? false : (stryCov_9fa48("42987", "42988"), key.full || key.name)) || (stryMutAct_9fa48("42989") ? "Stryker was here!" : (stryCov_9fa48("42989"), '')));

      // Escape exits command mode
      if (stryMutAct_9fa48("42992") ? keyName !== 'escape' : stryMutAct_9fa48("42991") ? false : stryMutAct_9fa48("42990") ? true : (stryCov_9fa48("42990", "42991", "42992"), keyName === (stryMutAct_9fa48("42993") ? "" : (stryCov_9fa48("42993"), 'escape')))) {
        if (stryMutAct_9fa48("42994")) {
          {}
        } else {
          stryCov_9fa48("42994");
          this.exitInputMode();
          return stryMutAct_9fa48("42995") ? {} : (stryCov_9fa48("42995"), {
            type: stryMutAct_9fa48("42996") ? "" : (stryCov_9fa48("42996"), 'command:cancel')
          });
        }
      }

      // Enter executes command
      if (stryMutAct_9fa48("42999") ? keyName !== 'enter' : stryMutAct_9fa48("42998") ? false : stryMutAct_9fa48("42997") ? true : (stryCov_9fa48("42997", "42998", "42999"), keyName === (stryMutAct_9fa48("43000") ? "" : (stryCov_9fa48("43000"), 'enter')))) {
        if (stryMutAct_9fa48("43001")) {
          {}
        } else {
          stryCov_9fa48("43001");
          const command = this.inputBuffer;
          this.exitInputMode();
          if (stryMutAct_9fa48("43003") ? false : stryMutAct_9fa48("43002") ? true : (stryCov_9fa48("43002", "43003"), this.commandParser)) {
            if (stryMutAct_9fa48("43004")) {
              {}
            } else {
              stryCov_9fa48("43004");
              const result = this.commandParser.parse(command);
              if (stryMutAct_9fa48("43006") ? false : stryMutAct_9fa48("43005") ? true : (stryCov_9fa48("43005", "43006"), result.error)) {
                if (stryMutAct_9fa48("43007")) {
                  {}
                } else {
                  stryCov_9fa48("43007");
                  return this.emitAction(stryMutAct_9fa48("43008") ? "" : (stryCov_9fa48("43008"), 'command:error'), stryMutAct_9fa48("43009") ? {} : (stryCov_9fa48("43009"), {
                    error: result.error
                  }));
                }
              }
              return this.emitAction(stryMutAct_9fa48("43010") ? "" : (stryCov_9fa48("43010"), 'command:execute'), stryMutAct_9fa48("43011") ? {} : (stryCov_9fa48("43011"), {
                command: result.command,
                args: result.args
              }));
            }
          }
          return stryMutAct_9fa48("43012") ? {} : (stryCov_9fa48("43012"), {
            type: stryMutAct_9fa48("43013") ? "" : (stryCov_9fa48("43013"), 'command:execute'),
            command
          });
        }
      }

      // Tab for autocomplete
      if (stryMutAct_9fa48("43016") ? keyName !== 'tab' : stryMutAct_9fa48("43015") ? false : stryMutAct_9fa48("43014") ? true : (stryCov_9fa48("43014", "43015", "43016"), keyName === (stryMutAct_9fa48("43017") ? "" : (stryCov_9fa48("43017"), 'tab')))) {
        if (stryMutAct_9fa48("43018")) {
          {}
        } else {
          stryCov_9fa48("43018");
          if (stryMutAct_9fa48("43020") ? false : stryMutAct_9fa48("43019") ? true : (stryCov_9fa48("43019", "43020"), this.commandParser)) {
            if (stryMutAct_9fa48("43021")) {
              {}
            } else {
              stryCov_9fa48("43021");
              const completions = this.commandParser.getCompletions(this.inputBuffer);
              if (stryMutAct_9fa48("43024") ? completions.length !== 1 : stryMutAct_9fa48("43023") ? false : stryMutAct_9fa48("43022") ? true : (stryCov_9fa48("43022", "43023", "43024"), completions.length === 1)) {
                if (stryMutAct_9fa48("43025")) {
                  {}
                } else {
                  stryCov_9fa48("43025");
                  this.inputBuffer = completions[0];
                  this.notifyInputChange();
                }
              } else if (stryMutAct_9fa48("43029") ? completions.length <= 1 : stryMutAct_9fa48("43028") ? completions.length >= 1 : stryMutAct_9fa48("43027") ? false : stryMutAct_9fa48("43026") ? true : (stryCov_9fa48("43026", "43027", "43028", "43029"), completions.length > 1)) {
                if (stryMutAct_9fa48("43030")) {
                  {}
                } else {
                  stryCov_9fa48("43030");
                  return stryMutAct_9fa48("43031") ? {} : (stryCov_9fa48("43031"), {
                    type: stryMutAct_9fa48("43032") ? "" : (stryCov_9fa48("43032"), 'command:completions'),
                    completions
                  });
                }
              }
            }
          }
          return stryMutAct_9fa48("43033") ? {} : (stryCov_9fa48("43033"), {
            type: stryMutAct_9fa48("43034") ? "" : (stryCov_9fa48("43034"), 'command:autocomplete'),
            value: this.inputBuffer
          });
        }
      }

      // Up/Down for command history
      if (stryMutAct_9fa48("43037") ? keyName === 'up' || this.commandParser : stryMutAct_9fa48("43036") ? false : stryMutAct_9fa48("43035") ? true : (stryCov_9fa48("43035", "43036", "43037"), (stryMutAct_9fa48("43039") ? keyName !== 'up' : stryMutAct_9fa48("43038") ? true : (stryCov_9fa48("43038", "43039"), keyName === (stryMutAct_9fa48("43040") ? "" : (stryCov_9fa48("43040"), 'up')))) && this.commandParser)) {
        if (stryMutAct_9fa48("43041")) {
          {}
        } else {
          stryCov_9fa48("43041");
          const history = this.commandParser.getHistory();
          if (stryMutAct_9fa48("43045") ? history.length <= 0 : stryMutAct_9fa48("43044") ? history.length >= 0 : stryMutAct_9fa48("43043") ? false : stryMutAct_9fa48("43042") ? true : (stryCov_9fa48("43042", "43043", "43044", "43045"), history.length > 0)) {
            if (stryMutAct_9fa48("43046")) {
              {}
            } else {
              stryCov_9fa48("43046");
              this.inputBuffer = stryMutAct_9fa48("43049") ? history[0] && '' : stryMutAct_9fa48("43048") ? false : stryMutAct_9fa48("43047") ? true : (stryCov_9fa48("43047", "43048", "43049"), history[0] || (stryMutAct_9fa48("43050") ? "Stryker was here!" : (stryCov_9fa48("43050"), '')));
              this.notifyInputChange();
            }
          }
          return stryMutAct_9fa48("43051") ? {} : (stryCov_9fa48("43051"), {
            type: stryMutAct_9fa48("43052") ? "" : (stryCov_9fa48("43052"), 'command:history'),
            direction: stryMutAct_9fa48("43053") ? "" : (stryCov_9fa48("43053"), 'up')
          });
        }
      }
      if (stryMutAct_9fa48("43056") ? keyName !== 'down' : stryMutAct_9fa48("43055") ? false : stryMutAct_9fa48("43054") ? true : (stryCov_9fa48("43054", "43055", "43056"), keyName === (stryMutAct_9fa48("43057") ? "" : (stryCov_9fa48("43057"), 'down')))) {
        if (stryMutAct_9fa48("43058")) {
          {}
        } else {
          stryCov_9fa48("43058");
          return stryMutAct_9fa48("43059") ? {} : (stryCov_9fa48("43059"), {
            type: stryMutAct_9fa48("43060") ? "" : (stryCov_9fa48("43060"), 'command:history'),
            direction: stryMutAct_9fa48("43061") ? "" : (stryCov_9fa48("43061"), 'down')
          });
        }
      }

      // Backspace removes character
      if (stryMutAct_9fa48("43064") ? keyName !== 'backspace' : stryMutAct_9fa48("43063") ? false : stryMutAct_9fa48("43062") ? true : (stryCov_9fa48("43062", "43063", "43064"), keyName === (stryMutAct_9fa48("43065") ? "" : (stryCov_9fa48("43065"), 'backspace')))) {
        if (stryMutAct_9fa48("43066")) {
          {}
        } else {
          stryCov_9fa48("43066");
          if (stryMutAct_9fa48("43070") ? this.inputBuffer.length <= 0 : stryMutAct_9fa48("43069") ? this.inputBuffer.length >= 0 : stryMutAct_9fa48("43068") ? false : stryMutAct_9fa48("43067") ? true : (stryCov_9fa48("43067", "43068", "43069", "43070"), this.inputBuffer.length > 0)) {
            if (stryMutAct_9fa48("43071")) {
              {}
            } else {
              stryCov_9fa48("43071");
              this.inputBuffer = stryMutAct_9fa48("43072") ? this.inputBuffer : (stryCov_9fa48("43072"), this.inputBuffer.slice(0, stryMutAct_9fa48("43073") ? +1 : (stryCov_9fa48("43073"), -1)));
              this.notifyInputChange();
            }
          }
          return stryMutAct_9fa48("43074") ? {} : (stryCov_9fa48("43074"), {
            type: stryMutAct_9fa48("43075") ? "" : (stryCov_9fa48("43075"), 'command:input'),
            value: this.inputBuffer
          });
        }
      }

      // Add printable characters
      if (stryMutAct_9fa48("43078") ? key.ch || key.ch.length === 1 : stryMutAct_9fa48("43077") ? false : stryMutAct_9fa48("43076") ? true : (stryCov_9fa48("43076", "43077", "43078"), key.ch && (stryMutAct_9fa48("43080") ? key.ch.length !== 1 : stryMutAct_9fa48("43079") ? true : (stryCov_9fa48("43079", "43080"), key.ch.length === 1)))) {
        if (stryMutAct_9fa48("43081")) {
          {}
        } else {
          stryCov_9fa48("43081");
          stryMutAct_9fa48("43082") ? this.inputBuffer -= key.ch : (stryCov_9fa48("43082"), this.inputBuffer += key.ch);
          this.notifyInputChange();
          return stryMutAct_9fa48("43083") ? {} : (stryCov_9fa48("43083"), {
            type: stryMutAct_9fa48("43084") ? "" : (stryCov_9fa48("43084"), 'command:input'),
            value: this.inputBuffer
          });
        }
      }
      return null;
    }
  }

  /**
   * Enter filter mode
   */
  enterFilterMode() {
    if (stryMutAct_9fa48("43085")) {
      {}
    } else {
      stryCov_9fa48("43085");
      this.mode = INPUT_MODE.FILTER;
      this.inputBuffer = stryMutAct_9fa48("43086") ? "Stryker was here!" : (stryCov_9fa48("43086"), '');
      this.notifyModeChange();
    }
  }

  /**
   * Enter command mode
   */
  enterCommandMode() {
    if (stryMutAct_9fa48("43087")) {
      {}
    } else {
      stryCov_9fa48("43087");
      this.mode = INPUT_MODE.COMMAND;
      this.inputBuffer = stryMutAct_9fa48("43088") ? "Stryker was here!" : (stryCov_9fa48("43088"), '');
      this.notifyModeChange();
    }
  }

  /**
   * Exit input mode and return to normal
   */
  exitInputMode() {
    if (stryMutAct_9fa48("43089")) {
      {}
    } else {
      stryCov_9fa48("43089");
      this.mode = INPUT_MODE.NORMAL;
      this.inputBuffer = stryMutAct_9fa48("43090") ? "Stryker was here!" : (stryCov_9fa48("43090"), '');
      this.notifyModeChange();
    }
  }

  /**
   * Get current input mode
   * @returns {string}
   */
  getMode() {
    if (stryMutAct_9fa48("43091")) {
      {}
    } else {
      stryCov_9fa48("43091");
      return this.mode;
    }
  }

  /**
   * Get current input buffer
   * @returns {string}
   */
  getInputBuffer() {
    if (stryMutAct_9fa48("43092")) {
      {}
    } else {
      stryCov_9fa48("43092");
      return this.inputBuffer;
    }
  }

  /**
   * Set input buffer (for external updates)
   * @param {string} value - New buffer value
   */
  setInputBuffer(value) {
    if (stryMutAct_9fa48("43093")) {
      {}
    } else {
      stryCov_9fa48("43093");
      this.inputBuffer = value;
      this.notifyInputChange();
    }
  }

  /**
   * Check if in input mode (filter or command)
   * @returns {boolean}
   */
  isInInputMode() {
    if (stryMutAct_9fa48("43094")) {
      {}
    } else {
      stryCov_9fa48("43094");
      return stryMutAct_9fa48("43097") ? this.mode === INPUT_MODE.NORMAL : stryMutAct_9fa48("43096") ? false : stryMutAct_9fa48("43095") ? true : (stryCov_9fa48("43095", "43096", "43097"), this.mode !== INPUT_MODE.NORMAL);
    }
  }

  /**
   * Emit an action
   * @param {string} type - Action type
   * @param {Object} [payload] - Action payload
   * @returns {KeyboardAction}
   */
  emitAction(type, payload = {}) {
    if (stryMutAct_9fa48("43098")) {
      {}
    } else {
      stryCov_9fa48("43098");
      const action = stryMutAct_9fa48("43099") ? {} : (stryCov_9fa48("43099"), {
        type,
        ...payload
      });
      if (stryMutAct_9fa48("43101") ? false : stryMutAct_9fa48("43100") ? true : (stryCov_9fa48("43100", "43101"), this.onAction)) {
        if (stryMutAct_9fa48("43102")) {
          {}
        } else {
          stryCov_9fa48("43102");
          this.onAction(action);
        }
      }
      if (stryMutAct_9fa48("43104") ? false : stryMutAct_9fa48("43103") ? true : (stryCov_9fa48("43103", "43104"), this.eventBus)) {
        if (stryMutAct_9fa48("43105")) {
          {}
        } else {
          stryCov_9fa48("43105");
          this.eventBus.emit(stryMutAct_9fa48("43106") ? `` : (stryCov_9fa48("43106"), `keyboard:${type}`), payload);
        }
      }
      return action;
    }
  }

  /**
   * Notify mode change
   */
  notifyModeChange() {
    if (stryMutAct_9fa48("43107")) {
      {}
    } else {
      stryCov_9fa48("43107");
      if (stryMutAct_9fa48("43109") ? false : stryMutAct_9fa48("43108") ? true : (stryCov_9fa48("43108", "43109"), this.onModeChange)) {
        if (stryMutAct_9fa48("43110")) {
          {}
        } else {
          stryCov_9fa48("43110");
          this.onModeChange(this.mode);
        }
      }
      if (stryMutAct_9fa48("43112") ? false : stryMutAct_9fa48("43111") ? true : (stryCov_9fa48("43111", "43112"), this.eventBus)) {
        if (stryMutAct_9fa48("43113")) {
          {}
        } else {
          stryCov_9fa48("43113");
          this.eventBus.emit(stryMutAct_9fa48("43114") ? "" : (stryCov_9fa48("43114"), 'keyboard:mode'), stryMutAct_9fa48("43115") ? {} : (stryCov_9fa48("43115"), {
            mode: this.mode
          }));
        }
      }
    }
  }

  /**
   * Notify input change
   */
  notifyInputChange() {
    if (stryMutAct_9fa48("43116")) {
      {}
    } else {
      stryCov_9fa48("43116");
      if (stryMutAct_9fa48("43118") ? false : stryMutAct_9fa48("43117") ? true : (stryCov_9fa48("43117", "43118"), this.onInputChange)) {
        if (stryMutAct_9fa48("43119")) {
          {}
        } else {
          stryCov_9fa48("43119");
          this.onInputChange(this.inputBuffer);
        }
      }
      if (stryMutAct_9fa48("43121") ? false : stryMutAct_9fa48("43120") ? true : (stryCov_9fa48("43120", "43121"), this.eventBus)) {
        if (stryMutAct_9fa48("43122")) {
          {}
        } else {
          stryCov_9fa48("43122");
          this.eventBus.emit(stryMutAct_9fa48("43123") ? "" : (stryCov_9fa48("43123"), 'keyboard:input'), stryMutAct_9fa48("43124") ? {} : (stryCov_9fa48("43124"), {
            mode: this.mode,
            value: this.inputBuffer
          }));
        }
      }
    }
  }

  /**
   * Get available shortcuts for current mode
   * @returns {Array<{key: string, description: string}>}
   */
  getAvailableShortcuts() {
    if (stryMutAct_9fa48("43125")) {
      {}
    } else {
      stryCov_9fa48("43125");
      if (stryMutAct_9fa48("43128") ? this.mode !== INPUT_MODE.FILTER : stryMutAct_9fa48("43127") ? false : stryMutAct_9fa48("43126") ? true : (stryCov_9fa48("43126", "43127", "43128"), this.mode === INPUT_MODE.FILTER)) {
        if (stryMutAct_9fa48("43129")) {
          {}
        } else {
          stryCov_9fa48("43129");
          return stryMutAct_9fa48("43130") ? [] : (stryCov_9fa48("43130"), [stryMutAct_9fa48("43131") ? {} : (stryCov_9fa48("43131"), {
            key: stryMutAct_9fa48("43132") ? "" : (stryCov_9fa48("43132"), 'Enter'),
            description: stryMutAct_9fa48("43133") ? "" : (stryCov_9fa48("43133"), 'Apply filter')
          }), stryMutAct_9fa48("43134") ? {} : (stryCov_9fa48("43134"), {
            key: stryMutAct_9fa48("43135") ? "" : (stryCov_9fa48("43135"), 'Escape'),
            description: stryMutAct_9fa48("43136") ? "" : (stryCov_9fa48("43136"), 'Cancel')
          })]);
        }
      }
      if (stryMutAct_9fa48("43139") ? this.mode !== INPUT_MODE.COMMAND : stryMutAct_9fa48("43138") ? false : stryMutAct_9fa48("43137") ? true : (stryCov_9fa48("43137", "43138", "43139"), this.mode === INPUT_MODE.COMMAND)) {
        if (stryMutAct_9fa48("43140")) {
          {}
        } else {
          stryCov_9fa48("43140");
          return stryMutAct_9fa48("43141") ? [] : (stryCov_9fa48("43141"), [stryMutAct_9fa48("43142") ? {} : (stryCov_9fa48("43142"), {
            key: stryMutAct_9fa48("43143") ? "" : (stryCov_9fa48("43143"), 'Enter'),
            description: stryMutAct_9fa48("43144") ? "" : (stryCov_9fa48("43144"), 'Execute command')
          }), stryMutAct_9fa48("43145") ? {} : (stryCov_9fa48("43145"), {
            key: stryMutAct_9fa48("43146") ? "" : (stryCov_9fa48("43146"), 'Tab'),
            description: stryMutAct_9fa48("43147") ? "" : (stryCov_9fa48("43147"), 'Autocomplete')
          }), stryMutAct_9fa48("43148") ? {} : (stryCov_9fa48("43148"), {
            key: stryMutAct_9fa48("43149") ? "" : (stryCov_9fa48("43149"), 'Escape'),
            description: stryMutAct_9fa48("43150") ? "" : (stryCov_9fa48("43150"), 'Cancel')
          })]);
        }
      }
      return stryMutAct_9fa48("43151") ? [] : (stryCov_9fa48("43151"), [stryMutAct_9fa48("43152") ? {} : (stryCov_9fa48("43152"), {
        key: stryMutAct_9fa48("43153") ? "" : (stryCov_9fa48("43153"), '↑/↓'),
        description: stryMutAct_9fa48("43154") ? "" : (stryCov_9fa48("43154"), 'Navigate')
      }), stryMutAct_9fa48("43155") ? {} : (stryCov_9fa48("43155"), {
        key: stryMutAct_9fa48("43156") ? "" : (stryCov_9fa48("43156"), 'Enter'),
        description: stryMutAct_9fa48("43157") ? "" : (stryCov_9fa48("43157"), 'Select')
      }), stryMutAct_9fa48("43158") ? {} : (stryCov_9fa48("43158"), {
        key: stryMutAct_9fa48("43159") ? "" : (stryCov_9fa48("43159"), '/'),
        description: stryMutAct_9fa48("43160") ? "" : (stryCov_9fa48("43160"), 'Filter')
      }), stryMutAct_9fa48("43161") ? {} : (stryCov_9fa48("43161"), {
        key: stryMutAct_9fa48("43162") ? "" : (stryCov_9fa48("43162"), ':'),
        description: stryMutAct_9fa48("43163") ? "" : (stryCov_9fa48("43163"), 'Command')
      }), stryMutAct_9fa48("43164") ? {} : (stryCov_9fa48("43164"), {
        key: stryMutAct_9fa48("43165") ? "" : (stryCov_9fa48("43165"), 'p'),
        description: stryMutAct_9fa48("43166") ? "" : (stryCov_9fa48("43166"), 'Pause/Resume CDC')
      }), stryMutAct_9fa48("43167") ? {} : (stryCov_9fa48("43167"), {
        key: stryMutAct_9fa48("43168") ? "" : (stryCov_9fa48("43168"), 'r'),
        description: stryMutAct_9fa48("43169") ? "" : (stryCov_9fa48("43169"), 'Refresh')
      }), stryMutAct_9fa48("43170") ? {} : (stryCov_9fa48("43170"), {
        key: stryMutAct_9fa48("43171") ? "" : (stryCov_9fa48("43171"), '?'),
        description: stryMutAct_9fa48("43172") ? "" : (stryCov_9fa48("43172"), 'Help')
      }), stryMutAct_9fa48("43173") ? {} : (stryCov_9fa48("43173"), {
        key: stryMutAct_9fa48("43174") ? "" : (stryCov_9fa48("43174"), 'q'),
        description: stryMutAct_9fa48("43175") ? "" : (stryCov_9fa48("43175"), 'Quit')
      })]);
    }
  }

  /**
   * Get status bar text for current mode
   * @returns {string}
   */
  getStatusBarText() {
    if (stryMutAct_9fa48("43176")) {
      {}
    } else {
      stryCov_9fa48("43176");
      if (stryMutAct_9fa48("43179") ? this.mode !== INPUT_MODE.FILTER : stryMutAct_9fa48("43178") ? false : stryMutAct_9fa48("43177") ? true : (stryCov_9fa48("43177", "43178", "43179"), this.mode === INPUT_MODE.FILTER)) {
        if (stryMutAct_9fa48("43180")) {
          {}
        } else {
          stryCov_9fa48("43180");
          return stryMutAct_9fa48("43181") ? `` : (stryCov_9fa48("43181"), `Filter: ${this.inputBuffer}_`);
        }
      }
      if (stryMutAct_9fa48("43184") ? this.mode !== INPUT_MODE.COMMAND : stryMutAct_9fa48("43183") ? false : stryMutAct_9fa48("43182") ? true : (stryCov_9fa48("43182", "43183", "43184"), this.mode === INPUT_MODE.COMMAND)) {
        if (stryMutAct_9fa48("43185")) {
          {}
        } else {
          stryCov_9fa48("43185");
          return stryMutAct_9fa48("43186") ? `` : (stryCov_9fa48("43186"), `:${this.inputBuffer}_`);
        }
      }
      return stryMutAct_9fa48("43187") ? "Stryker was here!" : (stryCov_9fa48("43187"), '');
    }
  }

  /**
   * Check if a key is a navigation key
   * @param {KeyEvent} key - Key event
   * @returns {boolean}
   */
  isNavigationKey(key) {
    if (stryMutAct_9fa48("43188")) {
      {}
    } else {
      stryCov_9fa48("43188");
      const navKeys = stryMutAct_9fa48("43189") ? [] : (stryCov_9fa48("43189"), [stryMutAct_9fa48("43190") ? "" : (stryCov_9fa48("43190"), 'up'), stryMutAct_9fa48("43191") ? "" : (stryCov_9fa48("43191"), 'down'), stryMutAct_9fa48("43192") ? "" : (stryCov_9fa48("43192"), 'pageup'), stryMutAct_9fa48("43193") ? "" : (stryCov_9fa48("43193"), 'pagedown'), stryMutAct_9fa48("43194") ? "" : (stryCov_9fa48("43194"), 'home'), stryMutAct_9fa48("43195") ? "" : (stryCov_9fa48("43195"), 'end')]);
      return navKeys.includes(stryMutAct_9fa48("43198") ? (key.name || key.full) && '' : stryMutAct_9fa48("43197") ? false : stryMutAct_9fa48("43196") ? true : (stryCov_9fa48("43196", "43197", "43198"), (stryMutAct_9fa48("43200") ? key.name && key.full : stryMutAct_9fa48("43199") ? false : (stryCov_9fa48("43199", "43200"), key.name || key.full)) || (stryMutAct_9fa48("43201") ? "Stryker was here!" : (stryCov_9fa48("43201"), ''))));
    }
  }

  /**
   * Check if a key is a view switch key
   * @param {KeyEvent} key - Key event
   * @returns {boolean}
   */
  isViewSwitchKey(key) {
    if (stryMutAct_9fa48("43202")) {
      {}
    } else {
      stryCov_9fa48("43202");
      return Object.prototype.hasOwnProperty.call(VIEW_KEYS, stryMutAct_9fa48("43205") ? key.ch && '' : stryMutAct_9fa48("43204") ? false : stryMutAct_9fa48("43203") ? true : (stryCov_9fa48("43203", "43204", "43205"), key.ch || (stryMutAct_9fa48("43206") ? "Stryker was here!" : (stryCov_9fa48("43206"), ''))));
    }
  }

  /**
   * Get view name for a key
   * @param {KeyEvent} key - Key event
   * @returns {string|null}
   */
  getViewForKey(key) {
    if (stryMutAct_9fa48("43207")) {
      {}
    } else {
      stryCov_9fa48("43207");
      return stryMutAct_9fa48("43210") ? VIEW_KEYS[key.ch || ''] && null : stryMutAct_9fa48("43209") ? false : stryMutAct_9fa48("43208") ? true : (stryCov_9fa48("43208", "43209", "43210"), VIEW_KEYS[stryMutAct_9fa48("43213") ? key.ch && '' : stryMutAct_9fa48("43212") ? false : stryMutAct_9fa48("43211") ? true : (stryCov_9fa48("43211", "43212", "43213"), key.ch || (stryMutAct_9fa48("43214") ? "Stryker was here!" : (stryCov_9fa48("43214"), '')))] || null);
    }
  }
}