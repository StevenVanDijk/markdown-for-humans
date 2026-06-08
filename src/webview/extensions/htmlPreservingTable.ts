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

export type TablePipeStyle = 'padded' | 'compact';

/**
 * Runtime render options updated by the host (editor.ts) whenever the VS Code
 * configuration changes. Using a module-level object lets the extension's
 * `renderMarkdown` function — which has no access to `this.options` at call
 * time — pick up the current setting without requiring a full extension rebuild.
 */
export const tableRenderOptions: { pipeStyle: TablePipeStyle } = {
  pipeStyle: 'padded',
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
 * Produces exactly `width` characters so column dividers stay aligned.
 * Mirrors GFM spec: `:---:` = center, `:---` = left, `---:` = right, `---` = default.
 */
function makeSeparatorCell(width: number, align: string): string {
  if (align === 'center') return ':' + '-'.repeat(Math.max(1, width - 2)) + ':';
  if (align === 'left') return ':' + '-'.repeat(Math.max(2, width - 1));
  if (align === 'right') return '-'.repeat(Math.max(2, width - 1)) + ':';
  return '-'.repeat(Math.max(3, width));
}

/** Minimum column width needed to fit the alignment separator marker. */
function minSeparatorWidth(align: string): number {
  if (align === 'center') return 5; // :---:
  if (align === 'left' || align === 'right') return 4; // :--- or ---:
  return 3; // ---
}

/**
 * Pad `text` to exactly `width` characters, respecting column `align`.
 * - right  → left-pad with spaces
 * - center → equal split, extra space on right
 * - left / default → right-pad with spaces
 */
function padAligned(text: string, width: number, align: string): string {
  const pad = Math.max(0, width - text.length);
  if (pad === 0) return text;
  if (align === 'right') return ' '.repeat(pad) + text;
  if (align === 'center') {
    const padLeft = Math.floor(pad / 2);
    return ' '.repeat(padLeft) + text + ' '.repeat(pad - padLeft);
  }
  return text + ' '.repeat(pad);
}

/**
 * GFM table renderer that preserves column alignment stored in `node.attrs.align`
 * and respects the `tableRenderOptions.pipeStyle` setting.
 *
 * - `padded`  (default): cells are padded to column width; all cells and separators
 *   are the same width per column so the `|` dividers are vertically aligned.
 * - `compact`: no column-width padding; cell content has exactly one space on each side.
 *
 * In padded mode cell content is aligned to the column's declared alignment:
 * right-aligned columns are left-padded, center-aligned are centered, etc.
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
        const text = (raw || '').replace(/\s+/g, ' ').trim();
        cells.push({ text, isHeader: cellNode.type === 'tableHeader' });
      }
    }
    rows.push(cells);
  }

  const columnCount = rows.reduce((max, r) => Math.max(max, r.length), 0);
  if (columnCount === 0) return '';

  const alignList = (typeof node.attrs?.align === 'string' ? node.attrs.align : '').split(',');

  const headerRow = rows[0];
  const hasHeader = headerRow?.some(c => c.isHeader) ?? false;
  const headerTexts = new Array<string>(columnCount)
    .fill('')
    .map((_, i) => (hasHeader ? (headerRow[i]?.text ?? '') : ''));
  const body = hasHeader ? rows.slice(1) : rows;

  let out = '\n';

  if (tableRenderOptions.pipeStyle === 'compact') {
    // Compact: 1 space on each side of content, no column-width padding, minimal separators.
    out += `| ${headerTexts.join(' | ')} |\n`;
    out += `| ${new Array<number>(columnCount)
      .fill(0)
      .map((_, i) => makeSeparatorCell(minSeparatorWidth(alignList[i] ?? ''), alignList[i] ?? ''))
      .join(' | ')} |\n`;
    for (const row of body) {
      out += `| ${new Array<number>(columnCount)
        .fill(0)
        .map((_, i) => row[i]?.text ?? '')
        .join(' | ')} |\n`;
    }
  } else {
    const colWidths = new Array<number>(columnCount).fill(3);
    for (const row of rows) {
      for (let i = 0; i < columnCount; i++) {
        const len = row[i]?.text.length ?? 0;
        if (len > colWidths[i]) colWidths[i] = len;
      }
    }
    // Ensure each column is wide enough for its alignment separator marker.
    for (let i = 0; i < columnCount; i++) {
      const minSep = minSeparatorWidth(alignList[i] ?? '');
      if (colWidths[i] < minSep) colWidths[i] = minSep;
    }
    out += `| ${headerTexts.map((t, i) => padAligned(t, colWidths[i], alignList[i] ?? '')).join(' | ')} |\n`;
    out += `| ${colWidths.map((w, i) => makeSeparatorCell(w, alignList[i] ?? '')).join(' | ')} |\n`;
    for (const row of body) {
      out += `| ${new Array<number>(columnCount)
        .fill(0)
        .map((_, i) => padAligned(row[i]?.text ?? '', colWidths[i], alignList[i] ?? ''))
        .join(' | ')} |\n`;
    }
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
