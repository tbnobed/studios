import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { setAuthToken } from "@/lib/authUtils";
import obLogo from "@assets/obedtv-300x244_1756343612842.png";
import authBackground from "@assets/generated_images/Dark_modern_auth_background_1e344dc8.png";

interface InviteInfo {
  valid: boolean;
  username?: string;
  email?: string;
  message?: string;
}

export default function SetPassword() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const { data, isLoading, isError } = useQuery<InviteInfo>({
    queryKey: ["/api/invite", token],
    retry: false,
  });

  const acceptMutation = useMutation({
    mutationFn: async (newPassword: string) => {
      const res = await apiRequest("POST", `/api/invite/${token}/accept`, {
        password: newPassword,
      });
      return res.json();
    },
    onSuccess: (result: { token: string }) => {
      setAuthToken(result.token);
      toast({
        title: "Account activated",
        description: "Your password has been set. Welcome!",
      });
      window.location.href = "/";
    },
    onError: (error: Error) => {
      toast({
        title: "Couldn't set password",
        description: error.message.replace(/^\d+:\s*/, "") || "Please try again",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast({
        title: "Password too short",
        description: "Password must be at least 6 characters long",
        variant: "destructive",
      });
      return;
    }
    if (password !== confirm) {
      toast({
        title: "Passwords don't match",
        description: "Please make sure both passwords are identical",
        variant: "destructive",
      });
      return;
    }
    acceptMutation.mutate(password);
  };

  const invalid = isError || (data && !data.valid);

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 bg-background relative"
      style={{
        backgroundImage: `url(${authBackground})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      <div className="absolute inset-0 bg-black/40"></div>
      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-6">
          <div className="w-56 h-56 mx-auto mb-2 flex items-center justify-center">
            <img src={obLogo} alt="OB Logo" className="w-full h-full object-contain opacity-90" />
          </div>
          <h1 className="text-4xl font-extrabold text-[#dbe6f0fa]">TBN Studios</h1>
        </div>

        <Card className="shadow-2xl border-0 bg-card/95 backdrop-blur">
          <CardHeader className="pb-4">
            <CardTitle className="text-center text-lg">Set Your Password</CardTitle>
            {data?.valid && data.username && (
              <CardDescription className="text-center">
                Welcome, <span className="font-medium">{data.username}</span>. Choose a password to
                activate your account.
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin mb-2" />
                <p className="text-sm">Validating your invite…</p>
              </div>
            ) : invalid ? (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <AlertCircle className="w-8 h-8 text-destructive mb-3" />
                <p className="text-sm text-muted-foreground mb-4" data-testid="text-invite-error">
                  {data?.message || "This invite link is invalid or has expired."}
                </p>
                <Button
                  variant="outline"
                  className="touch-area"
                  onClick={() => setLocation("/")}
                  data-testid="button-go-login"
                >
                  Go to Sign In
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="password">New Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="touch-area"
                    data-testid="input-new-password"
                    disabled={acceptMutation.isPending}
                  />
                </div>
                <div>
                  <Label htmlFor="confirm">Confirm Password</Label>
                  <Input
                    id="confirm"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Re-enter your password"
                    className="touch-area"
                    data-testid="input-confirm-password"
                    disabled={acceptMutation.isPending}
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full touch-area"
                  data-testid="button-set-password"
                  disabled={acceptMutation.isPending}
                >
                  {acceptMutation.isPending ? "Setting Password…" : "Set Password & Sign In"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
