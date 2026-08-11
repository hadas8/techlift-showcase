# Open decisions

Everything still undecided, roughly in the order it needs deciding. Nothing
here blocks the Hebrew site, which is live and working.

Last updated: 05 August 2026.

---

## Before the pilot course starts

### 1. Whose GitHub account do students use?

**Not an organisation account.** Tested 5 August: repos under the work org
are created fine but AI Studio then refuses to publish. A brand-new unrelated
account works. The cause is the org restricting third-party applications —
normal security policy, not a misconfiguration — and only an org owner can
approve the Google AI Studio app.

(The AI Studio README vanishing from org repos is a red herring:
`food_left_googleAIStudio_app` has no README at all and publishes fine.)

So the remaining options: each student's own account, the instructor's, or a
dedicated non-org account created for the programme.

This decides what the instructor does on day one, so it can't wait. It also
decides how much control you keep: **the published app url lives on the
student's Google account**, so if a student deletes the app or loses the
account, that link dies. If the code is in an account you control, you can
re-publish it. If it's in the student's own GitHub, you can't.

Related and time-bound: **get every app onto a GitHub account you control
before the course ends**, while students are still reachable. Chasing them
afterwards is much harder.

Repos can be transferred to the organisation later, which keeps the "we own
the code" goal without fighting the app policy. **Untested: whether
transferring a repo breaks its published app url.** Worth trying on one
throwaway app before doing it to a cohort.

### 2. Who runs the sync?

The site only updates when someone runs the **Sync roster from Google Sheet**
workflow on GitHub. So either:

- instructors get access to the repo's Actions tab, or
- they ask your team each time, or
- a daily schedule is added back (three lines, noted in the README)

If instructors can't reach GitHub and nobody adds a schedule, their sheet
edits sit there unpublished.

### 3. Is `INSTRUCTOR.md` needed in Hebrew?

It's written in English. The instructors following it are likely more
comfortable in Hebrew, and it's a short document.

---

## Before showing parents or donors

### 4. ~~Headline numbers~~ — mostly settled

The strip of numbers across the top of the page is now driven by the sheet,
since the student count changes per course:

```
stat,12,תלמידים
stat,5,ימי קורס
stat,auto,אפליקציות
```

`5` days is fixed, `auto` counts the apps itself. **Still to do: add these
rows to the live Hebrew sheet with the real student count** — until then the
strip stays hidden.

### 5. ~~Which logo is the lightbulb?~~ — settled

It's **Techlift**, the team running the course. It sits in the footer strip
alongside עמותת בוגרי 8200 and הייטקזון.

Still open within this: **a per-course partner or customer logo.** The slot
exists — append to `partners` in the course file — and is deliberately empty
until a course actually has one.

### 6. Are the logos correct for a light background?

The three supplied logos are white knockout versions, made for dark slides.
They currently sit on a dark indigo band at the foot of the page, which works.

If colour or dark versions exist, a light footer would look better.

### 7. Is there a programme font?

The page uses **Rubik**, matching the SummerTech recap site. The deck says
Calibri, but that's the untouched PowerPoint default rather than a choice.

### 8. Feedback from the review

The Hebrew page was submitted for review. Whatever comes back lands here.

---

## Before the second course

### 9. The Hebrew course's slug is `he`, which won't age well

Its url is `/he/` — a *language*, not a course. The moment there's a second
Hebrew cohort, that's ambiguous, and the next one would be at something like
`/autumn-2026/` while the first stays at `/he/`.

Renaming it changes a public url, so it's cheaper to do now than after the
link has been shared with parents. Something like `/spring-2026/` would be
consistent with everything that follows.

Same question for `en`.

### 10. The English page

Still on the neutral placeholder styling. Open within it:

- Does it get the brand theme? One field (`"theme": "brand"`) if so.
- Which logos, if any? You said the three Hebrew ones don't apply. English
  currently shows none.
- It has **no sheet registered** — its apps are hardcoded in
  `data/courses/spring-2026-en.json`. It needs its own sheet before an
  instructor can maintain it.

### 11. One site or two?

The sibling SummerTech site is a single page with a Hebrew/English toggle.
Yours is separate pages per language, which you chose deliberately because
international audiences never need the Hebrew.

Still right, in my view — just worth knowing you differ, if consistency
between the two sites ever gets judged.

---

## Housekeeping

### 12. The `repo` column does nothing

Instructors fill in a GitHub link that never appears on the site. Either add
a small "source code" link to each card, or drop the column. Kept for now by
choice.

### 13. ~~The Drive screenshot path is untested~~ — works

Proven 5 August on the `example` course: a Drive share link in the
`screenshot` column was downloaded, committed and is serving from the site.

### 14. ~~A stale GitHub variable~~ — done

`SHEET_CSV_URL` has been deleted from the repo settings.

### 15. Moving to the organisation accounts

Everything currently lives under the personal `hadas8` GitHub. The plan was
always to move once the process worked. All asset paths are relative, so the
site needs no code changes — but the urls change, and the sheet links and
Pages settings travel with it.

### 16. GitHub Actions deprecation warnings

Every workflow run warns that `checkout@v4`, `setup-node@v4`,
`upload-pages-artifact@v3` and `deploy-pages@v4` target Node 20, which GitHub
is retiring. Everything works today. At some point they want bumping to v5.

---

## Settled, for the record

- **Hosting:** GitHub Pages, free. No Cloud Run, no GCP, no billing.
- **AI in student apps:** the built-in fallback is acceptable; no API key
  anywhere, so no usage costs and nothing to monitor.
- **One spreadsheet per course**, not tabs — Sheets can't restrict viewing to
  a single tab.
- **Sync runs manually**, not on a schedule.
- **Cards embed apps in the page**, verified allowed; new tab on phones.
- **Screenshots are optional** — emoji tiles are the default and look finished.
