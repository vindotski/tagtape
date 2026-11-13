import { useNavigate, useRouter } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import { Spinner } from "#/components/ui/spinner";
import { removeAlbum } from "#/lib/bridge";

/** Two steps, so one stray click doesn't lose an album. */
export function DeleteAlbum({ id }: { id: string }) {
	const [confirming, setConfirming] = useState(false);
	const [pending, setPending] = useState(false);
	const [failed, setFailed] = useState(false);
	const navigate = useNavigate();
	const router = useRouter();

	async function remove() {
		setPending(true);
		setFailed(false);
		if (await removeAlbum(id)) {
			// Leave first: reloading this screen would say the album is gone.
			await navigate({ to: "/albums" });
			await router.invalidate();
			return;
		}
		setPending(false);
		setFailed(true);
	}

	if (!confirming) {
		return (
			<Button variant="ghost" onPress={() => setConfirming(true)}>
				<Trash2 data-icon="inline-start" />
				Delete
			</Button>
		);
	}
	return (
		<div className="flex flex-wrap items-center gap-2">
			<span className="text-sm text-muted-foreground" aria-live="polite">
				{failed
					? "Couldn't delete it. Try again?"
					: "Delete it from the library? Its folder stays."}
			</span>
			<Button
				variant="destructive"
				onPress={remove}
				isPending={pending}
				autoFocus
			>
				{pending && <Spinner aria-hidden="true" />}
				Delete
			</Button>
			<Button
				variant="ghost"
				onPress={() => setConfirming(false)}
				isDisabled={pending}
			>
				Cancel
			</Button>
		</div>
	);
}
