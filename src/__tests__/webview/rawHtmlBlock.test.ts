/** @jest-environment node */

import { MarkdownManager } from '@tiptap/markdown';
import { Document } from '@tiptap/extension-document';
import { HardBreak } from '@tiptap/extension-hard-break';
import { Text } from '@tiptap/extension-text';
import type { MarkdownParseHelpers, MarkdownRendererHelpers, MarkdownToken } from '@tiptap/core';
import { MarkdownParagraph } from '../../webview/extensions/markdownParagraph';
import {
  RawHtmlBlock,
  parseRawHtmlBlock,
  renderRawHtmlBlock,
} from '../../webview/extensions/rawHtmlBlock';

function createMarkdownManager() {
  return new MarkdownManager({
    markedOptions: { gfm: true, breaks: true },
    extensions: [Document, MarkdownParagraph, HardBreak, Text, RawHtmlBlock],
  });
}

// Minimal helpers stub for isolation tests — mirrors the mock in githubAlerts.test.ts
function makeHelpers(): MarkdownParseHelpers {
  const createNode = (
    type: string,
    attrs: Record<string, unknown> = {},
    content: unknown[] = []
  ) => ({ type, attrs, content });
  const createTextNode = (text: string) => ({ type: 'text', text });
  return {
    createNode,
    createTextNode,
    parseInline: () => [],
    parseChildren: () => [],
    applyMark: () => ({ type: 'text', text: '' }),
  } as unknown as MarkdownParseHelpers;
}

// Use the exported standalone handler functions directly — no coupling to
// the full MarkdownManager pipeline needed for unit tests.
const parseMarkdown = parseRawHtmlBlock;
const renderMarkdown = renderRawHtmlBlock;

// ─── parseMarkdown unit tests ────────────────────────────────────────────────

describe('RawHtmlBlock.parseMarkdown (isolation)', () => {
  it('creates a rawHtmlBlock node from a block html token', () => {
    const token = { type: 'html', raw: '<div>test</div>\n', block: true, text: '<div>test</div>\n' };
    const helpers = makeHelpers();
    const result = parseMarkdown(token as MarkdownToken, helpers);

    expect(result).toHaveLength(1);
    expect((result[0] as { type: string }).type).toBe('rawHtmlBlock');
  });

  it('stores the html markup as a text child, stripping ALL trailing newlines', () => {
    // Real marked output includes "\n\n" at the end of block html raws
    const token = {
      type: 'html',
      raw: '<div>test</div>\n\n',
      block: true,
      text: '<div>test</div>\n\n',
    };
    const helpers = makeHelpers();
    const result = parseMarkdown(token as MarkdownToken, helpers);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const content = (result[0] as any).content as Array<{ type: string; text: string }>;
    expect(content).toHaveLength(1);
    expect(content[0].type).toBe('text');
    expect(content[0].text).toBe('<div>test</div>'); // no trailing newline(s)
  });

  it('strips a single trailing newline from the raw', () => {
    const token = { type: 'html', raw: '<br>\n', block: true, text: '<br>\n' };
    const result = parseMarkdown(token as MarkdownToken, makeHelpers());

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result[0] as any).content[0].text).toBe('<br>');
  });

  it('returns empty array for non-html token types', () => {
    const token = { type: 'paragraph', raw: 'foo\n', text: 'foo' };
    const result = parseMarkdown(token as MarkdownToken, makeHelpers());
    expect(result).toHaveLength(0);
  });

  it('returns empty array for html token with empty raw after newline stripping', () => {
    // An html token whose entire content is newlines would produce an empty string
    const token = { type: 'html', raw: '\n\n', block: true, text: '\n\n' };
    const result = parseMarkdown(token as MarkdownToken, makeHelpers());
    expect(result).toHaveLength(0);
  });

  it('handles real marked token shape (block: true, pre: false fields present)', () => {
    // Exactly what marked v15 emits for a block html element
    const token = {
      type: 'html',
      block: true,
      raw: '<details>\n<summary>Info</summary>\nBody\n</details>\n\n',
      pre: false,
      text: '<details>\n<summary>Info</summary>\nBody\n</details>\n\n',
    };
    const result = parseMarkdown(token as MarkdownToken, makeHelpers());

    expect(result).toHaveLength(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result[0] as any).content[0].text).toBe(
      '<details>\n<summary>Info</summary>\nBody\n</details>'
    );
  });
});

// ─── renderMarkdown unit tests ───────────────────────────────────────────────

describe('RawHtmlBlock.renderMarkdown (isolation)', () => {
  it('returns the children text verbatim', () => {
    const node = { type: 'rawHtmlBlock', content: [{ type: 'text', text: '<div>hello</div>' }] };
    const helpers = {
      renderChildren: (content: unknown[]) => (content[0] as { text: string }).text,
    } as unknown as MarkdownRendererHelpers;

    expect(renderMarkdown(node, helpers)).toBe('<div>hello</div>');
  });

  it('calls renderChildren with the node content', () => {
    const content = [{ type: 'text', text: '<br>' }];
    const node = { type: 'rawHtmlBlock', content };
    const renderChildren = jest.fn(() => '<br>');
    const helpers = { renderChildren } as unknown as MarkdownRendererHelpers;

    renderMarkdown(node, helpers);

    expect(renderChildren).toHaveBeenCalledWith(content);
  });

  it('returns empty string for a node with no content', () => {
    const node = { type: 'rawHtmlBlock', content: [] };
    const helpers = {
      renderChildren: () => '',
    } as unknown as MarkdownRendererHelpers;

    expect(renderMarkdown(node, helpers)).toBe('');
  });
});

// ─── MarkdownManager integration tests ───────────────────────────────────────

describe('RawHtmlBlock: block-level HTML preservation', () => {
  it('preserves a simple block-level div', () => {
    const manager = createMarkdownManager();
    const md = '<div class="callout">Important content</div>\n';
    const doc = manager.parse(md);

    const htmlBlocks = (doc.content ?? []).filter(n => n.type === 'rawHtmlBlock');
    expect(htmlBlocks).toHaveLength(1);
    expect(htmlBlocks[0].content?.[0]?.text).toBe('<div class="callout">Important content</div>');
  });

  it('round-trips a block-level div back to the original markdown', () => {
    const manager = createMarkdownManager();
    const md = '<div class="callout">Important content</div>';
    const doc = manager.parse(md);
    const serialized = manager.serialize(doc);

    expect(serialized).toBe(md);
  });

  it('round-trips a multi-line HTML block', () => {
    const manager = createMarkdownManager();
    const md = '<details>\n<summary>Click me</summary>\nHidden content\n</details>';
    const doc = manager.parse(md);
    const serialized = manager.serialize(doc);

    expect(serialized).toBe(md);
  });

  it('round-trips an HTML comment block', () => {
    const manager = createMarkdownManager();
    const md = '<!-- this is a comment -->';
    const doc = manager.parse(md);

    const htmlBlocks = (doc.content ?? []).filter(n => n.type === 'rawHtmlBlock');
    expect(htmlBlocks).toHaveLength(1);
    expect(manager.serialize(doc)).toBe(md);
  });

  it('round-trips a void block element', () => {
    const manager = createMarkdownManager();
    // <br> at the start of a line is a block html token in marked
    const md = '<br>';
    const doc = manager.parse(md);

    expect(manager.serialize(doc)).toBe(md);
  });

  it('preserves HTML block surrounded by paragraphs', () => {
    const manager = createMarkdownManager();
    const md = 'Before\n\n<div>middle</div>\n\nAfter';
    const doc = manager.parse(md);

    const nodes = doc.content ?? [];
    const types = nodes.map(n => n.type);
    expect(types).toContain('rawHtmlBlock');
    expect(types).toContain('paragraph');

    const serialized = manager.serialize(doc);
    expect(serialized).toBe(md);
  });

  it('preserves multiple consecutive HTML blocks', () => {
    const manager = createMarkdownManager();
    const md = '<div>first</div>\n\n<div>second</div>';
    const doc = manager.parse(md);

    const htmlBlocks = (doc.content ?? []).filter(n => n.type === 'rawHtmlBlock');
    expect(htmlBlocks).toHaveLength(2);
    expect(manager.serialize(doc)).toBe(md);
  });

  it('does not affect ordinary paragraphs', () => {
    const manager = createMarkdownManager();
    const md = 'Hello world';
    const doc = manager.parse(md);

    const htmlBlocks = (doc.content ?? []).filter(n => n.type === 'rawHtmlBlock');
    expect(htmlBlocks).toHaveLength(0);

    const serialized = manager.serialize(doc);
    expect(serialized).toBe(md);
  });
});
