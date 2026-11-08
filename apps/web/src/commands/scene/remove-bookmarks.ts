import { Command, type CommandResult } from "@/commands/base-command";
import { EditorCore } from "@/core";
import type { Bookmark } from "@/timeline";
import type { MediaTime } from "@/wasm";

/**
 * Tira marcadores (nos tempos exatos dados) de uma cena escolhida, mesmo que
 * outra cena esteja aberta. Um passo de desfazer. Quem chama confere antes se
 * o marcador existe, para não pôr um passo vazio no histórico.
 */
export class RemoveBookmarksCommand extends Command {
	private savedBookmarks: Bookmark[] | null = null;
	private readonly sceneId: string;
	private readonly times: Set<number>;

	constructor({ sceneId, times }: { sceneId: string; times: MediaTime[] }) {
		super();
		this.sceneId = sceneId;
		this.times = new Set(times);
	}

	execute(): CommandResult | undefined {
		const scene = EditorCore.getInstance().scenes.getSceneById(this.sceneId);
		if (!scene) return undefined;
		this.savedBookmarks = scene.bookmarks;
		this.setSceneBookmarks(scene.bookmarks.filter((b) => !this.times.has(b.time)));
		return undefined;
	}

	undo(): void {
		if (this.savedBookmarks) this.setSceneBookmarks(this.savedBookmarks);
	}

	private setSceneBookmarks(bookmarks: Bookmark[]): void {
		const editor = EditorCore.getInstance();
		editor.scenes.setScenes({
			scenes: editor.scenes
				.getScenes()
				.map((scene) => (scene.id === this.sceneId ? { ...scene, bookmarks, updatedAt: new Date() } : scene)),
		});
	}

	getTargetSceneId(): string | null {
		return this.sceneId;
	}
}
