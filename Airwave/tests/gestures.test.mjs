import test from 'node:test';
import assert from 'node:assert/strict';
import { GestureEngine, sampleFromResult } from '../src/gesture-engine.js';
import { sanitizeSettings, isYouTube } from '../src/shared.js';
import { seekTarget } from '../src/youtube-controller.js';

const pose = (name, score = 0.95, position = { x: 0.5, y: 0.5 }) => ({ name, score, position, hasHand: true });
const hold = (engine, sample, start, duration, step = 50) => {
  const actions = [];
  for (let time = start; time <= start + duration; time += step) {
    const result = engine.update(sample, time);
    if (result.action) actions.push({ action: result.action, time });
  }
  return actions;
};

test('all five static poses map to the requested controls', () => {
  for (const [name, action] of Object.entries({ Open_Palm: 'play', Closed_Fist: 'pause', Victory: 'toggle_mute', Thumb_Up: 'speed_up', Thumb_Down: 'speed_down' })) {
    assert.deepEqual(hold(new GestureEngine(), pose(name), 0, 700).map(x => x.action), [action]);
  }
});
test('a held peace sign does not repeatedly toggle mute', () => {
  assert.equal(hold(new GestureEngine(), pose('Victory'), 0, 10000).length, 1);
});
test('sub-threshold confidence and unknown gestures never issue commands', () => {
  for (const sample of [pose('Open_Palm', 0.64), pose('None'), null]) assert.equal(hold(new GestureEngine(), sample, 0, 3000).length, 0);
});
test('short classifier flicker cannot retrigger a latched action', () => {
  const engine = new GestureEngine();
  hold(engine, pose('Victory'), 0, 1000);
  hold(engine, null, 1050, 150);
  assert.equal(hold(engine, pose('Victory'), 1250, 2000).length, 0);
});
test('a relaxed hand rearms the gesture after cooldown', () => {
  const engine = new GestureEngine();
  hold(engine, pose('Victory'), 0, 1000);
  hold(engine, null, 1050, 300);
  assert.equal(hold(engine, pose('Victory'), 1400, 700).length, 1);
});
test('one competing classification frame cannot unlatch a held pose', () => {
  const engine = new GestureEngine();
  hold(engine, pose('Victory'), 0, 1100);
  engine.update(pose('Open_Palm'), 1150);
  assert.equal(hold(engine, pose('Victory'), 1200, 2000).length, 0);
});
test('global cooldown prevents rapid alternation', () => {
  const engine = new GestureEngine();
  hold(engine, pose('Open_Palm'), 0, 550);
  assert.equal(hold(engine, pose('Closed_Fist'), 600, 850).length, 0);
  assert.equal(hold(engine, pose('Closed_Fist'), 1500, 200).length, 1);
});
test('brief detections and long frame stalls cannot complete a hold', () => {
  const engine = new GestureEngine();
  assert.equal(hold(engine, pose('Open_Palm'), 0, 300).length, 0);
  assert.equal(engine.update(pose('Open_Palm'), 2000).action, null);
  assert.equal(hold(engine, pose('Open_Palm'), 2050, 200).length, 0);
});
test('swipes follow the mirrored preview in all four directions', () => {
  for (const [position, action] of [
    [{ x: 0.3, y: 0.5 }, 'seek_forward'], [{ x: 0.7, y: 0.5 }, 'seek_backward'],
    [{ x: 0.5, y: 0.3 }, 'browse_next'], [{ x: 0.5, y: 0.7 }, 'browse_previous']
  ]) {
    const engine = new GestureEngine();
    engine.update(pose('Pointing_Up'), 0);
    assert.equal(engine.update(pose('Pointing_Up', 0.95, position), 150).action, action);
    assert.equal(engine.update(pose('Pointing_Up', 0.95, position), 200).action, null);
  }
});
test('non-mirrored preview reverses horizontal swipe interpretation', () => {
  const engine = new GestureEngine({ mirror: false });
  engine.update(pose('Pointing_Up'), 0);
  assert.equal(engine.update(pose('Pointing_Up', 0.95, { x: 0.7, y: 0.5 }), 150).action, 'seek_forward');
});
test('diagonal and small accidental movements do not trigger navigation', () => {
  for (const position of [{ x: 0.52, y: 0.51 }, { x: 0.3, y: 0.3 }]) {
    const engine = new GestureEngine(); engine.update(pose('Pointing_Up'), 0);
    assert.equal(engine.update(pose('Pointing_Up', 0.95, position), 150).action, null);
  }
});
test('no landmarks and empty model output are safe', () => {
  assert.deepEqual(sampleFromResult({}), { hasHand: false, name: 'None', score: 0, position: null });
});
test('persisted settings are validated and clamped', () => {
  const result = sanitizeSettings({ confidence: NaN, holdMs: 0, cooldownMs: 99999, seekSeconds: 'bad', mirror: 'false' });
  assert.equal(result.confidence, 0.65); assert.equal(result.holdMs, 300); assert.equal(result.cooldownMs, 2500);
  assert.equal(result.seekSeconds, 10); assert.equal(result.mirror, true);
});
test('only the exact HTTPS desktop YouTube origin is allowed', () => {
  assert.equal(isYouTube('https://www.youtube.com/watch?v=test'), true);
  for (const url of ['https://youtube.com.evil.org/', 'https://www.youtube.com.evil.org', 'http://www.youtube.com', 'data:text/html,hello', undefined]) assert.equal(isYouTube(url), false);
});
test('seek clamps VOD at both ends and rejects unseekable streams', () => {
  const video = { duration: 60, currentTime: 55 };
  assert.equal(seekTarget(video, 10), 60); assert.equal(seekTarget(video, -100), 0);
  assert.throws(() => seekTarget({ duration: Infinity, currentTime: 0 }, 10), /not seekable/);
});
test('seek clamps live DVR and resolves gaps to a seekable boundary', () => {
  const seekable = { length: 2, start: index => [40, 80][index], end: index => [70, 100][index] };
  assert.equal(seekTarget({ duration: Infinity, currentTime: 90, seekable }, 30), 100);
  assert.equal(seekTarget({ duration: Infinity, currentTime: 50, seekable }, -30), 40);
  assert.equal(seekTarget({ duration: Infinity, currentTime: 68, seekable }, 8), 80);
});
