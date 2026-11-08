import { Command, type CommandResult } from "@/commands/base-command";
import { EditorCore } from "@/core";
import type { Bookmark } from "@/timeline";
import { getFrameTime } from "@/timeline/bookmarks/utils";

/**
 * Põe vários marcadores de uma vez numa cena (por padrão, a aberta).
 * Se já existe marcador no mesmo quadro, o novo substitui. Um passo de desfazer.
 */
export class AddBookmarksCommand extends Command {
	private sceneId: string | null;
	private savedBookmarks: Bookmark[] | null = null;
	private readonly bookmarks: Bookmark[];

	constructor({
		bookmarks,
		sceneId,
	}: {
		bookmarks: Bookmark[];
		sceneId?: string;
	}) {
		super();
		this.bookmarks = bookmarks;
		this.sceneId = sceneId ?? null;
	}

	execute(): CommandResult | undefined {
		const editor = EditorCore.getInstance();
		if (!this.sceneId) {
			this.sceneId = editor.scenes.getActiveSceneOrNull()?.id ?? null;
		}
		if (!this.sceneId) return undefined;

		const scene = editor.scenes.getSceneById(this.sceneId);
		if (!scene) return undefined;

		const fps = editor.project.getActiveOrNull()?.settings.fps;
		this.savedBookmarks = scene.bookmarks;

		const byTime = new Map<number, Bookmark>();
		for (const bookmark of scene.bookmarks) {
			byTime.set(bookmark.time, bookmark);
		}
		for (const bookmark of this.bookmarks) {
			const time = fps
				? getFrameTime({ time: bookmark.time, fps })
				: bookmark.time;
			byTime.set(time, { ...bookmark, time });
		}
		const next = [...byTime.values()].sort((a, b) => a.time - b.time);

		this.setSceneBookmarks(next);
		return undefined;
	}

	undo(): void {
		if (this.savedBookmarks) {
			this.setSceneBookmarks(this.savedBookmarks);
		}
	}

	private setSceneBookmarks(bookmarks: Bookmark[]): void {
		const editor = EditorCore.getInstance();
		const sceneId = this.sceneId;
		if (!sceneId) return;
		editor.scenes.setScenes({
			scenes: editor.scenes
				.getScenes()
				.map((scene) =>
					scene.id === sceneId
						? { ...scene, bookmarks, updatedAt: new Date() }
						: scene,
				),
		});
	}

	getTargetSceneId(): string | null {
		return this.sceneId;
	}
}
