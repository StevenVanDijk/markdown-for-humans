/** @jest-environment node */

import { marked } from 'marked';
import { normalizeBlankLineGreedyTokens } from '../../webview/utils/markedLexerNormalizer';

describe('normalizeBlankLineGreedyTokens', () => {
  it('splits trailing blank-line newlines off a heading token into a space token', () => {
    const tokens = [
      { type: 'heading', raw: '## Title\n\n\n\n\n', depth: 2, text: 'Title' },
      { type: 'paragraph', raw: 'Text\n', text: 'Text' },
    ];

    const out = normalizeBlankLineGreedyTokens(tokens);

    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ type: 'heading', raw: '## Title' });
    expect(out[1]).toEqual({ type: 'space', raw: '\n\n\n\n\n' });
    expect(out[2]).toMatchObject({ type: 'paragraph', raw: 'Text\n' });
  });

  it('splits trailing newlines off a table token', () => {
    const tokens = [
      { type: 'table', raw: '| a | b |\n|---|---|\n| 1 | 2 |\n\n\n\n\n' },
      { type: 'paragraph', raw: 'Text\n' },
    ];

    const out = normalizeBlankLineGreedyTokens(tokens);

    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({
      type: 'table',
      raw: '| a | b |\n|---|---|\n| 1 | 2 |',
    });
    expect(out[1]).toEqual({ type: 'space', raw: '\n\n\n\n\n' });
  });

  it('leaves blocks with a single trailing newline alone', () => {
    const tokens = [
      { type: 'heading', raw: '## Title\n', depth: 2, text: 'Title' },
      { type: 'paragraph', raw: 'Text\n' },
    ];

    const out = normalizeBlankLineGreedyTokens(tokens);

    expect(out).toEqual(tokens);
  });

  it('does not touch paragraph or space tokens', () => {
    const tokens = [
      { type: 'paragraph', raw: 'Para1' },
      { type: 'space', raw: '\n\n\n' },
      { type: 'paragraph', raw: 'Para2' },
    ];

    const out = normalizeBlankLineGreedyTokens(tokens);

    expect(out).toEqual(tokens);
  });

  it('preserves the links side-channel that marked attaches to the tokens array', () => {
    const tokens: Array<{ type: string; raw: string }> = [
      { type: 'heading', raw: '## Title\n\n\n' },
    ];
    const links = { foo: { href: 'https://example.com', title: null } };
    (tokens as unknown as { links: typeof links }).links = links;

    const out = normalizeBlankLineGreedyTokens(tokens);

    expect((out as unknown as { links: typeof links }).links).toBe(links);
  });

  it('round-trip: greedy heading + 4 blank lines yields 3 extra empty paragraphs via BlankLinePreservation', () => {
    // Mirrors the behavior of BlankLinePreservation.parseMarkdown:
    //   extras = max(0, newlineCount - 2)
    const tokens = [{ type: 'heading', raw: '## Title\n\n\n\n\n' }];

    const [, spaceToken] = normalizeBlankLineGreedyTokens(tokens);
    const newlineCount = (spaceToken.raw?.match(/\n/g) ?? []).length;
    const extras = Math.max(0, newlineCount - 2);

    // Source had 5 newlines after "Title" = 1 line terminator + 4 visible blank
    // lines. Standard separator covers 1 blank → 3 extras remain.
    expect(extras).toBe(3);
  });
});

describe('normalizeBlankLineGreedyTokens – inline html rewriting in headings', () => {
  it('rewrites inline html tokens inside heading tokens', () => {
    const tokens = [
      {
        type: 'heading',
        raw: '## My Heading <!-- omit in toc -->\n',
        depth: 2,
        text: 'My Heading <!-- omit in toc -->',
        tokens: [
          { type: 'text', raw: 'My Heading ', text: 'My Heading ' },
          { type: 'html', raw: '<!-- omit in toc -->' },
        ],
      },
    ];

    normalizeBlankLineGreedyTokens(tokens);

    const inlines = (tokens[0] as { tokens: { type: string; raw: string; text: string }[] }).tokens;
    expect(inlines[1]).toEqual({
      type: 'text',
      raw: '<!-- omit in toc -->',
      text: '<!-- omit in toc -->',
    });
  });

  it('rewrites inline html using real marked output for headings', () => {
    const tokens = marked.lexer('## Title <!-- omit in toc -->\n') as unknown as {
      type: string;
      tokens?: { type: string; raw: string }[];
    }[];
    normalizeBlankLineGreedyTokens(tokens as unknown as { type?: string; raw?: string }[]);

    const heading = tokens[0];
    expect(heading.type).toBe('heading');
    const inlines = heading.tokens ?? [];
    const htmlTokens = inlines.filter(t => t.type === 'html');
    expect(htmlTokens).toHaveLength(0); // all html tokens rewritten away

    const omitToken = inlines.find(t => t.type === 'text' && t.raw === '<!-- omit in toc -->');
    expect(omitToken).toBeDefined();
  });

  it('does not touch non-html inline tokens inside headings', () => {
    const codeToken = { type: 'codespan', raw: '`x`', text: 'x' };
    const tokens = [
      {
        type: 'heading',
        raw: '## `x`\n',
        depth: 2,
        text: '`x`',
        tokens: [{ ...codeToken }],
      },
    ];

    normalizeBlankLineGreedyTokens(tokens);

    const inlines = (tokens[0] as { tokens: unknown[] }).tokens;
    expect(inlines[0]).toMatchObject(codeToken);
  });
});

describe('normalizeBlankLineGreedyTokens – inline html rewriting', () => {
  it('rewrites a standalone inline html token to a text token with the raw markup', () => {
    const tokens = [
      {
        type: 'paragraph',
        raw: '<br>\n',
        tokens: [{ type: 'html', raw: '<br>', text: '<br>' }],
      },
    ];

    normalizeBlankLineGreedyTokens(tokens);

    const inlines = (tokens[0] as { tokens: unknown[] }).tokens;
    expect(inlines[0]).toEqual({ type: 'text', raw: '<br>', text: '<br>' });
  });

  it('rewrites inline html tokens mixed with text tokens', () => {
    const tokens = [
      {
        type: 'paragraph',
        raw: 'Press <kbd>Ctrl</kbd> now\n',
        tokens: [
          { type: 'text', raw: 'Press ', text: 'Press ' },
          { type: 'html', raw: '<kbd>' },
          { type: 'text', raw: 'Ctrl', text: 'Ctrl' },
          { type: 'html', raw: '</kbd>' },
          { type: 'text', raw: ' now', text: ' now' },
        ],
      },
    ];

    normalizeBlankLineGreedyTokens(tokens);

    const inlines = (tokens[0] as { tokens: { type: string; raw: string; text: string }[] }).tokens;
    expect(inlines[1]).toEqual({ type: 'text', raw: '<kbd>', text: '<kbd>' });
    expect(inlines[3]).toEqual({ type: 'text', raw: '</kbd>', text: '</kbd>' });
    // Non-html tokens are unchanged
    expect(inlines[0]).toMatchObject({ type: 'text', raw: 'Press ' });
    expect(inlines[2]).toMatchObject({ type: 'text', raw: 'Ctrl' });
  });

  it('rewrites inline html tokens inside list items', () => {
    const tokens = [
      {
        type: 'list',
        items: [
          {
            type: 'list_item',
            tokens: [
              {
                type: 'text',
                tokens: [
                  { type: 'text', raw: 'Item ', text: 'Item ' },
                  { type: 'html', raw: '<u>' },
                  { type: 'text', raw: 'underlined', text: 'underlined' },
                  { type: 'html', raw: '</u>' },
                ],
              },
            ],
          },
        ],
      },
    ];

    normalizeBlankLineGreedyTokens(tokens);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inlines = (tokens[0] as unknown as any).items[0].tokens[0].tokens as {
      type: string;
      raw: string;
      text: string;
    }[];
    expect(inlines[1]).toEqual({ type: 'text', raw: '<u>', text: '<u>' });
    expect(inlines[3]).toEqual({ type: 'text', raw: '</u>', text: '</u>' });
  });

  it('does not touch non-html inline tokens', () => {
    const codeToken = { type: 'codespan', raw: '`x`', text: 'x' };
    const tokens = [
      {
        type: 'paragraph',
        raw: '`x`\n',
        tokens: [{ ...codeToken }],
      },
    ];

    normalizeBlankLineGreedyTokens(tokens);

    const inlines = (tokens[0] as { tokens: unknown[] }).tokens;
    expect(inlines[0]).toMatchObject(codeToken);
  });

  it('does not rewrite html tokens with empty raw', () => {
    const emptyHtml = { type: 'html', raw: '' };
    const tokens = [
      {
        type: 'paragraph',
        raw: '\n',
        tokens: [{ ...emptyHtml }],
      },
    ];

    normalizeBlankLineGreedyTokens(tokens);

    // Token should be unchanged — empty raw has nothing to preserve
    const inlines = (tokens[0] as { tokens: unknown[] }).tokens;
    expect(inlines[0]).toMatchObject(emptyHtml);
  });

  it('does not rewrite html tokens with missing raw field', () => {
    const noRaw = { type: 'html' };
    const tokens = [
      {
        type: 'paragraph',
        raw: '\n',
        tokens: [{ ...noRaw }],
      },
    ];

    normalizeBlankLineGreedyTokens(tokens);

    const inlines = (tokens[0] as { tokens: unknown[] }).tokens;
    expect(inlines[0]).toMatchObject(noRaw);
  });

  it('rewrites inline html tokens inside blockquotes using real marked output', () => {
    // Use the actual marked lexer so this test is anchored to real token shapes
    // (which include inLink, inRawBlock, block fields absent from fabricated inputs).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tokens = marked.lexer('> Use <kbd>Ctrl</kbd>\n') as unknown as any[];
    normalizeBlankLineGreedyTokens(tokens);

    // blockquote → paragraph → inline tokens
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const paragraphTokens = (tokens[0] as unknown as any).tokens[0].tokens as {
      type: string;
      raw: string;
    }[];

    const htmlTokens = paragraphTokens.filter(t => t.type === 'html');
    expect(htmlTokens).toHaveLength(0); // all html tokens rewritten away

    const kbdOpen = paragraphTokens.find(t => t.type === 'text' && t.raw === '<kbd>');
    const kbdClose = paragraphTokens.find(t => t.type === 'text' && t.raw === '</kbd>');
    expect(kbdOpen).toBeDefined();
    expect(kbdClose).toBeDefined();
  });

  it('handles real marked inline html token shape (with inLink/inRawBlock/block fields)', () => {
    // Verify the rewriter works with the exact token shape marked v15 emits
    const realMarkedToken = {
      type: 'html',
      raw: '<sup>1</sup>',
      inLink: false,
      inRawBlock: true,
      block: false,
      text: '<sup>1</sup>',
    };
    const tokens = [
      {
        type: 'paragraph',
        raw: 'Note<sup>1</sup>\n',
        tokens: [
          { type: 'text', raw: 'Note', text: 'Note', escaped: false },
          { ...realMarkedToken },
        ],
      },
    ];

    normalizeBlankLineGreedyTokens(tokens);

    const inlines = (tokens[0] as { tokens: { type: string; raw: string; text: string }[] }).tokens;
    // The html token is rewritten to a text token with only type/raw/text
    expect(inlines[1]).toEqual({ type: 'text', raw: '<sup>1</sup>', text: '<sup>1</sup>' });
  });
});

describe('normalizeBlankLineGreedyTokens – escape token rewriting', () => {
  const ESCAPABLE_CHARS = '\\`*_{}[]<>()#+-.!|'.split('');

  it.each(ESCAPABLE_CHARS.map(ch => ({ ch })))(
    'rewrites a fabricated escape token for "%s" to a raw text token',
    ({ ch }) => {
      const raw = `\\${ch}`;
      const tokens = [
        {
          type: 'paragraph',
          raw: `a ${raw} b\n`,
          tokens: [
            { type: 'text', raw: 'a ', text: 'a ' },
            { type: 'escape', raw, text: ch },
            { type: 'text', raw: ' b', text: ' b' },
          ],
        },
      ];

      normalizeBlankLineGreedyTokens(tokens);

      const inlines = (tokens[0] as { tokens: { type: string; raw: string; text: string }[] })
        .tokens;
      expect(inlines[1]).toEqual({ type: 'text', raw, text: raw });
    }
  );

  it('rewrites escape tokens using real marked output', () => {
    const tokens = marked.lexer('classified \\<class\\>\n') as unknown as {
      type: string;
      tokens?: { type: string; raw: string }[];
    }[];
    normalizeBlankLineGreedyTokens(tokens as unknown as { type?: string; raw?: string }[]);

    const paragraph = tokens[0];
    const inlines = paragraph.tokens ?? [];
    const escapeTokens = inlines.filter(t => t.type === 'escape');
    expect(escapeTokens).toHaveLength(0); // all escape tokens rewritten away

    const opening = inlines.find(t => t.type === 'text' && t.raw === '\\<');
    const closing = inlines.find(t => t.type === 'text' && t.raw === '\\>');
    expect(opening).toBeDefined();
    expect(closing).toBeDefined();
  });

  it('rewrites escape tokens inside list items', () => {
    const tokens = [
      {
        type: 'list',
        items: [
          {
            type: 'list_item',
            tokens: [
              {
                type: 'text',
                tokens: [
                  { type: 'text', raw: 'classified ', text: 'classified ' },
                  { type: 'escape', raw: '\\<', text: '<' },
                  { type: 'text', raw: 'class', text: 'class' },
                  { type: 'escape', raw: '\\>', text: '>' },
                ],
              },
            ],
          },
        ],
      },
    ];

    normalizeBlankLineGreedyTokens(tokens);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inlines = (tokens[0] as unknown as any).items[0].tokens[0].tokens as {
      type: string;
      raw: string;
      text: string;
    }[];
    expect(inlines[1]).toEqual({ type: 'text', raw: '\\<', text: '\\<' });
    expect(inlines[3]).toEqual({ type: 'text', raw: '\\>', text: '\\>' });
  });

  it('rewrites escape tokens inside table cells', () => {
    const tokens = [
      {
        type: 'table',
        header: [{ tokens: [{ type: 'text', raw: 'h1', text: 'h1' }] }],
        rows: [
          [
            {
              tokens: [
                { type: 'text', raw: 'a ', text: 'a ' },
                { type: 'escape', raw: '\\|', text: '|' },
                { type: 'text', raw: ' b', text: ' b' },
              ],
            },
          ],
        ],
      },
    ];

    normalizeBlankLineGreedyTokens(tokens);

    const table = tokens[0] as unknown as {
      rows: { tokens: { type: string; raw: string; text: string }[] }[][];
    };
    const cellInlines = table.rows[0][0].tokens;
    expect(cellInlines[1]).toEqual({ type: 'text', raw: '\\|', text: '\\|' });
  });

  it('does not rewrite escape tokens with a missing raw field, falling back to `\\` + text', () => {
    const tokens = [
      {
        type: 'paragraph',
        raw: '\\*\n',
        tokens: [{ type: 'escape', text: '*' }],
      },
    ];

    normalizeBlankLineGreedyTokens(tokens);

    const inlines = (tokens[0] as { tokens: unknown[] }).tokens;
    expect(inlines[0]).toEqual({ type: 'text', raw: '\\*', text: '\\*' });
  });
});
