# Workshop showcase

Static showcase for apps built by students on the vibe-coding workshop.
One page per course, each in its own language, deployed to GitHub Pages.

## Where the content comes from

**One spreadsheet per course.** Sheets cannot show one person only one tab —
"protect sheet" restricts editing, not viewing — so a separate file per
course is the only way to give an instructor their own cohort without
handing them everybody else's.

`data/sheets.json` maps each course slug to its published CSV url:

```json
{
  "he": "https://docs.google.com/…&output=csv",
  "autumn-2026-he": "https://docs.google.com/…&output=csv"
}
```

Editing a sheet does **not** change the site on its own. Someone runs the
**Sync roster from Google Sheet** workflow from the Actions tab; that reads
the sheets and writes `data/sheet-data.json` into the repo, which triggers a
rebuild.

The site is built from **that file**, never from the sheets directly — so a
visitor loading the page never waits on Google, and an unshared or broken
sheet cannot blank the showcase.

A sheet that fails only affects its own course; the others sync normally and
the failed course keeps the data from its last good run. Every sheet failing
is treated as systemic and nothing is overwritten at all.

If a course has no sheet rows, its apps fall back to whatever is listed in
its own JSON file — which is why the repo builds on a fresh clone with no
sheets configured at all.

### Who edits what

| What | Where | Who | How often |
|---|---|---|---|
| App rows, descriptions | the course's Google Sheet | instructor | constantly |
| Headline numbers (`stat`) | the course's Google Sheet | instructor | once per course |
| Cohort label, partner logos | `data/courses/<slug>.json` | the team | once per course |
| All other page wording | `data/site-text.json` | the team | rarely, and it changes every page at once |

The sheet reads **only** app rows and `stat` rows. Any other settings row is
ignored and reported in the workflow summary, so someone typing `title` into
the sheet finds out rather than wondering why nothing happened.

The three layers merge in this order, each overriding the one before:

```
data/site-text.json  →  data/courses/<slug>.json  →  the sheet
```

### What each sheet holds

Two blocks in one tab. `stat` rows at the top, then the app table. The app
table is found automatically — it starts at the first row with `name` and
`url` headings.

`stat` rows are the exception to the usual `key, value` shape: they take a
third column for the label, and there can be as many as you like.

```
stat,12,תלמידים
stat,5,ימי קורס
stat,auto,אפליקציות
```

They render as a strip of cards lapping over the bottom of the hero. A value
of `auto` is replaced by the number of apps on the page, so it can't go stale
as rows are added. Fewer than two `stat` rows and the strip is hidden — one
card alone looks like something failed to load.

### Per-course settings

`data/courses/<slug>.json` — the two fields that normally change:

```jsonc
{
  "slug": "spring-2026",
  "lang": "he",
  "theme": "brand",

  "cohort": "מחזור אביב 2026",          // label above the headline

  "partners": [                          // logos in the strip at the foot
    { "file": "logo-techlift.png",   "name": "Techlift" },
    { "file": "logo-8200.png",       "name": "עמותת בוגרי 8200" },
    { "file": "logo-hitechzone.png", "name": "הייטקזון" }
  ]
}
```

Logo files live in `public/brand/`. Add a course's own partner or customer by
appending to the list; the strip grows to fit. The supplied logos are white
knockouts, which is why that strip is dark — a coloured logo would need it
rethinking.

### Shared wording

`data/site-text.json`, one block per language. Editing it changes every
course page in that language at once, which is the point — five cohorts
should not drift into five slightly different intros.

`**text**` gets the yellow highlight in the headline.

**App table** — one row per app. Headings are matched case-insensitively,
column order doesn't matter, unknown columns are ignored.

| Column | Required | Notes |
|---|---|---|
| `name` | **yes** | |
| `url` | **yes** | A complete address, e.g. `https://example.com/`. A bare `https://` is rejected. |
| `description` | | |
| `author` | | Shown under the app name |
| `repo` | | |
| `tags` | | Separate with `\|` or `,` |
| `icon` | | One emoji. Falls back to the first letter of the name. |
| `screenshot` | | A Google Drive share link, any public image url, or the filename of an image already in `public/screenshots/`. See below. |
| `hidden` | | Keeps a row out of the site — use it to stage an app before it's ready |
| `no-embed` | | Card opens the app in a new tab instead of embedding it |

For the last two, any of `yes`, `y`, `true`, `1`, `כן`, `v`, `✓`, `✔`, `√`
counts as yes; blank or anything else counts as no. `x` deliberately does
**not** count, because people use it for both "tick this" and "not this".

The least ambiguous option is a real checkbox — select the cells and use
**Insert → Checkbox**. Those export as `TRUE`/`FALSE`, which is handled.

### Screenshots

Put the image in the Drive folder next to the sheet, right-click → **Share →
Copy link**, and paste that link into the `screenshot` column. The image must
be shared with **anyone with the link**; a folder shared that way passes the
setting on to everything inside it, so this is usually a one-time change.

The sync downloads the image and commits it to `public/screenshots/`. The
site serves it from there — it is never hotlinked from Drive, which Google
throttles and which would make every page load depend on Drive answering.

Each image is downloaded once. Repeat runs see the file already present and
skip it, so nothing re-downloads and no pointless commits appear.

Also accepted in that column: any public image url, or the bare filename of
an image already committed to `public/screenshots/`.

If an image can't be fetched the card simply keeps its emoji tile and the
reason is listed in the workflow summary — a missing screenshot never breaks
a card. By far the most common reason is a Drive file that isn't
link-shared, which the summary calls out by name.

Images over 8MB are skipped; anything over 1.5MB is accepted with a warning
that it should be shrunk. Somewhere around 1440×900 is plenty — they display
at 16:10.

## Starting a new course

1. **Make the sheet.** Import `data/course-template.csv` into a blank
   spreadsheet (File → Import → Upload → *Replace spreadsheet*). It has the
   `stat` rows and the app headings already laid out. Set the real student
   count.

   The one example app row is marked `hidden`, so it demonstrates the shape of
   a row without publishing anything. Type over it or delete it.
2. **Publish it.** File → Share → **Publish to web**, pick the tab, choose
   **Comma-separated values (.csv)**, Publish. Copy the url — it ends in
   `output=csv`.
3. **Create the course:**

   ```bash
   npm run new-course -- --slug=autumn-2026 --cohort="מחזור סתיו 2026"      --url="https://…&output=csv"
   ```

   That writes `data/courses/autumn-2026.json` and registers the sheet in
   `data/sheets.json`. Partner logos are copied from an existing course in the
   same language — **check they're right for this course**. Add `--lang=en`
   for an English page.

   Doing it by hand means creating both, and a course registered in one but
   not the other fails quietly — hence the command.

4. Commit, push, then run the **Sync roster from Google Sheet** workflow.
5. Share the sheet and the Drive screenshot folder with the instructor, along
   with [INSTRUCTOR.md](INSTRUCTOR.md).

The page appears at `/autumn-2026/` once the sheet has at least one app in it.
A course with no apps yet is skipped rather than published empty.

Publishing makes that sheet readable by anyone with the url, so keep its
contents to what is going on the public site anyway — no private notes, no
personal details about students.

For local work, a plain `.csv` path works anywhere a url does, so a
downloaded sheet can be tested without publishing. `SHEET_CSV_URL=path.csv`
overrides every source at once, which is handy for trying a layout out.

### Running and troubleshooting the sync

```bash
npm run sync      # pull every sheet, write data/sheet-data.json
```

It prints a line per rejected row explaining why. It refuses to write an
empty roster, and a sheet that fails leaves its own course data untouched and
exits non-zero.

It also checks that every app url still answers, and lists any that don't in
the workflow summary. Dead links are reported, never removed — a student's
app disappearing from the page without a word is worse than a broken link.

The **Sync roster from Google Sheet** workflow runs only when someone starts
it from the Actions tab. When anything changed it commits
`data/sheet-data.json`, which triggers the deploy; when nothing changed it
says so and stops.

There is no schedule on purpose. If you later want one — say, so instructors
who cannot reach GitHub still see their edits appear — add this back to
`.github/workflows/sync-sheet.yml`:

```yaml
  schedule:
    - cron: "0 5 * * *"   # daily, UTC
```

## Adding or changing a course

Each course is one file in `data/courses/`. The filename doesn't matter; the
`slug` inside it decides the URL.

```jsonc
{
  "slug": "he",              // page lives at /he/
  "lang": "he",              // "he" or "en" — sets the UI text and RTL/LTR
  "title": "…",
  "cohort": "…",             // small label above the title
  "intro": "…",
  "note": "…",               // footer disclaimer
  "apps": [
    {
      "name": "…",
      "description": "…",
      "author": "…",
      "url": "https://…",        // the published app
      "repo": "https://…",       // optional
      "tags": ["…"],
      "screenshot": "name.png",  // optional, see below
      "embeddable": true         // set false to always open in a new tab
    }
  ]
}
```

Copy an existing file to start a new course. Nothing else needs changing.

## Screenshots

Drop images into `public/screenshots/` and reference the filename in the
course file. Anything around 1440×900 works; they're displayed at 16:10.

An app with no screenshot gets a coloured tile with its initial, so the grid
still looks deliberate while you're waiting for images. The build prints a
warning listing which apps are still missing one.

## Running it locally

```bash
npm run build     # writes dist/
npm run serve     # builds, then serves dist/ so you can click around
```

There are no dependencies to install — the build is a single Node script.

## Deploying

Pushing to `main` builds and publishes automatically. Repo Settings → Pages
must have **Source: GitHub Actions**.

All asset paths are relative, so the site works unchanged whether it's served
from `user.github.io/repo/` or a custom domain — moving it between accounts
needs no edits.

## How apps open

Clicking a card opens the app embedded in the page, one at a time. The iframe
is only loaded on open, so no app boots until someone asks for it.

On screens narrower than 700px, and for any app marked
`"embeddable": false`, the card opens the app in a new tab instead — an app
embedded inside a phone screen is a window inside a window.
