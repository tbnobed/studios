import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { User, Shield, Settings, LogOut } from "lucide-react";
import { removeAuthToken } from "@/lib/authUtils";
import { useToast } from "@/hooks/use-toast";
import obedtvLogo from "@/assets/obedtv-logo.png";

export default function SharedHeader() {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const { toast } = useToast();

  // Get current user data
  const { data: user } = useQuery<{
    id: string;
    username: string;
    email: string;
    firstName?: string;
    lastName?: string;
    role: string;
  }>({
    queryKey: ['/api/auth/user'],
  });

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
    <>
      {/* Mobile Header */}
      <header className="md:hidden px-4 py-3 flex items-center justify-between shrink-0 fixed top-0 left-0 right-0 z-30 bg-card/80 backdrop-blur border-b border-border">
        <div className="flex items-center space-x-2">
          <span className="text-sm font-medium">
            {user?.firstName} {user?.lastName}
          </span>
        </div>
        
        <Button
          variant="ghost"
          size="sm"
          className="touch-area text-destructive hover:text-destructive"
          onClick={handleLogout}
          data-testid="button-mobile-logout"
        >
          <LogOut size={16} />
        </Button>
      </header>
      
      {/* Desktop Header */}
      <header className="hidden md:flex bg-card/80 backdrop-blur border-b border-border px-4 py-3 items-center justify-between shrink-0 relative z-20">
        <button
          onClick={() => window.location.href = '/'}
          className="flex items-center space-x-3 hover:opacity-80 transition-opacity cursor-pointer"
          data-testid="link-home"
        >
          <img 
            src={obedtvLogo} 
            alt="OBED TV Logo" 
            className="h-8 w-auto"
          />
          
          <h1 className="font-bold text-[30px]">TBN Studios</h1>
        </button>
        
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
      </header>
    </>
  );
}