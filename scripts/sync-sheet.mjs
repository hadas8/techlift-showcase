// Pulls the app roster from a published Google Sheet into data/apps.json.
//
// Deliberately never writes a partial or empty result: if the fetch fails, or
// the sheet comes back with no usable rows, the existing apps.json is left
// alone and the script exits non-zero. A broken sheet must not be able to
// empty the showcase.
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { readJson } from './read-json.mjs';

const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')));
const CONFIG = path.join(ROOT, 'data', 'sheets.json');
const OUT = path.join(ROOT, 'data', 'sheet-data.json');
const SHOTS_DIR = path.join(ROOT, 'public', 'screenshots');

// The sheet controls the app rows and the headline numbers, and nothing else.
// Page wording is identical across courses and lives in data/site-text.json;
// the cohort label and logos change per course and live in the course file.
// Both are edited by the team, not by instructors.
//
// A `stat` row is handled separately — it takes a third column for the label.
//
// The instructor block is the exception to "the sheet only supplies apps":
// it's about the person running that specific course, so it belongs with
// them. Every field is optional — the block only appears if there's a name.
const SETTINGS = {
  instructorname: 'instructorName',
  instructorrole: 'instructorRole',
  instructorlinkedin: 'instructorLinkedin',
  instructorfacebook: 'instructorFacebook',
  instructorinstagram: 'instructorInstagram',
  instructoremail: 'instructorEmail',
};

/** Minimal but correct CSV reader: handles quoted fields, escaped quotes ("")
 *  and newlines inside quotes. Google's export uses all three. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
      continue;
    }

    if (c === '"') { quoted = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += c;
  }

  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

// Generous on purpose. A tick is the natural way to fill in a yes/no column,
// and treating "✓" as blank would publish a row the instructor believed was
// hidden — a silent failure in the worst direction. Sheets checkboxes export
// as TRUE/FALSE, hence those too.
//
// "x" is deliberately absent: people use it for both "tick this" and "not
// this", so honouring it would hide apps that were meant to be shown.
const YES = ['yes', 'y', 'true', '1', 'כן', 'v', '✓', '✔', '√'];
const truthy = (v) => YES.includes(String(v).trim().toLowerCase());

/** A course sheet is one tab holding two things: `key, value` rows of course
 *  settings at the top, then the app table. The app table starts at the first
 *  row that has both a `name` and a `url` cell, which is unambiguous enough
 *  to find without asking anyone to count rows. */
function split(rows) {
  const headerAt = rows.findIndex((r) => {
    const cells = r.map((c) => c.trim().toLowerCase());
    return cells.includes('name') && cells.includes('url');
  });

  if (headerAt === -1) {
    throw new Error(
      'could not find the app table — expected a row with "name" and "url" headings. ' +
      'Start from data/course-template.csv if the sheet was built by hand.'
    );
  }

  const settings = {};
  const stats = [];
  const ignored = [];

  for (const row of rows.slice(0, headerAt)) {
    const key = (row[0] || '').trim().toLowerCase().replace(/[\s_-]/g, '');
    const value = (row[1] || '').trim();
    if (!key || !value) continue;

    // `stat, 12, תלמידים` — a third column, and as many rows as wanted.
    if (key === 'stat') {
      const label = (row[2] || '').trim();
      if (label) stats.push({ value, label });
      continue;
    }

    if (SETTINGS[key]) settings[SETTINGS[key]] = value;
    // Say so rather than ignoring in silence: someone typing `title` into the
    // sheet needs to know the site is not going to read it.
    else ignored.push(key);
  }

  if (stats.length) settings.stats = stats;

  return { settings, stats, ignored, table: rows.slice(headerAt) };
}

/** Needs a real host, not just the right prefix: "https://" passes a prefix
 *  test and would publish a card pointing nowhere. */
function isRealUrl(value) {
  let u;
  try {
    u = new URL(value);
  } catch {
    return false;
  }
  return ['http:', 'https:'].includes(u.protocol) && u.hostname.includes('.');
}

function toApps(rows, defaultCourse) {
  const [header, ...body] = rows;
  const cols = header.map((h) => h.trim().toLowerCase());
  const at = (row, key) => {
    const i = cols.indexOf(key);
    return i === -1 ? '' : (row[i] || '').trim();
  };

  const apps = [];
  const problems = [];

  body.forEach((row, n) => {
    const line = n + 2; // 1-indexed, plus the header
    const name = at(row, 'name');
    const url = at(row, 'url');
    // A `course` column still wins if present, so one sheet can feed several
    // pages. Without it, every row belongs to the sheet's own course.
    const course = at(row, 'course') || defaultCourse;

    if (truthy(at(row, 'hidden'))) return;

    if (!name || !url) {
      problems.push(`row ${line}: skipped — needs both name and url`);
      return;
    }
    // Checking the prefix alone lets "https://" through, which is what the
    // template's example row contained — enough to publish an empty card.
    if (!isRealUrl(url)) {
      problems.push(`row ${line} (${name}): skipped — "${url}" is not a complete web address`);
      return;
    }
    if (!course) {
      problems.push(`row ${line} (${name}): skipped — no course, so it belongs to no page`);
      return;
    }

    const tags = at(row, 'tags')
      .split(/[|,]/)
      .map((t) => t.trim())
      .filter(Boolean);

    const app = { course, name, url };
    const description = at(row, 'description');
    const author = at(row, 'author');
    const repo = at(row, 'repo');
    const icon = at(row, 'icon');
    const screenshot = at(row, 'screenshot');

    if (description) app.description = description;
    if (author) app.author = author;
    if (repo) app.repo = repo;
    if (icon) app.icon = icon;
    if (screenshot) app.screenshot = screenshot;
    if (tags.length) app.tags = tags;
    if (truthy(at(row, 'no-embed'))) app.embeddable = false;

    apps.push(app);
  });

  return { apps, problems };
}

const DRIVE_ID = [/\/file\/d\/([\w-]{20,})/, /[?&]id=([\w-]{20,})/];
const EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

const MAX_BYTES = 8 * 1024 * 1024;
const CHUBBY = 1.5 * 1024 * 1024;

/** Small stable hash, so a plain image url always maps to the same filename. */
function shortHash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/** Turns a Drive share link (or any image url) in the `screenshot` column into
 *  a file committed under public/screenshots, and returns the local filename.
 *  Downloads once: an existing file with the same derived name is left alone,
 *  so repeat runs are cheap and produce no commit churn. */
async function fetchImage(value, name, notes) {
  const driveId = DRIVE_ID.map((re) => value.match(re)?.[1]).find(Boolean);
  const src = driveId
    ? `https://drive.google.com/uc?export=download&id=${driveId}`
    : value;
  const stem = driveId ? `drive-${driveId}` : `img-${shortHash(value)}`;

  const existing = (await readdir(SHOTS_DIR).catch(() => [])).find(
    (f) => f.replace(/\.[^.]+$/, '') === stem
  );
  if (existing) return existing;

  let res;
  try {
    res = await fetch(src, { redirect: 'follow', signal: AbortSignal.timeout(45000) });
  } catch (err) {
    notes.push(`${name}: image download failed (${err.name}) — card keeps its icon`);
    return '';
  }

  if (!res.ok) {
    notes.push(`${name}: image download failed (HTTP ${res.status}) — card keeps its icon`);
    return '';
  }

  const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();

  if (!EXT[type]) {
    // Drive serves an HTML page rather than the file when the link is not
    // openly shared, which is far and away the most common cause here.
    const hint = driveId && type.startsWith('text/html')
      ? ' — the Drive file is probably not shared with "anyone with the link"'
      : ` — expected an image, got ${type || 'no content-type'}`;
    notes.push(`${name}: image skipped${hint}`);
    return '';
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) {
    notes.push(`${name}: image skipped — ${(buf.byteLength / 1048576).toFixed(1)}MB is over the 8MB limit`);
    return '';
  }
  if (buf.byteLength > CHUBBY) {
    notes.push(`${name}: image is ${(buf.byteLength / 1048576).toFixed(1)}MB — worth shrinking, it will be slow on phones`);
  }

  const filename = `${stem}.${EXT[type]}`;
  await mkdir(SHOTS_DIR, { recursive: true });
  await writeFile(path.join(SHOTS_DIR, filename), buf);
  console.log(`  + downloaded ${filename} for ${name} (${Math.round(buf.byteLength / 1024)}kb)`);
  return filename;
}

/** Reports which app URLs are not answering. Never removes them — a student's
 *  app vanishing from the page without a word is worse than a dead link. */
async function checkLinks(apps) {
  const dead = [];
  await Promise.all(
    apps.map(async (app) => {
      try {
        const res = await fetch(app.url, {
          method: 'GET',
          redirect: 'follow',
          signal: AbortSignal.timeout(20000),
        });
        if (!res.ok) dead.push(`${app.name} — HTTP ${res.status}`);
      } catch (err) {
        dead.push(`${app.name} — unreachable (${err.name})`);
      }
    })
  );
  return dead;
}

async function load(source) {
  if (/^https?:\/\//i.test(source)) {
    console.log(`  fetching ${source.replace(/\/d\/e\/[^/]+/, '/d/e/…')}`);
    const res = await fetch(source, { redirect: 'follow', signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`fetch failed: HTTP ${res.status}`);
    return res.text();
  }
  // A local path works too, so a downloaded csv can be tested without
  // publishing anything.
  console.log(`  reading ${source}`);
  return readFile(path.resolve(ROOT, source), 'utf8');
}

async function readCourse(slug, source, problems, imageNotes) {
  const text = await load(source);

  if (/^\s*<!doctype html/i.test(text) || /<html/i.test(text.slice(0, 400))) {
    throw new Error(
      'returned a web page, not CSV. It is probably not published to the web, ' +
      'or the url is the normal edit link rather than the published csv one.'
    );
  }

  const rows = parseCsv(text);
  if (!rows.length) throw new Error('sheet is empty');

  const { settings, ignored, table } = split(rows);

  // A broken profile link on a donor-facing page is worse than no link, so
  // anything malformed is dropped and reported rather than rendered.
  for (const [field, label] of [
    ['instructorLinkedin', 'LinkedIn'],
    ['instructorFacebook', 'Facebook'],
    ['instructorInstagram', 'Instagram'],
  ]) {
    if (settings[field] && !isRealUrl(settings[field])) {
      problems.push(`[${slug}] instructor ${label} link "${settings[field]}" is not a complete web address — dropped`);
      delete settings[field];
    }
  }

  if (settings.instructorEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(settings.instructorEmail)) {
    problems.push(`[${slug}] instructor email "${settings.instructorEmail}" does not look like an email address — dropped`);
    delete settings.instructorEmail;
  }

  if (!settings.instructorName) {
    for (const k of ['instructorRole', 'instructorLinkedin', 'instructorFacebook', 'instructorInstagram', 'instructorEmail']) {
      if (settings[k]) {
        problems.push(`[${slug}] instructor details were filled in but instructorName is empty, so the block is not shown`);
        break;
      }
    }
  }


  if (ignored.length) {
    problems.push(
      `[${slug}] these settings rows are not read by the site and were ignored: ${ignored.join(', ')} ` +
      `— page wording lives in data/site-text.json, the cohort label and logos in the course file`
    );
  }


  // Zero apps is legitimate: a course sheet is set up before the students
  // have built anything. Only a malformed sheet — one with no app table at
  // all, which split() already rejects — counts as a failure.
  const { apps, problems: rowProblems } = toApps(table, slug);
  problems.push(...rowProblems.map((p) => `[${slug}] ${p}`));

  // A screenshot cell holding a link (Drive share url, or any image url) is
  // downloaded into public/screenshots and replaced with the local filename.
  // A bare filename is left alone, for images added to the repo by hand.
  for (const app of apps) {
    if (!app.screenshot || !/^https?:\/\//i.test(app.screenshot)) continue;
    const local = await fetchImage(app.screenshot, app.name, imageNotes);
    if (local) app.screenshot = local;
    else delete app.screenshot;
  }

  return { settings, apps };
}

async function main() {
  if (!existsSync(CONFIG)) {
    console.error(
      `No ${path.relative(ROOT, CONFIG)}. It maps each course slug to its published CSV url:\n` +
      '  { "he": "https://docs.google.com/…&output=csv" }'
    );
    process.exitCode = 1;
    return;
  }

  const config = await readJson(CONFIG);
  const courses = Object.entries(config).filter(([slug]) => !slug.startsWith('_'));

  // Registering a sheet and creating the course file are two separate edits,
  // and doing only the first produces no page and no error. Say so.
  const COURSES_DIR = path.join(ROOT, 'data', 'courses');
  const known = new Set();
  if (existsSync(COURSES_DIR)) {
    for (const f of (await readdir(COURSES_DIR)).filter((n) => n.endsWith('.json'))) {
      const c = await readJson(path.join(COURSES_DIR, f));
      if (c.slug) known.add(c.slug);
    }
  }
  for (const [slug] of courses) {
    if (!known.has(slug)) {
      console.warn(
        `  ! "${slug}" is in data/sheets.json but no course file has that slug — ` +
        `nothing will be published for it until data/courses/${slug}.json exists`
      );
    }
  }

  if (!courses.length) {
    console.error(`No courses in ${path.relative(ROOT, CONFIG)}.`);
    process.exitCode = 1;
    return;
  }

  const problems = [];
  const imageNotes = [];
  const failures = [];
  const result = {};
  let allApps = [];

  for (const [slug, source] of courses) {
    console.log(`\n${slug}:`);
    try {
      // SHEET_CSV_URL overrides every source — for local testing against one
      // downloaded file, not for production use.
      const { settings, apps } = await readCourse(
        slug,
        process.env.SHEET_CSV_URL || source,
        problems,
        imageNotes
      );

      // Rows can name a different course; honour that so one sheet can still
      // feed several pages if you ever want it to.
      for (const app of apps) {
        const { course, ...rest } = app;
        (result[course] ||= { apps: [] }).apps.push(rest);
      }
      if (Object.keys(settings).length) {
        (result[slug] ||= { apps: [] }).settings = settings;
      }

      allApps = allApps.concat(apps);
      console.log(`  ${apps.length} apps${Object.keys(settings).length ? `, ${Object.keys(settings).length} settings` : ''}`);
      if (!apps.length) console.warn(`  ! no apps yet — /${slug}/ will not be built until there is at least one`);
    } catch (err) {
      failures.push(`${slug}: ${err.message}`);
      console.error(`  ! ${err.message}`);
    }
  }

  for (const p of problems) console.warn(`  ! ${p}`);
  for (const n of imageNotes) console.warn(`  ! ${n}`);

  // One broken sheet must not wipe the courses that are fine, and every sheet
  // failing means something systemic — neither should overwrite good data.
  if (failures.length === courses.length) {
    throw new Error(`every sheet failed:\n  ${failures.join('\n  ')}`);
  }
  if (failures.length) {
    console.warn(`\n  ! ${failures.length} of ${courses.length} sheets failed; keeping the previous data for those.`);
    const previousData = existsSync(OUT) ? await readJson(OUT) : {};
    for (const f of failures) {
      const slug = f.split(':')[0];
      if (previousData[slug]) result[slug] = previousData[slug];
    }
  }

  const dead = await checkLinks(allApps);
  for (const d of dead) console.warn(`  ! link check: ${d}`);

  const ordered = Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
  const previous = existsSync(OUT) ? await readFile(OUT, 'utf8') : '';
  const next = JSON.stringify(ordered, null, 2) + '\n';

  if (previous === next) {
    console.log(`\nNo change — ${allApps.length} apps.`);
  } else {
    await writeFile(OUT, next, 'utf8');
    console.log(`\nWrote ${path.relative(ROOT, OUT)} — ${allApps.length} apps.`);
  }

  const summary = [
    failures.length && `### Sheets that failed\n\n${failures.map((f) => `- ${f}`).join('\n')}`,
    problems.length && `### Rows skipped\n\n${problems.map((p) => `- ${p}`).join('\n')}`,
    imageNotes.length && `### Images\n\n${imageNotes.map((n) => `- ${n}`).join('\n')}`,
    dead.length && `### Link check\n\n${dead.map((d) => `- ${d}`).join('\n')}`,
  ].filter(Boolean);

  if (summary.length && process.env.GITHUB_STEP_SUMMARY) {
    await writeFile(process.env.GITHUB_STEP_SUMMARY, summary.join('\n\n') + '\n', { flag: 'a' });
  }
}

main().catch((err) => {
  console.error(`\nSheet sync failed: ${err.message}`);
  console.error('data/apps.json left untouched — the site keeps serving the last good roster.');
  // exitCode rather than exit(): calling exit() while a fetch is still in
  // flight trips a libuv assertion on Windows and reports a bogus exit status.
  process.exitCode = 1;
});
