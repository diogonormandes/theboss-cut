/**
 * Conferência interna do mapa da live (SÓ em desenvolvimento).
 *
 * No console do editor:
 *   await __mapaDaLive.conferir("live-teste-240min.mp4")
 * Analisa a live de teste gravada no OPFS pela página /dev/gerar-live-teste
 * (sem usar o cache), mede tempo e memória, confere com o gabarito e mede
 * quanto tempo a segunda abertura (pelo cache) leva.
 */

import { readMemorySnapshot } from "@/diagnostics/memory";
import { conferirComGabarito, type GabaritoIntervalos } from "./gabarito-check";
import { loadCachedLiveAnalysis, runLiveAnalysis } from "./service";
import { summarizeLive } from "./summary";

async function abrirDoOpfs(nome: string): Promise<File> {
	const raiz = await navigator.storage.getDirectory();
	const bruto = await (await raiz.getFileHandle(nome)).getFile();
	const tipo = nome.endsWith(".mkv") ? "video/x-matroska" : "video/mp4";
	return new File([bruto], nome, { type: tipo, lastModified: bruto.lastModified });
}

async function lerGabarito(nome: string): Promise<{ intervalos: GabaritoIntervalos; duracaoSeg: number } | null> {
	try {
		const raiz = await navigator.storage.getDirectory();
		const arquivo = nome.replace(/\.(mp4|mkv)$/, ".gabarito.json");
		const texto = await (await (await raiz.getFileHandle(arquivo)).getFile()).text();
		return JSON.parse(texto);
	} catch {
		return null;
	}
}

const mb = (bytes: number | null | undefined) =>
	typeof bytes === "number" ? Math.round(bytes / 1048576) : null;

export async function conferirMapaDaLive(nome = "live-teste-240min.mp4", faixa = 0) {
	const file = await abrirDoOpfs(nome);
	const gabarito = await lerGabarito(nome);
	const source = {
		assetId: `dev-${nome}`,
		file,
		trackIndex: faixa,
		durationSec: gabarito?.duracaoSeg ?? 0,
	};
	const memAntes = readMemorySnapshot()?.usedJSHeapSize ?? null;
	let memPico = memAntes;
	let ultimoLog = 0;
	const t0 = performance.now();
	const resultado = await runLiveAnalysis({
		source,
		useCache: false,
		onProgress: ({ processedSec, durationSec }) => {
			const m = readMemorySnapshot()?.usedJSHeapSize ?? null;
			if (m !== null && (memPico === null || m > memPico)) memPico = m;
			const agora = performance.now();
			if (agora - ultimoLog > 10_000) {
				ultimoLog = agora;
				console.log(
					`[mapa] ${Math.round(processedSec)} de ${Math.round(durationSec)} s em ${Math.round((agora - t0) / 1000)} s`,
				);
			}
		},
	});
	const tempoTotalMs = performance.now() - t0;
	const t1 = performance.now();
	const resumo = summarizeLive(resultado.analysis);
	const resumoMs = performance.now() - t1;
	const t2 = performance.now();
	const doCache = await loadCachedLiveAnalysis(source);
	const cacheMs = performance.now() - t2;

	const relatorio = {
		arquivo: nome,
		faixa,
		tamanhoMb: mb(file.size),
		duracaoSeg: resultado.analysis.durationSec,
		quadros: resultado.analysis.frameCount,
		resultadoMb: Math.round((resultado.analysis.frameCount * 8) / 1048576 * 10) / 10,
		tempoAnaliseSeg: Math.round(resultado.elapsedMs / 100) / 10,
		tempoTotalSeg: Math.round(tempoTotalMs / 100) / 10,
		velocidade: `${Math.round(resultado.analysis.durationSec / (resultado.elapsedMs / 1000))}x tempo real`,
		memoriaWorkerPicoMb: mb(resultado.peakHeapBytes),
		memoriaTelaAntesMb: mb(memAntes),
		memoriaTelaPicoMb: mb(memPico),
		resumoMs: Math.round(resumoMs),
		segundaAberturaMs: Math.round(cacheMs),
		segundaAberturaOk: doCache?.frameCount === resultado.analysis.frameCount,
		gritos: resumo.shouts.length,
		momentos: resumo.peaks.length,
		silencioSeg: Math.round(resumo.silenceSec),
		gabarito: gabarito ? conferirComGabarito(resultado.analysis, gabarito.intervalos) : "sem gabarito",
	};
	console.log("[mapa] resultado", relatorio);
	return relatorio;
}

/** Começa a análise e cancela depois de `aposMs`: confere que para rápido e não grava cache. */
export async function testarCancelar(nome = "live-teste-240min.mp4", aposMs = 3000) {
	const file = await abrirDoOpfs(nome);
	const source = { assetId: `dev-cancelar-${nome}`, file, trackIndex: 0, durationSec: 0 };
	const controller = new AbortController();
	let ultimo = 0;
	let canceladoEm = 0;
	setTimeout(() => {
		canceladoEm = performance.now();
		controller.abort();
	}, aposMs);
	try {
		await runLiveAnalysis({
			source,
			useCache: false,
			signal: controller.signal,
			onProgress: ({ processedSec }) => {
				ultimo = processedSec;
			},
		});
		return { cancelou: false };
	} catch (error) {
		return {
			cancelou: (error as { code?: string }).code === "cancelled",
			paradoEmMs: Math.round(performance.now() - canceladoEm),
			segundosOuvidos: Math.round(ultimo),
			gravouCache: (await loadCachedLiveAnalysis(source)) !== null,
		};
	}
}

export function installLiveMapDevCheck(): void {
	if (process.env.NODE_ENV !== "development" || typeof window === "undefined") return;
	(window as unknown as { __mapaDaLive?: unknown }).__mapaDaLive = {
		conferir: conferirMapaDaLive,
		testarCancelar,
	};
}
