import { Command, type CommandResult } from "@/commands/base-command";
import type { SceneTracks } from "@/timeline";
import { EditorCore } from "@/core";
import { canTrackBeHidden, findTrackInSceneTracks, updateTrackInSceneTracks } from "@/timeline";
import { SceneTracksTarget } from "@/commands/timeline/scene-tracks-target";

export class ToggleTrackVisibilityCommand extends Command {
	private readonly target = new SceneTracksTarget();

	getTargetSceneId(): string | null {
		return this.target.getSceneId();
	}
	private savedState: SceneTracks | null = null;

	constructor(private trackId: string) {
		super();
	}

	execute(): CommandResult | undefined {
		const editor = EditorCore.getInstance();
		this.savedState = this.target.read();

		const targetTrack = findTrackInSceneTracks({
			tracks: this.savedState,
			trackId: this.trackId,
		});
		if (!targetTrack) {
			return;
		}

		const updatedTracks = updateTrackInSceneTracks({
			tracks: this.savedState,
			trackId: this.trackId,
			update: (track) => {
				if (canTrackBeHidden(track)) {
					return { ...track, hidden: !track.hidden };
				}
				return track;
			},
		});

		this.target.write(updatedTracks);
	}

	undo(): void {
		if (this.savedState) {
			const editor = EditorCore.getInstance();
			this.target.write(this.savedState);
		}
	}
}
