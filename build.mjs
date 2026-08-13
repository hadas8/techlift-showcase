// Builds one static page per course file in data/courses/.
// No framework: the output is plain HTML that GitHub Pages can serve directly.
import { readdir, readFile, mkdir, writeFile, copyFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { readJson } from './scripts/read-json.mjs';

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

  // A real logo sits on a plain surface; the generated hue would fight it.
  const tile = app.iconImage
    ? `<span class="tile tile-img" aria-hidden="true"><img src="../screenshots/${esc(app.iconImage)}" alt="" loading="lazy"></span>`
    : `<span class="tile" style="${esc(tileStyle(app.name, theme))}" aria-hidden="true">${esc(app.icon || initial)}</span>`;

  return `<li class="card" data-url="${esc(app.url)}" data-name="${esc(app.name)}" data-embed="${app.embeddable === false ? 'false' : 'true'}">
      ${media}
      <div class="card-body">
        <div class="card-head">
          ${tile}
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

const ICONS = {
  linkedin: '<path d="M6.94 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM3.2 21h3.5V8.9H3.2V21zM9.3 8.9V21h3.5v-6.3c0-1.7.9-2.6 2.1-2.6 1.2 0 1.9.8 1.9 2.6V21h3.5v-6.9c0-3.4-1.8-5-4.2-5-1.9 0-2.9 1.1-3.4 1.9V8.9H9.3z"/>',
  facebook: '<path d="M13.5 21v-8h2.7l.4-3.1h-3.1V7.9c0-.9.25-1.5 1.55-1.5H16.7V3.6c-.3 0-1.3-.13-2.46-.13-2.44 0-4.11 1.49-4.11 4.22V9.9H7.4V13h2.73v8h3.37z"/>',
  instagram: '<path fill-rule="evenodd" d="M8 3h8a5 5 0 0 1 5 5v8a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5V8a5 5 0 0 1 5-5zm0 2a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3H8zm4 3.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zm0 2a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM17 6.2a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/>',
  email: '<path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h13A2.5 2.5 0 0 1 21 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5v-11zm2.7-.5 6.3 4.4L18.3 6H5.7z"/>',
};

const icon = (name) =>
  `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">${ICONS[name]}</svg>`;

/** The address is split across two attributes and joined by script on click,
 *  so it never appears in the served HTML for address scrapers to harvest.
 *  Not secrecy — just not leaving it lying in the source. */
function mailButton(address, label, className, ariaLabel) {
  const at = String(address || '').indexOf('@');
  if (at < 1) return '';
  return `<button type="button" class="${className}"${ariaLabel ? ` aria-label="${esc(ariaLabel)}"` : ''}` +
    ` data-mail-user="${esc(address.slice(0, at))}" data-mail-domain="${esc(address.slice(at + 1))}">${label}</button>`;
}

function instructorBlock(course, t) {
  if (!course.instructorName) return '';

  const links = [
    ['instructorLinkedin', 'linkedin', 'LinkedIn'],
    ['instructorFacebook', 'facebook', 'Facebook'],
    ['instructorInstagram', 'instagram', 'Instagram'],
  ]
    .filter(([field]) => course[field])
    .map(([field, name, label]) =>
      `<li><a href="${esc(course[field])}" target="_blank" rel="noopener" aria-label="${esc(course.instructorName)} — ${label}">${icon(name)}</a></li>`
    );

  if (course.instructorEmail) {
    links.push(`<li>${mailButton(course.instructorEmail, icon('email'), 'social-btn', `${course.instructorName} — email`)}</li>`);
  }

  return `<div class="instructor">
      ${course.instructorLabel ? `<p class="instructor-label">${esc(course.instructorLabel)}</p>` : ''}
      <p class="instructor-name">${esc(course.instructorName)}</p>
      ${course.instructorRole ? `<p class="instructor-role">${esc(course.instructorRole)}</p>` : ''}
      ${links.length ? `<ul class="socials">${links.join('')}</ul>` : ''}
    </div>`;
}

function contactBlock(course) {
  const button = mailButton(course.contactEmail, esc(course.contactButton || 'Contact'), 'btn btn-ghost');
  if (!button) return '';
  return `<div class="contact">
      ${course.contactText ? `<p>${esc(course.contactText)}</p>` : ''}
      ${button}
    </div>`;
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
    ? `<div class="sec-head"><h2>${esc(course.appsHeading)}</h2></div>
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
    ${instructorBlock(course, t)}
    ${contactBlock(course)}
    ${course.note ? `<p class="small-print">${esc(course.note)}</p>` : ''}
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
  const sheet = existsSync(SHEET_DATA) ? await readJson(SHEET_DATA) : {};

  // Wording shared by every course in a language.
  const siteText = existsSync(SITE_TEXT) ? await readJson(SITE_TEXT) : {};

  const files = (await readdir(COURSES)).filter((f) => f.endsWith('.json'));
  const built = [];
  const seenSlugs = new Map();

  for (const file of files) {
    const own = await readJson(path.join(COURSES, file));
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
