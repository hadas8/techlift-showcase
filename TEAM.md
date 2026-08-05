# Running the showcase — team guide

For whoever sets up courses and publishes the site. Instructors have their own
guide, [INSTRUCTOR.md](INSTRUCTOR.md), which only covers the spreadsheet.

Everything here can be done in a web browser. Nothing requires installing
anything, and none of it is really "coding" — it's editing a few short files
and pressing a button. There's a faster route using a terminal at the end, if
you have one.

---

## How it fits together

```
data/site-text.json          wording shared by every course
data/courses/<name>.json     cohort label + logos, one file per course
the course's Google Sheet    the apps, and the headline numbers
```

Two different things happen depending on what you change:

| You change | What you do | How long |
|---|---|---|
| A file in GitHub | nothing — it republishes itself | ~1 minute |
| The Google Sheet | run the **sync** (see below) | ~1 minute |

That's the one thing worth remembering: **sheet edits need the sync, repo
edits don't.**

---

## Starting a new course

### 1. Make the sheet

Download `data/course-template.csv` from the repo. In a blank Google Sheet:
**File → Import → Upload → Replace spreadsheet.**

Then:

- Set the real student count in the `stat` rows at the top
- Leave the row with `auto` alone — it counts the apps by itself
- Leave the example app row as it is; it's marked `hidden` so it won't
  publish. The instructor types over it.

### 2. Publish the sheet

**File → Share → Publish to web** → choose the tab → **Comma-separated values
(.csv)** → **Publish**.

Copy the url. It must end in `output=csv`. If you see `/edit` in it, that's
the wrong link — go back and pick the CSV option.

Publishing is once per sheet. Every later edit is picked up automatically; you
never re-publish.

> Publishing makes the sheet readable by anyone with that url. Keep it to
> what's going on the public site anyway — no private notes, nothing personal
> about students.

### 3. Tell the site about the course

Two small files. In GitHub, use **Add file → Create new file** and
**paste**.

**File one** — `data/courses/autumn-2026.json`, replacing the name and values:

```json
{
  "slug": "autumn-2026",
  "lang": "he",
  "theme": "brand",
  "cohort": "פלייטיקה, אוגוסט 2026",
  "partners": [
    { "file": "logo-8200-he.png", "name": "עמותת בוגרי 8200", "height": 74 },
    { "file": "logo-hitechzone.png", "name": "הייטקזון" },
    { "file": "logo-playtika.png", "name": "Playtika" }
  ]
}
```

- `slug` becomes the web address: `…/techlift-showcase/autumn-2026/`.
  Lowercase letters, numbers and hyphens only. **Pick carefully — changing it
  later changes the link you've already given people.**
- `cohort` is the small line above the headline.
- `partners` are the logos at the foot of the page. See *Changing logos*.
- Leave `lang` and `theme` as above for a Hebrew page.

**File two** — open `data/sheets.json` and click the pencil. **You are adding
one line.**

It currently looks like this:

```json
{
  "_comment": "One published CSV url per course. …",
  "he": "https://docs.google.com/…&output=csv"
}
```

After your edit:

```json
{
  "_comment": "One published CSV url per course. …",
  "he": "https://docs.google.com/…&output=csv",
  "autumn-2026": "https://docs.google.com/…&output=csv"
}
```

Note the **comma added to the end of the line above yours**. Every line needs
a comma except the last one.

If you get that wrong it's fine — a leftover comma on the last line is
tolerated, and anything genuinely broken is reported with the file and line
number, while the site carries on serving the previous version.

The slug here must match the `slug` in the course file exactly. If it doesn't,
the sync says so rather than quietly publishing nothing.

### 4. Publish

Run the sync (next section). The page appears once the sheet has at least one
app in it — a course with no apps yet is skipped rather than published empty,
so you can set all this up before the course starts.

### 5. Hand over to the instructor

Share with them:

- the Google Sheet (Editor access)
- a Drive folder for screenshots, shared **anyone with the link**
- [INSTRUCTOR.md](INSTRUCTOR.md)

---

## Publishing sheet changes — the sync

1. Go to the repo → **Actions** tab
2. **Sync roster from Google Sheet** in the left sidebar
3. **Run workflow** → **Run workflow**

Wait ~20 seconds and it turns green. A second job starts on its own to publish
the site; give it another ~20 seconds, then reload the page.

**"No roster change" is not a failure.** It means the sheet matches what's
already published.

### Reading the report

Click into a finished run for a summary of anything that needed attention:

- **Rows skipped** — with the reason. Usually an incomplete url, or a row
  missing a name.
- **Images** — screenshots that couldn't be fetched. Nearly always a Drive
  file that isn't shared with *anyone with the link*.
- **Link check** — apps whose url has stopped answering.

Instructors can't see this. If one of their apps didn't appear, look here and
tell them why — that's the loop.

**Dead links are reported, never removed.** A student's work vanishing from
the page without a word would be worse than a broken link, so the decision is
always yours.

---

## Changing the wording

`data/site-text.json`. One block per language, and it changes **every course
page in that language at once** — that's the point, so cohorts don't drift
into slightly different intros.

Click the pencil, edit the text between the quotes, commit. The site
republishes itself in about a minute.

Wrapping a phrase in `**double asterisks**` gives it the yellow highlight in
the headline.

Careful with the punctuation around your text: the quotes, commas and braces
have to stay exactly as they are. If something breaks, the site keeps serving
the previous version and the Actions tab shows a red run.

---

## Changing logos

Logos live in `public/brand/`. Each course lists the ones it uses.

**To reuse an existing logo**, add it to `partners` in the course file:

```json
{ "file": "logo-playtika.png", "name": "Playtika" }
```

`name` is what a screen reader announces and what shows if the image fails, so
write the real organisation name.

**To add a new logo**, first upload the file: go to `public/brand/` in GitHub
→ **Add file → Upload files**. Then reference the filename.

Three things to get right:

1. **It must be the version for dark backgrounds** — white or "reverse",
   because the strip is dark indigo. A normal dark-on-white logo will be
   invisible.
2. **Transparent background.** Brand kits often show reverse logos on a grey
   swatch; that grey will show as a rectangle on the page.
3. **Ask for SVG** if they have it. Otherwise PNG is fine.

Add `"height": 74` to an entry if a logo needs to be bigger or smaller than
the others. Stacked logos — a symbol with the name underneath — need more
height before their text is readable. Wide wordmarks need less.

A logo whose file is missing is skipped with a warning rather than showing as
a broken image, so a typo is visible in the Actions report and not on the
page.

---

## Quick answers

**Hide an app immediately.** Tick `hidden` in the sheet, run the sync. About a
minute.

**An app link has died.** The student's published app lives on their Google
account, so if they delete it you can't fix it there. If the code is on a
GitHub account you control, it can be re-published. Otherwise tick `hidden`.

**Change a cohort label.** The course file, not the sheet.

**Check something before showing it to anyone.** Open the page on a phone as
well as a computer, and click into an app to see it open properly.

---

## Worth staying on top of

**Get every student app onto a GitHub account you control before the course
ends.** The published link belongs to the student's Google account. With the
code in your GitHub it can be re-published; without it the link dies with the
account. This is the one thing with a deadline, and chasing students after the
course is much harder.

**Pick slugs you can live with.** They're public web addresses. `spring-2026`
ages better than `he`.

**Don't edit** `build.mjs`, anything in `scripts/` or `src/`, or the workflow
files, unless you know what you're doing. Everything above is data.

---

## The faster route

With Node installed and the repo cloned, step 3 is one command:

```bash
npm run new-course -- --slug=autumn-2026 --cohort="פלייטיקה, אוגוסט 2026" \
  --url="https://…&output=csv"
```

It writes both files, copies the logos from an existing course in the same
language, and tells you what to do next. Then commit and push.

```bash
npm run sync     # pull the sheets, same as the Actions button
npm run build    # build the site into dist/
npm run serve    # build, then open it locally to look at
```
