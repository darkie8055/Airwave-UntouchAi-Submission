import { ACTIONS } from './shared.js';

export function visibleArea(element, win = window) {
  const rect = element.getBoundingClientRect();
  const style = win.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return 0;
  return Math.max(0, Math.min(rect.right, win.innerWidth) - Math.max(rect.left, 0)) *
    Math.max(0, Math.min(rect.bottom, win.innerHeight) - Math.max(rect.top, 0));
}

export function findVideo(doc = document, win = window) {
  const videos = [...doc.querySelectorAll('video')];
  return videos.map(video => ({ video, area: visibleArea(video, win) }))
    .filter(item => item.area > 0).sort((a, b) => b.area - a.area)[0]?.video || null;
}

export function seekTarget(video, delta) {
  if (!Number.isFinite(delta)) throw new Error('Invalid skip amount.');
  // Respect the DVR window of a live stream as well as ordinary VOD bounds.
  if (video.seekable?.length) {
    const ranges = video.seekable;
    const desired = video.currentTime + delta;
    for (let i = 0; i < ranges.length; i++) {
      if (desired >= ranges.start(i) && desired <= ranges.end(i)) return desired;
    }
    const edges = [];
    for (let i = 0; i < ranges.length; i++) edges.push(ranges.start(i), ranges.end(i));
    return edges.reduce((best, edge) => Math.abs(edge - desired) < Math.abs(best - desired) ? edge : best);
  }
  if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error('This video is not seekable yet.');
  return Math.min(video.duration, Math.max(0, video.currentTime + delta));
}

export class YouTubeController {
  constructor(doc = document, win = window) { this.doc = doc; this.win = win; }
  status() {
    const video = findVideo(this.doc, this.win);
    return {
      ok: true, hasVideo: Boolean(video), shorts: this.win.location.pathname.startsWith('/shorts/'),
      title: this.doc.title.replace(/ - YouTube$/, ''), paused: video?.paused ?? true,
      muted: video?.muted ?? false, rate: video?.playbackRate ?? 1,
      time: Number.isFinite(video?.currentTime) ? video.currentTime : 0,
      duration: Number.isFinite(video?.duration) ? video.duration : null
    };
  }

  async execute(action, settings) {
    if (!Object.hasOwn(ACTIONS, action)) throw new Error('Unknown action.');
    if (action.startsWith('browse_')) return this.browse(action === 'browse_next' ? 1 : -1);
    const video = findVideo(this.doc, this.win);
    if (!video) throw new Error('Open a YouTube video or Short first. Scrolling works on the home page.');
    let label = ACTIONS[action];
    switch (action) {
      case 'play':
      case 'toggle_play':
        if (action === 'toggle_play' && !video.paused) { video.pause(); label = 'Paused'; }
        else {
          try { await video.play(); label = 'Playing'; }
          catch { throw new Error('Click the video once to allow playback, then use gestures.'); }
        }
        break;
      case 'pause': video.pause(); label = 'Paused'; break;
      case 'toggle_mute': video.muted = !video.muted; label = video.muted ? 'Muted' : 'Sound on'; break;
      case 'seek_forward':
      case 'seek_backward': {
        if (this.doc.querySelector('.html5-video-player.ad-showing')) throw new Error('Skipping is unavailable during an ad.');
        const delta = settings.seekSeconds * (action === 'seek_forward' ? 1 : -1);
        const previousTime = video.currentTime;
        video.currentTime = seekTarget(video, delta);
        const actual = Math.round(video.currentTime - previousTime);
        label = actual === 0 ? 'At the video boundary' : `${actual > 0 ? '+' : '−'}${Math.abs(actual)} seconds`;
        break;
      }
      case 'speed_up':
      case 'speed_down':
        video.playbackRate = Math.max(0.25, Math.min(2, Math.round((video.playbackRate + (action === 'speed_up' ? 0.25 : -0.25)) * 4) / 4));
        label = `${video.playbackRate}× speed`;
        break;
    }
    return { ...this.status(), label };
  }

  browse(direction) {
    const shorts = this.win.location.pathname.startsWith('/shorts/');
    if (!shorts) {
      const root = this.doc.scrollingElement;
      const atBoundary = direction < 0 ? root.scrollTop <= 0
        : root.scrollTop + this.win.innerHeight >= root.scrollHeight - 2;
      this.win.scrollBy({ top: direction * this.win.innerHeight * 0.76, behavior: 'smooth' });
      return { ...this.status(), label: atBoundary ? (direction > 0 ? 'End of page' : 'Top of page') : (direction > 0 ? 'Scrolling down' : 'Scrolling up') };
    }
    const selectors = direction > 0
      ? ['#navigation-button-down button', 'button#navigation-button-down', 'button[aria-label="Next video"]', 'button[aria-label="Next Short"]']
      : ['#navigation-button-up button', 'button#navigation-button-up', 'button[aria-label="Previous video"]', 'button[aria-label="Previous Short"]'];
    for (const selector of selectors) {
      const button = [...this.doc.querySelectorAll(selector)].find(el => !el.disabled && el.getAttribute('aria-disabled') !== 'true' && visibleArea(el, this.win) > 0);
      if (button) { button.click(); return { ...this.status(), label: direction > 0 ? 'Next Short' : 'Previous Short' }; }
    }
    const renderers = [...this.doc.querySelectorAll('ytd-reel-video-renderer, yt-reel-video-renderer')];
    const current = findVideo(this.doc, this.win)?.closest('ytd-reel-video-renderer, yt-reel-video-renderer');
    const index = renderers.indexOf(current);
    const next = index >= 0 ? renderers[index + direction] : null;
    if (next) {
      next.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return { ...this.status(), label: direction > 0 ? 'Next Short' : 'Previous Short' };
    }
    throw new Error(direction < 0 ? 'No previous Short is available.' : 'The next Short is not ready. Wait a moment and try again.');
  }
}
