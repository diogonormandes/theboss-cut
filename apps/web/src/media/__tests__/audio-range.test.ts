import { describe, expect, test } from "bun:test";
import {
	AUDIO_RANGE_PADDING_SECONDS,
	computeSourceRange,
	getRangeFrameCount,
	placeSampleInRange,
	rebaseTrimStart,
	type SourceRange,
} from "@/media/audio-range";
import { isLargeMedia, LARGE_MEDIA_BYTES } from "@/media/large-media";
import { getSourceTimeAtClipTime } from "@/retime/resolve";
import type { RetimeConfig } from "@/timeline";

const PAD = AUDIO_RANGE_PADDING_SECONDS;

describe("computeSourceRange", () => {
	test("corte sem velocidade: trimStart até trimStart + duração, com folga", () => {
		const range = computeSourceRange({ trimStart: 3600, duration: 60 });
		expect(range.start).toBeCloseTo(3600 - PAD, 9);
		expect(range.end).toBeCloseTo(3660 + PAD, 9);
	});

	test("começo da mídia: a folga não fica negativa", () => {
		const range = computeSourceRange({ trimStart: 0.2, duration: 5 });
		expect(range.start).toBe(0);
		expect(range.end).toBeCloseTo(5.2 + PAD, 9);
	});

	test("velocidade 2x usa o dobro da fonte", () => {
		const range = computeSourceRange({
			trimStart: 100,
			duration: 30,
			retime: { rate: 2 },
		});
		expect(range.end - PAD).toBeCloseTo(160, 9);
	});

	test("velocidade 0,5x usa metade da fonte", () => {
		const range = computeSourceRange({
			trimStart: 100,
			duration: 30,
			retime: { rate: 0.5 },
		});
		expect(range.end - PAD).toBeCloseTo(115, 9);
	});

	test("valores inválidos não quebram", () => {
		const range = computeSourceRange({
			trimStart: Number.NaN,
			duration: -1,
			padding: 0,
		});
		expect(range.start).toBe(0);
		expect(range.end).toBeGreaterThan(range.start);
	});

	test("conta de quadros do intervalo", () => {
		expect(
			getRangeFrameCount({ range: { start: 10, end: 70 }, sampleRate: 48000 }),
		).toBe(60 * 48000);
	});
});

describe("rebaseTrimStart", () => {
	test("buffer da mídia inteira (começa em 0) mantém o trimStart", () => {
		expect(rebaseTrimStart({ trimStart: 12.5, bufferStart: 0 })).toBe(12.5);
	});

	test("buffer do trecho: deslocamento relativo ao início do buffer", () => {
		expect(
			rebaseTrimStart({ trimStart: 3600, bufferStart: 3600 - PAD }),
		).toBeCloseTo(PAD, 9);
	});
});

describe("placeSampleInRange", () => {
	test("pedaço dentro do intervalo vai para o lugar do timestamp", () => {
		expect(
			placeSampleInRange({
				sampleTimestamp: 11,
				sampleFrames: 1024,
				sampleRate: 1000,
				rangeStart: 10,
				bufferLength: 5000,
			}),
		).toEqual({ srcFrameOffset: 0, destFrameOffset: 1000, frameCount: 1024 });
	});

	test("pedaço que começa antes do intervalo é cortado na frente", () => {
		expect(
			placeSampleInRange({
				sampleTimestamp: 9.9,
				sampleFrames: 1024,
				sampleRate: 1000,
				rangeStart: 10,
				bufferLength: 5000,
			}),
		).toEqual({ srcFrameOffset: 100, destFrameOffset: 0, frameCount: 924 });
	});

	test("pedaço que passa do fim é cortado atrás", () => {
		expect(
			placeSampleInRange({
				sampleTimestamp: 14.5,
				sampleFrames: 1024,
				sampleRate: 1000,
				rangeStart: 10,
				bufferLength: 5000,
			}),
		).toEqual({ srcFrameOffset: 0, destFrameOffset: 4500, frameCount: 500 });
	});

	test("pedaço todo fora do intervalo é ignorado", () => {
		expect(
			placeSampleInRange({
				sampleTimestamp: 20,
				sampleFrames: 1024,
				sampleRate: 1000,
				rangeStart: 10,
				bufferLength: 5000,
			}),
		).toBeNull();
		expect(
			placeSampleInRange({
				sampleTimestamp: 8,
				sampleFrames: 1024,
				sampleRate: 1000,
				rangeStart: 10,
				bufferLength: 5000,
			}),
		).toBeNull();
	});

	test("arredondamento de 1 amostra encaixa na continuação (sem buraco)", () => {
		expect(
			placeSampleInRange({
				sampleTimestamp: 10 + 1025 / 1000,
				sampleFrames: 1024,
				sampleRate: 1000,
				rangeStart: 10,
				bufferLength: 5000,
				expectedDestFrame: 1024,
			})?.destFrameOffset,
		).toBe(1024);
	});

	test("salto real no timestamp é respeitado (não encaixa)", () => {
		expect(
			placeSampleInRange({
				sampleTimestamp: 10 + 2000 / 1000,
				sampleFrames: 1024,
				sampleRate: 1000,
				rangeStart: 10,
				bufferLength: 5000,
				expectedDestFrame: 1024,
			})?.destFrameOffset,
		).toBe(2000);
	});
});

/**
 * Simula o caminho completo: a fonte é um sinal em que o valor de cada
 * amostra é o próprio tempo dela (em segundos). Ela chega em pedaços com
 * timestamp (como o mediabunny entrega), é montada só no intervalo do
 * elemento e depois mixada como `mixAudioChannels` faz. Cada amostra da
 * linha do tempo tem que trazer exatamente o tempo de fonte esperado.
 */
describe("sincronia: trecho decodificado cai no lugar certo da linha do tempo", () => {
	const SOURCE_RATE = 1000;
	const OUTPUT_RATE = 1000;
	const CHUNK_FRAMES = 1024;
	const SOURCE_SECONDS = 600;

	function assembleRange(range: SourceRange): Float32Array {
		const buffer = new Float32Array(
			getRangeFrameCount({ range, sampleRate: SOURCE_RATE }),
		);
		let expectedDestFrame: number | undefined;
		const totalFrames = SOURCE_SECONDS * SOURCE_RATE;
		// como sink.samples(start, end): só os pedaços que encostam no intervalo
		for (let first = 0; first < totalFrames; first += CHUNK_FRAMES) {
			const frames = Math.min(CHUNK_FRAMES, totalFrames - first);
			const timestamp = first / SOURCE_RATE;
			if (timestamp + frames / SOURCE_RATE <= range.start) continue;
			if (timestamp >= range.end) break;
			const placement = placeSampleInRange({
				sampleTimestamp: timestamp,
				sampleFrames: frames,
				sampleRate: SOURCE_RATE,
				rangeStart: range.start,
				bufferLength: buffer.length,
				expectedDestFrame,
			});
			if (!placement) continue;
			for (let i = 0; i < placement.frameCount; i++) {
				buffer[placement.destFrameOffset + i] =
					(first + placement.srcFrameOffset + i) / SOURCE_RATE;
			}
			expectedDestFrame = placement.destFrameOffset + placement.frameCount;
		}
		return buffer;
	}

	function mixElement({
		buffer,
		bufferStart,
		startTime,
		duration,
		trimStart,
		retime,
		timelineSeconds,
	}: {
		buffer: Float32Array;
		bufferStart: number;
		startTime: number;
		duration: number;
		trimStart: number;
		retime?: RetimeConfig;
		timelineSeconds: number;
	}): Float32Array {
		// mesma conta de `mixAudioChannels` em media/audio.ts
		const out = new Float32Array(timelineSeconds * OUTPUT_RATE).fill(-1);
		const bufferTrimStart = rebaseTrimStart({ trimStart, bufferStart });
		const outputStartSample = Math.floor(startTime * OUTPUT_RATE);
		const renderedLength = Math.ceil(duration * OUTPUT_RATE);
		for (let i = 0; i < renderedLength; i++) {
			const outputIndex = outputStartSample + i;
			if (outputIndex >= out.length) break;
			const clipTime = i / OUTPUT_RATE;
			const sourceIndex =
				(bufferTrimStart + getSourceTimeAtClipTime({ clipTime, retime })) *
				SOURCE_RATE;
			if (sourceIndex >= buffer.length) break;
			const lower = Math.floor(sourceIndex);
			const upper = Math.min(buffer.length - 1, lower + 1);
			const fraction = sourceIndex - lower;
			out[outputIndex] = buffer[lower] * (1 - fraction) + buffer[upper] * fraction;
		}
		return out;
	}

	function expectSync({
		startTime,
		duration,
		trimStart,
		retime,
	}: {
		startTime: number;
		duration: number;
		trimStart: number;
		retime?: RetimeConfig;
	}) {
		const range = computeSourceRange({ trimStart, duration, retime });
		const buffer = assembleRange(range);
		const out = mixElement({
			buffer,
			bufferStart: range.start,
			startTime,
			duration,
			trimStart,
			retime,
			timelineSeconds: Math.ceil(startTime + duration) + 1,
		});
		const rate = retime?.rate ?? 1;
		// primeira, do meio e última amostra do elemento
		const clipSamples = Math.ceil(duration * OUTPUT_RATE);
		for (const i of [0, 1, Math.floor(clipSamples / 2), clipSamples - 1]) {
			const timelineIndex = Math.floor(startTime * OUTPUT_RATE) + i;
			const expectedSourceTime = trimStart + (i / OUTPUT_RATE) * rate;
			expect(out[timelineIndex]).toBeCloseTo(expectedSourceTime, 3);
		}
		// antes do elemento não entra nada dele
		if (startTime > 0) {
			expect(out[Math.floor(startTime * OUTPUT_RATE) - 1]).toBe(-1);
		}
		// e o buffer é só do trecho, não da fonte inteira
		expect(buffer.length).toBeLessThan(
			Math.ceil((duration * rate + 2 * PAD) * SOURCE_RATE) + 2,
		);
	}

	test("corte no meio da fonte (trimStart > 0) em outro ponto da linha do tempo", () => {
		expectSync({ startTime: 5, duration: 60, trimStart: 300.25 });
	});

	test("elemento no começo da fonte e da linha do tempo", () => {
		expectSync({ startTime: 0, duration: 10, trimStart: 0 });
	});

	test("duas metades de um elemento dividido continuam o mesmo sinal", () => {
		// original: startTime 2, trimStart 100, 40 s → dividido em 15 s
		expectSync({ startTime: 2, duration: 15, trimStart: 100 });
		expectSync({ startTime: 17, duration: 25, trimStart: 115 });
	});

	test("com velocidade 2x", () => {
		expectSync({
			startTime: 3,
			duration: 20,
			trimStart: 250,
			retime: { rate: 2 },
		});
	});

	test("com velocidade 0,5x", () => {
		expectSync({
			startTime: 1,
			duration: 20,
			trimStart: 250.5,
			retime: { rate: 0.5 },
		});
	});

	test("áudio separado (mesma fonte do vídeo, mesmo trimStart) fica igual ao vídeo", () => {
		const video = { startTime: 4, duration: 30, trimStart: 420 };
		const separated = { ...video };
		expectSync(video);
		expectSync(separated);
	});
});

describe("isLargeMedia", () => {
	test("limite de ~200 MB", () => {
		expect(isLargeMedia({ size: LARGE_MEDIA_BYTES })).toBe(false);
		expect(isLargeMedia({ size: LARGE_MEDIA_BYTES + 1 })).toBe(true);
		expect(isLargeMedia({ size: 10 * 1024 ** 3 })).toBe(true);
		expect(isLargeMedia(null)).toBe(false);
	});
});
