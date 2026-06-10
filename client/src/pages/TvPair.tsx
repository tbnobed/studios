import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tv, CheckCircle2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { setAuthToken } from "@/lib/authUtils";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import obLogo from "@/assets/ob-logo.png";

// Kept at module scope (NOT defined inside TvPair). A component defined inside
// the render function is recreated on every render, which makes React remount
// its whole subtree on each keystroke and steals focus from the inputs.
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-gray-900 via-slate-900 to-black flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <img src={obLogo} alt="OB" className="w-20 h-20 object-contain opacity-90 mx-auto mb-2" />
          <h1 className="text-3xl font-extrabold text-white">TBN Studios</h1>
        </div>
        {children}
      </div>
    </div>
  );
}

// Phone-side page for the TV QR login. The QR opens this page with ?code=XXXX.
// If the visitor isn't signed in on their phone, they sign in inline (no page
// reload, so the code in the URL is preserved), then approve the TV.
export default function TvPair() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const { toast } = useToast();

  const params = new URLSearchParams(window.location.search);
  const [code, setCode] = useState((params.get("code") || "").toUpperCase());

  // After an SSO round-trip the IdP sends us back to /tv/pair?code=XXXX&sso_token=YYYY.
  // Store the token, strip it from the URL (keeping the code), then reload so the
  // page comes back authenticated on the "Allow this TV?" screen — no rescan needed.
  useState(() => {
    const ssoToken = params.get("sso_token");
    if (ssoToken) {
      setAuthToken(ssoToken);
      params.delete("sso_token");
      const qs = params.toString();
      window.history.replaceState({}, "", `/tv/pair${qs ? `?${qs}` : ""}`);
      window.location.reload();
    }
  });

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [approved, setApproved] = useState(false);

  const loginMutation = useMutation({
    mutationFn: async (creds: { username: string; password: string }) => {
      const res = await apiRequest("POST", "/api/auth/login", creds);
      return res.json();
    },
    onSuccess: async (data) => {
      setAuthToken(data.token);
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Sign in failed",
        description: error.message.includes("401")
          ? "Invalid username or password"
          : "Something went wrong. Please try again.",
        variant: "destructive",
      });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/tv/pair/approve", { userCode: code });
      return res.json();
    },
    onSuccess: () => setApproved(true),
    onError: (error: Error) => {
      toast({
        title: "Could not connect the TV",
        description: error.message.includes("404")
          ? "That code is invalid or has expired. Check the code on your TV."
          : "Something went wrong. Please try again.",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <Shell>
        <Card className="bg-card/95 backdrop-blur border-0 shadow-2xl">
          <CardContent className="py-10 text-center text-muted-foreground">Loading…</CardContent>
        </Card>
      </Shell>
    );
  }

  if (approved) {
    return (
      <Shell>
        <Card className="bg-card/95 backdrop-blur border-0 shadow-2xl">
          <CardContent className="py-10 text-center">
            <CheckCircle2 className="text-green-500 mx-auto mb-4" size={56} />
            <h2 className="text-xl font-bold mb-2">TV connected!</h2>
            <p className="text-muted-foreground">
              Your TV is signing in now. You can put your phone down.
            </p>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  // Not signed in on the phone — show an inline sign-in (keeps the code).
  if (!isAuthenticated) {
    return (
      <Shell>
        <Card className="bg-card/95 backdrop-blur border-0 shadow-2xl">
          <CardHeader>
            <CardTitle className="text-center">Sign in to connect your TV</CardTitle>
            <CardDescription className="text-center">
              Connecting TV code <span className="font-mono font-semibold">{code || "—"}</span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (!username.trim() || !password.trim()) return;
                loginMutation.mutate({ username: username.trim(), password });
              }}
            >
              <div>
                <Label htmlFor="tv-username">Username</Label>
                <Input
                  id="tv-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  disabled={loginMutation.isPending}
                />
              </div>
              <div>
                <Label htmlFor="tv-password">Password</Label>
                <Input
                  id="tv-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  disabled={loginMutation.isPending}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
                {loginMutation.isPending ? "Signing in…" : "Sign in"}
              </Button>
            </form>
            <Button
              type="button"
              variant="outline"
              className="w-full mt-3"
              onClick={() => {
                const returnTo = `/tv/pair?code=${encodeURIComponent(code)}`;
                window.location.href = `/api/auth/sso?returnTo=${encodeURIComponent(returnTo)}`;
              }}
            >
              Sign in with SSO
            </Button>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  // Signed in — confirm the pairing.
  return (
    <Shell>
      <Card className="bg-card/95 backdrop-blur border-0 shadow-2xl">
        <CardHeader>
          <CardTitle className="text-center flex items-center justify-center gap-2">
            <Tv size={22} /> Allow this TV?
          </CardTitle>
          <CardDescription className="text-center">
            Signed in as <span className="font-semibold">{user?.username}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center">
            <Label htmlFor="tv-code" className="text-muted-foreground">TV code</Label>
            <Input
              id="tv-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="text-center text-2xl font-mono tracking-[0.3em] mt-1"
              placeholder="ABCD-2345"
            />
          </div>
          <Button
            className="w-full text-lg py-6"
            onClick={() => approveMutation.mutate()}
            disabled={approveMutation.isPending || !code.trim()}
          >
            {approveMutation.isPending ? "Connecting…" : "Allow this TV"}
          </Button>
          <p className="text-xs text-center text-muted-foreground">
            Only approve if you're looking at this exact code on your own TV.
          </p>
        </CardContent>
      </Card>
    </Shell>
  );
}
