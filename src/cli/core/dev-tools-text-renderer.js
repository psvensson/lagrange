const TEXT_EMPTY = '';
const TEXT_NEWLINE = '\n';
const TEXT_STATE = 'state';
const TEXT_EVENTS = 'events';
const TEXT_COMPONENTS = 'components';
const TEXT_CDC = 'cdc';
const TEXT_PERFORMANCE = 'performance';
const TEXT_TAB_SEPARATOR = ' ';
const TEXT_INDENT = '  ';
const TEXT_HEADER_TOP = '╔════════════════════════════════════════════════════════════╗';
const TEXT_HEADER_TITLE = '║                        DEV TOOLS                           ║';
const TEXT_HEADER_BOTTOM = '╚════════════════════════════════════════════════════════════╝';
const TEXT_RULE_CHAR = '─';
const TEXT_RULE_WIDTH = 60;
const TEXT_CURRENT_STATE = 'Current State:';
const TEXT_EVENT_LIMIT = 20;
const TEXT_NUM_ZERO = 0;
const TEXT_INITIALIZATION_ORDER = 'Initialization Order:';
const TEXT_PERFORMANCE_METRICS = 'Performance Metrics:';
const TEXT_RENDER_TIMES = 'Render Times:';
const TEXT_EVENT_LATENCY = 'Event Latency:';
const TEXT_NO_CONTENT = 'No content';
const TEXT_KEY_HINTS = 'Keys: 1-5:Tabs | s:Snapshot | c:Clear | q/Esc:Close';

/**
 * Format DevTools tab content for text display.
 * @param {Object} options - Render inputs.
 * @param {Object} options.content - Current tab content.
 * @param {Array<{id: string, label: string}>} options.tabs - Available tabs.
 * @param {string} options.currentTab - Current tab identifier.
 * @param {(timestamp: number) => string} options.formatTimestamp - Timestamp formatter.
 * @returns {string} Formatted text content.
 */
export function formatDevToolsTextContent({content, tabs, currentTab, formatTimestamp}) {
  const lines = [];

  lines.push(TEXT_HEADER_TOP);
  lines.push(TEXT_HEADER_TITLE);
  lines.push(TEXT_HEADER_BOTTOM);
  lines.push(TEXT_EMPTY);

  const tabLine = tabs.map((tab) =>
    tab.id === currentTab ? `[${tab.label}]` : ` ${tab.label} `,
  ).join(TEXT_TAB_SEPARATOR);
  lines.push(tabLine);
  lines.push(TEXT_RULE_CHAR.repeat(TEXT_RULE_WIDTH));
  lines.push(TEXT_EMPTY);

  switch (content.type) {
  case TEXT_STATE:
    lines.push(TEXT_CURRENT_STATE);
    lines.push(TEXT_EMPTY);
    if (content.stateTree) {
      lines.push(content.stateTree);
    } else if (content.error) {
      lines.push(`Error: ${content.error}`);
    }
    lines.push(TEXT_EMPTY);
    lines.push(`Snapshots: ${content.snapshots?.length || TEXT_NUM_ZERO}`);
    break;

  case TEXT_EVENTS:
    lines.push(`Recent Events (${content.totalCount} total):`);
    lines.push(TEXT_EMPTY);
    for (const event of content.events.slice(TEXT_NUM_ZERO, TEXT_EVENT_LIMIT)) {
      lines.push(`${event.time} ${event.type || event.event}`);
      if (event.dataPreview) {
        lines.push(`${TEXT_INDENT}${event.dataPreview}`);
      }
    }
    break;

  case TEXT_COMPONENTS:
    lines.push(`Components (${content.componentCount}):`);
    lines.push(TEXT_EMPTY);
    lines.push(TEXT_INITIALIZATION_ORDER);
    for (const name of content.initOrder || []) {
      const info = content.dependencyGraph?.[name];
      const deps = info?.dependencies?.length ?
        ` → [${info.dependencies.join(', ')}]` : '';
      lines.push(`${TEXT_INDENT}${name}${deps}`);
    }
    break;

  case TEXT_CDC:
    lines.push(`CDC Events (${content.filteredCount}/${content.totalCount}):`);
    if (content.filter) {
      lines.push(`Filter: "${content.filter}"`);
    }
    lines.push(TEXT_EMPTY);
    for (const event of content.events.slice(TEXT_NUM_ZERO, TEXT_EVENT_LIMIT)) {
      const time = formatTimestamp(event.timestamp);
      lines.push(`${time} ${event.operation} ${event.table}:${event.key}`);
    }
    break;

  case TEXT_PERFORMANCE:
    lines.push(TEXT_PERFORMANCE_METRICS);
    lines.push(TEXT_EMPTY);
    lines.push(TEXT_RENDER_TIMES);
    lines.push(`  Samples: ${content.render.samples}`);
    lines.push(`  Average: ${content.render.avg}ms`);
    lines.push(`  Min: ${content.render.min}ms`);
    lines.push(`  Max: ${content.render.max}ms`);
    lines.push(TEXT_EMPTY);
    lines.push(TEXT_EVENT_LATENCY);
    lines.push(`  Samples: ${content.eventLatency.samples}`);
    lines.push(`  Average: ${content.eventLatency.avg}ms`);
    lines.push(`  Min: ${content.eventLatency.min}ms`);
    lines.push(`  Max: ${content.eventLatency.max}ms`);
    break;

  default:
    lines.push(content.content || TEXT_NO_CONTENT);
  }

  lines.push(TEXT_EMPTY);
  lines.push(TEXT_RULE_CHAR.repeat(TEXT_RULE_WIDTH));
  lines.push(TEXT_KEY_HINTS);

  return lines.join(TEXT_NEWLINE);
}
