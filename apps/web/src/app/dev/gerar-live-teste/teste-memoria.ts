// Teste interno (só desenvolvimento): faz o mesmo que a exportação faz com o áudio de um corte
// de 60 s tirado do meio da live de teste, mede a memória e confere a sincronia com o gabarito.

import { createTimelineAudioBuffer } from "@/media/audio";
import { processMediaAssets } from "@/media/processing";
import type { MediaAsset } from "@/media/types";
import { buildElementFromMedia } from "@/timeline/element-utils";
import type { SceneTracks, VideoElement } from "@/timeline/types";
import { mediaTimeFromSeconds, ZERO_MEDIA_TIME } from "@/wasm";
import { readMemorySnapshot } from "@/diagnostics/memory";
import { abrirArquivoGerado } from "./gerador";
import type { Gabarito, TipoBloco } from "./roteiro";

export type ResultadoTesteMemoria = {
	inicioSeg: number;
	duracaoSeg: number;
	tempoMs: number;
	memoriaAntesMb: number | null;
	memoriaPicoMb: number | null;
	amostrasSaida: number;
	/** janelas de 0,5 s cujo volume bate com o gabarito */
	acertoPct: number;
	janelas: number;
	/** atraso que melhor encaixa o áudio no gabarito (0 = sincronizado) */
	melhorAtrasoMs: number;
	/** diferença (ms) entre cada começo de fala/grito do gabarito e onde ele aparece no áudio exportado */
	inicios: number[];
	/** mediana das diferenças acima, em ms */
	atrasoMedianoMs: number | null;
};

const JANELA = 0.5;

function tipoNoTempo(gabarito: Gabarito, t: number): TipoBloco | null {
	for (const tipo of Object.keys(gabarito.intervalos) as TipoBloco[]) {
		for (const [inicio, fim] of gabarito.intervalos[tipo]) {
			if (t >= inicio && t < fim) return tipo;
		}
	}
	return null;
}

/** "alto" = fala ou grito; "baixo" = silêncio; música fica de fora (é baixa mas não é silêncio). */
function esperado(tipo: TipoBloco | null): "alto" | "baixo" | null {
	if (tipo === "fala" || tipo === "grito") return "alto";
	if (tipo === "silencio") return "baixo";
	return null;
}

function rmsDb(dados: Float32Array, inicio: number, fim: number): number {
	let soma = 0;
	const a = Math.max(0, inicio);
	const b = Math.min(dados.length, fim);
	for (let i = a; i < b; i++) soma += dados[i] * dados[i];
	const rms = Math.sqrt(soma / Math.max(1, b - a));
	return 20 * Math.log10(rms + 1e-9);
}

function mb(bytes: number | undefined): number | null {
	return typeof bytes === "number" ? Math.round(bytes / 1048576) : null;
}

export async function testarMemoriaDaExportacao({
	nomeVideo,
	inicioSeg,
	duracaoSeg = 60,
}: {
	nomeVideo: string;
	inicioSeg: number;
	duracaoSeg?: number;
}): Promise<ResultadoTesteMemoria> {
	const file = await abrirArquivoGerado(nomeVideo);
	const gabaritoArquivo = await abrirArquivoGerado(
		nomeVideo.replace(/\.(mp4|mkv)$/, ".gabarito.json"),
	);
	const gabarito = JSON.parse(await gabaritoArquivo.text()) as Gabarito;

	const [processado] = await processMediaAssets({ files: [file] });
	if (!processado?.duration) throw new Error("Não consegui ler a live de teste.");
	const asset = { ...processado, id: "teste-memoria" } as MediaAsset;

	const base = buildElementFromMedia({
		mediaId: asset.id,
		mediaType: asset.type,
		name: asset.name,
		duration: mediaTimeFromSeconds({ seconds: asset.duration ?? 0 }),
		startTime: ZERO_MEDIA_TIME,
	}) as Omit<VideoElement, "id">;
	const total = asset.duration ?? 0;
	const element: VideoElement = {
		...base,
		id: "corte-teste",
		startTime: ZERO_MEDIA_TIME,
		duration: mediaTimeFromSeconds({ seconds: duracaoSeg }),
		trimStart: mediaTimeFromSeconds({ seconds: inicioSeg }),
		trimEnd: mediaTimeFromSeconds({
			seconds: Math.max(0, total - inicioSeg - duracaoSeg),
		}),
	};
	const tracks: SceneTracks = {
		overlay: [],
		main: {
			id: "principal",
			name: "principal",
			type: "video",
			elements: [element],
			muted: false,
			hidden: false,
		},
		audio: [],
	};

	const antes = readMemorySnapshot();
	let pico = antes?.usedJSHeapSize ?? 0;
	const vigia = setInterval(() => {
		const agora = readMemorySnapshot();
		if (agora && agora.usedJSHeapSize > pico) pico = agora.usedJSHeapSize;
	}, 50);

	const t0 = performance.now();
	let buffer: AudioBuffer | null;
	try {
		buffer = await createTimelineAudioBuffer({
			tracks,
			mediaAssets: [asset],
			duration: mediaTimeFromSeconds({ seconds: duracaoSeg }),
		});
	} finally {
		clearInterval(vigia);
	}
	const tempoMs = Math.round(performance.now() - t0);
	const depois = readMemorySnapshot();
	if (depois && depois.usedJSHeapSize > pico) pico = depois.usedJSHeapSize;
	if (!buffer) throw new Error("A exportação não devolveu áudio.");

	const dados = buffer.getChannelData(0);
	const taxa = buffer.sampleRate;

	// confere janela a janela e procura o atraso que melhor encaixa (de -1 s a +1 s)
	const avaliar = (atrasoSeg: number) => {
		let acertos = 0;
		let janelas = 0;
		for (let t = 0; t + JANELA <= duracaoSeg; t += JANELA) {
			const tipo = esperado(tipoNoTempo(gabarito, inicioSeg + t + JANELA / 2));
			if (!tipo) continue;
			const ini = Math.round((t + atrasoSeg) * taxa);
			const db = rmsDb(dados, ini, ini + Math.round(JANELA * taxa));
			const medido = db > -40 ? "alto" : "baixo";
			janelas++;
			if (medido === tipo) acertos++;
		}
		return { acertos, janelas };
	};
	let melhor = { atraso: 0, acertos: -1, janelas: 0 };
	for (let ms = -1000; ms <= 1000; ms += 50) {
		const r = avaliar(ms / 1000);
		// empate: fica com o atraso mais perto de zero
		if (
			r.acertos > melhor.acertos ||
			(r.acertos === melhor.acertos && Math.abs(ms) < Math.abs(melhor.atraso))
		) {
			melhor = { atraso: ms, ...r };
		}
	}
	const semAtraso = avaliar(0);

	// precisão fina: cada começo de fala/grito (vindo de silêncio) no gabarito × no áudio (passo de 10 ms)
	const inicios: number[] = [];
	const passo = Math.round(0.01 * taxa);
	for (const tipo of ["fala", "grito"] as const) {
		for (const [ini] of gabarito.intervalos[tipo]) {
			const rel = ini - inicioSeg;
			if (rel < 0.5 || rel > duracaoSeg - 0.5) continue;
			if (tipoNoTempo(gabarito, ini - 0.05) !== "silencio") continue;
			const esperadoAmostra = Math.round(rel * taxa);
			let achou: number | null = null;
			for (let i = esperadoAmostra - Math.round(0.4 * taxa); i < esperadoAmostra + Math.round(0.4 * taxa); i += passo) {
				if (rmsDb(dados, i, i + passo) > -45) {
					achou = i;
					break;
				}
			}
			if (achou !== null) inicios.push(Math.round(((achou - esperadoAmostra) / taxa) * 1000));
		}
	}
	const ordenados = [...inicios].sort((x, y) => x - y);
	const atrasoMedianoMs = ordenados.length ? ordenados[Math.floor(ordenados.length / 2)] : null;

	return {
		inicios,
		atrasoMedianoMs,
		inicioSeg,
		duracaoSeg,
		tempoMs,
		memoriaAntesMb: mb(antes?.usedJSHeapSize),
		memoriaPicoMb: mb(pico),
		amostrasSaida: dados.length,
		acertoPct: semAtraso.janelas
			? Math.round((semAtraso.acertos / semAtraso.janelas) * 1000) / 10
			: 0,
		janelas: semAtraso.janelas,
		melhorAtrasoMs: melhor.atraso,
	};
}
