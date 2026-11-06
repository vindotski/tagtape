import { describe, expect, test } from "vitest";
import { mapLimit, Semaphore } from "./queue.ts";
import { describeLimit, formatDuration } from "./runner.ts";

describe("Semaphore", () => {
	test("limits concurrency and hands slots over in FIFO order", async () => {
		const slots = new Semaphore(1);
		const order: string[] = [];
		const releaseA = await slots.acquire();
		const b = slots.acquire().then((release) => {
			order.push("b");
			return release;
		});
		const c = slots.acquire().then((release) => {
			order.push("c");
			return release;
		});
		expect(slots.active).toBe(1);
		expect(slots.waiting).toBe(2);

		releaseA();
		(await b)();
		(await c)();
		expect(order).toEqual(["b", "c"]);
		expect(slots.active).toBe(0);
	});

	test("a waiter that gives up leaves the queue", async () => {
		const slots = new Semaphore(1);
		const release = await slots.acquire();
		const controller = new AbortController();
		const waiting = slots.acquire(controller.signal);
		expect(slots.waiting).toBe(1);
		controller.abort(new Error("client left"));
		await expect(waiting).rejects.toThrow("client left");
		expect(slots.waiting).toBe(0);
		// The slot goes to the next real waiter, not to the one that left.
		const next = slots.acquire();
		release();
		(await next)();
		expect(slots.active).toBe(0);
	});

	test("releasing twice is harmless", async () => {
		const slots = new Semaphore(1);
		const release = await slots.acquire();
		release();
		release();
		expect(slots.active).toBe(0);
	});
});

describe("mapLimit", () => {
	test("keeps order, respects the limit, and settles every item", async () => {
		let inFlight = 0;
		let peak = 0;
		const results = await mapLimit([1, 2, 3, 4, 5], 2, async (n) => {
			inFlight++;
			peak = Math.max(peak, inFlight);
			await new Promise((resolve) => setTimeout(resolve, 5));
			inFlight--;
			if (n === 3) throw new Error("three");
			return n * 10;
		});
		expect(peak).toBe(2);
		expect(
			results.map((r) => (r.status === "fulfilled" ? r.value : "x")),
		).toEqual([10, 20, "x", 40, 50]);
	});

	test("skips items not yet started once the signal aborts", async () => {
		const controller = new AbortController();
		const started: number[] = [];
		await mapLimit(
			[1, 2, 3, 4],
			1,
			async (n) => {
				started.push(n);
				if (n === 2) controller.abort();
			},
			controller.signal,
		);
		expect(started).toEqual([1, 2]);
	});
});

test.each([
	[59, "0:59"],
	[754, "12:34"],
	[3725, "1:02:05"],
])("formatDuration(%i) = %s", (seconds, expected) => {
	expect(formatDuration(seconds)).toBe(expected);
});

test.each([
	[7200, "2 hours"],
	[3600, "1 hour"],
	[600, "10 minutes"],
	[60, "1 minute"],
])("describeLimit(%i) = %s", (seconds, expected) => {
	expect(describeLimit(seconds)).toBe(expected);
});
