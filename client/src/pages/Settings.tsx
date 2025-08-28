import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, User, Lock, Save } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type PasswordFormData = z.infer<typeof passwordSchema>;

export default function Settings() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'profile' | 'password'>('profile');

  // Get current user data
  const { data: user, isLoading } = useQuery({
    queryKey: ['/api/auth/user'],
  });

  // Password update form
  const passwordForm = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  // Password update mutation
  const passwordMutation = useMutation({
    mutationFn: async (data: PasswordFormData) => {
      return await apiRequest('PUT', '/api/auth/change-password', {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
    },
    onSuccess: () => {
      toast({
        title: "Password Updated",
        description: "Your password has been successfully updated.",
      });
      passwordForm.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update password",
        variant: "destructive",
      });
    },
  });

  const handlePasswordSubmit = (data: PasswordFormData) => {
    passwordMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.location.href = '/'}
              className="text-muted-foreground hover:text-foreground"
              data-testid="button-back"
            >
              <ArrowLeft size={16} className="mr-2" />
              Back to Dashboard
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Settings</h1>
              <p className="text-sm text-muted-foreground">Manage your account settings</p>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {/* Sidebar Navigation */}
            <div className="md:col-span-1">
              <Card>
                <CardContent className="p-4">
                  <nav className="space-y-2">
                    <button
                      onClick={() => setActiveTab('profile')}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                        activeTab === 'profile'
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-accent'
                      }`}
                      data-testid="tab-profile"
                    >
                      <User size={16} />
                      Profile
                    </button>
                    <button
                      onClick={() => setActiveTab('password')}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                        activeTab === 'password'
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-accent'
                      }`}
                      data-testid="tab-password"
                    >
                      <Lock size={16} />
                      Password
                    </button>
                  </nav>
                </CardContent>
              </Card>
            </div>

            {/* Main Content */}
            <div className="md:col-span-3">
              {/* Profile Tab */}
              {activeTab === 'profile' && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <User size={20} />
                      Profile Information
                    </CardTitle>
                    <CardDescription>
                      View your account information
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="username">Username</Label>
                        <Input
                          id="username"
                          value={(user as any)?.username || ''}
                          disabled
                          className="bg-muted"
                          data-testid="input-username"
                        />
                      </div>
                      <div>
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          value={(user as any)?.email || ''}
                          disabled
                          className="bg-muted"
                          data-testid="input-email"
                        />
                      </div>
                      <div>
                        <Label htmlFor="role">Role</Label>
                        <Input
                          id="role"
                          value={(user as any)?.role ? (user as any).role.charAt(0).toUpperCase() + (user as any).role.slice(1) : ''}
                          disabled
                          className="bg-muted"
                          data-testid="input-role"
                        />
                      </div>
                      <div>
                        <Label htmlFor="created">Member Since</Label>
                        <Input
                          id="created"
                          value={(user as any)?.createdAt ? new Date((user as any).createdAt).toLocaleDateString() : ''}
                          disabled
                          className="bg-muted"
                          data-testid="input-created"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Password Tab */}
              {activeTab === 'password' && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Lock size={20} />
                      Change Password
                    </CardTitle>
                    <CardDescription>
                      Update your account password
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Form {...passwordForm}>
                      <form onSubmit={passwordForm.handleSubmit(handlePasswordSubmit)} className="space-y-6">
                        <FormField
                          control={passwordForm.control}
                          name="currentPassword"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Current Password</FormLabel>
                              <FormControl>
                                <Input
                                  type="password"
                                  placeholder="Enter your current password"
                                  {...field}
                                  data-testid="input-current-password"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={passwordForm.control}
                          name="newPassword"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>New Password</FormLabel>
                              <FormControl>
                                <Input
                                  type="password"
                                  placeholder="Enter your new password"
                                  {...field}
                                  data-testid="input-new-password"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={passwordForm.control}
                          name="confirmPassword"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Confirm New Password</FormLabel>
                              <FormControl>
                                <Input
                                  type="password"
                                  placeholder="Confirm your new password"
                                  {...field}
                                  data-testid="input-confirm-password"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <Button
                          type="submit"
                          disabled={passwordMutation.isPending}
                          className="w-full md:w-auto"
                          data-testid="button-update-password"
                        >
                          {passwordMutation.isPending ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-background mr-2"></div>
                              Updating...
                            </>
                          ) : (
                            <>
                              <Save size={16} className="mr-2" />
                              Update Password
                            </>
                          )}
                        </Button>
                      </form>
                    </Form>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}