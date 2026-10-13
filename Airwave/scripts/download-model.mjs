import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const model = new URL('../assets/gesture_recognizer.task', import.meta.url);
export const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task';
// Official versioned Google MediaPipe model; digest guards both cache and downloads.
const SHA256 = '97952348cf6a6a4915c2ea1496b4b37ebabc50cbbf80571435643c455f2b0482';
function valid(bytes) { return createHash('sha256').update(bytes).digest('hex') === SHA256; }
let cached;
try { cached = await readFile(model); } catch {}
if (cached && valid(cached)) console.log('Bundled gesture model verified.');
else {
  console.log('Downloading the versioned MediaPipe gesture model…');
  const response = await fetch(MODEL_URL, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`Model download failed: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!valid(bytes)) throw new Error('Model checksum mismatch; refusing to install it.');
  await mkdir(fileURLToPath(new URL('../assets/', import.meta.url)), { recursive: true });
  await writeFile(model, bytes);
  console.log('Gesture model downloaded and verified.');
}
