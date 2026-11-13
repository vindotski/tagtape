import { Disc3 } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchAlbumCover } from "#/lib/bridge";
import { cn } from "#/lib/utils";

const SIZES = {
	/** Fills its container's width (library tiles). */
	fill: "aspect-square w-full [&_svg]:size-1/3 text-2xl",
	lg: "size-24 sm:size-36 [&_svg]:size-10 sm:[&_svg]:size-14 text-sm sm:text-lg",
	/** The album's own screen. */
	xl: "size-40 md:size-52 [&_svg]:size-16 text-xl",
};

/** A stored album's cover: which album, and when it was last made. */
export interface StoredCover {
	albumId: string;
	/** Changes when the album is made again, so a new cover is fetched. */
	version: string;
}

/**
 * An album's cover. A stored album that has one shows the small copy the
 * library keeps; anything else (an album being typed, one made without a
 * cover) gets a tile with its initials.
 */
export function AlbumCover({
	title,
	stored,
	size = "lg",
	className,
}: {
	title: string;
	/** Set for a library album that has a cover. */
	stored?: StoredCover | undefined;
	size?: keyof typeof SIZES;
	className?: string;
}) {
	const image = useStoredCover(stored);
	if (image) {
		return (
			<img
				src={image}
				alt=""
				draggable={false}
				className={cn(
					"shrink-0 bg-primary object-cover select-none",
					SIZES[size],
					className,
				)}
			/>
		);
	}
	const letters = initials(title);
	return (
		<div
			aria-hidden="true"
			className={cn(
				"flex shrink-0 flex-col items-center justify-center gap-1 bg-primary font-heading font-semibold text-primary-foreground select-none",
				SIZES[size],
				className,
			)}
		>
			<Disc3 strokeWidth={1.25} />
			{letters && <span className="leading-none tracking-wide">{letters}</span>}
		</div>
	);
}

// Covers are small `data:` URLs; keeping them means a shelf doesn't flicker
// back to initials each time it is shown.
const cache = new Map<string, string>();

function useStoredCover(stored: StoredCover | undefined): string | undefined {
	const albumId = stored?.albumId;
	const key = stored ? `${stored.albumId}@${stored.version}` : undefined;
	const [image, setImage] = useState(() => (key ? cache.get(key) : undefined));
	useEffect(() => {
		const known = key ? cache.get(key) : undefined;
		setImage(known);
		if (!key || !albumId || known) return;
		let current = true;
		void fetchAlbumCover(albumId).then((url) => {
			if (!url) return;
			cache.set(key, url);
			if (current) setImage(url);
		});
		return () => {
			current = false;
		};
	}, [key, albumId]);
	return image;
}

/** The cover of a library album, if it has one. */
export function storedCover(album: {
	id: string;
	hasCover: boolean;
	updatedAt: string;
}): StoredCover | undefined {
	return album.hasCover
		? { albumId: album.id, version: album.updatedAt }
		: undefined;
}

/** "Harbour Lights" → "HL": the first letter of the first two words. */
export function initials(title: string): string {
	return title
		.trim()
		.split(/\s+/)
		.slice(0, 2)
		.map((word) => Array.from(word)[0] ?? "")
		.join("")
		.toUpperCase();
}
