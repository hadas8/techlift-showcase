// Pulls the app roster from a published Google Sheet into data/apps.json.
//
// Deliberately never writes a partial or empty result: if the fetch fails, or
// the sheet comes back with no usable rows, the existing apps.json is left
// alone and the script exits non-zero. A broken sheet must not be able to
// empty the showcase.
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')));
const CONFIG = path.join(ROOT, 'data', 'sheet.json');
const OUT = path.join(ROOT, 'data', 'apps.json');
const SHOTS_DIR = path.join(ROOT, 'public', 'screenshots');

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

function toApps(rows) {
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
    const course = at(row, 'course');

    if (truthy(at(row, 'hidden'))) return;

    if (!name || !url) {
      problems.push(`row ${line}: skipped — needs both name and url`);
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      problems.push(`row ${line} (${name}): skipped — url must start with http:// or https://`);
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

async function main() {
  // The env var wins, so CI can take the url from a repo variable and never
  // need the config file at all.
  let url = process.env.SHEET_CSV_URL || '';

  if (!url && existsSync(CONFIG)) {
    url = JSON.parse(await readFile(CONFIG, 'utf8')).csvUrl || '';
  }

  if (!url || url.includes('PUT-YOUR')) {
    console.error(
      'No sheet url configured. Either set the SHEET_CSV_URL repo variable\n' +
      '(Settings → Secrets and variables → Actions → Variables), or copy\n' +
      'data/sheet.example.json to data/sheet.json and put the url in it.'
    );
    process.exitCode = 1;
    return;
  }

  let text;

  if (/^https?:\/\//i.test(url)) {
    console.log(`Fetching ${url.replace(/\/d\/e\/[^/]+/, '/d/e/…')}`);
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`sheet fetch failed: HTTP ${res.status}`);
    text = await res.text();
  } else {
    // A local path works too, so a downloaded csv can be tested without
    // publishing anything.
    console.log(`Reading ${url}`);
    text = await readFile(path.resolve(ROOT, url), 'utf8');
  }

  if (/^\s*<!doctype html/i.test(text) || /<html/i.test(text.slice(0, 400))) {
    throw new Error(
      'the sheet returned a web page, not CSV. It is probably not published to the web, ' +
      'or the url is the normal edit link rather than the published csv one.'
    );
  }

  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('sheet has a header but no rows');

  const { apps, problems } = toApps(rows);
  for (const p of problems) console.warn(`  ! ${p}`);

  if (!apps.length) throw new Error('no usable rows — refusing to write an empty roster');

  // A screenshot cell holding a link (Drive share url, or any image url) is
  // downloaded into public/screenshots and replaced with the local filename.
  // A bare filename is left as-is, for images added to the repo by hand.
  const imageNotes = [];
  for (const app of apps) {
    if (!app.screenshot || !/^https?:\/\//i.test(app.screenshot)) continue;
    const local = await fetchImage(app.screenshot, app.name, imageNotes);
    if (local) app.screenshot = local;
    else delete app.screenshot;
  }
  for (const n of imageNotes) console.warn(`  ! ${n}`);

  const byCourse = {};
  for (const app of apps) {
    const { course, ...rest } = app;
    (byCourse[course] ||= []).push(rest);
  }

  const dead = await checkLinks(apps);
  for (const d of dead) console.warn(`  ! link check: ${d}`);

  const previous = existsSync(OUT) ? await readFile(OUT, 'utf8') : '';
  const next = JSON.stringify(byCourse, null, 2) + '\n';

  if (previous === next) {
    console.log(`\nNo change — ${apps.length} apps across ${Object.keys(byCourse).length} course(s).`);
  } else {
    await writeFile(OUT, next, 'utf8');
    console.log(`\nWrote ${path.relative(ROOT, OUT)} — ${apps.length} apps across ${Object.keys(byCourse).length} course(s):`);
    for (const [course, list] of Object.entries(byCourse)) console.log(`  ${course}: ${list.length}`);
  }

  const summary = [
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
