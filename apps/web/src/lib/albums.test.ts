/**
 * Album history against a real Postgres. Needs TAGTAPE_TEST_DATABASE_URL, a
 * role that may create databases (`pnpm docker:test` and CI set it); without
 * it the tests are skipped. Each run uses its own throwaway database.
 */
import { randomBytes } from "node:crypto";
import { type Backend, createBackend } from "@spotcraft/kit";
import { migrate } from "@spotcraft/kit/provision";
import type { Album } from "@tagtape/shared";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	deleteAlbum,
	getAlbum,
	HISTORY_LIMIT,
	listAlbums,
	MIGRATIONS,
	migrateApp,
	recordAlbum,
} from "./albums.server";

const adminUrl = process.env.TAGTAPE_TEST_DATABASE_URL;

const album = (title: string): Album => ({
	title,
	artist: "The Example Band",
	genre: "Test",
	year: "1999",
	tracks: [
		{ title: "One", url: "https://example.com/one.mp3" },
		{ title: "Two", url: "https://example.com/two.mp3" },
	],
});

describe.skipIf(!adminUrl)("album history (Postgres)", () => {
	const name = `tagtape_test_${randomBytes(4).toString("hex")}`;
	let backend: Backend;

	async function admin<T>(run: (client: pg.Client) => Promise<T>) {
		const client = new pg.Client({ connectionString: adminUrl });
		await client.connect();
		try {
			return await run(client);
		} finally {
			await client.end();
		}
	}

	async function newGuest(address: string): Promise<string> {
		const { guest } = await backend.guest(
			new Request("http://localhost/", { method: "POST" }),
			{ clientAddress: address },
		);
		return guest.id;
	}

	beforeAll(async () => {
		await admin((client) => client.query(`CREATE DATABASE ${name}`));
		const url = new URL(adminUrl as string);
		url.pathname = `/${name}`;
		await migrate(url.href);
		backend = createBackend({
			databaseUrl: url.href,
			baseURL: "http://localhost:3000",
			secret: "test-secret-not-secret-0123456789abcdef",
		});
	});

	/** Runs SQL as the test database's owner (not through the app). */
	async function sqlInTestDb<T extends pg.QueryResultRow>(
		text: string,
		values: unknown[] = [],
	) {
		const url = new URL(adminUrl as string);
		url.pathname = `/${name}`;
		const client = new pg.Client({ connectionString: url.href });
		await client.connect();
		try {
			return await client.query<T>(text, values);
		} finally {
			await client.end();
		}
	}

	afterAll(async () => {
		await backend?.close();
		await admin((client) =>
			client.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`),
		);
	});

	it("keeps albums from version 1 through version 2, without tracks", async () => {
		// Version 1 only, as a 3.0.0 release left it, with one album in it.
		await sqlInTestDb(`
			CREATE TABLE tagtape_migrations (
				version integer PRIMARY KEY,
				applied_at timestamptz NOT NULL DEFAULT now()
			)`);
		await sqlInTestDb(MIGRATIONS[0]?.sql as string);
		await sqlInTestDb("INSERT INTO tagtape_migrations (version) VALUES (1)");
		const guest = await newGuest("203.0.113.9");
		const { rows } = await sqlInTestDb<{ id: string }>(
			`INSERT INTO albums (user_id, title, artist, genre, year, track_count)
			 VALUES ($1, 'Old', 'The Example Band', NULL, 2001, 3) RETURNING id`,
			[guest],
		);

		await migrateApp(backend.db);
		const old = await getAlbum(backend.db, guest, rows[0]?.id as string);
		expect(old).toMatchObject({
			title: "Old",
			year: 2001,
			trackCount: 3,
			coverUrl: null,
			tracks: [],
			complete: false,
		});
	});

	it("migrates once, and again is a no-op", async () => {
		const latest = MIGRATIONS.at(-1)?.version;
		expect(await migrateApp(backend.db)).toBe(latest);
		expect(await migrateApp(backend.db)).toBe(latest);
	});

	it("runs concurrent migrations one after another", async () => {
		const results = await Promise.all([
			migrateApp(backend.db),
			migrateApp(backend.db),
		]);
		expect(new Set(results).size).toBe(1);
	});

	it("stores the whole album, for its guest only", async () => {
		const alice = await newGuest("203.0.113.10");
		const bob = await newGuest("203.0.113.11");
		const id = await recordAlbum(backend.db, alice, {
			...album("Full"),
			coverUrl: "https://example.com/cover.jpg",
		});
		expect(await getAlbum(backend.db, alice, id)).toMatchObject({
			id,
			title: "Full",
			genre: "Test",
			year: 1999,
			coverUrl: "https://example.com/cover.jpg",
			tracks: [
				{ title: "One", url: "https://example.com/one.mp3" },
				{ title: "Two", url: "https://example.com/two.mp3" },
			],
			complete: true,
		});
		expect(await getAlbum(backend.db, bob, id)).toBeNull();
	});

	it("updates an album made again, and moves it to the top", async () => {
		const guest = await newGuest("203.0.113.12");
		const first = await recordAlbum(backend.db, guest, album("First"));
		await recordAlbum(backend.db, guest, album("Second"));

		const again = await recordAlbum(
			backend.db,
			guest,
			{
				...album("First, remastered"),
				tracks: [{ title: "One", url: "https://example.com/one.mp3" }],
			},
			first,
		);
		expect(again).toBe(first);
		const list = await listAlbums(backend.db, guest);
		expect(list.map((a) => a.title)).toEqual(["First, remastered", "Second"]);
		expect(list[0]?.trackCount).toBe(1);
	});

	it("never updates another guest's album", async () => {
		const alice = await newGuest("203.0.113.13");
		const mallory = await newGuest("203.0.113.14");
		const id = await recordAlbum(backend.db, alice, album("Alice's"));

		const other = await recordAlbum(backend.db, mallory, album("Taken"), id);
		expect(other).not.toBe(id);
		expect((await getAlbum(backend.db, alice, id))?.title).toBe("Alice's");
		expect((await listAlbums(backend.db, mallory)).map((a) => a.title)).toEqual(
			["Taken"],
		);
	});

	it("deletes only the guest's own album", async () => {
		const alice = await newGuest("203.0.113.15");
		const mallory = await newGuest("203.0.113.16");
		const id = await recordAlbum(backend.db, alice, album("Keep me"));

		expect(await deleteAlbum(backend.db, mallory, id)).toBe(false);
		expect(await getAlbum(backend.db, alice, id)).not.toBeNull();
		expect(await deleteAlbum(backend.db, alice, id)).toBe(true);
		expect(await getAlbum(backend.db, alice, id)).toBeNull();
	});

	it("lists a guest's own albums, newest first, without links", async () => {
		const alice = await newGuest("203.0.113.1");
		const bob = await newGuest("203.0.113.2");
		await recordAlbum(backend.db, alice, album("First"));
		await recordAlbum(backend.db, alice, album("Second"));
		await recordAlbum(backend.db, bob, album("Bob's"));

		const list = await listAlbums(backend.db, alice);
		expect(list.map((a) => a.title)).toEqual(["Second", "First"]);
		expect(list[0]).toMatchObject({
			artist: "The Example Band",
			genre: "Test",
			year: 1999,
			trackCount: 2,
		});
		expect(JSON.stringify(list)).not.toContain("example.com");
	});

	it(`keeps only the newest ${HISTORY_LIMIT}`, async () => {
		const guest = await newGuest("203.0.113.3");
		for (let i = 1; i <= HISTORY_LIMIT + 2; i++) {
			await recordAlbum(backend.db, guest, album(`Album ${i}`));
		}
		const list = await listAlbums(backend.db, guest, HISTORY_LIMIT + 10);
		expect(list).toHaveLength(HISTORY_LIMIT);
		expect(list[0]?.title).toBe(`Album ${HISTORY_LIMIT + 2}`);
		expect(list.map((a) => a.title)).not.toContain("Album 1");
	});

	it("deletes a guest's albums with the guest", async () => {
		const guest = await newGuest("203.0.113.4");
		await recordAlbum(backend.db, guest, album("Gone"));
		await sqlInTestDb("DELETE FROM auth.users WHERE id = $1", [guest]);
		expect(await listAlbums(backend.db, guest)).toEqual([]);
	});
});
