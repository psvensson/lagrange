/**
 * DetailPanel - Reusable detail panel component for displaying entity details
 *
 * Provides scrollable detail views with sections and fields.
 * Supports multiple layouts (side, bottom, overlay).
 *
 * Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6
 */
// @ts-nocheck


/**
 * Detail panel position types
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
export const PANEL_POSITION = stryMutAct_9fa48("41149") ? {} : (stryCov_9fa48("41149"), {
  SIDE: stryMutAct_9fa48("41150") ? "" : (stryCov_9fa48("41150"), 'side'),
  BOTTOM: stryMutAct_9fa48("41151") ? "" : (stryCov_9fa48("41151"), 'bottom'),
  OVERLAY: stryMutAct_9fa48("41152") ? "" : (stryCov_9fa48("41152"), 'overlay')
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
    if (stryMutAct_9fa48("41153")) {
      {}
    } else {
      stryCov_9fa48("41153");
      this.eventBus = stryMutAct_9fa48("41156") ? options.eventBus && null : stryMutAct_9fa48("41155") ? false : stryMutAct_9fa48("41154") ? true : (stryCov_9fa48("41154", "41155", "41156"), options.eventBus || null);
      this.position = stryMutAct_9fa48("41159") ? options.position && PANEL_POSITION.SIDE : stryMutAct_9fa48("41158") ? false : stryMutAct_9fa48("41157") ? true : (stryCov_9fa48("41157", "41158", "41159"), options.position || PANEL_POSITION.SIDE);
      this.maxHeight = stryMutAct_9fa48("41162") ? options.maxHeight && 30 : stryMutAct_9fa48("41161") ? false : stryMutAct_9fa48("41160") ? true : (stryCov_9fa48("41160", "41161", "41162"), options.maxHeight || 30);
      this.maxWidth = stryMutAct_9fa48("41165") ? options.maxWidth && 60 : stryMutAct_9fa48("41164") ? false : stryMutAct_9fa48("41163") ? true : (stryCov_9fa48("41163", "41164", "41165"), options.maxWidth || 60);

      // Panel state
      this.visible = stryMutAct_9fa48("41166") ? true : (stryCov_9fa48("41166"), false);
      this.detailData = null;
      this.scrollOffset = 0;
      this.renderedLines = stryMutAct_9fa48("41167") ? ["Stryker was here"] : (stryCov_9fa48("41167"), []);

      // Setup event listeners
      this.setupEventListeners();
    }
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    if (stryMutAct_9fa48("41168")) {
      {}
    } else {
      stryCov_9fa48("41168");
      if (stryMutAct_9fa48("41170") ? false : stryMutAct_9fa48("41169") ? true : (stryCov_9fa48("41169", "41170"), this.eventBus)) {
        if (stryMutAct_9fa48("41171")) {
          {}
        } else {
          stryCov_9fa48("41171");
          this.eventBus.on(stryMutAct_9fa48("41172") ? "" : (stryCov_9fa48("41172"), 'detailCoordinator:detailUpdated'), data => {
            if (stryMutAct_9fa48("41173")) {
              {}
            } else {
              stryCov_9fa48("41173");
              this.setDetailData(data.detailData);
            }
          });
          this.eventBus.on(stryMutAct_9fa48("41174") ? "" : (stryCov_9fa48("41174"), 'detailCoordinator:detailCleared'), () => {
            if (stryMutAct_9fa48("41175")) {
              {}
            } else {
              stryCov_9fa48("41175");
              this.clearDetailData();
            }
          });
          this.eventBus.on(stryMutAct_9fa48("41176") ? "" : (stryCov_9fa48("41176"), 'detailCoordinator:panelShown'), () => {
            if (stryMutAct_9fa48("41177")) {
              {}
            } else {
              stryCov_9fa48("41177");
              this.show();
            }
          });
          this.eventBus.on(stryMutAct_9fa48("41178") ? "" : (stryCov_9fa48("41178"), 'detailCoordinator:panelHidden'), () => {
            if (stryMutAct_9fa48("41179")) {
              {}
            } else {
              stryCov_9fa48("41179");
              this.hide();
            }
          });
        }
      }
    }
  }

  /**
   * Set the detail data to display
   * @param {Object|null} detailData - Detail data with title and sections
   */
  setDetailData(detailData) {
    if (stryMutAct_9fa48("41180")) {
      {}
    } else {
      stryCov_9fa48("41180");
      this.detailData = detailData;
      this.scrollOffset = 0;
      this.renderContent();
    }
  }

  /**
   * Clear the detail data
   */
  clearDetailData() {
    if (stryMutAct_9fa48("41181")) {
      {}
    } else {
      stryCov_9fa48("41181");
      this.detailData = null;
      this.scrollOffset = 0;
      this.renderedLines = stryMutAct_9fa48("41182") ? ["Stryker was here"] : (stryCov_9fa48("41182"), []);
    }
  }

  /**
   * Show the panel
   */
  show() {
    if (stryMutAct_9fa48("41183")) {
      {}
    } else {
      stryCov_9fa48("41183");
      this.visible = stryMutAct_9fa48("41184") ? false : (stryCov_9fa48("41184"), true);
      if (stryMutAct_9fa48("41186") ? false : stryMutAct_9fa48("41185") ? true : (stryCov_9fa48("41185", "41186"), this.eventBus)) {
        if (stryMutAct_9fa48("41187")) {
          {}
        } else {
          stryCov_9fa48("41187");
          this.eventBus.emit(stryMutAct_9fa48("41188") ? "" : (stryCov_9fa48("41188"), 'detailPanel:shown'), stryMutAct_9fa48("41189") ? {} : (stryCov_9fa48("41189"), {
            position: this.position
          }));
        }
      }
    }
  }

  /**
   * Hide the panel
   */
  hide() {
    if (stryMutAct_9fa48("41190")) {
      {}
    } else {
      stryCov_9fa48("41190");
      this.visible = stryMutAct_9fa48("41191") ? true : (stryCov_9fa48("41191"), false);
      if (stryMutAct_9fa48("41193") ? false : stryMutAct_9fa48("41192") ? true : (stryCov_9fa48("41192", "41193"), this.eventBus)) {
        if (stryMutAct_9fa48("41194")) {
          {}
        } else {
          stryCov_9fa48("41194");
          this.eventBus.emit(stryMutAct_9fa48("41195") ? "" : (stryCov_9fa48("41195"), 'detailPanel:hidden'), {});
        }
      }
    }
  }

  /**
   * Toggle panel visibility
   */
  toggle() {
    if (stryMutAct_9fa48("41196")) {
      {}
    } else {
      stryCov_9fa48("41196");
      if (stryMutAct_9fa48("41198") ? false : stryMutAct_9fa48("41197") ? true : (stryCov_9fa48("41197", "41198"), this.visible)) {
        if (stryMutAct_9fa48("41199")) {
          {}
        } else {
          stryCov_9fa48("41199");
          this.hide();
        }
      } else {
        if (stryMutAct_9fa48("41200")) {
          {}
        } else {
          stryCov_9fa48("41200");
          this.show();
        }
      }
    }
  }

  /**
   * Check if panel is visible
   * @return {boolean}
   */
  isVisible() {
    if (stryMutAct_9fa48("41201")) {
      {}
    } else {
      stryCov_9fa48("41201");
      return this.visible;
    }
  }

  /**
   * Set panel position
   * @param {string} position - Panel position
   */
  setPosition(position) {
    if (stryMutAct_9fa48("41202")) {
      {}
    } else {
      stryCov_9fa48("41202");
      if (stryMutAct_9fa48("41204") ? false : stryMutAct_9fa48("41203") ? true : (stryCov_9fa48("41203", "41204"), Object.values(PANEL_POSITION).includes(position))) {
        if (stryMutAct_9fa48("41205")) {
          {}
        } else {
          stryCov_9fa48("41205");
          this.position = position;
        }
      }
    }
  }

  /**
   * Get panel position
   * @return {string}
   */
  getPosition() {
    if (stryMutAct_9fa48("41206")) {
      {}
    } else {
      stryCov_9fa48("41206");
      return this.position;
    }
  }

  /**
   * Scroll up in the detail panel
   * Requirements: 16.4
   * @param {number} [lines=1] - Number of lines to scroll
   */
  scrollUp(lines = 1) {
    if (stryMutAct_9fa48("41207")) {
      {}
    } else {
      stryCov_9fa48("41207");
      this.scrollOffset = stryMutAct_9fa48("41208") ? Math.min(0, this.scrollOffset - lines) : (stryCov_9fa48("41208"), Math.max(0, stryMutAct_9fa48("41209") ? this.scrollOffset + lines : (stryCov_9fa48("41209"), this.scrollOffset - lines)));
    }
  }

  /**
   * Scroll down in the detail panel
   * Requirements: 16.4
   * @param {number} [lines=1] - Number of lines to scroll
   */
  scrollDown(lines = 1) {
    if (stryMutAct_9fa48("41210")) {
      {}
    } else {
      stryCov_9fa48("41210");
      const maxScroll = stryMutAct_9fa48("41211") ? Math.min(0, this.renderedLines.length - this.maxHeight) : (stryCov_9fa48("41211"), Math.max(0, stryMutAct_9fa48("41212") ? this.renderedLines.length + this.maxHeight : (stryCov_9fa48("41212"), this.renderedLines.length - this.maxHeight)));
      this.scrollOffset = stryMutAct_9fa48("41213") ? Math.max(maxScroll, this.scrollOffset + lines) : (stryCov_9fa48("41213"), Math.min(maxScroll, stryMutAct_9fa48("41214") ? this.scrollOffset - lines : (stryCov_9fa48("41214"), this.scrollOffset + lines)));
    }
  }

  /**
   * Scroll to top
   */
  scrollToTop() {
    if (stryMutAct_9fa48("41215")) {
      {}
    } else {
      stryCov_9fa48("41215");
      this.scrollOffset = 0;
    }
  }

  /**
   * Scroll to bottom
   */
  scrollToBottom() {
    if (stryMutAct_9fa48("41216")) {
      {}
    } else {
      stryCov_9fa48("41216");
      const maxScroll = stryMutAct_9fa48("41217") ? Math.min(0, this.renderedLines.length - this.maxHeight) : (stryCov_9fa48("41217"), Math.max(0, stryMutAct_9fa48("41218") ? this.renderedLines.length + this.maxHeight : (stryCov_9fa48("41218"), this.renderedLines.length - this.maxHeight)));
      this.scrollOffset = maxScroll;
    }
  }

  /**
   * Page up in the detail panel
   */
  pageUp() {
    if (stryMutAct_9fa48("41219")) {
      {}
    } else {
      stryCov_9fa48("41219");
      this.scrollUp(stryMutAct_9fa48("41220") ? this.maxHeight + 2 : (stryCov_9fa48("41220"), this.maxHeight - 2));
    }
  }

  /**
   * Page down in the detail panel
   */
  pageDown() {
    if (stryMutAct_9fa48("41221")) {
      {}
    } else {
      stryCov_9fa48("41221");
      this.scrollDown(stryMutAct_9fa48("41222") ? this.maxHeight + 2 : (stryCov_9fa48("41222"), this.maxHeight - 2));
    }
  }

  /**
   * Render the detail content into lines
   */
  renderContent() {
    if (stryMutAct_9fa48("41223")) {
      {}
    } else {
      stryCov_9fa48("41223");
      this.renderedLines = stryMutAct_9fa48("41224") ? ["Stryker was here"] : (stryCov_9fa48("41224"), []);
      if (stryMutAct_9fa48("41227") ? false : stryMutAct_9fa48("41226") ? true : stryMutAct_9fa48("41225") ? this.detailData : (stryCov_9fa48("41225", "41226", "41227"), !this.detailData)) {
        if (stryMutAct_9fa48("41228")) {
          {}
        } else {
          stryCov_9fa48("41228");
          return;
        }
      }

      // Add title
      if (stryMutAct_9fa48("41230") ? false : stryMutAct_9fa48("41229") ? true : (stryCov_9fa48("41229", "41230"), this.detailData.title)) {
        if (stryMutAct_9fa48("41231")) {
          {}
        } else {
          stryCov_9fa48("41231");
          this.renderedLines.push(stryMutAct_9fa48("41232") ? {} : (stryCov_9fa48("41232"), {
            type: stryMutAct_9fa48("41233") ? "" : (stryCov_9fa48("41233"), 'title'),
            text: this.detailData.title
          }));
          this.renderedLines.push(stryMutAct_9fa48("41234") ? {} : (stryCov_9fa48("41234"), {
            type: stryMutAct_9fa48("41235") ? "" : (stryCov_9fa48("41235"), 'separator')
          }));
        }
      }

      // Add sections
      if (stryMutAct_9fa48("41237") ? false : stryMutAct_9fa48("41236") ? true : (stryCov_9fa48("41236", "41237"), this.detailData.sections)) {
        if (stryMutAct_9fa48("41238")) {
          {}
        } else {
          stryCov_9fa48("41238");
          for (let i = 0; stryMutAct_9fa48("41241") ? i >= this.detailData.sections.length : stryMutAct_9fa48("41240") ? i <= this.detailData.sections.length : stryMutAct_9fa48("41239") ? false : (stryCov_9fa48("41239", "41240", "41241"), i < this.detailData.sections.length); stryMutAct_9fa48("41242") ? i-- : (stryCov_9fa48("41242"), i++)) {
            if (stryMutAct_9fa48("41243")) {
              {}
            } else {
              stryCov_9fa48("41243");
              const section = this.detailData.sections[i];

              // Add section header
              if (stryMutAct_9fa48("41245") ? false : stryMutAct_9fa48("41244") ? true : (stryCov_9fa48("41244", "41245"), section.title)) {
                if (stryMutAct_9fa48("41246")) {
                  {}
                } else {
                  stryCov_9fa48("41246");
                  if (stryMutAct_9fa48("41250") ? i <= 0 : stryMutAct_9fa48("41249") ? i >= 0 : stryMutAct_9fa48("41248") ? false : stryMutAct_9fa48("41247") ? true : (stryCov_9fa48("41247", "41248", "41249", "41250"), i > 0)) {
                    if (stryMutAct_9fa48("41251")) {
                      {}
                    } else {
                      stryCov_9fa48("41251");
                      this.renderedLines.push(stryMutAct_9fa48("41252") ? {} : (stryCov_9fa48("41252"), {
                        type: stryMutAct_9fa48("41253") ? "" : (stryCov_9fa48("41253"), 'blank')
                      }));
                    }
                  }
                  this.renderedLines.push(stryMutAct_9fa48("41254") ? {} : (stryCov_9fa48("41254"), {
                    type: stryMutAct_9fa48("41255") ? "" : (stryCov_9fa48("41255"), 'sectionHeader'),
                    text: section.title
                  }));
                }
              }

              // Add fields
              if (stryMutAct_9fa48("41257") ? false : stryMutAct_9fa48("41256") ? true : (stryCov_9fa48("41256", "41257"), section.fields)) {
                if (stryMutAct_9fa48("41258")) {
                  {}
                } else {
                  stryCov_9fa48("41258");
                  for (const field of section.fields) {
                    if (stryMutAct_9fa48("41259")) {
                      {}
                    } else {
                      stryCov_9fa48("41259");
                      this.addFieldLines(field);
                    }
                  }
                }
              }
            }
          }
        }
      }

      // Add related counts if available
      if (stryMutAct_9fa48("41261") ? false : stryMutAct_9fa48("41260") ? true : (stryCov_9fa48("41260", "41261"), this.detailData.relatedCounts)) {
        if (stryMutAct_9fa48("41262")) {
          {}
        } else {
          stryCov_9fa48("41262");
          this.renderedLines.push(stryMutAct_9fa48("41263") ? {} : (stryCov_9fa48("41263"), {
            type: stryMutAct_9fa48("41264") ? "" : (stryCov_9fa48("41264"), 'blank')
          }));
          this.renderedLines.push(stryMutAct_9fa48("41265") ? {} : (stryCov_9fa48("41265"), {
            type: stryMutAct_9fa48("41266") ? "" : (stryCov_9fa48("41266"), 'sectionHeader'),
            text: stryMutAct_9fa48("41267") ? "" : (stryCov_9fa48("41267"), 'Related Entities')
          }));
          for (const [entity, count] of Object.entries(this.detailData.relatedCounts)) {
            if (stryMutAct_9fa48("41268")) {
              {}
            } else {
              stryCov_9fa48("41268");
              this.renderedLines.push(stryMutAct_9fa48("41269") ? {} : (stryCov_9fa48("41269"), {
                type: stryMutAct_9fa48("41270") ? "" : (stryCov_9fa48("41270"), 'field'),
                label: entity,
                value: String(count)
              }));
            }
          }
        }
      }

      // Add navigation links if available
      if (stryMutAct_9fa48("41273") ? this.detailData.navigationLinks || this.detailData.navigationLinks.length > 0 : stryMutAct_9fa48("41272") ? false : stryMutAct_9fa48("41271") ? true : (stryCov_9fa48("41271", "41272", "41273"), this.detailData.navigationLinks && (stryMutAct_9fa48("41276") ? this.detailData.navigationLinks.length <= 0 : stryMutAct_9fa48("41275") ? this.detailData.navigationLinks.length >= 0 : stryMutAct_9fa48("41274") ? true : (stryCov_9fa48("41274", "41275", "41276"), this.detailData.navigationLinks.length > 0)))) {
        if (stryMutAct_9fa48("41277")) {
          {}
        } else {
          stryCov_9fa48("41277");
          this.renderedLines.push(stryMutAct_9fa48("41278") ? {} : (stryCov_9fa48("41278"), {
            type: stryMutAct_9fa48("41279") ? "" : (stryCov_9fa48("41279"), 'blank')
          }));
          this.renderedLines.push(stryMutAct_9fa48("41280") ? {} : (stryCov_9fa48("41280"), {
            type: stryMutAct_9fa48("41281") ? "" : (stryCov_9fa48("41281"), 'sectionHeader'),
            text: stryMutAct_9fa48("41282") ? "" : (stryCov_9fa48("41282"), 'Quick Navigation')
          }));
          for (const link of this.detailData.navigationLinks) {
            if (stryMutAct_9fa48("41283")) {
              {}
            } else {
              stryCov_9fa48("41283");
              this.renderedLines.push(stryMutAct_9fa48("41284") ? {} : (stryCov_9fa48("41284"), {
                type: stryMutAct_9fa48("41285") ? "" : (stryCov_9fa48("41285"), 'link'),
                label: link.label,
                target: link.target,
                key: link.key
              }));
            }
          }
        }
      }
    }
  }

  /**
   * Add field lines, handling multi-line values
   * @param {Object} field - Field with label and value
   */
  addFieldLines(field) {
    if (stryMutAct_9fa48("41286")) {
      {}
    } else {
      stryCov_9fa48("41286");
      const value = (stryMutAct_9fa48("41289") ? field.value !== null || field.value !== undefined : stryMutAct_9fa48("41288") ? false : stryMutAct_9fa48("41287") ? true : (stryCov_9fa48("41287", "41288", "41289"), (stryMutAct_9fa48("41291") ? field.value === null : stryMutAct_9fa48("41290") ? true : (stryCov_9fa48("41290", "41291"), field.value !== null)) && (stryMutAct_9fa48("41293") ? field.value === undefined : stryMutAct_9fa48("41292") ? true : (stryCov_9fa48("41292", "41293"), field.value !== undefined)))) ? String(field.value) : stryMutAct_9fa48("41294") ? "" : (stryCov_9fa48("41294"), 'N/A');

      // Check if value is multi-line
      if (stryMutAct_9fa48("41296") ? false : stryMutAct_9fa48("41295") ? true : (stryCov_9fa48("41295", "41296"), value.includes(stryMutAct_9fa48("41297") ? "" : (stryCov_9fa48("41297"), '\n')))) {
        if (stryMutAct_9fa48("41298")) {
          {}
        } else {
          stryCov_9fa48("41298");
          // Add label on its own line
          this.renderedLines.push(stryMutAct_9fa48("41299") ? {} : (stryCov_9fa48("41299"), {
            type: stryMutAct_9fa48("41300") ? "" : (stryCov_9fa48("41300"), 'fieldLabel'),
            label: field.label
          }));

          // Add each line of the value
          const lines = value.split(stryMutAct_9fa48("41301") ? "" : (stryCov_9fa48("41301"), '\n'));
          for (const line of lines) {
            if (stryMutAct_9fa48("41302")) {
              {}
            } else {
              stryCov_9fa48("41302");
              this.renderedLines.push(stryMutAct_9fa48("41303") ? {} : (stryCov_9fa48("41303"), {
                type: stryMutAct_9fa48("41304") ? "" : (stryCov_9fa48("41304"), 'fieldValueLine'),
                text: line
              }));
            }
          }
        }
      } else {
        if (stryMutAct_9fa48("41305")) {
          {}
        } else {
          stryCov_9fa48("41305");
          // Single line field
          this.renderedLines.push(stryMutAct_9fa48("41306") ? {} : (stryCov_9fa48("41306"), {
            type: stryMutAct_9fa48("41307") ? "" : (stryCov_9fa48("41307"), 'field'),
            label: field.label,
            value: value
          }));
        }
      }
    }
  }

  /**
   * Get the visible lines based on scroll offset
   * @return {Array} Visible lines
   */
  getVisibleLines() {
    if (stryMutAct_9fa48("41308")) {
      {}
    } else {
      stryCov_9fa48("41308");
      const start = this.scrollOffset;
      const end = stryMutAct_9fa48("41309") ? start - this.maxHeight : (stryCov_9fa48("41309"), start + this.maxHeight);
      return stryMutAct_9fa48("41310") ? this.renderedLines : (stryCov_9fa48("41310"), this.renderedLines.slice(start, end));
    }
  }

  /**
   * Render the panel to a formatted output
   * @param {Object} options - Render options
   * @param {boolean} [options.monochrome] - Use monochrome mode
   * @return {Object} Rendered panel data
   */
  render(options = {}) {
    if (stryMutAct_9fa48("41311")) {
      {}
    } else {
      stryCov_9fa48("41311");
      const monochrome = stryMutAct_9fa48("41314") ? options.monochrome && false : stryMutAct_9fa48("41313") ? false : stryMutAct_9fa48("41312") ? true : (stryCov_9fa48("41312", "41313", "41314"), options.monochrome || (stryMutAct_9fa48("41315") ? true : (stryCov_9fa48("41315"), false)));
      const visibleLines = this.getVisibleLines();
      const formattedLines = visibleLines.map(stryMutAct_9fa48("41316") ? () => undefined : (stryCov_9fa48("41316"), line => this.formatLine(line, monochrome)));

      // Add scroll indicators
      const canScrollUp = stryMutAct_9fa48("41320") ? this.scrollOffset <= 0 : stryMutAct_9fa48("41319") ? this.scrollOffset >= 0 : stryMutAct_9fa48("41318") ? false : stryMutAct_9fa48("41317") ? true : (stryCov_9fa48("41317", "41318", "41319", "41320"), this.scrollOffset > 0);
      const canScrollDown = stryMutAct_9fa48("41324") ? this.scrollOffset >= Math.max(0, this.renderedLines.length - this.maxHeight) : stryMutAct_9fa48("41323") ? this.scrollOffset <= Math.max(0, this.renderedLines.length - this.maxHeight) : stryMutAct_9fa48("41322") ? false : stryMutAct_9fa48("41321") ? true : (stryCov_9fa48("41321", "41322", "41323", "41324"), this.scrollOffset < (stryMutAct_9fa48("41325") ? Math.min(0, this.renderedLines.length - this.maxHeight) : (stryCov_9fa48("41325"), Math.max(0, stryMutAct_9fa48("41326") ? this.renderedLines.length + this.maxHeight : (stryCov_9fa48("41326"), this.renderedLines.length - this.maxHeight)))));
      return stryMutAct_9fa48("41327") ? {} : (stryCov_9fa48("41327"), {
        visible: this.visible,
        position: this.position,
        title: stryMutAct_9fa48("41330") ? this.detailData?.title && '' : stryMutAct_9fa48("41329") ? false : stryMutAct_9fa48("41328") ? true : (stryCov_9fa48("41328", "41329", "41330"), (stryMutAct_9fa48("41331") ? this.detailData.title : (stryCov_9fa48("41331"), this.detailData?.title)) || (stryMutAct_9fa48("41332") ? "Stryker was here!" : (stryCov_9fa48("41332"), ''))),
        lines: formattedLines,
        totalLines: this.renderedLines.length,
        visibleLines: visibleLines.length,
        scrollOffset: this.scrollOffset,
        canScrollUp,
        canScrollDown,
        maxHeight: this.maxHeight,
        maxWidth: this.maxWidth
      });
    }
  }

  /**
   * Format a single line for display
   * @param {Object} line - Line data
   * @param {boolean} monochrome - Use monochrome mode
   * @return {Object} Formatted line
   */
  formatLine(line, monochrome) {
    if (stryMutAct_9fa48("41333")) {
      {}
    } else {
      stryCov_9fa48("41333");
      const colors = monochrome ? stryMutAct_9fa48("41334") ? {} : (stryCov_9fa48("41334"), {
        title: stryMutAct_9fa48("41335") ? "" : (stryCov_9fa48("41335"), 'white'),
        sectionHeader: stryMutAct_9fa48("41336") ? "" : (stryCov_9fa48("41336"), 'white'),
        label: stryMutAct_9fa48("41337") ? "" : (stryCov_9fa48("41337"), 'white'),
        value: stryMutAct_9fa48("41338") ? "" : (stryCov_9fa48("41338"), 'white'),
        link: stryMutAct_9fa48("41339") ? "" : (stryCov_9fa48("41339"), 'white')
      }) : stryMutAct_9fa48("41340") ? {} : (stryCov_9fa48("41340"), {
        title: stryMutAct_9fa48("41341") ? "" : (stryCov_9fa48("41341"), 'cyan'),
        sectionHeader: stryMutAct_9fa48("41342") ? "" : (stryCov_9fa48("41342"), 'yellow'),
        label: stryMutAct_9fa48("41343") ? "" : (stryCov_9fa48("41343"), 'gray'),
        value: stryMutAct_9fa48("41344") ? "" : (stryCov_9fa48("41344"), 'white'),
        link: stryMutAct_9fa48("41345") ? "" : (stryCov_9fa48("41345"), 'blue')
      });
      switch (line.type) {
        case stryMutAct_9fa48("41347") ? "" : (stryCov_9fa48("41347"), 'title'):
          if (stryMutAct_9fa48("41346")) {} else {
            stryCov_9fa48("41346");
            return stryMutAct_9fa48("41348") ? {} : (stryCov_9fa48("41348"), {
              type: stryMutAct_9fa48("41349") ? "" : (stryCov_9fa48("41349"), 'title'),
              text: line.text,
              color: colors.title,
              bold: stryMutAct_9fa48("41350") ? false : (stryCov_9fa48("41350"), true)
            });
          }
        case stryMutAct_9fa48("41352") ? "" : (stryCov_9fa48("41352"), 'separator'):
          if (stryMutAct_9fa48("41351")) {} else {
            stryCov_9fa48("41351");
            return stryMutAct_9fa48("41353") ? {} : (stryCov_9fa48("41353"), {
              type: stryMutAct_9fa48("41354") ? "" : (stryCov_9fa48("41354"), 'separator'),
              text: (stryMutAct_9fa48("41355") ? "" : (stryCov_9fa48("41355"), '─')).repeat(stryMutAct_9fa48("41356") ? this.maxWidth + 2 : (stryCov_9fa48("41356"), this.maxWidth - 2)),
              color: colors.label
            });
          }
        case stryMutAct_9fa48("41358") ? "" : (stryCov_9fa48("41358"), 'sectionHeader'):
          if (stryMutAct_9fa48("41357")) {} else {
            stryCov_9fa48("41357");
            return stryMutAct_9fa48("41359") ? {} : (stryCov_9fa48("41359"), {
              type: stryMutAct_9fa48("41360") ? "" : (stryCov_9fa48("41360"), 'sectionHeader'),
              text: stryMutAct_9fa48("41361") ? `` : (stryCov_9fa48("41361"), `▸ ${line.text}`),
              color: colors.sectionHeader,
              bold: stryMutAct_9fa48("41362") ? false : (stryCov_9fa48("41362"), true)
            });
          }
        case stryMutAct_9fa48("41364") ? "" : (stryCov_9fa48("41364"), 'field'):
          if (stryMutAct_9fa48("41363")) {} else {
            stryCov_9fa48("41363");
            return stryMutAct_9fa48("41365") ? {} : (stryCov_9fa48("41365"), {
              type: stryMutAct_9fa48("41366") ? "" : (stryCov_9fa48("41366"), 'field'),
              label: line.label,
              value: this.truncateValue(line.value),
              labelColor: colors.label,
              valueColor: colors.value
            });
          }
        case stryMutAct_9fa48("41368") ? "" : (stryCov_9fa48("41368"), 'fieldLabel'):
          if (stryMutAct_9fa48("41367")) {} else {
            stryCov_9fa48("41367");
            return stryMutAct_9fa48("41369") ? {} : (stryCov_9fa48("41369"), {
              type: stryMutAct_9fa48("41370") ? "" : (stryCov_9fa48("41370"), 'fieldLabel'),
              label: line.label,
              color: colors.label
            });
          }
        case stryMutAct_9fa48("41372") ? "" : (stryCov_9fa48("41372"), 'fieldValueLine'):
          if (stryMutAct_9fa48("41371")) {} else {
            stryCov_9fa48("41371");
            return stryMutAct_9fa48("41373") ? {} : (stryCov_9fa48("41373"), {
              type: stryMutAct_9fa48("41374") ? "" : (stryCov_9fa48("41374"), 'fieldValueLine'),
              text: this.truncateValue(line.text),
              color: colors.value
            });
          }
        case stryMutAct_9fa48("41376") ? "" : (stryCov_9fa48("41376"), 'link'):
          if (stryMutAct_9fa48("41375")) {} else {
            stryCov_9fa48("41375");
            return stryMutAct_9fa48("41377") ? {} : (stryCov_9fa48("41377"), {
              type: stryMutAct_9fa48("41378") ? "" : (stryCov_9fa48("41378"), 'link'),
              label: line.label,
              key: line.key,
              color: colors.link
            });
          }
        case stryMutAct_9fa48("41380") ? "" : (stryCov_9fa48("41380"), 'blank'):
          if (stryMutAct_9fa48("41379")) {} else {
            stryCov_9fa48("41379");
            return stryMutAct_9fa48("41381") ? {} : (stryCov_9fa48("41381"), {
              type: stryMutAct_9fa48("41382") ? "" : (stryCov_9fa48("41382"), 'blank'),
              text: stryMutAct_9fa48("41383") ? "Stryker was here!" : (stryCov_9fa48("41383"), '')
            });
          }
        default:
          if (stryMutAct_9fa48("41384")) {} else {
            stryCov_9fa48("41384");
            return stryMutAct_9fa48("41385") ? {} : (stryCov_9fa48("41385"), {
              type: stryMutAct_9fa48("41386") ? "" : (stryCov_9fa48("41386"), 'text'),
              text: stryMutAct_9fa48("41389") ? line.text && '' : stryMutAct_9fa48("41388") ? false : stryMutAct_9fa48("41387") ? true : (stryCov_9fa48("41387", "41388", "41389"), line.text || (stryMutAct_9fa48("41390") ? "Stryker was here!" : (stryCov_9fa48("41390"), ''))),
              color: colors.value
            });
          }
      }
    }
  }

  /**
   * Truncate a value to fit within max width
   * @param {string} value - Value to truncate
   * @return {string} Truncated value
   */
  truncateValue(value) {
    if (stryMutAct_9fa48("41391")) {
      {}
    } else {
      stryCov_9fa48("41391");
      const maxValueWidth = stryMutAct_9fa48("41392") ? this.maxWidth + 4 : (stryCov_9fa48("41392"), this.maxWidth - 4);
      if (stryMutAct_9fa48("41396") ? value.length > maxValueWidth : stryMutAct_9fa48("41395") ? value.length < maxValueWidth : stryMutAct_9fa48("41394") ? false : stryMutAct_9fa48("41393") ? true : (stryCov_9fa48("41393", "41394", "41395", "41396"), value.length <= maxValueWidth)) {
        if (stryMutAct_9fa48("41397")) {
          {}
        } else {
          stryCov_9fa48("41397");
          return value;
        }
      }
      return (stryMutAct_9fa48("41398") ? value : (stryCov_9fa48("41398"), value.substring(0, stryMutAct_9fa48("41399") ? maxValueWidth + 3 : (stryCov_9fa48("41399"), maxValueWidth - 3)))) + (stryMutAct_9fa48("41400") ? "" : (stryCov_9fa48("41400"), '...'));
    }
  }

  /**
   * Handle key input for scrolling
   * @param {Object} key - Key event
   * @return {boolean} True if key was handled
   */
  handleKey(key) {
    if (stryMutAct_9fa48("41401")) {
      {}
    } else {
      stryCov_9fa48("41401");
      if (stryMutAct_9fa48("41404") ? false : stryMutAct_9fa48("41403") ? true : stryMutAct_9fa48("41402") ? this.visible : (stryCov_9fa48("41402", "41403", "41404"), !this.visible)) {
        if (stryMutAct_9fa48("41405")) {
          {}
        } else {
          stryCov_9fa48("41405");
          return stryMutAct_9fa48("41406") ? true : (stryCov_9fa48("41406"), false);
        }
      }
      switch (key.name) {
        case stryMutAct_9fa48("41408") ? "" : (stryCov_9fa48("41408"), 'up'):
          if (stryMutAct_9fa48("41407")) {} else {
            stryCov_9fa48("41407");
            this.scrollUp();
            return stryMutAct_9fa48("41409") ? false : (stryCov_9fa48("41409"), true);
          }
        case stryMutAct_9fa48("41411") ? "" : (stryCov_9fa48("41411"), 'down'):
          if (stryMutAct_9fa48("41410")) {} else {
            stryCov_9fa48("41410");
            this.scrollDown();
            return stryMutAct_9fa48("41412") ? false : (stryCov_9fa48("41412"), true);
          }
        case stryMutAct_9fa48("41414") ? "" : (stryCov_9fa48("41414"), 'pageup'):
          if (stryMutAct_9fa48("41413")) {} else {
            stryCov_9fa48("41413");
            this.pageUp();
            return stryMutAct_9fa48("41415") ? false : (stryCov_9fa48("41415"), true);
          }
        case stryMutAct_9fa48("41417") ? "" : (stryCov_9fa48("41417"), 'pagedown'):
          if (stryMutAct_9fa48("41416")) {} else {
            stryCov_9fa48("41416");
            this.pageDown();
            return stryMutAct_9fa48("41418") ? false : (stryCov_9fa48("41418"), true);
          }
        case stryMutAct_9fa48("41420") ? "" : (stryCov_9fa48("41420"), 'home'):
          if (stryMutAct_9fa48("41419")) {} else {
            stryCov_9fa48("41419");
            this.scrollToTop();
            return stryMutAct_9fa48("41421") ? false : (stryCov_9fa48("41421"), true);
          }
        case stryMutAct_9fa48("41423") ? "" : (stryCov_9fa48("41423"), 'end'):
          if (stryMutAct_9fa48("41422")) {} else {
            stryCov_9fa48("41422");
            this.scrollToBottom();
            return stryMutAct_9fa48("41424") ? false : (stryCov_9fa48("41424"), true);
          }
        default:
          if (stryMutAct_9fa48("41425")) {} else {
            stryCov_9fa48("41425");
            return stryMutAct_9fa48("41426") ? true : (stryCov_9fa48("41426"), false);
          }
      }
    }
  }

  /**
   * Get scroll position info
   * @return {Object} Scroll position info
   */
  getScrollInfo() {
    if (stryMutAct_9fa48("41427")) {
      {}
    } else {
      stryCov_9fa48("41427");
      return stryMutAct_9fa48("41428") ? {} : (stryCov_9fa48("41428"), {
        offset: this.scrollOffset,
        totalLines: this.renderedLines.length,
        visibleLines: stryMutAct_9fa48("41429") ? Math.max(this.maxHeight, this.renderedLines.length) : (stryCov_9fa48("41429"), Math.min(this.maxHeight, this.renderedLines.length)),
        percentage: (stryMutAct_9fa48("41433") ? this.renderedLines.length <= 0 : stryMutAct_9fa48("41432") ? this.renderedLines.length >= 0 : stryMutAct_9fa48("41431") ? false : stryMutAct_9fa48("41430") ? true : (stryCov_9fa48("41430", "41431", "41432", "41433"), this.renderedLines.length > 0)) ? Math.round(stryMutAct_9fa48("41434") ? this.scrollOffset / Math.max(1, this.renderedLines.length - this.maxHeight) / 100 : (stryCov_9fa48("41434"), (stryMutAct_9fa48("41435") ? this.scrollOffset * Math.max(1, this.renderedLines.length - this.maxHeight) : (stryCov_9fa48("41435"), this.scrollOffset / (stryMutAct_9fa48("41436") ? Math.min(1, this.renderedLines.length - this.maxHeight) : (stryCov_9fa48("41436"), Math.max(1, stryMutAct_9fa48("41437") ? this.renderedLines.length + this.maxHeight : (stryCov_9fa48("41437"), this.renderedLines.length - this.maxHeight)))))) * 100)) : 0
      });
    }
  }

  /**
   * Destroy the panel and cleanup
   */
  destroy() {
    if (stryMutAct_9fa48("41438")) {
      {}
    } else {
      stryCov_9fa48("41438");
      this.detailData = null;
      this.renderedLines = stryMutAct_9fa48("41439") ? ["Stryker was here"] : (stryCov_9fa48("41439"), []);
      this.visible = stryMutAct_9fa48("41440") ? true : (stryCov_9fa48("41440"), false);
    }
  }
}