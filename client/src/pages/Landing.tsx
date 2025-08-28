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
import obedtvLogo from "@/assets/obedtv-logo.png";

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
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md">
        {/* Logo Section */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 mx-auto mb-4 flex items-center justify-center">
            <img 
              src={obedtvLogo} 
              alt="OBTV Logo" 
              className="w-full h-full object-contain"
            />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">TBN Studios</h1>
        </div>
        
        {/* Login Form */}
        <Card className="shadow-2xl">
          <CardHeader>
            <CardTitle>Sign In</CardTitle>
            <CardDescription>
              Enter your credentials to access the studio dashboard
            </CardDescription>
          </CardHeader>
          <CardContent>
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
            
            <div className="mt-6 pt-6 border-t border-border">
              <p className="text-center text-sm text-muted-foreground">
                Need access? Contact your administrator
              </p>
            </div>
          </CardContent>
        </Card>
        
        {/* Info Notice */}
        <div className="mt-6 p-4 bg-accent/10 border border-accent/20 rounded-lg">
          <p className="text-sm text-accent text-center flex items-center justify-center gap-2">
            <AlertCircle size={16} />
            Secure access to professional studio streams
          </p>
        </div>
      </div>
    </div>
  );
}
