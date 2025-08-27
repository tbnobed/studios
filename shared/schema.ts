import { sql } from "drizzle-orm";
import { 
  pgTable, 
  varchar, 
  text, 
  timestamp, 
  integer, 
  boolean, 
  pgEnum,
  jsonb
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums
export const userRoleEnum = pgEnum("user_role", ["admin", "operator", "viewer"]);
export const streamStatusEnum = pgEnum("stream_status", ["online", "offline", "error"]);

// Users table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: varchar("username", { length: 50 }).notNull().unique(),
  email: varchar("email", { length: 100 }).unique(),
  password: text("password").notNull(),
  firstName: varchar("first_name", { length: 50 }),
  lastName: varchar("last_name", { length: 50 }),
  role: userRoleEnum("role").notNull().default("viewer"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Studios table
export const studios = pgTable("studios", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 100 }).notNull(),
  location: varchar("location", { length: 100 }),
  description: text("description"),
  colorCode: varchar("color_code", { length: 7 }), // hex color
  imageUrl: varchar("image_url", { length: 500 }), // studio image path/url
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Streams table
export const streams = pgTable("streams", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  studioId: varchar("studio_id").notNull().references(() => studios.id),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  streamUrl: text("stream_url").notNull(),
  resolution: varchar("resolution", { length: 20 }).default("1080p"),
  fps: integer("fps").default(30),
  status: streamStatusEnum("status").notNull().default("offline"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// User permissions for studios
export const userStudioPermissions = pgTable("user_studio_permissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  studioId: varchar("studio_id").notNull().references(() => studios.id),
  canView: boolean("can_view").notNull().default(true),
  canControl: boolean("can_control").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  studioPermissions: many(userStudioPermissions),
}));

export const studiosRelations = relations(studios, ({ many }) => ({
  streams: many(streams),
  userPermissions: many(userStudioPermissions),
}));

export const streamsRelations = relations(streams, ({ one }) => ({
  studio: one(studios, {
    fields: [streams.studioId],
    references: [studios.id],
  }),
}));

export const userStudioPermissionsRelations = relations(userStudioPermissions, ({ one }) => ({
  user: one(users, {
    fields: [userStudioPermissions.userId],
    references: [users.id],
  }),
  studio: one(studios, {
    fields: [userStudioPermissions.studioId],
    references: [studios.id],
  }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertStudioSchema = createInsertSchema(studios).omit({
  id: true,
  createdAt: true,
});

export const insertStreamSchema = createInsertSchema(streams).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUserStudioPermissionSchema = createInsertSchema(userStudioPermissions).omit({
  id: true,
  createdAt: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Studio = typeof studios.$inferSelect;
export type InsertStudio = z.infer<typeof insertStudioSchema>;

export type Stream = typeof streams.$inferSelect;
export type InsertStream = z.infer<typeof insertStreamSchema>;

export type UserStudioPermission = typeof userStudioPermissions.$inferSelect;
export type InsertUserStudioPermission = z.infer<typeof insertUserStudioPermissionSchema>;

// Extended types for API responses
export type StudioWithStreams = Studio & {
  streams: Stream[];
  userPermissions?: UserStudioPermission[];
  primaryColor?: string; // Alias for colorCode for backward compatibility
};

export type UserWithPermissions = User & {
  permissions?: (UserStudioPermission & {
    studio: Studio;
  })[];
  studioPermissions?: (UserStudioPermission & {
    studio: Studio;
  })[];
};
