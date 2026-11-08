/**
 * Mapa da live: formato do resultado da análise do áudio (Etapa 3, passo 3).
 *
 * Um quadro a cada 50 ms (janela de 100 ms) com números pequenos: 4 h de live
 * dão ~288 mil quadros ≈ 2,3 MB. É isso que vai para o OPFS em
 * `analysis/<chave>.bin` e que o mapa, o corte de silêncio e os momentos leem.
 *
 * Tudo aqui é puro (sem DOM): roda no Worker, na tela e no `bun test`.
 */

/** Taxa em que a análise trabalha (o áudio é reduzido para ela). */
export const ANALYSIS_RATE = 16_000;
/** Salto entre quadros, em amostras de 16 kHz (50 ms). */
export const HOP_SAMPLES = 800;
/** Tamanho da janela de cada quadro, em amostras de 16 kHz (100 ms). */
export const WINDOW_SAMPLES = 1600;
export const HOP_SEC = HOP_SAMPLES / ANALYSIS_RATE;
export const WINDOW_SEC = WINDOW_SAMPLES / ANALYSIS_RATE;

/** Maior centróide guardado (Hz); o Uint8 vai de 0 a este valor. */
export const CENTROID_MAX_HZ = 8000;

export const FORMAT_MAGIC = 0x414c4254; // "TBLA" em little-endian
/** 2: filtro do reamostrador de 64 pontos (resultados da versão 1 são refeitos). */
export const FORMAT_VERSION = 2;
const HEADER_BYTES = 64;

export type LiveAnalysis = {
	version: number;
	hopSec: number;
	windowSec: number;
	analysisRate: number;
	/** taxa original da faixa analisada */
	sourceRate: number;
	/** índice da faixa de áudio analisada (0 = primeira) */
	trackIndex: number;
	/** quantas faixas de áudio o arquivo tem */
	trackCount: number;
	durationSec: number;
	frameCount: number;
	/** volume médio (RMS) do quadro em dBFS ×100 */
	rmsDb: Int16Array;
	/** pico do quadro em dBFS ×100 */
	peakDb: Int16Array;
	/** cruzamentos por zero / amostra, 0–255 = 0–1 */
	zcr: Uint8Array;
	/** fluxo espectral normalizado, 0–255 = 0–1 */
	flux: Uint8Array;
	/** centróide espectral, 0–255 = 0–CENTROID_MAX_HZ */
	centroid: Uint8Array;
	/** fração da energia entre 300 Hz e 3 kHz (voz), 0–255 = 0–1 */
	voice: Uint8Array;
};

/** Meio do quadro `i`, em segundos. */
export function frameCenterSec(i: number, hopSec = HOP_SEC, windowSec = WINDOW_SEC): number {
	return i * hopSec + windowSec / 2;
}

/** Quadro cujo meio fica mais perto de `t` (segundos). */
export function frameAtSec(
	t: number,
	frameCount: number,
	hopSec = HOP_SEC,
	windowSec = WINDOW_SEC,
): number {
	const i = Math.round((t - windowSec / 2) / hopSec);
	return Math.max(0, Math.min(frameCount - 1, i));
}

export function centroidHz(value: number): number {
	return (value / 255) * CENTROID_MAX_HZ;
}

/** Nome do arquivo de cache: id do asset + tamanho + data + faixa. */
/** Id da mídia como aparece no nome do arquivo do cache. */
export function cleanAssetId(assetId: string): string {
	return assetId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
}

export function analysisKey({
	assetId,
	size,
	lastModified,
	trackIndex,
}: {
	assetId: string;
	size: number;
	lastModified: number;
	trackIndex: number;
}): string {
	const id = cleanAssetId(assetId);
	return `${id}-${size}-${Math.round(lastModified)}-t${trackIndex}`;
}

export function encodeAnalysis(a: LiveAnalysis): ArrayBuffer {
	const n = a.frameCount;
	const buffer = new ArrayBuffer(HEADER_BYTES + n * 8);
	const view = new DataView(buffer);
	view.setUint32(0, FORMAT_MAGIC, true);
	view.setUint16(4, FORMAT_VERSION, true);
	view.setUint16(6, HEADER_BYTES, true);
	view.setUint16(8, Math.round(a.hopSec * 1000), true);
	view.setUint16(10, Math.round(a.windowSec * 1000), true);
	view.setUint32(12, a.analysisRate, true);
	view.setUint32(16, a.sourceRate, true);
	view.setUint32(20, n, true);
	view.setFloat64(24, a.durationSec, true);
	view.setUint16(32, a.trackIndex, true);
	view.setUint16(34, a.trackCount, true);
	let offset = HEADER_BYTES;
	new Int16Array(buffer, offset, n).set(a.rmsDb.subarray(0, n));
	offset += n * 2;
	new Int16Array(buffer, offset, n).set(a.peakDb.subarray(0, n));
	offset += n * 2;
	for (const arr of [a.zcr, a.flux, a.centroid, a.voice]) {
		new Uint8Array(buffer, offset, n).set(arr.subarray(0, n));
		offset += n;
	}
	return buffer;
}

/** Lê o binário. Devolve null se o arquivo é de outra versão ou está estragado. */
export function decodeAnalysis(buffer: ArrayBuffer): LiveAnalysis | null {
	if (buffer.byteLength < HEADER_BYTES) return null;
	const view = new DataView(buffer);
	if (view.getUint32(0, true) !== FORMAT_MAGIC) return null;
	if (view.getUint16(4, true) !== FORMAT_VERSION) return null;
	const headerBytes = view.getUint16(6, true);
	const n = view.getUint32(20, true);
	if (buffer.byteLength !== headerBytes + n * 8) return null;
	let offset = headerBytes;
	const rmsDb = new Int16Array(buffer, offset, n);
	offset += n * 2;
	const peakDb = new Int16Array(buffer, offset, n);
	offset += n * 2;
	const bytes = () => {
		const arr = new Uint8Array(buffer, offset, n);
		offset += n;
		return arr;
	};
	const zcr = bytes();
	const flux = bytes();
	const centroid = bytes();
	const voice = bytes();
	return {
		version: FORMAT_VERSION,
		hopSec: view.getUint16(8, true) / 1000,
		windowSec: view.getUint16(10, true) / 1000,
		analysisRate: view.getUint32(12, true),
		sourceRate: view.getUint32(16, true),
		frameCount: n,
		durationSec: view.getFloat64(24, true),
		trackIndex: view.getUint16(32, true),
		trackCount: view.getUint16(34, true),
		rmsDb,
		peakDb,
		zcr,
		flux,
		centroid,
		voice,
	};
}
