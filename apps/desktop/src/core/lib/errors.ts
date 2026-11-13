/**
 * An error whose message is safe and useful to show to the person using TagTape
 * (it ends up in the job snapshot). Anything else is logged and replaced with a
 * generic message.
 */
export class UserFacingError extends Error {
	override name = "UserFacingError";
}

export function userMessage(error: unknown, fallback: string): string {
	return error instanceof UserFacingError ? error.message : fallback;
}
