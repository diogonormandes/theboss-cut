/**
 * Contas puras para decodificar só o trecho de áudio que um elemento usa.
 *
 * Sem dependência de DOM nem de mediabunny, para poder testar com bun:test.
 * Quem usa: `decodeAudioRange` em `media/audio.ts` (exportação, legenda) e o
 * `AudioManager` (prévia com velocidade/tom mantido).
 *
 * Convenção de tempo: tudo em segundos da FONTE (mesmo relógio dos
 * `timestamp` que o mediabunny devolve e que a prévia usa em
 * `runClipIterator`). O buffer decodificado começa em `range.start`, então a
 * amostra 0 do buffer = tempo `range.start` da fonte, e o deslocamento que a
 * mixagem usa passa a ser `trimStart - range.start`.
 */
import { getSourceTimeAtClipTime } from "@/retime/resolve";
import type { RetimeConfig } from "@/timeline";

/**
 * Folga em volta do trecho. Serve para a interpolação linear da mixagem e o
 * filtro do reamostrador/esticador terem amostras reais nas bordas (sem
 * "clique" no começo e no fim do corte).
 */
export const AUDIO_RANGE_PADDING_SECONDS = 0.5;

export interface SourceRange {
	/** início na fonte, em segundos (>= 0) */
	start: number;
	/** fim na fonte, em segundos (> start) */
	end: number;
}

/**
 * Intervalo da fonte que um elemento toca: de `trimStart` até
 * `trimStart + duração × velocidade`, com folga dos dois lados.
 */
export function computeSourceRange({
	trimStart,
	duration,
	retime,
	padding = AUDIO_RANGE_PADDING_SECONDS,
}: {
	/** segundos da fonte */
	trimStart: number;
	/** duração do elemento NA LINHA DO TEMPO, em segundos */
	duration: number;
	retime?: RetimeConfig;
	padding?: number;
}): SourceRange {
	const safeTrimStart = Math.max(0, Number.isFinite(trimStart) ? trimStart : 0);
	const safeDuration = Math.max(0, Number.isFinite(duration) ? duration : 0);
	const safePadding = Math.max(0, padding);
	const sourceSpan = getSourceTimeAtClipTime({
		clipTime: safeDuration,
		retime,
	});
	const start = Math.max(0, safeTrimStart - safePadding);
	const end = safeTrimStart + sourceSpan + safePadding;
	return { start, end: Math.max(end, start + 1e-3) };
}

/** Quantos quadros (amostras por canal) cabem no intervalo numa taxa. */
export function getRangeFrameCount({
	range,
	sampleRate,
}: {
	range: SourceRange;
	sampleRate: number;
}): number {
	return Math.max(1, Math.ceil((range.end - range.start) * sampleRate));
}

/**
 * Deslocamento (em segundos) a usar dentro do buffer decodificado, que começa
 * em `bufferStart` na fonte. Para buffer da mídia inteira, `bufferStart = 0`
 * e o resultado é o próprio `trimStart` (comportamento antigo).
 */
export function rebaseTrimStart({
	trimStart,
	bufferStart,
}: {
	trimStart: number;
	bufferStart: number;
}): number {
	return Math.max(0, trimStart - bufferStart);
}

export interface SamplePlacement {
	/** primeiro quadro do pedaço decodificado a copiar */
	srcFrameOffset: number;
	/** onde ele entra no buffer final */
	destFrameOffset: number;
	/** quantos quadros copiar */
	frameCount: number;
}

/**
 * Onde um pedaço decodificado (timestamp em segundos da fonte) entra no
 * buffer final que começa em `rangeStart`.
 *
 * O lugar vem do timestamp do pedaço (não da ordem de chegada), então um
 * pedaço que começa antes do intervalo é cortado na frente e um que passa do
 * fim é cortado atrás. `expectedDestFrame` é onde o pedaço anterior terminou:
 * se o timestamp arredondado cair a até `snapToleranceFrames` dele, usa-se a
 * continuação exata, para não abrir buraco nem sobrepor 1 amostra por causa
 * de arredondamento.
 */
export function placeSampleInRange({
	sampleTimestamp,
	sampleFrames,
	sampleRate,
	rangeStart,
	bufferLength,
	expectedDestFrame,
	snapToleranceFrames = 2,
}: {
	sampleTimestamp: number;
	sampleFrames: number;
	sampleRate: number;
	rangeStart: number;
	bufferLength: number;
	expectedDestFrame?: number;
	snapToleranceFrames?: number;
}): SamplePlacement | null {
	if (sampleFrames <= 0 || bufferLength <= 0) return null;

	let destStart = Math.round((sampleTimestamp - rangeStart) * sampleRate);
	if (
		expectedDestFrame !== undefined &&
		Math.abs(destStart - expectedDestFrame) <= snapToleranceFrames
	) {
		destStart = expectedDestFrame;
	}

	const srcFrameOffset = destStart < 0 ? -destStart : 0;
	const destFrameOffset = Math.max(0, destStart);
	const frameCount = Math.min(
		sampleFrames - srcFrameOffset,
		bufferLength - destFrameOffset,
	);
	if (frameCount <= 0) return null;

	return { srcFrameOffset, destFrameOffset, frameCount };
}
