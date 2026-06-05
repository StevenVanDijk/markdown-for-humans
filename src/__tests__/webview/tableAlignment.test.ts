/** @jest-environment node */

import { MarkdownManager } from '@tiptap/markdown';
import { Document } from '@tiptap/extension-document';
import { Text } from '@tiptap/extension-text';
import { TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { MarkdownParagraph } from '../../webview/extensions/markdownParagraph';
import { HtmlPreservingTable } from '../../webview/extensions/htmlPreservingTable';

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

// Extract the separator row (second line) from serialized table output
function getSeparatorRow(serialized: string): string {
  const lines = serialized.trim().split('\n');
  return lines[1] ?? '';
}

describe('GFM table column alignment preservation', () => {
  it('preserves center alignment — serialised separator contains `:---:`', () => {
    const manager = createManager();
    const md = '| Version |\n|:-------:|\n| 1.0     |';
    const sep = getSeparatorRow(manager.serialize(manager.parse(md)));
    // Separator cell must have a colon on both sides of the dashes
    expect(sep).toMatch(/:\s*-+\s*:/);
  });

  it('preserves left alignment — serialised separator contains `:---`', () => {
    const manager = createManager();
    const md = '| Name  |\n|:------|\n| Alice |';
    const sep = getSeparatorRow(manager.serialize(manager.parse(md)));
    // Leading colon, no trailing colon
    expect(sep).toMatch(/:\s*-+(?!:)/);
    expect(sep).not.toMatch(/:\s*-+\s*:/);
  });

  it('preserves right alignment — serialised separator contains `---:`', () => {
    const manager = createManager();
    const md = '| Amount |\n|-------:|\n| 100    |';
    const sep = getSeparatorRow(manager.serialize(manager.parse(md)));
    // Trailing colon, no leading colon
    expect(sep).toMatch(/-+\s*:/);
    expect(sep).not.toMatch(/:\s*-+\s*:/);
  });

  it('preserves mixed alignments across multiple columns', () => {
    const manager = createManager();
    const md =
      '| Version | Date       | Approved by Top Management | Approval |\n' +
      '|:-------:|------------|----------------------------:|----------|\n' +
      '| 1.0     | 2025-01-01 | Yes                        | Signed   |';

    const sep = getSeparatorRow(manager.serialize(manager.parse(md)));
    const cells = sep.split('|').filter(Boolean);

    // Column 0: center
    expect(cells[0].trim()).toMatch(/^:\s*-+\s*:$/);
    // Column 1: default (no colons)
    expect(cells[1].trim()).not.toMatch(/:/);
    // Column 2: right
    expect(cells[2].trim()).toMatch(/-+\s*:$/);
    expect(cells[2].trim()).not.toMatch(/^:/);
    // Column 3: default (no colons)
    expect(cells[3].trim()).not.toMatch(/:/);
  });

  it('produces no alignment colons for a table with default (no) alignment', () => {
    const manager = createManager();
    const md = '| A   | B   |\n| --- | --- |\n| 1   | 2   |';
    const sep = getSeparatorRow(manager.serialize(manager.parse(md)));
    expect(sep).not.toMatch(/:/);
  });

  it('stores the align attribute on the table node', () => {
    const manager = createManager();
    const doc = manager.parse('| A | B | C |\n|:--|--:|:--:|\n| 1 | 2 | 3  |');
    const tables = (doc.content ?? []).filter(n => n.type === 'table');
    expect(tables).toHaveLength(1);
    expect(tables[0].attrs?.align).toBe('left,right,center');
  });

  it('stores empty strings for columns with no alignment', () => {
    const manager = createManager();
    const doc = manager.parse('| A | B |\n|---|---|\n| 1 | 2 |');
    const tables = (doc.content ?? []).filter(n => n.type === 'table');
    expect(tables).toHaveLength(1);
    expect(tables[0].attrs?.align).toBe(',');
  });
});
