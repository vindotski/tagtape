/**
 * Album history: the details of the albums a guest has started, so the page
 * can list them. Only what the visitor typed about the album is kept: never
 * track links, track titles, the cover or any media.
 *
 * TagTape owns `public` in its database and migrates it itself, on first use
 * (Spotcraft only migrates the `auth` schema). Rows belong to a guest in
 * `auth.users` and go with it when it's deleted.
 */
import type { Album } from "@tagtape/shared";
import { desc, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
	integer,
	pgTable,
	smallint,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import type { AlbumSummary } from "./albums";
import { backend } from "./backend.server";

/** How many albums a guest keeps; older ones are dropped as new ones come. */
export const HISTORY_LIMIT = 50;

export const albums = pgTable("albums", {
	id: uuid().primaryKey().defaultRandom(),
	// REFERENCES auth.users (id) ON DELETE CASCADE, in the migration.
	userId: uuid("user_id").notNull(),
	title: text().notNull(),
	artist: text().notNull(),
	genre: text(),
	year: smallint(),
	trackCount: integer("track_count").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true })
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

/** Records a started album and keeps only the guest's newest `HISTORY_LIMIT`. */
export async function recordAlbum(
	db: Database,
	userId: string,
	album: Album,
): Promise<void> {
	await db.transaction(async (tx) => {
		await tx.insert(albums).values({
			userId,
			title: album.title,
			artist: album.artist,
			genre: album.genre ?? null,
			year: album.year === undefined ? null : Number(album.year),
			trackCount: album.tracks.length,
		});
		await tx.execute(sql`
			DELETE FROM albums
			WHERE user_id = ${userId}
			  AND id NOT IN (
				SELECT id FROM albums
				WHERE user_id = ${userId}
				ORDER BY created_at DESC, id
				LIMIT ${HISTORY_LIMIT}
			  )`);
	});
}

/** The guest's albums, newest first. */
export async function listAlbums(
	db: Database,
	userId: string,
	limit = 20,
): Promise<AlbumSummary[]> {
	const rows = await db
		.select({
			id: albums.id,
			title: albums.title,
			artist: albums.artist,
			genre: albums.genre,
			year: albums.year,
			trackCount: albums.trackCount,
			createdAt: albums.createdAt,
		})
		.from(albums)
		.where(eq(albums.userId, userId))
		.orderBy(desc(albums.createdAt), albums.id)
		.limit(limit);
	return rows.map((row) => ({
		...row,
		createdAt: row.createdAt.toISOString(),
	}));
}
