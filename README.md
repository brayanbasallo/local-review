# llm-review

Review a Git diff in a local, GitHub-style pull-request UI. Built for auditing
commits an LLM just wrote — without pushing a branch or opening a real PR.

```bash
cd any-git-repo
llm-review
```

Finds a free port, serves the UI, opens your browser. `Ctrl+C` or the
**Finish review** button shuts it down and frees the port.

## Install

```bash
npm install && npm link
```

`npm link` runs the UI build via `prepare`, so `llm-review` works from any
directory afterwards. macOS-focused: auto-open uses `open`. Everything else is
platform-neutral, and the URL is always printed if the browser cannot be
launched.

## What you get

- **Searchable ref pickers** — click either selector for a popover with a
  filter pinned at the top, grouped results, and full keyboard control
  (arrows, Enter, Escape). Matching ignores case and accents. Base and compare
  each take any branch plus two virtual targets: `Working Tree (uncommitted)`
  and `Staged (index)`. Opens on `current branch ← working tree`, since
  uncommitted work is the usual case.
- **Untracked files included** in the working-tree comparison. `git diff` only
  reports tracked paths, so a brand-new file stays invisible to it until someone
  runs `git add` — and a brand-new file is the most common thing an LLM leaves
  behind. `.gitignore` is still respected.
- **Remote-tracking branches as a base** — `origin/main` alongside your local
  `main`. When the local branch has fallen behind, its merge-base is not the
  one a real pull request would use, so the diff shows work that is already
  merged upstream. Nothing here touches the network: these refs are as of your
  last `git fetch`.
- **Stale-base warning** — local branches that are behind their upstream are
  labelled (`release · 37 behind`), and picking one puts an amber badge next to
  the selector. Being *ahead* is not flagged: unpushed work is the normal state
  and says nothing about the branch's fitness as a base.
- **Sidebar folder tree** — collapsible directories with per-folder `+X -Y`
  roll-ups, so the first question ("which parts of the system did this touch?")
  is answerable before opening a single file. Files show status (added /
  modified / deleted / renamed) and their own counts, with a reactive
  name/extension filter.
- **Side-by-side diff** — Monaco, read-only, syntax-highlighted, language
  detected from the path.
- **Resizable panes** — drag the seam between the file tree and the diff (or
  focus it and use the arrow keys); the width is remembered across reloads. The
  original|modified boundary inside the diff drags independently.
- **Viewed tracking** — a checkbox per file. Reviewed files dim but stay
  reachable, and the state survives a reload (`localStorage`, scoped per repo
  and per comparison).

## Options

```
--port <n>    Preferred port (default 3000; the next free one is used if taken)
--no-open     Do not launch the browser
-h, --help
```

## Development

Two processes: the API and Vite with an `/api` proxy.

```bash
npm run dev:api   # port 3000
npm run dev:ui    # port 5173 — open this one
```

## How it works

`src/git/` is the only place that knows Git exists. The API layer never spawns
a process; the UI never sees a revision string beyond an opaque token.

```
bin/llm-review.js       thin entry
src/cli/                repo guard, port finder, browser, signal handling
src/git/                exec · refs · changes · content · untracked  <- only Git seam
src/api/                http server, 4 routes, static serving
src/shared/             virtual-ref sentinels, shared with the UI over the API
ui/src/tree/            paths -> directory tree (pure, no Vue)
ui/src/                 Vue 3 + Monaco + reka-ui (headless combobox only)
```

The ref pickers use reka-ui's Combobox rather than a hand-rolled one. The only
thing worth buying there is the part that is easy to get subtly wrong — popover
positioning, `aria-activedescendant`, virtual focus, shared keyboard/pointer
highlight. It is unstyled by design, so every rule still comes from the palette
in `styles.css`; a full component framework was rejected because its theme layer
would have to be fought and every option template rewritten anyway.

### Three decisions worth knowing

**No diff parsing.** Monaco's `DiffEditor` takes two full file contents and
computes the diff itself — it has no use for parsed hunks. So the server reads
`git diff --numstat` for the impact counts (which is literally the `+X -Y`
format), `--name-status -M` for statuses and renames, and `git show` for
content. A diff-parsing dependency would be pure overhead.

**The left pane comes from the merge-base, not the base branch tip.**
`git diff base...compare` compares against the fork point, the same as a GitHub
PR. Reading original content from the base tip instead would show a left pane
that was never part of the comparison whenever `base` has moved on — producing
phantom diffs. `/api/changes` resolves `git merge-base` once and every content
read uses that SHA.

**`/api/shutdown` only fires from the Finish review button.** Wiring it to
`beforeunload` would kill the server on every page reload.

### The sidebar tree

Grouping is a presentation concern, so the server knows nothing about it — the
whole transform lives in `ui/src/tree/file-tree.js` as pure functions.

The tree is built from the **already-filtered** file list, which is what makes
search work without extra code: non-matching branches simply do not exist in
the tree, so there is no pruning pass and nothing to auto-expand.

A folder whose only child is another folder is merged into one row
(`ui/src/components` rather than three nested rows). A folder whose only child
is a *file* is left alone — that row still carries information.

Collapse state is session-only, unlike the viewed checkmarks. Viewed state is
the audit record and must survive a reload; folding is a view preference, and
persisting it means a reload silently hides files.

One consequence worth naming: tree order differs from the
`git diff --name-status` order the changeset arrives in (folders before files,
per level). Anything meaning "the next file" therefore walks the flattened
tree, not the raw list — otherwise "Next unviewed" jumps in an order that does
not match what is on screen. It also searches forward from the cursor and wraps,
so stepping past an unviewed file cannot strand it.

### Language services are deliberately excluded

The UI imports Monaco's editor core plus `basic-languages` (82 Monarch
tokenizers), but **not** `vs/language/*`. Those four packages provide
IntelliSense and diagnostics against a project that does not exist here: they
carpet a read-only diff with phantom "cannot find module" errors, and the first
TypeScript file opened cost ~230ms loading `tsMode` and syncing models into a
worker. Dropping them removed that outlier — worst-case file switch went from
232ms to 39ms — with no loss of syntax colouring.

### Performance

The `DiffEditor` instance is created once and lives for the session. Switching
files only swaps its models. Creating an instance per file costs roughly half a
second; swapping models costs tens of milliseconds. Measured across mixed
`.tsx / .ts / .json / .css / .md` files: median 15ms, worst case 39ms.

## Security

The tool runs against local repositories, so the Git layer treats every ref and
path as hostile input:

- `execFile` with argument arrays, never a shell string. A branch named
  `; rm -rf ~` is inert data.
- Every incoming ref goes through `git rev-parse --verify --quiet`, with
  `--end-of-options` so a ref starting with `-` cannot become a Git flag.
- `/api/content` whitelists the requested path against the changeset itself.
  Nothing outside the current diff is reachable.
- The server binds to `127.0.0.1` only.
