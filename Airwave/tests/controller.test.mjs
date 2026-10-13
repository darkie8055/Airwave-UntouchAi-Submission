import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { YouTubeController, findVideo } from '../src/youtube-controller.js';

// DOM-level tests: media properties are simulated here. These do not claim
// to exercise a real browser's decoder, autoplay policy, or live YouTube.
function setup(path = '/watch?v=fixture') {
  const dom = new JSDOM('<!doctype html><title>Fixture - YouTube</title><div class="html5-video-player"><video></video></div>', { url: `https://www.youtube.com${path}` });
  const win = dom.window, doc = win.document;
  Object.defineProperty(win, 'innerWidth', { value: 1000 });
  Object.defineProperty(win, 'innerHeight', { value: 800 });
  const video = doc.querySelector('video');
  const rect = { top: 50, left: 0, right: 640, bottom: 410, width: 640, height: 360 };
  video.getBoundingClientRect = () => rect;
  video.style.opacity = '1';
  let paused = true;
  Object.defineProperty(video, 'paused', { get: () => paused });
  Object.defineProperty(video, 'duration', { value: 60 });
  Object.defineProperty(video, 'seekable', { value: { length: 0 } });
  video.play = async () => { paused = false; };
  video.pause = () => { paused = true; };
  return { dom, win, doc, video, controller: new YouTubeController(doc, win) };
}
const settings = { seekSeconds: 10 };

test('controller selects the largest visible video and ignores hidden preloaders', () => {
  const { doc, win, video } = setup();
  const hidden = doc.createElement('video'); hidden.style.display = 'none';
  hidden.getBoundingClientRect = () => ({ left: 0, right: 1000, top: 0, bottom: 800 });
  doc.body.prepend(hidden);
  assert.equal(findVideo(doc, win), video);
});
test('controller applies play, pause, and mute state without toggling idempotent commands', async () => {
  const { controller, video } = setup();
  await controller.execute('play', settings); await controller.execute('play', settings);
  assert.equal(video.paused, false);
  await controller.execute('pause', settings); await controller.execute('pause', settings);
  assert.equal(video.paused, true);
  await controller.execute('toggle_mute', settings); assert.equal(video.muted, true);
  await controller.execute('toggle_mute', settings); assert.equal(video.muted, false);
  await controller.execute('toggle_play', settings); assert.equal(video.paused, false);
});
test('controller surfaces browser playback rejection as a useful instruction', async () => {
  const { controller, video } = setup();
  video.play = async () => { throw new Error('Autoplay blocked'); };
  await assert.rejects(controller.execute('play', settings), /Click the video once/);
});
test('controller changes speed in quarter steps and clamps both ends', async () => {
  const { controller, video } = setup();
  await controller.execute('speed_up', settings); assert.equal(video.playbackRate, 1.25);
  for (let i = 0; i < 12; i++) await controller.execute('speed_up', settings);
  assert.equal(video.playbackRate, 2);
  for (let i = 0; i < 12; i++) await controller.execute('speed_down', settings);
  assert.equal(video.playbackRate, 0.25);
});
test('controller skips and clamps while refusing to skip ads', async () => {
  const { controller, video, doc } = setup();
  video.currentTime = 20;
  await controller.execute('seek_forward', settings); assert.equal(video.currentTime, 30);
  await controller.execute('seek_backward', settings); assert.equal(video.currentTime, 20);
  video.currentTime = 56;
  assert.equal((await controller.execute('seek_forward', settings)).label, '+4 seconds');
  doc.querySelector('.html5-video-player').classList.add('ad-showing');
  await assert.rejects(controller.execute('seek_forward', settings), /during an ad/);
});
test('browsing works on a page without a video', async () => {
  const { controller, doc, win } = setup('/');
  doc.querySelector('video').remove();
  const root = { scrollTop: 100, scrollHeight: 3000 };
  Object.defineProperty(doc, 'scrollingElement', { value: root });
  let scroll;
  win.scrollBy = options => { scroll = options; };
  await controller.execute('browse_next', settings); assert.equal(scroll.top, 608);
  await controller.execute('browse_previous', settings); assert.equal(scroll.top, -608);
  await assert.rejects(controller.execute('play', settings), /Open a YouTube video/);
});
test('Shorts clicks visible enabled navigation and ignores hidden duplicate controls', async () => {
  const { controller, doc } = setup('/shorts/fixture');
  doc.body.insertAdjacentHTML('beforeend', '<button aria-label="Next video" style="display:none">Hidden</button><div id="navigation-button-down"><button>Next</button></div><div id="navigation-button-up"><button>Previous</button></div>');
  const counts = { next: 0, previous: 0 };
  for (const [id, key] of [['down', 'next'], ['up', 'previous']]) {
    const button = doc.querySelector(`#navigation-button-${id} button`);
    button.style.opacity = '1';
    button.getBoundingClientRect = () => ({ top: 10, left: 10, bottom: 60, right: 60 });
    button.addEventListener('click', () => counts[key]++);
  }
  await controller.execute('browse_next', settings); await controller.execute('browse_previous', settings);
  assert.deepEqual(counts, { next: 1, previous: 1 });
  doc.querySelector('#navigation-button-down button').disabled = true;
  await assert.rejects(controller.execute('browse_next', settings), /not ready/);
});
test('Shorts fallback scrolls the adjacent reel without selecting a hidden video', async () => {
  const { controller, doc, video } = setup('/shorts/fixture');
  const current = doc.createElement('ytd-reel-video-renderer');
  video.parentElement.replaceWith(current); current.append(video);
  const next = doc.createElement('ytd-reel-video-renderer'); doc.body.append(next);
  let scrolled = false;
  next.scrollIntoView = () => { scrolled = true; };
  const result = await controller.execute('browse_next', settings);
  assert.equal(result.label, 'Next Short'); assert.equal(scrolled, true);
});
test('status follows media state and rejects unrecognized actions', async () => {
  const { controller, video } = setup('/shorts/fixture');
  video.currentTime = 12; video.muted = true;
  assert.deepEqual(controller.status(), { ok: true, hasVideo: true, shorts: true, title: 'Fixture', paused: true, muted: true, rate: 1, time: 12, duration: 60 });
  await assert.rejects(controller.execute('arbitrary_action', settings), /Unknown action/);
});
