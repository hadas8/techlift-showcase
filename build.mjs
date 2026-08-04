// Builds one static page per course file in data/courses/.
// No framework: the output is plain HTML that GitHub Pages can serve directly.
import { readdir, readFile, mkdir, writeFile, copyFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const COURSES = path.join(ROOT, 'data', 'courses');
const SHEET_DATA = path.join(ROOT, 'data', 'sheet-data.json');
const SITE_TEXT = path.join(ROOT, 'data', 'site-text.json');
const SRC = path.join(ROOT, 'src');
const SHOTS = path.join(ROOT, 'public', 'screenshots');
const BRAND = path.join(ROOT, 'public', 'brand');
const DIST = path.join(ROOT, 'dist');

const STRINGS = {
  he: {
    dir: 'rtl',
    openHere: 'פתחו כאן',
    openTab: 'פתחו בלשונית חדשה',
    newTab: 'לשונית חדשה',
    close: 'סגירה',
    by: 'נבנתה על ידי',
    counter: (n) => `${n} אפליקציות בתצוגה`,
    source: 'קוד המקור',
  },
  en: {
    dir: 'ltr',
    openHere: 'Open here',
    openTab: 'Open in a new tab',
    newTab: 'New tab',
    close: 'Close',
    by: 'Built by',
    counter: (n) => `${n} apps on show`,
    source: 'Source code',
  },
};

const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// **phrase** in a course title gets a highlighter swash behind it. Escaped
// first, so the markers are the only markup that survives.
const headline = (s = '') =>
  esc(s).replace(/\*\*(.+?)\*\*/g, '<span class="mark">$1</span>');

const plain = (s = '') => String(s).replace(/\*\*/g, '');

// Deterministic tile for apps that have no screenshot yet, so a missing image
// looks intentional rather than broken. The brand theme keeps hues inside the
// blue-to-indigo range so a half-filled grid still looks like one family;
// the default theme spreads across the wheel.
function placeholder(name, theme) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)) % 360;
  const initial = esc([...name.trim()][0] || '?');
  const brand = theme === 'brand';
  const hue = brand ? 212 + (h % 44) : h;
  const from = brand ? `hsl(${hue} 46% 93%)` : `hsl(${h} 42% 88%)`;
  const to = brand ? `hsl(${hue + 14} 40% 83%)` : `hsl(${(h + 40) % 360} 38% 78%)`;
  const ink = brand ? `hsl(${hue + 6} 34% 38%)` : `hsl(${h} 30% 32%)`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 300" role="img" aria-hidden="true">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${from}"/>
    <stop offset="1" stop-color="${to}"/>
  </linearGradient></defs>
  <rect width="480" height="300" fill="url(#g)"/>
  <text x="240" y="172" text-anchor="middle" font-size="104"
        font-weight="${brand ? '500' : '600'}" fill="${ink}" opacity=".5"
        font-family="${brand ? '\'Frank Ruhl Libre\', Georgia, serif' : 'system-ui, sans-serif'}">${initial}</text>
</svg>`;
}

// Tile colour is derived from the app name so every app gets a distinct but
// on-palette square without anyone having to choose one.
function tileStyle(name, theme) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)) % 360;
  if (theme === 'brand') {
    const hue = 214 + (h % 46);
    return `--tile:linear-gradient(140deg,hsl(${hue} 62% 92%),hsl(${hue + 12} 54% 84%))`;
  }
  return `--tile:linear-gradient(140deg,hsl(${h} 46% 92%),hsl(${(h + 30) % 360} 42% 85%))`;
}

function card(app, t, hasShot, theme) {
  const media = hasShot
    ? `<img class="shot" src="../screenshots/${esc(app.screenshot)}" alt="" loading="lazy" width="480" height="300">`
    : '';

  const tags = (app.tags || []).map((tag) => `<li>${esc(tag)}</li>`).join('');
  const initial = [...String(app.name).trim()][0] || '?';

  return `<li class="card" data-url="${esc(app.url)}" data-name="${esc(app.name)}" data-embed="${app.embeddable === false ? 'false' : 'true'}">
      ${media}
      <div class="card-body">
        <div class="card-head">
          <span class="tile" style="${esc(tileStyle(app.name, theme))}" aria-hidden="true">${esc(app.icon || initial)}</span>
          <div>
            <h2>${esc(app.name)}</h2>
            ${app.author ? `<p class="byline">${esc(t.by)} ${esc(app.author)}</p>` : ''}
          </div>
        </div>
        <p class="desc">${esc(app.description)}</p>
        ${tags ? `<ul class="tags">${tags}</ul>` : ''}
        <div class="actions">
          <button type="button" class="btn btn-primary" data-open-app>${esc(t.openHere)}</button>
          <a class="btn btn-ghost" href="${esc(app.url)}" target="_blank" rel="noopener">${esc(t.newTab)} &#8599;</a>
        </div>
      </div>
    </li>`;
}

function page(course, t, cards) {
  // A stat whose value is "auto" counts the apps, so it can't go stale as
  // rows are added to the sheet.
  const statList = (course.stats || []).map((s) =>
    /^(auto|#)$/i.test(String(s.value).trim())
      ? { ...s, value: String(course.apps.length) }
      : s
  );

  // Only render the row when there is more than one — a single tile lapping
  // over the hero looks like something failed to load.
  const stats = statList.length > 1
    ? `<div class="wrap">
  <ul class="stats">
    ${statList
      .map((s) => `<li><b>${esc(s.value)}</b><span>${esc(s.label)}</span></li>`)
      .join('\n    ')}
  </ul>
</div>`
    : '';

  const secHead = course.appsHeading
    ? `<div class="sec-head"><span class="no">01</span><h2>${esc(course.appsHeading)}</h2></div>
  ${course.appsLead ? `<p class="lead">${esc(course.appsLead)}</p>` : ''}`
    : '';

  // A partner logo whose file is missing would render as a broken image on a
  // donor-facing page, so drop it and say so instead.
  const logos = (course.partners || []).filter((p) => {
    if (existsSync(path.join(BRAND, p.file))) return true;
    console.warn(`  ! /${course.slug}/  logo "${p.file}" (${p.name}) is not in public/brand — skipped`);
    return false;
  });

  const partners = logos.length
    ? `<section class="partners">
  <div class="wrap partners-inner">
    ${course.partnersLabel ? `<p>${esc(course.partnersLabel)}</p>` : ''}
    ${logos
      .map((p) =>
        // Logos differ in shape: a stacked mark needs more height than a wide
        // wordmark before its text is legible, so height is per logo.
        `<img src="../brand/${esc(p.file)}" alt="${esc(p.name)}"${p.height ? ` style="height:${Number(p.height)}px"` : ''} loading="lazy">`
      )
      .join('\n    ')}
  </div>
</section>`
    : '';

  return `<!doctype html>
<html lang="${esc(course.lang)}" dir="${t.dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(plain(course.title))}${course.cohort ? ' — ' + esc(course.cohort) : ''}</title>
<meta name="description" content="${esc(String(course.intro || '').replace(/\s+/g, ' ').trim()).slice(0, 160)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../assets/styles.css">
</head>
<body${course.theme ? ` class="theme-${esc(course.theme)}"` : ''}>
<header class="masthead">
  <div class="wrap">
    ${course.cohort ? `<p class="eyebrow">${esc(course.cohort)}</p>` : ''}
    <h1>${headline(course.title)}</h1>
    ${String(course.intro || '')
      .split(/\n+/)
      .map((para) => para.trim())
      .filter(Boolean)
      .map((para) => `<p class="intro">${esc(para)}</p>`)
      .join('\n    ')}
  </div>
</header>

${stats}

<main class="wrap">
  ${secHead}
  <ul class="grid">
${cards}
  </ul>
</main>

<footer class="foot">
  <div class="wrap">
    ${course.note ? `<p>${esc(course.note)}</p>` : ''}
  </div>
</footer>

${partners}

<div class="modal" id="viewer" hidden>
  <div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="viewer-title">
    <div class="modal-bar">
      <h2 class="modal-title" id="viewer-title"></h2>
      <span class="modal-spacer"></span>
      <a class="btn btn-ghost modal-open-tab" href="#" target="_blank" rel="noopener">${esc(t.openTab)} &#8599;</a>
      <button type="button" class="icon-btn modal-close" aria-label="${esc(t.close)}">&#10005;</button>
    </div>
    <iframe class="modal-frame" src="about:blank"
            allow="clipboard-write; fullscreen"
            referrerpolicy="no-referrer-when-downgrade"></iframe>
  </div>
</div>

<script src="../assets/app.js"></script>
</body>
</html>
`;
}

async function main() {
  // Empty dist rather than removing it: on Windows a running preview server
  // (or OneDrive) holds a handle on the directory itself, and rmdir fails.
  if (existsSync(DIST)) {
    for (const entry of await readdir(DIST)) {
      await rm(path.join(DIST, entry), { recursive: true, force: true });
    }
  }
  await mkdir(path.join(DIST, 'assets'), { recursive: true });
  await mkdir(path.join(DIST, 'screenshots'), { recursive: true });
  await mkdir(path.join(DIST, 'brand'), { recursive: true });

  await copyFile(path.join(SRC, 'styles.css'), path.join(DIST, 'assets', 'styles.css'));
  await copyFile(path.join(SRC, 'app.js'), path.join(DIST, 'assets', 'app.js'));

  for (const [from, to] of [[SHOTS, 'screenshots'], [BRAND, 'brand']]) {
    if (!existsSync(from)) continue;
    for (const f of await readdir(from)) {
      await copyFile(path.join(from, f), path.join(DIST, to, f));
    }
  }

  // Synced from the course sheets, if any. Falls back to what is in the
  // course file, so the repo builds on its own.
  const sheet = existsSync(SHEET_DATA) ? JSON.parse(await readFile(SHEET_DATA, 'utf8')) : {};

  // Wording shared by every course in a language.
  const siteText = existsSync(SITE_TEXT) ? JSON.parse(await readFile(SITE_TEXT, 'utf8')) : {};

  const files = (await readdir(COURSES)).filter((f) => f.endsWith('.json'));
  const built = [];
  const seenSlugs = new Map();

  for (const file of files) {
    const own = JSON.parse(await readFile(path.join(COURSES, file), 'utf8'));
    const t = STRINGS[own.lang];
    if (!t) throw new Error(`${file}: unknown language "${own.lang}"`);

    // Three layers, each overriding the one before:
    //   shared wording  →  the course file  →  what the sheet supplies
    const course = { ...(siteText[own.lang] || {}), ...own };
    if (!course.slug) throw new Error(`${file}: no slug`);

    // Two courses sharing a slug would write to the same directory, so the
    // second would silently replace the first.
    if (seenSlugs.has(course.slug)) {
      throw new Error(`${file}: slug "${course.slug}" is already used by ${seenSlugs.get(course.slug)}`);
    }
    seenSlugs.set(course.slug, file);

    const fromSheet = sheet[course.slug];

    // Settings the instructor typed into the sheet win over the course file,
    // which keeps the structural bits (slug, language, theme, logos).
    if (fromSheet?.settings) {
      Object.assign(course, fromSheet.settings);
      console.log(`  /${course.slug}/  ${Object.keys(fromSheet.settings).length} settings from sheet`);
    }

    if (fromSheet?.apps?.length) {
      course.apps = fromSheet.apps;
      console.log(`  /${course.slug}/  ${fromSheet.apps.length} apps from sheet`);
    } else if (Object.keys(sheet).length) {
      console.warn(`  ! /${course.slug}/  no app rows in the sheet — using the course file`);
    }

    // A course with no apps yet is a normal state — the sheet gets set up
    // before the students have built anything. Skip it rather than failing
    // the build, which would stop every other course from deploying too.
    if (!course.apps?.length) {
      console.warn(`  ! /${course.slug}/  skipped — no apps yet`);
      continue;
    }

    const cards = course.apps
      .map((app) => {
        const hasShot = Boolean(app.screenshot) && existsSync(path.join(SHOTS, app.screenshot));
        if (app.screenshot && !hasShot) {
          console.warn(`  ! no screenshot yet for "${app.name}" (${app.screenshot}) — using a placeholder`);
        }
        return card(app, t, hasShot, course.theme);
      })
      .join('\n');

    await mkdir(path.join(DIST, course.slug), { recursive: true });
    await writeFile(path.join(DIST, course.slug, 'index.html'), page(course, t, cards), 'utf8');
    built.push(course);
    console.log(`  built /${course.slug}/  ${course.apps.length} apps  (${course.lang})`);
  }

  // Root page: an internal index of the course pages, not a donor-facing page.
  const links = built
    .map((c) => `<li><a href="./${esc(c.slug)}/">${esc(c.title)} — ${esc(c.cohort || c.lang)}</a></li>`)
    .join('\n');
  await writeFile(
    path.join(DIST, 'index.html'),
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Showcases</title><link rel="stylesheet" href="./assets/styles.css"></head>
<body><header class="masthead"><div class="wrap"><h1>Showcases</h1>
<p class="intro">Course pages built from <code>data/courses/</code>.</p></div></header>
<main class="wrap"><ul style="padding:40px 0;line-height:2.2">${links}</ul></main></body></html>`,
    'utf8'
  );

  console.log(`\nDone — ${built.length} course page(s) in dist/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
