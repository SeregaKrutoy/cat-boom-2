import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const games = pgTable("games", {
  code: text("code").primaryKey(),
  state: jsonb("state").notNull(),
  version: integer("version").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  // Last time any player of the room had its page open (presence heartbeat)
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
});
