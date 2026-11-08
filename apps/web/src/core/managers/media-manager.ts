import { t } from "@/i18n";
import type { EditorCore } from "@/core";
import { toast } from "sonner";
import type { MediaAsset } from "@/media/types";
import { storageService } from "@/services/storage/service";
import { generateUUID } from "@/utils/id";
import { videoCache } from "@/services/video-cache/service";
import { waveformCache } from "@/services/waveform-cache/service";
import { BatchCommand, RemoveMediaAssetCommand } from "@/commands";
import type { OfflineMediaAsset } from "@/services/storage/types";
import {
	getDesktopFilePath,
	readLinkedFile,
} from "@/services/storage/file-handle";
import { pickReplacementFile } from "@/media/relink-media";
import { hasSpaceFor } from "@/media/processing";
import { decideMediaStorage } from "@/services/storage/media-reference";

export type RelinkResult =
	| "relinked"
	| "cancelled"
	| "mismatch"
	/** Sem espaço para a cópia (o aviso com o que fazer já foi mostrado). */
	| "noSpace"
	| "failed";

export class MediaManager {
	private assets: MediaAsset[] = [];
	/**
	 * Mídias guardadas por referência cujo arquivo não foi achado. Ficam fora
	 * de `assets` (e de prévia, áudio e exportação) até serem reconectadas.
	 */
	private offlineAssets: OfflineMediaAsset[] = [];
	private isLoading = false;
	private listeners = new Set<() => void>();

	constructor(private editor: EditorCore) {}

	async addMediaAsset({
		projectId,
		asset,
	}: {
		projectId: string;
		asset: Omit<MediaAsset, "id">;
	}): Promise<MediaAsset | null> {
		const newAsset: MediaAsset = {
			...asset,
			id: generateUUID(),
		};

		this.assets = [...this.assets, newAsset];
		this.notify();

		try {
			await storageService.saveMediaAsset({ projectId, mediaAsset: newAsset });
			this.editor.project.ratchetFpsForImportedMedia({
				importedAssets: [newAsset],
			});
			return newAsset;
		} catch (error) {
			console.error("Failed to save media asset:", error);
			this.assets = this.assets.filter((asset) => asset.id !== newAsset.id);
			this.notify();

			if (storageService.isQuotaExceededError({ error })) {
				toast.error(t("actions.storage.lowSpace"), {
					description: t("actions.storage.lowSpaceHint"),
				});
			}

			return null;
		}
	}

	removeMediaAsset({ projectId, id }: { projectId: string; id: string }): void {
		this.removeMediaAssets({ projectId, ids: [id] });
	}

	removeMediaAssets({
		projectId,
		ids,
	}: {
		projectId: string;
		ids: string[];
	}): void {
		const uniqueIds = [...new Set(ids)];
		if (uniqueIds.length === 0) {
			return;
		}

		const command =
			uniqueIds.length === 1
				? new RemoveMediaAssetCommand({
						projectId,
						assetId: uniqueIds[0],
					})
				: new BatchCommand(
						uniqueIds.map((id) =>
							new RemoveMediaAssetCommand({
								projectId,
								assetId: id,
							}),
						),
					);

		this.editor.command.execute({ command });
	}

	async loadProjectMedia({ projectId }: { projectId: string }): Promise<void> {
		this.isLoading = true;
		this.notify();

		try {
			const { assets, offline } = await storageService.loadProjectMediaState({
				projectId,
			});
			this.assets = assets;
			this.offlineAssets = offline;
			this.notify();
		} catch (error) {
			console.error("Failed to load media assets:", error);
		} finally {
			this.isLoading = false;
			this.notify();
		}
	}

	async clearProjectMedia({ projectId }: { projectId: string }): Promise<void> {
		waveformCache.clearAll();

		this.assets.forEach((asset) => {
			if (asset.url) {
				URL.revokeObjectURL(asset.url);
			}
			if (asset.thumbnailUrl) {
				URL.revokeObjectURL(asset.thumbnailUrl);
			}
		});

		const mediaIds = [
			...this.assets.map((asset) => asset.id),
			...this.offlineAssets.map((asset) => asset.id),
		];
		this.assets = [];
		this.offlineAssets = [];
		this.notify();

		try {
			await Promise.all(
				mediaIds.map((id) =>
					storageService.deleteMediaAsset({ projectId, id }),
				),
			);
		} catch (error) {
			console.error("Failed to clear media assets from storage:", error);
		}
	}

	clearAllAssets(): void {
		videoCache.clearAll();
		waveformCache.clearAll();

		this.assets.forEach((asset) => {
			if (asset.url) {
				URL.revokeObjectURL(asset.url);
			}
			if (asset.thumbnailUrl) {
				URL.revokeObjectURL(asset.thumbnailUrl);
			}
		});

		this.assets = [];
		this.offlineAssets = [];
		this.notify();
	}

	getAssets(): MediaAsset[] {
		return this.assets;
	}

	setAssets({ assets }: { assets: MediaAsset[] }): void {
		this.assets = assets;
		this.notify();
	}

	getOfflineAssets(): OfflineMediaAsset[] {
		return this.offlineAssets;
	}

	/**
	 * "Localizar arquivo": primeiro tenta o mesmo arquivo (talvez só falte
	 * liberar o acesso); senão, pede à pessoa para escolher e confere se é o
	 * mesmo (tamanho e duração parecidos). Chamar direto do clique.
	 */
	async relinkOfflineAsset({
		projectId,
		id,
	}: {
		projectId: string;
		id: string;
	}): Promise<RelinkResult> {
		const offline = this.offlineAssets.find((asset) => asset.id === id);
		if (!offline) return "failed";

		try {
			let file: File | null = null;
			let handle: FileSystemFileHandle | null = null;

			if (offline.reason === "permission" && offline.handle) {
				const linked = await readLinkedFile({
					handle: offline.handle,
					expectedSize: offline.size,
					request: true,
				});
				if (linked.status === "online") {
					file = linked.file;
					handle = offline.handle;
				}
			}

			if (!file) {
				const picked = await pickReplacementFile({ asset: offline });
				if (picked.status !== "ok") return picked.status;
				file = picked.file;
				handle = picked.handle;
			}

			const storage = decideMediaStorage({
				size: file.size,
				type: offline.type,
				durationSeconds: offline.duration,
				hasHandle: handle !== null,
			});
			// Sem handle (seletor comum do navegador) a mídia vira cópia no app:
			// confere o espaço antes, como na importação.
			if (storage === "opfs" && !(await hasSpaceFor({ file }))) {
				return "noSpace";
			}
			const {
				reason: _reason,
				size: _size,
				lastModified: _lastModified,
				handle: _oldHandle,
				originalPath: oldPath,
				...rest
			} = offline;
			const asset: MediaAsset = {
				...rest,
				file,
				url: URL.createObjectURL(file),
				storage,
				...(storage === "handle" &&
					handle && {
						handle,
						originalPath: getDesktopFilePath(file) || oldPath,
					}),
			};

			await storageService.saveMediaAsset({ projectId, mediaAsset: asset });

			this.offlineAssets = this.offlineAssets.filter((a) => a.id !== id);
			this.assets = [...this.assets, asset];
			videoCache.clearVideo({ mediaId: id });
			this.notify();
			return "relinked";
		} catch (error) {
			console.error("Failed to relink media asset:", error);
			return "failed";
		}
	}

	/** Tira da lista uma mídia offline (só a referência; o arquivo do PC fica). */
	async removeOfflineAsset({
		projectId,
		id,
	}: {
		projectId: string;
		id: string;
	}): Promise<void> {
		this.offlineAssets = this.offlineAssets.filter((asset) => asset.id !== id);
		this.notify();
		try {
			await storageService.deleteMediaAsset({ projectId, id });
		} catch (error) {
			console.error("Failed to remove offline media asset:", error);
		}
	}

	isLoadingMedia(): boolean {
		return this.isLoading;
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private notify(): void {
		this.listeners.forEach((fn) => {
			fn();
		});
	}
}
