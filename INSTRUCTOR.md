# Running a course showcase — instructor guide

You'll be given two things: a **Google Sheet** for your course, and a **Drive
folder** next to it for screenshots. Everything you do happens in those two
places. You don't need a GitHub account to fill in the sheet.

The showcase page is built from your sheet. It does **not** update by itself —
someone runs a sync when you're ready (see the last section).

---

## 1. Get each student's app onto GitHub

In Google AI Studio, each app has a **GitHub connector**. Connecting the app to
a GitHub repository does two things:

- keeps the code, so the app can be rebuilt or re-published later
- unlocks **Publish**, which otherwise asks for billing to be set up

So GitHub comes first, publishing second. An app that hasn't been pushed to
GitHub can't be published for free.

Which GitHub account to use — the student's own, yours, or the organisation's —
is being decided per course. Ask before starting.

## 2. Publish the app

With the repo connected, **Publish** in AI Studio gives a public url like
`https://service-1234.ai.studio/`.

## 3. Check the app actually works for an outsider

**Do this for every app before you add it to the sheet.**

Open the published url in a **private/incognito window**, signed out of Google.
Then:

- does the page load at all?
- does the main feature work — click through it, don't just look at it
- if it has an AI assistant, ask it something and check you get an answer

Why it matters: you are signed in as the person who built it, so things can
work for you and fail for everyone else. Parents and donors will open these
links cold. Two minutes here saves an awkward moment later.

Apps whose AI shows a "simulation" notice are fine — that's expected and
intentional.

## 4. Add the app to the sheet

One row per app.

| Column | What to put |
|---|---|
| `name` | The app's name |
| `description` | One sentence on what it does. Written for a parent, not a developer. |
| `author` | The student's name, as they want it shown |
| `url` | The published url from step 2 |
| `repo` | The GitHub link. Not shown on the site yet — fill it in for the record. |
| `tags` | One or two words each, separated by `\|` — e.g. `משחק \| חינוך` |
| `icon` | One emoji that suits the app |
| `screenshot` | Optional — see below |
| `hidden` | Tick to keep the row off the site — see below |
| `no-embed` | Tick if the app misbehaves when embedded |

At the very top of the sheet there are `key, value` rows for the page itself —
the headline, the class name or dates, the intro paragraph. Those are yours to
edit too.

Among them are the **headline numbers** shown across the top of the page.
These take a third column, for the label:

```
stat,12,תלמידים
stat,5,ימי קורס
stat,auto,אפליקציות
```

Put the real number of students in your cohort. Leave `auto` where it is —
that one counts the apps for you, so it stays right as you add rows.

## 5. Use `hidden` while you work

Tick `hidden` on any row that isn't ready — a student still fixing something,
or an app you haven't checked yet. The row stays in your sheet with everything
filled in; it just doesn't appear on the site.

Untick it when the app is ready. This is the safe way to work: add rows as you
go without worrying that a half-finished app is live.

A tick, `yes`, `v`, `✓` or `כן` all work. The most reliable option is a real
checkbox — select the cells and use **Insert → Checkbox**.

**Don't use `x`.** People mean opposite things by it, so it's ignored — a row
marked `x` will publish.

## 6. Screenshots (optional)

Cards look fine with just an emoji, so this is a nice-to-have.

Take a screenshot of the app, put it in the **Drive folder next to the sheet**,
then right-click it → **Share → Copy link**, and paste that link into the
`screenshot` column.

The image must be shared with **anyone with the link**. If the whole folder is
shared that way, everything you drop in it inherits the setting.

Landscape shots work best, around 1440×900. Keep them under about 1.5MB.

## 7. Ask for a sync

When your sheet is ready, tell whoever manages the site. They press one button
and the page updates about a minute later.

Nothing you type appears on the site until that happens — so you can edit
freely and ask for a sync when you're happy.

---

## Things worth knowing

**The published app lives on the student's Google account.** If they delete the
app or lose access to the account, the link dies. That's why step 1 matters:
with the code on GitHub, the app can be re-published. Get every app onto GitHub
**before the course ends**, while students are still around to help.

**Clicking a card opens the app inside the showcase page.** On phones, and for
anything marked `no-embed`, it opens in a new tab instead.

**Check your own page once it's live**, on a phone as well as a computer. You
know what the apps should do; nobody else reviewing it does.
