// check.mjs: a small set of checks for a small project.
//
// Run it from your project folder:
//
//     node checks/check.mjs
//
// Each check is one question with a yes or no answer. The script prints every answer and
// ends with an error if any answer is no, so another tool (a Git hook, a GitHub Action) can
// use it as a gate.
//
// It needs Node 22 or newer and nothing else. Change the checks to fit your project:
// each one is a few lines, and the list at the bottom says which ones run.
//
// What this does not look at: script written inside an HTML page, and files named inside CSS.
// What it cannot tell you: whether the design is good, or whether you understand it.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));

// The files Git tracks. If this folder is not a Git project yet, look at every file instead.
function projectFiles() {
  try {
    // -z gives exact names, one per NUL, so a file called 中文.js is checked like any other
    return execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
  } catch {
    const skip = new Set(['node_modules', '.git', 'dist', '__pycache__']);
    const walk = (dir) => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
      if (skip.has(entry.name)) return [];
      const file = path.posix.join(dir, entry.name);
      return entry.isDirectory() ? walk(file) : [file];
    });
    return walk('');
  }
}

// ---------- the checks ----------
// Each returns a list of problems. An empty list means the answer is yes.

// Can someone else find out what this is and how to run it?
function readmeSaysHowToRun() {
  if (!exists('README.md')) return ['There is no README.md'];
  const text = read('README.md');
  const problems = [];
  if (text.trim().length < 200) problems.push('README.md is very short: say what it is and who it is for');
  if (!/^#+\s.*\b(run|running|start|started|open|use|usage|install|setup|set up|try)\b/im.test(text)) problems.push('README.md has no heading about how to run or open the project');
  if (/\[(Replace|Describe|Your)\b[^\]]*\]/.test(text)) problems.push('README.md still has fill-in text in [brackets]');
  return problems;
}

// Is there an ignore file, and does it keep secrets out?
function ignoreRulesExist() {
  if (!exists('.gitignore')) return ['There is no .gitignore'];
  try { execFileSync('git', ['check-ignore', '-q', '.env'], { cwd: root, stdio: 'pipe' }); return []; }
  catch (error) {
    // exit 1 means Git would track .env; anything else means Git is not available here, so read the file instead
    if (error.status === 1) return ['.gitignore does not ignore .env'];
    return /^\.env\*?\s*$/m.test(read('.gitignore')) ? [] : ['.gitignore does not list .env'];
  }
}

// Is anything that looks like a key or password in a file Git tracks?
function noSecretsInTrackedFiles(files) {
  const patterns = [
    [/sk-[A-Za-z0-9_-]{20,}/, 'looks like an API key (sk-...)'],
    [/AIza[0-9A-Za-z_-]{30,}/, 'looks like a Google API key'],
    [/gh[pousr]_[A-Za-z0-9]{30,}/, 'looks like a GitHub token'],
    [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'is a private key'],
    [/(api[_-]?key|secret|password|token)\s*[:=]\s*["'][^"'\s]{16,}["']/i, 'has a key or password written into it'],
  ];
  const problems = [];
  for (const file of files) {
    if (/^\.env(\.|$)/.test(path.basename(file))) { problems.push(file + ' is tracked by Git; it should be ignored'); continue; }
    if (file === 'checks/check.mjs' || !/\.(js|mjs|ts|py|html|css|json|md|txt|yml|yaml|ino|h|cpp)$/i.test(file) || !exists(file)) continue;
    const text = read(file);
    for (const [pattern, what] of patterns) if (pattern.test(text)) problems.push(file + ' ' + what);
  }
  return problems;
}

// Does every picture, script and stylesheet a page asks for exist in the project?
function pagesFindTheirFiles(files) {
  const problems = [];
  for (const file of files.filter((name) => /\.html?$/i.test(name) && exists(name))) {
    for (const match of read(file).matchAll(/\b(?:src|href)\s*=\s*["']([^"'#?]+)/g)) {
      const target = match[1];
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(target) || target.includes('${')) continue;   // web addresses and site-root paths are not checked
      if (!exists(path.posix.join(path.posix.dirname(file), decodeURIComponent(target)))) problems.push(file + ' asks for ' + target + ', which is not in the project');
    }
  }
  return problems;
}

// Does the JavaScript at least read as JavaScript? (It may still do the wrong thing.)
function scriptsParse(files) {
  const problems = [];
  for (const file of files.filter((name) => /\.m?js$/i.test(name) && !name.includes('node_modules/') && !/(^|\/)(vendor|lib|libraries)\//.test(name) && !/\.min\.js$/.test(name) && exists(name))) {
    try { execFileSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'pipe' }); }
    catch (error) { problems.push(file + ' has a syntax error: ' + String(error.stderr || error.message).split('\n').find((line) => /Error/.test(line))); }
  }
  return problems;
}

// Is there a process record, and has it been written in?
function processRecordExists() {
  const file = ['process.md', 'PROCESS.md', 'docs/process.md'].find(exists);
  if (file) return read(file).trim() ? [] : [file + ' is empty'];
  // An existing README record is valid; another file or a line quota is not required.
  const section = exists('README.md') && read('README.md').match(/^##\s+Process(?:\s+and\s+evidence)?\s*\r?\n([\s\S]*?)(?=^##\s|$(?![\s\S]))/im);
  return section && section[1].trim() ? [] : ['Keep your process record under ## Process in README.md, or in process.md'];
}

// ---------- run them ----------
// Take a line out to skip a check; add your own in the same shape.
const files = projectFiles();
const checks = [
  ['README says what it is and how to run it', () => readmeSaysHowToRun()],
  ['Ignore rules exist and cover .env', () => ignoreRulesExist()],
  ['No key or password in a tracked file', () => noSecretsInTrackedFiles(files)],
  ['Every page finds its files', () => pagesFindTheirFiles(files)],
  ['Scripts have no syntax errors', () => scriptsParse(files)],
  ['The process record exists', () => processRecordExists()],
];

let failed = 0;
for (const [question, run] of checks) {
  const problems = run();
  console.log((problems.length ? 'NO   ' : 'yes  ') + question);
  for (const problem of problems) console.log('       ' + problem);
  if (problems.length) failed++;
}
console.log(failed ? '\n' + failed + ' of ' + checks.length + ' checks did not pass.' : '\nAll ' + checks.length + ' checks passed. Now look at it yourself.');
process.exit(failed ? 1 : 0);
