// SRT ingest + WebRTC playback configuration for SRS.
//
// SRT is a contribution/ingest protocol — browsers can't play it directly.
// The flow is: an encoder PUSHES SRT to SRS (or SRS PULLS an external SRT
// source), and SRS republishes that feed as WebRTC (WHEP) under the same opaque
// stream key. The browser then plays the WebRTC version via StreamPlayer's
// normal WHEP path, so no player changes are needed.
//
// The stream key is ours to choose (any unique token); it ties the SRT publish
// URL and the WHEP playback URL together.

export const SRT_SERVER_HOST = "slorg1.obtv.io";
export const SRT_SERVER_PORT = 10080;
// SRS serves WebRTC (WHEP) playback for the SRT box over HTTPS.
export const SRT_PLAYBACK_ORIGIN = "https://slorg1.obtv.io";

// The encoder publish URL an operator pastes into OBS / their hardware encoder.
export function buildSrtIngestUrl(streamKey: string): string {
  return `srt://${SRT_SERVER_HOST}:${SRT_SERVER_PORT}?streamid=#!::r=live/${streamKey},m=publish`;
}

// The browser-playable WebRTC (WHEP) URL SRS produces for that key.
export function buildSrtPlaybackUrl(streamKey: string): string {
  return `${SRT_PLAYBACK_ORIGIN}/rtc/v1/whep/?app=live&stream=${streamKey}`;
}
