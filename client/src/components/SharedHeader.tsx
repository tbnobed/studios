import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { User, Shield, Settings, LogOut, ArrowLeft } from "lucide-react";
import { removeAuthToken } from "@/lib/authUtils";
import { useToast } from "@/hooks/use-toast";
import obedtvLogo from "@/assets/obedtv-logo.png";

interface SharedHeaderProps {
  title: string;
  subtitle?: string;
  showBackButton?: boolean;
  backButtonText?: string;
  onBackClick?: () => void;
}

export default function SharedHeader({ 
  title, 
  subtitle, 
  showBackButton = true,
  backButtonText = "Back to Dashboard",
  onBackClick 
}: SharedHeaderProps) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const { toast } = useToast();

  // Get current user data
  const { data: user } = useQuery({
    queryKey: ['/api/auth/user'],
  });

  const handleBackClick = () => {
    if (onBackClick) {
      onBackClick();
    } else {
      window.location.href = '/';
    }
  };

  const handleLogout = () => {
    removeAuthToken();
    toast({
      title: "Signed Out",
      description: "You have been successfully signed out",
    });
    setTimeout(() => {
      window.location.href = '/';
    }, 1000);
  };

  return (
    <header className="border-b border-border bg-card/80 backdrop-blur-sm">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          {/* Left side - Back button and title */}
          <div className="flex items-center gap-4">
            {showBackButton && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBackClick}
                className="text-muted-foreground hover:text-foreground"
                data-testid="button-back"
              >
                <ArrowLeft size={16} className="mr-2" />
                {backButtonText}
              </Button>
            )}
            <div className="flex items-center space-x-3">
              <img 
                src={obedtvLogo} 
                alt="OBED TV Logo" 
                className="h-8 w-auto"
              />
              <div>
                <h1 className="text-2xl font-bold text-foreground">{title}</h1>
                {subtitle && (
                  <p className="text-sm text-muted-foreground">{subtitle}</p>
                )}
              </div>
            </div>
          </div>

          {/* Right side - User menu */}
          <div className="flex items-center space-x-2">
            <span className="text-sm text-muted-foreground hidden sm:inline">
              {user?.firstName} {user?.lastName}
            </span>
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                className="touch-area"
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                data-testid="button-user-menu"
              >
                <User size={20} />
              </Button>
              
              {/* User Menu Dropdown */}
              {userMenuOpen && (
                <Card className="absolute top-12 right-0 w-48 z-[60] shadow-xl">
                  <CardContent className="p-2">
                    <div className="px-3 py-2 border-b border-border">
                      <p className="font-medium text-sm">{user?.username}</p>
                      <p className="text-xs text-muted-foreground">{user?.email}</p>
                      <p className="text-xs text-muted-foreground capitalize">{user?.role}</p>
                    </div>
                    {user?.role === 'admin' && (
                      <button
                        className="w-full flex items-center justify-start px-2 py-2 text-sm hover:bg-accent rounded-md transition-colors"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setUserMenuOpen(false);
                          setTimeout(() => {
                            window.location.href = '/admin';
                          }, 50);
                        }}
                        data-testid="button-admin"
                      >
                        <Shield className="mr-2" size={16} />
                        Admin Panel
                      </button>
                    )}
                    <button
                      className="w-full flex items-center justify-start px-2 py-2 text-sm hover:bg-accent rounded-md transition-colors"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setUserMenuOpen(false);
                        setTimeout(() => {
                          window.location.href = '/settings';
                        }, 50);
                      }}
                      data-testid="button-settings"
                    >
                      <Settings className="mr-2" size={16} />
                      Settings
                    </button>
                    <button
                      className="w-full flex items-center justify-start px-2 py-2 text-sm text-destructive hover:bg-accent rounded-md transition-colors"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setUserMenuOpen(false);
                        setTimeout(() => {
                          handleLogout();
                        }, 50);
                      }}
                      data-testid="button-logout"
                    >
                      <LogOut className="mr-2" size={16} />
                      Sign Out
                    </button>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}