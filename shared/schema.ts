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

// Legacy: whole-studio permissions. Superseded by per-stream permissions and
// groups below. Kept defined so db:push doesn't try to drop the table, but no
// longer used for access decisions.
export const userStudioPermissions = pgTable("user_studio_permissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  studioId: varchar("studio_id").notNull().references(() => studios.id),
  canView: boolean("can_view").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Permission groups. A group bundles a set of stream grants; every member of
// the group can view those streams. Users may belong to multiple groups and
// receive the union of all their groups' grants.
export const groups = pgTable("groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 100 }).notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Group membership (many-to-many between users and groups).
export const userGroups = pgTable("user_groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  groupId: varchar("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  uniqueUserGroup: unique("user_groups_user_group_unique").on(table.userId, table.groupId),
}));

// Streams a group grants access to. Presence of a row = granted (add-only).
export const groupStreamPermissions = pgTable("group_stream_permissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  groupId: varchar("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
  streamId: varchar("stream_id").notNull().references(() => streams.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  uniqueGroupStream: unique("group_stream_perms_group_stream_unique").on(table.groupId, table.streamId),
}));

// Individual per-stream grants for a single user. Add-only: these stack on top
// of whatever the user's groups already grant; there is no deny.
export const userStreamPermissions = pgTable("user_stream_permissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  streamId: varchar("stream_id").notNull().references(() => streams.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  uniqueUserStream: unique("user_stream_perms_user_stream_unique").on(table.userId, table.streamId),
}));

// User invitations. When an admin invites a user, the user row is created
// inactive with an unusable random password, and an invite row holds a hashed,
// single-use token. The user exchanges the token (via an emailed link) for
// setting their own password, which activates the account. One invite per user;
// resending replaces the existing row.
export const invites = pgTable("invites", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  acceptedAt: timestamp("accepted_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  tokenHashIdx: uniqueIndex("invites_token_hash_idx").on(table.tokenHash),
}));

// Public share links for a single stream. An admin generates an unguessable
// token; anyone with the resulting link can watch that one stream without an
// account until the link expires (expiresAt, null = never) or is deleted, which
// revokes access immediately.
export const streamShares = pgTable("stream_shares", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  streamId: varchar("stream_id").notNull().references(() => streams.id, { onDelete: "cascade" }),
  token: varchar("token", { length: 64 }).notNull().unique(),
  label: varchar("label", { length: 100 }),
  expiresAt: timestamp("expires_at"),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  tokenIdx: uniqueIndex("stream_shares_token_idx").on(table.token),
}));

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

// Public, token-based external links for watching a saved multiview layout
// without an account. A link works until it expires or is deleted.
export const multiviewerShares = pgTable("multiviewer_shares", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  layoutId: varchar("layout_id").notNull().references(() => multiviewerLayouts.id, { onDelete: "cascade" }),
  token: varchar("token", { length: 64 }).notNull().unique(),
  label: varchar("label", { length: 100 }),
  expiresAt: timestamp("expires_at"),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  tokenIdx: uniqueIndex("multiviewer_shares_token_idx").on(table.token),
}));

// Internal grants: make a saved layout viewable (read-only) by a specific
// logged-in user OR a group. Exactly one of userId/groupId is set per row.
export const multiviewerLayoutShares = pgTable("multiviewer_layout_shares", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  layoutId: varchar("layout_id").notNull().references(() => multiviewerLayouts.id, { onDelete: "cascade" }),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }),
  groupId: varchar("group_id").references(() => groups.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  studioPermissions: many(userStudioPermissions),
  streamPermissions: many(userStreamPermissions),
  groupMemberships: many(userGroups),
  favorites: many(favorites),
  multiviewerLayouts: many(multiviewerLayouts),
}));

export const groupsRelations = relations(groups, ({ many }) => ({
  members: many(userGroups),
  streamPermissions: many(groupStreamPermissions),
}));

export const userGroupsRelations = relations(userGroups, ({ one }) => ({
  user: one(users, {
    fields: [userGroups.userId],
    references: [users.id],
  }),
  group: one(groups, {
    fields: [userGroups.groupId],
    references: [groups.id],
  }),
}));

export const groupStreamPermissionsRelations = relations(groupStreamPermissions, ({ one }) => ({
  group: one(groups, {
    fields: [groupStreamPermissions.groupId],
    references: [groups.id],
  }),
  stream: one(streams, {
    fields: [groupStreamPermissions.streamId],
    references: [streams.id],
  }),
}));

export const userStreamPermissionsRelations = relations(userStreamPermissions, ({ one }) => ({
  user: one(users, {
    fields: [userStreamPermissions.userId],
    references: [users.id],
  }),
  stream: one(streams, {
    fields: [userStreamPermissions.streamId],
    references: [streams.id],
  }),
}));

export const multiviewerLayoutsRelations = relations(multiviewerLayouts, ({ one, many }) => ({
  user: one(users, {
    fields: [multiviewerLayouts.userId],
    references: [users.id],
  }),
  shares: many(multiviewerShares),
  internalShares: many(multiviewerLayoutShares),
}));

export const multiviewerSharesRelations = relations(multiviewerShares, ({ one }) => ({
  layout: one(multiviewerLayouts, {
    fields: [multiviewerShares.layoutId],
    references: [multiviewerLayouts.id],
  }),
}));

export const multiviewerLayoutSharesRelations = relations(multiviewerLayoutShares, ({ one }) => ({
  layout: one(multiviewerLayouts, {
    fields: [multiviewerLayoutShares.layoutId],
    references: [multiviewerLayouts.id],
  }),
  user: one(users, {
    fields: [multiviewerLayoutShares.userId],
    references: [users.id],
  }),
  group: one(groups, {
    fields: [multiviewerLayoutShares.groupId],
    references: [groups.id],
  }),
}));

export const invitesRelations = relations(invites, ({ one }) => ({
  user: one(users, {
    fields: [invites.userId],
    references: [users.id],
  }),
}));

export const streamSharesRelations = relations(streamShares, ({ one }) => ({
  stream: one(streams, {
    fields: [streamShares.streamId],
    references: [streams.id],
  }),
  creator: one(users, {
    fields: [streamShares.createdBy],
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

export const insertGroupSchema = createInsertSchema(groups).omit({
  id: true,
  createdAt: true,
});

export const insertStreamShareSchema = createInsertSchema(streamShares, {
  expiresAt: z.coerce.date().nullable().optional(),
}).omit({
  id: true,
  token: true,
  createdBy: true,
  createdAt: true,
});

export const insertMultiviewerShareSchema = createInsertSchema(multiviewerShares, {
  expiresAt: z.coerce.date().nullable().optional(),
}).omit({
  id: true,
  token: true,
  createdBy: true,
  createdAt: true,
});

export const MULTIVIEWER_LAYOUT_TYPES = [
  // Basic equal grids
  "1x1", "2x2", "3x3", "4x4",
  // Spotlight (one large tile + supporting tiles)
  "featured", "ULeft", "URight", "DLeft", "DRight", "Left", "Right",
  "QuadLR", "QuadUL", "QuadUR", "QuadLL",
  // Horizontal bands
  "H2", "H3", "H4",
  "H1-2", "H2-1", "H1-3", "H3-1", "H2-3", "H3-2", "H2-4", "H4-2", "H3-3",
  "H3-4", "H4-3", "H4-4",
  "H2-4-4", "H4-2-4", "H4-4-2", "H2-5-5", "H2-6-6", "H4-4-4",
  // Vertical bands
  "V2", "V3", "V2-4-4", "V4-4-2",
] as const;

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

export type Group = typeof groups.$inferSelect;
export type InsertGroup = z.infer<typeof insertGroupSchema>;

export type UserGroup = typeof userGroups.$inferSelect;
export type GroupStreamPermission = typeof groupStreamPermissions.$inferSelect;
export type UserStreamPermission = typeof userStreamPermissions.$inferSelect;

export type Invite = typeof invites.$inferSelect;

export type StreamShare = typeof streamShares.$inferSelect;
export type InsertStreamShare = z.infer<typeof insertStreamShareSchema>;
export type StreamShareWithStream = StreamShare & { stream: Stream };
export type StreamShareWithStreamAndCreator = StreamShareWithStream & {
  creator?: { id: string; username: string } | null;
};

export type MultiviewerLayout = typeof multiviewerLayouts.$inferSelect;
export type InsertMultiviewerLayout = z.infer<typeof insertMultiviewerLayoutSchema>;
export type MultiviewerLayoutType = (typeof MULTIVIEWER_LAYOUT_TYPES)[number];

export type MultiviewerShare = typeof multiviewerShares.$inferSelect;
export type InsertMultiviewerShare = z.infer<typeof insertMultiviewerShareSchema>;
export type MultiviewerLayoutShare = typeof multiviewerLayoutShares.$inferSelect;

// A layout as returned to the Multiviewer page. `shared` layouts are ones
// shared TO this user by someone else (read-only); they carry the owner's name
// and the resolved stream objects for their slots (so they render even when the
// recipient lacks direct permission to those streams).
export type MultiviewerLayoutWithMeta = MultiviewerLayout & {
  shared?: boolean;
  ownerName?: string | null;
  streams?: Stream[];
};

// The payload served to a public (no-account) multiview share viewer.
export type MultiviewerSharePublic = {
  label: string | null;
  expiresAt: Date | string | null;
  layout: Pick<MultiviewerLayout, "id" | "name" | "layoutType" | "slots">;
  streams: Stream[];
};

// Extended types for API responses
export type StudioWithStreams = Studio & {
  streams: Stream[];
  userPermissions?: UserStudioPermission[];
  primaryColor?: string; // Alias for colorCode for backward compatibility
};

// A group plus the ids of streams it grants and how many members it has.
export type GroupWithStreams = Group & {
  streamIds: string[];
  memberCount: number;
};

export type UserWithPermissions = User & {
  // Groups this user belongs to.
  groups?: Group[];
  // Convenience: ids of the user's groups.
  groupIds?: string[];
  // Individual add-only stream grants (ids only).
  streamIds?: string[];
};

// A favorite enriched with its stream and that stream's studio, for rendering
// the Favorites page.
export type FavoriteWithStream = Favorite & {
  stream: Stream & {
    studio: Studio;
  };
};
