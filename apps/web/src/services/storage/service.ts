import type { TProject, TProjectMetadata } from "@/project/types";
import { getProjectDurationFromScenes } from "@/timeline/scenes";
import type { MediaAsset } from "@/media/types";
import { IndexedDBAdapter } from "./indexeddb-adapter";
import { OPFSAdapter } from "./opfs-adapter";
import {
	type StorageCapacityCheckResult,
	StorageQuotaExceededError,
	evaluateStorageCapacity,
	isStorageQuotaExceededError,
	readStorageQuotaStatus,
} from "./quota";
import { readLinkedFile } from "./file-handle";
import { normalizeMediaStorage } from "./media-reference";
import type {
	MediaAssetData,
	OfflineMediaAsset,
	StorageConfig,
	SerializedProject,
	SerializedScene,
} from "./types";
import type { SavedSoundsData, SavedSound, SoundEffect } from "@/sounds/types";
import {
	migrations,
	runStorageMigrations,
} from "@/services/storage/migrations";
import type { Bookmark, SceneTracks, TScene } from "@/timeline";
import { roundMediaTime } from "@/wasm";

function normalizeBookmarks({ raw }: { raw: unknown }): Bookmark[] {
	if (!Array.isArray(raw)) return [];
	return raw
		.map((item): Bookmark | null => {
			if (typeof item === "number") {
				return { time: roundMediaTime({ time: item }) };
			}
			const obj = item as Record<string, unknown>;
			if (
				typeof obj !== "object" ||
				obj === null ||
				typeof obj.time !== "number"
			) {
				return null;
			}
			return {
				time: roundMediaTime({ time: obj.time }),
				...(typeof obj.note === "string" && { note: obj.note }),
				...(typeof obj.color === "string" && { color: obj.color }),
				...(typeof obj.duration === "number" && {
					duration: roundMediaTime({ time: obj.duration }),
				}),
			};
		})
		.filter((b): b is Bookmark => b !== null);
}

class StorageService {
	private projectsAdapter: IndexedDBAdapter<SerializedProject>;
	private savedSoundsAdapter: IndexedDBAdapter<SavedSoundsData>;
	private config: StorageConfig;
	private migrationsPromise: Promise<void> | null = null;

	constructor() {
		this.config = {
			projectsDb: "video-editor-projects",
			mediaDb: "video-editor-media",
			savedSoundsDb: "video-editor-saved-sounds",
			version: 1,
		};

		this.projectsAdapter = new IndexedDBAdapter<SerializedProject>({
			dbName: this.config.projectsDb,
			storeName: "projects",
			version: this.config.version,
		});

		this.savedSoundsAdapter = new IndexedDBAdapter<SavedSoundsData>({
			dbName: this.config.savedSoundsDb,
			storeName: "saved-sounds",
			version: this.config.version,
		});
	}

	private async ensureMigrations(): Promise<void> {
		if (this.migrationsPromise) {
			await this.migrationsPromise;
			return;
		}

		this.migrationsPromise = runStorageMigrations({ migrations }).then(
			() => undefined,
		);
		await this.migrationsPromise;
	}

	private getProjectMediaAdapters({ projectId }: { projectId: string }) {
		const mediaMetadataAdapter = new IndexedDBAdapter<MediaAssetData>({
			dbName: `${this.config.mediaDb}-${projectId}`,
			storeName: "media-metadata",
			version: this.config.version,
		});

		const mediaAssetsAdapter = new OPFSAdapter(`media-files-${projectId}`);

		return { mediaMetadataAdapter, mediaAssetsAdapter };
	}

	async canStoreFile({
		size,
	}: {
		size: number;
	}): Promise<StorageCapacityCheckResult> {
		const quotaStatus = await readStorageQuotaStatus();
		return evaluateStorageCapacity({
			requiredBytes: size,
			quotaStatus,
		});
	}

	isQuotaExceededError({ error }: { error: unknown }): boolean {
		return isStorageQuotaExceededError({ error });
	}

	private stripAudioBuffers({ tracks }: { tracks: SceneTracks }): SceneTracks {
		return {
			...tracks,
			audio: tracks.audio.map((track) => ({
				...track,
				elements: track.elements.map((element) => {
					const { buffer: _buffer, ...rest } = element;
					return rest;
				}),
			})),
		};
	}

	async saveProject({ project }: { project: TProject }): Promise<void> {
		const duration =
			project.metadata.duration ??
			getProjectDurationFromScenes({ scenes: project.scenes });
		const serializedScenes: SerializedScene[] = project.scenes.map((scene) => ({
			id: scene.id,
			name: scene.name,
			isMain: scene.isMain,
			tracks: this.stripAudioBuffers({ tracks: scene.tracks }),
			bookmarks: scene.bookmarks,
			createdAt: scene.createdAt.toISOString(),
			updatedAt: scene.updatedAt.toISOString(),
			...(scene.canvasSize ? { canvasSize: scene.canvasSize } : {}),
			...(scene.sourceRange ? { sourceRange: scene.sourceRange } : {}),
			...(scene.kind ? { kind: scene.kind } : {}),
		}));

		const serializedProject: SerializedProject = {
			metadata: {
				id: project.metadata.id,
				name: project.metadata.name,
				thumbnail: project.metadata.thumbnail,
				duration,
				createdAt: project.metadata.createdAt.toISOString(),
				updatedAt: project.metadata.updatedAt.toISOString(),
			},
			scenes: serializedScenes,
			currentSceneId: project.currentSceneId,
			settings: project.settings,
			version: project.version,
			timelineViewState: project.timelineViewState,
		};

		await this.projectsAdapter.set({
			key: project.metadata.id,
			value: serializedProject,
		});
	}

	async loadProject({
		id,
	}: {
		id: string;
	}): Promise<{ project: TProject } | null> {
		await this.ensureMigrations();
		const serializedProject = await this.projectsAdapter.get(id);

		if (!serializedProject) return null;

		if (
			typeof serializedProject !== "object" ||
			serializedProject === null ||
			typeof serializedProject.metadata !== "object" ||
			serializedProject.metadata === null
		) {
			console.warn(
				"[storage] Skipping malformed project entry (missing metadata):",
				{ id, entry: serializedProject },
			);
			return null;
		}

		const scenes =
			serializedProject.scenes?.map((scene) => ({
				id: scene.id,
				name: scene.name,
				isMain: scene.isMain,
				tracks: scene.tracks,
				bookmarks: normalizeBookmarks({ raw: scene.bookmarks }),
				createdAt: new Date(scene.createdAt),
				updatedAt: new Date(scene.updatedAt),
				...(scene.canvasSize ? { canvasSize: scene.canvasSize } : {}),
				...(scene.sourceRange ? { sourceRange: scene.sourceRange } : {}),
				...(scene.kind ? { kind: scene.kind } : {}),
			})) ?? [];

		const project: TProject = {
			metadata: {
				id: serializedProject.metadata.id,
				name: serializedProject.metadata.name,
				thumbnail: serializedProject.metadata.thumbnail,
				duration: roundMediaTime({
					time:
						serializedProject.metadata.duration ??
						getProjectDurationFromScenes({ scenes }),
				}),
				createdAt: new Date(serializedProject.metadata.createdAt),
				updatedAt: new Date(serializedProject.metadata.updatedAt),
			},
			scenes,
			currentSceneId: serializedProject.currentSceneId || "",
			settings: serializedProject.settings,
			version: serializedProject.version,
			timelineViewState: serializedProject.timelineViewState,
		};

		return { project };
	}

	async loadAllProjects(): Promise<TProject[]> {
		const projectIds = await this.projectsAdapter.list();
		const projects: TProject[] = [];

		for (const id of projectIds) {
			const result = await this.loadProject({ id });
			if (result?.project) {
				projects.push(result.project);
			}
		}

		return projects.sort(
			(a, b) => b.metadata.updatedAt.getTime() - a.metadata.updatedAt.getTime(),
		);
	}

	async loadAllProjectsMetadata(): Promise<TProjectMetadata[]> {
		await this.ensureMigrations();
		const serializedProjects = await this.projectsAdapter.getAll();

		const metadata: TProjectMetadata[] = [];
		for (const serializedProject of serializedProjects) {
			if (
				typeof serializedProject !== "object" ||
				serializedProject === null ||
				typeof serializedProject.metadata !== "object" ||
				serializedProject.metadata === null
			) {
				console.warn(
					"[storage] Skipping malformed project entry (missing metadata):",
					serializedProject,
				);
				continue;
			}

			metadata.push({
				id: serializedProject.metadata.id,
				name: serializedProject.metadata.name,
				thumbnail: serializedProject.metadata.thumbnail,
				duration: roundMediaTime({
					time:
						serializedProject.metadata.duration ??
						getProjectDurationFromScenes({
							scenes: (serializedProject.scenes ?? []) as unknown as TScene[],
						}),
				}),
				createdAt: new Date(serializedProject.metadata.createdAt),
				updatedAt: new Date(serializedProject.metadata.updatedAt),
			});
		}

		return metadata.sort(
			(a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
		);
	}

	async deleteProject({ id }: { id: string }): Promise<void> {
		await this.projectsAdapter.remove(id);
	}

	async saveMediaAsset({
		projectId,
		mediaAsset,
	}: {
		projectId: string;
		mediaAsset: MediaAsset;
	}): Promise<void> {
		const { mediaMetadataAdapter, mediaAssetsAdapter } =
			this.getProjectMediaAdapters({ projectId });

		// Só vira referência se houver mesmo um handle; senão, cópia como antes.
		const storage =
			mediaAsset.storage === "handle" && mediaAsset.handle ? "handle" : "opfs";

		const metadata: MediaAssetData = {
			id: mediaAsset.id,
			name: mediaAsset.name,
			type: mediaAsset.type,
			size: mediaAsset.file.size,
			lastModified: mediaAsset.file.lastModified,
			width: mediaAsset.width,
			height: mediaAsset.height,
			duration: mediaAsset.duration,
			fps: mediaAsset.fps,
			hasAudio: mediaAsset.hasAudio,
			thumbnailUrl: mediaAsset.thumbnailUrl,
			ephemeral: mediaAsset.ephemeral,
			storage,
			...(storage === "handle" && { handle: mediaAsset.handle }),
			...(storage === "handle" &&
				mediaAsset.originalPath && { originalPath: mediaAsset.originalPath }),
		};

		if (storage === "handle") {
			// A live fica onde está: nada é copiado para o armazenamento do app.
			await mediaMetadataAdapter.set({ key: mediaAsset.id, value: metadata });
			return;
		}

		try {
			await mediaAssetsAdapter.set({
				key: mediaAsset.id,
				value: mediaAsset.file,
			});
			await mediaMetadataAdapter.set({
				key: mediaAsset.id,
				value: metadata,
			});
		} catch (error) {
			try {
				await mediaAssetsAdapter.remove(mediaAsset.id);
			} catch {
				// Ignore cleanup failures so the original storage error is preserved.
			}

			if (this.isQuotaExceededError({ error })) {
				throw new StorageQuotaExceededError({
					requiredBytes: mediaAsset.file.size,
				});
			}

			throw error;
		}
	}

	private buildObjectUrl = async ({
		file,
		type,
	}: {
		file: File;
		type: MediaAssetData["type"];
	}): Promise<string> => {
		if (type === "image" && (!file.type || file.type === "")) {
			try {
				const text = await file.text();
				if (text.trim().startsWith("<svg")) {
					const svgBlob = new Blob([text], { type: "image/svg+xml" });
					return URL.createObjectURL(svgBlob);
				}
			} catch {
				// cai no caminho normal abaixo
			}
		}
		return URL.createObjectURL(file);
	};

	private buildAsset({
		metadata,
		file,
		url,
	}: {
		metadata: MediaAssetData;
		file: File;
		url: string;
	}): MediaAsset {
		const storage = normalizeMediaStorage(metadata.storage);
		return {
			id: metadata.id,
			name: metadata.name,
			type: metadata.type,
			file,
			url,
			width: metadata.width,
			height: metadata.height,
			duration: metadata.duration,
			fps: metadata.fps,
			hasAudio: metadata.hasAudio,
			thumbnailUrl: metadata.thumbnailUrl,
			ephemeral: metadata.ephemeral,
			storage,
			...(storage === "handle" && metadata.handle && { handle: metadata.handle }),
			...(metadata.originalPath && { originalPath: metadata.originalPath }),
		};
	}

	/**
	 * Carrega uma mídia e diz se ela está disponível. Mídias guardadas por
	 * referência podem voltar "offline" (arquivo movido, apagado, trocado ou
	 * sem permissão); as copiadas para o app que sumiram voltam `null`.
	 */
	async loadMediaAssetWithStatus({
		projectId,
		id,
	}: {
		projectId: string;
		id: string;
	}): Promise<
		| { status: "online"; asset: MediaAsset }
		| { status: "offline"; asset: OfflineMediaAsset }
		| null
	> {
		const { mediaMetadataAdapter, mediaAssetsAdapter } =
			this.getProjectMediaAdapters({ projectId });

		const metadata = await mediaMetadataAdapter.get(id);
		if (!metadata) return null;

		if (normalizeMediaStorage(metadata.storage) === "handle") {
			const linked = await readLinkedFile({
				handle: metadata.handle,
				expectedSize: metadata.size,
			});
			if (linked.status === "offline") {
				return {
					status: "offline",
					asset: { ...metadata, storage: "handle", reason: linked.reason },
				};
			}
			const url = await this.buildObjectUrl({
				file: linked.file,
				type: metadata.type,
			});
			return {
				status: "online",
				asset: this.buildAsset({ metadata, file: linked.file, url }),
			};
		}

		const file = await mediaAssetsAdapter.get(id);
		if (!file) return null;
		const url = await this.buildObjectUrl({ file, type: metadata.type });
		return {
			status: "online",
			asset: this.buildAsset({ metadata, file, url }),
		};
	}

	async loadMediaAsset({
		projectId,
		id,
	}: {
		projectId: string;
		id: string;
	}): Promise<MediaAsset | null> {
		const result = await this.loadMediaAssetWithStatus({ projectId, id });
		return result?.status === "online" ? result.asset : null;
	}

	/** Só as mídias disponíveis (as offline ficam de fora). */
	async loadAllMediaAssets({
		projectId,
	}: {
		projectId: string;
	}): Promise<MediaAsset[]> {
		const { assets } = await this.loadProjectMediaState({ projectId });
		return assets;
	}

	/** Mídias disponíveis e mídias offline do projeto. */
	async loadProjectMediaState({
		projectId,
	}: {
		projectId: string;
	}): Promise<{ assets: MediaAsset[]; offline: OfflineMediaAsset[] }> {
		const { mediaMetadataAdapter } = this.getProjectMediaAdapters({
			projectId,
		});

		const mediaIds = await mediaMetadataAdapter.list();
		const assets: MediaAsset[] = [];
		const offline: OfflineMediaAsset[] = [];

		for (const id of mediaIds) {
			const result = await this.loadMediaAssetWithStatus({ projectId, id });
			if (!result) continue;
			if (result.status === "online") assets.push(result.asset);
			else offline.push(result.asset);
		}

		return { assets, offline };
	}

	/**
	 * Copia as mídias de um projeto para outro (usado ao duplicar).
	 * Mídias guardadas por referência só têm o registro copiado (com o
	 * handle), sem abrir o arquivo nem pedir permissão: mesmo offline, a
	 * cópia continua mostrando "Mídia offline" e "Localizar arquivo".
	 * Só as mídias copiadas para o app têm o arquivo copiado.
	 */
	async copyProjectMedia({
		fromProjectId,
		toProjectId,
	}: {
		fromProjectId: string;
		toProjectId: string;
	}): Promise<void> {
		const source = this.getProjectMediaAdapters({ projectId: fromProjectId });
		const target = this.getProjectMediaAdapters({ projectId: toProjectId });

		const mediaIds = await source.mediaMetadataAdapter.list();
		for (const id of mediaIds) {
			const metadata = await source.mediaMetadataAdapter.get(id);
			if (!metadata) continue;

			if (normalizeMediaStorage(metadata.storage) === "handle") {
				await target.mediaMetadataAdapter.set({ key: id, value: metadata });
				continue;
			}

			const file = await source.mediaAssetsAdapter.get(id);
			if (!file) continue;
			try {
				await target.mediaAssetsAdapter.set({ key: id, value: file });
				await target.mediaMetadataAdapter.set({ key: id, value: metadata });
			} catch (error) {
				try {
					await target.mediaAssetsAdapter.remove(id);
				} catch {
					// mantém o erro original
				}
				if (this.isQuotaExceededError({ error })) {
					throw new StorageQuotaExceededError({ requiredBytes: file.size });
				}
				throw error;
			}
		}
	}

	async deleteMediaAsset({
		projectId,
		id,
	}: {
		projectId: string;
		id: string;
	}): Promise<void> {
		const { mediaMetadataAdapter, mediaAssetsAdapter } =
			this.getProjectMediaAdapters({ projectId });

		await Promise.all([
			mediaAssetsAdapter.remove(id),
			mediaMetadataAdapter.remove(id),
		]);
	}

	async deleteProjectMedia({
		projectId,
	}: {
		projectId: string;
	}): Promise<void> {
		const { mediaMetadataAdapter, mediaAssetsAdapter } =
			this.getProjectMediaAdapters({ projectId });

		await Promise.all([
			mediaMetadataAdapter.clear(),
			mediaAssetsAdapter.clear(),
		]);
	}

	async clearAllData(): Promise<void> {
		await this.projectsAdapter.clear();
		// project-specific media and timelines cleaned up when projects are deleted
	}

	async getStorageInfo(): Promise<{
		projects: number;
		isOPFSSupported: boolean;
		isIndexedDBSupported: boolean;
	}> {
		const projectIds = await this.projectsAdapter.list();

		return {
			projects: projectIds.length,
			isOPFSSupported: this.isOPFSSupported(),
			isIndexedDBSupported: this.isIndexedDBSupported(),
		};
	}

	async getProjectStorageInfo({ projectId }: { projectId: string }): Promise<{
		mediaItems: number;
	}> {
		const { mediaMetadataAdapter } = this.getProjectMediaAdapters({
			projectId,
		});

		const mediaIds = await mediaMetadataAdapter.list();

		return {
			mediaItems: mediaIds.length,
		};
	}

	/**
	 * Ids de todas as mídias de todos os projetos guardados (só a lista, sem
	 * abrir nenhum arquivo). Usado para apagar o cache do mapa da live das
	 * mídias que já não existem. Se algo falhar, lança: quem chama não apaga nada.
	 */
	async listAllMediaIds(): Promise<Set<string>> {
		const ids = new Set<string>();
		for (const projectId of await this.projectsAdapter.list()) {
			const { mediaMetadataAdapter } = this.getProjectMediaAdapters({
				projectId,
			});
			for (const id of await mediaMetadataAdapter.list()) ids.add(id);
		}
		return ids;
	}

	async loadSavedSounds(): Promise<SavedSoundsData> {
		try {
			const savedSoundsData = await this.savedSoundsAdapter.get("user-sounds");
			return (
				savedSoundsData || {
					sounds: [],
					lastModified: new Date().toISOString(),
				}
			);
		} catch (error) {
			console.error("Failed to load saved sounds:", error);
			return { sounds: [], lastModified: new Date().toISOString() };
		}
	}

	async saveSoundEffect({
		soundEffect,
	}: {
		soundEffect: SoundEffect;
	}): Promise<void> {
		try {
			const currentData = await this.loadSavedSounds();

			if (currentData.sounds.some((sound) => sound.id === soundEffect.id)) {
				return; // Already saved
			}

			const savedSound: SavedSound = {
				id: soundEffect.id,
				name: soundEffect.name,
				username: soundEffect.username,
				previewUrl: soundEffect.previewUrl,
				downloadUrl: soundEffect.downloadUrl,
				duration: soundEffect.duration,
				tags: soundEffect.tags,
				license: soundEffect.license,
				savedAt: new Date().toISOString(),
			};

			const updatedData: SavedSoundsData = {
				sounds: [...currentData.sounds, savedSound],
				lastModified: new Date().toISOString(),
			};

			await this.savedSoundsAdapter.set({
				key: "user-sounds",
				value: updatedData,
			});
		} catch (error) {
			console.error("Failed to save sound effect:", error);
			throw error;
		}
	}

	async removeSavedSound({ soundId }: { soundId: number }): Promise<void> {
		try {
			const currentData = await this.loadSavedSounds();

			const updatedData: SavedSoundsData = {
				sounds: currentData.sounds.filter((sound) => sound.id !== soundId),
				lastModified: new Date().toISOString(),
			};

			await this.savedSoundsAdapter.set({
				key: "user-sounds",
				value: updatedData,
			});
		} catch (error) {
			console.error("Failed to remove saved sound:", error);
			throw error;
		}
	}

	async isSoundSaved({ soundId }: { soundId: number }): Promise<boolean> {
		try {
			const currentData = await this.loadSavedSounds();
			return currentData.sounds.some((sound) => sound.id === soundId);
		} catch (error) {
			console.error("Failed to check if sound is saved:", error);
			return false;
		}
	}

	async clearSavedSounds(): Promise<void> {
		try {
			await this.savedSoundsAdapter.remove("user-sounds");
		} catch (error) {
			console.error("Failed to clear saved sounds:", error);
			throw error;
		}
	}

	isOPFSSupported(): boolean {
		return OPFSAdapter.isSupported();
	}

	isIndexedDBSupported(): boolean {
		return "indexedDB" in window;
	}

	isFullySupported(): boolean {
		return this.isIndexedDBSupported() && this.isOPFSSupported();
	}
}

export const storageService = new StorageService();
export { StorageService };
