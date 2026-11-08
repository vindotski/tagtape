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

	afterAll(async () => {
		await backend?.close();
		await admin((client) =>
			client.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`),
		);
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
		const url = new URL(adminUrl as string);
		url.pathname = `/${name}`;
		const client = new pg.Client({ connectionString: url.href });
		await client.connect();
		try {
			await client.query("DELETE FROM auth.users WHERE id = $1", [guest]);
		} finally {
			await client.end();
		}
		expect(await listAlbums(backend.db, guest)).toEqual([]);
	});
});
