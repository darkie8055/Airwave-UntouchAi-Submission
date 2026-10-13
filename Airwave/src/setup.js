import { cameraError } from './shared.js';
const button = document.querySelector('#allow-camera');
const result = document.querySelector('#setup-result');
let stream;
button.addEventListener('click', async () => {
  button.disabled = true;
  result.textContent = 'Waiting for camera permission…';
  result.className = '';
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    stream.getTracks().forEach(track => track.stop());
    stream = null;
    result.textContent = 'Camera access is ready. The camera is now off. Return to YouTube, open Airwave, and click Start camera.';
    result.className = 'setup-success';
    button.textContent = 'Test camera access again';
  } catch (error) { result.textContent = cameraError(error); }
  finally { button.disabled = false; }
});
window.addEventListener('pagehide', () => stream?.getTracks().forEach(track => track.stop()));
