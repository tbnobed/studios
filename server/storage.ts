import { 
  users, 
  studios, 
  streams, 
  userStudioPermissions,
  type User, 
  type InsertUser,
  type Studio,
  type InsertStudio,
  type Stream,
  type InsertStream,
  type UserStudioPermission,
  type InsertUserStudioPermission,
  type StudioWithStreams,
  type UserWithPermissions
} from "@shared/schema";
import { db } from "./db";
import { eq, and, asc } from "drizzle-orm";
import bcrypt from "bcrypt";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
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
  getStream(id: string): Promise<Stream | undefined>;
  createStream(stream: InsertStream): Promise<Stream>;
  updateStream(id: string, data: Partial<InsertStream>): Promise<Stream>;
  updateStreamStatus(id: string, status: 'online' | 'offline' | 'error'): Promise<void>;

  // Permission operations
  getUserStudioPermission(userId: string, studioId: string): Promise<UserStudioPermission | undefined>;
  setUserStudioPermission(permission: InsertUserStudioPermission): Promise<UserStudioPermission>;
  removeUserStudioPermission(userId: string, studioId: string): Promise<void>;
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

  async getStream(id: string): Promise<Stream | undefined> {
    const [stream] = await db.select().from(streams).where(eq(streams.id, id));
    return stream;
  }

  async createStream(streamData: InsertStream): Promise<Stream> {
    const [stream] = await db.insert(streams).values(streamData).returning();
    return stream;
  }

  async updateStream(id: string, data: Partial<InsertStream>): Promise<Stream> {
    const [stream] = await db
      .update(streams)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(streams.id, id))
      .returning();
    return stream;
  }

  async updateStreamStatus(id: string, status: 'online' | 'offline' | 'error'): Promise<void> {
    await db
      .update(streams)
      .set({ status, updatedAt: new Date() })
      .where(eq(streams.id, id));
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
}

export const storage = new DatabaseStorage();
