import { EditorCore } from "@/core";
import { Command, type CommandResult } from "@/commands/base-command";
import type { SceneTracks, TimelineElement } from "@/timeline";
import {
	findTrackInSceneTracks,
	updateElementInSceneTracks,
} from "@/timeline";
import { applyElementUpdate } from "@/timeline/update-pipeline";
import { SceneTracksTarget } from "@/commands/timeline/scene-tracks-target";

export class UpdateElementsCommand extends Command {
	private readonly target = new SceneTracksTarget();

	getTargetSceneId(): string | null {
		return this.target.getSceneId();
	}
	private savedState: SceneTracks | null = null;
	private readonly updates: Array<{
		trackId: string;
		elementId: string;
		patch: Partial<TimelineElement>;
	}>;

	constructor({
		updates,
	}: {
		updates: Array<{
			trackId: string;
			elementId: string;
			patch: Partial<TimelineElement>;
		}>;
	}) {
		super();
		this.updates = updates;
	}

	execute(): CommandResult | undefined {
		const editor = EditorCore.getInstance();
		this.savedState = this.target.read();
		let updatedTracks = this.savedState;

		for (const updateEntry of this.updates) {
			const currentTrack = findTrackInSceneTracks({
				tracks: updatedTracks,
				trackId: updateEntry.trackId,
			});
			const currentElement = currentTrack?.elements.find(
				(element) => element.id === updateEntry.elementId,
			);
			if (!currentTrack || !currentElement) {
				continue;
			}

			const nextElement = applyElementUpdate({
				element: currentElement,
				patch: updateEntry.patch,
				context: {
					tracks: updatedTracks,
					trackId: updateEntry.trackId,
				},
			});

			updatedTracks = updateElementInSceneTracks({
				tracks: updatedTracks,
				trackId: updateEntry.trackId,
				elementId: updateEntry.elementId,
				update: () => nextElement,
			});
		}

		this.target.write(updatedTracks);
		return undefined;
	}

	undo(): void {
		if (this.savedState) {
			const editor = EditorCore.getInstance();
			this.target.write(this.savedState);
		}
	}
}
