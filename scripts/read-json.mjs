// JSON reader for the data files the team edits by hand in a browser.
//
// Plain JSON.parse rejects a trailing comma, which is the single most likely
// mistake when adding a line to a list — and the error it gives ("Unexpected
// token }") tells a non-programmer nothing. This tolerates trailing commas
// and reports failures with the file name and the offending line.
import { readFile } from 'node:fs/promises';

/** Removes commas that sit before a closing brace or bracket, ignoring
 *  anything inside a string so urls and text are never touched. */
export function stripTrailingCommas(text) {
  let out = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inString) {
      out += c;
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }

    if (c === '"') { inString = true; out += c; continue; }

    if (c === ',') {
      // Look ahead past whitespace: a closing bracket means this comma is
      // trailing and JSON.parse would reject it.
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j++;
      if (text[j] === '}' || text[j] === ']') continue;
    }

    out += c;
  }

  return out;
}

export async function readJson(file) {
  const raw = await readFile(file, 'utf8');

  try {
    return JSON.parse(stripTrailingCommas(raw));
  } catch (err) {
    // Point at the line rather than a character offset nobody can count to.
    const at = /position (\d+)/.exec(err.message);
    let where = '';
    if (at) {
      const upto = raw.slice(0, Number(at[1]));
      const line = upto.split('\n').length;
      where = `\n  line ${line}: ${(raw.split('\n')[line - 1] || '').trim()}`;
    }
    throw new Error(
      `${file} is not valid JSON.${where}\n` +
      `  Usually a missing comma between entries, or a missing " around a value.`
    );
  }
}
