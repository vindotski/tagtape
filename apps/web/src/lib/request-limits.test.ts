import { describe, expect, it } from "vitest";
import { bodyTooLarge, MAX_BODY_BYTES } from "./request-limits";

const url = "http://localhost/_serverFn/start";

function post(headers: Record<string, string>, body?: BodyInit) {
	return new Request(url, {
		method: "POST",
		headers,
		body,
		// Required by Node for a streamed body.
		...(body instanceof ReadableStream ? { duplex: "half" } : {}),
	} as RequestInit);
}

describe("bodyTooLarge", () => {
	it("lets reads through", () => {
		expect(bodyTooLarge(new Request(url))).toBeUndefined();
	});

	it("lets small bodies with a length through", () => {
		expect(
			bodyTooLarge(post({ "content-length": "120" }, "{}")),
		).toBeUndefined();
		expect(bodyTooLarge(post({}))).toBeUndefined();
	});

	it("refuses bodies over the limit", () => {
		const response = bodyTooLarge(
			post({ "content-length": String(MAX_BODY_BYTES + 1) }, "{}"),
		);
		expect(response?.status).toBe(413);
	});

	it("refuses bodies of unknown length", () => {
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(new TextEncoder().encode("{}"));
				controller.close();
			},
		});
		expect(bodyTooLarge(post({}, stream))?.status).toBe(411);
	});

	it("refuses a malformed length", () => {
		expect(bodyTooLarge(post({ "content-length": "-1" }, "{}"))?.status).toBe(
			400,
		);
		expect(bodyTooLarge(post({ "content-length": "abc" }, "{}"))?.status).toBe(
			400,
		);
	});
});
