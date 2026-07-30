# Workshop showcase

Static showcase for apps built by students on the vibe-coding workshop.
One page per course, each in its own language, deployed to GitHub Pages.

## Where the app list comes from

Two sources, on purpose:

| What | Lives in | Changes |
|---|---|---|
| Course chrome — title, intro, language, logos | `data/courses/*.json` | Rarely, by whoever runs the site |
| The apps themselves | A Google Sheet | Often, by instructors |

An automation reads the sheet a few times a day and writes `data/apps.json`
into the repo. The site is built from **that file**, never from the sheet
directly — so a visitor loading the page never waits on Google, and an
unshared or broken sheet cannot blank the showcase.

If the sheet has no rows for a course, that course falls back to the `apps`
listed in its own JSON file. That's also why the repo builds on a fresh clone
with no sheet configured at all.

### Sheet columns

One row per app. The header row is matched case-insensitively; column order
doesn't matter and unknown columns are ignored.

| Column | Required | Notes |
|---|---|---|
| `course` | **yes** | Must match a course `slug`, e.g. `he`. A row with no course belongs to no page and is skipped. |
| `name` | **yes** | |
| `url` | **yes** | Must start with `http://` or `https://` |
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

`data/sheet-template.csv` has these headers and two example rows. Import it
into a blank Sheet (File → Import) to start with the columns correct.

### Connecting the sheet

1. In Sheets: **File → Share → Publish to web**, pick the tab, choose
   **Comma-separated values (.csv)**, publish. Copy the url — it ends in
   `output=csv`.
2. In the repo: **Settings → Secrets and variables → Actions → Variables**,
   add `SHEET_CSV_URL` with that url.

Publishing makes the sheet's contents readable by anyone with that url, so
keep it to what's going on the public site anyway — no private notes,
no personal details about students.

For local work, `cp data/sheet.example.json data/sheet.json` and put the url
there instead; that file is gitignored. A local `.csv` path works too, which
is handy for testing without publishing anything.

### Running and troubleshooting the sync

```bash
npm run sync      # pull the sheet, write data/apps.json
```

It prints a line per rejected row explaining why. It refuses to write an
empty roster, and on any failure it leaves `data/apps.json` untouched and
exits non-zero.

It also checks that every app url still answers, and lists any that don't in
the workflow summary. Dead links are reported, never removed — a student's
app disappearing from the page without a word is worse than a broken link.

The **Sync roster from Google Sheet** workflow runs on a schedule and can be
triggered by hand from the Actions tab. When the roster changes it commits
`data/apps.json`, which triggers the deploy.

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
