'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

const { FieldWeaver } = require('./frame-pipeline');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
function loadConfig() {
  const configPath = path.join(__dirname, '..', 'config.json');
  if (!fs.existsSync(configPath)) {
    console.error(
      '[config] config.json not found. Copy config.example.json to config.json and edit it.'
    );
    app.exit(1);
    return null;
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

const config = loadConfig();

// The native DeckLink addon only exists after it has been built on Windows
// (npm run rebuild-addon). We keep startup working without it so the renderer
// pipeline can still be developed/inspected on other platforms.
let decklink = null;
try {
  decklink = require('../native');
} catch (err) {
  console.warn(
    '[decklink] native addon not loaded — running WITHOUT SDI output.\n' +
      '           Build it on Windows with: npm run rebuild-addon\n' +
      `           (${err.message})`
  );
}

// ---------------------------------------------------------------------------
// Output pipeline
// ---------------------------------------------------------------------------
let weaver = null;

function startOutput() {
  const { width, height, deviceIndex } = config.output;

  if (decklink) {
    decklink.init({
      width,
      height,
      mode: config.output.mode || '1080i5994',
      deviceIndex: deviceIndex || 0,
      audioEnabled: !!(config.audio && config.audio.enabled),
      audioChannels: (config.audio && config.audio.channels) || 2,
      audioSampleRate: (config.audio && config.audio.sampleRate) || 48000,
    });
  }

  // Two progressive frames become one interlaced frame. onFrame fires at the
  // interlaced rate (~29.97/s) with a ready-to-send BGRA buffer.
  weaver = new FieldWeaver(width, height, (interlacedBgra) => {
    if (decklink) decklink.pushVideoFrame(interlacedBgra);
  });
}

function stopOutput() {
  try {
    if (decklink) decklink.stop();
  } catch (err) {
    console.warn('[decklink] stop() failed:', err.message);
  }
}

// ---------------------------------------------------------------------------
// Audio from the renderer (the one unmuted tile), forwarded to the card
// ---------------------------------------------------------------------------
ipcMain.on('audio-pcm', (_event, chunk) => {
  // chunk is a Buffer of interleaved 16-bit signed PCM at config.audio.sampleRate.
  if (decklink && config.audio && config.audio.enabled) {
    decklink.pushAudio(Buffer.from(chunk));
  }
});

// ---------------------------------------------------------------------------
// Offscreen window that renders the multiviewer
// ---------------------------------------------------------------------------
let offscreen = null;
let debugWindow = null;

function createWindows() {
  const { width, height } = config.output;

  offscreen = new BrowserWindow({
    width,
    height,
    show: false,
    webPreferences: {
      offscreen: true,
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false,
      // The preload needs to read our config and reach IPC.
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Render close to 59.94 progressive fps; the weaver pairs frames into 1080i.
  offscreen.webContents.setFrameRate(60);

  // Make the audio config available to the preload before the page loads.
  offscreen.webContents.on('did-finish-load', () => {
    offscreen.webContents.send('output-config', {
      audio: config.audio || { enabled: false },
    });
  });

  offscreen.webContents.on('paint', (_event, _dirty, image) => {
    // image is a NativeImage; getBitmap() returns a BGRA buffer (premultiplied).
    if (weaver) weaver.pushProgressive(image.getBitmap());
    if (debugWindow && !debugWindow.isDestroyed()) {
      // Cheap mirror for debugging: draw nothing here; debug window loads same URL.
    }
  });

  offscreen.loadURL(config.multiviewerUrl);

  if (config.debug && config.debug.showWindow) {
    debugWindow = new BrowserWindow({
      width: Math.round(width / 2),
      height: Math.round(height / 2),
      title: 'DeckLink Multiviewer (debug mirror)',
    });
    debugWindow.loadURL(config.multiviewerUrl);
  }
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
app.whenReady().then(() => {
  if (!config) return;
  startOutput();
  createWindows();
});

app.on('window-all-closed', () => {
  stopOutput();
  app.quit();
});

app.on('before-quit', stopOutput);
