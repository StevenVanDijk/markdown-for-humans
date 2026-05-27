/** @jest-environment node */

import { MarkdownManager } from '@tiptap/markdown';
import { Document } from '@tiptap/extension-document';
import { HardBreak } from '@tiptap/extension-hard-break';
import { Text } from '@tiptap/extension-text';
import { MarkdownParagraph } from '../../webview/extensions/markdownParagraph';
import { RawHtmlBlock } from '../../webview/extensions/rawHtmlBlock';

function createMarkdownManager() {
  return new MarkdownManager({
    markedOptions: { gfm: true, breaks: true },
    extensions: [Document, MarkdownParagraph, HardBreak, Text, RawHtmlBlock],
  });
}

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
