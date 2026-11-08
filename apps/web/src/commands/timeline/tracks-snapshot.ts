import { Command, type CommandResult } from "@/commands/base-command";
import type { SceneTracks } from "@/timeline";
import { EditorCore } from "@/core";

export class TracksSnapshotCommand extends Command {
	constructor({
		before,
		after,
		sceneId,
	}: {
		before: SceneTracks;
		after: SceneTracks;
		/** Cena das faixas; sem ela, usa a cena aberta na hora de criar o comando. */
		sceneId?: string | null;
	}) {
		super();
		this.before = before;
		this.after = after;
		this.sceneId =
			sceneId ??
			EditorCore.getInstance().scenes.getActiveSceneOrNull()?.id ??
			null;
	}

	private before: SceneTracks;
	private after: SceneTracks;
	private sceneId: string | null;

	execute(): CommandResult | undefined {
		EditorCore.getInstance().timeline.updateTracks(this.after, {
			sceneId: this.sceneId,
		});
		return undefined;
	}

	undo(): void {
		EditorCore.getInstance().timeline.updateTracks(this.before, {
			sceneId: this.sceneId,
		});
	}

	getTargetSceneId(): string | null {
		return this.sceneId;
	}
}
