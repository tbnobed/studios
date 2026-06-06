'use strict';

// Runs inside the offscreen renderer alongside the loaded multiviewer page.
// It does NOT modify the page's code — it only observes/instruments it at
// runtime from Electron's preload context:
//   1. (optional) clicks the configured tile's unmute button
//   2. taps the audio of whatever <video>/<audio> elements are unmuted,
//      converts it to 16-bit PCM, and ships it to the main process.

const { ipcRenderer } = require('electron');

let audioConfig = { enabled: false };

ipcRenderer.on('output-config', (_event, cfg) => {
  audioConfig = cfg.audio || { enabled: false };
  if (audioConfig.enabled) {
    setTimeout(setupAudioTap, 1500); // let the page mount its tiles first
    if (audioConfig.autoUnmuteSlot != null) {
      setTimeout(() => autoUnmute(audioConfig.autoUnmuteSlot), 2500);
    }
  }
});

// --- auto-unmute a specific tile ------------------------------------------
function autoUnmute(slotIndex) {
  // MultiviewerTile renders <button data-testid="button-mute-<streamId>">.
  // DOM order follows slot order, so index maps to the tile position.
  const buttons = Array.from(
    document.querySelectorAll('[data-testid^="button-mute-"]')
  );
  const btn = buttons[slotIndex];
  if (btn) {
    // aria-label is "Unmute audio" when currently muted.
    const isMuted = (btn.getAttribute('aria-label') || '')
      .toLowerCase()
      .includes('unmute');
    if (isMuted) btn.click();
  }
}

// --- audio tap -------------------------------------------------------------
function setupAudioTap() {
  const sampleRate = audioConfig.sampleRate || 48000;
  const channels = audioConfig.channels || 2;
  const ctx = new AudioContext({ sampleRate });

  // Mix node that everything connects into.
  const mix = ctx.createGain();

  // ScriptProcessor is deprecated but needs no module loading (robust against
  // the remote page's CSP). Buffer of 2048 frames keeps IPC traffic sane.
  const processor = ctx.createScriptProcessor(2048, channels, channels);
  mix.connect(processor);
  processor.connect(ctx.destination); // keep audio audible/flowing

  processor.onaudioprocess = (e) => {
    const inBuf = e.inputBuffer;
    const frames = inBuf.length;
    const out = Buffer.allocUnsafe(frames * channels * 2); // 16-bit
    for (let ch = 0; ch < channels; ch++) {
      const data = inBuf.getChannelData(Math.min(ch, inBuf.numberOfChannels - 1));
      for (let i = 0; i < frames; i++) {
        let s = Math.max(-1, Math.min(1, data[i]));
        s = s < 0 ? s * 0x8000 : s * 0x7fff;
        out.writeInt16LE(s | 0, (i * channels + ch) * 2);
      }
    }
    ipcRenderer.send('audio-pcm', out);
  };

  // Connect existing and future media elements into the mix. A muted element
  // contributes silence, so only the unmuted tile is actually heard/captured.
  const tapped = new WeakSet();
  function tapAll() {
    document.querySelectorAll('video, audio').forEach((el) => {
      if (tapped.has(el)) return;
      try {
        const src = ctx.createMediaElementSource(el);
        src.connect(mix);
        tapped.add(el);
      } catch (_err) {
        // createMediaElementSource throws if already tapped; ignore.
      }
    });
  }
  tapAll();
  setInterval(tapAll, 2000); // catch tiles added later

  // Browsers start AudioContext suspended until a gesture; resume aggressively.
  const resume = () => ctx.resume().catch(() => {});
  resume();
  setInterval(resume, 3000);
}
