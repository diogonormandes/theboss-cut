import type { EditorCore } from "@/core";
import {
	downloadBuffer,
	type ExportFormat,
	type ExportOptions,
	getExportFileExtension,
	getExportMimeType,
} from "@/export";
import type { ExportFileSink } from "@/services/renderer/scene-exporter";
import { t } from "@/i18n";
import { videoCache } from "@/services/video-cache/service";

/**
 * Fila de exportação dos cortes (Etapa 3, passo 7): um corte de cada vez,
 * direto para Vídeos\THEBOSS CUT\<projeto> no programa do Windows (ou um
 * download por corte no navegador). Nada do vídeo pronto fica guardado aqui.
 */

export type ExportQueueItemState =
	| "aguardando"
	| "exportando"
	| "pronto"
	| "erro"
	| "cancelado";

export interface ExportQueueItem {
	id: string;
	sceneId: string;
	nome: string;
	estado: ExportQueueItemState;
	progresso: number;
	/** Onde o arquivo ficou (só no programa do Windows). */
	caminho?: string;
	erro?: string;
}

export interface ExportQueueSnapshot {
	items: readonly ExportQueueItem[];
	running: boolean;
	/** Pasta dos cortes deste projeto (só no programa do Windows). */
	pasta: string | null;
}

/** Ponte de arquivos exposta pelo `desktop/preload.js`. */
export interface DesktopFilesBridge {
	pastaPadraoCortes(nomeProjeto: string): Promise<string>;
	abrir(
		nomeArquivo: string,
		pasta: string,
	): Promise<{ id: number; caminho: string }>;
	escrever(id: number, posicao: number, bytes: Uint8Array): Promise<number>;
	fechar(id: number, descartar?: boolean): Promise<boolean>;
	mostrarNaPasta(caminho: string): Promise<boolean>;
}

export function getDesktopFilesBridge(): DesktopFilesBridge | null {
	if (typeof window === "undefined") return null;
	const bridge = (
		window as Window & { theBossCut?: { arquivos?: DesktopFilesBridge } }
	).theBossCut?.arquivos;
	return bridge && typeof bridge.abrir === "function" ? bridge : null;
}

/**
 * Nome do arquivo = nome da cena (que já vem numerado, ex.: "Corte 05 - Grito forte"),
 * limpo para o Windows. Sem nome: "Corte 01" no idioma da tela. O programa ainda
 * acrescenta (2), (3)… se já existir um arquivo igual na pasta.
 */
export function buildCutFileName({
	index,
	motivo,
	format,
}: {
	index: number;
	motivo: string;
	format: ExportFormat;
}): string {
	const numero = String(Math.max(1, Math.floor(index))).padStart(2, "0");
	const limpo = motivo
		.replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 80)
		.trim();
	const base = limpo || t("exportQueue.fileFallback", { n: numero });
	return `${base}${getExportFileExtension({ format })}`;
}

/** Cada item guarda as próprias opções: a fila pode receber cortes com formatos diferentes. */
type Runtime = { cancel: boolean; options: ExportOptions };

/** Destino que manda os pedaços para a ponte; mede quanto foi gravado. */
function createBridgeSink(bridge: DesktopFilesBridge, fileId: number) {
	const sink: ExportFileSink = {
		write: async (position, data) => {
			// A cópia pela ponte leva o buffer inteiro por baixo do pedaço: manda só o pedaço.
			const exact =
				data.byteOffset === 0 && data.byteLength === data.buffer.byteLength
					? data
					: data.slice();
			await bridge.escrever(fileId, position, exact);
		},
	};
	return sink;
}

export class ExportQueueManager {
	private items: ExportQueueItem[] = [];
	private running = false;
	private pasta: string | null = null;
	private runtimes = new Map<string, Runtime>();
	private listeners = new Set<() => void>();
	private snapshot: ExportQueueSnapshot = { items: [], running: false, pasta: null };
	private nextId = 1;

	constructor(private editor: EditorCore) {}

	getSnapshot = (): ExportQueueSnapshot => this.snapshot;

	subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	};

	isRunning(): boolean {
		return this.running;
	}

	/**
	 * Põe cortes na fila e começa (se ainda não estiver rodando).
	 * `numero` é o número do corte no nome do arquivo ("Corte 01 - ...").
	 */
	enqueue({
		cuts,
		options,
	}: {
		cuts: { sceneId: string; nome: string; numero: number }[];
		options: ExportOptions;
	}): void {
		for (const cut of cuts) {
			const id = `q${this.nextId++}`;
			this.items.push({
				id,
				sceneId: cut.sceneId,
				nome: buildCutFileName({
					index: cut.numero,
					motivo: cut.nome,
					format: options.format,
				}),
				estado: "aguardando",
				progresso: 0,
			});
			this.runtimes.set(id, { cancel: false, options: { ...options } });
		}
		this.publish();
		if (!this.running) void this.run();
	}

	/** Cancela um item (o que está exportando para no próximo quadro). */
	cancel(itemId: string): void {
		const runtime = this.runtimes.get(itemId);
		if (runtime) runtime.cancel = true;
		this.patch(itemId, (item) =>
			item.estado === "aguardando" ? { estado: "cancelado" } : {},
		);
	}

	cancelAll(): void {
		for (const item of this.items) this.cancel(item.id);
	}

	/** Tira da lista os itens que já terminaram (prontos, com erro ou cancelados). */
	clearFinished(): void {
		this.items = this.items.filter(
			(item) => item.estado === "aguardando" || item.estado === "exportando",
		);
		for (const id of [...this.runtimes.keys()]) {
			if (!this.items.some((item) => item.id === id)) this.runtimes.delete(id);
		}
		this.publish();
	}

	async showFolder(caminho?: string): Promise<boolean> {
		const bridge = getDesktopFilesBridge();
		const alvo = caminho ?? this.pasta;
		if (!bridge || !alvo) return false;
		try {
			return await bridge.mostrarNaPasta(alvo);
		} catch {
			return false;
		}
	}

	private async run(): Promise<void> {
		this.running = true;
		// A pasta é do projeto aberto: descobre de novo a cada rodada da fila.
		this.pasta = null;
		this.publish();
		try {
			for (;;) {
				const item = this.items.find((entry) => entry.estado === "aguardando");
				if (!item) break;
				// A prévia usa os mesmos leitores de vídeo: pausa antes de cada corte.
				if (this.editor.playback.getIsPlaying()) this.editor.playback.pause();
				await this.exportItem(item.id);
				// Fecha os leitores de vídeo entre um corte e outro (a prévia reabre sozinha).
				videoCache.clearAll();
				await new Promise((resolve) => setTimeout(resolve, 50));
			}
		} finally {
			this.running = false;
			this.publish();
		}
	}

	private async exportItem(itemId: string) {
		const item = this.items.find((entry) => entry.id === itemId);
		const runtime = this.runtimes.get(itemId);
		if (!item || !runtime) {
			// Sem as opções do item não dá para exportar: não deixa o item preso na fila.
			if (item) this.patch(itemId, () => ({ estado: "erro", erro: t("actions.export.unknownError") }));
			return;
		}
		const { options } = runtime;
		this.patch(itemId, () => ({ estado: "exportando", progresso: 0 }));

		const bridge = getDesktopFilesBridge();
		let fileId: number | null = null;
		let caminho: string | undefined;
		try {
			let fileSink: ExportFileSink | undefined;
			if (bridge) {
				if (!this.pasta) {
					const projeto = this.editor.project.getActive()?.metadata.name ?? "";
					this.pasta = await bridge.pastaPadraoCortes(projeto);
				}
				const aberto = await bridge.abrir(item.nome, this.pasta);
				fileId = aberto.id;
				caminho = aberto.caminho;
				fileSink = createBridgeSink(bridge, aberto.id);
			}

			let lastPublish = 0;
			const result = await this.editor.renderer.exportProject({
				options,
				sceneId: item.sceneId,
				fileSink,
				onProgress: ({ progress }) => {
					const now = performance.now();
					if (now - lastPublish < 200 && progress < 1) return;
					lastPublish = now;
					this.patch(itemId, () => ({ progresso: progress }));
				},
				onCancel: () => runtime.cancel,
			});

			if (result.cancelled || runtime.cancel) {
				await this.closeFile(bridge, fileId, true);
				this.patch(itemId, () => ({ estado: "cancelado" }));
				return;
			}
			if (!result.success) {
				await this.closeFile(bridge, fileId, true);
				this.patch(itemId, () => ({ estado: "erro", erro: result.error }));
				return;
			}

			if (bridge) {
				await this.closeFile(bridge, fileId, false);
			} else if (result.buffer) {
				downloadBuffer({
					buffer: result.buffer,
					filename: item.nome,
					mimeType: getExportMimeType({ format: options.format }),
				});
			}
			this.patch(itemId, () => ({ estado: "pronto", progresso: 1, caminho }));
		} catch (error) {
			console.error("Export queue item failed:", error);
			await this.closeFile(bridge, fileId, true);
			this.patch(itemId, () => ({
				estado: "erro",
				erro: t("actions.export.unknownError"),
			}));
		} finally {
			this.runtimes.delete(itemId);
		}
	}

	private async closeFile(
		bridge: DesktopFilesBridge | null,
		fileId: number | null,
		discard: boolean,
	): Promise<void> {
		if (!bridge || fileId === null) return;
		try {
			await bridge.fechar(fileId, discard);
		} catch (error) {
			console.error("Export queue: closing file failed:", error);
		}
	}

	private patch(
		itemId: string,
		change: (item: ExportQueueItem) => Partial<ExportQueueItem>,
	): void {
		let changed = false;
		this.items = this.items.map((item) => {
			if (item.id !== itemId) return item;
			const next = change(item);
			if (Object.keys(next).length === 0) return item;
			changed = true;
			return { ...item, ...next };
		});
		if (changed) this.publish();
	}

	private publish(): void {
		this.snapshot = {
			items: this.items,
			running: this.running,
			pasta: this.pasta,
		};
		for (const listener of this.listeners) listener();
	}
}
