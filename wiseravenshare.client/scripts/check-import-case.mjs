// Find import specifiers whose letter-case does not match the real file on disk.
// Walks each relative specifier segment by segment and compares with -cne
// (case-sensitive) against the actual directory listing.
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';

const SRC = resolve(process.argv[2] || 'src');
const EXTS = ['.js', '.jsx', '.ts', '.tsx', '.mjs'];

function walk(dir, acc = []) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules') continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full, acc);
        else if (EXTS.includes(entry.name.slice(entry.name.lastIndexOf('.')))) acc.push(full);
    }
    return acc;
}

// Resolve a specifier to the real on-disk path, case-insensitively (like a
// bundler on Windows would) but also report whether an exact-case hit existed.
function resolveCaseInsensitive(fromDir, spec) {
    const parts = spec.split('/');
    let cur = fromDir;
    for (const part of parts) {
        if (part === '.' || part === '') continue;
        if (part === '..') { cur = dirname(cur); continue; }
        let entries;
        try { entries = readdirSync(cur); } catch { return null; }
        const exact = entries.find((e) => e === part);
        const loose = entries.find((e) => e.toLowerCase() === part.toLowerCase());
        const chosen = exact || loose;
        if (!chosen) return null;
        cur = join(cur, chosen);
    }
    if (existsSync(cur)) {
        try { if (statSync(cur).isFile()) return cur; } catch { /* ignore */ }
    }
    for (const ext of EXTS) {
        if (existsSync(cur + ext)) return cur + ext;
    }
    for (const ext of EXTS) {
        try {
            const hit = readdirSync(dirname(cur)).find(
                (e) => e.toLowerCase() === (cur.split(/[\\/]/).pop() + ext).toLowerCase()
            );
            if (hit) return join(dirname(cur), hit);
        } catch { /* ignore */ }
    }
    return null;
}

// Does every segment of the specifier match the real path with exact case?
function caseMismatchSegments(fromDir, spec, realPath) {
    const wrong = [];
    const parts = spec.split('/');
    let cur = fromDir;
    let realCur = realPath;
    // Walk forward, comparing the *chosen* name against what was written.
    for (const part of parts) {
        if (part === '.' || part === '') continue;
        if (part === '..') { cur = dirname(cur); continue; }
        let entries;
        try { entries = readdirSync(cur); } catch { break; }
        const loose = entries.find((e) => e.toLowerCase() === part.toLowerCase());
        if (loose && loose !== part) wrong.push({ wrote: part, actual: loose });
        if (loose) cur = join(cur, loose);
    }
    // Final leaf may have been an extension-less specifier.
    const realLeaf = realCur.split(/[\\/]/).pop();
    const specLeaf = parts[parts.length - 1];
    if (specLeaf && realLeaf.toLowerCase() !== specLeaf.toLowerCase()) {
        wrong.push({ wrote: specLeaf, actual: realLeaf });
    }
    return wrong;
}

const files = walk(SRC);
const results = [];
const IMPORT_RE = /(?:from\s+|import\s*\(\s*|require\(\s*)['"](\.[^'"]+)['"]/g;

for (const file of files) {
    let text;
    try { text = readFileSync(file, 'utf8'); } catch { continue; }
    const lines = text.split(/\r?\n/);
    lines.forEach((line, idx) => {
        IMPORT_RE.lastIndex = 0;
        let m;
        while ((m = IMPORT_RE.exec(line)) !== null) {
            const spec = m[1];
            const real = resolveCaseInsensitive(dirname(file), spec);
            if (!real) continue;
            const wrong = caseMismatchSegments(dirname(file), spec, real);
            if (wrong.length) {
                results.push({
                    file: relative(SRC, file).replace(/\\/g, '/'),
                    line: idx + 1,
                    spec,
                    wrong,
                    real: relative(SRC, real).replace(/\\/g, '/'),
                });
            }
        }
    });
}

console.log(`scanned ${files.length} files`);
console.log(`REAL case mismatches: ${results.length}`);
console.log('');
for (const r of results) {
    const detail = r.wrong.map((w) => `"${w.wrote}" -> "${w.actual}"`).join(', ');
    console.log(`${r.file}:${r.line}  ${r.spec}   [${detail}]`);
}
