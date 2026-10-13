import { build } from 'esbuild';
import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const model = new URL('../assets/gesture_recognizer.task', import.meta.url);
try { await readFile(model); } catch { throw new Error('Missing model. Run npm run setup first.'); }
await rm('extension', { recursive: true, force: true });
await mkdir('extension/models', { recursive: true });
await mkdir('extension/vendor', { recursive: true });
await build({
  entryPoints: ['src/panel.js', 'src/background.js', 'src/setup.js'], outdir: 'extension',
  bundle: true, format: 'esm', target: 'chrome116', legalComments: 'eof', sourcemap: false
});
await build({ entryPoints: ['src/content.js'], outdir: 'extension', bundle: true, format: 'iife', target: 'chrome116' });
for (const file of ['manifest.json', 'panel.html', 'panel.css', 'setup.html']) await cp(`src/${file}`, `extension/${file}`);
await cp('assets/icons', 'extension/icons', { recursive: true });
await cp(model, 'extension/models/gesture_recognizer.task');
await cp('node_modules/@mediapipe/tasks-vision/wasm', 'extension/vendor/wasm', { recursive: true });
await cp('node_modules/@mediapipe/tasks-vision/vision_bundle.mjs', 'extension/vendor/vision_bundle.mjs');
await cp('assets/MEDIAPIPE-LICENSE', 'extension/vendor/MEDIAPIPE-LICENSE');
await cp('THIRD_PARTY_NOTICES.md', 'extension/THIRD_PARTY_NOTICES.md');
const bytes = await readFile(model);
await writeFile('extension/build-info.json', JSON.stringify({
  name: 'Airwave', version: '1.0.0', model: 'Google MediaPipe Gesture Recognizer, float16, version 1',
  modelSha256: createHash('sha256').update(bytes).digest('hex'), mediapipe: '0.10.32'
}, null, 2) + '\n');
console.log('Built extension/. Load this folder at chrome://extensions.');
