import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Video, AlertCircle } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { setAuthToken } from "@/lib/authUtils";
import obLogo from "@assets/image_1756407804157.png";
import authBackground from "@assets/generated_images/Dark_modern_auth_background_1e344dc8.png";

export default function Landing() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const { toast } = useToast();

  const loginMutation = useMutation({
    mutationFn: async (credentials: { username: string; password: string }) => {
      const response = await apiRequest("POST", "/api/auth/login", credentials);
      return response.json();
    },
    onSuccess: (data) => {
      setAuthToken(data.token);
      toast({
        title: "Welcome!",
        description: "Successfully signed in to OBTV Studio Manager",
      });
      // Reload to trigger auth state update
      window.location.reload();
    },
    onError: (error: Error) => {
      toast({
        title: "Sign In Failed",
        description: error.message.includes("401") ? "Invalid username or password" : "An error occurred during sign in",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username.trim() || !password.trim()) {
      toast({
        title: "Missing Information",
        description: "Please enter both username and password",
        variant: "destructive",
      });
      return;
    }

    loginMutation.mutate({ username: username.trim(), password });
  };

  return (
    <div 
      className="min-h-screen flex items-center justify-center p-4 bg-background relative"
      style={{
        backgroundImage: `url(${authBackground})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }}
    >
      {/* Dark overlay for better readability */}
      <div className="absolute inset-0 bg-black/40"></div>
      <div className="w-full max-w-md relative z-10">
        {/* Logo Section */}
        <div className="text-center mb-8">
          <div className="w-48 h-48 mx-auto mb-6 flex items-center justify-center">
            <img 
              src={obLogo} 
              alt="OB Logo" 
              className="w-full h-full object-contain opacity-90"
            />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">TBN Studios</h1>
        </div>
        
        {/* Login Form */}
        <Card className="shadow-2xl border-0 bg-card/95 backdrop-blur">
          <CardHeader className="pb-4">
            <CardTitle className="text-center text-lg">Sign In</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username"
                  className="touch-area"
                  data-testid="input-username"
                  disabled={loginMutation.isPending}
                />
              </div>
              <div>
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="touch-area"
                  data-testid="input-password"
                  disabled={loginMutation.isPending}
                />
              </div>
              <Button
                type="submit"
                className="w-full touch-area"
                data-testid="button-signin"
                disabled={loginMutation.isPending}
              >
                {loginMutation.isPending ? "Signing In..." : "Sign In"}
              </Button>
            </form>
            
            <div className="mt-6 pt-4 border-t border-border/50">
              <p className="text-center text-xs text-muted-foreground">
                Need access? Contact your administrator
              </p>
            </div>
          </CardContent>
        </Card>
        
        {/* Info Notice */}
        <div className="mt-6 p-3 bg-accent/5 border border-accent/10 rounded-lg backdrop-blur">
          <p className="text-xs text-accent/80 text-center flex items-center justify-center gap-2">
            <AlertCircle size={14} />
            Secure access to professional studio streams
          </p>
        </div>
      </div>
    </div>
  );
}
