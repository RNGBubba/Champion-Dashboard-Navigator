import { createInsertSchema } from "drizzle-zod";
import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const championPosterSnapshotsTable = pgTable(
  "champion_poster_snapshots",
  {
    id: text("id").primaryKey(),
    snapshot: jsonb("snapshot").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export const insertChampionPosterSnapshotSchema = createInsertSchema(
  championPosterSnapshotsTable,
).omit({ updatedAt: true });

export type InsertChampionPosterSnapshot =
  typeof championPosterSnapshotsTable.$inferInsert;
export type ChampionPosterSnapshotRow =
  typeof championPosterSnapshotsTable.$inferSelect;
