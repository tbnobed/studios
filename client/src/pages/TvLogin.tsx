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
    <div className="flex min-h-[100dvh] flex-col items-center justify-center overflow-y-auto bg-gradient-to-br from-gray-900 via-slate-900 to-black px-[4vw] py-[4vh] text-white">
      <img
        src={obLogo}
        alt="OB"
        className="h-[clamp(4.5rem,15vh,11rem)] w-auto object-contain opacity-90"
      />
      <h1 className="mt-[1vh] text-[clamp(1.4rem,3vw,2.5rem)] font-extrabold tracking-tight">
        TBN Studios
      </h1>
      <p className="mt-[0.5vh] mb-[2.5vh] flex items-center gap-2.5 text-[clamp(0.85rem,1.4vw,1.2rem)] text-white/70">
        <Tv size={22} /> Living Room Mode
      </p>

      <div className="flex w-full max-w-3xl flex-col items-center gap-[clamp(1rem,2.2vw,2.25rem)] rounded-3xl border border-white/10 bg-white/5 p-[clamp(1.25rem,2.4vw,2.25rem)] md:flex-row">
        {/* QR */}
        <div className="shrink-0 rounded-2xl bg-white p-[clamp(0.6rem,1vw,1.2rem)]">
          {pair ? (
            <QRCodeSVG
              value={pairUrl}
              size={260}
              level="M"
              includeMargin={false}
              className="h-[clamp(6.5rem,17vh,12rem)] w-[clamp(6.5rem,17vh,12rem)]"
            />
          ) : (
            <div className="flex h-[clamp(6.5rem,17vh,12rem)] w-[clamp(6.5rem,17vh,12rem)] items-center justify-center text-gray-400">
              <Loader2 className="animate-spin" size={40} />
            </div>
          )}
        </div>

        {/* Instructions */}
        <div className="flex-1 text-center md:text-left">
          <h2 className="mb-[1.5vh] flex items-center justify-center gap-2.5 text-[clamp(1.15rem,2vw,1.6rem)] font-bold md:justify-start">
            <Smartphone size={24} /> Sign in with your phone
          </h2>
          <ol className="mb-[2vh] list-inside list-decimal space-y-[0.9vh] text-[clamp(0.85rem,1.3vw,1.15rem)] text-white/80">
            <li>Open the camera on your phone</li>
            <li>Scan the code on the left</li>
            <li>Tap <span className="font-semibold text-white">Allow this TV</span></li>
          </ol>

          <div className="text-[clamp(0.75rem,1vw,0.95rem)] text-white/60">Or go to</div>
          <div className="mb-[1.2vh] break-all text-[clamp(0.95rem,1.5vw,1.25rem)] font-semibold text-white">
            {window.location.host}/tv/pair
          </div>
          <div className="text-[clamp(0.75rem,1vw,0.95rem)] text-white/60">and enter this code:</div>
          <div className="mt-[1vh] inline-block rounded-xl border border-white/20 bg-white/10 px-5 py-2.5 text-[clamp(1.5rem,2.6vw,2.25rem)] font-mono font-bold tracking-[0.3em]">
            {pair ? pair.userCode : "·····"}
          </div>

          {status === "error" && (
            <div className="mt-[2vh]">
              <button
                onClick={startPairing}
                className="rounded-xl bg-primary px-6 py-3 text-[clamp(1rem,1.6vw,1.35rem)] font-semibold text-primary-foreground focus:outline-none focus:ring-4 focus:ring-primary/50"
                autoFocus
              >
                Try again
              </button>
            </div>
          )}
        </div>
      </div>

      <p className="mt-[2.5vh] flex items-center gap-2 text-[clamp(0.8rem,1.1vw,1rem)] text-white/40">
        <Loader2 className="animate-spin" size={18} /> Waiting for approval…
      </p>
    </div>
  );
}
