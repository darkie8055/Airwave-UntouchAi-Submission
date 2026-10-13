import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
// Avoid shell-glob differences between Windows cmd.exe and Unix shells.
const files = (await readdir('tests')).filter(name => name.endsWith('.test.mjs')).sort();
const result = spawnSync(process.execPath, ['--test', ...files.map(name => `tests/${name}`)], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
