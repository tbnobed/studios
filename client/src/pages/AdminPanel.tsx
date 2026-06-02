import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Trash2, Edit, Plus, UserPlus, Video, Monitor, Settings2, ChevronDown, Copy, Check, Search, Layers } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UserWithPermissions, Studio, StudioWithStreams, Stream, InsertStream } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getAuthHeaders } from "@/lib/authUtils";
import SharedHeader from "@/components/SharedHeader";

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
    role: "viewer" as "admin" | "viewer",
  });
  
  const [newStream, setNewStream] = useState({
    studioId: "",
    name: "",
    description: "",
    streamUrl: "",
    streamType: "webrtc" as "webrtc" | "hls",
    resolution: "1080p",
    fps: 30,
  });

  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
  const [isEditUserOpen, setIsEditUserOpen] = useState(false);
  const [isCreateStreamOpen, setIsCreateStreamOpen] = useState(false);
  const [isEditStreamOpen, setIsEditStreamOpen] = useState(false);
  const [isEditStudioOpen, setIsEditStudioOpen] = useState(false);
  const [selectedStudioForStreams, setSelectedStudioForStreams] = useState<string>("");
  const [activeTab, setActiveTab] = useState("users");

  // Stream management UI state
  const [streamSearch, setStreamSearch] = useState("");
  const [streamStatusFilter, setStreamStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [expandedStudios, setExpandedStudios] = useState<Set<string>>(new Set());
  const [isBulkAddOpen, setIsBulkAddOpen] = useState(false);
  const [bulkAdd, setBulkAdd] = useState({
    studioId: "",
    baseName: "Camera",
    startNumber: 1,
    count: 10,
    resolution: "1080p",
    fps: 30,
  });
  const [quickAddNames, setQuickAddNames] = useState<Record<string, string>>({});
  const [quickAddUrls, setQuickAddUrls] = useState<Record<string, string>>({});
  const [quickAddTypes, setQuickAddTypes] = useState<Record<string, "webrtc" | "hls">>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Handle URL parameters for tab selection
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tab = urlParams.get('tab');
    if (tab && ['users', 'studios', 'streams'].includes(tab)) {
      setActiveTab(tab);
    }
  }, []);
  const [editingStream, setEditingStream] = useState<Stream | null>(null);
  const [editingStudio, setEditingStudio] = useState<Studio | null>(null);
  const [editingUser, setEditingUser] = useState<(UserWithPermissions & { newPassword?: string }) | null>(null);
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [imageUploadPreview, setImageUploadPreview] = useState<string | null>(null);
  const [isCreateStudioOpen, setIsCreateStudioOpen] = useState(false);
  const [newStudio, setNewStudio] = useState({ name: "", location: "", description: "", colorCode: "#4A5568" });
  const [newStudioImageFile, setNewStudioImageFile] = useState<File | null>(null);
  const [newStudioImagePreview, setNewStudioImagePreview] = useState<string | null>(null);

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

  // Update user mutation
  const updateUserMutation = useMutation({
    mutationFn: async ({ userId, updateData }: { userId: string; updateData: Partial<UserWithPermissions> }) => {
      const response = await apiRequest("PATCH", `/api/admin/users/${userId}`, updateData, {
        headers: getAuthHeaders(),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setIsEditUserOpen(false);
      
      // Check if password was updated
      const passwordWasUpdated = editingUser?.newPassword && editingUser.newPassword.trim();
      
      setEditingUser(null);
      toast({
        title: "User Updated",
        description: passwordWasUpdated 
          ? "User information and password have been successfully updated" 
          : "User information has been successfully updated",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Update User",
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
      queryClient.invalidateQueries({ queryKey: ["/api/studios"] });
      setNewStream({
        studioId: "",
        name: "",
        description: "",
        streamUrl: "",
        streamType: "webrtc",
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
      queryClient.invalidateQueries({ queryKey: ["/api/studios"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/studios"] });
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

  // Update studio mutation
  const updateStudioMutation = useMutation({
    mutationFn: async ({ studioId, updateData, imageFile }: { studioId: string; updateData: Partial<Studio>; imageFile?: File }) => {
      // If there's an image file, upload it first
      if (imageFile) {
        const formData = new FormData();
        formData.append('image', imageFile);
        formData.append('studioId', studioId);
        
        const uploadResponse = await fetch('/api/admin/upload-studio-image', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: formData,
        });
        
        if (!uploadResponse.ok) {
          throw new Error('Failed to upload image');
        }
        
        const { imageUrl } = await uploadResponse.json();
        updateData.imageUrl = imageUrl;
      }
      
      const response = await apiRequest("PATCH", `/api/admin/studios/${studioId}`, updateData, {
        headers: getAuthHeaders(),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/studios"] });
      queryClient.invalidateQueries({ queryKey: ["/api/studios"] });
      setIsEditStudioOpen(false);
      setEditingStudio(null);
      setSelectedImageFile(null);
      setImageUploadPreview(null);
      toast({
        title: "Studio Updated",
        description: "Studio has been successfully updated",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Update Studio",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createStudioMutation = useMutation({
    mutationFn: async ({ studioData, imageFile }: { studioData: typeof newStudio; imageFile?: File | null }) => {
      const response = await apiRequest("POST", "/api/admin/studios", studioData, {
        headers: getAuthHeaders(),
      });
      const studio = await response.json();

      // Image upload route needs the studio id, so upload after creation.
      if (imageFile) {
        const formData = new FormData();
        formData.append("image", imageFile);
        formData.append("studioId", studio.id);
        const uploadResponse = await fetch("/api/admin/upload-studio-image", {
          method: "POST",
          headers: getAuthHeaders(),
          body: formData,
        });
        if (!uploadResponse.ok) {
          // Studio already exists server-side at this point; surface the failure
          // so the image issue isn't silently swallowed.
          throw new Error("Studio was created, but the image upload failed. You can add an image by editing the studio.");
        }
        const { imageUrl } = await uploadResponse.json();
        await apiRequest("PATCH", `/api/admin/studios/${studio.id}`, { imageUrl }, {
          headers: getAuthHeaders(),
        });
      }
      return studio;
    },
    onSuccess: () => {
      setIsCreateStudioOpen(false);
      setNewStudio({ name: "", location: "", description: "", colorCode: "#4A5568" });
      setNewStudioImageFile(null);
      setNewStudioImagePreview(null);
      toast({ title: "Studio Created", description: "New studio has been successfully created" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to Create Studio", description: error.message, variant: "destructive" });
    },
    onSettled: () => {
      // Studio may have been created even if a later step (image upload/patch) failed,
      // so always refresh so the list reflects reality.
      queryClient.invalidateQueries({ queryKey: ["/api/admin/studios"] });
      queryClient.invalidateQueries({ queryKey: ["/api/studios"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/studios-with-streams"] });
    },
  });

  const handleCreateStudio = () => {
    if (!newStudio.name.trim()) {
      toast({ title: "Missing Information", description: "Studio name is required", variant: "destructive" });
      return;
    }
    createStudioMutation.mutate({ studioData: newStudio, imageFile: newStudioImageFile });
  };

  const handleNewStudioImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setNewStudioImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setNewStudioImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

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

  // Quick single-add stream mutation (no dialog)
  const quickCreateStreamMutation = useMutation({
    mutationFn: async (streamData: InsertStream) => {
      const response = await apiRequest("POST", "/api/admin/streams", streamData, {
        headers: getAuthHeaders(),
      });
      return response.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/studios-with-streams"] });
      queryClient.invalidateQueries({ queryKey: ["/api/studios"] });
      setQuickAddNames((prev) => ({ ...prev, [variables.studioId]: "" }));
      setQuickAddUrls((prev) => ({ ...prev, [variables.studioId]: "" }));
      setQuickAddTypes((prev) => ({ ...prev, [variables.studioId]: "webrtc" }));
      toast({ title: "Stream Added", description: `${variables.name} was added` });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to Add Stream", description: error.message, variant: "destructive" });
    },
  });

  // Bulk-add streams mutation
  const bulkCreateStreamMutation = useMutation({
    mutationFn: async (streamsToCreate: InsertStream[]) => {
      const response = await apiRequest("POST", "/api/admin/streams/bulk", { streams: streamsToCreate }, {
        headers: getAuthHeaders(),
      });
      return response.json();
    },
    onSuccess: (created: Stream[]) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/studios-with-streams"] });
      queryClient.invalidateQueries({ queryKey: ["/api/studios"] });
      setIsBulkAddOpen(false);
      toast({ title: "Streams Created", description: `${created.length} streams created successfully` });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to Create Streams", description: error.message, variant: "destructive" });
    },
  });

  // Build the WHEP stream URL from a studio + stream name (matches single-add behavior)
  const buildStreamUrl = (studioName: string, streamName: string) => {
    const studioSlug = studioName.toLowerCase().replace(/\s+/g, "");
    const streamSlug = streamName.toLowerCase().replace(/\s+/g, "_");
    return `http://cdn1.obedtv.live:2022/rtc/v1/whep/?app=live&stream=${studioSlug}_${streamSlug}`;
  };

  const hasStreamFilter = streamSearch.trim() !== "" || streamStatusFilter !== "all";

  const filteredStudios = studiosWithStreams.map((studio) => {
    const query = streamSearch.trim().toLowerCase();
    const filteredStreams = (studio.streams || []).filter((s) => {
      const matchesStatus =
        streamStatusFilter === "all" ||
        (streamStatusFilter === "active" ? s.isActive : !s.isActive);
      const matchesSearch =
        !query ||
        s.name.toLowerCase().includes(query) ||
        (s.description || "").toLowerCase().includes(query) ||
        s.streamUrl.toLowerCase().includes(query);
      return matchesStatus && matchesSearch;
    });
    return { ...studio, filteredStreams };
  });

  const isStudioOpen = (id: string, hasMatches: boolean) =>
    hasStreamFilter ? hasMatches : expandedStudios.has(id);

  const toggleStudio = (id: string) => {
    if (hasStreamFilter) return;
    setExpandedStudios((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAllStudios = () =>
    setExpandedStudios(new Set(studiosWithStreams.map((s) => s.id)));
  const collapseAllStudios = () => setExpandedStudios(new Set());

  const handleCopy = async (text: string, id: string) => {
    const markCopied = () => {
      setCopiedId(id);
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500);
    };

    // navigator.clipboard only exists in secure contexts (HTTPS/localhost).
    // Our site runs over plain HTTP, so fall back to a temporary textarea + execCommand.
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        markCopied();
        return;
      } catch {
        // fall through to legacy fallback
      }
    }

    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.top = "-9999px";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(textarea);
      if (ok) {
        markCopied();
      } else {
        throw new Error("execCommand returned false");
      }
    } catch {
      toast({ title: "Copy failed", description: "Could not access clipboard", variant: "destructive" });
    }
  };

  const handleQuickAdd = (studio: StudioWithStreams) => {
    const name = (quickAddNames[studio.id] || "").trim();
    if (!name) return;
    const typedUrl = (quickAddUrls[studio.id] || "").trim();
    const type = quickAddTypes[studio.id] || "webrtc";
    if (type === "hls" && !typedUrl) {
      toast({
        title: "Stream address required",
        description: "HLS streams need a full .m3u8 URL — it can't be auto-generated.",
        variant: "destructive",
      });
      return;
    }
    quickCreateStreamMutation.mutate({
      studioId: studio.id,
      name,
      description: "",
      streamUrl: typedUrl || buildStreamUrl(studio.name, name),
      streamType: type,
      resolution: "1080p",
      fps: 30,
    });
  };

  const handleBulkAdd = () => {
    const studio = studios.find((s) => s.id === bulkAdd.studioId);
    if (!studio) {
      toast({ title: "Missing Information", description: "Please select a studio", variant: "destructive" });
      return;
    }
    if (!bulkAdd.baseName.trim()) {
      toast({ title: "Missing Information", description: "Base name is required", variant: "destructive" });
      return;
    }
    const count = Math.max(1, Math.min(200, bulkAdd.count || 1));
    const streamsToCreate: InsertStream[] = Array.from({ length: count }, (_, i) => {
      const name = `${bulkAdd.baseName.trim()} ${bulkAdd.startNumber + i}`;
      return {
        studioId: studio.id,
        name,
        description: "",
        streamUrl: buildStreamUrl(studio.name, name),
        streamType: "webrtc" as const,
        resolution: bulkAdd.resolution,
        fps: bulkAdd.fps,
      };
    });
    bulkCreateStreamMutation.mutate(streamsToCreate);
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

    const finalStreamData = { ...newStream };
    if (!finalStreamData.streamUrl.trim()) {
      // HLS streams need an explicit .m3u8 URL — only WebRTC can be auto-generated.
      if (finalStreamData.streamType === "hls") {
        toast({
          title: "Stream address required",
          description: "HLS streams need a full .m3u8 URL — it can't be auto-generated.",
          variant: "destructive",
        });
        return;
      }
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

  const handleEditUser = (user: UserWithPermissions) => {
    setEditingUser({ ...user, newPassword: '' });
    setIsEditUserOpen(true);
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;
    
    try {
      // First update the basic user info (including password if provided)
      const updateData: any = {
        firstName: editingUser.firstName,
        lastName: editingUser.lastName,
        email: editingUser.email,
        role: editingUser.role,
        username: editingUser.username,
      };
      
      // Include password if provided
      if (editingUser.newPassword && editingUser.newPassword.trim()) {
        if (editingUser.newPassword.length < 6) {
          toast({
            title: "Invalid Password",
            description: "Password must be at least 6 characters long",
            variant: "destructive",
          });
          return;
        }
        updateData.newPassword = editingUser.newPassword;
      }
      
      await updateUserMutation.mutateAsync({
        userId: editingUser.id,
        updateData
      });

      // Then handle studio permissions
      const originalUser = users.find(u => u.id === editingUser.id);
      const originalPermissions = originalUser?.studioPermissions || [];
      const newPermissions = editingUser.studioPermissions || [];

      // Find permissions to remove
      const permissionsToRemove = originalPermissions.filter(
        orig => !newPermissions.some(newPerm => newPerm.studioId === orig.studioId)
      );

      // Find permissions to add
      const permissionsToAdd = newPermissions.filter(
        newPerm => !originalPermissions.some(orig => orig.studioId === newPerm.studioId)
      );

      // Remove old permissions
      for (const permission of permissionsToRemove) {
        await apiRequest("DELETE", `/api/admin/permissions/${editingUser.id}/${permission.studioId}`, undefined, {
          headers: getAuthHeaders(),
        });
      }

      // Add new permissions
      for (const permission of permissionsToAdd) {
        await apiRequest("POST", "/api/admin/permissions", {
          userId: editingUser.id,
          studioId: permission.studioId,
          canView: true,
        }, {
          headers: getAuthHeaders(),
        });
      }

    } catch (error) {
      console.error("Error updating user:", error);
      toast({
        title: "Failed to Update User",
        description: "There was an error updating the user and permissions",
        variant: "destructive",
      });
    }
  };

  const handleEditStudio = (studio: Studio) => {
    setEditingStudio(studio);
    setIsEditStudioOpen(true);
    setSelectedImageFile(null);
    setImageUploadPreview(null);
  };

  const handleImageFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type and size
      if (!file.type.startsWith('image/')) {
        toast({
          title: "Invalid File Type",
          description: "Please select an image file (JPG, PNG, GIF, etc.)",
          variant: "destructive",
        });
        return;
      }
      
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        toast({
          title: "File Too Large",
          description: "Please select an image smaller than 5MB",
          variant: "destructive",
        });
        return;
      }
      
      setSelectedImageFile(file);
      
      // Create preview URL
      const reader = new FileReader();
      reader.onload = () => {
        setImageUploadPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUpdateStudio = () => {
    if (!editingStudio) return;
    
    const updateData: Partial<Studio> = {
      name: editingStudio.name,
      location: editingStudio.location,
      description: editingStudio.description,
      colorCode: editingStudio.colorCode,
    };
    
    updateStudioMutation.mutate({
      studioId: editingStudio.id,
      updateData,
      imageFile: selectedImageFile || undefined,
    });
  };

  const handleEditStream = (stream: Stream) => {
    setEditingStream(stream);
    setIsEditStreamOpen(true);
  };

  const handleUpdateStream = () => {
    if (!editingStream) return;

    const streamType = editingStream.streamType || "webrtc";
    if (streamType === "hls" && !(editingStream.streamUrl || "").trim()) {
      toast({
        title: "Stream address required",
        description: "HLS streams need a full .m3u8 URL — it can't be auto-generated.",
        variant: "destructive",
      });
      return;
    }

    const updateData = {
      name: editingStream.name,
      description: editingStream.description,
      streamUrl: editingStream.streamUrl,
      streamType,
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
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-gray-900 via-slate-800 to-black relative overflow-hidden md:overflow-visible">
      {/* Glossy overlay effect */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent pointer-events-none"></div>
      
      <SharedHeader />
      
      <div className="flex-1 pt-16 md:pt-0 relative z-10">
        <div className="max-w-7xl mx-auto p-4 mt-6">

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="users" className="flex items-center gap-2" data-testid="tab-users">
              <UserPlus size={16} />
              Users
            </TabsTrigger>
            <TabsTrigger value="studios" className="flex items-center gap-2" data-testid="tab-studios">
              <Monitor size={16} />
              Studios
            </TabsTrigger>
            <TabsTrigger value="streams" className="flex items-center gap-2" data-testid="tab-streams">
              <Video size={16} />
              Streams
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
                            onValueChange={(value: "admin" | "viewer") => setNewUser({ ...newUser, role: value })}
                          >
                            <SelectTrigger data-testid="select-role">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="viewer">Viewer</SelectItem>
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

              {/* Edit User Dialog */}
              <Dialog open={isEditUserOpen} onOpenChange={setIsEditUserOpen}>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Edit User</DialogTitle>
                  </DialogHeader>
                  
                  {editingUser && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="editFirstName">First Name</Label>
                          <Input
                            id="editFirstName"
                            value={editingUser.firstName || ''}
                            onChange={(e) => setEditingUser({ ...editingUser, firstName: e.target.value })}
                            placeholder="John"
                            data-testid="input-edit-first-name"
                          />
                        </div>
                        <div>
                          <Label htmlFor="editLastName">Last Name</Label>
                          <Input
                            id="editLastName"
                            value={editingUser.lastName || ''}
                            onChange={(e) => setEditingUser({ ...editingUser, lastName: e.target.value })}
                            placeholder="Doe"
                            data-testid="input-edit-last-name"
                          />
                        </div>
                      </div>

                      <div>
                        <Label htmlFor="editUsername">Username</Label>
                        <Input
                          id="editUsername"
                          value={editingUser.username}
                          onChange={(e) => setEditingUser({ ...editingUser, username: e.target.value })}
                          placeholder="johndoe"
                          data-testid="input-edit-username"
                        />
                      </div>

                      <div>
                        <Label htmlFor="editEmail">Email</Label>
                        <Input
                          id="editEmail"
                          type="email"
                          value={editingUser.email || ''}
                          onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                          placeholder="john@example.com"
                          data-testid="input-edit-email"
                        />
                      </div>

                      <div>
                        <Label htmlFor="editPassword">Reset Password (optional)</Label>
                        <Input
                          id="editPassword"
                          type="password"
                          value={editingUser.newPassword || ''}
                          onChange={(e) => setEditingUser({ ...editingUser, newPassword: e.target.value })}
                          placeholder="Leave blank to keep current password"
                          data-testid="input-edit-password"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Minimum 6 characters. Leave blank to keep current password.
                        </p>
                      </div>

                      <div>
                        <Label htmlFor="editRole">Role</Label>
                        <Select 
                          value={editingUser.role} 
                          onValueChange={(value: "admin" | "viewer") => setEditingUser({ ...editingUser, role: value })}
                        >
                          <SelectTrigger data-testid="select-edit-role">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="viewer">Viewer</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Studio Permissions */}
                      <div>
                        <Label>Studio Permissions</Label>
                        <div className="space-y-2 mt-2">
                          {studios.map((studio) => {
                            const hasPermission = editingUser.studioPermissions?.some(p => p.studioId === studio.id) || false;
                            return (
                              <div key={studio.id} className="flex items-center space-x-2">
                                <input
                                  type="checkbox"
                                  id={`studio-${studio.id}`}
                                  checked={hasPermission}
                                  onChange={(e) => {
                                    const currentPermissions = editingUser.studioPermissions || [];
                                    if (e.target.checked) {
                                      // Add permission
                                      setEditingUser({
                                        ...editingUser,
                                        studioPermissions: [
                                          ...currentPermissions,
                                          {
                                            id: '',
                                            userId: editingUser.id,
                                            studioId: studio.id,
                                            canView: true,
                                            createdAt: new Date(),
                                            studio: studio
                                          }
                                        ]
                                      });
                                    } else {
                                      // Remove permission
                                      setEditingUser({
                                        ...editingUser,
                                        studioPermissions: currentPermissions.filter(p => p.studioId !== studio.id)
                                      });
                                    }
                                  }}
                                  className="rounded"
                                  data-testid={`checkbox-studio-${studio.name.toLowerCase().replace(/\s+/g, '-')}`}
                                />
                                <Label htmlFor={`studio-${studio.id}`} className="text-sm font-normal">
                                  {studio.name}
                                </Label>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div className="flex gap-2 mt-6">
                    <Button 
                      onClick={handleUpdateUser}
                      disabled={updateUserMutation.isPending}
                      className="flex-1"
                      data-testid="button-update-user"
                    >
                      {updateUserMutation.isPending ? "Updating..." : "Update User"}
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => setIsEditUserOpen(false)}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
              
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
                          onClick={() => handleEditUser(user)}
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

          {/* Studios Tab */}
          <TabsContent value="studios" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Studio Management</CardTitle>
                    <CardDescription>Manage studio details and images</CardDescription>
                  </div>
                  <Button
                    className="touch-area"
                    onClick={() => setIsCreateStudioOpen(true)}
                    data-testid="button-add-studio"
                  >
                    <Plus className="mr-2" size={16} />
                    Add Studio
                  </Button>
                </div>
              </CardHeader>
              
              <CardContent>
                <div className="space-y-4">
                  {studios.map((studio) => (
                    <div 
                      key={studio.id}
                      className="flex items-center justify-between p-4 border rounded-lg bg-card hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-center gap-4 flex-1">
                        {/* Studio Image */}
                        <div className="w-16 h-16 rounded-lg overflow-hidden bg-accent flex items-center justify-center">
                          {studio.imageUrl ? (
                            <img 
                              src={studio.imageUrl} 
                              alt={studio.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Monitor size={24} className="text-muted-foreground" />
                          )}
                        </div>
                        
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold">{studio.name}</h3>
                            <div 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: studio.colorCode || '#4A5568' }}
                            />
                          </div>
                          <p className="text-sm text-muted-foreground mb-1">{studio.location}</p>
                          {studio.description && (
                            <p className="text-sm text-muted-foreground">{studio.description}</p>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="touch-area"
                          onClick={() => handleEditStudio(studio)}
                          data-testid={`button-edit-studio-${studio.name.toLowerCase().replace(/\s+/g, '-')}`}
                        >
                          <Edit size={16} />
                        </Button>
                      </div>
                    </div>
                  ))}
                  
                  {studios.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      No studios found.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Edit Studio Dialog */}
            <Dialog open={isEditStudioOpen} onOpenChange={setIsEditStudioOpen}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Edit Studio</DialogTitle>
                </DialogHeader>
                
                {editingStudio && (
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="studioName">Studio Name</Label>
                      <Input
                        id="studioName"
                        value={editingStudio.name}
                        onChange={(e) => setEditingStudio({ ...editingStudio, name: e.target.value })}
                        placeholder="Studio Name"
                        data-testid="input-studio-name"
                      />
                    </div>

                    <div>
                      <Label htmlFor="studioLocation">Location</Label>
                      <Input
                        id="studioLocation"
                        value={editingStudio.location || ''}
                        onChange={(e) => setEditingStudio({ ...editingStudio, location: e.target.value })}
                        placeholder="Studio Location"
                        data-testid="input-studio-location"
                      />
                    </div>

                    <div>
                      <Label htmlFor="studioDescription">Description</Label>
                      <Input
                        id="studioDescription"
                        value={editingStudio.description || ''}
                        onChange={(e) => setEditingStudio({ ...editingStudio, description: e.target.value })}
                        placeholder="Studio Description"
                        data-testid="input-studio-description"
                      />
                    </div>

                    <div>
                      <Label htmlFor="studioColor">Color Code</Label>
                      <Input
                        id="studioColor"
                        type="color"
                        value={editingStudio.colorCode || '#4A5568'}
                        onChange={(e) => setEditingStudio({ ...editingStudio, colorCode: e.target.value })}
                        data-testid="input-studio-color"
                      />
                    </div>

                    <div>
                      <Label htmlFor="studioImage">Studio Image</Label>
                      <div className="space-y-2">
                        <Input
                          id="studioImage"
                          type="file"
                          accept="image/*"
                          onChange={handleImageFileSelect}
                          data-testid="input-studio-image"
                        />
                        {imageUploadPreview && (
                          <div className="w-32 h-32 rounded-lg overflow-hidden bg-accent">
                            <img 
                              src={imageUploadPreview} 
                              alt="Preview"
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}
                        {!imageUploadPreview && editingStudio.imageUrl && (
                          <div className="w-32 h-32 rounded-lg overflow-hidden bg-accent">
                            <img 
                              src={editingStudio.imageUrl} 
                              alt="Current"
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex gap-2 mt-6">
                      <Button 
                        onClick={handleUpdateStudio}
                        disabled={updateStudioMutation.isPending}
                        className="flex-1"
                        data-testid="button-update-studio"
                      >
                        {updateStudioMutation.isPending ? "Updating..." : "Update Studio"}
                      </Button>
                      <Button 
                        variant="outline" 
                        onClick={() => setIsEditStudioOpen(false)}
                        className="flex-1"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>

            {/* Create Studio Dialog */}
            <Dialog open={isCreateStudioOpen} onOpenChange={(open) => {
              setIsCreateStudioOpen(open);
              if (!open) {
                setNewStudio({ name: "", location: "", description: "", colorCode: "#4A5568" });
                setNewStudioImageFile(null);
                setNewStudioImagePreview(null);
              }
            }}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Add Studio</DialogTitle>
                  <DialogDescription>Create a new studio.</DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  <div>
                    <Label htmlFor="newStudioName">Studio Name</Label>
                    <Input
                      id="newStudioName"
                      value={newStudio.name}
                      onChange={(e) => setNewStudio({ ...newStudio, name: e.target.value })}
                      placeholder="Studio Name"
                      data-testid="input-new-studio-name"
                    />
                  </div>

                  <div>
                    <Label htmlFor="newStudioLocation">Location</Label>
                    <Input
                      id="newStudioLocation"
                      value={newStudio.location}
                      onChange={(e) => setNewStudio({ ...newStudio, location: e.target.value })}
                      placeholder="City, State"
                      data-testid="input-new-studio-location"
                    />
                  </div>

                  <div>
                    <Label htmlFor="newStudioDescription">Description</Label>
                    <Input
                      id="newStudioDescription"
                      value={newStudio.description}
                      onChange={(e) => setNewStudio({ ...newStudio, description: e.target.value })}
                      placeholder="Studio Description"
                      data-testid="input-new-studio-description"
                    />
                  </div>

                  <div>
                    <Label htmlFor="newStudioColor">Color Code</Label>
                    <Input
                      id="newStudioColor"
                      type="color"
                      value={newStudio.colorCode}
                      onChange={(e) => setNewStudio({ ...newStudio, colorCode: e.target.value })}
                      data-testid="input-new-studio-color"
                    />
                  </div>

                  <div>
                    <Label htmlFor="newStudioImage">Studio Image</Label>
                    <div className="space-y-2">
                      <Input
                        id="newStudioImage"
                        type="file"
                        accept="image/*"
                        onChange={handleNewStudioImageSelect}
                        data-testid="input-new-studio-image"
                      />
                      {newStudioImagePreview && (
                        <div className="w-32 h-32 rounded-lg overflow-hidden bg-accent">
                          <img src={newStudioImagePreview} alt="Preview" className="w-full h-full object-cover" />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2 mt-6">
                    <Button
                      onClick={handleCreateStudio}
                      disabled={createStudioMutation.isPending}
                      className="flex-1"
                      data-testid="button-create-studio"
                    >
                      {createStudioMutation.isPending ? "Creating..." : "Create Studio"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setIsCreateStudioOpen(false)}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
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
                  <div className="flex gap-2">
                  <Dialog open={isBulkAddOpen} onOpenChange={setIsBulkAddOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="touch-area" data-testid="button-bulk-add-streams">
                        <Layers className="mr-2" size={16} />
                        Bulk Add
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>Bulk Add Streams</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div>
                          <Label>Studio</Label>
                          <Select value={bulkAdd.studioId} onValueChange={(v) => setBulkAdd({ ...bulkAdd, studioId: v })}>
                            <SelectTrigger data-testid="select-bulk-studio"><SelectValue placeholder="Select studio" /></SelectTrigger>
                            <SelectContent>
                              {studios.map((studio) => (
                                <SelectItem key={studio.id} value={studio.id}>{studio.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor="bulkBaseName">Base name</Label>
                          <Input id="bulkBaseName" value={bulkAdd.baseName} onChange={(e) => setBulkAdd({ ...bulkAdd, baseName: e.target.value })} placeholder="Camera" data-testid="input-bulk-base-name" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="bulkStart">Start number</Label>
                            <Input id="bulkStart" type="number" min={0} value={bulkAdd.startNumber} onChange={(e) => setBulkAdd({ ...bulkAdd, startNumber: parseInt(e.target.value) || 0 })} data-testid="input-bulk-start" />
                          </div>
                          <div>
                            <Label htmlFor="bulkCount">How many</Label>
                            <Input id="bulkCount" type="number" min={1} max={200} value={bulkAdd.count} onChange={(e) => setBulkAdd({ ...bulkAdd, count: parseInt(e.target.value) || 1 })} data-testid="input-bulk-count" />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label>Resolution</Label>
                            <Select value={bulkAdd.resolution} onValueChange={(v) => setBulkAdd({ ...bulkAdd, resolution: v })}>
                              <SelectTrigger data-testid="select-bulk-resolution"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="720p">720p HD</SelectItem>
                                <SelectItem value="1080p">1080p Full HD</SelectItem>
                                <SelectItem value="1440p">1440p QHD</SelectItem>
                                <SelectItem value="4K">4K Ultra HD</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Frame rate</Label>
                            <Select value={bulkAdd.fps.toString()} onValueChange={(v) => setBulkAdd({ ...bulkAdd, fps: parseInt(v) })}>
                              <SelectTrigger data-testid="select-bulk-fps"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="24">24 fps</SelectItem>
                                <SelectItem value="30">30 fps</SelectItem>
                                <SelectItem value="60">60 fps</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="rounded-md bg-secondary/40 p-3 text-xs text-muted-foreground">
                          {bulkAdd.studioId ? (
                            <>
                              Will create{" "}
                              <span className="font-medium text-foreground">{Math.max(1, Math.min(200, bulkAdd.count || 1))}</span>{" "}
                              streams:{" "}
                              <span className="font-medium text-foreground">{bulkAdd.baseName} {bulkAdd.startNumber}</span>
                              {" … "}
                              <span className="font-medium text-foreground">{bulkAdd.baseName} {bulkAdd.startNumber + Math.max(1, Math.min(200, bulkAdd.count || 1)) - 1}</span>
                            </>
                          ) : "Select a studio to preview generated streams. URLs auto-generate from studio + stream name."}
                        </div>
                      </div>
                      <div className="flex gap-2 mt-6">
                        <Button onClick={handleBulkAdd} disabled={bulkCreateStreamMutation.isPending} className="flex-1" data-testid="button-create-bulk-streams">
                          {bulkCreateStreamMutation.isPending ? "Creating..." : "Create Streams"}
                        </Button>
                        <Button variant="outline" onClick={() => setIsBulkAddOpen(false)} className="flex-1">Cancel</Button>
                      </div>
                    </DialogContent>
                  </Dialog>
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
                          <Label htmlFor="streamType">Stream Type</Label>
                          <Select
                            value={newStream.streamType}
                            onValueChange={(value) => setNewStream({ ...newStream, streamType: value as "webrtc" | "hls" })}
                          >
                            <SelectTrigger data-testid="select-stream-type">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="webrtc">WebRTC (low-latency, WHEP)</SelectItem>
                              <SelectItem value="hls">HLS (.m3u8)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label htmlFor="streamUrl">Stream URL</Label>
                          <Input
                            id="streamUrl"
                            value={newStream.streamUrl}
                            onChange={(e) => setNewStream({ ...newStream, streamUrl: e.target.value })}
                            placeholder={newStream.streamType === "hls"
                              ? "https://your-server/live/stream.m3u8"
                              : "http://cdn1.obedtv.live:2022/rtc/v1/whep/?app=live&stream=..."}
                            data-testid="input-stream-url"
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            {newStream.streamType === "hls"
                              ? "Required for HLS — paste the full .m3u8 playlist URL."
                              : "Or leave blank to auto-generate based on studio and stream name"}
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
                        <Label htmlFor="editStreamType">Stream Type</Label>
                        <Select
                          value={editingStream.streamType || "webrtc"}
                          onValueChange={(value) => setEditingStream({ ...editingStream, streamType: value as "webrtc" | "hls" })}
                        >
                          <SelectTrigger data-testid="select-edit-stream-type">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="webrtc">WebRTC (low-latency, WHEP)</SelectItem>
                            <SelectItem value="hls">HLS (.m3u8)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label htmlFor="editStreamUrl">Stream URL</Label>
                        <Input
                          id="editStreamUrl"
                          value={editingStream.streamUrl}
                          onChange={(e) => setEditingStream({ ...editingStream, streamUrl: e.target.value })}
                          placeholder={editingStream.streamType === "hls"
                            ? "https://your-server/live/stream.m3u8"
                            : "http://cdn1.obedtv.live:2022/rtc/v1/whep/?app=live&stream=..."}
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
                {/* Search + filter toolbar */}
                <div className="flex flex-col sm:flex-row gap-3 mb-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                    <Input
                      value={streamSearch}
                      onChange={(e) => setStreamSearch(e.target.value)}
                      placeholder="Search streams by name, description, or URL..."
                      className="pl-9"
                      data-testid="input-stream-search"
                    />
                  </div>
                  <Select value={streamStatusFilter} onValueChange={(v) => setStreamStatusFilter(v as "all" | "active" | "inactive")}>
                    <SelectTrigger className="w-full sm:w-44" data-testid="select-stream-status-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="active">Active only</SelectItem>
                      <SelectItem value="inactive">Inactive only</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={expandAllStudios} data-testid="button-expand-all">Expand all</Button>
                    <Button variant="outline" onClick={collapseAllStudios} data-testid="button-collapse-all">Collapse all</Button>
                  </div>
                </div>

                <div className="space-y-3">
                  {filteredStudios.map((studio) => {
                    const total = studio.streams?.length || 0;
                    const activeCount = (studio.streams || []).filter((s) => s.isActive).length;
                    const shown = studio.filteredStreams.length;
                    const open = isStudioOpen(studio.id, shown > 0);
                    return (
                      <Collapsible key={studio.id} open={open} onOpenChange={() => toggleStudio(studio.id)}>
                        <Card className="border-l-4 overflow-hidden" style={{ borderLeftColor: studio.primaryColor }}>
                          <CollapsibleTrigger asChild>
                            <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-secondary/30 transition-colors" data-testid={`studio-header-${studio.id}`}>
                              <div className="flex items-center gap-3">
                                <ChevronDown className={`transition-transform ${open ? "" : "-rotate-90"}`} size={18} />
                                <Monitor size={20} style={{ color: studio.primaryColor }} />
                                <div>
                                  <h3 className="font-semibold">{studio.name}</h3>
                                  <p className="text-sm text-muted-foreground">
                                    {hasStreamFilter ? `${shown} of ${total}` : total} streams · {activeCount} active
                                  </p>
                                </div>
                              </div>
                              <Badge variant="outline" style={{ color: studio.primaryColor, borderColor: studio.primaryColor }}>
                                {studio.location}
                              </Badge>
                            </div>
                          </CollapsibleTrigger>

                          <CollapsibleContent>
                            <div className="px-4 pb-4">
                              {/* Quick add + copy all */}
                              <div className="flex flex-col sm:flex-row gap-2 mb-3">
                                <Input
                                  value={quickAddNames[studio.id] || ""}
                                  onChange={(e) => setQuickAddNames({ ...quickAddNames, [studio.id]: e.target.value })}
                                  onKeyDown={(e) => { if (e.key === "Enter") handleQuickAdd(studio); }}
                                  placeholder="Stream name"
                                  className="sm:w-48"
                                  data-testid={`input-quick-add-${studio.id}`}
                                />
                                <Input
                                  value={quickAddUrls[studio.id] || ""}
                                  onChange={(e) => setQuickAddUrls({ ...quickAddUrls, [studio.id]: e.target.value })}
                                  onKeyDown={(e) => { if (e.key === "Enter") handleQuickAdd(studio); }}
                                  placeholder={(quickAddTypes[studio.id] || "webrtc") === "hls"
                                    ? "HLS .m3u8 URL (required)"
                                    : "Stream address / URL (leave blank to auto-generate)"}
                                  className="flex-1 font-mono text-xs"
                                  data-testid={`input-quick-add-url-${studio.id}`}
                                />
                                <div className="flex gap-2">
                                  <Select
                                    value={quickAddTypes[studio.id] || "webrtc"}
                                    onValueChange={(v) => setQuickAddTypes({ ...quickAddTypes, [studio.id]: v as "webrtc" | "hls" })}
                                  >
                                    <SelectTrigger className="w-28" data-testid={`select-quick-add-type-${studio.id}`}>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="webrtc">WebRTC</SelectItem>
                                      <SelectItem value="hls">HLS</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <Button
                                    onClick={() => handleQuickAdd(studio)}
                                    disabled={quickCreateStreamMutation.isPending || !(quickAddNames[studio.id] || "").trim()}
                                    data-testid={`button-quick-add-${studio.id}`}
                                  >
                                    <Plus size={16} className="mr-1" /> Add
                                  </Button>
                                </div>
                              </div>

                              {shown > 0 ? (
                                <div className="rounded-lg border overflow-hidden">
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead>Name</TableHead>
                                        <TableHead className="w-24">Status</TableHead>
                                        <TableHead className="w-32">Quality</TableHead>
                                        <TableHead>URL</TableHead>
                                        <TableHead className="w-24 text-right">Actions</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {studio.filteredStreams.map((stream) => (
                                        <TableRow key={stream.id} data-testid={`stream-row-${stream.id}`}>
                                          <TableCell>
                                            <div className="flex items-center gap-2">
                                              <span className="font-medium">{stream.name}</span>
                                              <Badge variant="outline" className="text-[10px] uppercase">
                                                {stream.streamType === "hls" ? "HLS" : "WebRTC"}
                                              </Badge>
                                            </div>
                                            {stream.description && (
                                              <div className="text-xs text-muted-foreground">{stream.description}</div>
                                            )}
                                          </TableCell>
                                          <TableCell>
                                            <Badge variant={stream.isActive ? "default" : "secondary"} className="text-xs">
                                              {stream.isActive ? "Active" : "Inactive"}
                                            </Badge>
                                          </TableCell>
                                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                            {stream.resolution} · {stream.fps}fps
                                          </TableCell>
                                          <TableCell>
                                            <div className="flex items-center gap-2 max-w-[320px]">
                                              <span className="text-xs font-mono truncate text-muted-foreground" title={stream.streamUrl}>
                                                {stream.streamUrl}
                                              </span>
                                              <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7 shrink-0"
                                                onClick={() => handleCopy(stream.streamUrl, stream.id)}
                                                data-testid={`button-copy-stream-${stream.id}`}
                                              >
                                                {copiedId === stream.id ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                                              </Button>
                                            </div>
                                          </TableCell>
                                          <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-1">
                                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEditStream(stream)} data-testid={`button-edit-stream-${stream.id}`}>
                                                <Edit size={15} />
                                              </Button>
                                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDeleteStream(stream.id)} disabled={deleteStreamMutation.isPending} data-testid={`button-delete-stream-${stream.id}`}>
                                                <Trash2 size={15} />
                                              </Button>
                                            </div>
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
                              ) : (
                                <div className="text-center py-6 text-muted-foreground text-sm">
                                  {total === 0
                                    ? "No streams configured for this studio yet."
                                    : "No streams match your search in this studio."}
                                </div>
                              )}
                            </div>
                          </CollapsibleContent>
                        </Card>
                      </Collapsible>
                    );
                  })}

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
        </Tabs>
        </div>
      </div>
    </div>
  );
}