/** @jest-environment jsdom */

/**
 * Round-trip tests for backslash-escaped markdown characters.
 *
 * Covers every character listed as escapable in the markdown guide:
 *   \ ` * _ { } [ ] < > ( ) # + - . ! |
 *
 * The escape sequences must survive a full parse → serialize cycle
 * byte-identically: `\<class\>` must stay `\<class\>` in the saved file,
 * never degrade to `<class>` (an HTML tag) or `class` (content loss).
 */

import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { HtmlPreservingTable } from '../../webview/extensions/htmlPreservingTable';
import { installBlankLineLexerNormalizer } from '../../webview/utils/markedLexerNormalizer';

function createTestEditor(): Editor {
  const element = document.createElement('div');
  document.body.appendChild(element);

  const editor = new Editor({
    element,
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3, 4, 5, 6],
        },
      }),
      Markdown.configure({
        markedOptions: {
          gfm: true,
          breaks: true,
        },
      }),
      HtmlPreservingTable,
      TableRow,
      TableHeader,
      TableCell,
    ],
  });

  // Mirror the production setup in editor.ts: install the normaliser on the
  // underlying marked instance so escape/html tokens are rewritten on every
  // parse, exactly the same path real documents go through.
  const markdownStorage = editor as unknown as {
    markdown?: { instance?: unknown };
    storage?: { markdown?: { instance?: unknown } };
  };
  const markedInstance =
    markdownStorage.markdown?.instance ?? markdownStorage.storage?.markdown?.instance;
  if (markedInstance) {
    installBlankLineLexerNormalizer(markedInstance);
  }

  return editor;
}

function roundTrip(editor: Editor, markdown: string): string {
  editor.commands.setContent(markdown, { contentType: 'markdown' });
  return editor.getMarkdown();
}

describe('backslash-escape round-trip', () => {
  const ESCAPABLE_CHARS = '\\`*_{}[]<>()#+-.!|'.split('');

  it.each(ESCAPABLE_CHARS.map(ch => ({ ch })))(
    'round-trips "a \\$ch b" inside a paragraph byte-identically',
    ({ ch }) => {
      const editor = createTestEditor();
      try {
        const source = `a \\${ch} b`;
        const first = roundTrip(editor, source);
        expect(first.trim()).toBe(source);

        // Second cycle must be stable too.
        const second = roundTrip(editor, first);
        expect(second.trim()).toBe(source);
      } finally {
        editor.destroy();
      }
    }
  );

  it('round-trips the original bug case (escaped angle brackets in a list item)', () => {
    const editor = createTestEditor();
    try {
      const source =
        '* Document libraries in SharePoint sites: a file is placed in the root of the library with the name "Data in this library is classified \\<class\\>".';

      const first = roundTrip(editor, source);
      expect(first).toContain('classified \\<class\\>');
      expect(first).not.toContain('classified <class>');
      expect(first).not.toContain('classified class');

      const second = roundTrip(editor, first);
      expect(second).toBe(first);
    } finally {
      editor.destroy();
    }
  });

  it('round-trips escaped emphasis markers without creating emphasis', () => {
    const editor = createTestEditor();
    try {
      const source = 'literal \\*stars\\* and \\_underscores\\_';
      const first = roundTrip(editor, source);
      expect(first.trim()).toBe(source);

      // Re-parsing must not turn the text into <em>.
      editor.commands.setContent(first, { contentType: 'markdown' });
      expect(editor.getHTML()).not.toContain('<em>');
    } finally {
      editor.destroy();
    }
  });

  it('round-trips escaped characters inside headings and blockquotes', () => {
    const editor = createTestEditor();
    try {
      const source = ['## Heading with \\<tag\\>', '', '> Quote with \\*stars\\*'].join('\n');
      const first = roundTrip(editor, source);
      expect(first).toContain('## Heading with \\<tag\\>');
      expect(first).toContain('> Quote with \\*stars\\*');

      const second = roundTrip(editor, first);
      expect(second).toBe(first);
    } finally {
      editor.destroy();
    }
  });

  it('round-trips escaped pipes and other escapes inside table cells', () => {
    const editor = createTestEditor();
    try {
      const source = ['| h1 | h2 |', '| --- | --- |', '| x \\| y | a \\* b |'].join('\n');
      const first = roundTrip(editor, source);
      // Literal pipe must be re-escaped so the table structure survives.
      expect(first).toContain('x \\| y');
      expect(first).toContain('a \\* b');

      const second = roundTrip(editor, first);
      expect(second).toBe(first);

      // The cell must still parse as a single cell containing "x | y".
      editor.commands.setContent(second, { contentType: 'markdown' });
      const html = editor.getHTML();
      expect(html).toContain('x | y');
    } finally {
      editor.destroy();
    }
  });
});
