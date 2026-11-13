/** FIFO counting semaphore. */
export class Semaphore {
	readonly #limit: number;
	#active = 0;
	readonly #waiters: Array<() => void> = [];

	constructor(limit: number) {
		this.#limit = limit;
	}

	get active(): number {
		return this.#active;
	}

	get waiting(): number {
		return this.#waiters.length;
	}

	/**
	 * Resolves with a `release` function once a slot is free. Aborting `signal`
	 * while waiting leaves the queue (rejects), so a client that gave up never
	 * holds a place in line.
	 */
	async acquire(signal?: AbortSignal): Promise<() => void> {
		signal?.throwIfAborted();
		if (this.#active < this.#limit) {
			this.#active++;
		} else {
			// The releasing caller hands its slot straight to us, so #active stays put.
			await new Promise<void>((resolve, reject) => {
				const waiter = () => {
					signal?.removeEventListener("abort", onAbort);
					resolve();
				};
				const onAbort = () => {
					const index = this.#waiters.indexOf(waiter);
					if (index !== -1) this.#waiters.splice(index, 1);
					reject(signal?.reason);
				};
				signal?.addEventListener("abort", onAbort, { once: true });
				this.#waiters.push(waiter);
			});
		}
		let released = false;
		return () => {
			if (released) return;
			released = true;
			const next = this.#waiters.shift();
			if (next) next();
			else this.#active--;
		};
	}
}

/**
 * Runs `fn` over `items` with at most `limit` in flight, preserving order in the
 * results. Every item settles (no fail-fast); callers that want to stop early
 * abort their own signal, and items not started yet are skipped once it fires.
 */
export async function mapLimit<T, R>(
	items: readonly T[],
	limit: number,
	fn: (item: T, index: number) => Promise<R>,
	signal?: AbortSignal,
): Promise<PromiseSettledResult<R>[]> {
	const results: PromiseSettledResult<R>[] = new Array(items.length);
	let next = 0;

	async function worker(): Promise<void> {
		while (next < items.length) {
			const index = next++;
			if (signal?.aborted) {
				results[index] = { status: "rejected", reason: signal.reason };
				continue;
			}
			try {
				results[index] = {
					status: "fulfilled",
					value: await fn(items[index] as T, index),
				};
			} catch (reason) {
				results[index] = { status: "rejected", reason };
			}
		}
	}

	const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
	await Promise.all(workers);
	return results;
}
