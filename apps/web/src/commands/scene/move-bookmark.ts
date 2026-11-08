import { Command, type CommandResult } from "@/commands/base-command";
import { EditorCore } from "@/core";
import type { TScene } from "@/timeline";
import { updateSceneInArray } from "@/timeline/scenes";
import { getFrameTime, moveBookmarkInArray } from "@/timeline/bookmarks/index";
import type { MediaTime } from "@/wasm";

export class MoveBookmarkCommand extends Command {
	private sceneId: string | null = null;
	private savedScenes: TScene[] | null = null;

	constructor({
		fromTime,
		toTime,
	}: {
		fromTime: MediaTime;
		toTime: MediaTime;
	}) {
		super();
		this.fromTime = fromTime;
		this.toTime = toTime;
	}

	private fromTime: MediaTime;
	private toTime: MediaTime;

	execute(): CommandResult | undefined {
		const editor = EditorCore.getInstance();
		// Refazer age na mesma cena da primeira vez, mesmo com outra aberta.
		const activeScene = this.sceneId
			? editor.scenes.getSceneById(this.sceneId)
			: editor.scenes.getActiveScene();
		this.sceneId = activeScene?.id ?? null;
		const activeProject = editor.project.getActive();

		if (!activeScene || !activeProject) {
			return;
		}

		const scenes = editor.scenes.getScenes();
		this.savedScenes = [...scenes];

		const fromFrameTime = getFrameTime({
			time: this.fromTime,
			fps: activeProject.settings.fps,
		});
		const toFrameTime = getFrameTime({
			time: this.toTime,
			fps: activeProject.settings.fps,
		});

		const updatedBookmarks = moveBookmarkInArray({
			bookmarks: activeScene.bookmarks,
			fromTime: fromFrameTime,
			toTime: toFrameTime,
		});

		const updatedScenes = updateSceneInArray({
			scenes,
			sceneId: activeScene.id,
			updates: { bookmarks: updatedBookmarks },
		});

		editor.scenes.setScenes({ scenes: updatedScenes });
	}

	undo(): void {
		if (this.savedScenes) {
			const editor = EditorCore.getInstance();
			editor.scenes.setScenes({ scenes: this.savedScenes });
		}
	}

	getTargetSceneId(): string | null {
		return this.sceneId;
	}
}
