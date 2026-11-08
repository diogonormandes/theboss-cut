import { Command, type CommandResult } from "@/commands/base-command";
import { EditorCore } from "@/core";
import type { SceneTracks } from "@/timeline";
import { SceneTracksTarget } from "@/commands/timeline/scene-tracks-target";

export class RemoveTrackCommand extends Command {
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
		const updatedTracks: SceneTracks = {
			...this.savedState,
			overlay: this.savedState.overlay.filter((track) => track.id !== this.trackId),
			audio: this.savedState.audio.filter((track) => track.id !== this.trackId),
		};
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
