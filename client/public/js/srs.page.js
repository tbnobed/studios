/**
 * SRS Page utilities for WebRTC streaming
 */

// Format statistics from WebRTC connection
function SrsRtcFormatStats(stats, kind) {
  let result = '';
  
  stats.forEach((report) => {
    if (report.type === 'inbound-rtp' && report.mediaType === kind) {
      if (kind === 'video') {
        result = `${report.frameWidth}x${report.frameHeight}@${report.framesPerSecond}fps`;
      } else if (kind === 'audio') {
        result = `${Math.round(report.audioLevel * 100)}% volume`;
      }
    }
  });
  
  return result || `${kind} stream active`;
}

// Parse query string parameters
function parse_query_string() {
  const params = new URLSearchParams(window.location.search);
  const result = {};
  
  for (const [key, value] of params.entries()) {
    result[key] = value;
  }
  
  return result;
}

// Initialize WHEP URL input
function srs_init_whep(selector, query) {
  const element = document.querySelector(selector);
  if (!element) return;
  
  // Set default stream URL if provided in query
  if (query.url) {
    element.value = query.url;
  } else if (query.stream) {
    element.value = `webrtc://localhost:1985/live/${query.stream}`;
  }
}

// Export to global scope
window.SrsRtcFormatStats = SrsRtcFormatStats;
window.parse_query_string = parse_query_string;
window.srs_init_whep = srs_init_whep;
