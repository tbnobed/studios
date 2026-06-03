import { 
  users, 
  studios, 
  streams, 
  groups,
  userGroups,
  groupStreamPermissions,
  userStreamPermissions,
  invites,
  favorites,
  multiviewerLayouts,
  multiviewerShares,
  multiviewerLayoutShares,
  streamShares,
  type User, 
  type InsertUser,
  type Studio,
  type InsertStudio,
  type Stream,
  type InsertStream,
  type Group,
  type InsertGroup,
  type GroupWithStreams,
  type StudioWithStreams,
  type UserWithPermissions,
  type Favorite,
  type FavoriteWithStream,
  type MultiviewerLayout,
  type InsertMultiviewerLayout,
  type Invite,
  type StreamShare,
  type StreamShareWithStream,
  type MultiviewerLayoutWithMeta,
  type MultiviewerShare
} from "@shared/schema";
import { db } from "./db";
import { eq, and, or, asc, desc, inArray, isNull } from "drizzle-orm";
import bcrypt from "bcrypt";

// Favorites limits: up to 8 streams per page across up to 5 pages.
export const FAVORITES_PER_PAGE = 8;
export const FAVORITES_MAX_PAGES = 5;
export const FAVORITES_MAX = FAVORITES_PER_PAGE * FAVORITES_MAX_PAGES;

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserWithPermissions(id: string): Promise<UserWithPermissions | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<InsertUser>): Promise<User>;
  deleteUser(id: string): Promise<void>;
  getAllUsers(): Promise<UserWithPermissions[]>;
  verifyUserPassword(username: string, password: string): Promise<User | null>;

  // Studio operations
  getAllStudios(): Promise<Studio[]>;
  getStudioWithStreams(id: string): Promise<StudioWithStreams | undefined>;
  getUserStudios(userId: string): Promise<StudioWithStreams[]>;
  createStudio(studio: InsertStudio): Promise<Studio>;
  updateStudio(id: string, data: Partial<InsertStudio>): Promise<Studio>;

  // Stream operations
  getStreamsByStudio(studioId: string): Promise<Stream[]>;
  getAllStreamsByStudio(studioId: string): Promise<Stream[]>;
  getStream(id: string): Promise<Stream | undefined>;
  createStream(stream: InsertStream): Promise<Stream>;
  createStreamsBulk(streams: InsertStream[]): Promise<Stream[]>;
  updateStream(id: string, data: Partial<InsertStream>): Promise<Stream>;
  deleteStream(id: string): Promise<void>;

  // Access checks (per-stream): admin sees all; otherwise a stream is viewable
  // if the user has an individual grant OR any of their groups grants it.
  getUserAccessibleStreamIds(userId: string): Promise<Set<string>>;
  canUserViewStream(userId: string, streamId: string): Promise<boolean>;

  // Group operations
  getAllGroups(): Promise<GroupWithStreams[]>;
  createGroup(data: InsertGroup, streamIds: string[]): Promise<Group>;
  updateGroup(id: string, data: Partial<InsertGroup>, streamIds?: string[]): Promise<Group>;
  deleteGroup(id: string): Promise<void>;

  // Membership + individual stream permission operations (replace-set semantics)
  setUserGroups(userId: string, groupIds: string[]): Promise<void>;
  setUserStreamPermissions(userId: string, streamIds: string[]): Promise<void>;

  // Invite operations. One invite row per user (resending replaces it). Tokens
  // are stored only as SHA-256 hashes; the raw token lives in the emailed link.
  createInvite(userId: string, tokenHash: string, expiresAt: Date): Promise<Invite>;
  getInviteByTokenHash(tokenHash: string): Promise<Invite | undefined>;

  // Public stream share links
  getStreamShares(): Promise<StreamShareWithStream[]>;
  getStreamShareByToken(token: string): Promise<StreamShareWithStream | undefined>;
  createStreamShare(data: { streamId: string; token: string; label?: string | null; expiresAt?: Date | null; createdBy?: string | null }): Promise<StreamShare>;
  deleteStreamShare(id: string): Promise<void>;
  markInviteAccepted(id: string): Promise<boolean>;

  // Favorites operations
  getUserFavorites(userId: string): Promise<FavoriteWithStream[]>;
  addFavorite(userId: string, streamId: string): Promise<Favorite>;
  removeFavorite(userId: string, streamId: string): Promise<void>;
  reorderFavorites(userId: string, orderedStreamIds: string[]): Promise<void>;

  // Multiviewer layout operations
  getUserMultiviewerLayouts(userId: string): Promise<MultiviewerLayoutWithMeta[]>;
  getMultiviewerLayoutById(id: string): Promise<MultiviewerLayout | undefined>;
  getMultiviewerLayout(userId: string, id: string): Promise<MultiviewerLayout | undefined>;
  createMultiviewerLayout(userId: string, data: InsertMultiviewerLayout): Promise<MultiviewerLayout>;
  updateMultiviewerLayout(userId: string, id: string, data: Partial<InsertMultiviewerLayout>): Promise<MultiviewerLayout | undefined>;
  deleteMultiviewerLayout(userId: string, id: string): Promise<void>;
  setDefaultMultiviewerLayout(userId: string, id: string): Promise<MultiviewerLayout | undefined>;

  // Stream lookup (no permission filter) used to resolve layout slots.
  getStreamsByIds(ids: string[]): Promise<Stream[]>;
  // Resolve layout slot streams scoped to what the owner can CURRENTLY access,
  // so sharing never leaks streams the owner has since lost permission to.
  getAccessibleStreamsByIds(ownerId: string, ids: string[]): Promise<Stream[]>;

  // Multiviewer external (public) share links
  getMultiviewerSharesByLayout(layoutId: string): Promise<MultiviewerShare[]>;
  getMultiviewerShareByToken(token: string): Promise<MultiviewerShare | undefined>;
  createMultiviewerShare(data: { layoutId: string; token: string; label?: string | null; expiresAt?: Date | null; createdBy?: string | null }): Promise<MultiviewerShare>;
  deleteMultiviewerShare(id: string): Promise<void>;

  // Multiviewer internal (logged-in users/groups) shares
  getLayoutInternalShares(layoutId: string): Promise<{ userIds: string[]; groupIds: string[] }>;
  setLayoutInternalShares(layoutId: string, userIds: string[], groupIds: string[]): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserWithPermissions(id: string): Promise<UserWithPermissions | undefined> {
    const user = await db.query.users.findFirst({
      where: eq(users.id, id),
      with: {
        groupMemberships: { with: { group: true } },
        streamPermissions: true,
      },
    });
    if (!user) return undefined;
    return this.enrichUser(user);
  }

  // Map a user row (loaded with groupMemberships + streamPermissions relations)
  // into the API-facing UserWithPermissions shape.
  private enrichUser(user: any): UserWithPermissions {
    const groups: Group[] = (user.groupMemberships || []).map((m: any) => m.group);
    const { groupMemberships, streamPermissions, ...rest } = user;
    return {
      ...(rest as User),
      groups,
      groupIds: groups.map((g) => g.id),
      streamIds: (streamPermissions || []).map((p: any) => p.streamId),
    };
  }

  async createUser(userData: InsertUser): Promise<User> {
    const hashedPassword = await bcrypt.hash(userData.password, 10);
    const [user] = await db
      .insert(users)
      .values({
        ...userData,
        password: hashedPassword,
      })
      .returning();
    return user;
  }

  async updateUser(id: string, data: Partial<InsertUser>): Promise<User> {
    const updateData = { ...data };
    if (data.password) {
      updateData.password = await bcrypt.hash(data.password, 10);
    }
    
    const [user] = await db
      .update(users)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async updateUserPassword(id: string, newPassword: string): Promise<void> {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db
      .update(users)
      .set({ 
        password: hashedPassword, 
        updatedAt: new Date() 
      })
      .where(eq(users.id, id));
  }

  async deleteUser(id: string): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  async getAllUsers(): Promise<UserWithPermissions[]> {
    const allUsers = await db.query.users.findMany({
      with: {
        groupMemberships: { with: { group: true } },
        streamPermissions: true,
      },
      orderBy: (users, { asc }) => [asc(users.username)],
    });
    return allUsers.map((u) => this.enrichUser(u));
  }

  async verifyUserPassword(username: string, password: string): Promise<User | null> {
    const user = await this.getUserByUsername(username);
    if (!user) return null;

    const isValid = await bcrypt.compare(password, user.password);
    return isValid ? user : null;
  }

  // Studio operations
  async getAllStudios(): Promise<Studio[]> {
    return db.select().from(studios).where(eq(studios.isActive, true)).orderBy(asc(studios.name), asc(studios.id));
  }

  async getStudioWithStreams(id: string): Promise<StudioWithStreams | undefined> {
    const studio = await db.query.studios.findFirst({
      where: eq(studios.id, id),
      with: {
        streams: {
          where: eq(streams.isActive, true),
          orderBy: (streams, { asc }) => [asc(streams.name), asc(streams.id)],
        },
      },
    });
    return studio as StudioWithStreams;
  }

  async getUserStudios(userId: string): Promise<StudioWithStreams[]> {
    // Admins see every active studio and all of its active streams.
    const user = await this.getUser(userId);
    const isAdmin = user?.role === "admin";

    const accessible = isAdmin ? null : await this.getUserAccessibleStreamIds(userId);

    const allStudios = await db.query.studios.findMany({
      where: eq(studios.isActive, true),
      with: {
        streams: {
          where: eq(streams.isActive, true),
          orderBy: (streams, { asc }) => [asc(streams.name), asc(streams.id)],
        },
      },
    });

    const result = (allStudios as StudioWithStreams[])
      .map((studio) => ({
        ...studio,
        streams: accessible
          ? studio.streams.filter((s) => accessible.has(s.id))
          : studio.streams,
      }))
      // Only surface studios that have at least one viewable stream.
      .filter((studio) => studio.streams.length > 0);

    return result.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  }

  async createStudio(studioData: InsertStudio): Promise<Studio> {
    const [studio] = await db.insert(studios).values(studioData).returning();
    return studio;
  }

  async updateStudio(id: string, data: Partial<InsertStudio>): Promise<Studio> {
    const [studio] = await db
      .update(studios)
      .set(data)
      .where(eq(studios.id, id))
      .returning();
    return studio;
  }

  // Stream operations
  async getStreamsByStudio(studioId: string): Promise<Stream[]> {
    return db.select().from(streams).where(
      and(eq(streams.studioId, studioId), eq(streams.isActive, true))
    ).orderBy(asc(streams.name), asc(streams.id));
  }

  async getAllStreamsByStudio(studioId: string): Promise<Stream[]> {
    return db.select().from(streams)
      .where(eq(streams.studioId, studioId))
      .orderBy(asc(streams.name), asc(streams.id));
  }

  async getStream(id: string): Promise<Stream | undefined> {
    const [stream] = await db.select().from(streams).where(eq(streams.id, id));
    return stream;
  }

  async createStream(streamData: InsertStream): Promise<Stream> {
    const [stream] = await db.insert(streams).values(streamData).returning();
    return stream;
  }

  async createStreamsBulk(streamData: InsertStream[]): Promise<Stream[]> {
    if (streamData.length === 0) return [];
    return db.insert(streams).values(streamData).returning();
  }

  async updateStream(id: string, data: Partial<InsertStream>): Promise<Stream> {
    const [stream] = await db
      .update(streams)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(streams.id, id))
      .returning();
    return stream;
  }

  async deleteStream(id: string): Promise<void> {
    await db.delete(streams).where(eq(streams.id, id));
  }

  // Access checks --------------------------------------------------------

  async getUserAccessibleStreamIds(userId: string): Promise<Set<string>> {
    const ids = new Set<string>();

    // Individual grants.
    const individual = await db
      .select({ streamId: userStreamPermissions.streamId })
      .from(userStreamPermissions)
      .where(eq(userStreamPermissions.userId, userId));
    for (const row of individual) ids.add(row.streamId);

    // Grants inherited from every group the user belongs to.
    const memberships = await db
      .select({ groupId: userGroups.groupId })
      .from(userGroups)
      .where(eq(userGroups.userId, userId));
    const groupIds = memberships.map((m) => m.groupId);
    if (groupIds.length > 0) {
      const groupGrants = await db
        .select({ streamId: groupStreamPermissions.streamId })
        .from(groupStreamPermissions)
        .where(inArray(groupStreamPermissions.groupId, groupIds));
      for (const row of groupGrants) ids.add(row.streamId);
    }

    return ids;
  }

  async canUserViewStream(userId: string, streamId: string): Promise<boolean> {
    const user = await this.getUser(userId);
    if (user?.role === "admin") return true;
    const accessible = await this.getUserAccessibleStreamIds(userId);
    return accessible.has(streamId);
  }

  // Group operations -----------------------------------------------------

  async getAllGroups(): Promise<GroupWithStreams[]> {
    const allGroups = await db.query.groups.findMany({
      with: {
        streamPermissions: true,
        members: true,
      },
      orderBy: (groups, { asc }) => [asc(groups.name), asc(groups.id)],
    });
    return allGroups.map((g: any) => {
      const { streamPermissions, members, ...rest } = g;
      return {
        ...(rest as Group),
        streamIds: (streamPermissions || []).map((p: any) => p.streamId),
        memberCount: (members || []).length,
      };
    });
  }

  async createGroup(data: InsertGroup, streamIds: string[]): Promise<Group> {
    return db.transaction(async (tx) => {
      const [group] = await tx.insert(groups).values(data).returning();
      const unique = Array.from(new Set(streamIds));
      if (unique.length > 0) {
        await tx
          .insert(groupStreamPermissions)
          .values(unique.map((streamId) => ({ groupId: group.id, streamId })));
      }
      return group;
    });
  }

  async updateGroup(id: string, data: Partial<InsertGroup>, streamIds?: string[]): Promise<Group> {
    return db.transaction(async (tx) => {
      let group: Group;
      if (Object.keys(data).length > 0) {
        [group] = await tx.update(groups).set(data).where(eq(groups.id, id)).returning();
      } else {
        [group] = await tx.select().from(groups).where(eq(groups.id, id));
      }
      // Replace the group's stream grants when an explicit list is provided.
      if (streamIds) {
        await tx.delete(groupStreamPermissions).where(eq(groupStreamPermissions.groupId, id));
        const unique = Array.from(new Set(streamIds));
        if (unique.length > 0) {
          await tx
            .insert(groupStreamPermissions)
            .values(unique.map((streamId) => ({ groupId: id, streamId })));
        }
      }
      return group;
    });
  }

  async deleteGroup(id: string): Promise<void> {
    // Memberships and grants are removed via ON DELETE CASCADE.
    await db.delete(groups).where(eq(groups.id, id));
  }

  // Membership + individual stream permission operations -----------------

  async setUserGroups(userId: string, groupIds: string[]): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(userGroups).where(eq(userGroups.userId, userId));
      const unique = Array.from(new Set(groupIds));
      if (unique.length > 0) {
        await tx
          .insert(userGroups)
          .values(unique.map((groupId) => ({ userId, groupId })));
      }
    });
  }

  async setUserStreamPermissions(userId: string, streamIds: string[]): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(userStreamPermissions).where(eq(userStreamPermissions.userId, userId));
      const unique = Array.from(new Set(streamIds));
      if (unique.length > 0) {
        await tx
          .insert(userStreamPermissions)
          .values(unique.map((streamId) => ({ userId, streamId })));
      }
    });
  }

  // Invite operations
  async createInvite(userId: string, tokenHash: string, expiresAt: Date): Promise<Invite> {
    const [invite] = await db
      .insert(invites)
      .values({ userId, tokenHash, expiresAt, acceptedAt: null })
      .onConflictDoUpdate({
        target: invites.userId,
        set: { tokenHash, expiresAt, acceptedAt: null, createdAt: new Date() },
      })
      .returning();
    return invite;
  }

  async getInviteByTokenHash(tokenHash: string): Promise<Invite | undefined> {
    const [invite] = await db
      .select()
      .from(invites)
      .where(eq(invites.tokenHash, tokenHash));
    return invite;
  }

  // Atomically claim an invite: only succeeds if it hasn't already been accepted.
  // Returns true if this call is the one that marked it accepted (single-use).
  async markInviteAccepted(id: string): Promise<boolean> {
    const rows = await db
      .update(invites)
      .set({ acceptedAt: new Date() })
      .where(and(eq(invites.id, id), isNull(invites.acceptedAt)))
      .returning({ id: invites.id });
    return rows.length > 0;
  }

  // Stream share links --------------------------------------------------

  async getStreamShares(): Promise<StreamShareWithStream[]> {
    const shares = await db.query.streamShares.findMany({
      with: { stream: true },
      orderBy: (s, { desc }) => [desc(s.createdAt)],
    });
    return shares as StreamShareWithStream[];
  }

  async getStreamShareByToken(token: string): Promise<StreamShareWithStream | undefined> {
    const share = await db.query.streamShares.findFirst({
      where: eq(streamShares.token, token),
      with: { stream: true },
    });
    return share as StreamShareWithStream | undefined;
  }

  async createStreamShare(data: {
    streamId: string;
    token: string;
    label?: string | null;
    expiresAt?: Date | null;
    createdBy?: string | null;
  }): Promise<StreamShare> {
    const [share] = await db
      .insert(streamShares)
      .values({
        streamId: data.streamId,
        token: data.token,
        label: data.label ?? null,
        expiresAt: data.expiresAt ?? null,
        createdBy: data.createdBy ?? null,
      })
      .returning();
    return share;
  }

  async deleteStreamShare(id: string): Promise<void> {
    await db.delete(streamShares).where(eq(streamShares.id, id));
  }

  // Favorites operations
  async getUserFavorites(userId: string): Promise<FavoriteWithStream[]> {
    const favs = await db.query.favorites.findMany({
      where: eq(favorites.userId, userId),
      with: {
        stream: {
          with: {
            studio: true,
          },
        },
      },
      orderBy: [asc(favorites.page), asc(favorites.position)],
    });

    // Only return favorites the user can currently view. If access to a stream
    // is revoked, that favorite is hidden (matching the POST permission check).
    const user = await this.getUser(userId);
    if (user?.role === "admin") {
      return favs;
    }
    const accessible = await this.getUserAccessibleStreamIds(userId);
    return favs.filter((f) => accessible.has(f.streamId));
  }

  async addFavorite(userId: string, streamId: string): Promise<Favorite> {
    // Idempotent: if the stream is already favorited, return the existing row.
    const [existing] = await db
      .select()
      .from(favorites)
      .where(and(eq(favorites.userId, userId), eq(favorites.streamId, streamId)));
    if (existing) {
      return existing;
    }

    // Favorites are kept contiguous, so the new one goes at the end.
    const current = await db
      .select()
      .from(favorites)
      .where(eq(favorites.userId, userId));
    if (current.length >= FAVORITES_MAX) {
      throw new Error("FAVORITES_FULL");
    }

    const index = current.length;
    const page = Math.floor(index / FAVORITES_PER_PAGE) + 1;
    const position = index % FAVORITES_PER_PAGE;

    const [favorite] = await db
      .insert(favorites)
      .values({ userId, streamId, page, position })
      .returning();
    return favorite;
  }

  async removeFavorite(userId: string, streamId: string): Promise<void> {
    await db.transaction(async (tx) => {
      await tx
        .delete(favorites)
        .where(and(eq(favorites.userId, userId), eq(favorites.streamId, streamId)));

      // Re-pack the remaining favorites so page/position stay contiguous.
      const remaining = await tx
        .select()
        .from(favorites)
        .where(eq(favorites.userId, userId))
        .orderBy(asc(favorites.page), asc(favorites.position));

      for (let i = 0; i < remaining.length; i++) {
        const page = Math.floor(i / FAVORITES_PER_PAGE) + 1;
        const position = i % FAVORITES_PER_PAGE;
        const fav = remaining[i];
        if (fav.page !== page || fav.position !== position) {
          await tx
            .update(favorites)
            .set({ page, position })
            .where(eq(favorites.id, fav.id));
        }
      }
    });
  }

  async reorderFavorites(userId: string, orderedStreamIds: string[]): Promise<void> {
    await db.transaction(async (tx) => {
      const owned = await tx
        .select()
        .from(favorites)
        .where(eq(favorites.userId, userId));
      const ownedIds = new Set(owned.map((f) => f.streamId));

      // page/position are derived canonically from the requested order so the
      // result is always contiguous and within bounds, regardless of what the
      // client sent. Foreign/unknown ids are skipped.
      let index = 0;
      for (const streamId of orderedStreamIds) {
        if (!ownedIds.has(streamId)) {
          continue;
        }
        const page = Math.floor(index / FAVORITES_PER_PAGE) + 1;
        const position = index % FAVORITES_PER_PAGE;
        index++;
        await tx
          .update(favorites)
          .set({ page, position })
          .where(and(eq(favorites.userId, userId), eq(favorites.streamId, streamId)));
      }
    });
  }

  // Multiviewer layout operations -----------------------------------------

  async getUserMultiviewerLayouts(userId: string): Promise<MultiviewerLayoutWithMeta[]> {
    const owned = await db
      .select()
      .from(multiviewerLayouts)
      .where(eq(multiviewerLayouts.userId, userId))
      .orderBy(desc(multiviewerLayouts.isDefault), asc(multiviewerLayouts.name));

    // Layouts shared TO this user: directly, or via any group they belong to.
    const groupRows = await db
      .select({ groupId: userGroups.groupId })
      .from(userGroups)
      .where(eq(userGroups.userId, userId));
    const groupIds = groupRows.map((r) => r.groupId);

    const shareConds = [eq(multiviewerLayoutShares.userId, userId)];
    if (groupIds.length > 0) {
      shareConds.push(inArray(multiviewerLayoutShares.groupId, groupIds));
    }
    const shareRows = await db
      .select({ layoutId: multiviewerLayoutShares.layoutId })
      .from(multiviewerLayoutShares)
      .where(shareConds.length === 1 ? shareConds[0] : or(...shareConds));

    const ownedIds = new Set(owned.map((l) => l.id));
    const sharedLayoutIds = Array.from(
      new Set(shareRows.map((r) => r.layoutId))
    ).filter((id) => !ownedIds.has(id));

    const sharedWithMeta: MultiviewerLayoutWithMeta[] = [];
    if (sharedLayoutIds.length > 0) {
      const sharedLayouts = await db
        .select()
        .from(multiviewerLayouts)
        .where(inArray(multiviewerLayouts.id, sharedLayoutIds));

      // Resolve owner display names.
      const ownerIds = Array.from(new Set(sharedLayouts.map((l) => l.userId)));
      const owners = ownerIds.length
        ? await db.select().from(users).where(inArray(users.id, ownerIds))
        : [];
      const ownerName = new Map(owners.map((u) => [u.id, u.username]));

      for (const layout of sharedLayouts) {
        const slotIds = (layout.slots ?? []).filter(
          (s): s is string => Boolean(s)
        );
        const streamsForLayout = await this.getAccessibleStreamsByIds(
          layout.userId,
          slotIds
        );
        sharedWithMeta.push({
          ...layout,
          // Recipients can't make someone else's layout their own default.
          isDefault: false,
          shared: true,
          ownerName: ownerName.get(layout.userId) ?? null,
          streams: streamsForLayout,
        });
      }
      sharedWithMeta.sort((a, b) => a.name.localeCompare(b.name));
    }

    const ownedWithMeta: MultiviewerLayoutWithMeta[] = owned.map((l) => ({
      ...l,
      shared: false,
    }));
    return [...ownedWithMeta, ...sharedWithMeta];
  }

  async getMultiviewerLayoutById(id: string): Promise<MultiviewerLayout | undefined> {
    const [layout] = await db
      .select()
      .from(multiviewerLayouts)
      .where(eq(multiviewerLayouts.id, id));
    return layout;
  }

  async getMultiviewerLayout(userId: string, id: string): Promise<MultiviewerLayout | undefined> {
    const [layout] = await db
      .select()
      .from(multiviewerLayouts)
      .where(and(eq(multiviewerLayouts.id, id), eq(multiviewerLayouts.userId, userId)));
    return layout;
  }

  async createMultiviewerLayout(userId: string, data: InsertMultiviewerLayout): Promise<MultiviewerLayout> {
    return db.transaction(async (tx) => {
      // A user has at most one default layout; setting a new default clears the
      // previous one.
      if (data.isDefault) {
        await tx
          .update(multiviewerLayouts)
          .set({ isDefault: false })
          .where(eq(multiviewerLayouts.userId, userId));
      }
      const [layout] = await tx
        .insert(multiviewerLayouts)
        .values({ ...data, userId })
        .returning();
      return layout;
    });
  }

  async updateMultiviewerLayout(
    userId: string,
    id: string,
    data: Partial<InsertMultiviewerLayout>
  ): Promise<MultiviewerLayout | undefined> {
    return db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(multiviewerLayouts)
        .where(and(eq(multiviewerLayouts.id, id), eq(multiviewerLayouts.userId, userId)));
      if (!existing) {
        return undefined;
      }
      if (data.isDefault) {
        await tx
          .update(multiviewerLayouts)
          .set({ isDefault: false })
          .where(eq(multiviewerLayouts.userId, userId));
      }
      const [layout] = await tx
        .update(multiviewerLayouts)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(multiviewerLayouts.id, id), eq(multiviewerLayouts.userId, userId)))
        .returning();
      return layout;
    });
  }

  async deleteMultiviewerLayout(userId: string, id: string): Promise<void> {
    await db
      .delete(multiviewerLayouts)
      .where(and(eq(multiviewerLayouts.id, id), eq(multiviewerLayouts.userId, userId)));
  }

  async setDefaultMultiviewerLayout(userId: string, id: string): Promise<MultiviewerLayout | undefined> {
    return db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(multiviewerLayouts)
        .where(and(eq(multiviewerLayouts.id, id), eq(multiviewerLayouts.userId, userId)));
      if (!existing) {
        return undefined;
      }
      await tx
        .update(multiviewerLayouts)
        .set({ isDefault: false })
        .where(eq(multiviewerLayouts.userId, userId));
      const [layout] = await tx
        .update(multiviewerLayouts)
        .set({ isDefault: true, updatedAt: new Date() })
        .where(and(eq(multiviewerLayouts.id, id), eq(multiviewerLayouts.userId, userId)))
        .returning();
      return layout;
    });
  }

  async getStreamsByIds(ids: string[]): Promise<Stream[]> {
    if (ids.length === 0) return [];
    return db.select().from(streams).where(inArray(streams.id, ids));
  }

  async getAccessibleStreamsByIds(ownerId: string, ids: string[]): Promise<Stream[]> {
    const resolved = await this.getStreamsByIds(ids);
    if (resolved.length === 0) return [];
    const owner = await this.getUser(ownerId);
    // Admins can see everything; everyone else is filtered to their current
    // permission set, so a layout owner who lost access can't share it onward.
    if (owner?.role === "admin") return resolved;
    const accessible = await this.getUserAccessibleStreamIds(ownerId);
    return resolved.filter((s) => accessible.has(s.id));
  }

  // Multiviewer external (public) share links ------------------------------

  async getMultiviewerSharesByLayout(layoutId: string): Promise<MultiviewerShare[]> {
    return db
      .select()
      .from(multiviewerShares)
      .where(eq(multiviewerShares.layoutId, layoutId))
      .orderBy(desc(multiviewerShares.createdAt));
  }

  async getMultiviewerShareByToken(token: string): Promise<MultiviewerShare | undefined> {
    const [share] = await db
      .select()
      .from(multiviewerShares)
      .where(eq(multiviewerShares.token, token));
    return share;
  }

  async createMultiviewerShare(data: {
    layoutId: string;
    token: string;
    label?: string | null;
    expiresAt?: Date | null;
    createdBy?: string | null;
  }): Promise<MultiviewerShare> {
    const [share] = await db
      .insert(multiviewerShares)
      .values({
        layoutId: data.layoutId,
        token: data.token,
        label: data.label ?? null,
        expiresAt: data.expiresAt ?? null,
        createdBy: data.createdBy ?? null,
      })
      .returning();
    return share;
  }

  async deleteMultiviewerShare(id: string): Promise<void> {
    await db.delete(multiviewerShares).where(eq(multiviewerShares.id, id));
  }

  // Multiviewer internal (users/groups) shares -----------------------------

  async getLayoutInternalShares(
    layoutId: string
  ): Promise<{ userIds: string[]; groupIds: string[] }> {
    const rows = await db
      .select()
      .from(multiviewerLayoutShares)
      .where(eq(multiviewerLayoutShares.layoutId, layoutId));
    return {
      userIds: rows.filter((r) => r.userId).map((r) => r.userId as string),
      groupIds: rows.filter((r) => r.groupId).map((r) => r.groupId as string),
    };
  }

  async setLayoutInternalShares(
    layoutId: string,
    userIds: string[],
    groupIds: string[]
  ): Promise<void> {
    const uniqueUsers = Array.from(new Set(userIds.filter(Boolean)));
    const uniqueGroups = Array.from(new Set(groupIds.filter(Boolean)));
    await db.transaction(async (tx) => {
      // Replace the full grant set for this layout.
      await tx
        .delete(multiviewerLayoutShares)
        .where(eq(multiviewerLayoutShares.layoutId, layoutId));
      const values = [
        ...uniqueUsers.map((userId) => ({ layoutId, userId, groupId: null })),
        ...uniqueGroups.map((groupId) => ({ layoutId, userId: null, groupId })),
      ];
      if (values.length > 0) {
        await tx.insert(multiviewerLayoutShares).values(values);
      }
    });
  }
}

export const storage = new DatabaseStorage();
