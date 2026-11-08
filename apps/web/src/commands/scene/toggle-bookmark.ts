import { Command, type CommandResult } from "@/commands/base-command";
import { EditorCore } from "@/core";
import type { TScene } from "@/timeline";
import { updateSceneInArray } from "@/timeline/scenes";
import {
	getFrameTime,
	toggleBookmarkInArray,
} from "@/timeline/bookmarks/index";
import { type MediaTime, ZERO_MEDIA_TIME } from "@/wasm";

export class ToggleBookmarkCommand extends Command {
	private sceneId: string | null = null;
	private savedScenes: TScene[] | null = null;
	private frameTime: MediaTime = ZERO_MEDIA_TIME;

	constructor(private time: MediaTime) {
		super();
	}

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

		this.frameTime = getFrameTime({
			time: this.time,
			fps: activeProject.settings.fps,
		});

		const updatedBookmarks = toggleBookmarkInArray({
			bookmarks: activeScene.bookmarks,
			frameTime: this.frameTime,
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
