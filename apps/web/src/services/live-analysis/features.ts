/**
 * Medidas de cada quadro do áudio (janela de 100 ms, salto de 50 ms, 16 kHz):
 * volume (RMS), pico, cruzamentos por zero, fluxo espectral, centróide e a
 * fração da energia na faixa da voz (300 Hz a 3 kHz).
 *
 * `FeatureAccumulator` recebe o áudio já em 16 kHz aos pedaços e guarda só os
 * números dos quadros (8 bytes por quadro). Puro: roda no Worker e no bun test.
 */

import {
	ANALYSIS_RATE,
	CENTROID_MAX_HZ,
	FORMAT_VERSION,
	HOP_SAMPLES,
	HOP_SEC,
	type LiveAnalysis,
	WINDOW_SAMPLES,
	WINDOW_SEC,
} from "./format";

const FFT_SIZE = 2048;
const FFT_LOG2 = 11;
const BINS = FFT_SIZE / 2 + 1;
const BIN_HZ = ANALYSIS_RATE / FFT_SIZE;
/** abaixo disso é zumbido/vento: fora do centróide e do total */
const MIN_BIN = Math.ceil(50 / BIN_HZ);
const VOICE_LO_BIN = Math.ceil(300 / BIN_HZ);
const VOICE_HI_BIN = Math.floor(3000 / BIN_HZ);
const DB_FLOOR = -120;

export type FrameFeatures = {
	rmsDb: number;
	peakDb: number;
	/** 0 a 1 */
	zcr: number;
	/** 0 a 1 (soma das subidas do espectro / soma do espectro) */
	flux: number;
	centroidHz: number;
	/** 0 a 1 */
	voiceRatio: number;
};

export function toDb(amplitude: number): number {
	return amplitude > 0 ? Math.max(DB_FLOOR, 20 * Math.log10(amplitude)) : DB_FLOOR;
}

/** Calcula as medidas de um quadro. Guarda o espectro anterior para o fluxo. */
export class FrameFeatureExtractor {
	private readonly hann: Float64Array;
	private readonly re = new Float64Array(FFT_SIZE);
	private readonly im = new Float64Array(FFT_SIZE);
	private readonly cos: Float64Array;
	private readonly sin: Float64Array;
	private readonly rev: Uint16Array;
	private readonly mag = new Float64Array(BINS);
	private readonly prevMag = new Float64Array(BINS);
	private hasPrev = false;

	constructor(windowSamples = WINDOW_SAMPLES) {
		this.hann = new Float64Array(windowSamples);
		for (let i = 0; i < windowSamples; i++) {
			this.hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (windowSamples - 1));
		}
		this.cos = new Float64Array(FFT_SIZE / 2);
		this.sin = new Float64Array(FFT_SIZE / 2);
		for (let i = 0; i < FFT_SIZE / 2; i++) {
			this.cos[i] = Math.cos((2 * Math.PI * i) / FFT_SIZE);
			this.sin[i] = -Math.sin((2 * Math.PI * i) / FFT_SIZE);
		}
		this.rev = new Uint16Array(FFT_SIZE);
		for (let i = 0; i < FFT_SIZE; i++) {
			let r = 0;
			for (let b = 0; b < FFT_LOG2; b++) r |= ((i >> b) & 1) << (FFT_LOG2 - 1 - b);
			this.rev[i] = r;
		}
	}

	reset(): void {
		this.hasPrev = false;
	}

	/** `samples[offset .. offset + janela)` em 16 kHz. */
	compute(samples: Float32Array, offset: number, out: FrameFeatures): FrameFeatures {
		const n = this.hann.length;
		const re = this.re;
		const im = this.im;
		const rev = this.rev;

		let sumSq = 0;
		let peak = 0;
		let crossings = 0;
		let prev = samples[offset];
		for (let i = 0; i < n; i++) {
			const v = samples[offset + i];
			sumSq += v * v;
			const a = v < 0 ? -v : v;
			if (a > peak) peak = a;
			if ((v >= 0) !== (prev >= 0)) crossings++;
			prev = v;
			const k = rev[i];
			re[k] = v * this.hann[i];
			im[k] = 0;
		}
		for (let i = n; i < FFT_SIZE; i++) {
			const k = rev[i];
			re[k] = 0;
			im[k] = 0;
		}
		this.fft();

		const mag = this.mag;
		let total = 0;
		let voice = 0;
		let magSum = 0;
		let weighted = 0;
		let rise = 0;
		for (let b = MIN_BIN; b < BINS; b++) {
			const r = re[b];
			const iv = im[b];
			const p = r * r + iv * iv;
			const m = Math.sqrt(p);
			mag[b] = m;
			total += p;
			if (b >= VOICE_LO_BIN && b <= VOICE_HI_BIN) voice += p;
			magSum += m;
			weighted += m * b * BIN_HZ;
			if (this.hasPrev) {
				const d = m - this.prevMag[b];
				if (d > 0) rise += d;
			}
		}
		this.prevMag.set(mag);
		const fluxValue = this.hasPrev && magSum > 1e-9 ? rise / magSum : 0;
		this.hasPrev = true;

		out.rmsDb = sumSq > 0 ? Math.max(DB_FLOOR, 10 * Math.log10(sumSq / n)) : DB_FLOOR;
		out.peakDb = toDb(peak);
		out.zcr = crossings / n;
		out.flux = Math.min(1, fluxValue);
		out.centroidHz = magSum > 1e-9 ? weighted / magSum : 0;
		out.voiceRatio = total > 1e-12 ? voice / total : 0;
		return out;
	}

	/** FFT radix-2 no lugar (a entrada já foi posta em ordem de bits invertidos). */
	private fft(): void {
		const re = this.re;
		const im = this.im;
		const cos = this.cos;
		const sin = this.sin;
		for (let size = 2; size <= FFT_SIZE; size <<= 1) {
			const half = size >> 1;
			const stride = FFT_SIZE / size;
			for (let start = 0; start < FFT_SIZE; start += size) {
				for (let k = 0; k < half; k++) {
					const wr = cos[k * stride];
					const wi = sin[k * stride];
					const a = start + k;
					const b = a + half;
					const xr = re[b] * wr - im[b] * wi;
					const xi = re[b] * wi + im[b] * wr;
					re[b] = re[a] - xr;
					im[b] = im[a] - xi;
					re[a] += xr;
					im[a] += xi;
				}
			}
		}
	}
}

function grow<T extends Int16Array | Uint8Array>(arr: T, size: number): T {
	if (arr.length >= size) return arr;
	let cap = Math.max(1024, arr.length);
	while (cap < size) cap *= 2;
	const next = new (arr.constructor as { new (n: number): T })(cap);
	next.set(arr);
	return next;
}

/**
 * Junta o áudio de 16 kHz em quadros e guarda as medidas.
 * Memória: a janela atual + 8 bytes por quadro (≈ 2,3 MB para 4 h).
 */
export class FeatureAccumulator {
	private readonly extractor = new FrameFeatureExtractor();
	private readonly features: FrameFeatures = {
		rmsDb: 0,
		peakDb: 0,
		zcr: 0,
		flux: 0,
		centroidHz: 0,
		voiceRatio: 0,
	};
	private pending = new Float32Array(WINDOW_SAMPLES * 4);
	private pendingLen = 0;
	frameCount = 0;
	private rmsDb: Int16Array;
	private peakDb: Int16Array;
	private zcr: Uint8Array;
	private flux: Uint8Array;
	private centroid: Uint8Array;
	private voice: Uint8Array;

	constructor(expectedFrames = 0) {
		const cap = Math.max(1024, Math.ceil(expectedFrames * 1.02) + 64);
		this.rmsDb = new Int16Array(cap);
		this.peakDb = new Int16Array(cap);
		this.zcr = new Uint8Array(cap);
		this.flux = new Uint8Array(cap);
		this.centroid = new Uint8Array(cap);
		this.voice = new Uint8Array(cap);
	}

	/** Recebe áudio mono em 16 kHz. */
	push(samples: Float32Array, count = samples.length): void {
		let read = 0;
		while (read < count) {
			const space = this.pending.length - this.pendingLen;
			const take = Math.min(space, count - read);
			this.pending.set(samples.subarray(read, read + take), this.pendingLen);
			this.pendingLen += take;
			read += take;
			this.processPending();
		}
	}

	/** Empurra `count` amostras de silêncio digital (buraco na gravação). */
	pushSilence(count: number): void {
		const zeros = new Float32Array(Math.min(count, 16_000));
		let left = count;
		while (left > 0) {
			const n = Math.min(left, zeros.length);
			this.push(zeros, n);
			left -= n;
		}
	}

	private processPending(): void {
		let offset = 0;
		while (this.pendingLen - offset >= WINDOW_SAMPLES) {
			this.extractor.compute(this.pending, offset, this.features);
			this.store(this.features);
			offset += HOP_SAMPLES;
		}
		if (offset > 0) {
			this.pending.copyWithin(0, offset, this.pendingLen);
			this.pendingLen -= offset;
		}
	}

	private store(f: FrameFeatures): void {
		const i = this.frameCount;
		if (i >= this.rmsDb.length) {
			this.rmsDb = grow(this.rmsDb, i + 1);
			this.peakDb = grow(this.peakDb, i + 1);
			this.zcr = grow(this.zcr, i + 1);
			this.flux = grow(this.flux, i + 1);
			this.centroid = grow(this.centroid, i + 1);
			this.voice = grow(this.voice, i + 1);
		}
		this.rmsDb[i] = Math.round(f.rmsDb * 100);
		this.peakDb[i] = Math.round(Math.min(f.peakDb, 300) * 100);
		this.zcr[i] = Math.round(Math.min(1, f.zcr) * 255);
		this.flux[i] = Math.round(Math.min(1, f.flux) * 255);
		this.centroid[i] = Math.round(Math.min(1, f.centroidHz / CENTROID_MAX_HZ) * 255);
		this.voice[i] = Math.round(Math.min(1, f.voiceRatio) * 255);
		this.frameCount = i + 1;
	}

	finish({
		durationSec,
		sourceRate,
		trackIndex,
		trackCount,
	}: {
		durationSec: number;
		sourceRate: number;
		trackIndex: number;
		trackCount: number;
	}): LiveAnalysis {
		// fecha o último pedaço com meia janela de silêncio
		const tail = this.pendingLen;
		if (tail > 0) this.pushSilence(Math.max(0, WINDOW_SAMPLES - tail));
		const n = this.frameCount;
		return {
			version: FORMAT_VERSION,
			hopSec: HOP_SEC,
			windowSec: WINDOW_SEC,
			analysisRate: ANALYSIS_RATE,
			sourceRate,
			trackIndex,
			trackCount,
			durationSec,
			frameCount: n,
			rmsDb: this.rmsDb.slice(0, n),
			peakDb: this.peakDb.slice(0, n),
			zcr: this.zcr.slice(0, n),
			flux: this.flux.slice(0, n),
			centroid: this.centroid.slice(0, n),
			voice: this.voice.slice(0, n),
		};
	}
}
