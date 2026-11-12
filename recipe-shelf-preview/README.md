# Recipes: Reading Corner (local prototype)

**Business: Eclectic Transformation.** This is not NEM. No Not Everything Matters content, branding or files are used here.

The shelf is organized in three levels: **Category → Book → Recipe**. A recipe is at most three taps away.

Categories, in this order: (1) **Teas** — *Simple brews for slowing down* (coming soon). (2) **Cooking** — *Pots for the table and the freezer*. (3) **Herbalism** — *Dried plants and simple blends* (coming soon). (4) **Tinctures** — *Extracts to keep on the shelf* (coming soon). (5) **Cocktails & Mocktails** — *Drinks for gathering, with or without alcohol* (coming soon). More categories can be added later as JSON entries.

Books right now: **Cooking** holds (1) **Untitled big-batch book** (working title): chilis, stews & soups, vegan and non-vegan, that taste better after freezing and thawing, with 3 example recipes (2 vegan); and (2) **Everyday Small Pots** (working title, coming soon): normal meals for 2–4, with 1 example sneak-peek recipe (serves 2). **Broths, Teas & Tonics** (working title, coming soon) lives under **Teas** (moved there from Cooking, because it is warm drinks in mugs and jars; one sneak-peek tea recipe was added so the category isn't empty). **Herbalism**, **Tinctures**, and **Cocktails & Mocktails** each have one placeholder book and one example recipe so the flow is visible.

Status: **local prototype only.** Nothing is on GitHub or Remixer yet. All books and recipes are **EXAMPLE** placeholders. There are no approved recipes yet.

## What's here
```
index.html          the page (hash routes below)
css/style.css       ET look: Fraunces + DM Sans, forest #2F4A3A / cream #F6F1E7 / clay #B7795A, plus print styles
js/app.js           rendering, portion scaling, pantry checklist, share/copy/email/PDF, save-for-later, JSON-LD, Surprise me (plain JS, no build, no CDNs)
fonts/              self-hosted Fraunces + DM Sans (SIL Open Font License)
data/recipes.json   THE ONLY CONTENT FILE: categories[] + books[] + recipes[]
screens/            headless-Chrome screenshots + print PDF
test_shots.py       Playwright test + screenshot script
```
To run it locally: `cd /workspace/et-recipes && python3 -m http.server 8833`, then open http://127.0.0.1:8833/. It needs a server because `fetch` won't read files over `file://`.

### Hash routes
Preferred: `#/` (categories) · `#/c/<categoryId>` (that category's books) · `#/b/<bookId>` · `#/r/<slug>[/half|/quarter|/double]` · `#/saved`

Older links still work: `#/book/<id>` and `#/recipe/<slug>[/portion]`.

## Data model (data/recipes.json)
Top level: `showExamples` (bool), `categories[]`, `books[]`, `recipes[]`, `comingSoonTitles{slug: title}` (named future recipes that related links can mention before they exist).

**Example content:** every placeholder has `"example": true` and only renders while `showExamples` is `true`. To strip the examples, delete every item that has `example: true` and set `showExamples: false`.

### Category
A new category is just one object in `categories[]` plus any books that point at it. There are no sub-categories.

| field | notes |
|---|---|
| `id` | url id, e.g. `cooking`, used in `#/c/cooking` |
| `name` | short literal name, shown on the card (`Teas`, `Cooking`, `Cocktails & Mocktails`) |
| `blurb` | one plain line under the name, e.g. `Simple brews for slowing down` |
| `icon` | key for a built-in SVG: `cup`, `pot`, `leaf`, `jar`, `herb`, `dropper`, `glass` |
| `order` | lower numbers first. Current order: Teas, Cooking, Herbalism, Tinctures, Cocktails & Mocktails |
| `comingSoon` | `true` shows a quiet "Coming soon" line on the card; the category is still clickable |

The landing layout is a roomy card grid that holds about 6–8 categories comfortably.

### Book
| field | notes |
|---|---|
| `id` | url id, e.g. `big-batch` |
| `categoryId` | must match a `categories[].id` |
| `title`, `subtitle`, `workingTitle` | `workingTitle: true` shows a "Working title" badge |
| `cover` | `{color, accent, art}`; art is `pot` / `leaf` / `jar` / `cup` / `herb` / `dropper` / `glass` (simple built-in SVGs) |
| `status` | `available-sample` or `coming-soon`. Coming-soon books stay on the shelf, styled quietly, and may include a sneak-peek recipe. |
| `sortOptions[]`, `defaultSort` | the sorts this book offers: `quarts-desc`, `quarts-asc`, `az`, `serves`, `serves-desc`, `time`. A big-batch/freezer book defaults to `quarts-desc`; an everyday book defaults to `az` with `["az","serves","time"]`. The sort menu hides when a book has fewer than 2 recipes. |
| `blurb`, `printTeaser` | teaser text. The PDF/print offer is one quiet line **on the book page only**, never on a recipe and never a pop-up, with no urgency or prices. |
| `sampleSlugs[]` | which recipes show inside the book (a coming-soon book may have a sneak-peek recipe) |
| `formats` | `{pdf:{available,url}, print:{available,url}}`. **Leave a format key out entirely if the book will never have it**, and no button shows for it. If the key is there with `available:false`, it shows a disabled "Coming soon" button. If it has `available:true` plus a `url`, it becomes a real link. No prices, checkout or email collection exist anywhere. |

### Recipe (matches Tom's draft format)
| field | Tom's Markdown → JSON |
|---|---|
| `slug`, `title` | `# Title`; slug = the draft filename |
| `book`, `section` | `Section:` line → `section`; `book` = the book id it belongs to |
| `yieldType` | `"quarts"` for big-batch recipes (card shows a **QT** badge, and serves is optional/secondary) or `"servings"` for normal recipes (card shows a **SERVES 2** badge). Only big-batch recipes are labeled by quarts. |
| `yield` | `{batchQuarts (null for servings recipes), basis, finishedQuarts (null until measured), servings (number, optional on quarts recipes), servingsUnit (e.g. "bowls", optional)}`; from Tom's `Batch this time:` / serves line |
| `portions[]` | optional override of the portion buttons. Defaults: quarts recipes get `full, half, quarter`; servings recipes get `double, full, half`. |
| `diet[]` | optional tags like `"vegan"`, shown as a badge (and schema.org `suitableForDiet` for vegan) |
| `time` | `{rough, totalMinutes}` (minutes only feed the schema.org totalTime) |
| `ingredients[]` | each `- ` line → `{amount (number or null), unit, item, itemSingular?, prep, optional, thisTime}`. Units the scaler understands: `tsp, tbsp, cup, quart, gallon, lb, oz`; anything else (`bag`, `can`, `bunch`, `clove`, `head`, or null) scales as a count. |
| `steps[]` | numbered steps → `{text, stove?:{electric, gas}}` |
| `notes[]` | "Bryan's notes" → `{kind: aside / substitution / sourcing, text}`, verbatim |
| `storage[]` | freezer / Mylar / canning notes (optional) |
| `shopping[]` | `{group: produce / meat / frozen / dairy-eggs / pantry / equipment, items:[{amount, unit, item, scale?}]}`. Equipment never scales. |
| `related[]` | slugs. If a slug isn't published yet but appears in `comingSoonTitles`, it shows as "coming soon". |
| `advisory` | optional quiet note under the facts. Herbal and tincture examples use: "Check with your doctor if pregnant, nursing, or on medication." |
| `adultsOnly` | optional; shows an "Adults only" badge. Use for any recipe that itself contains alcohol. The Cocktails & Mocktails example is a mocktail, so this is omitted; the adults-only variation is mentioned in a note instead. |
| `status` | only `"approved"` renders. Drafts never show. |
| `photo` | `null` or `{src, alt}` (alt text required) |
Not published: draft status, Tom's open questions to Bryan, and cursing unless Bryan OKs it for that recipe.

Content guardrails for example herbal, tincture, and drink recipes: no health or cure claims; herbal and tincture examples carry the advisory above; the drink example is the mocktail version first, and any alcohol is marked as adults only. Prefer glycerin or tea-based tincture examples over alcohol-based ones.

### Scaling rules
Double ×2, Full ×1, Half ×½, Quarter ×¼. Scaling applies to quarts **and** servings ("Serves 2" → Double "Serves 4" → Half "Serves 1"). Amounts round to kitchen fractions (1/8, 1/4, 1/3, 3/8, 1/2, 5/8, 2/3, 3/4, 7/8) and step down units when they get small. Gallon goes to quarts, quarts under 1 go to cups, cups under 1/4 go to tbsp, tbsp under 1 go to tsp, and lb under 1 goes to oz. Doubling steps up only when it reads cleanly (4 tbsp → 1/4 cup, 6 tsp → 2 tbsp). Cups never auto-convert to quarts. Tiny results show as "a pinch". Tested examples: 1 cup → 1/2 → 1/4 cup, 3 tbsp → 1 1/2 tbsp → 2 1/4 tsp, 1/2 cup ×¼ → 2 tbsp, and 3 lb ×¼ → 12 oz. The page always says amounts are "what I used this time" and that scaled amounts are rounded.

## Adding a recipe
1. Bryan approves Tom's draft, and Tom moves it to `/home/box/recipes/approved/<slug>.md`.
2. Convert it into one object in `recipes[]` using the mapping above, with `"status":"approved"` and no `example` flag.
3. Add its slug to the book's `sampleSlugs` if it should show inside that book.
4. Validate with `python3 -m json.tool data/recipes.json`, then run `python3 test_shots.py`.
No HTML or JS changes are needed.

## Adding a book
Add an object to `books[]` with a `categoryId`, `status: "coming-soon"`, and the `formats` it will have. When samples are ready, switch it to `available-sample` and fill in `sampleSlugs`. Coming-soon books stay visible on that category's shelf.

## Adding a category
Add an object to `categories[]` with `id`, `name`, a one-line `blurb`, `icon`, `order`, and `comingSoon`. Point books at it with `categoryId`. No page or script edits are needed. The landing grid is built for about 6–8 visible categories.

## Features
- Landing page of category cards (name + one line). Click a category to see its books, then a book to see its sample recipes.
- Quiet breadcrumbs (`Reading Corner › Teas › Book`) and a Back link at every level past home. Each recipe also has a "Back to [Book]" link at the bottom. The browser back button works, including after Surprise me.
- **Surprise me**: a quiet text action on the landing page (any recipe) and on a category (recipes in that category). It skips coming-soon books that have no recipes. The reveal is a soft fade of about half a second — no spinning, sound, confetti, counts or streaks. The result shows a plain "Try another" link when there's more than one recipe in the pool. With reduced motion, the jump is instant.
- Bookshelf with 3D covers, spines and page edges on a wooden plank, plus a quiet "Coming soon" ribbon. Coming-soon books stay on the shelf.
- A cover-opening animation, and an open-book spread whose page turns in. With reduced motion, you get instant navigation and no animation.
- Category page: that category's books, plus a "Sample recipes" list when it has any, sortable A–Z / fewest servings / quickest, plus "Most quarts" only when a big-batch recipe is in the list.
- Book spread: blurb, one quiet full-book line with PDF / hard copy buttons for the formats that book has (all disabled "Coming soon"), and contents sorted by that book's own `sortOptions`/`defaultSort`. A coming-soon book can show a "Sneak peek" recipe.
- Recipe page: the recipe comes first (title, summary, facts). Scaling and Save sit in one small toolbar as simple step buttons (not a text box). Big-batch recipes get Full / Half / Quarter; everyday recipes get Double / Full / Half (`aria-pressed`). A quiet text row under the toolbar offers Share recipe (native share sheet when the browser supports it, otherwise Copy link), Email recipe, and Save as PDF. Also: the "this time" note on intuitive books, electric vs. gas stove notes, storage, notes, related links with in-place save. The book PDF/print offer is not shown on recipe pages.
- Save for later: stored in `localStorage` (`et-recipes-saved-v1`) on the visitor's own device, with no account and no sign-up nag. Saved view, a count in the header, and a toast confirmation.
- Pantry checklist: each ingredient is a tappable "I have this" checkbox (44px row, accessible label). Checks are stored per recipe in `localStorage` (`et-recipes-have-v1`) on this device, and a quiet "Clear checks" link appears once something is ticked. Checks stay put when the portion is scaled.
- What I still need: a quiet panel under the ingredients builds a plain-text list of unchecked items at the current portion (title and portion, optional items marked "(optional)", grouped by the recipe's shopping groups when they match, and the recipe URL at the end). Actions: **Share** (only when `navigator.share` is available — on a phone this opens Notes, Messages or Mail), **Copy** (clipboard, with a fallback, and a "Copied" toast), **Email** (`mailto:` with subject `Shopping list: <title>` and the list as the URL-encoded body), and **Print list** (prints only that list). If every item is ticked, the panel just says "You've got everything!"
- Send the recipe: **Share recipe** uses the native share sheet with the title, a short line, and the URL (falls back to copying the link). **Email recipe** is a `mailto:` of the full recipe as plain text (ingredients, steps, storage, advisory — not notes, draft status, or cursing) plus the link. **Save as PDF** opens the browser print dialog; a toast says to choose "Save as PDF" there. The print stylesheet is a clean one- or two-page recipe at the chosen portion: tools, checkboxes, the still-need panel and the on-page shopping list are hidden, and every ingredient still prints.
- Privacy: no accounts, no email collection, and no server. Saved recipes and pantry checks never leave this browser. The only data that goes out is what the visitor chooses to share, copy, email or print.
- schema.org `Recipe` JSON-LD for the open recipe.
- Print stylesheet: just the recipe at the chosen portion, with nav, tools, checkboxes, teaser and related links hidden. A separate Print list mode prints only the still-need list.
- Accessibility: skip link, visible focus, focus moves to the heading on navigation, 44px tap targets (including pantry checkboxes), live region for the scaled list and the still-need count, reduced-motion support, forced-colors support, and AA text contrast.
- If embedded in an iframe, it posts `{type:"et-recipes-height"}` messages so the host can auto-size.

## Proposed go-live path (for Bryan's approval later, not done)
1. Create a new, separate public repo, **`eclectictransformation/et-recipes`**, and push this folder with GitHub Pages on `main` /root. URL: `https://eclectictransformation.github.io/et-recipes/`. Remove `test_shots.py`/`screens/` or keep them; they're harmless. Switch `<meta name="robots" content="noindex">` off only when Bryan wants it findable.
2. Strip the examples (or keep them hidden) once the first approved recipe is in.
3. Make **one small Remixer change**: add a "Recipes" card or button to the Reading Corner that links to the GitHub Pages URL. A **link (recommended)** keeps SEO/JSON-LD working, keeps print clean and gets the full screen on phones. An **iframe embed** is possible (the height message is already built in), but search engines don't credit JSON-LD inside iframes, and printing from an iframe is clunkier.
4. After that, every new recipe, book or category is a `recipes.json` commit, with no Remixer edits. A custom domain such as `recipes.eclectictransformation.com` is optional later (one DNS CNAME).

## Book style
Set `"style": "intuitive"` on a book to show the "Amounts are what I used this time / I cook by feel" note on its recipes. Books without it (exact recipes) show no such note; scaled amounts just get a short "rounded" note.
