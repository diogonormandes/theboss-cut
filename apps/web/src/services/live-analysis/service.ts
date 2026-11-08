/**
 * Serviço do mapa da live: abre o Worker, acompanha o progresso, permite
 * cancelar e guarda o resultado no OPFS (a segunda abertura lê do cache).
 *
 * Cada trabalho usa um Worker próprio que é encerrado no fim: nada do
 * decodificador fica preso na memória depois da análise.
 */

import { storageService } from "@/services/storage/service";
import { analysisKey, cleanAssetId, decodeAnalysis, type LiveAnalysis } from "./format";
import { pruneCachedAnalyses, readCachedAnalysis, writeCachedAnalysis } from "./storage";
import type {
	LiveAnalysisErrorCode,
	LiveAnalysisWorkerRequest,
	LiveAnalysisWorkerResponse,
} from "./worker";

export type AudioTrackInfo = {
	name: string | null;
	languageCode: string;
	channels: number;
	sampleRate: number;
};

export type LiveAnalysisProgress = { processedSec: number; durationSec: number };

export class LiveAnalysisError extends Error {
	readonly code: LiveAnalysisErrorCode | "cancelled";
	constructor(code: LiveAnalysisErrorCode | "cancelled", detail: string) {
		super(detail);
		this.code = code;
	}
}

let nextJobId = 1;

function createWorker(): Worker {
	return new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
}

/** Quantas faixas de áudio o arquivo tem (lê só o cabeçalho, num Worker). */
export function probeAudioTracks(file: File): Promise<AudioTrackInfo[]> {
	const jobId = nextJobId++;
	const worker = createWorker();
	return new Promise<AudioTrackInfo[]>((resolve, reject) => {
		worker.onmessage = (event: MessageEvent<LiveAnalysisWorkerResponse>) => {
			const msg = event.data;
			if (msg.jobId !== jobId) return;
			if (msg.type === "probed") resolve(msg.tracks);
			else if (msg.type === "error") reject(new LiveAnalysisError(msg.code, msg.detail));
		};
		worker.onerror = (event) => reject(new LiveAnalysisError("read-failed", event.message));
		worker.postMessage({ type: "probe", jobId, file } satisfies LiveAnalysisWorkerRequest);
	}).finally(() => worker.terminate());
}

export type AnalysisSource = {
	assetId: string;
	file: File;
	trackIndex: number;
	/** duração conhecida em segundos (0 = descobrir) */
	durationSec: number;
};

export function keyForSource({ assetId, file, trackIndex }: AnalysisSource): string {
	return analysisKey({
		assetId,
		size: file.size,
		lastModified: file.lastModified,
		trackIndex,
	});
}

export async function loadCachedLiveAnalysis(source: AnalysisSource): Promise<LiveAnalysis | null> {
	return readCachedAnalysis(keyForSource(source));
}

export type RunResult = {
	analysis: LiveAnalysis;
	elapsedMs: number;
	fromCache: boolean;
	/** maior memória de JavaScript do Worker (bytes), quando o navegador informa */
	peakHeapBytes: number | null;
};

/**
 * Analisa (ou lê do cache) a faixa de áudio da live.
 * `signal` cancela; o erro lançado tem `code === "cancelled"`.
 */
export async function runLiveAnalysis({
	source,
	onProgress,
	signal,
	useCache = true,
}: {
	source: AnalysisSource;
	onProgress?: (progress: LiveAnalysisProgress) => void;
	signal?: AbortSignal;
	useCache?: boolean;
}): Promise<RunResult> {
	const key = keyForSource(source);
	if (useCache) {
		const cached = await readCachedAnalysis(key);
		if (cached) return { analysis: cached, elapsedMs: 0, fromCache: true, peakHeapBytes: null };
	}
	if (signal?.aborted) throw new LiveAnalysisError("cancelled", "cancelado");

	const jobId = nextJobId++;
	const worker = createWorker();
	const result = await new Promise<{ buffer: ArrayBuffer; elapsedMs: number; peakHeapBytes: number | null }>(
		(resolve, reject) => {
			const onAbort = () => {
				worker.postMessage({ type: "cancel", jobId } satisfies LiveAnalysisWorkerRequest);
				// se o Worker não responder logo, encerra assim mesmo
				setTimeout(() => reject(new LiveAnalysisError("cancelled", "cancelado")), 1500);
			};
			signal?.addEventListener("abort", onAbort, { once: true });
			worker.onmessage = (event: MessageEvent<LiveAnalysisWorkerResponse>) => {
				const msg = event.data;
				if (msg.jobId !== jobId) return;
				if (msg.type === "progress") {
					onProgress?.({ processedSec: msg.processedSec, durationSec: msg.durationSec });
				} else if (msg.type === "done") {
					signal?.removeEventListener("abort", onAbort);
					resolve({ buffer: msg.buffer, elapsedMs: msg.elapsedMs, peakHeapBytes: msg.peakHeapBytes });
				} else if (msg.type === "cancelled") {
					reject(new LiveAnalysisError("cancelled", "cancelado"));
				} else if (msg.type === "error") {
					signal?.removeEventListener("abort", onAbort);
					reject(new LiveAnalysisError(msg.code, msg.detail));
				}
			};
			worker.onerror = (event) => {
				signal?.removeEventListener("abort", onAbort);
				reject(new LiveAnalysisError("read-failed", event.message || "erro no worker"));
			};
			worker.postMessage({
				type: "analyze",
				jobId,
				file: source.file,
				trackIndex: source.trackIndex,
				durationSec: source.durationSec,
			} satisfies LiveAnalysisWorkerRequest);
		},
	).finally(() => worker.terminate());

	const analysis = decodeAnalysis(result.buffer);
	if (!analysis) throw new LiveAnalysisError("read-failed", "resultado inválido");
	await writeCachedAnalysis(key, result.buffer);
	return {
		analysis,
		elapsedMs: result.elapsedMs,
		fromCache: false,
		peakHeapBytes: result.peakHeapBytes,
	};
}

let pruned = false;

/**
 * Uma vez por sessão: apaga do OPFS os mapas de mídias que não existem mais
 * em nenhum projeto (mídia removida, projeto apagado). Feito por varredura e
 * não na hora de remover, para "desfazer" e projetos duplicados (que dividem
 * os ids das mídias) não perderem a análise. `extraIds`: mídias abertas agora
 * que talvez ainda não estejam salvas. Se a lista falhar, não apaga nada.
 */
export async function pruneOrphanLiveAnalyses(extraIds: Iterable<string> = []): Promise<void> {
	if (pruned) return;
	pruned = true;
	try {
		const ids = await storageService.listAllMediaIds();
		for (const id of extraIds) ids.add(id);
		await pruneCachedAnalyses(ids, cleanAssetId);
	} catch (error) {
		console.warn("Mapa da live: não deu para limpar resultados antigos.", error);
	}
}
