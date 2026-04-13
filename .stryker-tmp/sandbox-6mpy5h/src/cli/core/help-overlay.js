/**
 * HelpOverlay - Help overlay displaying keyboard shortcuts and context-sensitive help
 *
 * Requirements: 20.1, 20.2, 20.3, 20.4, 20.5
 */
// @ts-nocheck


/**
 * @typedef {Object} ShortcutCategory
 * @property {string} name - Category name
 * @property {Array<{key: string, description: string}>} shortcuts - Shortcuts
 */

/**
 * @typedef {Object} ViewHelp
 * @property {string} title - View title
 * @property {string} description - View description
 * @property {Array<{key: string, description: string}>} shortcuts - View-specific shortcuts
 */

/**
 * HelpOverlay class for displaying help information
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
export class HelpOverlay {
  /**
   * @param {Object} options - Configuration options
   * @param {import('./event-bus.js').EventBus} [options.eventBus] - Event bus
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("42435")) {
      {}
    } else {
      stryCov_9fa48("42435");
      this.eventBus = stryMutAct_9fa48("42438") ? options.eventBus && null : stryMutAct_9fa48("42437") ? false : stryMutAct_9fa48("42436") ? true : (stryCov_9fa48("42436", "42437", "42438"), options.eventBus || null);
      this.visible = stryMutAct_9fa48("42439") ? true : (stryCov_9fa48("42439"), false);

      // Global keyboard shortcuts organized by category
      this.globalShortcuts = this.getGlobalShortcuts();

      // View-specific help
      this.viewHelp = this.getViewHelp();
    }
  }

  /**
   * Get global keyboard shortcuts organized by category
   * @returns {ShortcutCategory[]}
   */
  getGlobalShortcuts() {
    if (stryMutAct_9fa48("42440")) {
      {}
    } else {
      stryCov_9fa48("42440");
      return stryMutAct_9fa48("42441") ? [] : (stryCov_9fa48("42441"), [stryMutAct_9fa48("42442") ? {} : (stryCov_9fa48("42442"), {
        name: stryMutAct_9fa48("42443") ? "" : (stryCov_9fa48("42443"), 'Navigation'),
        shortcuts: stryMutAct_9fa48("42444") ? [] : (stryCov_9fa48("42444"), [stryMutAct_9fa48("42445") ? {} : (stryCov_9fa48("42445"), {
          key: stryMutAct_9fa48("42446") ? "" : (stryCov_9fa48("42446"), '↑/↓'),
          description: stryMutAct_9fa48("42447") ? "" : (stryCov_9fa48("42447"), 'Move selection up/down')
        }), stryMutAct_9fa48("42448") ? {} : (stryCov_9fa48("42448"), {
          key: stryMutAct_9fa48("42449") ? "" : (stryCov_9fa48("42449"), 'Page Up/Down'),
          description: stryMutAct_9fa48("42450") ? "" : (stryCov_9fa48("42450"), 'Scroll page up/down')
        }), stryMutAct_9fa48("42451") ? {} : (stryCov_9fa48("42451"), {
          key: stryMutAct_9fa48("42452") ? "" : (stryCov_9fa48("42452"), 'Home/End'),
          description: stryMutAct_9fa48("42453") ? "" : (stryCov_9fa48("42453"), 'Jump to first/last row')
        }), stryMutAct_9fa48("42454") ? {} : (stryCov_9fa48("42454"), {
          key: stryMutAct_9fa48("42455") ? "" : (stryCov_9fa48("42455"), 'Enter'),
          description: stryMutAct_9fa48("42456") ? "" : (stryCov_9fa48("42456"), 'Drill down into selected item')
        }), stryMutAct_9fa48("42457") ? {} : (stryCov_9fa48("42457"), {
          key: stryMutAct_9fa48("42458") ? "" : (stryCov_9fa48("42458"), 'Escape/Backspace'),
          description: stryMutAct_9fa48("42459") ? "" : (stryCov_9fa48("42459"), 'Go back one level')
        })])
      }), stryMutAct_9fa48("42460") ? {} : (stryCov_9fa48("42460"), {
        name: stryMutAct_9fa48("42461") ? "" : (stryCov_9fa48("42461"), 'Views'),
        shortcuts: stryMutAct_9fa48("42462") ? [] : (stryCov_9fa48("42462"), [stryMutAct_9fa48("42463") ? {} : (stryCov_9fa48("42463"), {
          key: stryMutAct_9fa48("42464") ? "" : (stryCov_9fa48("42464"), '1'),
          description: stryMutAct_9fa48("42465") ? "" : (stryCov_9fa48("42465"), 'Nodes view')
        }), stryMutAct_9fa48("42466") ? {} : (stryCov_9fa48("42466"), {
          key: stryMutAct_9fa48("42467") ? "" : (stryCov_9fa48("42467"), '2'),
          description: stryMutAct_9fa48("42468") ? "" : (stryCov_9fa48("42468"), 'Replicas view')
        }), stryMutAct_9fa48("42469") ? {} : (stryCov_9fa48("42469"), {
          key: stryMutAct_9fa48("42470") ? "" : (stryCov_9fa48("42470"), '3'),
          description: stryMutAct_9fa48("42471") ? "" : (stryCov_9fa48("42471"), 'Tables view')
        }), stryMutAct_9fa48("42472") ? {} : (stryCov_9fa48("42472"), {
          key: stryMutAct_9fa48("42473") ? "" : (stryCov_9fa48("42473"), '4'),
          description: stryMutAct_9fa48("42474") ? "" : (stryCov_9fa48("42474"), 'Partitions view')
        }), stryMutAct_9fa48("42475") ? {} : (stryCov_9fa48("42475"), {
          key: stryMutAct_9fa48("42476") ? "" : (stryCov_9fa48("42476"), '5'),
          description: stryMutAct_9fa48("42477") ? "" : (stryCov_9fa48("42477"), 'Message Groups view')
        }), stryMutAct_9fa48("42478") ? {} : (stryCov_9fa48("42478"), {
          key: stryMutAct_9fa48("42479") ? "" : (stryCov_9fa48("42479"), '6'),
          description: stryMutAct_9fa48("42480") ? "" : (stryCov_9fa48("42480"), 'SQL Query view')
        }), stryMutAct_9fa48("42481") ? {} : (stryCov_9fa48("42481"), {
          key: stryMutAct_9fa48("42482") ? "" : (stryCov_9fa48("42482"), '7'),
          description: stryMutAct_9fa48("42483") ? "" : (stryCov_9fa48("42483"), 'Logs view')
        }), stryMutAct_9fa48("42484") ? {} : (stryCov_9fa48("42484"), {
          key: stryMutAct_9fa48("42485") ? "" : (stryCov_9fa48("42485"), '8'),
          description: stryMutAct_9fa48("42486") ? "" : (stryCov_9fa48("42486"), 'Config view')
        }), stryMutAct_9fa48("42487") ? {} : (stryCov_9fa48("42487"), {
          key: stryMutAct_9fa48("42488") ? "" : (stryCov_9fa48("42488"), '9'),
          description: stryMutAct_9fa48("42489") ? "" : (stryCov_9fa48("42489"), 'Contexts view')
        }), stryMutAct_9fa48("42490") ? {} : (stryCov_9fa48("42490"), {
          key: stryMutAct_9fa48("42491") ? "" : (stryCov_9fa48("42491"), '0'),
          description: stryMutAct_9fa48("42492") ? "" : (stryCov_9fa48("42492"), 'Services view')
        })])
      }), stryMutAct_9fa48("42493") ? {} : (stryCov_9fa48("42493"), {
        name: stryMutAct_9fa48("42494") ? "" : (stryCov_9fa48("42494"), 'Actions'),
        shortcuts: stryMutAct_9fa48("42495") ? [] : (stryCov_9fa48("42495"), [stryMutAct_9fa48("42496") ? {} : (stryCov_9fa48("42496"), {
          key: stryMutAct_9fa48("42497") ? "" : (stryCov_9fa48("42497"), '/'),
          description: stryMutAct_9fa48("42498") ? "" : (stryCov_9fa48("42498"), 'Enter filter mode')
        }), stryMutAct_9fa48("42499") ? {} : (stryCov_9fa48("42499"), {
          key: stryMutAct_9fa48("42500") ? "" : (stryCov_9fa48("42500"), ':'),
          description: stryMutAct_9fa48("42501") ? "" : (stryCov_9fa48("42501"), 'Enter command mode')
        }), stryMutAct_9fa48("42502") ? {} : (stryCov_9fa48("42502"), {
          key: stryMutAct_9fa48("42503") ? "" : (stryCov_9fa48("42503"), 'd'),
          description: stryMutAct_9fa48("42504") ? "" : (stryCov_9fa48("42504"), 'Show detail panel')
        }), stryMutAct_9fa48("42505") ? {} : (stryCov_9fa48("42505"), {
          key: stryMutAct_9fa48("42506") ? "" : (stryCov_9fa48("42506"), 'r'),
          description: stryMutAct_9fa48("42507") ? "" : (stryCov_9fa48("42507"), 'Refresh data')
        }), stryMutAct_9fa48("42508") ? {} : (stryCov_9fa48("42508"), {
          key: stryMutAct_9fa48("42509") ? "" : (stryCov_9fa48("42509"), 's'),
          description: stryMutAct_9fa48("42510") ? "" : (stryCov_9fa48("42510"), 'Sort by column')
        })])
      }), stryMutAct_9fa48("42511") ? {} : (stryCov_9fa48("42511"), {
        name: stryMutAct_9fa48("42512") ? "" : (stryCov_9fa48("42512"), 'General'),
        shortcuts: stryMutAct_9fa48("42513") ? [] : (stryCov_9fa48("42513"), [stryMutAct_9fa48("42514") ? {} : (stryCov_9fa48("42514"), {
          key: stryMutAct_9fa48("42515") ? "" : (stryCov_9fa48("42515"), '?'),
          description: stryMutAct_9fa48("42516") ? "" : (stryCov_9fa48("42516"), 'Show this help')
        }), stryMutAct_9fa48("42517") ? {} : (stryCov_9fa48("42517"), {
          key: stryMutAct_9fa48("42518") ? "" : (stryCov_9fa48("42518"), 'q'),
          description: stryMutAct_9fa48("42519") ? "" : (stryCov_9fa48("42519"), 'Quit application')
        }), stryMutAct_9fa48("42520") ? {} : (stryCov_9fa48("42520"), {
          key: stryMutAct_9fa48("42521") ? "" : (stryCov_9fa48("42521"), 'Ctrl+C'),
          description: stryMutAct_9fa48("42522") ? "" : (stryCov_9fa48("42522"), 'Force quit')
        })])
      })]);
    }
  }

  /**
   * Get view-specific help information
   * @returns {Object<string, ViewHelp>}
   */
  getViewHelp() {
    if (stryMutAct_9fa48("42523")) {
      {}
    } else {
      stryCov_9fa48("42523");
      return stryMutAct_9fa48("42524") ? {} : (stryCov_9fa48("42524"), {
        nodes: stryMutAct_9fa48("42525") ? {} : (stryCov_9fa48("42525"), {
          title: stryMutAct_9fa48("42526") ? "" : (stryCov_9fa48("42526"), 'Nodes View'),
          description: stryMutAct_9fa48("42527") ? "" : (stryCov_9fa48("42527"), 'Displays all nodes in the cluster with resource usage.'),
          shortcuts: stryMutAct_9fa48("42528") ? [] : (stryCov_9fa48("42528"), [stryMutAct_9fa48("42529") ? {} : (stryCov_9fa48("42529"), {
            key: stryMutAct_9fa48("42530") ? "" : (stryCov_9fa48("42530"), 'Enter'),
            description: stryMutAct_9fa48("42531") ? "" : (stryCov_9fa48("42531"), 'View services on selected node')
          }), stryMutAct_9fa48("42532") ? {} : (stryCov_9fa48("42532"), {
            key: stryMutAct_9fa48("42533") ? "" : (stryCov_9fa48("42533"), 'c'),
            description: stryMutAct_9fa48("42534") ? "" : (stryCov_9fa48("42534"), 'Connect to selected node')
          })])
        }),
        services: stryMutAct_9fa48("42535") ? {} : (stryCov_9fa48("42535"), {
          title: stryMutAct_9fa48("42536") ? "" : (stryCov_9fa48("42536"), 'Services View'),
          description: stryMutAct_9fa48("42537") ? "" : (stryCov_9fa48("42537"), 'Displays logical service definitions and health.'),
          shortcuts: stryMutAct_9fa48("42538") ? [] : (stryCov_9fa48("42538"), [stryMutAct_9fa48("42539") ? {} : (stryCov_9fa48("42539"), {
            key: stryMutAct_9fa48("42540") ? "" : (stryCov_9fa48("42540"), 'Enter'),
            description: stryMutAct_9fa48("42541") ? "" : (stryCov_9fa48("42541"), 'View replicas for selected service')
          })])
        }),
        replicas: stryMutAct_9fa48("42542") ? {} : (stryCov_9fa48("42542"), {
          title: stryMutAct_9fa48("42543") ? "" : (stryCov_9fa48("42543"), 'Replicas View'),
          description: stryMutAct_9fa48("42544") ? "" : (stryCov_9fa48("42544"), 'Displays concrete replicas running on nodes.'),
          shortcuts: stryMutAct_9fa48("42545") ? [] : (stryCov_9fa48("42545"), [stryMutAct_9fa48("42546") ? {} : (stryCov_9fa48("42546"), {
            key: stryMutAct_9fa48("42547") ? "" : (stryCov_9fa48("42547"), 'Enter'),
            description: stryMutAct_9fa48("42548") ? "" : (stryCov_9fa48("42548"), 'View replica details')
          }), stryMutAct_9fa48("42549") ? {} : (stryCov_9fa48("42549"), {
            key: stryMutAct_9fa48("42550") ? "" : (stryCov_9fa48("42550"), 't'),
            description: stryMutAct_9fa48("42551") ? "" : (stryCov_9fa48("42551"), 'Filter by replica type')
          })])
        }),
        tables: stryMutAct_9fa48("42552") ? {} : (stryCov_9fa48("42552"), {
          title: stryMutAct_9fa48("42553") ? "" : (stryCov_9fa48("42553"), 'Tables View'),
          description: stryMutAct_9fa48("42554") ? "" : (stryCov_9fa48("42554"), 'Displays all tables with partition and replica info.'),
          shortcuts: stryMutAct_9fa48("42555") ? [] : (stryCov_9fa48("42555"), [stryMutAct_9fa48("42556") ? {} : (stryCov_9fa48("42556"), {
            key: stryMutAct_9fa48("42557") ? "" : (stryCov_9fa48("42557"), 'Enter'),
            description: stryMutAct_9fa48("42558") ? "" : (stryCov_9fa48("42558"), 'View partitions for table')
          }), stryMutAct_9fa48("42559") ? {} : (stryCov_9fa48("42559"), {
            key: stryMutAct_9fa48("42560") ? "" : (stryCov_9fa48("42560"), 'p'),
            description: stryMutAct_9fa48("42561") ? "" : (stryCov_9fa48("42561"), 'View table policies')
          })])
        }),
        partitions: stryMutAct_9fa48("42562") ? {} : (stryCov_9fa48("42562"), {
          title: stryMutAct_9fa48("42563") ? "" : (stryCov_9fa48("42563"), 'Partitions View'),
          description: stryMutAct_9fa48("42564") ? "" : (stryCov_9fa48("42564"), 'Displays partitions for a table.'),
          shortcuts: stryMutAct_9fa48("42565") ? [] : (stryCov_9fa48("42565"), [stryMutAct_9fa48("42566") ? {} : (stryCov_9fa48("42566"), {
            key: stryMutAct_9fa48("42567") ? "" : (stryCov_9fa48("42567"), 'Enter'),
            description: stryMutAct_9fa48("42568") ? "" : (stryCov_9fa48("42568"), 'View partition replicas')
          }), stryMutAct_9fa48("42569") ? {} : (stryCov_9fa48("42569"), {
            key: stryMutAct_9fa48("42570") ? "" : (stryCov_9fa48("42570"), 'n'),
            description: stryMutAct_9fa48("42571") ? "" : (stryCov_9fa48("42571"), 'Jump to leader node')
          })])
        }),
        message_groups: stryMutAct_9fa48("42572") ? {} : (stryCov_9fa48("42572"), {
          title: stryMutAct_9fa48("42573") ? "" : (stryCov_9fa48("42573"), 'Message Groups View'),
          description: stryMutAct_9fa48("42574") ? "" : (stryCov_9fa48("42574"), 'Displays message group distribution.'),
          shortcuts: stryMutAct_9fa48("42575") ? [] : (stryCov_9fa48("42575"), [stryMutAct_9fa48("42576") ? {} : (stryCov_9fa48("42576"), {
            key: stryMutAct_9fa48("42577") ? "" : (stryCov_9fa48("42577"), 'Enter'),
            description: stryMutAct_9fa48("42578") ? "" : (stryCov_9fa48("42578"), 'View replica locations')
          })])
        }),
        sql: stryMutAct_9fa48("42579") ? {} : (stryCov_9fa48("42579"), {
          title: stryMutAct_9fa48("42580") ? "" : (stryCov_9fa48("42580"), 'SQL Query View'),
          description: stryMutAct_9fa48("42581") ? "" : (stryCov_9fa48("42581"), 'Execute SQL queries against the database.'),
          shortcuts: stryMutAct_9fa48("42582") ? [] : (stryCov_9fa48("42582"), [stryMutAct_9fa48("42583") ? {} : (stryCov_9fa48("42583"), {
            key: stryMutAct_9fa48("42584") ? "" : (stryCov_9fa48("42584"), 'Ctrl+Enter'),
            description: stryMutAct_9fa48("42585") ? "" : (stryCov_9fa48("42585"), 'Execute query')
          }), stryMutAct_9fa48("42586") ? {} : (stryCov_9fa48("42586"), {
            key: stryMutAct_9fa48("42587") ? "" : (stryCov_9fa48("42587"), '↑/↓'),
            description: stryMutAct_9fa48("42588") ? "" : (stryCov_9fa48("42588"), 'Navigate query history')
          }), stryMutAct_9fa48("42589") ? {} : (stryCov_9fa48("42589"), {
            key: stryMutAct_9fa48("42590") ? "" : (stryCov_9fa48("42590"), 'Tab'),
            description: stryMutAct_9fa48("42591") ? "" : (stryCov_9fa48("42591"), 'Autocomplete table name')
          }), stryMutAct_9fa48("42592") ? {} : (stryCov_9fa48("42592"), {
            key: stryMutAct_9fa48("42593") ? "" : (stryCov_9fa48("42593"), 'Escape'),
            description: stryMutAct_9fa48("42594") ? "" : (stryCov_9fa48("42594"), 'Clear input')
          }), stryMutAct_9fa48("42595") ? {} : (stryCov_9fa48("42595"), {
            key: stryMutAct_9fa48("42596") ? "" : (stryCov_9fa48("42596"), 'Ctrl+L'),
            description: stryMutAct_9fa48("42597") ? "" : (stryCov_9fa48("42597"), 'Start live query')
          })])
        }),
        logs: stryMutAct_9fa48("42598") ? {} : (stryCov_9fa48("42598"), {
          title: stryMutAct_9fa48("42599") ? "" : (stryCov_9fa48("42599"), 'Logs View'),
          description: stryMutAct_9fa48("42600") ? "" : (stryCov_9fa48("42600"), 'View and filter system logs.'),
          shortcuts: stryMutAct_9fa48("42601") ? [] : (stryCov_9fa48("42601"), [stryMutAct_9fa48("42602") ? {} : (stryCov_9fa48("42602"), {
            key: stryMutAct_9fa48("42603") ? "" : (stryCov_9fa48("42603"), 'Enter'),
            description: stryMutAct_9fa48("42604") ? "" : (stryCov_9fa48("42604"), 'View full log entry')
          }), stryMutAct_9fa48("42605") ? {} : (stryCov_9fa48("42605"), {
            key: stryMutAct_9fa48("42606") ? "" : (stryCov_9fa48("42606"), 'l'),
            description: stryMutAct_9fa48("42607") ? "" : (stryCov_9fa48("42607"), 'Filter by log level')
          }), stryMutAct_9fa48("42608") ? {} : (stryCov_9fa48("42608"), {
            key: stryMutAct_9fa48("42609") ? "" : (stryCov_9fa48("42609"), 'n'),
            description: stryMutAct_9fa48("42610") ? "" : (stryCov_9fa48("42610"), 'Filter by node')
          }), stryMutAct_9fa48("42611") ? {} : (stryCov_9fa48("42611"), {
            key: stryMutAct_9fa48("42612") ? "" : (stryCov_9fa48("42612"), 'e'),
            description: stryMutAct_9fa48("42613") ? "" : (stryCov_9fa48("42613"), 'Export filtered logs')
          })])
        }),
        config: stryMutAct_9fa48("42614") ? {} : (stryCov_9fa48("42614"), {
          title: stryMutAct_9fa48("42615") ? "" : (stryCov_9fa48("42615"), 'Config View'),
          description: stryMutAct_9fa48("42616") ? "" : (stryCov_9fa48("42616"), 'View and edit system configuration.'),
          shortcuts: stryMutAct_9fa48("42617") ? [] : (stryCov_9fa48("42617"), [stryMutAct_9fa48("42618") ? {} : (stryCov_9fa48("42618"), {
            key: stryMutAct_9fa48("42619") ? "" : (stryCov_9fa48("42619"), 'Enter'),
            description: stryMutAct_9fa48("42620") ? "" : (stryCov_9fa48("42620"), 'Edit config value')
          }), stryMutAct_9fa48("42621") ? {} : (stryCov_9fa48("42621"), {
            key: stryMutAct_9fa48("42622") ? "" : (stryCov_9fa48("42622"), 'r'),
            description: stryMutAct_9fa48("42623") ? "" : (stryCov_9fa48("42623"), 'Revert to default')
          })])
        }),
        contexts: stryMutAct_9fa48("42624") ? {} : (stryCov_9fa48("42624"), {
          title: stryMutAct_9fa48("42625") ? "" : (stryCov_9fa48("42625"), 'Contexts View'),
          description: stryMutAct_9fa48("42626") ? "" : (stryCov_9fa48("42626"), 'View function execution contexts.'),
          shortcuts: stryMutAct_9fa48("42627") ? [] : (stryCov_9fa48("42627"), [stryMutAct_9fa48("42628") ? {} : (stryCov_9fa48("42628"), {
            key: stryMutAct_9fa48("42629") ? "" : (stryCov_9fa48("42629"), 'Enter'),
            description: stryMutAct_9fa48("42630") ? "" : (stryCov_9fa48("42630"), 'View context details')
          }), stryMutAct_9fa48("42631") ? {} : (stryCov_9fa48("42631"), {
            key: stryMutAct_9fa48("42632") ? "" : (stryCov_9fa48("42632"), 't'),
            description: stryMutAct_9fa48("42633") ? "" : (stryCov_9fa48("42633"), 'Filter by context type')
          })])
        }),
        operations: stryMutAct_9fa48("42634") ? {} : (stryCov_9fa48("42634"), {
          title: stryMutAct_9fa48("42635") ? "" : (stryCov_9fa48("42635"), 'Operations View'),
          description: stryMutAct_9fa48("42636") ? "" : (stryCov_9fa48("42636"), 'View replica operations with workflow steps and history.'),
          shortcuts: stryMutAct_9fa48("42637") ? [] : (stryCov_9fa48("42637"), [stryMutAct_9fa48("42638") ? {} : (stryCov_9fa48("42638"), {
            key: stryMutAct_9fa48("42639") ? "" : (stryCov_9fa48("42639"), 'Enter'),
            description: stryMutAct_9fa48("42640") ? "" : (stryCov_9fa48("42640"), 'View operation details')
          }), stryMutAct_9fa48("42641") ? {} : (stryCov_9fa48("42641"), {
            key: stryMutAct_9fa48("42642") ? "" : (stryCov_9fa48("42642"), 'i'),
            description: stryMutAct_9fa48("42643") ? "" : (stryCov_9fa48("42643"), 'Filter in-flight operations only')
          }), stryMutAct_9fa48("42644") ? {} : (stryCov_9fa48("42644"), {
            key: stryMutAct_9fa48("42645") ? "" : (stryCov_9fa48("42645"), 'f'),
            description: stryMutAct_9fa48("42646") ? "" : (stryCov_9fa48("42646"), 'Filter failed operations only')
          })])
        })
      });
    }
  }

  /**
   * Get help content for current view
   * @param {string} currentView - Current view name
   * @returns {Object} Help content
   */
  getHelpContent(currentView) {
    if (stryMutAct_9fa48("42647")) {
      {}
    } else {
      stryCov_9fa48("42647");
      const viewHelp = stryMutAct_9fa48("42650") ? this.viewHelp[currentView] && null : stryMutAct_9fa48("42649") ? false : stryMutAct_9fa48("42648") ? true : (stryCov_9fa48("42648", "42649", "42650"), this.viewHelp[currentView] || null);
      return stryMutAct_9fa48("42651") ? {} : (stryCov_9fa48("42651"), {
        globalShortcuts: this.globalShortcuts,
        viewHelp,
        currentView
      });
    }
  }

  /**
   * Format help content as text for display
   * @param {string} currentView - Current view name
   * @returns {string} Formatted help text
   */
  formatHelpText(currentView) {
    if (stryMutAct_9fa48("42652")) {
      {}
    } else {
      stryCov_9fa48("42652");
      const content = this.getHelpContent(currentView);
      const lines = stryMutAct_9fa48("42653") ? ["Stryker was here"] : (stryCov_9fa48("42653"), []);

      // Title
      lines.push(stryMutAct_9fa48("42654") ? "" : (stryCov_9fa48("42654"), '╔════════════════════════════════════════════════════════════╗'));
      lines.push(stryMutAct_9fa48("42655") ? "" : (stryCov_9fa48("42655"), '║                      KEYBOARD SHORTCUTS                     ║'));
      lines.push(stryMutAct_9fa48("42656") ? "" : (stryCov_9fa48("42656"), '╚════════════════════════════════════════════════════════════╝'));
      lines.push(stryMutAct_9fa48("42657") ? "Stryker was here!" : (stryCov_9fa48("42657"), ''));

      // View-specific help first (if available)
      if (stryMutAct_9fa48("42659") ? false : stryMutAct_9fa48("42658") ? true : (stryCov_9fa48("42658", "42659"), content.viewHelp)) {
        if (stryMutAct_9fa48("42660")) {
          {}
        } else {
          stryCov_9fa48("42660");
          lines.push(stryMutAct_9fa48("42661") ? `` : (stryCov_9fa48("42661"), `── ${content.viewHelp.title} ──`));
          lines.push(content.viewHelp.description);
          lines.push(stryMutAct_9fa48("42662") ? "Stryker was here!" : (stryCov_9fa48("42662"), ''));
          for (const shortcut of content.viewHelp.shortcuts) {
            if (stryMutAct_9fa48("42663")) {
              {}
            } else {
              stryCov_9fa48("42663");
              lines.push(stryMutAct_9fa48("42664") ? `` : (stryCov_9fa48("42664"), `  ${this.padKey(shortcut.key)}  ${shortcut.description}`));
            }
          }
          lines.push(stryMutAct_9fa48("42665") ? "Stryker was here!" : (stryCov_9fa48("42665"), ''));
        }
      }

      // Global shortcuts by category
      for (const category of content.globalShortcuts) {
        if (stryMutAct_9fa48("42666")) {
          {}
        } else {
          stryCov_9fa48("42666");
          lines.push(stryMutAct_9fa48("42667") ? `` : (stryCov_9fa48("42667"), `── ${category.name} ──`));
          for (const shortcut of category.shortcuts) {
            if (stryMutAct_9fa48("42668")) {
              {}
            } else {
              stryCov_9fa48("42668");
              lines.push(stryMutAct_9fa48("42669") ? `` : (stryCov_9fa48("42669"), `  ${this.padKey(shortcut.key)}  ${shortcut.description}`));
            }
          }
          lines.push(stryMutAct_9fa48("42670") ? "Stryker was here!" : (stryCov_9fa48("42670"), ''));
        }
      }
      lines.push(stryMutAct_9fa48("42671") ? "" : (stryCov_9fa48("42671"), 'Press any key to close this help'));
      return lines.join(stryMutAct_9fa48("42672") ? "" : (stryCov_9fa48("42672"), '\n'));
    }
  }

  /**
   * Pad a key string for alignment
   * @param {string} key - Key string
   * @returns {string} Padded key
   */
  padKey(key) {
    if (stryMutAct_9fa48("42673")) {
      {}
    } else {
      stryCov_9fa48("42673");
      return key.padEnd(16);
    }
  }

  /**
   * Get status bar hints for current view
   * @param {string} currentView - Current view name
   * @returns {string} Status bar hint text
   */
  getStatusBarHints(currentView) {
    if (stryMutAct_9fa48("42674")) {
      {}
    } else {
      stryCov_9fa48("42674");
      const hints = stryMutAct_9fa48("42675") ? [] : (stryCov_9fa48("42675"), [stryMutAct_9fa48("42676") ? "" : (stryCov_9fa48("42676"), '?:Help'), stryMutAct_9fa48("42677") ? "" : (stryCov_9fa48("42677"), 'q:Quit'), stryMutAct_9fa48("42678") ? "" : (stryCov_9fa48("42678"), '/:Filter'), stryMutAct_9fa48("42679") ? "" : (stryCov_9fa48("42679"), '::Command')]);

      // Add view-specific hints
      switch (currentView) {
        case stryMutAct_9fa48("42681") ? "" : (stryCov_9fa48("42681"), 'sql'):
          if (stryMutAct_9fa48("42680")) {} else {
            stryCov_9fa48("42680");
            hints.unshift(stryMutAct_9fa48("42682") ? "" : (stryCov_9fa48("42682"), 'Ctrl+X:Execute'));
            break;
          }
        case stryMutAct_9fa48("42684") ? "" : (stryCov_9fa48("42684"), 'logs'):
          if (stryMutAct_9fa48("42683")) {} else {
            stryCov_9fa48("42683");
            hints.unshift(stryMutAct_9fa48("42685") ? "" : (stryCov_9fa48("42685"), 'l:Level'), stryMutAct_9fa48("42686") ? "" : (stryCov_9fa48("42686"), 'n:Node'));
            break;
          }
        case stryMutAct_9fa48("42688") ? "" : (stryCov_9fa48("42688"), 'config'):
          if (stryMutAct_9fa48("42687")) {} else {
            stryCov_9fa48("42687");
            hints.unshift(stryMutAct_9fa48("42689") ? "" : (stryCov_9fa48("42689"), 'e:Edit'), stryMutAct_9fa48("42690") ? "" : (stryCov_9fa48("42690"), 'R:Revert'), stryMutAct_9fa48("42691") ? "" : (stryCov_9fa48("42691"), 'Enter:Details'));
            break;
          }
        default:
          if (stryMutAct_9fa48("42692")) {} else {
            stryCov_9fa48("42692");
            hints.unshift(stryMutAct_9fa48("42693") ? "" : (stryCov_9fa48("42693"), 'Enter:Drill Down'));
          }
      }
      return hints.join(stryMutAct_9fa48("42694") ? "" : (stryCov_9fa48("42694"), ' | '));
    }
  }

  /**
   * Get CLI usage information (for --help flag)
   * @returns {string} Usage text
   */
  getUsageText() {
    if (stryMutAct_9fa48("42695")) {
      {}
    } else {
      stryCov_9fa48("42695");
      return stryMutAct_9fa48("42696") ? `
ddb-admin - Distributed Database Administration CLI

USAGE:
  ddb-admin [OPTIONS] [NODE_ADDRESS]

ARGUMENTS:
  NODE_ADDRESS    Address of node to connect to (e.g., localhost:8080)

OPTIONS:
  -h, --help              Show this help message and exit
  -v, --version           Show version information
  --config <path>         Path to configuration file
  --refresh <ms>          Refresh interval in milliseconds (default: 5000)
  --view <name>           Initial view (nodes, services, tables, etc.)
  --read-only             Enable read-only mode (no write queries)
  --monochrome            Disable colors for terminals without color support

ENVIRONMENT VARIABLES:
  DDB_NODE_ADDRESS        Default node address
  DDB_REFRESH_INTERVAL    Default refresh interval

EXAMPLES:
  ddb-admin localhost:8080
  ddb-admin --view tables --read-only localhost:8080
  DDB_NODE_ADDRESS=localhost:8080 ddb-admin

For more information, see the documentation at:
  https://github.com/your-org/distributed-database/docs/admin-cli
` : (stryCov_9fa48("42696"), (stryMutAct_9fa48("42697") ? `` : (stryCov_9fa48("42697"), `
ddb-admin - Distributed Database Administration CLI

USAGE:
  ddb-admin [OPTIONS] [NODE_ADDRESS]

ARGUMENTS:
  NODE_ADDRESS    Address of node to connect to (e.g., localhost:8080)

OPTIONS:
  -h, --help              Show this help message and exit
  -v, --version           Show version information
  --config <path>         Path to configuration file
  --refresh <ms>          Refresh interval in milliseconds (default: 5000)
  --view <name>           Initial view (nodes, services, tables, etc.)
  --read-only             Enable read-only mode (no write queries)
  --monochrome            Disable colors for terminals without color support

ENVIRONMENT VARIABLES:
  DDB_NODE_ADDRESS        Default node address
  DDB_REFRESH_INTERVAL    Default refresh interval

EXAMPLES:
  ddb-admin localhost:8080
  ddb-admin --view tables --read-only localhost:8080
  DDB_NODE_ADDRESS=localhost:8080 ddb-admin

For more information, see the documentation at:
  https://github.com/your-org/distributed-database/docs/admin-cli
`)).trim());
    }
  }

  /**
   * Show the help overlay
   */
  show() {
    if (stryMutAct_9fa48("42698")) {
      {}
    } else {
      stryCov_9fa48("42698");
      this.visible = stryMutAct_9fa48("42699") ? false : (stryCov_9fa48("42699"), true);
      if (stryMutAct_9fa48("42701") ? false : stryMutAct_9fa48("42700") ? true : (stryCov_9fa48("42700", "42701"), this.eventBus)) {
        if (stryMutAct_9fa48("42702")) {
          {}
        } else {
          stryCov_9fa48("42702");
          this.eventBus.emit(stryMutAct_9fa48("42703") ? "" : (stryCov_9fa48("42703"), 'help:show'), {});
        }
      }
    }
  }

  /**
   * Hide the help overlay
   */
  hide() {
    if (stryMutAct_9fa48("42704")) {
      {}
    } else {
      stryCov_9fa48("42704");
      this.visible = stryMutAct_9fa48("42705") ? true : (stryCov_9fa48("42705"), false);
      if (stryMutAct_9fa48("42707") ? false : stryMutAct_9fa48("42706") ? true : (stryCov_9fa48("42706", "42707"), this.eventBus)) {
        if (stryMutAct_9fa48("42708")) {
          {}
        } else {
          stryCov_9fa48("42708");
          this.eventBus.emit(stryMutAct_9fa48("42709") ? "" : (stryCov_9fa48("42709"), 'help:hide'), {});
        }
      }
    }
  }

  /**
   * Toggle help overlay visibility
   */
  toggle() {
    if (stryMutAct_9fa48("42710")) {
      {}
    } else {
      stryCov_9fa48("42710");
      if (stryMutAct_9fa48("42712") ? false : stryMutAct_9fa48("42711") ? true : (stryCov_9fa48("42711", "42712"), this.visible)) {
        if (stryMutAct_9fa48("42713")) {
          {}
        } else {
          stryCov_9fa48("42713");
          this.hide();
        }
      } else {
        if (stryMutAct_9fa48("42714")) {
          {}
        } else {
          stryCov_9fa48("42714");
          this.show();
        }
      }
    }
  }

  /**
   * Check if help overlay is visible
   * @returns {boolean}
   */
  isVisible() {
    if (stryMutAct_9fa48("42715")) {
      {}
    } else {
      stryCov_9fa48("42715");
      return this.visible;
    }
  }

  /**
   * Handle key input (any key dismisses help)
   * @param {Object} _key - Key event
   * @returns {boolean} True if key was handled
   */
  handleKey(_key) {
    if (stryMutAct_9fa48("42716")) {
      {}
    } else {
      stryCov_9fa48("42716");
      if (stryMutAct_9fa48("42718") ? false : stryMutAct_9fa48("42717") ? true : (stryCov_9fa48("42717", "42718"), this.visible)) {
        if (stryMutAct_9fa48("42719")) {
          {}
        } else {
          stryCov_9fa48("42719");
          this.hide();
          return stryMutAct_9fa48("42720") ? false : (stryCov_9fa48("42720"), true);
        }
      }
      return stryMutAct_9fa48("42721") ? true : (stryCov_9fa48("42721"), false);
    }
  }

  /**
   * Get all shortcuts as a flat list
   * @returns {Array<{category: string, key: string, description: string}>}
   */
  getAllShortcuts() {
    if (stryMutAct_9fa48("42722")) {
      {}
    } else {
      stryCov_9fa48("42722");
      const result = stryMutAct_9fa48("42723") ? ["Stryker was here"] : (stryCov_9fa48("42723"), []);
      for (const category of this.globalShortcuts) {
        if (stryMutAct_9fa48("42724")) {
          {}
        } else {
          stryCov_9fa48("42724");
          for (const shortcut of category.shortcuts) {
            if (stryMutAct_9fa48("42725")) {
              {}
            } else {
              stryCov_9fa48("42725");
              result.push(stryMutAct_9fa48("42726") ? {} : (stryCov_9fa48("42726"), {
                category: category.name,
                key: shortcut.key,
                description: shortcut.description
              }));
            }
          }
        }
      }
      return result;
    }
  }

  /**
   * Get shortcuts for a specific category
   * @param {string} categoryName - Category name
   * @returns {Array<{key: string, description: string}>}
   */
  getShortcutsByCategory(categoryName) {
    if (stryMutAct_9fa48("42727")) {
      {}
    } else {
      stryCov_9fa48("42727");
      const category = this.globalShortcuts.find(stryMutAct_9fa48("42728") ? () => undefined : (stryCov_9fa48("42728"), c => stryMutAct_9fa48("42731") ? c.name !== categoryName : stryMutAct_9fa48("42730") ? false : stryMutAct_9fa48("42729") ? true : (stryCov_9fa48("42729", "42730", "42731"), c.name === categoryName)));
      return category ? category.shortcuts : stryMutAct_9fa48("42732") ? ["Stryker was here"] : (stryCov_9fa48("42732"), []);
    }
  }

  /**
   * Get view-specific shortcuts
   * @param {string} viewName - View name
   * @returns {Array<{key: string, description: string}>}
   */
  getViewShortcuts(viewName) {
    if (stryMutAct_9fa48("42733")) {
      {}
    } else {
      stryCov_9fa48("42733");
      const viewHelp = this.viewHelp[viewName];
      return viewHelp ? viewHelp.shortcuts : stryMutAct_9fa48("42734") ? ["Stryker was here"] : (stryCov_9fa48("42734"), []);
    }
  }
}