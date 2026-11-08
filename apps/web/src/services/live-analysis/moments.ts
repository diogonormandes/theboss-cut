/**
 * Picos de empolgação e gritos (heurística, função pura).
 *
 *  - Referência local: mediana e percentis do volume numa janela móvel de 60 s
 *    (histograma de 0,5 dB, recalculado a cada 1 s).
 *  - Empolgação por quadro: z-score do volume contra a mediana local, mais o
 *    fluxo espectral (mudança brusca de som) e um bônus para pico quase estourando.
 *    Suavizada em 1 s; os picos são os máximos locais, separados por `minGapSec`.
 *  - Grito: volume acima do percentil 98 local (com folga), bem acima da
 *    mediana, centróide alto (som "brilhante") e duração curta (menos de 2 s).
 */

import { centroidHz, HOP_SEC, type LiveAnalysis, WINDOW_SEC } from "./format";
import type { TimeRange } from "./silence";

const BIN_DB = 0.5;
const HIST_MIN_DB = -120;
const HIST_BINS = Math.round((20 - HIST_MIN_DB) / BIN_DB) + 1;

export type LocalLevels = {
	/** mediana local (dB) por quadro */
	median: Float32Array;
	/** percentil 90 local (dB) por quadro */
	p90: Float32Array;
	/** percentil 98 local (dB) por quadro */
	p98: Float32Array;
};

type Series = Pick<LiveAnalysis, "rmsDb" | "frameCount"> & {
	hopSec?: number;
};

function binOf(value: number): number {
	const b = Math.round((value / 100 - HIST_MIN_DB) / BIN_DB);
	return b < 0 ? 0 : b >= HIST_BINS ? HIST_BINS - 1 : b;
}

/** Mediana, p90 e p98 do volume numa janela móvel centrada de `windowSec`. */
export function localLevels(
	series: Series,
	{ windowSec = 60, strideSec = 1 }: { windowSec?: number; strideSec?: number } = {},
): LocalLevels {
	const n = series.frameCount;
	const hop = series.hopSec ?? HOP_SEC;
	const rms = series.rmsDb;
	const half = Math.max(1, Math.round(windowSec / hop / 2));
	const stride = Math.max(1, Math.round(strideSec / hop));
	const median = new Float32Array(n);
	const p90 = new Float32Array(n);
	const p98 = new Float32Array(n);
	const hist = new Uint32Array(HIST_BINS);
	let lo = 0; // janela atual = [lo, hi)
	let hi = 0;

	for (let c = 0; c < n; c += stride) {
		const wantLo = Math.max(0, c - half);
		const wantHi = Math.min(n, c + half);
		while (hi < wantHi) hist[binOf(rms[hi++])]++;
		while (lo < wantLo) hist[binOf(rms[lo++])]--;
		const count = hi - lo;
		const t50 = Math.floor(count * 0.5);
		const t90 = Math.floor(count * 0.9);
		const t98 = Math.floor(count * 0.98);
		let acc = 0;
		let m = HIST_MIN_DB;
		let q90 = HIST_MIN_DB;
		let q98 = HIST_MIN_DB;
		let found = 0;
		for (let b = 0; b < HIST_BINS && found < 3; b++) {
			const before = acc;
			acc += hist[b];
			const db = HIST_MIN_DB + b * BIN_DB;
			if (before <= t50 && acc > t50) {
				m = db;
				found++;
			}
			if (before <= t90 && acc > t90) {
				q90 = db;
				found++;
			}
			if (before <= t98 && acc > t98) {
				q98 = db;
				found++;
			}
		}
		const end = Math.min(n, c + stride);
		median.fill(m, c, end);
		p90.fill(q90, c, end);
		p98.fill(q98, c, end);
	}
	return { median, p90, p98 };
}

export type ShoutEvent = {
	start: number;
	end: number;
	/** volume mais alto do grito (dB) */
	peakDb: number;
	/** 0 a 1 */
	score: number;
};

export type ShoutOptions = {
	/** folga abaixo do p98 local (dB) */
	p98SlackDb: number;
	/** quanto acima da mediana local precisa estar (dB) */
	aboveMedianDb: number;
	/** centróide mínimo (Hz) */
	minCentroidHz: number;
	/**
	 * o centróide também precisa passar desta fração do centróide típico da
	 * fala da própria live (cada voz e cada microfone têm o seu "brilho")
	 */
	centroidRatio: number;
	minDurationSec: number;
	maxDurationSec: number;
	/** buracos menores que isso dentro de um grito são ignorados */
	bridgeSec: number;
};

export const DEFAULT_SHOUT_OPTIONS: ShoutOptions = {
	p98SlackDb: 3,
	aboveMedianDb: 6,
	minCentroidHz: 1300,
	centroidRatio: 1.35,
	minDurationSec: 0.2,
	maxDurationSec: 2,
	bridgeSec: 0.25,
};

export function detectShouts(
	a: Pick<LiveAnalysis, "rmsDb" | "frameCount" | "centroid" | "durationSec"> & {
		hopSec?: number;
		windowSec?: number;
	},
	levels: LocalLevels = localLevels(a),
	options: Partial<ShoutOptions> = {},
): ShoutEvent[] {
	const o = { ...DEFAULT_SHOUT_OPTIONS, ...options };
	const hop = a.hopSec ?? HOP_SEC;
	const win = a.windowSec ?? WINDOW_SEC;
	const n = a.frameCount;
	const bridge = Math.round(o.bridgeSec / hop);
	const minCentroid = Math.max(
		o.minCentroidHz,
		typicalLoudCentroidHz(a, levels) * o.centroidRatio,
	);
	const events: ShoutEvent[] = [];
	let runStart = -1;
	let lastHit = -1;
	let runPeak = -120;

	const close = () => {
		if (runStart < 0) return;
		const start = runStart * hop + win / 2 - hop / 2;
		const end = Math.min(a.durationSec, lastHit * hop + win / 2 + hop / 2);
		const dur = end - start;
		if (dur >= o.minDurationSec && dur <= o.maxDurationSec) {
			events.push({ start, end, peakDb: runPeak, score: 0 });
		}
		runStart = -1;
		runPeak = -120;
	};

	for (let i = 0; i < n; i++) {
		const db = a.rmsDb[i] / 100;
		const hit =
			db >= levels.p98[i] - o.p98SlackDb &&
			db >= levels.median[i] + o.aboveMedianDb &&
			centroidHz(a.centroid[i]) >= minCentroid;
		if (hit) {
			if (runStart < 0) runStart = i;
			lastHit = i;
			if (db > runPeak) runPeak = db;
		} else if (runStart >= 0 && i - lastHit > bridge) {
			close();
		}
	}
	close();

	// nota: quanto acima da mediana local, de 8 dB (0) a 30 dB (1)
	for (const e of events) {
		const i = Math.min(n - 1, Math.max(0, Math.round((e.start + e.end) / 2 / hop)));
		const above = e.peakDb - levels.median[i];
		e.score = Math.max(0, Math.min(1, (above - 8) / 22));
	}
	return events;
}

/** Mediana do centróide dos quadros com som (acima da mediana local + 3 dB). */
export function typicalLoudCentroidHz(
	a: Pick<LiveAnalysis, "rmsDb" | "frameCount" | "centroid">,
	levels: LocalLevels,
): number {
	const hist = new Uint32Array(256);
	let count = 0;
	for (let i = 0; i < a.frameCount; i++) {
		if (a.rmsDb[i] / 100 >= levels.median[i] + 3) {
			hist[a.centroid[i]]++;
			count++;
		}
	}
	if (count === 0) return 0;
	let acc = 0;
	for (let b = 0; b < 256; b++) {
		acc += hist[b];
		if (acc > count / 2) return centroidHz(b);
	}
	return 0;
}

export type ExcitementPeak = {
	time: number;
	/** 0 a 1 */
	score: number;
};

/**
 * Empolgação por quadro (suavizada em `smoothSec`). Valores típicos de 0 a 4.
 */
export function excitementCurve(
	a: Pick<LiveAnalysis, "rmsDb" | "peakDb" | "flux" | "frameCount"> & { hopSec?: number },
	levels: LocalLevels = localLevels(a),
	{ smoothSec = 1 }: { smoothSec?: number } = {},
): Float32Array {
	const n = a.frameCount;
	const hop = a.hopSec ?? HOP_SEC;
	const raw = new Float32Array(n);
	for (let i = 0; i < n; i++) {
		const db = a.rmsDb[i] / 100;
		const spread = Math.max(3, (levels.p90[i] - levels.median[i]) / 1.28);
		const z = (db - levels.median[i]) / spread;
		let s = z > 0 ? z : 0;
		s += 1.5 * (a.flux[i] / 255);
		if (a.peakDb[i] > -100) s += 1; // pico acima de −1 dBFS
		raw[i] = s;
	}
	// média móvel por soma acumulada
	const w = Math.max(1, Math.round(smoothSec / hop));
	const prefix = new Float64Array(n + 1);
	for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + raw[i];
	const out = new Float32Array(n);
	const h = w >> 1;
	for (let i = 0; i < n; i++) {
		const lo = Math.max(0, i - h);
		const hi = Math.min(n, i + h + 1);
		out[i] = (prefix[hi] - prefix[lo]) / (hi - lo);
	}
	return out;
}

/** Os `maxPeaks` maiores máximos locais da empolgação, separados por `minGapSec`. */
export function excitementPeaks(
	curve: Float32Array,
	{
		hopSec = HOP_SEC,
		windowSec = WINDOW_SEC,
		minGapSec = 20,
		minScore = 1.5,
		maxPeaks = 60,
	}: {
		hopSec?: number;
		windowSec?: number;
		minGapSec?: number;
		minScore?: number;
		maxPeaks?: number;
	} = {},
): ExcitementPeak[] {
	const n = curve.length;
	const candidates: number[] = [];
	for (let i = 1; i < n - 1; i++) {
		const v = curve[i];
		if (v >= minScore && v >= curve[i - 1] && v > curve[i + 1]) candidates.push(i);
	}
	candidates.sort((x, y) => curve[y] - curve[x]);
	const gap = Math.round(minGapSec / hopSec);
	const chosen: number[] = [];
	for (const i of candidates) {
		if (chosen.length >= maxPeaks) break;
		if (chosen.every((j) => Math.abs(j - i) >= gap)) chosen.push(i);
	}
	const best = chosen.length > 0 ? curve[chosen[0]] : 1;
	return chosen
		.sort((x, y) => x - y)
		.map((i) => ({
			time: i * hopSec + windowSec / 2,
			score: Math.max(0, Math.min(1, curve[i] / best)),
		}));
}

/** Quadros com voz (para o desenho): volume acima do limiar e energia na faixa da voz. */
export function speechRanges(
	a: Pick<LiveAnalysis, "rmsDb" | "voice" | "frameCount" | "durationSec"> & {
		hopSec?: number;
		windowSec?: number;
	},
	thresholdDb: number,
	{ minVoiceRatio = 0.5, bridgeSec = 0.4 }: { minVoiceRatio?: number; bridgeSec?: number } = {},
): TimeRange[] {
	const hop = a.hopSec ?? HOP_SEC;
	const win = a.windowSec ?? WINDOW_SEC;
	const n = a.frameCount;
	const limit = thresholdDb * 100;
	const minVoice = minVoiceRatio * 255;
	const bridge = Math.round(bridgeSec / hop);
	const out: TimeRange[] = [];
	let start = -1;
	let last = -1;
	for (let i = 0; i < n; i++) {
		const hit = a.rmsDb[i] > limit && a.voice[i] >= minVoice;
		if (hit) {
			if (start < 0) start = i;
			last = i;
		} else if (start >= 0 && i - last > bridge) {
			out.push([start * hop + win / 2 - hop / 2, Math.min(a.durationSec, last * hop + win / 2 + hop / 2)]);
			start = -1;
		}
	}
	if (start >= 0) {
		out.push([start * hop + win / 2 - hop / 2, Math.min(a.durationSec, last * hop + win / 2 + hop / 2)]);
	}
	return out;
}
