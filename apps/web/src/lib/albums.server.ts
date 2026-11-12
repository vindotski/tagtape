/**
 * Album history: the albums a guest has started, kept in full so they can be
 * opened and made again. What the visitor typed is stored (details, track
 * titles and links, the cover's link); never any audio or image.
 *
 * TagTape owns `public` in its database and migrates it itself, on first use
 * (Spotcraft only migrates the `auth` schema). Rows belong to a guest in
 * `auth.users` and go with it when it's deleted.
 */
import { type Album, type Track, trackInputSchema } from "@tagtape/shared";
import { and, desc, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
	integer,
	jsonb,
	pgTable,
	smallint,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { z } from "zod";
import { type AlbumSummary, HISTORY_LIMIT, type StoredAlbum } from "./albums";
import { backend } from "./backend.server";

export { HISTORY_LIMIT } from "./albums";

export const albums = pgTable("albums", {
	id: uuid().primaryKey().defaultRandom(),
	// REFERENCES auth.users (id) ON DELETE CASCADE, in the migration.
	userId: uuid("user_id").notNull(),
	title: text().notNull(),
	artist: text().notNull(),
	genre: text(),
	year: smallint(),
	trackCount: integer("track_count").notNull(),
	coverUrl: text("cover_url"),
	// NULL for albums recorded before migration 2, when links weren't kept.
	tracks: jsonb().$type<Track[]>(),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

/**
 * Migrations for `public`, applied in order. Like the kit's, they only add:
 * an older release must keep working against a newer schema while a deploy
 * rolls over.
 */
export const MIGRATIONS: readonly { version: number; sql: string }[] = [
	{
		version: 1,
		sql: `
CREATE TABLE albums (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  title       text NOT NULL,
  artist      text NOT NULL,
  genre       text,
  year        smallint,
  track_count integer NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX albums_user_id_created_at ON albums (user_id, created_at DESC);`,
	},
	{
		// Full albums, so they can be made again; edits bump updated_at.
		// Albums from before keep their own date: otherwise they'd all share
		// the migration's, and lists and the trim would order them at random.
		version: 2,
		sql: `
ALTER TABLE albums
  ADD COLUMN cover_url  text,
  ADD COLUMN tracks     jsonb,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
UPDATE albums SET updated_at = created_at;
CREATE INDEX albums_user_id_updated_at ON albums (user_id, updated_at DESC);`,
	},
];

export type Database = NodePgDatabase;

/**
 * Brings `public` up to the latest migration, in one transaction under an
 * advisory lock, so app instances starting together wait for each other.
 * Returns the version it ended at.
 */
export async function migrateApp(db: Database): Promise<number> {
	return db.transaction(async (tx) => {
		await tx.execute(
			sql`SELECT pg_advisory_xact_lock(hashtext('tagtape.migrations'))`,
		);
		await tx.execute(sql`
			CREATE TABLE IF NOT EXISTS tagtape_migrations (
				version    integer PRIMARY KEY,
				applied_at timestamptz NOT NULL DEFAULT now()
			)`);
		const { rows } = await tx.execute<{ version: number }>(
			sql`SELECT coalesce(max(version), 0)::int AS version FROM tagtape_migrations`,
		);
		let version = rows[0]?.version ?? 0;
		for (const migration of MIGRATIONS) {
			if (migration.version <= version) continue;
			await tx.execute(sql.raw(migration.sql));
			await tx.execute(
				sql`INSERT INTO tagtape_migrations (version) VALUES (${migration.version})`,
			);
			version = migration.version;
		}
		return version;
	});
}

let ready: Promise<Database> | undefined;

/** The app's database, migrated on first use (once per process). */
export function database(): Promise<Database> {
	ready ??= (async () => {
		const { db } = backend();
		await migrateApp(db);
		return db;
	})().catch((error: unknown) => {
		ready = undefined; // try again on the next request
		throw error;
	});
	return ready;
}

/**
 * Records a started album and returns its id. With `albumId` (an album the
 * visitor reopened) that album is updated, if it's theirs; otherwise a new
 * one is added. Only the guest's newest `HISTORY_LIMIT` are kept.
 */
export async function recordAlbum(
	db: Database,
	userId: string,
	album: Album,
	albumId?: string,
): Promise<string> {
	const values = {
		title: album.title,
		artist: album.artist,
		genre: album.genre ?? null,
		year: album.year === undefined ? null : Number(album.year),
		trackCount: album.tracks.length,
		coverUrl: album.coverUrl ?? null,
		tracks: album.tracks.map(({ title, url }) => ({ title, url })),
	};
	return db.transaction(async (tx) => {
		let id: string | undefined;
		if (albumId) {
			const updated = await tx
				.update(albums)
				.set({ ...values, updatedAt: sql`now()` })
				.where(and(eq(albums.id, albumId), eq(albums.userId, userId)))
				.returning({ id: albums.id });
			id = updated[0]?.id;
		}
		if (!id) {
			const inserted = await tx
				.insert(albums)
				.values({ userId, ...values })
				.returning({ id: albums.id });
			id = inserted[0]?.id as string;
		}
		await tx.execute(sql`
			DELETE FROM albums
			WHERE user_id = ${userId}
			  AND id NOT IN (
				SELECT id FROM albums
				WHERE user_id = ${userId}
				ORDER BY updated_at DESC, id
				LIMIT ${HISTORY_LIMIT}
			  )`);
		return id;
	});
}

const summaryColumns = {
	id: albums.id,
	title: albums.title,
	artist: albums.artist,
	genre: albums.genre,
	year: albums.year,
	trackCount: albums.trackCount,
	createdAt: albums.createdAt,
	updatedAt: albums.updatedAt,
};

function toSummary(
	row: {
		[K in keyof typeof summaryColumns]: (typeof albums.$inferSelect)[K];
	},
): AlbumSummary {
	return {
		...row,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

/** The guest's albums, most recently made first (no links: the list doesn't need them). */
export async function listAlbums(
	db: Database,
	userId: string,
	limit = 20,
): Promise<AlbumSummary[]> {
	const rows = await db
		.select(summaryColumns)
		.from(albums)
		.where(eq(albums.userId, userId))
		.orderBy(desc(albums.updatedAt), albums.id)
		.limit(limit);
	return rows.map(toSummary);
}

const storedTracksSchema = z.array(trackInputSchema).min(1);

/** One of the guest's albums in full, or null if it isn't theirs (or is gone). */
export async function getAlbum(
	db: Database,
	userId: string,
	id: string,
): Promise<StoredAlbum | null> {
	const [row] = await db
		.select({
			...summaryColumns,
			coverUrl: albums.coverUrl,
			tracks: albums.tracks,
		})
		.from(albums)
		.where(and(eq(albums.id, id), eq(albums.userId, userId)));
	if (!row) return null;
	const { coverUrl, tracks, ...summary } = row;
	// Rows from before migration 2 have no tracks; treat odd data the same way.
	const parsed = storedTracksSchema.safeParse(tracks);
	return {
		...toSummary(summary),
		coverUrl,
		tracks: parsed.success ? parsed.data : [],
		complete: parsed.success,
	};
}

/** Deletes one of the guest's albums; false if it wasn't theirs. */
export async function deleteAlbum(
	db: Database,
	userId: string,
	id: string,
): Promise<boolean> {
	const deleted = await db
		.delete(albums)
		.where(and(eq(albums.id, id), eq(albums.userId, userId)))
		.returning({ id: albums.id });
	return deleted.length > 0;
}
