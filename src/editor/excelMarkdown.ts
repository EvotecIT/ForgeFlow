import * as vscode from 'vscode';

interface TableCellAlignment {
  prefix: string;
  postfix: string;
  adjust: number;
}

interface TableSizeMetadata {
  columnWidths: number[];
  colAlignments: string[];
}

const ALIGNED_LEFT = 'l';
const ALIGNED_RIGHT = 'r';
const ALIGNED_CENTER = 'c';
const EXCEL_COLUMN_DELIMITER = '\t';
const MARKDOWN_NEWLINE = '<br/>';

const ALIGNED_LEFT_SYNTAX: TableCellAlignment = { prefix: '', postfix: '', adjust: 0 };
const ALIGNED_RIGHT_SYNTAX: TableCellAlignment = { prefix: '', postfix: ':', adjust: 1 };
const ALIGNED_CENTER_SYNTAX: TableCellAlignment = { prefix: ':', postfix: ':', adjust: 2 };

const EXCEL_ROW_DELIMITER_REGEX = /[\n\u0085\u2028\u2029]|\r\n?/g;
const COLUMN_ALIGNMENT_REGEX = /^(\^[lcr])/i;
const BOUNDARY_ROW_DELIMITER_REGEX = /^(?:\r\n?|\n|\u0085|\u2028|\u2029)+|(?:\r\n?|\n|\u0085|\u2028|\u2029)+$/g;

export function registerExcelMarkdown(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('forgeflow.markdown.pasteExcelTable', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }

      const clipboardText = await vscode.env.clipboard.readText();
      const markdown = excelToMarkdown(clipboardText);
      await editor.edit((editBuilder) => {
        editBuilder.replace(editor.selection, markdown);
      });
    })
  );
}

export function excelToMarkdown(rawData: string): string {
  const data = trimBoundaryRowDelimiters(rawData);
  const rows = splitIntoRowsAndColumns(data)
    .map((row) => row.map((cell) => normalizeMarkdownCell(cell)));
  const { columnWidths, colAlignments } = getColumnWidthsAndAlignments(rows);
  const markdownRows = addMarkdownSyntax(rows, columnWidths);
  return addAlignmentSyntax(markdownRows, columnWidths, colAlignments).join('\n');
}

export function addMarkdownSyntax(rows: string[][], columnWidths: number[]): string[] {
  return rows.map((row) => {
    const cells = columnWidths.map((width, index) => {
      const cell = row[index] ?? '';
      return cell + ' '.repeat(Math.max(0, width - cell.length));
    });
    return `| ${cells.join(' | ')} |`;
  });
}

export function addAlignmentSyntax(
  markdownRows: string[],
  columnWidths: number[],
  colAlignments: string[]
): string[] {
  const result = [...markdownRows];
  const separator = columnWidths.map((width, index) => {
    const { prefix, postfix, adjust } = calculateAlignmentMarkdownSyntaxMetadata(colAlignments[index]);
    return prefix + '-'.repeat(Math.max(1, width + 2 - adjust)) + postfix;
  });
  result.splice(1, 0, `|${separator.join('|')}|`);
  return result;
}

export function calculateAlignmentMarkdownSyntaxMetadata(alignment: string | undefined): TableCellAlignment {
  switch (alignment) {
    case ALIGNED_CENTER:
      return ALIGNED_CENTER_SYNTAX;
    case ALIGNED_RIGHT:
      return ALIGNED_RIGHT_SYNTAX;
    case ALIGNED_LEFT:
    default:
      return ALIGNED_LEFT_SYNTAX;
  }
}

export function getColumnWidthsAndAlignments(rows: string[][]): TableSizeMetadata {
  const headerRow = rows[0] ?? [''];
  if (!rows[0]) {
    rows.push(headerRow);
  }

  const colAlignments: string[] = [];
  const columnWidths = headerRow.map((column, columnIndex) => {
    const alignment = columnAlignment(column);
    colAlignments.push(alignment);
    headerRow[columnIndex] = column.replace(COLUMN_ALIGNMENT_REGEX, '');
    return columnWidth(rows, columnIndex);
  });

  return { columnWidths, colAlignments };
}

export function columnAlignment(columnHeaderText: string): string {
  const match = columnHeaderText.match(COLUMN_ALIGNMENT_REGEX);
  if (!match?.[1]) {
    return ALIGNED_LEFT;
  }
  return columnAlignmentFromChar(match[1][1] ?? ALIGNED_LEFT);
}

export function columnAlignmentFromChar(alignChar: string): string {
  switch (alignChar.toLowerCase()) {
    case ALIGNED_CENTER:
      return ALIGNED_CENTER;
    case ALIGNED_RIGHT:
      return ALIGNED_RIGHT;
    case ALIGNED_LEFT:
    default:
      return ALIGNED_LEFT;
  }
}

export function columnWidth(rows: string[][], columnIndex: number): number {
  return Math.max(0, ...rows.map((row) => row[columnIndex]?.length ?? 0));
}

export function splitIntoRowsAndColumns(data: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < data.length; index += 1) {
    const char = data[index];
    const next = data[index + 1];
    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"' && cell.length === 0) {
      inQuotes = true;
    } else if (char === EXCEL_COLUMN_DELIMITER) {
      row.push(cell);
      cell = '';
    } else if (isRowDelimiter(char)) {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      if (char === '\r' && next === '\n') {
        index += 1;
      }
    } else {
      cell += char;
    }
  }

  row.push(cell);
  rows.push(row);
  return rows;
}

export function replaceIntraCellNewline(data: string): string {
  return splitIntoRowsAndColumns(data)
    .map((row) => row.map((cell) => cell.replace(EXCEL_ROW_DELIMITER_REGEX, MARKDOWN_NEWLINE)).join(EXCEL_COLUMN_DELIMITER))
    .join('\r\n');
}

function normalizeMarkdownCell(cell: string): string {
  return cell
    .replace(EXCEL_ROW_DELIMITER_REGEX, MARKDOWN_NEWLINE)
    .replace(/\|/g, '\\|');
}

function trimBoundaryRowDelimiters(data: string): string {
  return data.replace(BOUNDARY_ROW_DELIMITER_REGEX, '');
}

function isRowDelimiter(char: string | undefined): boolean {
  return char === '\r' || char === '\n' || char === '\u0085' || char === '\u2028' || char === '\u2029';
}
