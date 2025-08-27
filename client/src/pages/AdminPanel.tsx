import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Trash2, Edit, Plus, UserPlus, Video, Monitor, Settings2 } from "lucide-react";
import { UserWithPermissions, Studio, StudioWithStreams, Stream, InsertStream } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getAuthHeaders } from "@/lib/authUtils";

export default function AdminPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Form states
  const [newUser, setNewUser] = useState({
    username: "",
    email: "",
    password: "",
    firstName: "",
    lastName: "",
    role: "viewer" as "admin" | "operator" | "viewer",
  });
  
  const [newStream, setNewStream] = useState({
    studioId: "",
    name: "",
    description: "",
    streamUrl: "",
    resolution: "1080p",
    fps: 30,
  });

  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
  const [isCreateStreamOpen, setIsCreateStreamOpen] = useState(false);
  const [isEditStreamOpen, setIsEditStreamOpen] = useState(false);
  const [selectedStudioForStreams, setSelectedStudioForStreams] = useState<string>("");
  const [activeTab, setActiveTab] = useState("users");
  const [editingStream, setEditingStream] = useState<Stream | null>(null);

  // Fetch all users (admin only)
  const { data: users = [], isLoading: usersLoading } = useQuery<UserWithPermissions[]>({
    queryKey: ["/api/admin/users"],
    meta: {
      headers: getAuthHeaders(),
    },
  });

  // Fetch all studios (admin only)
  const { data: studios = [], isLoading: studiosLoading } = useQuery<Studio[]>({
    queryKey: ["/api/admin/studios"],
    meta: {
      headers: getAuthHeaders(),
    },
  });

  // Fetch studios with streams for stream management
  const { data: studiosWithStreams = [], isLoading: streamsLoading } = useQuery<StudioWithStreams[]>({
    queryKey: ["/api/admin/studios-with-streams"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/admin/studios-with-streams", undefined, {
        headers: getAuthHeaders(),
      });
      return response.json();
    },
  });

  // Create user mutation
  const createUserMutation = useMutation({
    mutationFn: async (userData: typeof newUser) => {
      const response = await apiRequest("POST", "/api/admin/users", userData, {
        headers: getAuthHeaders(),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setNewUser({
        username: "",
        email: "",
        password: "",
        firstName: "",
        lastName: "",
        role: "viewer",
      });
      setIsCreateUserOpen(false);
      toast({
        title: "User Created",
        description: "New user has been successfully created",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Create User",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      await apiRequest("DELETE", `/api/admin/users/${userId}`, undefined, {
        headers: getAuthHeaders(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({
        title: "User Deleted",
        description: "User has been successfully deleted",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Delete User",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Create stream mutation
  const createStreamMutation = useMutation({
    mutationFn: async (streamData: typeof newStream) => {
      const response = await apiRequest("POST", "/api/admin/streams", streamData, {
        headers: getAuthHeaders(),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/studios-with-streams"] });
      setNewStream({
        studioId: "",
        name: "",
        description: "",
        streamUrl: "",
        resolution: "1080p",
        fps: 30,
      });
      setIsCreateStreamOpen(false);
      toast({
        title: "Stream Created",
        description: "New stream has been successfully created",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Create Stream",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update stream mutation
  const updateStreamMutation = useMutation({
    mutationFn: async ({ streamId, updateData }: { streamId: string; updateData: Partial<Stream> }) => {
      const response = await apiRequest("PATCH", `/api/admin/streams/${streamId}`, updateData, {
        headers: getAuthHeaders(),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/studios-with-streams"] });
      setIsEditStreamOpen(false);
      setEditingStream(null);
      toast({
        title: "Stream Updated",
        description: "Stream has been successfully updated",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Update Stream",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete stream mutation
  const deleteStreamMutation = useMutation({
    mutationFn: async (streamId: string) => {
      await apiRequest("DELETE", `/api/admin/streams/${streamId}`, undefined, {
        headers: getAuthHeaders(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/studios-with-streams"] });
      toast({
        title: "Stream Deleted",
        description: "Stream has been successfully deleted",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Delete Stream",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleCreateUser = () => {
    if (!newUser.username.trim() || !newUser.password.trim()) {
      toast({
        title: "Missing Information",
        description: "Username and password are required",
        variant: "destructive",
      });
      return;
    }
    
    createUserMutation.mutate(newUser);
  };

  const handleCreateStream = () => {
    if (!newStream.name.trim() || !newStream.studioId) {
      toast({
        title: "Missing Information",
        description: "Stream name and studio are required",
        variant: "destructive",
      });
      return;
    }

    // Auto-generate URL if not provided
    const finalStreamData = { ...newStream };
    if (!finalStreamData.streamUrl.trim()) {
      const selectedStudio = studios.find(s => s.id === newStream.studioId);
      if (selectedStudio) {
        const studioName = selectedStudio.name.toLowerCase().replace(/\s+/g, '');
        const streamName = newStream.name.toLowerCase().replace(/\s+/g, '_');
        finalStreamData.streamUrl = `http://cdn1.obedtv.live:2022/rtc/v1/whep/?app=live&stream=${studioName}_${streamName}`;
      }
    }
    
    createStreamMutation.mutate(finalStreamData);
  };

  const handleDeleteUser = (userId: string) => {
    if (window.confirm("Are you sure you want to delete this user?")) {
      deleteUserMutation.mutate(userId);
    }
  };

  const handleEditStream = (stream: Stream) => {
    setEditingStream(stream);
    setIsEditStreamOpen(true);
  };

  const handleUpdateStream = () => {
    if (!editingStream) return;

    const updateData = {
      name: editingStream.name,
      description: editingStream.description,
      streamUrl: editingStream.streamUrl,
      resolution: editingStream.resolution,
      fps: editingStream.fps,
      isActive: editingStream.isActive,
    };

    updateStreamMutation.mutate({ 
      streamId: editingStream.id, 
      updateData 
    });
  };

  const handleDeleteStream = (streamId: string) => {
    if (window.confirm("Are you sure you want to delete this stream?")) {
      deleteStreamMutation.mutate(streamId);
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-red-500/20 text-red-400 border-red-500/20';
      case 'operator': return 'bg-blue-500/20 text-blue-400 border-blue-500/20';
      case 'viewer': return 'bg-green-500/20 text-green-400 border-green-500/20';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/20';
    }
  };

  if (usersLoading || studiosLoading || streamsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading admin panel...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Admin Panel</h1>
          <p className="text-muted-foreground">Manage users, studios, and streaming configuration</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="users" className="flex items-center gap-2" data-testid="tab-users">
              <UserPlus size={16} />
              Users
            </TabsTrigger>
            <TabsTrigger value="streams" className="flex items-center gap-2" data-testid="tab-streams">
              <Video size={16} />
              Streams
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-2" data-testid="tab-settings">
              <Settings2 size={16} />
              Settings
            </TabsTrigger>
          </TabsList>

          {/* Users Tab */}
          <TabsContent value="users" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>User Management</CardTitle>
                    <CardDescription>Create and manage user accounts</CardDescription>
                  </div>
                  
                  <Dialog open={isCreateUserOpen} onOpenChange={setIsCreateUserOpen}>
                    <DialogTrigger asChild>
                      <Button className="touch-area" data-testid="button-add-user">
                        <UserPlus className="mr-2" size={16} />
                        Add User
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>Create New User</DialogTitle>
                      </DialogHeader>
                      
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="firstName">First Name</Label>
                            <Input
                              id="firstName"
                              value={newUser.firstName}
                              onChange={(e) => setNewUser({ ...newUser, firstName: e.target.value })}
                              placeholder="John"
                              data-testid="input-first-name"
                            />
                          </div>
                          <div>
                            <Label htmlFor="lastName">Last Name</Label>
                            <Input
                              id="lastName"
                              value={newUser.lastName}
                              onChange={(e) => setNewUser({ ...newUser, lastName: e.target.value })}
                              placeholder="Doe"
                              data-testid="input-last-name"
                            />
                          </div>
                        </div>

                        <div>
                          <Label htmlFor="username">Username</Label>
                          <Input
                            id="username"
                            value={newUser.username}
                            onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                            placeholder="johndoe"
                            data-testid="input-username"
                          />
                        </div>

                        <div>
                          <Label htmlFor="email">Email</Label>
                          <Input
                            id="email"
                            type="email"
                            value={newUser.email}
                            onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                            placeholder="john@example.com"
                            data-testid="input-email"
                          />
                        </div>

                        <div>
                          <Label htmlFor="password">Password</Label>
                          <Input
                            id="password"
                            type="password"
                            value={newUser.password}
                            onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                            placeholder="••••••••"
                            data-testid="input-password"
                          />
                        </div>

                        <div>
                          <Label htmlFor="role">Role</Label>
                          <Select 
                            value={newUser.role} 
                            onValueChange={(value: "admin" | "operator" | "viewer") => setNewUser({ ...newUser, role: value })}
                          >
                            <SelectTrigger data-testid="select-role">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="viewer">Viewer</SelectItem>
                              <SelectItem value="operator">Operator</SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      
                      <div className="flex gap-2 mt-6">
                        <Button 
                          onClick={handleCreateUser}
                          disabled={createUserMutation.isPending}
                          className="flex-1"
                          data-testid="button-create-user"
                        >
                          {createUserMutation.isPending ? "Creating..." : "Create User"}
                        </Button>
                        <Button 
                          variant="outline" 
                          onClick={() => setIsCreateUserOpen(false)}
                          className="flex-1"
                        >
                          Cancel
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              
              <CardContent>
                <div className="space-y-4">
                  {users.map((user) => (
                    <div 
                      key={user.id}
                      className="flex items-center justify-between p-4 border rounded-lg bg-card hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold">{user.firstName} {user.lastName}</h3>
                          <Badge 
                            variant="secondary" 
                            className={`text-xs ${getRoleBadgeColor(user.role)}`}
                          >
                            {user.role}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-1">@{user.username}</p>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                        
                        <div className="flex flex-wrap gap-1 mt-2">
                          {user.permissions && user.permissions.map((permission) => (
                            <Badge key={`${user.id}-${permission.studioId}`} variant="outline" className="text-xs">
                              {permission.studio?.name}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="touch-area"
                          data-testid={`button-edit-${user.username}`}
                        >
                          <Edit size={16} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive touch-area"
                          onClick={() => handleDeleteUser(user.id)}
                          disabled={deleteUserMutation.isPending}
                          data-testid={`button-delete-${user.username}`}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </div>
                  ))}
                  
                  {users.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      No users found. Create your first user to get started.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Streams Tab */}
          <TabsContent value="streams" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Stream Management</CardTitle>
                    <CardDescription>Configure streaming endpoints for each studio</CardDescription>
                  </div>
                  <Dialog open={isCreateStreamOpen} onOpenChange={setIsCreateStreamOpen}>
                    <DialogTrigger asChild>
                      <Button className="touch-area" data-testid="button-add-stream">
                        <Plus className="mr-2" size={16} />
                        Add Stream
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>Create New Stream</DialogTitle>
                      </DialogHeader>
                      
                      <div className="space-y-4">
                        <div>
                          <Label htmlFor="studio">Studio</Label>
                          <Select 
                            value={newStream.studioId} 
                            onValueChange={(value) => setNewStream({ ...newStream, studioId: value })}
                          >
                            <SelectTrigger data-testid="select-studio">
                              <SelectValue placeholder="Select studio" />
                            </SelectTrigger>
                            <SelectContent>
                              {studios.map((studio) => (
                                <SelectItem key={studio.id} value={studio.id}>
                                  {studio.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label htmlFor="streamName">Stream Name</Label>
                          <Input
                            id="streamName"
                            value={newStream.name}
                            onChange={(e) => setNewStream({ ...newStream, name: e.target.value })}
                            placeholder="Main Camera"
                            data-testid="input-stream-name"
                          />
                        </div>

                        <div>
                          <Label htmlFor="streamDescription">Description</Label>
                          <Input
                            id="streamDescription"
                            value={newStream.description}
                            onChange={(e) => setNewStream({ ...newStream, description: e.target.value })}
                            placeholder="Primary studio stream"
                            data-testid="input-stream-description"
                          />
                        </div>

                        <div>
                          <Label htmlFor="streamUrl">Stream URL</Label>
                          <Input
                            id="streamUrl"
                            value={newStream.streamUrl}
                            onChange={(e) => setNewStream({ ...newStream, streamUrl: e.target.value })}
                            placeholder="http://cdn1.obedtv.live:2022/rtc/v1/whep/?app=live&stream=..."
                            data-testid="input-stream-url"
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            Or leave blank to auto-generate based on studio and stream name
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="resolution">Resolution</Label>
                            <Select 
                              value={newStream.resolution} 
                              onValueChange={(value) => setNewStream({ ...newStream, resolution: value })}
                            >
                              <SelectTrigger data-testid="select-resolution">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="720p">720p HD</SelectItem>
                                <SelectItem value="1080p">1080p Full HD</SelectItem>
                                <SelectItem value="1440p">1440p QHD</SelectItem>
                                <SelectItem value="4K">4K Ultra HD</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          
                          <div>
                            <Label htmlFor="fps">Frame Rate</Label>
                            <Select 
                              value={newStream.fps.toString()} 
                              onValueChange={(value) => setNewStream({ ...newStream, fps: parseInt(value) })}
                            >
                              <SelectTrigger data-testid="select-fps">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="24">24 fps</SelectItem>
                                <SelectItem value="30">30 fps</SelectItem>
                                <SelectItem value="60">60 fps</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex gap-2 mt-6">
                        <Button 
                          onClick={handleCreateStream}
                          disabled={createStreamMutation.isPending}
                          className="flex-1"
                          data-testid="button-create-stream"
                        >
                          {createStreamMutation.isPending ? "Creating..." : "Create Stream"}
                        </Button>
                        <Button 
                          variant="outline" 
                          onClick={() => setIsCreateStreamOpen(false)}
                          className="flex-1"
                        >
                          Cancel
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              
              {/* Edit Stream Dialog */}
              <Dialog open={isEditStreamOpen} onOpenChange={setIsEditStreamOpen}>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Edit Stream</DialogTitle>
                  </DialogHeader>
                  
                  {editingStream && (
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="editStreamName">Stream Name</Label>
                        <Input
                          id="editStreamName"
                          value={editingStream.name}
                          onChange={(e) => setEditingStream({ ...editingStream, name: e.target.value })}
                          placeholder="Main Camera"
                          data-testid="input-edit-stream-name"
                        />
                      </div>

                      <div>
                        <Label htmlFor="editStreamDescription">Description</Label>
                        <Input
                          id="editStreamDescription"
                          value={editingStream.description || ""}
                          onChange={(e) => setEditingStream({ ...editingStream, description: e.target.value })}
                          placeholder="Primary studio stream"
                          data-testid="input-edit-stream-description"
                        />
                      </div>

                      <div>
                        <Label htmlFor="editStreamUrl">Stream URL</Label>
                        <Input
                          id="editStreamUrl"
                          value={editingStream.streamUrl}
                          onChange={(e) => setEditingStream({ ...editingStream, streamUrl: e.target.value })}
                          placeholder="http://cdn1.obedtv.live:2022/rtc/v1/whep/?app=live&stream=..."
                          data-testid="input-edit-stream-url"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="editResolution">Resolution</Label>
                          <Select 
                            value={editingStream.resolution || "1080p"} 
                            onValueChange={(value) => setEditingStream({ ...editingStream, resolution: value })}
                          >
                            <SelectTrigger data-testid="select-edit-resolution">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="720p">720p HD</SelectItem>
                              <SelectItem value="1080p">1080p Full HD</SelectItem>
                              <SelectItem value="1440p">1440p QHD</SelectItem>
                              <SelectItem value="4K">4K Ultra HD</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        
                        <div>
                          <Label htmlFor="editFps">Frame Rate</Label>
                          <Select 
                            value={(editingStream.fps || 30).toString()} 
                            onValueChange={(value) => setEditingStream({ ...editingStream, fps: parseInt(value) })}
                          >
                            <SelectTrigger data-testid="select-edit-fps">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="24">24 fps</SelectItem>
                              <SelectItem value="30">30 fps</SelectItem>
                              <SelectItem value="60">60 fps</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="editIsActive"
                          checked={editingStream.isActive}
                          onChange={(e) => setEditingStream({ ...editingStream, isActive: e.target.checked })}
                          className="rounded"
                          data-testid="checkbox-edit-stream-active"
                        />
                        <Label htmlFor="editIsActive">Active Stream</Label>
                      </div>
                    </div>
                  )}
                  
                  <div className="flex gap-2 mt-6">
                    <Button 
                      onClick={handleUpdateStream}
                      disabled={updateStreamMutation.isPending}
                      className="flex-1"
                      data-testid="button-update-stream"
                    >
                      {updateStreamMutation.isPending ? "Updating..." : "Update Stream"}
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => setIsEditStreamOpen(false)}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
              
              <CardContent>
                <div className="space-y-4">
                  {studiosWithStreams.map((studio) => (
                    <Card key={studio.id} className="border-l-4" style={{ borderLeftColor: studio.primaryColor }}>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Monitor size={20} style={{ color: studio.primaryColor }} />
                            <div>
                              <h3 className="font-semibold">{studio.name}</h3>
                              <p className="text-sm text-muted-foreground">
                                {studio.streams?.length || 0} streams configured
                              </p>
                            </div>
                          </div>
                          <Badge variant="outline" style={{ color: studio.primaryColor, borderColor: studio.primaryColor }}>
                            {studio.location}
                          </Badge>
                        </div>
                      </CardHeader>
                      
                      <CardContent className="pt-0">
                        {studio.streams && studio.streams.length > 0 ? (
                          <div className="grid gap-3">
                            {studio.streams.map((stream) => (
                              <div 
                                key={stream.id}
                                className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg"
                              >
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <h4 className="font-medium">{stream.name}</h4>
                                    <Badge 
                                      variant={stream.isActive ? "default" : "secondary"}
                                      className="text-xs"
                                    >
                                      {stream.isActive ? "Active" : "Inactive"}
                                    </Badge>
                                  </div>
                                  <p className="text-sm text-muted-foreground mb-1">
                                    {stream.description}
                                  </p>
                                  <p className="text-xs text-muted-foreground font-mono break-all">
                                    {stream.streamUrl}
                                  </p>
                                  <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                                    <span>{stream.resolution}</span>
                                    <span>{stream.fps} fps</span>
                                  </div>
                                </div>
                                
                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="touch-area"
                                    onClick={() => handleEditStream(stream)}
                                    data-testid={`button-edit-stream-${stream.id}`}
                                  >
                                    <Edit size={16} />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-destructive hover:text-destructive touch-area"
                                    onClick={() => handleDeleteStream(stream.id)}
                                    disabled={deleteStreamMutation.isPending}
                                    data-testid={`button-delete-stream-${stream.id}`}
                                  >
                                    <Trash2 size={16} />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-8 text-muted-foreground">
                            <Video className="mx-auto mb-2 opacity-50" size={48} />
                            <p>No streams configured for this studio</p>
                            <p className="text-sm">Add streams to enable viewing</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                  
                  {studiosWithStreams.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">
                      <Monitor className="mx-auto mb-4 opacity-50" size={64} />
                      <h3 className="text-lg font-semibold mb-2">No Studios Found</h3>
                      <p>Create studios first to manage their streams</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Studio Settings</CardTitle>
                <CardDescription>Configure studio properties and streaming defaults</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div className="grid gap-4">
                    {studios.map((studio) => (
                      <Card key={studio.id} className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div 
                              className="w-4 h-4 rounded-full" 
                              style={{ backgroundColor: studio.colorCode || '#4A5568' }}
                            />
                            <div>
                              <h3 className="font-semibold">{studio.name}</h3>
                              <p className="text-sm text-muted-foreground">{studio.location}</p>
                            </div>
                          </div>
                          <Button variant="outline" size="sm">
                            Configure
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}