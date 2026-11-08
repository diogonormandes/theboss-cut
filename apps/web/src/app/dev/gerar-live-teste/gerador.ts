/**
 * Gerador da LIVE FALSA (ferramenta interna, só em desenvolvimento).
 *
 * Grava direto num arquivo do OPFS (StreamTarget → createWritable), um segundo
 * de cada vez: a memória fica fixa, seja a live de 1 minuto ou de 4 horas.
 */

import type { AudioCodec, StreamTargetChunk, VideoCodec } from "mediabunny";
import {
	type Bloco,
	FACECAM_RAIO,
	SintetizadorAudio,
	indiceDoBloco,
	montarGabarito,
	montarRoteiro,
	posicaoFacecam,
} from "./roteiro";

export const LARGURA = 320;
export const ALTURA = 180;
export const FPS = 10;
const BITRATE_VIDEO = 120_000;
const BITRATE_AUDIO = 48_000;

export type FormatoSaida = "mp4" | "mkv";

export type ProgressoGeracao = {
	/** 0 a 100 */
	pct: number;
	segundosGerados: number;
	segundosTotais: number;
	decorridoMs: number;
	bytes: number;
	fase: "preparando" | "gerando" | "finalizando";
};

export type ResultadoGeracao = {
	arquivo: string;
	arquivoGabarito: string;
	bytes: number;
	decorridoMs: number;
	videoCodec: VideoCodec;
	audioCodec: AudioCodec;
};

export class GeracaoCancelada extends Error {
	constructor() {
		super("Geração cancelada");
	}
}

export function nomesDosArquivos({
	minutos,
	formato,
}: {
	minutos: number;
	formato: FormatoSaida;
}): { arquivo: string; gabarito: string } {
	// a versão MKV tem 2 faixas de áudio e nome próprio (o gabarito também)
	const base = `live-teste-${minutos}min${formato === "mkv" ? "-2faixas" : ""}`;
	return { arquivo: `${base}.${formato}`, gabarito: `${base}.gabarito.json` };
}

const ORDEM_VIDEO: VideoCodec[] = ["avc", "vp9", "av1", "hevc", "vp8"];
const ORDEM_AUDIO: AudioCodec[] = ["aac", "opus"];

const CORES_FUNDO: Record<Bloco["tipo"], string> = {
	silencio: "#0b0d12",
	fala: "#11151d",
	grito: "#2b0f0f",
	musica: "#0e1a15",
};

const ROTULOS: Record<Bloco["tipo"], string> = {
	silencio: "SILÊNCIO",
	fala: "FALA",
	grito: "GRITO",
	musica: "MÚSICA",
};

function relogio(t: number): string {
	const decimos = Math.floor(t * 10 + 1e-6);
	const d = decimos % 10;
	const total = Math.floor(decimos / 10);
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = total % 60;
	const dois = (n: number) => String(n).padStart(2, "0");
	return `${dois(h)}:${dois(m)}:${dois(s)}.${d}`;
}

function desenharQuadro(
	ctx: OffscreenCanvasRenderingContext2D,
	t: number,
	bloco: Bloco,
): void {
	ctx.fillStyle = CORES_FUNDO[bloco.tipo];
	ctx.fillRect(0, 0, LARGURA, ALTURA);

	// contador de tempo grande
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillStyle = "#f4f1ea";
	ctx.font = "bold 32px monospace";
	ctx.fillText(relogio(t), 112, 78);

	ctx.fillStyle = "#d4af37";
	ctx.font = "bold 14px sans-serif";
	ctx.fillText(ROTULOS[bloco.tipo], 112, 116);

	ctx.fillStyle = "#6b6b6b";
	ctx.font = "10px sans-serif";
	ctx.fillText("LIVE DE TESTE", 112, 164);

	// "facecam": rosto simples que se move devagar no canto superior direito
	const { x, y } = posicaoFacecam(t);
	const cx = x * LARGURA;
	const cy = y * ALTURA;
	const r = FACECAM_RAIO * ALTURA;
	ctx.fillStyle = "#e9c98a";
	ctx.beginPath();
	ctx.arc(cx, cy, r, 0, Math.PI * 2);
	ctx.fill();
	ctx.fillStyle = "#16161a";
	ctx.beginPath();
	ctx.arc(cx - r * 0.35, cy - r * 0.2, r * 0.13, 0, Math.PI * 2);
	ctx.arc(cx + r * 0.35, cy - r * 0.2, r * 0.13, 0, Math.PI * 2);
	ctx.fill();
	// boca: abre na fala e muito no grito
	let abertura = 0.04;
	if (bloco.tipo === "fala") abertura = 0.08 + 0.12 * Math.abs(Math.sin(t * Math.PI * 4));
	if (bloco.tipo === "grito") abertura = 0.3;
	ctx.beginPath();
	ctx.ellipse(cx, cy + r * 0.4, r * 0.3, Math.max(1, r * abertura), 0, 0, Math.PI * 2);
	ctx.fill();
}

async function escolherCodecs({
	mb,
	format,
	taxa,
}: {
	mb: typeof import("mediabunny");
	format: InstanceType<typeof import("mediabunny").OutputFormat>;
	taxa: number;
}): Promise<{ videoCodec: VideoCodec; audioCodec: AudioCodec }> {
	const videoSuportados = format.getSupportedVideoCodecs();
	const audioSuportados = format.getSupportedAudioCodecs();
	const videoCodec = await mb.getFirstEncodableVideoCodec(
		ORDEM_VIDEO.filter((c) => videoSuportados.includes(c)),
		{ width: LARGURA, height: ALTURA, bitrate: BITRATE_VIDEO },
	);
	if (!videoCodec) {
		throw new Error("Este navegador não consegue codificar vídeo (WebCodecs).");
	}
	const audioCodec = await mb.getFirstEncodableAudioCodec(
		ORDEM_AUDIO.filter((c) => audioSuportados.includes(c)),
		{ numberOfChannels: 1, sampleRate: taxa, bitrate: BITRATE_AUDIO },
	);
	if (!audioCodec) {
		throw new Error(
			`Nenhum codec de áudio (AAC/Opus) aceita ${taxa} Hz mono aqui. Tente 48000 Hz.`,
		);
	}
	return { videoCodec, audioCodec };
}

const esperarTela = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export async function gerarLiveTeste({
	minutos,
	formato,
	taxa,
	semente,
	aoProgredir,
	deveCancelar,
}: {
	minutos: number;
	formato: FormatoSaida;
	taxa: number;
	semente: number;
	aoProgredir: (p: ProgressoGeracao) => void;
	deveCancelar: () => boolean;
}): Promise<ResultadoGeracao> {
	const mb = await import("mediabunny");
	const inicio = performance.now();
	const segundosTotais = Math.round(minutos * 60);
	const { arquivo, gabarito } = nomesDosArquivos({ minutos, formato });

	aoProgredir({
		pct: 0,
		segundosGerados: 0,
		segundosTotais,
		decorridoMs: 0,
		bytes: 0,
		fase: "preparando",
	});

	const format =
		formato === "mkv"
			? new mb.MkvOutputFormat()
			: new mb.Mp4OutputFormat({ fastStart: false });
	const { videoCodec, audioCodec } = await escolherCodecs({ mb, format, taxa });

	const raiz = await navigator.storage.getDirectory();
	const handle = await raiz.getFileHandle(arquivo, { create: true });
	const gravavel = await handle.createWritable({ keepExistingData: false });
	let bytes = 0;
	let destinoFechado = false;
	const destino = new WritableStream<StreamTargetChunk>({
		async write(pedaco) {
			await gravavel.write({
				type: "write",
				position: pedaco.position,
				data: pedaco.data,
			});
			bytes = Math.max(bytes, pedaco.position + pedaco.data.byteLength);
		},
		async close() {
			destinoFechado = true;
			await gravavel.close();
		},
		async abort(motivo) {
			destinoFechado = true;
			await gravavel.abort(motivo);
		},
	});

	const output = new mb.Output({
		format,
		target: new mb.StreamTarget(destino, { chunked: true, chunkSize: 4 << 20 }),
	});

	const canvas = new OffscreenCanvas(LARGURA, ALTURA);
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Canvas 2D indisponível.");

	const video = new mb.CanvasSource(canvas, {
		codec: videoCodec,
		bitrate: BITRATE_VIDEO,
		keyFrameInterval: 2,
	});
	output.addVideoTrack(video, { frameRate: FPS });

	const audioMistura = new mb.AudioSampleSource({
		codec: audioCodec,
		bitrate: BITRATE_AUDIO,
	});
	output.addAudioTrack(audioMistura, {
		name: formato === "mkv" ? "Mistura" : undefined,
		languageCode: "por",
	});
	const audioMicrofone =
		formato === "mkv"
			? new mb.AudioSampleSource({ codec: audioCodec, bitrate: BITRATE_AUDIO })
			: null;
	if (audioMicrofone) {
		output.addAudioTrack(audioMicrofone, { name: "Microfone", languageCode: "por" });
	}

	const blocos = montarRoteiro({ duracaoSeg: segundosTotais, semente });
	const sintetizador = new SintetizadorAudio({ blocos, taxa, semente });

	const desistir = async () => {
		try {
			await output.cancel();
		} catch {}
		if (!destinoFechado) {
			try {
				await gravavel.abort();
			} catch {}
		}
		try {
			await raiz.removeEntry(arquivo);
		} catch {}
	};

	try {
		await output.start();
		let ultimoAviso = 0;
		let indiceBloco = 0;

		for (let s = 0; s < segundosTotais; s++) {
			if (deveCancelar()) throw new GeracaoCancelada();

			// 1 s de áudio (buffers novos: o AudioSample não copia os dados)
			const mistura = new Float32Array(taxa);
			const microfone = audioMicrofone ? new Float32Array(taxa) : undefined;
			sintetizador.preencher({
				amostraInicial: s * taxa,
				saida: mistura,
				saidaMicrofone: microfone,
			});
			const amostra = new mb.AudioSample({
				data: mistura,
				format: "f32",
				numberOfChannels: 1,
				sampleRate: taxa,
				timestamp: s,
			});
			await audioMistura.add(amostra);
			amostra.close();
			if (audioMicrofone && microfone) {
				const amostraMic = new mb.AudioSample({
					data: microfone,
					format: "f32",
					numberOfChannels: 1,
					sampleRate: taxa,
					timestamp: s,
				});
				await audioMicrofone.add(amostraMic);
				amostraMic.close();
			}

			// 10 quadros de vídeo
			for (let q = 0; q < FPS; q++) {
				const t = s + q / FPS;
				while (indiceBloco < blocos.length - 1 && t >= blocos[indiceBloco].fim) {
					indiceBloco += 1;
				}
				desenharQuadro(ctx, t, blocos[indiceBloco]);
				await video.add(t, 1 / FPS);
			}

			const agora = performance.now();
			if (agora - ultimoAviso > 200) {
				ultimoAviso = agora;
				aoProgredir({
					pct: ((s + 1) / segundosTotais) * 100,
					segundosGerados: s + 1,
					segundosTotais,
					decorridoMs: agora - inicio,
					bytes,
					fase: "gerando",
				});
				await esperarTela();
			}
		}

		aoProgredir({
			pct: 100,
			segundosGerados: segundosTotais,
			segundosTotais,
			decorridoMs: performance.now() - inicio,
			bytes,
			fase: "finalizando",
		});
		await output.finalize();
	} catch (erro) {
		await desistir();
		throw erro;
	}

	// gabarito ao lado do vídeo
	const conteudo = montarGabarito({
		arquivo,
		semente,
		duracaoSeg: segundosTotais,
		blocos,
		rmsDb: sintetizador.rmsDbPorBloco(),
		video: { largura: LARGURA, altura: ALTURA, fps: FPS, codec: videoCodec },
		audio: {
			taxa,
			canais: 1,
			codec: audioCodec,
			faixas: audioMicrofone ? ["Mistura", "Microfone"] : ["Mistura"],
		},
	});
	const handleGabarito = await raiz.getFileHandle(gabarito, { create: true });
	const gravavelGabarito = await handleGabarito.createWritable({
		keepExistingData: false,
	});
	await gravavelGabarito.write(JSON.stringify(conteudo));
	await gravavelGabarito.close();

	return {
		arquivo,
		arquivoGabarito: gabarito,
		bytes,
		decorridoMs: performance.now() - inicio,
		videoCodec,
		audioCodec,
	};
}

export type ArquivoGerado = {
	nome: string;
	bytes: number;
	gabarito: string | null;
};

/** Lista as lives de teste já gravadas no OPFS. */
export async function listarLivesGeradas(): Promise<ArquivoGerado[]> {
	const raiz = await navigator.storage.getDirectory();
	const nomes: string[] = [];
	// TS ainda não tipa o iterador de diretórios em todas as versões da lib DOM
	const iteravel = raiz as unknown as {
		keys(): AsyncIterableIterator<string>;
	};
	for await (const nome of iteravel.keys()) {
		if (nome.startsWith("live-teste-")) nomes.push(nome);
	}
	const lista: ArquivoGerado[] = [];
	for (const nome of nomes) {
		if (!/\.(mp4|mkv)$/.test(nome)) continue;
		const arquivo = await (await raiz.getFileHandle(nome)).getFile();
		const gabarito = nome.replace(/\.(mp4|mkv)$/, ".gabarito.json");
		lista.push({
			nome,
			bytes: arquivo.size,
			gabarito: nomes.includes(gabarito) ? gabarito : null,
		});
	}
	return lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }));
}

/** Abre a live gravada como File (sem ler o conteúdo para a memória). */
export async function abrirArquivoGerado(nome: string): Promise<File> {
	const raiz = await navigator.storage.getDirectory();
	const bruto = await (await raiz.getFileHandle(nome)).getFile();
	const tipo = nome.endsWith(".mkv") ? "video/x-matroska" : "video/mp4";
	// novo File com o tipo certo; aponta para o mesmo conteúdo em disco
	return new File([bruto], nome, { type: tipo, lastModified: bruto.lastModified });
}

export async function apagarLiveGerada(nome: string): Promise<void> {
	const raiz = await navigator.storage.getDirectory();
	await raiz.removeEntry(nome);
	try {
		await raiz.removeEntry(nome.replace(/\.(mp4|mkv)$/, ".gabarito.json"));
	} catch {}
}
