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
} from '@tiptap/core';
import { BulletList } from '@tiptap/extension-list';

type BulletListToken = MarkdownToken & {
  type: 'list';
  ordered?: boolean;
  items?: MarkdownToken[];
};

/**
 * Render a single list item's content with the given bullet marker.
 *
 * Replicates the logic of `renderNestedMarkdownContent` from @tiptap/core but
 * uses the caller-supplied marker instead of the hard-coded "- " that
 * `ListItem.renderMarkdown` always emits for bullet lists.
 */
function renderListItemContent(
  listItem: JSONContent,
  marker: string,
  h: MarkdownRendererHelpers
): string {
  const blocks = listItem.content ?? [];
  if (blocks.length === 0) return `${marker} `;
  const [firstBlock, ...rest] = blocks;
  const mainContent = h.renderChildren([firstBlock]);
  const parts = [`${marker} ${mainContent}`];
  for (const block of rest) {
    const childContent = h.renderChildren([block]);
    if (childContent) {
      const indented = childContent
        .split('\n')
        .map(line => (line ? h.indent(line) : ''))
        .join('\n');
      parts.push(indented);
    }
  }
  return parts.join('\n');
}

export function parseBulletList(
  token: MarkdownToken,
  helpers: MarkdownParseHelpers
): JSONContent | JSONContent[] {
  const listToken = token as BulletListToken;
  if (listToken.type !== 'list' || listToken.ordered) return [];

  const items = Array.isArray(listToken.items) ? listToken.items : [];
  // Extract the bullet marker from the first item's raw text.
  const firstRaw = (items[0] as { raw?: string } | undefined)?.raw ?? '';
  const markerChar = firstRaw.trimStart().charAt(0);
  const marker = ['-', '*', '+'].includes(markerChar) ? markerChar : '-';

  return {
    type: 'bulletList',
    attrs: { marker },
    content: items.length > 0 ? helpers.parseChildren(items) : [],
  };
}

export function renderBulletList(node: JSONContent, h: MarkdownRendererHelpers): string {
  const marker = (node.attrs?.marker as string) ?? '-';
  if (!node.content?.length) return '';
  return node.content.map(item => renderListItemContent(item, marker, h)).join('\n');
}

/**
 * BulletList extension that preserves the original bullet marker (`-`, `*`, `+`).
 *
 * The default `@tiptap/extension-list` `ListItem.renderMarkdown` always emits
 * `"- "` as the bullet prefix, losing the author's choice of marker. This
 * extension stores the first item's marker character as a node attribute on
 * parse and uses it verbatim on serialisation.
 */
export const BulletListMarkdownFix = BulletList.extend({
  addAttributes() {
    return {
      marker: { default: '-' },
    };
  },

  parseMarkdown: parseBulletList,

  renderMarkdown: renderBulletList,
});
