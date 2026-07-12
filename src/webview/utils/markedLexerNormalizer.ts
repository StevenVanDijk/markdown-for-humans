/**
 * Copyright (c) 2025-2026 Concret.io
 *
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

/**
 * Several marked block tokenizers (heading, lheading, table, code, hr, list,
 * blockquote, html) match trailing `\n+` greedily, swallowing any blank lines
 * that follow into their own raw field. As a result no separate "space" token
 * is emitted for those blank lines, and our BlankLinePreservation extension
 * cannot see them.
 *
 * `normalizeBlankLineGreedyTokens` walks a marked token stream and, for any
 * such block whose raw ends with two or more newlines, splits the trailing
 * newlines off into a synthetic "space" token. The block's raw is shortened
 * to the content (without trailing whitespace) and a `space` token with the
 * full run of newlines is inserted directly after — matching the shape marked
 * emits naturally for paragraphs.
 *
 * This makes `BlankLinePreservation` (which keys off "space" tokens) work
 * uniformly across all block types.
 */

type RawToken = { type?: string; raw?: string } & Record<string, unknown>;

/**
 * Detect link/image inline tokens whose VISIBLE text is empty.
 *
 * A `link` or `image` with empty visible content (no inner tokens, or all
 * inner tokens render to nothing) parses through the @tiptap/markdown
 * pipeline as an empty inline node; ProseMirror schema validation then drops
 * it, silently erasing the original markdown source from the document. This
 * happens regardless of where the empty inline sits — alone in a paragraph
 * (`[]()`), next to a soft break (`Even deeper.\n[]()`), in the middle of
 * other text (`foo []() bar`), or inside a list item / blockquote.
 *
 * We catch each empty link/image at the lexer layer and rewrite it to a
 * literal-text token carrying its own raw markdown. The text node round-trips
 * losslessly: on save it serialises back to its original raw form and
 * re-lexing routes through this same normaliser to keep the cycle stable.
 */
function isInlineRenderEmpty(tok: RawToken | undefined): boolean {
  if (!tok || typeof tok.type !== 'string') return true;
  if (tok.type === 'text' || tok.type === 'escape') {
    const text = typeof tok.text === 'string' ? tok.text : '';
    return text.trim().length === 0;
  }
  if (tok.type === 'image') {
    // An image with a valid src/href is visible regardless of alt text — `<img>`
    // does not need an alt to render. Only treat the token as render-empty when
    // BOTH alt and href are missing, so `![](url)` survives as a real image
    // node (and gets URL-checked by the audit) instead of being demoted to
    // literal text.
    const href =
      typeof (tok as { href?: string }).href === 'string'
        ? ((tok as { href?: string }).href as string)
        : '';
    if (href.trim().length > 0) return false;
    const text =
      typeof (tok as { text?: string }).text === 'string'
        ? ((tok as { text?: string }).text as string)
        : '';
    if (text.trim().length > 0) return false;
    const inner = Array.isArray((tok as { tokens?: RawToken[] }).tokens)
      ? ((tok as { tokens?: RawToken[] }).tokens as RawToken[])
      : [];
    return inner.every(isInlineRenderEmpty);
  }
  if (tok.type === 'link') {
    const text =
      typeof (tok as { text?: string }).text === 'string'
        ? ((tok as { text?: string }).text as string)
        : '';
    if (text.trim().length > 0) return false;
    const inner = Array.isArray((tok as { tokens?: RawToken[] }).tokens)
      ? ((tok as { tokens?: RawToken[] }).tokens as RawToken[])
      : [];
    return inner.every(isInlineRenderEmpty);
  }
  return false;
}

function isEmptyLinkLike(tok: RawToken): boolean {
  if (!tok || (tok.type !== 'link' && tok.type !== 'image')) return false;
  return isInlineRenderEmpty(tok);
}

/**
 * Walk a paragraph's inline-token array and replace every empty link/image,
 * raw HTML tag, or backslash-escape token with a literal-text token. Mutates
 * the array in place. Returns whether any rewrite happened.
 *
 * Inline `html` tokens (e.g. `<kbd>`, `</kbd>`, `<br>`) have no handler in
 * the @tiptap/markdown pipeline and would be silently dropped. Converting them
 * to text nodes preserves the raw markup through the round-trip: the text node
 * serialises back verbatim, and on re-parse the same rewrite fires again so
 * the cycle is stable.
 *
 * `escape` tokens (e.g. `\<`, `\*`) likewise have no round-trip guarantee
 * under @tiptap/markdown ≥3.25's serialiser, which applies `encodeHtmlEntities`
 * and `escapeMarkdownSyntax` to all text nodes. We convert escape tokens to
 * text nodes carrying the RAW escape sequence (`token.raw`, e.g. `\<`), not
 * the unescaped character. `installBlankLineLexerNormalizer` patches
 * `encodeTextForMarkdown` to be a no-op, so these verbatim text nodes are
 * emitted as-is: `\<class\>` round-trips byte-identical instead of degrading
 * to `&lt;class&gt;` or `\*foo\*` to `*foo*`. On re-parse the same escape
 * tokens are produced and rewritten again, keeping the cycle stable — the same
 * strategy used for raw inline HTML above.
 */
function rewriteEmptyInlines(inlines: RawToken[]): boolean {
  let changed = false;
  for (let i = 0; i < inlines.length; i++) {
    const tok = inlines[i];
    if (!tok) continue;
    if (tok.type === 'escape') {
      const text = typeof tok.text === 'string' ? tok.text : '';
      const raw = typeof tok.raw === 'string' && tok.raw.length > 0 ? tok.raw : `\\${text}`;
      inlines[i] = { type: 'text', raw, text: raw } as RawToken;
      changed = true;
    } else if (isEmptyLinkLike(tok) || tok.type === 'html') {
      const raw = typeof tok.raw === 'string' ? tok.raw : '';
      if (raw.length > 0) {
        inlines[i] = { type: 'text', raw, text: raw } as RawToken;
        changed = true;
      }
    }
  }
  return changed;
}

/**
 * Recursively walk the token tree, applying inline rewriting to every
 * paragraph/heading/text node we find — including those nested inside list
 * items, blockquotes and headings. Marked's tree shape:
 *   - `paragraph`, `heading`, `lheading`: inline tokens in `tokens`
 *   - `blockquote`: child blocks in `tokens`
 *   - `list`: child items in `items`
 *   - `list_item`: child blocks in `tokens`
 *   - `table`: cells in `header` (array) and `rows` (array of arrays), each
 *     cell carrying its inline tokens in `tokens`
 */
function normalizeEmptyInlinesDeep(tokens: RawToken[] | undefined): void {
  if (!Array.isArray(tokens)) return;
  for (const token of tokens) {
    if (!token || typeof token.type !== 'string') continue;
    // `paragraph`, `heading`, `lheading` (block-level) and `text` (the block-level
    // text token marked emits for tight list items) all carry their inline tokens
    // in `.tokens`. Headings must be included so inline HTML like
    // `<!-- omit in toc -->` is preserved rather than silently dropped.
    if (
      token.type === 'paragraph' ||
      token.type === 'text' ||
      token.type === 'heading' ||
      token.type === 'lheading'
    ) {
      const inlines = (token as { tokens?: RawToken[] }).tokens;
      if (Array.isArray(inlines)) rewriteEmptyInlines(inlines);
      continue;
    }
    if (token.type === 'list') {
      normalizeEmptyInlinesDeep((token as { items?: RawToken[] }).items);
      continue;
    }
    if (token.type === 'list_item' || token.type === 'blockquote') {
      normalizeEmptyInlinesDeep((token as { tokens?: RawToken[] }).tokens);
      continue;
    }
    if (token.type === 'table') {
      // Marked table tokens carry their cells in `header` / `rows`, not
      // `tokens`; each cell has its own inline-token array.
      const table = token as {
        header?: { tokens?: RawToken[] }[];
        rows?: { tokens?: RawToken[] }[][];
      };
      for (const cell of table.header ?? []) {
        if (Array.isArray(cell?.tokens)) rewriteEmptyInlines(cell.tokens);
      }
      for (const row of table.rows ?? []) {
        for (const cell of row ?? []) {
          if (Array.isArray(cell?.tokens)) rewriteEmptyInlines(cell.tokens);
        }
      }
      continue;
    }
  }
}

const GREEDY_BLOCK_TYPES = new Set([
  'heading',
  'table',
  'code',
  'hr',
  'lheading',
  'list',
  'blockquote',
  'html',
]);

function splitTrailingNewlines(token: RawToken): RawToken[] {
  const raw = typeof token.raw === 'string' ? token.raw : '';
  const match = raw.match(/\n+$/);
  if (!match || match[0].length < 2) {
    return [token];
  }

  const trailing = match[0];
  const trimmedRaw = raw.slice(0, raw.length - trailing.length);

  // Mutate raw on the original token. Other fields (text, depth, tokens, …)
  // were derived from a regex capture that doesn't include trailing
  // whitespace anyway, so they remain valid.
  token.raw = trimmedRaw;

  return [token, { type: 'space', raw: trailing } as RawToken];
}

/**
 * Walk a token array (as produced by `marked.lexer(src)`) and split blank-line
 * runs that were greedily absorbed by block tokens into synthetic space
 * tokens. Preserves the array's `links` property (marked attaches reference
 * link definitions to the tokens array as a non-index property).
 */
export function normalizeBlankLineGreedyTokens<T extends RawToken[]>(tokens: T): T {
  // Rewrite empty link/image inlines at every depth before the greedy-newline
  // split runs — that way both whole-empty paragraphs (`[]()`) and mixed
  // paragraphs (`Even deeper.\n[]()`) carry the original markdown forward as
  // literal text instead of letting the inline get stripped on parse.
  normalizeEmptyInlinesDeep(tokens);
  const out: RawToken[] = [];
  for (const token of tokens) {
    if (token && typeof token.type === 'string' && GREEDY_BLOCK_TYPES.has(token.type)) {
      out.push(...splitTrailingNewlines(token));
    } else {
      out.push(token);
    }
  }

  // Preserve the `links` side-channel that marked attaches to the tokens array.
  const links = (tokens as unknown as { links?: unknown }).links;
  if (links !== undefined) {
    (out as unknown as { links?: unknown }).links = links;
  }

  return out as T;
}

/**
 * Install blank-line and escape normalizers on a @tiptap/markdown MarkdownManager
 * (or a raw marked instance as a fallback). Idempotent: re-installing on the
 * same object is a no-op.
 *
 * Two patches are applied:
 *
 * 1. **Lexer patch** — routes every parse pass through
 *    `normalizeBlankLineGreedyTokens`, which splits greedily-absorbed blank
 *    lines back out as synthetic `space` tokens and rewrites `escape`/`html`
 *    inline tokens to verbatim `text` tokens.
 *
 *    @tiptap/markdown ≥3.26 calls `createLexer().lex(src)` internally (rather
 *    than the static `marked.lexer(src)`), so we patch `createLexer` on the
 *    MarkdownManager to wrap the returned Lexer's `.lex` method. For backwards
 *    compat and for the static `markedInstance.lexer()` calls that still exist
 *    for nested block parsing, the static `lexer` function is patched too.
 *
 * 2. **Serializer patch** (MarkdownManager only) — replaces
 *    `encodeTextForMarkdown` with an identity function. @tiptap/markdown ≥3.25
 *    applies `encodeHtmlEntities` and `escapeMarkdownSyntax` inside
 *    `encodeTextForMarkdown`, which would corrupt our verbatim text nodes: a
 *    `\<` text node would become `\&lt;` (entity-encoded) and the leading `\`
 *    would be double-escaped to `\\`. The no-op is safe because our
 *    escape/html rewrites store the exact markdown source to emit verbatim.
 */
export function installBlankLineLexerNormalizer(managerOrMarked: unknown): void {
  type LexerLike = { lex?: (src: string) => RawToken[] };
  type ManagerLike = {
    instance?: unknown;
    lexer?: (src: string, options?: unknown) => RawToken[];
    createLexer?: () => LexerLike;
    encodeTextForMarkdown?: (text: string, node?: unknown, parentNode?: unknown) => string;
    __mdh_blankLineNormalizerInstalled?: boolean;
  };

  const manager = managerOrMarked as ManagerLike;
  if (!manager) return;
  if (manager.__mdh_blankLineNormalizerInstalled) return;

  // Resolve the underlying marked instance (either via .instance getter or directly).
  const markedInst = (manager.instance !== undefined ? manager.instance : manager) as ManagerLike;

  // --- Lexer patch (primary path in @tiptap/markdown ≥3.26) ---
  // Patch createLexer so the Lexer instance returned has its .lex() wrapped.
  if (typeof manager.createLexer === 'function') {
    const origCreateLexer = manager.createLexer.bind(manager);
    manager.createLexer = function patchedCreateLexer(): LexerLike {
      const lexerInst = origCreateLexer() as LexerLike;
      if (typeof lexerInst.lex === 'function') {
        const origLex = lexerInst.lex.bind(lexerInst);
        lexerInst.lex = function patchedLex(src: string): RawToken[] {
          const tokens = origLex(src);
          return normalizeBlankLineGreedyTokens(tokens);
        };
      }
      return lexerInst;
    };
  }

  // --- Lexer patch (static fallback for nested calls and older versions) ---
  if (typeof markedInst.lexer === 'function') {
    const origStaticLexer = markedInst.lexer.bind(markedInst);
    markedInst.lexer = function patchedStaticLexer(src: string, options?: unknown): RawToken[] {
      const tokens = origStaticLexer(src, options);
      return normalizeBlankLineGreedyTokens(tokens);
    };
  }

  // --- Serializer patch ---
  // Disable encodeHtmlEntities + escapeMarkdownSyntax so our verbatim text
  // nodes (storing raw escape sequences like `\<` and raw HTML like `<kbd>`)
  // are emitted as-is rather than being corrupted by the escaping passes.
  if (typeof manager.encodeTextForMarkdown === 'function') {
    manager.encodeTextForMarkdown = (text: string): string => text;
  }

  manager.__mdh_blankLineNormalizerInstalled = true;
}
