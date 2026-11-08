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

// ---------------------------------------------------------------------------
// Melhores momentos (passo 6): janelas com nota, sem sobreposição, até 60 s
// ---------------------------------------------------------------------------

/** Motivo curto de cada momento (a tela traduz pelo dicionário `moments.reason.*`). */
export type MomentReason = "shout" | "hype" | "reaction" | "talk" | "loud";

export type SuggestedMoment = {
	/** início e fim na live (segundos) */
	start: number;
	end: number;
	/** ponto mais forte do momento (segundos) */
	peak: number;
	/**
	 * nota de 0 a 100: relativa ao melhor da live, mas limitada por uma
	 * referência fixa (`strongScore`); uma live fraca não ganha tudo com 100
	 */
	score: number;
	reason: MomentReason;
	/** quantos gritos caem dentro do momento */
	shouts: number;
};

export type MomentOptions = {
	/** quantos momentos sugerir (5 a 20) */
	count: number;
	/** duração máxima de cada momento (s) */
	maxSec: number;
	/** duração mínima (s) */
	minSec: number;
	/** quanto do momento vem antes do ponto mais forte (0 a 1): o "contexto" */
	leadRatio: number;
	/** janela da nota (s) em volta do ponto */
	scoreWindowSec: number;
	/** quanto a borda pode andar para cair numa pausa (s) */
	snapSec: number;
	/** nota mínima da janela (absoluta) para virar momento: tira silêncio e trechos vazios */
	minWindowScore: number;
	/** nota da janela considerada "momento forte" (vale 100 mesmo se for o melhor de uma live fraca) */
	strongScore: number;
};

export const DEFAULT_MOMENT_OPTIONS: MomentOptions = {
	count: 10,
	maxSec: 60,
	minSec: 15,
	leadRatio: 0.6,
	scoreWindowSec: 12,
	snapSec: 8,
	minWindowScore: 0.6,
	strongScore: 3,
};

type MomentInput = Pick<
	LiveAnalysis,
	"rmsDb" | "peakDb" | "flux" | "centroid" | "voice" | "frameCount" | "durationSec"
> & { hopSec?: number; windowSec?: number };

type PerSecond = {
	secs: number;
	excite: Float32Array;
	variation: Float32Array;
	speech: Float32Array;
	loud: Float32Array;
	shoutBonus: Float32Array;
};

/**
 * Sugere os melhores momentos da live. Puro e rápido (lê só os números da
 * análise, uns 300 mil quadros em 4 h; nada de áudio).
 *
 * Nota por segundo = empolgação (z-score do volume contra a mediana de 60 s +
 * mudança brusca de som + pico estourando) + variação do volume + densidade
 * de fala + bônus forte para grito. A nota da janela é a média em
 * `scoreWindowSec` mais o melhor segundo; os máximos viram candidatos, e cada
 * momento escolhido bloqueia o trecho dele (sem sobreposição). As bordas
 * procuram uma pausa (silêncio) perto para começar e terminar.
 */
export function suggestMoments(
	a: MomentInput,
	{
		silences = [],
		shouts,
		levels,
		options = {},
	}: {
		silences?: TimeRange[];
		shouts?: ShoutEvent[];
		levels?: LocalLevels;
		options?: Partial<MomentOptions>;
	} = {},
): SuggestedMoment[] {
	const o = { ...DEFAULT_MOMENT_OPTIONS, ...options };
	o.count = Math.max(1, Math.min(50, Math.round(o.count)));
	o.maxSec = Math.max(5, o.maxSec);
	o.minSec = Math.min(o.minSec, o.maxSec);
	const hop = a.hopSec ?? HOP_SEC;
	const n = a.frameCount;
	const duration = a.durationSec;
	if (n === 0 || duration <= 0) return [];
	const lv = levels ?? localLevels(a);
	const sh = shouts ?? detectShouts(a, lv);
	const curve = excitementCurve(a, lv, { smoothSec: 0.5 });

	// --- medidas por segundo ---
	const secs = Math.max(1, Math.ceil(duration));
	const f: PerSecond = {
		secs,
		excite: new Float32Array(secs),
		variation: new Float32Array(secs),
		speech: new Float32Array(secs),
		loud: new Float32Array(secs),
		shoutBonus: new Float32Array(secs),
	};
	for (let s = 0; s < secs; s++) {
		const i0 = Math.round(s / hop);
		const i1 = Math.min(n, Math.round((s + 1) / hop));
		if (i1 <= i0) continue;
		let sumE = 0;
		let sum = 0;
		let sum2 = 0;
		let voiced = 0;
		let above = 0;
		for (let i = i0; i < i1; i++) {
			sumE += curve[i];
			const db = a.rmsDb[i] / 100;
			sum += db;
			sum2 += db * db;
			const rel = db - lv.median[i];
			if (rel > -3 && a.voice[i] >= 128) voiced++;
			if (rel > 6) above++;
		}
		const m = i1 - i0;
		f.excite[s] = sumE / m;
		const mean = sum / m;
		f.variation[s] = Math.sqrt(Math.max(0, sum2 / m - mean * mean));
		f.speech[s] = voiced / m;
		f.loud[s] = above / m;
	}
	for (const e of sh) {
		const s = Math.min(secs - 1, Math.max(0, Math.floor((e.start + e.end) / 2)));
		f.shoutBonus[s] += 3 + 3 * e.score;
	}

	const raw = new Float32Array(secs);
	for (let s = 0; s < secs; s++) {
		raw[s] =
			f.excite[s] +
			0.08 * Math.min(f.variation[s], 15) +
			0.6 * f.speech[s] +
			0.4 * f.loud[s] +
			f.shoutBonus[s];
	}

	// nota da janela: média em volta + o melhor segundo (soma acumulada)
	const half = Math.max(1, Math.round(o.scoreWindowSec / 2));
	const prefix = new Float64Array(secs + 1);
	for (let s = 0; s < secs; s++) prefix[s + 1] = prefix[s] + raw[s];
	const win = new Float32Array(secs);
	for (let s = 0; s < secs; s++) {
		const lo = Math.max(0, s - half);
		const hi = Math.min(secs, s + half + 1);
		win[s] = (prefix[hi] - prefix[lo]) / (hi - lo) + 0.35 * raw[s];
	}

	// candidatos: máximos locais, do melhor para o pior (abaixo do piso absoluto, nada)
	const cands: number[] = [];
	for (let s = 0; s < secs; s++) {
		const v = win[s];
		if (v < o.minWindowScore) continue;
		if ((s === 0 || v >= win[s - 1]) && (s === secs - 1 || v > win[s + 1])) cands.push(s);
	}
	cands.sort((x, y) => win[y] - win[x]);
	// curva plana (platô) quase não tem máximo local: se faltarem, completa com
	// os melhores segundos que sobraram (a regra de não sobrepor continua valendo)
	function* candidates(): Generator<number> {
		yield* cands;
		const rest: number[] = [];
		for (let s = 0; s < secs; s++) if (win[s] >= o.minWindowScore) rest.push(s);
		rest.sort((x, y) => win[y] - win[x]);
		yield* rest;
	}

	const lead = o.maxSec * o.leadRatio * 0.75;
	const tail = o.maxSec * (1 - o.leadRatio) * 0.75;
	const chosen: SuggestedMoment[] = [];
	const taken: TimeRange[] = [];
	const best = Math.max(cands.length > 0 ? win[cands[0]] : 1, o.strongScore);
	const minLen = Math.min(o.minSec, duration);
	const clampToTaken = (s: number, e: number, peak: number): TimeRange => {
		for (const [ts, te] of taken) {
			if (te <= peak && te > s) s = te;
			if (ts >= peak && ts < e) e = ts;
		}
		return [s, e];
	};
	for (const s of candidates()) {
		if (chosen.length >= o.count) break;
		const peak = Math.min(duration, s + 0.5);
		// o ponto forte e um pouco em volta precisam estar livres
		if (taken.some(([ts, te]) => peak - 3 < te && ts < peak + 3)) continue;
		let start = snapToPause(silences, Math.max(0, peak - lead), "start", o.snapSec, peak - 2);
		let end = snapToPause(silences, Math.min(duration, peak + tail), "end", o.snapSec, peak + 2);
		let clamped: TimeRange = clampToTaken(start, end, peak);
		// encostou num momento já escolhido: procura uma pausa dentro do espaço livre
		if (clamped[0] !== start) clamped[0] = snapToPause(silences, clamped[0], "start", o.snapSec, peak - 2, clamped[0]);
		if (clamped[1] !== end) clamped[1] = snapToPause(silences, clamped[1], "end", o.snapSec, peak + 2, clamped[1]);
		[start, end] = clamped;
		if (end - start > o.maxSec) {
			const over = end - start - o.maxSec;
			const cutStart = Math.min(over, Math.max(0, peak - start - 5));
			start += cutStart;
			end -= over - cutStart;
		}
		if (end - start < minLen) {
			const need = minLen - (end - start);
			let s0 = Math.max(0, start - need * o.leadRatio);
			let e0 = Math.min(duration, end + need * (1 - o.leadRatio));
			// encostou no começo/fim da live: o que faltou vai para o outro lado
			if (e0 - s0 < minLen) {
				if (s0 <= 0) e0 = Math.min(duration, s0 + minLen);
				else s0 = Math.max(0, e0 - minLen);
			}
			clamped = clampToTaken(s0, e0, peak);
			[start, end] = clamped;
			// espaço livre curto demais (entre dois momentos já escolhidos): pula
			if (end - start < minLen - 1e-6) continue;
		}
		chosen.push({
			start,
			end,
			peak,
			score: Math.max(1, Math.min(100, Math.round((100 * win[s]) / best))),
			reason: reasonFor(s, half, f),
			shouts: sh.filter((e) => e.start < end && e.end > start).length,
		});
		taken.push([start, end]);
	}
	return chosen;
}

/**
 * Move a borda para uma pausa próxima: o começo vai para o fim da pausa (logo
 * antes da fala), o fim vai para o começo dela. Não passa de `limit`.
 * `silences` em ordem de tempo.
 */
export function snapToPause(
	silences: TimeRange[],
	t: number,
	side: "start" | "end",
	maxMove: number,
	limit: number,
	/** opcional: a borda não pode ir para antes (começo) / depois (fim) deste ponto */
	bound?: number,
): number {
	let bestT = t;
	let bestD = Number.POSITIVE_INFINITY;
	let lo = 0;
	let hi = silences.length;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (silences[mid][1] < t - maxMove) lo = mid + 1;
		else hi = mid;
	}
	for (let k = lo; k < silences.length && silences[k][0] <= t + maxMove; k++) {
		const [s, e] = silences[k];
		const cand = side === "start" ? Math.max(s, e - 0.25) : Math.min(e, s + 0.25);
		if (side === "start" ? cand > limit : cand < limit) continue;
		if (bound !== undefined && (side === "start" ? cand < bound : cand > bound)) continue;
		const d = Math.abs(cand - t);
		if (d <= maxMove && d < bestD) {
			bestD = d;
			bestT = cand;
		}
	}
	return bestT;
}

function reasonFor(s: number, half: number, f: PerSecond): MomentReason {
	const lo = Math.max(0, s - half);
	const hi = Math.min(f.secs, s + half + 1);
	let shout = 0;
	let ex = 0;
	let va = 0;
	let sp = 0;
	let ld = 0;
	for (let k = lo; k < hi; k++) {
		shout += f.shoutBonus[k];
		ex += f.excite[k];
		va += f.variation[k];
		sp += f.speech[k];
		ld += f.loud[k];
	}
	const m = hi - lo;
	ex /= m;
	va /= m;
	sp /= m;
	ld /= m;
	if (shout > 0) return "shout";
	if (ld > 0.5 && sp < 0.3) return "loud";
	if (ex > 1.6 && va > 6) return "reaction";
	if (ex > 1.2) return "hype";
	return "talk";
}
