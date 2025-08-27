/**
 * Simplified SRS SDK for WebRTC streaming
 * Based on the original SRS WebRTC implementation
 */

class SrsRtcWhipWhepAsync {
  constructor() {
    this.pc = new RTCPeerConnection({
      iceServers: [{urls: 'stun:stun.l.google.com:19302'}]
    });
    this.stream = null;
    this.sessionid = null;
  }

  async play(url, options = {}) {
    try {
      // Create a MediaStream for the video element
      this.stream = new MediaStream();
      
      // Add video track
      const videoTrack = this.createMockVideoTrack();
      this.stream.addTrack(videoTrack);
      
      // Add audio track if not video-only
      if (!options.videoOnly) {
        const audioTrack = this.createMockAudioTrack();
        this.stream.addTrack(audioTrack);
      }
      
      // Simulate session creation
      this.sessionid = this.generateSessionId();
      
      return {
        sessionid: this.sessionid,
        simulator: url.replace('webrtc://', 'http://') + '/simulator'
      };
    } catch (error) {
      console.error('SRS SDK Play Error:', error);
      throw error;
    }
  }

  close() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.pc) {
      this.pc.close();
    }
    this.sessionid = null;
  }

  createMockVideoTrack() {
    // Create a canvas for mock video content
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 360;
    const ctx = canvas.getContext('2d');
    
    // Create animated content
    let frame = 0;
    const animate = () => {
      // Clear canvas
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Draw animated content
      ctx.fillStyle = '#3b82f6';
      ctx.beginPath();
      ctx.arc(
        canvas.width/2 + Math.sin(frame * 0.05) * 100,
        canvas.height/2 + Math.cos(frame * 0.03) * 50,
        30,
        0,
        Math.PI * 2
      );
      ctx.fill();
      
      // Draw text
      ctx.fillStyle = '#ffffff';
      ctx.font = '24px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('LIVE STREAM', canvas.width/2, canvas.height/2 + 100);
      
      frame++;
      requestAnimationFrame(animate);
    };
    
    animate();
    
    // Get video track from canvas
    const stream = canvas.captureStream(30);
    return stream.getVideoTracks()[0];
  }

  createMockAudioTrack() {
    // Create silent audio track
    const audioContext = new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    gainNode.gain.value = 0; // Silent
    
    oscillator.start();
    
    const destination = audioContext.createMediaStreamDestination();
    gainNode.connect(destination);
    
    return destination.stream.getAudioTracks()[0];
  }

  generateSessionId() {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }
}

// Export to global scope
window.SrsRtcWhipWhepAsync = SrsRtcWhipWhepAsync;
