# DeckLink Multiviewer Output

A **standalone Windows app** that renders the OBTV Studio Manager multiviewer and outputs it to a
**Blackmagic DeckLink Duo 2** as **1080i59.94 SDI** with **embedded audio from one selected source**.

> This folder is completely self-contained. It does **not** import, modify, or depend on any code in
> the web app (`client/`, `server/`, `shared/`). It only *consumes* the running multiviewer over the
> network, by loading a URL in an offscreen browser window.

---

## How it works

```
OBTV multiviewer page  (public share link  /mv/:token)
        │   loaded offscreen in Electron at 1920x1080, ~59.94 progressive fps
        ▼
Electron main process
  ├─ VIDEO: offscreen 'paint' → BGRA frames → field-weave two progressive frames
  │         into one 1080i59.94 interlaced frame  (see src/frame-pipeline.js)
  └─ AUDIO: a Web Audio tap (src/preload.js) captures the audio of the one UNMUTED
            tile, converts to 48kHz PCM, and streams it to the main process over IPC
        │
        ▼
Native N-API addon  (native/decklink_output.cc)  — Windows + DeckLink SDK only
  └─ schedules video + audio onto the DeckLink Duo 2 output → SDI
```

Because only one tile is unmuted at a time in the multiviewer, capturing "all page audio" naturally
yields just that one source. The unmuted tile is the red-highlighted one in the UI.

---

## Prerequisites (on the Windows machine)

1. **Blackmagic DeckLink Duo 2** installed, with the **Desktop Video** driver.
   - Verify in *Blackmagic Desktop Video Setup* that at least one connector is set to **Output**.
2. **Blackmagic DeckLink SDK** — download from the Blackmagic support site (free).
   - You only need the `Win/include` folder (contains `DeckLinkAPI.idl`, `DeckLinkAPI_h.h`,
     `DeckLinkAPI_i.c`). Note its full path.
3. **Node.js 18+** (x64).
4. **Visual Studio Build Tools** with the *Desktop development with C++* workload (for `node-gyp`).
5. **Python 3** (required by `node-gyp`).

---

## Build & run

```powershell
cd decklink-multiviewer

# 1. Tell node-gyp where the DeckLink SDK include folder is
setx DECKLINK_SDK "C:\path\to\Blackmagic DeckLink SDK 12.x\Win\include"
# (open a new terminal so the variable is picked up)

# 2. Install JS deps
npm install

# 3. Build the native DeckLink addon
npm run rebuild-addon

# 4. Configure
copy config.example.json config.json
#   then edit config.json — at minimum set "multiviewerUrl" to your /mv/<token> share link

# 5. Run
npm start
```

To get a share link: in the web app, open the multiviewer layout you want on the wall, use
**Share** to create a public link, and copy the `/mv/<token>` URL into `config.json`.

---

## 1080i59.94 notes (important)

Browsers render **progressive** frames, but 1080i needs **interlaced** ones. This app renders the
page at ~59.94 progressive fps and **weaves two consecutive frames into one interlaced frame**
(upper field first / field-1-dominant, which is correct for 1080i). The DeckLink output is clocked
at 30000/1001 ≈ 29.97 interlaced frames per second (59.94 fields/s), timeScale `60000`,
frameDuration `1001`.

Field dominance and cadence are the most likely things to need tuning on real hardware — see
`FIELD_ORDER` in `src/frame-pipeline.js` if motion looks juddery or combed.

---

## Status / roadmap

- [x] Project structure, fully isolated from the web app
- [x] Electron offscreen render of the multiviewer
- [x] Progressive → 1080i59.94 field weaving
- [x] Web Audio tap of the unmuted source → PCM over IPC
- [x] Native DeckLink addon: video + embedded audio scheduling (1080i59.94)
- [ ] **Verify/tune on real DeckLink Duo 2 hardware** (cannot be done off-Windows)
- [ ] Performance pass: zero-copy GPU shared-texture path instead of CPU BGRA copies
- [ ] Genlock / reference input, multiple simultaneous outputs (Duo 2 has 4 channels)
- [ ] Audio mix of multiple sources (currently single source by design)

Everything except the last three boxes is scaffolded here; the hardware verification and tuning
happen on the Windows box because the DeckLink SDK is native Windows COM and can't compile or run
on this Linux environment.
