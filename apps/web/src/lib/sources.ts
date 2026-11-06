/** A kind of link the API accepts, e.g. one website (from its source plugins). */
export interface SourceInfo {
	id: string;
	name: string;
}

/** ["A", "B", "C"] → "A, B or C" (or "and"); a single name stays as is. */
export function joinNames(names: string[], conjunction: "or" | "and"): string {
	if (names.length <= 1) return names[0] ?? "";
	return `${names.slice(0, -1).join(", ")} ${conjunction} ${names.at(-1)}`;
}
