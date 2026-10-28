import {stripVTControlCharacters} from 'node:util';
import blessed from 'blessed';

const DEFAULT_COLUMN_SPACING = 10;
const DEFAULT_SELECTED_FG = 'white';
const DEFAULT_SELECTED_BG = 'blue';
const DEFAULT_ITEM_FG = 'green';
const EMPTY_STRING = '';
const SPACE_CHAR = ' ';
const EVENT_ATTACH = 'attach';
const ROWS_TOP_OFFSET = 2;
const ROWS_LEFT_OFFSET = 1;
const ROWS_WIDTH_PAD = 3;
const ROWS_HEIGHT_PAD = 4;

function stripAnsiCodes(text) {
  return stripVTControlCharacters(String(text ?? EMPTY_STRING));
}

function formatTableCell(cellValue, colWidth, spacing) {
  const raw = String(cellValue ?? EMPTY_STRING);
  const plain = stripAnsiCodes(raw);
  const ansiLen = raw.length - plain.length;
  const maxWidth = Number(colWidth) || DEFAULT_COLUMN_SPACING;
  const truncated = raw.slice(0, maxWidth + ansiLen);
  const padCount = Math.max(0, maxWidth - plain.length + spacing - 1);
  return truncated + SPACE_CHAR.repeat(padCount);
}

function formatTableRow(cells, columnWidths, spacing) {
  if (!Array.isArray(cells)) {
    return EMPTY_STRING;
  }
  return cells
    .map((cell, index) => formatTableCell(cell, columnWidths?.[index], spacing))
    .join(EMPTY_STRING);
}

/**
 * Create a blessed Box + List table widget compatible with the Admin CLI table
 * layout contract without pulling in the deprecated `blessed-contrib` dependency
 * tree (`lodash`, `xml2js`, `map-canvas`).
 *
 * @param {Object} rawOptions - Widget options.
 * @return {Object} Blessed box widget exposing `setData({headers, data})`.
 */
function createBlessedTable(rawOptions = {}) {
  const options = {
    ...rawOptions,
    columnSpacing: rawOptions.columnSpacing ?? DEFAULT_COLUMN_SPACING,
    bold: true,
    selectedFg: rawOptions.selectedFg || DEFAULT_SELECTED_FG,
    selectedBg: rawOptions.selectedBg || DEFAULT_SELECTED_BG,
    fg: rawOptions.fg || DEFAULT_ITEM_FG,
    bg: rawOptions.bg || EMPTY_STRING,
    interactive: rawOptions.interactive ?? true,
  };
  const box = blessed.box(options);
  box.options = options;
  box.rows = blessed.list({
    top: ROWS_TOP_OFFSET,
    width: 0,
    left: ROWS_LEFT_OFFSET,
    style: {
      selected: {fg: options.selectedFg, bg: options.selectedBg},
      item: {fg: options.fg, bg: options.bg},
    },
    keys: options.keys,
    vi: options.vi,
    mouse: options.mouse,
    tags: true,
    interactive: options.interactive,
    screen: box.screen,
  });
  box.append(box.rows);

  const baseRender = box.render.bind(box);
  box.render = function renderTable() {
    if (box.screen?.focused === box.rows) {
      box.rows.focus();
    }
    box.rows.width = box.width - ROWS_WIDTH_PAD;
    box.rows.height = box.height - ROWS_HEIGHT_PAD;
    return baseRender();
  };

  box.focus = function focusTable() {
    box.rows.focus();
  };

  box.setData = function setTableData(table = {}) {
    const widths = box.options.columnWidth || [];
    const spacing = box.options.columnSpacing ?? DEFAULT_COLUMN_SPACING;
    const headers = Array.isArray(table.headers) ? table.headers : [];
    const dataRows = Array.isArray(table.data) ? table.data : [];
    box.setContent(formatTableRow(headers, widths, spacing));
    box.rows.setItems(
      dataRows.map((row) => formatTableRow(row, widths, spacing)),
    );
  };

  box.on(EVENT_ATTACH, () => {
    if (box.options.data) {
      box.setData(box.options.data);
    }
  });

  return box;
}

export {createBlessedTable};
