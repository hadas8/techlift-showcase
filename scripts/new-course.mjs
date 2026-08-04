// Creates the two files a new course needs: its course JSON, and its entry in
// data/sheets.json. Both by hand is easy to half-do, and a course registered
// in one but not the other fails quietly.
//
//   npm run new-course -- --slug=autumn-2026 --url="https://…output=csv"
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')));
const COURSES = path.join(ROOT, 'data', 'courses');
const SHEETS = path.join(ROOT, 'data', 'sheets.json');

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq !== -1) out[a.slice(2, eq)] = a.slice(eq + 1);
    else if (argv[i + 1] && !argv[i + 1].startsWith('--')) out[a.slice(2)] = argv[++i];
    else out[a.slice(2)] = 'true';
  }
  return out;
}

const usage = `
Creates a new course page.

  npm run new-course -- --slug=autumn-2026 --url="https://…&output=csv"

  --slug   required   url path and sheet key, e.g. /autumn-2026/
  --lang   he | en    default he
  --theme             default "brand" for he, none for en
  --cohort            label above the headline, e.g. "מחזור סתיו 2026"
  --url               published CSV url; can be added to data/sheets.json later
`;

async function main() {
  const opts = args(process.argv.slice(2));

  if (!opts.slug || opts.help) {
    console.log(usage);
    process.exitCode = opts.slug ? 0 : 1;
    return;
  }

  const slug = String(opts.slug).trim();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    console.error(`Bad slug "${slug}" — lowercase letters, digits and hyphens only, since it becomes a url path.`);
    process.exitCode = 1;
    return;
  }

  const lang = (opts.lang || 'he').trim();
  if (!['he', 'en'].includes(lang)) {
    console.error(`Unknown language "${lang}" — the build only has strings for he and en.`);
    process.exitCode = 1;
    return;
  }

  const theme = opts.theme || (lang === 'he' ? 'brand' : '');
  const file = path.join(COURSES, `${slug}.json`);

  // Check the slug inside every course file, not just filenames: the filename
  // is decorative and two files claiming one slug would silently overwrite
  // each other's page at build time.
  let partners = null;

  for (const f of (await readdir(COURSES)).filter((n) => n.endsWith('.json'))) {
    const existing = JSON.parse(await readFile(path.join(COURSES, f), 'utf8'));

    if (existing.slug === slug) {
      console.error(`Slug "${slug}" is already used by data/courses/${f} — pick another, or edit that file.`);
      process.exitCode = 1;
      return;
    }

    // Reuse the partner logos from a course in the same language as a
    // starting point — they are the most likely thing to need changing.
    if (!partners && existing.lang === lang && existing.partners?.length) {
      partners = existing.partners;
      console.log(`Copied partner logos from ${f} — check they are right for this course`);
    }
  }

  if (existsSync(file)) {
    console.error(`${path.relative(ROOT, file)} already exists — pick another slug, or edit that file.`);
    process.exitCode = 1;
    return;
  }

  const course = {
    _comment:
      'Per-course. Only `cohort` and `partners` normally need changing for a new course. ' +
      'All shared wording lives in data/site-text.json.',
    slug,
    lang,
  };
  if (theme) course.theme = theme;
  course.cohort = opts.cohort && opts.cohort !== 'true' ? String(opts.cohort) : '';
  if (partners) course.partners = partners;

  if (!course.cohort) {
    console.warn('\n! No --cohort given. Set it in the course file before publishing —');
    console.warn('  it is the label above the headline, e.g. "מחזור אביב 2026".');
  }

  await writeFile(file, JSON.stringify(course, null, 2) + '\n', 'utf8');
  console.log(`Wrote ${path.relative(ROOT, file)}`);

  const sheets = existsSync(SHEETS) ? JSON.parse(await readFile(SHEETS, 'utf8')) : {};

  if (opts.url && opts.url !== 'true') {
    if (!/^https?:\/\//i.test(opts.url)) {
      console.warn(`\n! "${opts.url}" is not a url — leaving data/sheets.json alone.`);
    } else if (!/output=csv/i.test(opts.url)) {
      console.warn(`\n! That url does not end in output=csv, so it is probably the edit link`);
      console.warn(`  rather than the published one. Adding it anyway — fix it if the sync complains.`);
      sheets[slug] = opts.url;
    } else {
      sheets[slug] = opts.url;
    }
    if (sheets[slug]) {
      await writeFile(SHEETS, JSON.stringify(sheets, null, 2) + '\n', 'utf8');
      console.log(`Added "${slug}" to ${path.relative(ROOT, SHEETS)}`);
    }
  }

  console.log(`
Next:
  ${sheets[slug] ? '' : `1. Publish the course sheet as CSV and add it to data/sheets.json:
       "${slug}": "https://…&output=csv"
  `}${sheets[slug] ? '1' : '2'}. Commit and push.
  ${sheets[slug] ? '2' : '3'}. Run the "Sync roster from Google Sheet" workflow.

The page appears at /${slug}/ once the sheet has at least one app in it.

Check data/courses/${slug}.json: the cohort label and the partner logos are
the two things that usually differ per course. Shared wording lives in
data/site-text.json; the sheet only supplies apps and the headline numbers.`);
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
