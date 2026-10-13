import { sanitizeSettings } from './shared.js';

export const POSES = Object.freeze({
  Open_Palm: { action: 'play', label: 'Open palm' },
  Closed_Fist: { action: 'pause', label: 'Closed fist' },
  Victory: { action: 'toggle_mute', label: 'Peace sign' },
  Thumb_Up: { action: 'speed_up', label: 'Thumbs up' },
  Thumb_Down: { action: 'speed_down', label: 'Thumbs down' },
  Pointing_Up: { action: null, label: 'Point & swipe' }
});

/** Pure, clock-injected gesture state machine. No DOM, model or Chrome dependencies. */
export class GestureEngine {
  constructor(settings) { this.configure(settings); this.reset(); }
  configure(settings) { this.settings = sanitizeSettings(settings); }
  reset() {
    this.candidate = null;
    this.since = 0;
    this.lastSeen = null;
    this.neutralSince = null;
    this.lastAction = -Infinity;
    this.latched = false;
    this.firedPose = null;
    this.anchor = null;
    this.previousTime = -Infinity;
  }

  update(sample, now) {
    // Never carry partial evidence across a stalled camera / hidden panel.
    if (now < this.previousTime || now - this.previousTime > 300) this.clearCandidate();
    this.previousTime = now;
    const pose = sample?.name;
    const confident = POSES[pose] && sample.score >= this.settings.confidence;
    if (!confident) {
      if (this.neutralSince === null) this.neutralSince = now;
      // Short classifier flicker must not unlatch a held gesture.
      if (now - this.neutralSince >= 260) this.clearCandidate();
      return { label: sample?.hasHand ? 'Gesture unclear' : 'Show one hand', progress: 0, action: null };
    }
    this.neutralSince = null;
    if (pose !== this.candidate) {
      this.candidate = pose;
      this.since = now;
      this.latched = this.firedPose === pose;
      this.anchor = null;
    }
    this.lastSeen = now;
    const info = { label: POSES[pose].label, progress: 0, action: null };
    if (this.latched) return { ...info, progress: 1, label: 'Relax your hand to repeat' };
    if (now - this.lastAction < this.settings.cooldownMs) return { ...info, label: 'Ready in a moment' };

    if (pose === 'Pointing_Up') {
      if (!sample.position || !Number.isFinite(sample.position.x) || !Number.isFinite(sample.position.y)) return info;
      // Coordinate space matches the displayed preview; default is mirrored.
      const point = { x: this.settings.mirror ? 1 - sample.position.x : sample.position.x, y: sample.position.y };
      if (!this.anchor || now - this.anchor.at > 850) {
        this.anchor = { ...point, at: now };
        return { ...info, label: 'Point, then swipe' };
      }
      const dx = point.x - this.anchor.x;
      const dy = point.y - this.anchor.y;
      const distance = Math.max(Math.abs(dx), Math.abs(dy));
      info.progress = Math.min(distance / this.settings.swipeDistance, 1);
      // Reject diagonals, implausible single-frame jumps and tiny jitter.
      const dominant = Math.max(Math.abs(dx), Math.abs(dy)) > Math.min(Math.abs(dx), Math.abs(dy)) * 1.5;
      if (now - this.anchor.at >= 100 && distance >= this.settings.swipeDistance && distance < 0.65 && dominant) {
        const action = Math.abs(dx) > Math.abs(dy)
          ? (dx > 0 ? 'seek_forward' : 'seek_backward')
          : (dy < 0 ? 'browse_next' : 'browse_previous');
        return this.fire(action, now, info);
      }
      return info;
    }
    info.progress = Math.min((now - this.since) / this.settings.holdMs, 1);
    if (info.progress >= 1) return this.fire(POSES[pose].action, now, info);
    return info;
  }

  clearCandidate() { this.candidate = null; this.anchor = null; this.latched = false; this.firedPose = null; }
  fire(action, now, info) {
    this.latched = true;
    this.firedPose = this.candidate;
    this.lastAction = now;
    return { ...info, progress: 1, action };
  }
}

export function sampleFromResult(result) {
  const points = result.landmarks?.[0];
  const category = result.gestures?.[0]?.[0];
  return {
    hasHand: Boolean(points?.length), name: category?.categoryName || 'None', score: category?.score || 0,
    // Palm centroid is less jittery than the index fingertip during a swipe.
    position: points?.length >= 18 ? {
      x: (points[0].x + points[5].x + points[9].x + points[17].x) / 4,
      y: (points[0].y + points[5].y + points[9].y + points[17].y) / 4
    } : null
  };
}
