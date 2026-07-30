// Pulls the app roster from a published Google Sheet into data/apps.json.
//
// Deliberately never writes a partial or empty result: if the fetch fails, or
// the sheet comes back with no usable rows, the existing apps.json is left
// alone and the script exits non-zero. A broken sheet must not be able to
// empty the showcase.
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')));
const CONFIG = path.join(ROOT, 'data', 'sheet.json');
const OUT = path.join(ROOT, 'data', 'apps.json');

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

  if (dead.length && process.env.GITHUB_STEP_SUMMARY) {
    await writeFile(
      process.env.GITHUB_STEP_SUMMARY,
      `### Link check\n\n${dead.map((d) => `- ${d}`).join('\n')}\n`,
      { flag: 'a' }
    );
  }
}

main().catch((err) => {
  console.error(`\nSheet sync failed: ${err.message}`);
  console.error('data/apps.json left untouched — the site keeps serving the last good roster.');
  // exitCode rather than exit(): calling exit() while a fetch is still in
  // flight trips a libuv assertion on Windows and reports a bogus exit status.
  process.exitCode = 1;
});
