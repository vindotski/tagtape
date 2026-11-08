/**
 * Dev only (`pnpm docker:dev` runs it before the web app): brings the local
 * database's `auth` schema up to the kit's version. On Spotcraft the agent
 * does this when it provisions the app's database.
 */
import { migrate } from "@spotcraft/kit/provision";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const { from, to } = await migrate(url);
console.log(
	from === to
		? `[tagtape] auth schema at version ${to}`
		: `[tagtape] auth schema migrated from version ${from} to ${to}`,
);
