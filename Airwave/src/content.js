import { CHANNEL, sanitizeSettings } from './shared.js';
import { YouTubeController } from './youtube-controller.js';

const controller = new YouTubeController();
let toast;
let toastTimer;

function showToast(text) {
  if (!toast) {
    const host = document.createElement('div');
    host.id = 'airwave-feedback';
    const root = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = ':host{all:initial;position:fixed;inset:28px auto auto 50%;transform:translateX(-50%);z-index:2147483647;pointer-events:none}div{display:flex;align-items:center;gap:10px;padding:13px 20px;border:1px solid #8ce5c64d;border-radius:100px;background:#111d25ed;color:#effff8;font:600 15px system-ui,sans-serif;box-shadow:0 8px 36px #0006;opacity:0;transition:opacity .15s}div.on{opacity:1}b{color:#8ce5c6;font-size:18px}';
    const body = document.createElement('div');
    body.setAttribute('role', 'status');
    const mark = document.createElement('b'); mark.textContent = '〰';
    const label = document.createElement('span');
    body.append(mark, label); root.append(style, body);
    toast = { host, body, label };
  }
  const parent = document.fullscreenElement || document.documentElement;
  if (toast.host.parentElement !== parent) parent.append(toast.host);
  toast.label.textContent = text;
  toast.body.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.body.classList.remove('on'), 1500);
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || message?.channel !== CHANNEL) return;
  if (message.type === 'status') { respond(controller.status()); return; }
  if (message.type !== 'command') return;
  controller.execute(message.action, sanitizeSettings(message.settings)).then(result => {
    showToast(result.label); respond(result);
  }).catch(error => respond({ ok: false, error: error.message }));
  return true;
});
