# Workshop showcase

Static showcase for apps built by students on the vibe-coding workshop.
One page per course, each in its own language, deployed to GitHub Pages.

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
