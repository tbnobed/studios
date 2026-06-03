---
name: Audio meters need user activation in pop-out windows
description: Why the multiviewer audio bars read zero in a freshly opened pop-out wall and how it's worked around.
---

# Audio meters require user activation per document

The multiviewer audio bars (`useAudioLevel`) read from a Web Audio `AnalyserNode`.
The shared `AudioContext` is held **suspended** by the browser autoplay policy
until a user gesture happens *in that document*. A freshly `window.open`'d wall
is a new document with no gesture, so every meter sits at 0 — even though the
streams play (videos are `muted`, which autoplay allows). The main page works
only because the operator has already clicked there.

**Why a popup can't auto-resume:** a new top-level document starts without user
activation; `window.open` triggered by a click in the *parent* does not grant
activation to the *child* document. So the context cannot be resumed silently.

**How it's handled:** `useAudioLevel` exports `getSharedAudioContextState()` and
`resumeSharedAudioContext()`. `MultiviewerWall` polls the state and shows a
one-tap "Enable audio meters" overlay while suspended; the click resumes the
context and the overlay auto-hides once it's running.

**Known separate limitation:** HLS streams play through a `muted` media element,
so their `MediaElementSource` outputs silence and won't meter regardless of
activation. WebRTC `MediaStreamSource` meters fine once the context runs because
element `muted` doesn't gate the underlying MediaStream tracks.
