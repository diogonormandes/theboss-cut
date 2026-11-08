import { Command, type CommandResult } from "@/commands/base-command";
import { EditorCore } from "@/core";
import type { MediaAsset } from "@/media/types";
import { buildWaveformSourceKey } from "@/media/waveform-summary";
import { storageService } from "@/services/storage/service";
import { videoCache } from "@/services/video-cache/service";
import { waveformCache } from "@/services/waveform-cache/service";
import { hasMediaId } from "@/timeline/element-utils";
import type { SceneTracks, TimelineTrack } from "@/timeline";

function withoutMedia<TTrack extends TimelineTrack>(
	track: TTrack,
	mediaId: string,
): TTrack {
	return {
		...track,
		elements: track.elements.filter(
			(element) => !(hasMediaId(element) && element.mediaId === mediaId),
		),
	} as TTrack;
}

function usesMedia(tracks: SceneTracks, mediaId: string): boolean {
	return [...tracks.overlay, tracks.main, ...tracks.audio].some((track) =>
		track.elements.some(
			(element) => hasMediaId(element) && element.mediaId === mediaId,
		),
	);
}

/**
 * Remove a mídia do projeto e os clipes dela em TODAS as cenas (não só na
 * aberta), guardando um retrato das faixas de cada cena afetada. Desfazer e
 * refazer agem nessas mesmas cenas, sem criar outro passo no histórico.
 */
export class RemoveMediaAssetCommand extends Command {
	/** Cena aberta na primeira execução (para ripple e seleção). */
	private executeSceneId: string | null = null;

	getTargetSceneId(): string | null {
		if (!this.executeSceneId) return null;
		// Se aquela cena sumiu, o comando continua válido (age por cena).
		const exists = EditorCore.getInstance().scenes.getSceneById(
			this.executeSceneId,
		);
		return exists ? this.executeSceneId : null;
	}
	private savedAssets: MediaAsset[] | null = null;
	private savedSceneTracks = new Map<string, SceneTracks>();
	private removedAsset: MediaAsset | null = null;

	constructor({
		projectId,
		assetId,
	}: {
		projectId: string;
		assetId: string;
	}) {
		super();
		this.projectId = projectId;
		this.assetId = assetId;
	}

	private projectId: string;
	private assetId: string;

	execute(): CommandResult | undefined {
		const editor = EditorCore.getInstance();
		const assets = editor.media.getAssets();

		this.savedAssets = [...assets];
		if (!this.executeSceneId) {
			this.executeSceneId = editor.scenes.getActiveSceneOrNull()?.id ?? null;
		}

		this.removedAsset =
			assets.find((media) => media.id === this.assetId) ?? null;

		if (!this.removedAsset) {
			console.error("Media asset not found:", this.assetId);
			return;
		}

		if (this.removedAsset.url) {
			URL.revokeObjectURL(this.removedAsset.url);
		}
		if (this.removedAsset.thumbnailUrl) {
			URL.revokeObjectURL(this.removedAsset.thumbnailUrl);
		}

		videoCache.clearVideo({ mediaId: this.assetId });
		waveformCache.clearSource({
			sourceKey: buildWaveformSourceKey({
				kind: "media",
				id: this.assetId,
			}),
		});

		editor.media.setAssets({
			assets: assets.filter((media) => media.id !== this.assetId),
		});

		this.savedSceneTracks = new Map();
		let removedFromOpenScene = false;
		const activeSceneId = editor.scenes.getActiveSceneOrNull()?.id ?? null;
		for (const scene of editor.scenes.getScenes()) {
			if (!usesMedia(scene.tracks, this.assetId)) continue;
			this.savedSceneTracks.set(scene.id, scene.tracks);
			editor.timeline.updateTracks(
				{
					// Faixas extras que ficaram vazias saem (como o reator faz
					// na cena aberta); a principal fica sempre.
					overlay: scene.tracks.overlay
						.map((track) => withoutMedia(track, this.assetId))
						.filter((track) => track.elements.length > 0),
					main: withoutMedia(scene.tracks.main, this.assetId),
					audio: scene.tracks.audio
						.map((track) => withoutMedia(track, this.assetId))
						.filter((track) => track.elements.length > 0),
				},
				{ sceneId: scene.id },
			);
			if (scene.id === activeSceneId) removedFromOpenScene = true;
		}

		storageService
			.deleteMediaAsset({ projectId: this.projectId, id: this.assetId })
			.catch((error) => {
				console.error("Failed to delete media item:", error);
			});

		if (!removedFromOpenScene) return undefined;
		return {
			selection: {
				selectedElements: [],
				selectedKeyframes: [],
				keyframeSelectionAnchor: null,
				selectedMaskPoints: null,
			},
		};
	}

	undo(): void {
		const editor = EditorCore.getInstance();

		if (this.savedAssets && this.removedAsset) {
			const restoredAsset: MediaAsset = {
				...this.removedAsset,
				url: URL.createObjectURL(this.removedAsset.file),
			};

			editor.media.setAssets({
				assets: this.savedAssets.map((a) =>
					a.id === this.assetId ? restoredAsset : a,
				),
			});

			storageService
				.saveMediaAsset({
					projectId: this.projectId,
					mediaAsset: restoredAsset,
				})
				.catch((error) => {
					console.error("Failed to restore media item on undo:", error);
				});
		}

		for (const [sceneId, tracks] of this.savedSceneTracks) {
			if (!editor.scenes.getSceneById(sceneId)) continue;
			editor.timeline.updateTracks(tracks, { sceneId });
		}
	}
}
