import { EditorCore } from "@/core";
import type { SceneTracks } from "@/timeline";

/**
 * Guarda em qual cena um comando de linha do tempo mexeu.
 *
 * Na primeira leitura grava o id da cena aberta; depois disso (refazer,
 * desfazer) lê e grava sempre naquela cena, mesmo que a pessoa tenha trocado
 * de cena no meio. Antes, o desfazer caía na cena que estivesse aberta.
 *
 * Se a cena do comando não existe mais, NÃO cai na cena aberta (isso aplicaria
 * a edição na cena errada): `read()` lança erro. O CommandManager confere
 * `isTargetMissing` antes e descarta o passo.
 */
export class SceneTracksTarget {
	private sceneId: string | null = null;

	/** Faixas da cena do comando (na primeira vez: a cena aberta). */
	read(): SceneTracks {
		const scenes = EditorCore.getInstance().scenes;
		if (this.sceneId) {
			const scene = scenes.getSceneById(this.sceneId);
			if (!scene) {
				throw new Error(`Scene ${this.sceneId} no longer exists`);
			}
			return scene.tracks;
		}
		const active = scenes.getActiveScene();
		this.sceneId = active.id;
		return active.tracks;
	}

	/** Grava as faixas na cena do comando. */
	write(tracks: SceneTracks): void {
		const editor = EditorCore.getInstance();
		if (!this.sceneId) {
			this.sceneId = editor.scenes.getActiveSceneOrNull()?.id ?? null;
		}
		editor.timeline.updateTracks(tracks, { sceneId: this.sceneId });
	}

	getSceneId(): string | null {
		return this.sceneId;
	}
}
