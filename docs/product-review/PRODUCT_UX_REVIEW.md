# Codebase Universe AI: Product & UX Review

**Reviewer role:** product design, UX architecture, AI interaction design, documentation
**Implementation owner:** Anti-Gravity · **Engineering validation:** Codex
**Reviewed state:** working tree on 2026-10-16 (no commits yet; backend under active edit during review)

Companion files in this folder:

| File | Purpose |
|---|---|
| `proposed-backend-fixes.patch` | Small, verified patch for four product-critical defects (§7, items A–D). Applies cleanly with `git apply`. **Not applied.** |
| `README.draft.md` | Proposed project README (§8). Feature claims are marked by implementation status. |
| `../../frontend/src/styles/tokens.css` | Design tokens from §4. New file, not yet imported anywhere. |

Every finding below is labeled with how it was established:

- **[verified]**: reproduced by running code against the real modules.
- **[code]**: read directly in the source; not executed.
- **[design]**: a recommendation or judgment, not a defect.

---

## 1. Product & UX audit

### 1.1 What exists today

| Area | State |
|---|---|
| Backend API (FastAPI) | Substantial. Projects (sample / ZIP / local folder), background pipeline, graph with filters, node details, quality report, change impact, RAG chat, refactor propose/apply, file content. 12/12 tests in `backend/tests` pass. |
| Frontend | **The unmodified Vite + React scaffold.** `App.tsx` renders the "Get started / Count is 0" template, `index.html` title is `frontend`. `three` and `lucide-react` are installed but not used. **No user journey exists yet.** |
| README | None at the repo root. `frontend/README.md` is the Vite template. |

Because no UI exists yet, this review is mostly **a specification for the UI that Anti-Gravity will build**. The backend findings matter because they decide whether the UI can be honest about what it shows.

### 1.2 Can the definition of success be met with the current API?

| Step in the target journey | API support | Blocking gaps |
|---|---|---|
| Import a project | `POST /api/projects/samples/{python\|typescript}`, `/upload` (zip), `POST /api/projects` (local path) | `git_repo` source type exists in the enum but has no implementation, so the UI must not offer it. |
| Understand analysis progress | Poll `GET /api/projects/{id}` → `status`, `status_message` | No counts or progress. Messages use metaphor ("Constructing celestial dependency graph…", "Universe navigable."). |
| Navigate the map | `GET …/graph?node_types&languages&search&max_nodes` | Duplicate node IDs **[verified]**. Truncation drops functions silently unless the UI reads `stats.unfiltered_total_nodes`. |
| Inspect a file / dependency | `GET …/graph/nodes/{id}` + `GET …/files/content?path` | Works. |
| Ask an evidence-grounded question | `POST …/chat` | With no API key (the default), the answer is a fixed template still labeled `grounded` **[verified]**. Chat history is not sent to the model **[code]**. |
| Investigate change impact | `GET …/impact?target_node_id` | Calls from methods/async functions are dropped from the graph, so the blast radius is undercounted **[verified]**. |
| Review & approve a change | `POST …/refactor/propose`, `POST …/refactor/apply` | **Unsafe as built.** See P0-2/P0-3. |

### 1.3 Overall assessment

The backend has the right shape for a strong product: a graph, a quality report, impact analysis, and a grounded chat. It already models the most important idea, honesty about evidence (`evidence_type`, `evidence_status`, `test_validation_status`). The weakness is that several code paths **report more certainty than they have**, and that is the one thing a developer tool built on "source-grounded AI" cannot afford. Fix those before building the UI on top of them.

---

## 2. Prioritized usability issues

P0 = blocks the core promise or can damage user data · P1 = misleads or confuses · P2 = polish.

### P0

| # | Issue | Evidence | Fix |
|---|---|---|---|
| P0-1 | **No frontend.** Nothing for a user to do. | `frontend/src/App.tsx` is the Vite scaffold **[code]** | Build to the layout in §3. Minimum journey first (§7 "Slice 1"). |
| P0-2 | **Refactor without an LLM key turns the user's source file into prose.** `HeuristicFallbackProvider` (the default when no key is set) returns markdown starting `### Grounded Architectural Analysis`. It contains no ``` fence, so `create_proposal` uses the whole text as `proposed_code`. `apply` would then write it over the file. | Probe script: fallback output has no code fence; first line of `proposed_code` = `### Grounded Architectural Analysis` **[verified]** | Patch item B: refuse to propose without a real provider, and reject empty diffs. UI: disable "Propose change" and explain why when `/api/health` reports no provider. |
| P0-3 | **Apply is unsafe and reports false success.** (a) Writes straight into the user's real directory for `local_folder` imports. (b) Runs `git checkout -b` in the user's repo, switching their branch. The return code is ignored, so `git_branch` is reported even when it failed. (c) No check that the file is unchanged since the proposal. (d) `success` is always `True`. (e) `run_tests` runs the suite **before** the change is written, so a "passed" status does not validate the proposal. | `ai/refactor.py` `apply_proposal`, `_run_tests` **[code]**; (b) and (c) fixed in patch item B | Patch fixes (b) and (c). Product decision needed for (a) and (e). See §9. Until (e) is fixed, the UI must label test results "Tests on current code (before change)". |
| P0-4 | **The offline chat answer is labeled grounded.** The fallback template always returns `evidence_status="grounded"`. Its "Verified reference" lines never appear because it looks for lines starting with `File: `, while the context lines start with `--- File: `. | `ai/provider.py` + `ai/rag.py` **[verified]** for the template, **[code]** for the regex | Patch item C adds `answer_source: "llm" \| "static_fallback" \| "error"` and sets `insufficient_evidence` for the fallback. UI shows a "No AI provider configured. Showing retrieved source only" banner. |
| P0-5 | **Calls made inside methods and async functions are dropped from the graph.** The builder looks callers up as `function:{path}:{caller}`, but these nodes are `method:…` / `async_function:…`, and the caller name is `Class.method`. In a 3-caller test, only 1 edge survived. Impact analysis and "who calls this" both undercount, which hurts most in OO Python. **It shows up in the demo sample:** `UserManager.authenticate` → `verify_token` (`sample_python/auth/user.py:10`) is missing, so impact on `verify_token` lists only the test as a dependent. | Probe **[verified]** | Patch item A. After patch: 3/3 edges, each tagged with `metadata.resolution`. |
| P0-6 | **The backend only starts on Python 3.14+.** `graph/algorithms.py` annotates with `Tuple` without importing it. Python 3.14 evaluates annotations lazily so it passes there, but 3.11–3.13 raise `NameError` at import. Most people cloning the repo will hit this on first run. | Same construct run on Python 3.11 and 3.12 → `NameError: name 'Tuple' is not defined`; the project venv is 3.14.3 **[verified]** | Patch item D (one-line import). Codex: run CI on 3.11 and 3.12 too. |
| P0-7 | **Duplicate node IDs.** Method IDs are `method:{file}:{name}` without the class, so two classes with `__init__` in one file collide. Graph libraries key on ID and will merge or crash. | Probe: duplicate `method:m.py:__init__` **[verified]** | Use the qualified name in IDs: `method:{file}:{Class.method}`. This touches parent/call-target ID construction, so it belongs to Anti-Gravity/Codex. Not in the patch. |

### P1

| # | Issue | Evidence | Fix |
|---|---|---|---|
| P1-1 | Call targets resolve to the **first symbol with that name** anywhere in the repo, but the edge looks just as certain as a resolved import. | `graph/builder.py` call resolution **[code]** | Patch A adds `resolution: unique_name \| ambiguous_name` and `candidate_count`. Render calls as inferred (§5.6). |
| P1-2 | Chat citations are always `verified=True`, but they are *retrieved context*. Nothing checks that the answer relies on them. | `ai/rag.py` **[code]** | Rename in the UI to "Sources searched". Reserve "verified" for citations the model actually references (parse `[path:a-b]` from the reply and cross-check). |
| P1-3 | Multi-turn chat doesn't work: history is stored but never sent to the model. "What calls it?" after "Explain X" loses X. | `routes/chat.py`, `ai/rag.py` **[code]** | Send the last N turns; until then, the UI keeps the focused node as a visible context chip on every turn. |
| P1-4 | Graph search is a **server-side filter**: non-matching nodes and all their edges disappear, so the user loses their place. | `routes/graph.py` **[code]** | Search should *focus* (select + highlight + dim others) client-side over the loaded graph. Keep the server filter for very large repos only. |
| P1-5 | Silent truncation at `max_nodes=800`: the lowest-priority nodes (functions) are dropped. | `routes/graph.py` **[code]** | Always show "Showing 800 of 3,214 nodes · functions hidden. [Show for selection]". Prefer progressive disclosure (§5.2). |
| P1-6 | File-level impact ignores callers of the file's functions (`contains` edges are excluded from the dependency graph). | `graph/impact.py` **[code]** | Roll children's dependents up to the file, or tell the user to "Analyze a function for call-level impact". |
| P1-7 | "Related tests" are substring matches (`"test" in path`, stem-in-path), but `risk_assessment` reads as a verdict ("CRITICAL / HIGH BLAST RADIUS"). | `graph/impact.py` **[code]** | Label "Likely related tests (name match)". Return the risk level as an enum plus count, and let the UI phrase it. |
| P1-8 | The health score uses arbitrary weights, floors at 5, and **double-counts cycles** (−5 per cycle finding plus −6 per cycle). | `analysis/quality.py`. The sample scores exactly 86 = 100 − 5 (cycle finding) − 6 (cycle penalty) − 2 − 0.5 − 0.5 **[verified]** | Show the score with a breakdown ("−22 from 2 import cycles…") and call it a heuristic. Never show a bare grade. |
| P1-9 | Metaphor in status messages ("celestial", "Universe navigable") hides what is happening. | `routes/projects.py` **[code]** | Plain labels: "Parsing 142 files", "Building dependency graph", "Running quality checks", "Ready". Keep the metaphor in the visuals, not the text. |
| P1-10 | The JS/TS parser never sets `caller_symbol`, so every TS call is attributed to the file. | `parser/js_ts_parser.py` **[code]** | Document as a limitation. In the inspector for TS functions, show "Call-level data unavailable for TypeScript". |
| P1-11 | Nested functions get `kind="method"` and a `class:` parent that doesn't exist, which leaves a dangling `contains` edge. The graph route filters it out, so the function loses its parent. | Probe **[verified]** | Parser/builder fix (Codex). Frontend must drop edges whose endpoints are missing, defensively. |

### P2

- `ChatRequest` and `RefactorRequest` require `project_id` in the body as well as the path, so callers send it twice **[code]**. Make it optional or remove it.
- `GraphFilter` defines `edge_types` and `directory`, but `GET …/graph` doesn't accept them **[code]**. These are the two most useful filters (§5.4).
- Running `pytest` from `backend/` collects `storage/repos/**` sample tests and errors **[verified]**. Add `testpaths = tests` to pytest config (Codex).
- Gemini is pinned to `gemini-1.5-flash` and passes the key as a URL query parameter **[code]**. Keys in URLs end up in logs; send it in the `x-goog-api-key` header. Confirm the model is still served.

---

## 3. Navigation & layout

### 3.1 Information architecture

```
Projects (home)
 ├─ Sample: Python microservice      ← one click, ~seconds
 ├─ Sample: TypeScript metrics API
 ├─ Import .zip (drag & drop)
 └─ Open local folder (shown only when the API runs on localhost)

Project workspace
 ├─ Explore    graph + file tree + filters        (default)
 ├─ Findings   quality report, cycles, top risks
 ├─ Impact     "what breaks if I change X"
 ├─ Changes    proposals → diff → tests → apply
 └─ Assistant  available everywhere as a docked panel, not a page
```

Four destinations plus a persistent assistant. "Universe/3D" is a **view mode** of Explore, not a separate place.

### 3.2 Workspace layout (desktop ≥ 1280px)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ◉ Codebase Universe │ Financial Microservice ▾ │ ● Ready · 41 files │ ⌘K Search… │ ◐ │
├──┬────────────────────┬──────────────────────────────────────┬───────────────┤
│▣ │ EXPLORE            │ auth / jwt.py ›                [2D|3D] [Fit] [⟲] │ Inspector │ Assistant │
│⚠ │ ▸ auth/        3   │                                      │ jwt.py        file · py  │
│◎ │ ▸ core/        2   │         (graph canvas)               │ 38 LOC · cx 4 · risk 22  │
│⇄ │ ▸ tests/       2   │                                      │ ─────────────────────── │
│  │                    │                                      │ Imports (2)     ▸        │
│  │ FILTERS            │                                      │ Imported by (3) ▸        │
│  │ Type  ▣file ▢fn …  │                                      │ Symbols (4)     ▸        │
│  │ Lang  ▣py ▣ts      │  ┌ legend ┐            ┌ minimap ┐   │ ─────────────────────── │
│  │ Edges ▣imports ▢…  │  └────────┘            └─────────┘   │ [Open code] [Impact] [Ask]│
├──┴────────────────────┴──────────────────────────────────────┴───────────────┤
│ Showing 41 of 41 nodes · 63 edges · 2 inferred · 1 cycle   │ AI: none configured │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Top bar (48px):** project switcher, analysis status pill (opens a detail popover), global search (`⌘K`/`Ctrl+K`), theme toggle.
- **Icon rail (48px) + sidebar (272px, collapsible):** Explore / Findings / Impact / Changes. The sidebar content changes per destination; in Explore it holds the file tree and filters.
- **Canvas:** breadcrumb of the current focus, view controls top-right, legend bottom-left, minimap bottom-right.
- **Right column (380px, resizable, collapsible):** two tabs, **Inspector** and **Assistant**. Any "Ask about this" button switches to Assistant with the node attached as a context chip. Keeping them in one column stops the AI from covering the graph.
- **Status bar (28px):** what is visible vs. total, inferred-edge count, cycle count, AI provider state. This is where the truncation and uncertainty disclosures always live.

**Below 1280px**, the inspector becomes an overlay drawer. **Below 900px**, show a read-only list view (files → connections). A graph on a phone is not useful.

### 3.3 First-run journey

1. **Projects screen.** Sample projects come first ("Ready in a few seconds, no setup"), then ZIP import. Copy states what is collected and where it is stored ("Files are analyzed locally on this machine; nothing is uploaded to an AI provider until you ask a question").
2. **Analysis screen.** A four-step stepper (Parse → Graph → Quality → Ready) with the plain-language message. On failure: the error text, then **Retry** (`/reindex`) and **Remove project**. Never leave the user on a spinner.
3. **First workspace view.** File-level 2D graph, auto-fit. A three-step coach mark the user can dismiss: *Click a file → See its connections → Ask or check impact.* It never shows again after dismissal.
4. A **health strip** above the canvas on first load: "2 import cycles · 3 complex functions · 1 orphan module → View findings". This gives an immediate reason to explore.

---

## 4. Design system

Implemented as tokens in `frontend/src/styles/tokens.css`. Contrast ratios below were computed against all three surface levels.

**Direction: an instrument, not a light show.** Think observatory control room: dark, calm surfaces; one cool accent; color reserved for meaning. Make it memorable through precise graph rendering and the evidence model, not through glow.

| Token group | Decision |
|---|---|
| Typography | Inter (UI) + JetBrains Mono (paths, code, metrics). Scale 12/13/14/16/20/24. Base UI 14px; nothing readable below 12px, including graph labels. Paths and symbols are always monospace. |
| Spacing | 4px grid (`--space-1…12`). Panel padding 16; list rows 32px tall; dense tables 28px. |
| Surfaces | `surface-0` canvas → `surface-3` hover, stepped by lightness rather than shadows. Borders 1px `border-subtle`. Cards only where content is grouped. No empty decorative cards. |
| Color | One accent (`#5cc8d6` dark / `#0b6b76` light) used only for selection, focus and primary actions. Status colors: success, warning, danger, info. Dark text colors are ≥ 4.6:1 on every surface; light ≥ 4.7:1. |
| Graph semantics | Node type = **shape + hue**: directory (outlined rounded rect/hull), file (circle), class (hexagon), function (small diamond). Edge confidence = **line style**: solid verified, dashed inferred, dotted amber ambiguous, thick red for cycles. Color is never the only signal. |
| Radius | 4 (inputs, chips), 6 (buttons, cards), 10 (popovers). |
| Motion | 120/200ms UI transitions; 450ms camera moves. Zero under `prefers-reduced-motion`. No ambient/idle animation in the graph. Layout settles, then stops. |
| Iconography | `lucide-react` (already installed), 16px in UI and 20px in the rail, 1.5 stroke. One icon per concept: `FileCode` file, `Box` class, `FunctionSquare` function, `FolderTree` directory, `ShieldAlert` finding, `Radar` impact, `GitPullRequest` change. |

### Component states (apply to every interactive component)

| State | Treatment |
|---|---|
| Default | `surface-2` bg, `text-primary` |
| Hover | `surface-3` bg |
| Focus-visible | `--focus-ring` (2px accent outside 2px surface gap). Never remove outlines. |
| Selected | `accent-subtle` bg + 2px accent left bar (lists) / accent outline (nodes) |
| Disabled | 50% opacity **plus** a tooltip that explains *why* ("Requires an AI provider") |
| Loading | Skeleton rows in panels; never a full-screen spinner after first load |
| Error | `danger-subtle` bg, message + one recovery action |

Status pill vocabulary (used for analysis, tests and proposals; one shared component, `StatusBadge`):
`Ready` (success) · `Running` (info, animated dot) · `Failed` (danger) · `Not run` (neutral) · `Skipped` (neutral, with reason).

---

## 5. Graph interaction design

### 5.1 2D first, 3D as an option

**Default to 2D.** Labels stay readable, picking is precise, it is keyboard- and screen-reader-friendly, and it scales. Offer **3D "Universe" view** as a toggle for orientation and demos. The backend already computes `position` (spiral galaxy layout), so 3D costs little. Both views share selection, filters and the inspector, and switching keeps the selection.

Library suggestion (Anti-Gravity's call): `react-force-graph` gives matching 2D and 3D components over the same data and uses the `three` already installed. If repos above a few thousand nodes matter, `sigma.js` + `graphology` (WebGL 2D) is stronger.

### 5.2 Progressive disclosure (the main overload defense)

- **Initial level:** directories + files, with `imports` edges only. Hide `contains` edges by default and draw directories as hulls/clusters instead.
- **Expand a file** (double-click, `→`, or "Show symbols" in the inspector): its classes/functions appear around it, with call edges.
- **Collapse** (`←`, or the breadcrumb): returns to the parent level.
- **Neighborhood focus:** selecting a node keeps it and its 1-hop neighbors at full opacity and dims everything else to `--node-dimmed-opacity`. A depth stepper (1/2/3 hops) widens the focus.

### 5.3 Core interactions

| Action | Mouse | Keyboard |
|---|---|---|
| Pan / zoom | drag / wheel (zoom to cursor) | arrows / `+` `-` |
| Fit all | double-click empty space | `F` |
| Select node | click | `Tab` cycles visible nodes; `Enter` selects |
| Multi-select | `Shift`+click | — |
| Expand / collapse | double-click node | `→` / `←` |
| Open source | inspector "Open code" | `O` |
| Impact of selection | inspector "Impact" | `I` |
| Ask about selection | inspector "Ask" | `A` |
| Clear selection / reset | click empty / ⟲ button | `Esc` / `R` |
| Search | — | `⌘K` / `Ctrl+K`, `/` |

**Labels:** always shown for the selected node, its neighbors and hovered nodes. Shown for other nodes only above a zoom threshold where they fit at ≥12px. Never render overlapping labels. Collide and hide by importance (risk, degree).

### 5.4 Search & filters

- **Search (`⌘K`)** is a command palette over the loaded graph: files, classes, functions, ranked exact > prefix > substring, showing kind icon, path (mono) and language. Choosing a result **flies to and selects** the node (expanding its parent file if needed). It does not filter the graph.
- **Filters (sidebar):** Node type, Language, **Folder** (tree checkboxes), **Relationship** (imports / calls / inherits / contains), **Confidence** (verified / inferred), **Findings only**. Active filters appear as removable chips above the canvas, with "Clear all".
- **Color by:** Type (default) · Risk · Language · Folder. One encoding at a time, with the legend updated to match.

### 5.5 Inspector, connections and source

Inspector tabs for a selected node:
- **Overview:** kind, path (copyable), LOC, complexity, in/out degree, risk with its contributing factors, parse errors if any, findings touching this node.
- **Connections:** two lists, "Depends on (N)" and "Used by (N)", grouped by relationship type. Each row shows the line number where the edge originates and an inferred/ambiguous badge where relevant. Hovering a row highlights the edge; clicking navigates.
- **Code:** read-only viewer from `/files/content`, scrolled and highlighted to `line_start–line_end`, with line numbers. Edge rows deep-link to `line_number`.

### 5.6 Verified vs inferred vs warning (requires patch item A)

| Relationship | Source of truth | Rendering | Inspector badge |
|---|---|---|---|
| `contains`, `inherits_from`, `imports` resolved by path | Parser + path resolution | Solid line | none |
| `calls` with `resolution=unique_name` | Name match, one candidate | **Dashed** | "Inferred (name match)" |
| `calls` with `resolution=ambiguous_name` | Name match, several candidates | **Dotted amber** | "Ambiguous: N candidates" |
| Edge in an import cycle | `analysis.circular_dependencies` | Thick red solid + arrow | "Part of cycle" → link to finding |

The legend always shows these four line styles. A "Confidence" filter lets users hide inferred edges.

### 5.7 Edge-case states

| State | What the user sees |
|---|---|
| Analysis running | Canvas skeleton + stepper; sidebar disabled with "Available when analysis finishes". |
| Analysis failed | Error message from `status_message` + Retry + Remove. Nothing else. |
| Empty graph (0 supported files) | "No Python or TypeScript files found." List supported extensions and excluded folders (`excluded_patterns`) + "Import another project". |
| Parse errors in some files | Status-bar warning "3 files had parse errors"; affected files get a warning ring and the errors appear in Overview. Analysis continues. |
| No search results | "No files or symbols match 'foo'." + "Search is limited to the current filters. [Clear filters]". |
| Filters hide everything | Canvas message with the active chips and "Clear filters". |
| Truncated graph | Status bar: "Showing 800 of 3,214 · functions hidden" + "Load symbols for selection". |
| Lost / confusing view | ⟲ **Reset view** (fit + clear selection + clear focus) is always visible, and `Esc` steps back one level. Breadcrumb history supports Back. |

---

## 6. AI assistant interaction design

### 6.1 Principles

1. **Every answer states what it is based on:** which sources were retrieved, whether an AI model generated the answer (`answer_source`), and whether the evidence was sufficient.
2. **Claims are typed.** The UI renders them as distinct, labeled blocks, so a suggestion never looks like a fact.
3. **Actions and test results are reported only from system state, never from model text.** If the model says "tests pass" but `test_validation_status` is `not_run`, the UI shows `Not run`.
4. **Context is visible.** The focused node is a removable chip on the composer ("About: `auth/jwt.py`").

### 6.2 Response structure

Ask the model to return sections with fixed headings. The UI parses them into blocks; if parsing fails, render plain markdown under an "Unstructured answer" label.

| Block | Meaning | Visual |
|---|---|---|
| **Verified** | Directly observable in a cited snippet. Each bullet carries a `[path:a-b]` citation. | Green left bar, `ShieldCheck` icon |
| **Inferred** | Reasoning across snippets, not directly visible. | Blue left bar, `GitBranch` icon |
| **Suggestion** | Recommended change or next step. | Violet left bar, `Lightbulb` icon |
| **Unknown** | What the indexed context cannot answer, and what would answer it. | Amber left bar, `HelpCircle` icon |
| **Executed** *(system-generated)* | Actions the backend performed (proposal created, file written, branch created). | Accent bar; comes from API responses only |
| **Tests** *(system-generated)* | `test_validation_status` + output excerpt + *what code the tests ran against*. | `StatusBadge`; never from model text |

Citation chips (`auth/jwt.py:12–30`) open the Code tab at those lines and pulse the node in the graph. A citation the model invents (path not in the graph) is shown struck through with "Not found in index".

**Suggested system-prompt addition** (for `ai/rag.py`, owner Anti-Gravity):

```
Structure every answer with these headings, omitting empty ones:
## Verified   — facts visible in the provided snippets; end each bullet with [path:start-end]
## Inferred   — conclusions drawn across snippets; say which snippets
## Suggestion — optional recommendations
## Unknown    — what the provided context does not show, and which file or symbol would answer it
Never state that code was run, changed, or tested.
```

### 6.3 Example: "Explain the auth module"

(Written against the real `sample_python` fixture.)

> **About:** `auth/` · **Sources searched:** 4 · **Model:** gemini · ● Grounded
>
> **Verified**
> - `verify_token` accepts any token that is at least 5 characters long and starts with `token_for_`. `[auth/jwt.py:12–15]`
> - `create_access_token` builds the token from the user's name via `get_user_by_id`. `[auth/jwt.py:8–10]`
> - `UserManager.authenticate` returns user `u1` when `verify_token` passes, otherwise `None`. `[auth/user.py:9–12]`
> - `jwt.py` and `user.py` import each other, which is a circular import. `[auth/jwt.py:4]` `[auth/user.py:2]`
>
> **Inferred**
> - Tokens are not signed, so a client could forge one by sending `token_for_<anything>` (from the two `jwt.py` snippets above).
>
> **Unknown**
> - `SECRET_KEY` is defined at `auth/jwt.py:6`, but none of the retrieved snippets use it. Whether any other code uses it can't be confirmed from this context.
>
> *[Show impact of jwt.py] [View cycle finding] [Open auth/jwt.py]*

### 6.4 Patterns by task

| Task | Entry point | Behavior |
|---|---|---|
| Explain a module | Inspector "Ask" on a directory/file | Pre-filled prompt; focus chip = node; answer + "Highlight cited nodes" toggle that lights them in the graph. |
| Trace a request | Assistant suggestion chip "Trace a request from…" | Answer includes an ordered **path** (A → B → C). The UI draws it as a highlighted path in the graph; each hop says verified (edge exists) or inferred (model claim with no edge). |
| Investigate a bug | "Ask" with a pasted error/stack trace | Map stack frames to nodes and show them as citations. Answer must include **Unknown** if no frame resolves. |
| Change impact | Inspector "Impact" (not chat) | Deterministic `/impact` panel first: dependents, blast radius, likely tests. Then optional "Explain this impact" asks the AI about that result. Data first, narrative second. |
| Suggest a refactor | Finding → "Propose fix" or inspector "Propose change" | Opens the **Changes** flow, not a chat reply. Instruction field pre-filled from the finding's recommendation. |
| Review a diff | Changes → proposal | Side-by-side or unified diff, explanation, impact of the touched file, test status, then **Apply to branch / Discard**. |
| Inspect test results | Tests block | Status, command run, what code the tests ran against, collapsible output. "Passed" is never shown in green unless it ran against the proposed code. |

### 6.5 Proposal review screen (Changes)

```
Refactor jwt.py: extract token expiry constant          ● Proposed · AI-generated, not verified
──────────────────────────────────────────────────────────────────────────────
Why           AI explanation (Suggestion block)
Impact        jwt.py is used by 3 files · blast radius 5 · likely tests: tests/test_auth.py
Diff          [Unified|Split]   +6 −2   (syntax highlighted)
Tests         ○ Not run: test runner disabled (ENABLE_TEST_RUNNER=false)
──────────────────────────────────────────────────────────────────────────────
[Discard]                         [Copy patch]   [Apply to new branch…] (confirm dialog)
```

- **Apply** always goes through a confirmation that names the exact file, target directory and branch. For a `local_folder` project it states: "This writes to your working copy at `<path>`."
- **Copy patch** is always available. It is the safest action and suits cautious users.
- After apply, the **Executed** block lists only what the API confirmed (file written, branch created or "branch not created: not a git repo").

---

## 7. Changes suitable for immediate implementation

### Backend (patch provided: `proposed-backend-fixes.patch`, verified to apply cleanly)

| ID | Change | Files | Verified |
|---|---|---|---|
| A | Map scope-qualified caller names to node IDs so method/async calls are kept. Tag call edges with `resolution` + `candidate_count`. Tag imports `resolution: import_path`. | `graph/builder.py` | Synthetic case: 3/3 call edges vs 1/3. `sample_python`: 8 call edges vs 6, restoring `UserManager.authenticate → verify_token` and `CoreEngine.__init__ → UserManager` |
| B | Refuse refactor proposals without a real LLM provider or with no change. Refuse apply if the file changed since the proposal (→ 409). Report `git_branch` only when git succeeded. | `ai/refactor.py`, `routes/refactor.py` | Code-reviewed; existing tests unaffected (they don't cover refactor) |
| C | Add `ChatResponse.answer_source`; mark fallback/no-citation answers `insufficient_evidence`. | `models/chat.py`, `ai/rag.py` | Code-reviewed |
| D | Import `Tuple` so the backend starts on Python < 3.14. | `graph/algorithms.py` | Root cause reproduced on 3.11/3.12 |

The patch was generated against a snapshot. Since then, Anti-Gravity/Codex changed one line in `ai/refactor.py` (`_run_tests` return annotation); that line doesn't overlap the patch, and `git apply --check` still passes.

Apply: `git apply docs/product-review/proposed-backend-fixes.patch`, then `pytest backend/tests`. Recommended new tests (Codex): method-call edge retained; refactor propose returns 400 with the fallback provider; apply returns 409 on a stale file.

### Frontend: Slice 1 (the minimum journey from §3.3)

Suggested structure (names are proposals; adapt to Anti-Gravity's conventions):

```
src/
  styles/tokens.css               ← provided
  api/client.ts                   typed fetch wrapper; base URL from VITE_API_URL
  api/types.ts                    mirrors backend models (Project, CodeGraph, GraphNode, GraphEdge, ChatResponse, …)
  app/AppShell.tsx                top bar + rail + sidebar + canvas + right column + status bar
  features/projects/ProjectsPage.tsx, ImportDropzone.tsx, AnalysisProgress.tsx
  features/explore/GraphCanvas.tsx, GraphToolbar.tsx, GraphLegend.tsx, FilterPanel.tsx, FileTree.tsx
  features/inspector/Inspector.tsx, ConnectionsList.tsx, CodeViewer.tsx
  features/assistant/AssistantPanel.tsx, AnswerBlocks.tsx, CitationChip.tsx
  features/search/CommandPalette.tsx
  components/StatusBadge.tsx, EmptyState.tsx, Chip.tsx
```

Ordered by value:
1. Replace the scaffold: import `tokens.css`, set `<title>Codebase Universe AI</title>`, delete `App.css` / hero / logos.
2. `ProjectsPage` with sample cards + ZIP drop. `AnalysisProgress` polling `GET /api/projects/{id}` every 1s until `ready`/`failed`.
3. `GraphCanvas` 2D at file level + `Inspector` (Overview/Connections/Code). Drop edges whose endpoints are missing.
4. `CommandPalette` client-side search.
5. `AssistantPanel` with focus chip, citation chips and the `answer_source` banner.
6. Impact panel from `/impact` with "likely tests" wording.
7. Changes flow (only after patch B or equivalent lands).

### Small copy changes (backend strings, any owner)

| Current | Proposed |
|---|---|
| "Extracting AST and symbols..." | "Parsing source files" |
| "Constructing celestial dependency graph..." | "Building dependency graph" |
| "Running static quality and risk heuristics..." | "Running quality checks" |
| "Analysis complete. Universe navigable." | "Ready" |
| `risk_assessment: "CRITICAL / HIGH BLAST RADIUS"` | enum `high \| moderate \| low` + count; UI writes "High impact: 17 components depend on this" |

---

## 8. README & portfolio presentation

There is no root README. `README.draft.md` in this folder is a complete proposal: introduction, problem, features (each marked **Available / Partial / Planned**), architecture diagram, setup, configuration, a five-minute demo script, screenshot shot-list and honest limitations.

Positioning guidance:
- **Claim the engineering, not novelty.** Code-graph visualization and code-aware chat both exist (Sourcegraph, CodeSee, IDE dependency views). The defensible story is the **combination and the honesty model**: a deterministic graph and impact analysis, AI answers that separate verified from inferred, and a change flow that reports only executed facts.
- Lead with one GIF: select file → impact highlights → ask → cited answer → proposal diff.
- State limitations plainly (name-based call resolution, Python + TS only, heuristic health score, test runner disabled by default). Reviewers trust a project more when it states its limits.
- Include a "Design decisions" section (2D default, evidence typing, why apply needs confirmation). This is what makes it read as a senior portfolio piece.

---

## 9. Integration notes for Anti-Gravity

1. **Decide before building the Changes UI:**
   (a) Should `apply` ever write to a `local_folder` source in place, or always to a copy/branch the user then pulls? Recommendation: **copy + downloadable patch** by default, in-place write behind an explicit setting.
   (b) Should tests run **after** applying to a temporary copy (true validation)? Recommendation: yes, in a temp copy of the repo, still behind `ENABLE_TEST_RUNNER`. Until then, label results "before change".
2. **Node ID scheme (P0-7):** fix before the frontend keys anything on IDs. Proposed: `method:{file}:{Class.method}`, `function:{file}:{outer.inner}`.
3. **Expose to the frontend:** `edge_types` and `directory` graph params. Add to `/api/health` a boolean `ai_available` (true only when a real provider is configured) and `test_runner_enabled`. The UI needs these to disable actions honestly.
4. **Contract hygiene:** drop body `project_id` from `ChatRequest`/`RefactorRequest`; return `risk_level` as an enum; consider a `GET …/graph/search?q=` ranked endpoint for repos too large to load in full.
5. **Chat:** send recent history; add the structured headings from §6.2 to `SYSTEM_PROMPT`.
6. **Concurrency observed:** `backend/app/config.py` was mid-edit during this review (an `IndentationError` at one point), and Codex was adding tests. I edited no existing files.
7. **Git:** the repo has no commits. I did **not** create `claude/product-review`: on an unborn branch that would move the shared `HEAD`, and the next commit by anyone would land on it. Once there's an initial commit on `main`, these files can be committed on that branch.
8. **Security items to route to Codex** (outside this review's scope but they affect UX copy): `files/content` and refactor use `str.startswith` for path containment (prefix-sibling bypass; the ZIP extractor already has a test for this exact pattern); `local_path` accepts any server path; CORS `*` with credentials.

---

## 10. Remaining design risks

| Risk | Why it matters | Mitigation |
|---|---|---|
| 3D becomes the default because it demos well | Readability, a11y and performance regress for real work | 2D default; 3D is a toggle; a usability test task must be done in 2D |
| Inferred call edges look authoritative | Users trust wrong impact results | Line-style encoding + legend + Confidence filter (§5.6) |
| Name-based call resolution on large repos | Ambiguous edges multiply (e.g. `get`, `run`) and create hairballs | Hide `ambiguous_name` edges by default above N candidates; show count in inspector |
| The template fallback is mistaken for AI | Damages trust in all answers | `answer_source` banner, and disable propose without a provider |
| Health score treated as a grade | Arbitrary weights invite argument | Always show the breakdown; label it a heuristic |
| Graph performance > ~3k nodes | Server cap is 3000; layout cost grows | Progressive disclosure; WebGL renderer; server search |
| Accessibility of a canvas | Screen readers can't read a canvas | Connections lists and file tree are the accessible equivalents; keyboard map §5.3; visible focus |
| AI provider data flow | Source snippets go to a third-party API when a key is set | Show on the composer which provider receives the code ("Sent to: Gemini"); offer Ollama for fully local use; document it in the README. Under GDPR / ISO 27001 this needs a data-processing note before any organizational use. |

### Usability acceptance criteria (measurable)

Run with 5 developers new to the project, using the sample Python repo, without a tutorial:

| Task | Target |
|---|---|
| Load a sample and reach the graph | ≤ 30 s, 5/5 succeed |
| Find which files import `auth/jwt.py` | ≤ 45 s, ≥ 4/5 |
| Ask a question and open a cited line | ≤ 60 s, ≥ 4/5 |
| Say whether a given call edge is verified or inferred | ≥ 4/5 correct from the legend alone |
| Find the import cycle | ≤ 60 s, ≥ 4/5 |
| Review a proposal and say whether tests validated it | 5/5 correct (any wrong answer is a P0 copy bug) |
| Recover from "everything filtered out" | ≤ 10 s, 5/5 |

Product-quality gates: 0 duplicate node IDs; 0 edges with missing endpoints delivered to the renderer; time-to-interactive for the sample graph < 1.5 s; all text ≥ 4.5:1 contrast; every action reachable by keyboard.
