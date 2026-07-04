/**
 * Copyright (c) 2025-2026 Concret.io
 *
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import type {
  JSONContent,
  MarkdownParseHelpers,
  MarkdownRendererHelpers,
  MarkdownToken,
  RenderContext,
} from '@tiptap/core';
import { Table } from '@tiptap/extension-table';

type RenderMarkdownFn = (
  node: JSONContent,
  helpers: MarkdownRendererHelpers,
  ctx: RenderContext
) => string;

type MarkedTableToken = MarkdownToken & {
  header?: { tokens: MarkdownToken[] }[];
  rows?: { tokens: MarkdownToken[] }[][];
  align?: (string | null)[];
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function collectText(node: JSONContent): string {
  if (!node || typeof node !== 'object') {
    return '';
  }

  if (node.type === 'text') {
    return typeof node.text === 'string' ? node.text : '';
  }

  if (node.type === 'hardBreak' || node.type === 'hard_break') {
    return '\n';
  }

  if (!Array.isArray(node.content)) {
    return '';
  }

  return node.content.map(collectText).join('');
}

function renderTableCell(cell: JSONContent, tagName: 'th' | 'td'): string {
  const rawText = collectText(cell).trim();
  const escapedText = escapeHtml(rawText);
  return `<${tagName}>${escapedText}</${tagName}>`;
}

/**
 * Separator cell for a single column given its content width and alignment.
 * Mirrors GFM spec: `:---:` = center, `:---` = left, `---:` = right, `---` = default.
 */
function makeSeparatorCell(width: number, align: string): string {
  const dashes = '-'.repeat(Math.max(3, width));
  if (align === 'center') return `:${dashes}:`;
  if (align === 'left') return `:${dashes}`;
  if (align === 'right') return `${dashes}:`;
  return dashes;
}

/**
 * GFM table renderer that preserves column alignment stored in `node.attrs.align`.
 *
 * Replicates the logic of `renderTableToMarkdown` from @tiptap/extension-table
 * but uses the stored alignment string to emit `:---:`, `:---`, or `---:` instead
 * of plain `---` in the separator row.
 */
function renderGfmTableWithAlignment(node: JSONContent, h: MarkdownRendererHelpers): string {
  if (!node?.content?.length) return '';

  const rows: { text: string; isHeader: boolean }[][] = [];
  for (const rowNode of node.content) {
    const cells: { text: string; isHeader: boolean }[] = [];
    if (Array.isArray(rowNode.content)) {
      for (const cellNode of rowNode.content) {
        let raw = '';
        const content = cellNode.content ?? [];
        if (content.length > 1) {
          raw = content.map((child: JSONContent) => h.renderChildren(child)).join('');
        } else {
          raw = h.renderChildren(content);
        }
        // A literal `|` inside a cell would terminate the cell when the file
        // is re-parsed, so it must be written as `\|` (GFM unescapes it when
        // splitting rows into cells). Pipes that are already escaped are left
        // alone to avoid double-escaping.
        const text = (raw || '')
          .replace(/\s+/g, ' ')
          .trim()
          .replace(/(?<!\\)\|/g, '\\|');
        cells.push({ text, isHeader: cellNode.type === 'tableHeader' });
      }
    }
    rows.push(cells);
  }

  const columnCount = rows.reduce((max, r) => Math.max(max, r.length), 0);
  if (columnCount === 0) return '';

  const colWidths = new Array<number>(columnCount).fill(3);
  for (const row of rows) {
    for (let i = 0; i < columnCount; i++) {
      const len = row[i]?.text.length ?? 0;
      if (len > colWidths[i]) colWidths[i] = len;
    }
  }

  const alignList = (typeof node.attrs?.align === 'string' ? node.attrs.align : '').split(',');

  const pad = (s: string, width: number) => s + ' '.repeat(Math.max(0, width - s.length));
  const headerRow = rows[0];
  const hasHeader = headerRow?.some(c => c.isHeader) ?? false;
  const headerTexts = new Array<string>(columnCount)
    .fill('')
    .map((_, i) => (hasHeader ? (headerRow[i]?.text ?? '') : ''));

  let out = '\n';
  out += `| ${headerTexts.map((t, i) => pad(t, colWidths[i])).join(' | ')} |\n`;
  out += `| ${colWidths.map((w, i) => makeSeparatorCell(w, alignList[i] ?? '')).join(' | ')} |\n`;

  const body = hasHeader ? rows.slice(1) : rows;
  for (const row of body) {
    out += `| ${new Array<number>(columnCount)
      .fill(0)
      .map((_, i) => pad(row[i]?.text ?? '', colWidths[i]))
      .join(' | ')} |\n`;
  }

  return out;
}

export const HtmlPreservingTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      htmlClass: {
        default: null,
        rendered: false,
        parseHTML: element => element.getAttribute('class'),
      },
      htmlOrigin: {
        default: false,
        rendered: false,
        parseHTML: () => true,
      },
      // Comma-separated column alignments captured from the marked table token.
      // Values per column: 'center' | 'left' | 'right' | '' (default).
      // Example: 'center,,,' for a 4-column table with only the first column centred.
      align: {
        default: '',
        rendered: false,
      },
    };
  },

  parseMarkdown(token: MarkdownToken, helpers: MarkdownParseHelpers): JSONContent | JSONContent[] {
    const t = token as MarkedTableToken;
    if (t.type !== 'table') return [];

    const rows: JSONContent[] = [];
    if (t.header) {
      const headerCells = t.header.map(cell =>
        helpers.createNode('tableHeader', {}, [
          { type: 'paragraph', content: helpers.parseInline(cell.tokens) },
        ])
      );
      rows.push(helpers.createNode('tableRow', {}, headerCells));
    }
    if (t.rows) {
      for (const row of t.rows) {
        const cells = row.map(cell =>
          helpers.createNode('tableCell', {}, [
            { type: 'paragraph', content: helpers.parseInline(cell.tokens) },
          ])
        );
        rows.push(helpers.createNode('tableRow', {}, cells));
      }
    }

    const align = Array.isArray(t.align) ? t.align.map(a => a ?? '').join(',') : '';
    return helpers.createNode('table', { align }, rows);
  },

  // Must be a regular function (not an arrow function) so that TipTap's
  // getExtensionField correctly binds `this.parent` to the base Table extension's
  // GFM renderMarkdown. Arrow functions ignore .bind(), so this.parent would be
  // undefined and GFM tables would be silently dropped on serialization.
  renderMarkdown: function (
    this: { parent: RenderMarkdownFn | null },
    node: JSONContent,
    helpers: MarkdownRendererHelpers,
    _context: RenderContext
  ): string {
    const htmlOrigin = Boolean(node.attrs?.htmlOrigin);
    if (!htmlOrigin) {
      return renderGfmTableWithAlignment(node, helpers);
    }

    const className =
      typeof node.attrs?.htmlClass === 'string' && node.attrs.htmlClass.trim().length > 0
        ? node.attrs.htmlClass.trim()
        : null;

    const rows = Array.isArray(node.content) ? node.content : [];
    const rowHtml = rows
      .map(row => {
        const cells = Array.isArray(row.content) ? row.content : [];
        const cellsHtml = cells
          .map(cell => renderTableCell(cell, cell.type === 'tableHeader' ? 'th' : 'td'))
          .join('');
        return `  <tr>${cellsHtml}</tr>`;
      })
      .join('\n');

    const tableOpenTag = className ? `<table class="${escapeHtml(className)}">` : '<table>';

    return `${tableOpenTag}\n${rowHtml}\n</table>`;
  },
});
