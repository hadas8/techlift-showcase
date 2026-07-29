// Builds one static page per course file in data/courses/.
// No framework: the output is plain HTML that GitHub Pages can serve directly.
import { readdir, readFile, mkdir, writeFile, copyFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const COURSES = path.join(ROOT, 'data', 'courses');
const SRC = path.join(ROOT, 'src');
const SHOTS = path.join(ROOT, 'public', 'screenshots');
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

// Deterministic tile for apps that have no screenshot yet, so a missing image
// looks intentional rather than broken.
function placeholder(name) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)) % 360;
  const initial = esc([...name.trim()][0] || '?');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 300" role="img" aria-hidden="true">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="hsl(${h} 42% 88%)"/>
    <stop offset="1" stop-color="hsl(${(h + 40) % 360} 38% 78%)"/>
  </linearGradient></defs>
  <rect width="480" height="300" fill="url(#g)"/>
  <text x="240" y="172" text-anchor="middle" font-size="108" font-weight="700"
        fill="hsl(${h} 30% 32%)" opacity=".55"
        font-family="system-ui, sans-serif">${initial}</text>
</svg>`;
}

function card(app, t, hasShot) {
  const media = hasShot
    ? `<img class="shot" src="../screenshots/${esc(app.screenshot)}" alt="" loading="lazy" width="480" height="300">`
    : `<div class="shot">${placeholder(app.name)}</div>`;

  const tags = (app.tags || [])
    .map((tag) => `<li>${esc(tag)}</li>`)
    .join('');

  return `<li class="card" data-url="${esc(app.url)}" data-name="${esc(app.name)}" data-embed="${app.embeddable === false ? 'false' : 'true'}">
      ${media}
      <div class="card-body">
        <h2>${esc(app.name)}</h2>
        ${app.author ? `<p class="byline">${esc(t.by)} ${esc(app.author)}</p>` : ''}
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
  return `<!doctype html>
<html lang="${esc(course.lang)}" dir="${t.dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(course.title)}${course.cohort ? ' — ' + esc(course.cohort) : ''}</title>
<meta name="description" content="${esc(course.intro).slice(0, 160)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Assistant:wght@400;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../assets/styles.css">
</head>
<body>
<header class="masthead">
  <div class="wrap">
    ${course.cohort ? `<p class="eyebrow">${esc(course.cohort)}</p>` : ''}
    <h1>${esc(course.title)}</h1>
    <p class="intro">${esc(course.intro)}</p>
    <p class="count">${esc(t.counter(course.apps.length))}</p>
  </div>
</header>

<main class="wrap">
  <ul class="grid">
${cards}
  </ul>
</main>

<footer class="foot">
  <div class="wrap">
    ${course.note ? `<p>${esc(course.note)}</p>` : ''}
  </div>
</footer>

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
  await rm(DIST, { recursive: true, force: true });
  await mkdir(path.join(DIST, 'assets'), { recursive: true });
  await mkdir(path.join(DIST, 'screenshots'), { recursive: true });

  await copyFile(path.join(SRC, 'styles.css'), path.join(DIST, 'assets', 'styles.css'));
  await copyFile(path.join(SRC, 'app.js'), path.join(DIST, 'assets', 'app.js'));

  if (existsSync(SHOTS)) {
    for (const f of await readdir(SHOTS)) {
      await copyFile(path.join(SHOTS, f), path.join(DIST, 'screenshots', f));
    }
  }

  const files = (await readdir(COURSES)).filter((f) => f.endsWith('.json'));
  const built = [];

  for (const file of files) {
    const course = JSON.parse(await readFile(path.join(COURSES, file), 'utf8'));
    const t = STRINGS[course.lang];
    if (!t) throw new Error(`${file}: unknown language "${course.lang}"`);

    const cards = course.apps
      .map((app) => {
        const hasShot = Boolean(app.screenshot) && existsSync(path.join(SHOTS, app.screenshot));
        if (app.screenshot && !hasShot) {
          console.warn(`  ! no screenshot yet for "${app.name}" (${app.screenshot}) — using a placeholder`);
        }
        return card(app, t, hasShot);
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
