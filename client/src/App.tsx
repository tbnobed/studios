import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import Landing from "@/pages/Landing";
import Dashboard from "@/pages/Dashboard";
import AdminPanel from "@/pages/AdminPanel";
import Settings from "@/pages/Settings";
import Favorites from "@/pages/Favorites";
import Multiviewer from "@/pages/Multiviewer";
import MultiviewerWall from "@/pages/MultiviewerWall";
import SetPassword from "@/pages/SetPassword";
import SharedStream from "@/pages/SharedStream";
import NotFound from "@/pages/not-found";

function Router() {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <Switch>
      {/* Public route: accepting an invite must work whether or not the
          visitor is already authenticated, so it lives before the auth gate. */}
      <Route path="/invite/:token" component={SetPassword} />
      {/* Public route: a shared stream link must work for outside viewers with
          no account, so it lives before the auth gate. */}
      <Route path="/share/:token" component={SharedStream} />
      {!isAuthenticated ? (
        <Route path="/" component={Landing} />
      ) : (
        <>
          <Route path="/" component={Favorites} />
          <Route path="/favorites" component={Favorites} />
          <Route path="/multiviewer/view/:id" component={MultiviewerWall} />
          <Route path="/multiviewer" component={Multiviewer} />
          <Route path="/dashboard" component={Dashboard} />
          <Route path="/settings" component={Settings} />
          {user?.role === 'admin' && (
            <Route path="/admin" component={AdminPanel} />
          )}
        </>
      )}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
