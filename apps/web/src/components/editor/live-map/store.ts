"use client";

/**
 * Estado do mapa da live na tela: um item por vídeo (asset). A análise roda
 * num Worker (services/live-analysis); aqui só fica o progresso e o resultado.
 */

import { create } from "zustand";
import type { LiveAnalysis } from "@/services/live-analysis/format";
import {
	type AudioTrackInfo,
	LiveAnalysisError,
	loadCachedLiveAnalysis,
	probeAudioTracks,
	runLiveAnalysis,
} from "@/services/live-analysis/service";
import { type LiveSummary, summarizeLive } from "@/services/live-analysis/summary";

export type LiveMapErrorKind = "no-audio" | "cannot-decode" | "offline" | "failed";

export type LiveMapEntry = {
	status: "checking" | "idle" | "running" | "done" | "error";
	tracks: AudioTrackInfo[];
	trackIndex: number;
	processedSec: number;
	durationSec: number;
	startedAt: number;
	analysis: LiveAnalysis | null;
	summary: LiveSummary | null;
	error: LiveMapErrorKind | null;
	/** tempo da última análise (ms), para os testes internos */
	elapsedMs: number;
	/** arquivo a que este estado se refere (se a mídia for religada a outro arquivo, recomeça) */
	file: File | null;
};

export type LiveMapSource = {
	assetId: string;
	file: File;
	durationSec: number;
};

type State = {
	entries: Record<string, LiveMapEntry>;
	/** confere o cache e quantas faixas o vídeo tem (não analisa) */
	prepare: (source: LiveMapSource) => Promise<void>;
	start: (source: LiveMapSource, trackIndex?: number) => Promise<void>;
	cancel: (assetId: string) => void;
	setTrack: (source: LiveMapSource, trackIndex: number) => Promise<void>;
};

const controllers = new Map<string, AbortController>();
/** evita preparar o mesmo arquivo duas vezes ao mesmo tempo */
const preparing = new Map<string, File>();

const EMPTY: LiveMapEntry = {
	status: "checking",
	tracks: [],
	trackIndex: 0,
	processedSec: 0,
	durationSec: 0,
	startedAt: 0,
	analysis: null,
	summary: null,
	error: null,
	elapsedMs: 0,
	file: null,
};

function errorKind(error: unknown): LiveMapErrorKind {
	if (error instanceof LiveAnalysisError) {
		if (error.code === "no-audio") return "no-audio";
		if (error.code === "cannot-decode") return "cannot-decode";
		if (/NotFound|NotReadable|could not be found|could not be read/i.test(error.message)) {
			return "offline";
		}
	}
	return "failed";
}

export const useLiveMapStore = create<State>((set, get) => {
	const patch = (assetId: string, next: Partial<LiveMapEntry>) =>
		set((state) => ({
			entries: {
				...state.entries,
				[assetId]: { ...(state.entries[assetId] ?? EMPTY), ...next },
			},
		}));

	const done = (assetId: string, analysis: LiveAnalysis, elapsedMs: number) =>
		patch(assetId, {
			status: "done",
			analysis,
			summary: summarizeLive(analysis),
			error: null,
			elapsedMs,
			trackIndex: analysis.trackIndex,
		});

	return {
		entries: {},

		prepare: async (source) => {
			if (preparing.get(source.assetId) === source.file) return;
			const current = get().entries[source.assetId];
			if (current?.status === "running") return;
			const sameFile = current?.file === source.file;
			if (current && sameFile && current.status !== "checking" && current.status !== "error") return;
			preparing.set(source.assetId, source.file);
			// outro arquivo (mídia religada): esquece o mapa do arquivo antigo
			patch(
				source.assetId,
				sameFile
					? { status: "checking", error: null, file: source.file }
					: { ...EMPTY, file: source.file },
			);
			try {
				let tracks: AudioTrackInfo[] = [];
				try {
					tracks = await probeAudioTracks(source.file);
				} catch (error) {
					patch(source.assetId, { status: "error", error: errorKind(error) });
					return;
				}
				if (tracks.length === 0) {
					patch(source.assetId, { status: "error", tracks, error: "no-audio" });
					return;
				}
				// já analisado antes (qualquer faixa)? abre direto do cache
				for (let i = 0; i < tracks.length; i++) {
					const cached = await loadCachedLiveAnalysis({ ...source, trackIndex: i });
					if (cached) {
						patch(source.assetId, { tracks });
						done(source.assetId, cached, 0);
						return;
					}
				}
				patch(source.assetId, { status: "idle", tracks, trackIndex: 0 });
			} finally {
				preparing.delete(source.assetId);
			}
		},

		start: async (source, trackIndex) => {
			const entry = get().entries[source.assetId] ?? EMPTY;
			if (entry.status === "running") return;
			const track = trackIndex ?? entry.trackIndex;
			// uma análise por vez: o PC pode estar transmitindo ao vivo
			for (const [id, other] of controllers) if (id !== source.assetId) other.abort();
			const controller = new AbortController();
			controllers.set(source.assetId, controller);
			patch(source.assetId, {
				status: "running",
				trackIndex: track,
				processedSec: 0,
				durationSec: source.durationSec,
				startedAt: performance.now(),
				error: null,
				file: source.file,
			});
			try {
				const result = await runLiveAnalysis({
					source: { ...source, trackIndex: track },
					signal: controller.signal,
					onProgress: ({ processedSec, durationSec }) =>
						patch(source.assetId, { processedSec, durationSec }),
				});
				done(source.assetId, result.analysis, result.elapsedMs);
			} catch (error) {
				if (error instanceof LiveAnalysisError && error.code === "cancelled") {
					const prev = get().entries[source.assetId];
					patch(source.assetId, {
						status: prev?.analysis ? "done" : "idle",
						trackIndex: prev?.analysis?.trackIndex ?? track,
					});
				} else {
					console.error("Mapa da live:", error);
					patch(source.assetId, { status: "error", error: errorKind(error) });
				}
			} finally {
				if (controllers.get(source.assetId) === controller) controllers.delete(source.assetId);
			}
		},

		cancel: (assetId) => {
			controllers.get(assetId)?.abort();
		},

		setTrack: async (source, trackIndex) => {
			const entry = get().entries[source.assetId];
			if (!entry || entry.status === "running") return;
			const cached = await loadCachedLiveAnalysis({ ...source, trackIndex });
			if (cached) {
				done(source.assetId, cached, 0);
				return;
			}
			patch(source.assetId, {
				status: "idle",
				trackIndex,
				analysis: null,
				summary: null,
			});
		},
	};
});
