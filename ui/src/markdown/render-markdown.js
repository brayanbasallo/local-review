import MarkdownIt from 'markdown-it'

/**
 * Markdown source -> HTML, with the blocks the diff touched marked.
 *
 * Pure: text and a set of line numbers in, a string out. No Vue, no DOM.
 *
 * `html` is left at its default of false on purpose. This renders files from a
 * repository being audited precisely because it is not trusted, so raw HTML in
 * a `.md` is escaped rather than executed. markdown-it also blocks
 * `javascript:`, `vbscript:`, `file:` and `data:` URLs out of the box.
 */
const md = new MarkdownIt({
  linkify: true,
  breaks: false,
})

/**
 * Only blocks that read as a unit get marked. Containers are deliberately
 * absent: marking `bullet_list_open` would tint an entire list because one
 * bullet changed, which buries the signal instead of showing it.
 */
const MARKABLE_BLOCKS = new Set([
  'paragraph_open',
  'heading_open',
  'list_item_open',
  'blockquote_open',
  'tr_open',
  'dd_open',
  'dt_open',
])

/**
 * `token.map` is [startLine, endLine], zero-based with an exclusive end.
 * Monaco reports line numbers one-based, so the covered range is
 * startLine + 1 through endLine inclusive.
 */
const touchesChange = (map, changedLines) => {
  if (!map || changedLines.size === 0) return false

  const [start, end] = map
  for (let line = start + 1; line <= end; line += 1) {
    if (changedLines.has(line)) return true
  }
  return false
}

const escapeHtml = (text) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/**
 * Own fence rule for two reasons: the `data-lang` attribute is what
 * `monaco.editor.colorizeElement` reads, and the changed-block class has to
 * land on the <pre> rather than on a token the default rule would drop.
 */
md.renderer.rules.fence = (tokens, idx) => {
  const token = tokens[idx]
  const language = token.info.trim().split(/\s+/)[0]
  const classes = ['md-fence', ...(token.attrGet('class')?.split(' ') ?? [])].join(' ')

  return (
    `<pre class="${classes}"${language ? ` data-lang="${escapeHtml(language)}"` : ''}>` +
    `<code>${escapeHtml(token.content)}</code></pre>\n`
  )
}

md.renderer.rules.code_block = md.renderer.rules.fence

/**
 * Any link in a reviewed document is external to the review. Opening it in the
 * same tab would drop the session — including whatever is marked as viewed.
 */
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  tokens[idx].attrSet('target', '_blank')
  tokens[idx].attrSet('rel', 'noopener noreferrer')
  return self.renderToken(tokens, idx, options)
}

/**
 * @param source        markdown text
 * @param changedLines  one-based line numbers the diff reported as changed on
 *                      this side of the comparison
 */
export function renderMarkdown(source, { changedLines = new Set() } = {}) {
  const env = {}

  // Parse first, mutate the token stream, then render — rather than patching
  // renderToken, which receives no env and so cannot see `changedLines`.
  const tokens = md.parse(source ?? '', env)

  for (const token of tokens) {
    if (!token.map) continue

    const markable = MARKABLE_BLOCKS.has(token.type) || token.type === 'fence' || token.type === 'code_block'
    if (!markable) continue

    const [start, end] = token.map
    token.attrSet('data-line', `${start + 1}-${end}`)

    if (touchesChange(token.map, changedLines)) token.attrJoin('class', 'md-changed')
  }

  return md.renderer.render(tokens, md.options, env)
}
