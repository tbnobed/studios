import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { QRCodeSVG } from "qrcode.react";
import { Tv, Smartphone, Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { setAuthToken } from "@/lib/authUtils";
import { useAuth } from "@/hooks/useAuth";
import obLogo from "@/assets/ob-logo.png";

type PairState = {
  deviceCode: string;
  userCode: string;
};

// 10-foot login for OTT devices (Fire TV, Chromecast/Google TV, etc.). The TV
// shows a QR code + short code; the user approves it from their phone and the TV
// logs itself in automatically — no password typing with a remote.
export default function TvLogin() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading } = useAuth();
  const [pair, setPair] = useState<PairState | null>(null);
  const [status, setStatus] = useState<"loading" | "pending" | "error">("loading");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Already signed in on this device? Go straight to the TV home.
  useEffect(() => {
    if (!isLoading && isAuthenticated) setLocation("/tv");
  }, [isLoading, isAuthenticated, setLocation]);

  const startPairing = async () => {
    setStatus("loading");
    try {
      const res = await apiRequest("POST", "/api/tv/pair/start");
      const data = (await res.json()) as PairState;
      setPair(data);
      setStatus("pending");
    } catch {
      setStatus("error");
    }
  };

  useEffect(() => {
    startPairing();
  }, []);

  // Poll for approval. When the phone approves, the server returns a token.
  useEffect(() => {
    if (!pair?.deviceCode) return;
    const poll = async () => {
      try {
        const res = await apiRequest(
          "GET",
          `/api/tv/pair/status?deviceCode=${encodeURIComponent(pair.deviceCode)}`
        );
        const data = (await res.json()) as { status: string; token?: string };
        if (data.status === "approved" && data.token) {
          setAuthToken(data.token);
          await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
          setLocation("/tv");
        } else if (data.status === "expired") {
          // Code timed out — quietly request a fresh one.
          startPairing();
        }
      } catch {
        // Transient network error; keep polling.
      }
    };
    pollRef.current = setInterval(poll, 2500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [pair?.deviceCode, setLocation]);

  const pairUrl = pair
    ? `${window.location.origin}/tv/pair?code=${encodeURIComponent(pair.userCode)}`
    : "";

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-gray-900 via-slate-900 to-black text-white flex flex-col items-center justify-center p-10">
      <img src={obLogo} alt="OB" className="w-28 h-28 object-contain opacity-90 mb-2" />
      <h1 className="text-5xl font-extrabold tracking-tight mb-2">TBN Studios</h1>
      <p className="text-2xl text-white/70 mb-12 flex items-center gap-3">
        <Tv size={28} /> Living Room Mode
      </p>

      <div className="bg-white/5 border border-white/10 rounded-3xl p-12 flex flex-col md:flex-row items-center gap-12 max-w-4xl w-full">
        {/* QR */}
        <div className="bg-white rounded-2xl p-6 shrink-0">
          {pair ? (
            <QRCodeSVG value={pairUrl} size={260} level="M" includeMargin={false} />
          ) : (
            <div className="w-[260px] h-[260px] flex items-center justify-center text-gray-400">
              <Loader2 className="animate-spin" size={48} />
            </div>
          )}
        </div>

        {/* Instructions */}
        <div className="flex-1 text-center md:text-left">
          <h2 className="text-3xl font-bold mb-6 flex items-center justify-center md:justify-start gap-3">
            <Smartphone size={32} /> Sign in with your phone
          </h2>
          <ol className="space-y-4 text-xl text-white/80 mb-8 list-decimal list-inside">
            <li>Open the camera on your phone</li>
            <li>Scan the code on the left</li>
            <li>Tap <span className="font-semibold text-white">Allow this TV</span></li>
          </ol>

          <div className="text-white/60 text-lg">Or go to</div>
          <div className="text-2xl font-semibold text-white mb-4 break-all">
            {window.location.host}/tv/pair
          </div>
          <div className="text-white/60 text-lg">and enter this code:</div>
          <div className="mt-2 inline-block bg-white/10 border border-white/20 rounded-xl px-6 py-3 text-4xl font-mono font-bold tracking-[0.3em]">
            {pair ? pair.userCode : "·····"}
          </div>

          {status === "error" && (
            <div className="mt-6">
              <button
                onClick={startPairing}
                className="px-6 py-3 rounded-xl bg-primary text-primary-foreground text-xl font-semibold focus:outline-none focus:ring-4 focus:ring-primary/50"
                autoFocus
              >
                Try again
              </button>
            </div>
          )}
        </div>
      </div>

      <p className="mt-10 text-white/40 text-base flex items-center gap-2">
        <Loader2 className="animate-spin" size={18} /> Waiting for approval…
      </p>
    </div>
  );
}
