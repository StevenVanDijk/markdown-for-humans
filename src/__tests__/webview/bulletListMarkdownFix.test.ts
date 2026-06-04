/** @jest-environment node */

import { MarkdownManager } from '@tiptap/markdown';
import { Document } from '@tiptap/extension-document';
import { Text } from '@tiptap/extension-text';
import type { MarkdownParseHelpers, MarkdownRendererHelpers, MarkdownToken } from '@tiptap/core';
import { MarkdownParagraph } from '../../webview/extensions/markdownParagraph';
import {
  BulletListMarkdownFix,
  parseBulletList,
  renderBulletList,
} from '../../webview/extensions/bulletListMarkdownFix';
import { ListKit } from '@tiptap/extension-list';

function createMarkdownManager() {
  return new MarkdownManager({
    markedOptions: { gfm: true, breaks: true },
    extensions: [
      Document,
      MarkdownParagraph,
      Text,
      ListKit.configure({ bulletList: false, orderedList: false }),
      BulletListMarkdownFix,
    ],
  });
}

// Minimal helpers stub for isolation tests
function makeParseHelpers(items: unknown[] = []): MarkdownParseHelpers {
  return {
    parseChildren: () => items,
    createNode: (type: string, attrs: Record<string, unknown>, content: unknown[]) => ({
      type,
      attrs,
      content,
    }),
    createTextNode: (text: string) => ({ type: 'text', text }),
    parseInline: () => [],
    applyMark: () => ({ type: 'text', text: '' }),
  } as unknown as MarkdownParseHelpers;
}

function makeRenderHelpers(
  renderChildrenFn: (nodes: unknown[]) => string
): MarkdownRendererHelpers {
  return {
    renderChildren: renderChildrenFn,
    indent: (s: string) => `  ${s}`,
  } as unknown as MarkdownRendererHelpers;
}

// ─── parseBulletList unit tests ───────────────────────────────────────────────

describe('parseBulletList (isolation)', () => {
  it('returns empty array for non-list tokens', () => {
    expect(
      parseBulletList(
        { type: 'paragraph', raw: 'foo\n', text: 'foo' } as MarkdownToken,
        makeParseHelpers()
      )
    ).toEqual([]);
  });

  it('returns empty array for ordered list tokens', () => {
    expect(
      parseBulletList(
        { type: 'list', ordered: true, items: [] } as unknown as MarkdownToken,
        makeParseHelpers()
      )
    ).toEqual([]);
  });

  it('extracts "-" marker from items[0].raw', () => {
    const token = { type: 'list', ordered: false, items: [{ raw: '- item\n', type: 'list_item' }] };
    const result = parseBulletList(token as unknown as MarkdownToken, makeParseHelpers());
    expect((result as { attrs: { marker: string } }).attrs.marker).toBe('-');
  });

  it('extracts "*" marker from items[0].raw', () => {
    const token = { type: 'list', ordered: false, items: [{ raw: '* item\n', type: 'list_item' }] };
    const result = parseBulletList(token as unknown as MarkdownToken, makeParseHelpers());
    expect((result as { attrs: { marker: string } }).attrs.marker).toBe('*');
  });

  it('extracts "+" marker from items[0].raw', () => {
    const token = { type: 'list', ordered: false, items: [{ raw: '+ item\n', type: 'list_item' }] };
    const result = parseBulletList(token as unknown as MarkdownToken, makeParseHelpers());
    expect((result as { attrs: { marker: string } }).attrs.marker).toBe('+');
  });

  it('defaults to "-" when marker char is unrecognised', () => {
    const token = { type: 'list', ordered: false, items: [{ raw: 'x item\n', type: 'list_item' }] };
    const result = parseBulletList(token as unknown as MarkdownToken, makeParseHelpers());
    expect((result as { attrs: { marker: string } }).attrs.marker).toBe('-');
  });

  it('defaults to "-" when items array is empty', () => {
    const token = { type: 'list', ordered: false, items: [] };
    const result = parseBulletList(token as unknown as MarkdownToken, makeParseHelpers());
    expect((result as { attrs: { marker: string } }).attrs.marker).toBe('-');
  });

  it('includes parsed children in content', () => {
    const parsedChildren = [{ type: 'listItem', content: [] }];
    const token = { type: 'list', ordered: false, items: [{ raw: '* a\n', type: 'list_item' }] };
    const result = parseBulletList(
      token as unknown as MarkdownToken,
      makeParseHelpers(parsedChildren)
    );
    expect((result as { content: unknown[] }).content).toBe(parsedChildren);
  });
});

// ─── renderBulletList unit tests ──────────────────────────────────────────────

describe('renderBulletList (isolation)', () => {
  it('returns empty string for a node with no content', () => {
    const node = { type: 'bulletList', attrs: { marker: '*' }, content: [] };
    expect(
      renderBulletList(
        node,
        makeRenderHelpers(() => '')
      )
    ).toBe('');
  });

  it('renders single item with "*" marker', () => {
    const paragraph = { type: 'paragraph', content: [{ type: 'text', text: 'hello' }] };
    const listItem = { type: 'listItem', content: [paragraph] };
    const node = { type: 'bulletList', attrs: { marker: '*' }, content: [listItem] };
    const h = makeRenderHelpers(() => 'hello');
    expect(renderBulletList(node, h)).toBe('* hello');
  });

  it('renders single item with "-" marker', () => {
    const listItem = { type: 'listItem', content: [{ type: 'paragraph', content: [] }] };
    const node = { type: 'bulletList', attrs: { marker: '-' }, content: [listItem] };
    expect(
      renderBulletList(
        node,
        makeRenderHelpers(() => 'item')
      )
    ).toBe('- item');
  });

  it('renders multiple items joined with newlines', () => {
    const makeItem = (text: string) => ({
      type: 'listItem',
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    });
    const node = {
      type: 'bulletList',
      attrs: { marker: '*' },
      content: [makeItem('a'), makeItem('b')],
    };
    let call = 0;
    const h = makeRenderHelpers(() => ['a', 'b'][call++]);
    expect(renderBulletList(node, h)).toBe('* a\n* b');
  });

  it('indents continuation blocks inside a list item', () => {
    const paragraph = { type: 'paragraph', content: [] };
    const nested = { type: 'bulletList', attrs: { marker: '-' }, content: [] };
    const listItem = { type: 'listItem', content: [paragraph, nested] };
    const node = { type: 'bulletList', attrs: { marker: '*' }, content: [listItem] };
    let call = 0;
    const h = makeRenderHelpers(() => ['main text', 'nested content'][call++]);
    expect(renderBulletList(node, h)).toBe('* main text\n  nested content');
  });

  it('falls back to "-" when attrs.marker is missing', () => {
    const listItem = { type: 'listItem', content: [{ type: 'paragraph', content: [] }] };
    const node = { type: 'bulletList', content: [listItem] }; // no attrs
    expect(
      renderBulletList(
        node,
        makeRenderHelpers(() => 'item')
      )
    ).toBe('- item');
  });

  it('emits marker followed by space for an item with no blocks', () => {
    const listItem = { type: 'listItem', content: [] };
    const node = { type: 'bulletList', attrs: { marker: '+' }, content: [listItem] };
    expect(
      renderBulletList(
        node,
        makeRenderHelpers(() => '')
      )
    ).toBe('+ ');
  });
});

// ─── MarkdownManager integration tests ───────────────────────────────────────

describe('BulletListMarkdownFix: bullet marker preservation', () => {
  it('round-trips a "*" bullet list unchanged', () => {
    const manager = createMarkdownManager();
    const md = '* first\n* second\n* third';
    expect(manager.serialize(manager.parse(md))).toBe(md);
  });

  it('round-trips a "-" bullet list unchanged', () => {
    const manager = createMarkdownManager();
    const md = '- first\n- second';
    expect(manager.serialize(manager.parse(md))).toBe(md);
  });

  it('round-trips a "+" bullet list unchanged', () => {
    const manager = createMarkdownManager();
    const md = '+ alpha\n+ beta';
    expect(manager.serialize(manager.parse(md))).toBe(md);
  });

  it('stores the marker as a bulletList node attribute', () => {
    const manager = createMarkdownManager();
    const doc = manager.parse('* item one\n* item two');
    const lists = (doc.content ?? []).filter(n => n.type === 'bulletList');
    expect(lists).toHaveLength(1);
    expect(lists[0].attrs?.marker).toBe('*');
  });

  it('preserves "*" list in a document with mixed content', () => {
    const manager = createMarkdownManager();
    const md = 'Intro\n\n* alpha\n* beta\n\nOutro';
    expect(manager.serialize(manager.parse(md))).toBe(md);
  });

  it('does not affect "-" as the default marker', () => {
    const manager = createMarkdownManager();
    const md = '- item';
    expect(manager.serialize(manager.parse(md))).toBe(md);
  });
});
