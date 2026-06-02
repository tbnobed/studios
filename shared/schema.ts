import { sql } from "drizzle-orm";
import { 
  pgTable, 
  varchar, 
  text, 
  timestamp, 
  integer, 
  boolean, 
  pgEnum,
  jsonb,
  unique,
  uniqueIndex
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums
export const userRoleEnum = pgEnum("user_role", ["admin", "viewer"]);
export const streamStatusEnum = pgEnum("stream_status", ["online", "offline", "error"]);
export const streamTypeEnum = pgEnum("stream_type", ["webrtc", "hls"]);

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
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Streams table
export const streams = pgTable("streams", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  studioId: varchar("studio_id").notNull().references(() => studios.id),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  streamUrl: text("stream_url").notNull(),
  streamType: streamTypeEnum("stream_type").notNull().default("webrtc"),
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
  createdAt: timestamp("created_at").defaultNow(),
});

// Per-user favorite streams. Each user can favorite up to 8 streams per page,
// across up to 5 pages (40 total). `page` is 1-5 and `position` is 0-7,
// together describing where the stream sits on the user's favorites pages.
export const favorites = pgTable("favorites", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  streamId: varchar("stream_id").notNull().references(() => streams.id, { onDelete: "cascade" }),
  page: integer("page").notNull().default(1),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  uniqueUserStream: unique("favorites_user_stream_unique").on(table.userId, table.streamId),
}));

// Per-user saved multiviewer layouts. `layoutType` is one of the supported
// mosaics (2x2, 3x3, 4x4, featured). `slots` is an ordered array of stream ids
// (or null for an empty slot) whose length matches the layout's slot count.
export const multiviewerLayouts = pgTable("multiviewer_layouts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  layoutType: varchar("layout_type", { length: 20 }).notNull().default("2x2"),
  slots: jsonb("slots").$type<(string | null)[]>().notNull().default([]),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  // Enforce "at most one default layout per user" at the DB level so concurrent
  // requests can't both win and leave two defaults. Partial unique index only
  // applies to rows where is_default = true.
  oneDefaultPerUser: uniqueIndex("multiviewer_layouts_one_default_per_user")
    .on(table.userId)
    .where(sql`${table.isDefault} = true`),
}));

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  studioPermissions: many(userStudioPermissions),
  favorites: many(favorites),
  multiviewerLayouts: many(multiviewerLayouts),
}));

export const multiviewerLayoutsRelations = relations(multiviewerLayouts, ({ one }) => ({
  user: one(users, {
    fields: [multiviewerLayouts.userId],
    references: [users.id],
  }),
}));

export const favoritesRelations = relations(favorites, ({ one }) => ({
  user: one(users, {
    fields: [favorites.userId],
    references: [users.id],
  }),
  stream: one(streams, {
    fields: [favorites.streamId],
    references: [streams.id],
  }),
}));

export const studiosRelations = relations(studios, ({ many }) => ({
  streams: many(streams),
  userPermissions: many(userStudioPermissions),
}));

export const streamsRelations = relations(streams, ({ one, many }) => ({
  studio: one(studios, {
    fields: [streams.studioId],
    references: [studios.id],
  }),
  favorites: many(favorites),
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
  updatedAt: true,
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

export const insertFavoriteSchema = createInsertSchema(favorites).omit({
  id: true,
  createdAt: true,
});

export const MULTIVIEWER_LAYOUT_TYPES = ["2x2", "3x3", "4x4", "featured"] as const;

export const insertMultiviewerLayoutSchema = createInsertSchema(multiviewerLayouts, {
  layoutType: z.enum(MULTIVIEWER_LAYOUT_TYPES),
  slots: z.array(z.string().nullable()),
}).omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
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

export type Favorite = typeof favorites.$inferSelect;
export type InsertFavorite = z.infer<typeof insertFavoriteSchema>;

export type MultiviewerLayout = typeof multiviewerLayouts.$inferSelect;
export type InsertMultiviewerLayout = z.infer<typeof insertMultiviewerLayoutSchema>;
export type MultiviewerLayoutType = (typeof MULTIVIEWER_LAYOUT_TYPES)[number];

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

// A favorite enriched with its stream and that stream's studio, for rendering
// the Favorites page.
export type FavoriteWithStream = Favorite & {
  stream: Stream & {
    studio: Studio;
  };
};
