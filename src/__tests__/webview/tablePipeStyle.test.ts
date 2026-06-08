/** @jest-environment node */

import { MarkdownManager } from '@tiptap/markdown';
import { Document } from '@tiptap/extension-document';
import { Text } from '@tiptap/extension-text';
import { TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { MarkdownParagraph } from '../../webview/extensions/markdownParagraph';
import {
  HtmlPreservingTable,
  tableRenderOptions,
} from '../../webview/extensions/htmlPreservingTable';

function createManager() {
  return new MarkdownManager({
    markedOptions: { gfm: true, breaks: true },
    extensions: [
      Document,
      MarkdownParagraph,
      Text,
      HtmlPreservingTable,
      TableRow,
      TableHeader,
      TableCell,
    ],
  });
}

function getTableLines(serialized: string): string[] {
  return serialized.trim().split('\n');
}

beforeEach(() => {
  tableRenderOptions.pipeStyle = 'padded';
});

afterEach(() => {
  tableRenderOptions.pipeStyle = 'padded';
});

// ─── Compact pipe style ───────────────────────────────────────────────────────

describe('compact pipe style', () => {
  it('header and body rows are identical to padded mode', () => {
    const manager = createManager();
    const md = '| Name | Score |\n|:-----|------:|\n| Alice | 100 |';

    tableRenderOptions.pipeStyle = 'padded';
    const paddedLines = getTableLines(manager.serialize(manager.parse(md)));

    tableRenderOptions.pipeStyle = 'compact';
    const compactLines = getTableLines(manager.serialize(manager.parse(md)));

    expect(compactLines[0]).toBe(paddedLines[0]);
    expect(compactLines[2]).toBe(paddedLines[2]);
    expect(compactLines[1]).not.toBe(paddedLines[1]);
  });

  it('separator row has no surrounding spaces', () => {
    tableRenderOptions.pipeStyle = 'compact';
    const manager = createManager();
    const md = '| A | B |\n|---|---|\n| 1 | 2 |';
    const lines = getTableLines(manager.serialize(manager.parse(md)));
    expect(lines[1]).not.toContain('| ');
    expect(lines[1]).not.toContain(' |');
  });

  it('pipe characters are vertically aligned across all rows', () => {
    tableRenderOptions.pipeStyle = 'compact';
    const manager = createManager();
    const md = '| Long header | B |\n|---|---|\n| x | y |';
    const lines = getTableLines(manager.serialize(manager.parse(md)));
    const pipePositions = (line: string) =>
      [...line].reduce((acc, ch, i) => (ch === '|' ? [...acc, i] : acc), [] as number[]);
    expect(pipePositions(lines[0])).toEqual(pipePositions(lines[1]));
    expect(pipePositions(lines[2])).toEqual(pipePositions(lines[1]));
  });

  it('separator dashes span the full column width plus 2', () => {
    tableRenderOptions.pipeStyle = 'compact';
    const manager = createManager();
    // "Long header" (11 chars) dominates col 0; colWidth = 11
    const md = '| Long header | B |\n|---|---|\n| x | y |';
    const lines = getTableLines(manager.serialize(manager.parse(md)));
    const sepCells = lines[1].split('|').filter(Boolean);
    const headerCells = lines[0].split('|').filter(Boolean);
    // Each compact sep cell must be colWidth+2 chars (headerCell is " "+colWidth+" " = colWidth+2)
    expect(sepCells[0].length).toBe(headerCells[0].length);
    expect(sepCells[1].length).toBe(headerCells[1].length);
  });

  it('preserves center alignment colons in separator', () => {
    tableRenderOptions.pipeStyle = 'compact';
    const manager = createManager();
    const md = '| Version |\n|:-------:|\n| 1.0 |';
    const lines = getTableLines(manager.serialize(manager.parse(md)));
    // Separator cell (between outer pipes) must be :---...-:
    const sepCell = lines[1].split('|').filter(Boolean)[0];
    expect(sepCell).toMatch(/^:-+:$/);
  });

  it('preserves left alignment colon in separator', () => {
    tableRenderOptions.pipeStyle = 'compact';
    const manager = createManager();
    const md = '| Name |\n|:-----|\n| Alice |';
    const lines = getTableLines(manager.serialize(manager.parse(md)));
    const sepCell = lines[1].split('|').filter(Boolean)[0];
    expect(sepCell).toMatch(/^:-+$/);
    expect(sepCell).not.toMatch(/^:-+:$/);
  });

  it('preserves right alignment colon in separator', () => {
    tableRenderOptions.pipeStyle = 'compact';
    const manager = createManager();
    const md = '| Amount |\n|-------:|\n| 100 |';
    const lines = getTableLines(manager.serialize(manager.parse(md)));
    const sepCell = lines[1].split('|').filter(Boolean)[0];
    expect(sepCell).toMatch(/-+:$/);
    expect(sepCell).not.toMatch(/^:/);
  });

  it('preserves mixed alignments in separator', () => {
    tableRenderOptions.pipeStyle = 'compact';
    const manager = createManager();
    const md = '| A | B | C | D |\n|:---:|---|---:|---|\n| 1 | 2 | 3 | 4 |';
    const lines = getTableLines(manager.serialize(manager.parse(md)));
    const cells = lines[1].split('|').filter(Boolean);
    expect(cells[0]).toMatch(/^:-+:$/); // center
    expect(cells[1]).not.toMatch(/:/); // default
    expect(cells[2]).toMatch(/-+:$/); // right
    expect(cells[2]).not.toMatch(/^:/);
    expect(cells[3]).not.toMatch(/:/); // default
  });
});

// ─── Padded pipe style (default) ─────────────────────────────────────────────

describe('padded pipe style (default)', () => {
  it('adds spaces around cell content', () => {
    tableRenderOptions.pipeStyle = 'padded';
    const manager = createManager();
    const md = '| A | B |\n|---|---|\n| 1 | 2 |';
    const lines = getTableLines(manager.serialize(manager.parse(md)));
    expect(lines[0]).toMatch(/^\| .+ \| .+ \|$/);
  });

  it('pads cells to column width', () => {
    tableRenderOptions.pipeStyle = 'padded';
    const manager = createManager();
    const md = '| Short | A longer header |\n|---|---|\n| x | y |';
    const lines = getTableLines(manager.serialize(manager.parse(md)));
    // All columns should have equal width across rows
    const headerCells = lines[0].split('|').filter(Boolean);
    const bodyCells = lines[2].split('|').filter(Boolean);
    expect(headerCells[0].length).toBe(bodyCells[0].length);
    expect(headerCells[1].length).toBe(bodyCells[1].length);
  });
});

// ─── Content alignment in padded mode ────────────────────────────────────────

describe('content alignment padding (padded mode)', () => {
  it('right-aligns cell content in a right-aligned column', () => {
    tableRenderOptions.pipeStyle = 'padded';
    const manager = createManager();
    // Column declared right-aligned; short body cell should be right-padded
    const md = '| Amount |\n|-------:|\n| 1      |';
    const lines = getTableLines(manager.serialize(manager.parse(md)));
    // Body cell: "1" should be right-aligned — multiple leading spaces, single trailing (pipe-delim)
    const bodyCell = lines[2].split('|').filter(Boolean)[0];
    expect(bodyCell).toMatch(/^ {2,}\S+ $/);
  });

  it('centers cell content in a center-aligned column', () => {
    tableRenderOptions.pipeStyle = 'padded';
    const manager = createManager();
    const md = '| Version  |\n|:--------:|\n| 1.0      |';
    const lines = getTableLines(manager.serialize(manager.parse(md)));
    const bodyCell = lines[2].split('|').filter(Boolean)[0];
    // Should have spaces on both sides of content
    expect(bodyCell).toMatch(/^ + \S.* +$/);
  });

  it('left-aligns cell content in a left-aligned column', () => {
    tableRenderOptions.pipeStyle = 'padded';
    const manager = createManager();
    const md = '| Name    |\n|:--------|\n| Alice   |';
    const lines = getTableLines(manager.serialize(manager.parse(md)));
    const bodyCell = lines[2].split('|').filter(Boolean)[0];
    // Should start with content (after column padding space), trailing spaces
    expect(bodyCell).toMatch(/^ \S.*\s+$/);
  });

  it('right-pads default (no-alignment) cells', () => {
    tableRenderOptions.pipeStyle = 'padded';
    const manager = createManager();
    const md = '| Name    |\n|---------|\n| Alice   |';
    const lines = getTableLines(manager.serialize(manager.parse(md)));
    const bodyCell = lines[2].split('|').filter(Boolean)[0];
    // Default is same as left — trailing spaces
    expect(bodyCell).toMatch(/^ \S.*\s+$/);
  });

  it('aligns all columns independently in a mixed-alignment table', () => {
    tableRenderOptions.pipeStyle = 'padded';
    const manager = createManager();
    const md = '| Name    | Score |\n' + '|:--------|------:|\n' + '| Alice   | 100   |';
    const lines = getTableLines(manager.serialize(manager.parse(md)));
    const bodyCells = lines[2].split('|').filter(Boolean);
    // Name column (left-aligned): trailing spaces
    expect(bodyCells[0]).toMatch(/^ \S.*\s+$/);
    // Score column (right-aligned): multiple leading spaces, single trailing (pipe-delim)
    expect(bodyCells[1]).toMatch(/^ {2,}\S+ $/);
  });
});

// ─── tableRenderOptions singleton ────────────────────────────────────────────

describe('padded mode: column divider alignment', () => {
  it('separator row has the same column widths as header and body rows', () => {
    tableRenderOptions.pipeStyle = 'padded';
    const manager = createManager();
    const md =
      '| Version | Date       | Approved by Top Management | Score |\n' +
      '|:-------:|------------|----------------------------:|-------|\n' +
      '| 1.0     | 2025-01-01 | Yes                        | 42    |';
    const lines = getTableLines(manager.serialize(manager.parse(md)));

    const columnWidths = (line: string) =>
      line
        .split('|')
        .filter(Boolean)
        .map(c => c.length);

    const headerWidths = columnWidths(lines[0]);
    const sepWidths = columnWidths(lines[1]);
    const bodyWidths = columnWidths(lines[2]);

    expect(sepWidths).toEqual(headerWidths);
    expect(bodyWidths).toEqual(headerWidths);
  });

  it('separator of a center-aligned column is the same width as cell content', () => {
    tableRenderOptions.pipeStyle = 'padded';
    const manager = createManager();
    const md = '| Version |\n|:-------:|\n| 1.0     |';
    const lines = getTableLines(manager.serialize(manager.parse(md)));
    const headerWidth = lines[0].split('|').filter(Boolean)[0].length;
    const sepWidth = lines[1].split('|').filter(Boolean)[0].length;
    expect(sepWidth).toBe(headerWidth);
  });
});

describe('tableRenderOptions singleton', () => {
  it('defaults to padded', () => {
    expect(tableRenderOptions.pipeStyle).toBe('padded');
  });

  it('compact differs from padded only in the separator row', () => {
    const manager = createManager();
    const md = '| Name | Score |\n|:-----|------:|\n| Alice | 100 |';

    tableRenderOptions.pipeStyle = 'padded';
    const paddedLines = getTableLines(manager.serialize(manager.parse(md)));

    tableRenderOptions.pipeStyle = 'compact';
    const compactLines = getTableLines(manager.serialize(manager.parse(md)));

    // Header and body identical
    expect(compactLines[0]).toBe(paddedLines[0]);
    expect(compactLines[2]).toBe(paddedLines[2]);
    // Separator row is different
    expect(compactLines[1]).not.toBe(paddedLines[1]);
    // Compact separator has no surrounding spaces
    expect(compactLines[1]).not.toContain('| ');
    expect(compactLines[1]).not.toContain(' |');
  });
});
