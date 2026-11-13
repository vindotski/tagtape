/** The addresses the app points at, in one place. */
/**
 * The website lives at its github.io address until tagtape.app points at it
 * (that domain still serves the old hosted app). GitHub Pages then redirects
 * these addresses, so links made now keep working.
 */
const SITE = "https://vindotski.github.io/tagtape/";

export const LINKS = {
	website: SITE,
	source: "https://github.com/vindotski/tagtape",
	changelog: "https://github.com/vindotski/tagtape/blob/main/CHANGELOG.md",
	/** The page share links open (the album follows after `#`). */
	open: `${SITE}open/`,
};
