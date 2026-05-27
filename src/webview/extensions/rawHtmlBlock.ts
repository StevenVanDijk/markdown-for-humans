/**
 * Copyright (c) 2025-2026 Concret.io
 *
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { Node, mergeAttributes } from '@tiptap/core';
import type {
  JSONContent,
  MarkdownParseHelpers,
  MarkdownRendererHelpers,
  MarkdownToken,
} from '@tiptap/core';

/**
 * Block-level raw HTML preservation.
 *
 * When a markdown file contains a raw HTML block (e.g. `<div>`, `<details>`,
 * `<figure>`), marked emits a token with `type: 'html'`. Without a handler,
 * @tiptap/markdown silently drops those tokens and the content is lost.
 *
 * This extension claims the `html` token type and stores the raw markup as
 * text content inside a `rawHtmlBlock` node. On serialisation the text is
 * written back verbatim, making the round-trip lossless.
 *
 * The node renders in the editor as a read-only code block styled as HTML so
 * authors can see (and optionally edit) the raw markup without it being
 * interpreted by the WYSIWYG layer.
 */

export function parseRawHtmlBlock(
  token: MarkdownToken,
  helpers: MarkdownParseHelpers
): JSONContent[] {
  if (token.type !== 'html') return [];
  const raw = typeof token.raw === 'string' ? token.raw : '';
  // Strip all trailing newlines that marked appends to HTML block raws.
  const content = raw.replace(/\n+$/, '');
  if (!content) return [];
  return [helpers.createNode('rawHtmlBlock', {}, [helpers.createTextNode(content)])];
}

export function renderRawHtmlBlock(node: JSONContent, helpers: MarkdownRendererHelpers): string {
  return helpers.renderChildren(node.content ?? []);
}

export const RawHtmlBlock = Node.create({
  name: 'rawHtmlBlock',

  group: 'block',

  content: 'text*',

  marks: '',

  code: true,

  defining: true,

  isolating: true,

  addAttributes() {
    return {};
  },

  parseHTML() {
    return [{ tag: 'pre[data-raw-html-block]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'pre',
      mergeAttributes(HTMLAttributes, { 'data-raw-html-block': '', class: 'raw-html-block' }),
      ['code', { class: 'language-html' }, 0],
    ];
  },

  markdownTokenName: 'html',

  parseMarkdown: parseRawHtmlBlock,

  renderMarkdown: renderRawHtmlBlock,
});
