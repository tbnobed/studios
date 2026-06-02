import { 
  users, 
  studios, 
  streams, 
  userStudioPermissions,
  favorites,
  type User, 
  type InsertUser,
  type Studio,
  type InsertStudio,
  type Stream,
  type InsertStream,
  type UserStudioPermission,
  type InsertUserStudioPermission,
  type StudioWithStreams,
  type UserWithPermissions,
  type Favorite,
  type FavoriteWithStream
} from "@shared/schema";
import { db } from "./db";
import { eq, and, asc } from "drizzle-orm";
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

  // Permission operations
  getUserStudioPermission(userId: string, studioId: string): Promise<UserStudioPermission | undefined>;
  setUserStudioPermission(permission: InsertUserStudioPermission): Promise<UserStudioPermission>;
  removeUserStudioPermission(userId: string, studioId: string): Promise<void>;

  // Favorites operations
  getUserFavorites(userId: string): Promise<FavoriteWithStream[]>;
  addFavorite(userId: string, streamId: string): Promise<Favorite>;
  removeFavorite(userId: string, streamId: string): Promise<void>;
  reorderFavorites(userId: string, orderedStreamIds: string[]): Promise<void>;
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
        studioPermissions: {
          with: {
            studio: true,
          },
        },
      },
    });
    return user as UserWithPermissions;
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
        studioPermissions: {
          with: {
            studio: true,
          },
        },
      },
    });
    return allUsers as UserWithPermissions[];
  }

  async verifyUserPassword(username: string, password: string): Promise<User | null> {
    const user = await this.getUserByUsername(username);
    if (!user) return null;

    const isValid = await bcrypt.compare(password, user.password);
    return isValid ? user : null;
  }

  // Studio operations
  async getAllStudios(): Promise<Studio[]> {
    return db.select().from(studios).where(eq(studios.isActive, true)).orderBy(asc(studios.name));
  }

  async getStudioWithStreams(id: string): Promise<StudioWithStreams | undefined> {
    const studio = await db.query.studios.findFirst({
      where: eq(studios.id, id),
      with: {
        streams: {
          where: eq(streams.isActive, true),
          orderBy: (streams, { asc }) => [asc(streams.name)],
        },
      },
    });
    return studio as StudioWithStreams;
  }

  async getUserStudios(userId: string): Promise<StudioWithStreams[]> {
    const userPermissions = await db.query.userStudioPermissions.findMany({
      where: eq(userStudioPermissions.userId, userId),
      with: {
        studio: {
          with: {
            streams: {
              where: eq(streams.isActive, true),
              orderBy: (streams, { asc }) => [asc(streams.name)],
            },
          },
        },
      },
    });

    // Sort studios by name and return
    const studiosWithStreams = userPermissions.map(p => p.studio as StudioWithStreams);
    return studiosWithStreams.sort((a, b) => a.name.localeCompare(b.name));
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
    ).orderBy(asc(streams.name));
  }

  async getAllStreamsByStudio(studioId: string): Promise<Stream[]> {
    return db.select().from(streams)
      .where(eq(streams.studioId, studioId))
      .orderBy(asc(streams.name));
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

  // Permission operations
  async getUserStudioPermission(userId: string, studioId: string): Promise<UserStudioPermission | undefined> {
    const [permission] = await db
      .select()
      .from(userStudioPermissions)
      .where(
        and(
          eq(userStudioPermissions.userId, userId),
          eq(userStudioPermissions.studioId, studioId)
        )
      );
    return permission;
  }

  async setUserStudioPermission(permissionData: InsertUserStudioPermission): Promise<UserStudioPermission> {
    const existing = await this.getUserStudioPermission(
      permissionData.userId,
      permissionData.studioId
    );

    if (existing) {
      const [permission] = await db
        .update(userStudioPermissions)
        .set(permissionData)
        .where(eq(userStudioPermissions.id, existing.id))
        .returning();
      return permission;
    } else {
      const [permission] = await db
        .insert(userStudioPermissions)
        .values(permissionData)
        .returning();
      return permission;
    }
  }

  async removeUserStudioPermission(userId: string, studioId: string): Promise<void> {
    await db
      .delete(userStudioPermissions)
      .where(
        and(
          eq(userStudioPermissions.userId, userId),
          eq(userStudioPermissions.studioId, studioId)
        )
      );
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

    // Only return favorites the user can currently view. If studio access is
    // revoked, those favorites are hidden (matching the POST permission check).
    const perms = await db
      .select()
      .from(userStudioPermissions)
      .where(eq(userStudioPermissions.userId, userId));
    const allowedStudioIds = new Set(
      perms.filter((p) => p.canView).map((p) => p.studioId)
    );

    return favs.filter((f) => allowedStudioIds.has(f.stream.studioId));
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
}

export const storage = new DatabaseStorage();
