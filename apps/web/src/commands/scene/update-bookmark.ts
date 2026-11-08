import { Command, type CommandResult } from "@/commands/base-command";
import { EditorCore } from "@/core";
import type { Bookmark, TScene } from "@/timeline";
import { updateSceneInArray } from "@/timeline/scenes";
import {
	getFrameTime,
	updateBookmarkInArray,
} from "@/timeline/bookmarks/index";
import type { MediaTime } from "@/wasm";

export class UpdateBookmarkCommand extends Command {
	private sceneId: string | null = null;
	private savedScenes: TScene[] | null = null;

	constructor({
		time,
		updates,
	}: {
		time: MediaTime;
		updates: Partial<Omit<Bookmark, "time">>;
	}) {
		super();
		this.time = time;
		this.updates = updates;
	}

	private time: MediaTime;
	private updates: Partial<Omit<Bookmark, "time">>;

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

		const frameTime = getFrameTime({
			time: this.time,
			fps: activeProject.settings.fps,
		});

		const updatedBookmarks = updateBookmarkInArray({
			bookmarks: activeScene.bookmarks,
			frameTime,
			updates: this.updates,
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
