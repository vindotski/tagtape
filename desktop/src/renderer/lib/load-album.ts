import { notFound } from "@tanstack/react-router";
import { z } from "zod";
import { fetchAlbum } from "./bridge";

const albumIdSchema = z.uuid();

/** The stored album a route is about, or the route's "not found". */
export async function loadAlbum(albumId: string) {
	if (!albumIdSchema.safeParse(albumId).success) throw notFound();
	const album = await fetchAlbum(albumId);
	if (!album) throw notFound();
	return album;
}
