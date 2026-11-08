/**
 * Achar os silêncios da live a partir do volume de cada quadro (função pura).
 *
 *  - ruído de fundo = percentil 10 do volume (RMS) dos quadros com algum som
 *    (o silêncio digital — abertura muda, buraco preenchido com zeros — fica
 *    de fora, senão uma tela de "já volto" muda derrubaria o piso para -80 dB);
 *  - limiar = ruído de fundo + `deltaDb` (o controle de intensidade, 3 a 15 dB);
 *  - histerese: entra em silêncio abaixo do limiar e só sai acima de limiar + 2 dB;
 *  - só conta silêncio com pelo menos `minSilenceSec`;
 *  - deixa uma margem de `marginSec` de som em volta da fala;
 *  - trecho mantido menor que `minKeepSec` vira silêncio também.
 *
 * Roda em poucos milissegundos sobre o resultado da análise, para o controle
 * deslizante atualizar a prévia na hora.
 */

import { HOP_SEC, WINDOW_SEC } from "./format";

export type TimeRange = [start: number, end: number];

export type SilenceOptions = {
	/** quanto acima do ruído de fundo ainda é silêncio (dB); 3 a 15 */
	deltaDb: number;
	hysteresisDb: number;
	minSilenceSec: number;
	marginSec: number;
	minKeepSec: number;
	/** percentil do ruído de fundo (0 a 100) */
	floorPercentile: number;
};

export const DEFAULT_SILENCE_OPTIONS: SilenceOptions = {
	deltaDb: 8,
	hysteresisDb: 2,
	minSilenceSec: 0.6,
	marginSec: 0.15,
	minKeepSec: 0.3,
	floorPercentile: 10,
};

/** Ruído de fundo mais baixo aceito: abaixo disso é silêncio digital (porta de ruído). */
const FLOOR_MIN_DB = -80;
/** Quadros abaixo disso são silêncio digital (zeros): não entram no ruído de fundo. */
const DIGITAL_SILENCE_DB = -100;

export type SilenceResult = {
	noiseFloorDb: number;
	thresholdDb: number;
	silences: TimeRange[];
	keeps: TimeRange[];
};

export type RmsSeries = {
	/** dBFS ×100 por quadro */
	rmsDb: Int16Array;
	frameCount: number;
	durationSec: number;
	hopSec?: number;
	windowSec?: number;
};

/**
 * Percentil de valores em dB×100 por histograma de 0,1 dB (O(n), sem ordenar).
 * Devolve dB. Valores abaixo de `ignoreBelowDb` ficam de fora; se não sobrar
 * nenhum, devolve -120.
 */
export function percentileDb(
	values: Int16Array,
	p: number,
	count = values.length,
	ignoreBelowDb = Number.NEGATIVE_INFINITY,
): number {
	if (count === 0) return -120;
	const MIN = -1300; // −130 dB em décimos
	const MAX = 400; // +40 dB
	const cut = ignoreBelowDb * 100;
	const hist = new Uint32Array(MAX - MIN + 1);
	let used = 0;
	for (let i = 0; i < count; i++) {
		if (values[i] < cut) continue;
		let b = Math.round(values[i] / 10);
		if (b < MIN) b = MIN;
		else if (b > MAX) b = MAX;
		hist[b - MIN]++;
		used++;
	}
	if (used === 0) return -120;
	const target = Math.min(used - 1, Math.max(0, Math.floor((p / 100) * used)));
	let acc = 0;
	for (let b = 0; b < hist.length; b++) {
		acc += hist[b];
		if (acc > target) return (b + MIN) / 10;
	}
	return MAX / 10;
}

export function detectSilences(
	series: RmsSeries,
	options: Partial<SilenceOptions> = {},
): SilenceResult {
	const o = { ...DEFAULT_SILENCE_OPTIONS, ...options };
	const hop = series.hopSec ?? HOP_SEC;
	const win = series.windowSec ?? WINDOW_SEC;
	const n = series.frameCount;
	const duration = series.durationSec;
	const rms = series.rmsDb;

	const noiseFloorDb = Math.max(
		FLOOR_MIN_DB,
		percentileDb(rms, o.floorPercentile, n, DIGITAL_SILENCE_DB),
	);
	const thresholdDb = noiseFloorDb + o.deltaDb;
	const enter = thresholdDb * 100;
	const exit = (thresholdDb + o.hysteresisDb) * 100;

	// tempo da borda entre o quadro i-1 e o quadro i
	const edge = (i: number) =>
		i <= 0 ? 0 : i >= n ? duration : Math.min(duration, i * hop + win / 2 - hop / 2);

	const raw: TimeRange[] = [];
	let inSilence = false;
	let runStart = 0;
	for (let i = 0; i < n; i++) {
		const v = rms[i];
		if (!inSilence) {
			if (v < enter) {
				inSilence = true;
				runStart = i;
			}
		} else if (v > exit) {
			inSilence = false;
			raw.push([edge(runStart), edge(i)]);
		}
	}
	if (inSilence) raw.push([edge(runStart), duration]);

	// silêncio mínimo e margens (sem margem nas pontas da live)
	let silences: TimeRange[] = [];
	for (const [s, e] of raw) {
		if (e - s < o.minSilenceSec) continue;
		const a = s <= 0 ? 0 : s + o.marginSec;
		const b = e >= duration ? duration : e - o.marginSec;
		if (b - a > 0.001) silences.push([a, b]);
	}

	// trechos mantidos curtos demais viram silêncio (junta os vizinhos)
	if (o.minKeepSec > 0 && silences.length > 0) {
		const merged: TimeRange[] = [];
		let cursor = 0;
		for (const range of silences) {
			const last = merged[merged.length - 1];
			const keepLen = range[0] - (last ? last[1] : cursor);
			if (last && keepLen < o.minKeepSec) {
				last[1] = range[1];
			} else if (!last && range[0] > 0 && range[0] < o.minKeepSec) {
				merged.push([0, range[1]]);
			} else {
				merged.push([range[0], range[1]]);
			}
		}
		const last = merged[merged.length - 1];
		if (last && duration - last[1] > 0 && duration - last[1] < o.minKeepSec) {
			last[1] = duration;
		}
		silences = merged;
	}

	return { noiseFloorDb, thresholdDb, silences, keeps: complement(silences, duration) };
}

/** Trechos de [0, duração] que não estão em `ranges` (ordenados, sem sobreposição). */
export function complement(ranges: TimeRange[], duration: number): TimeRange[] {
	const out: TimeRange[] = [];
	let cursor = 0;
	for (const [s, e] of ranges) {
		if (s > cursor) out.push([cursor, s]);
		cursor = Math.max(cursor, e);
	}
	if (cursor < duration) out.push([cursor, duration]);
	return out;
}

/** Soma da duração da interseção entre duas listas ordenadas de intervalos. */
export function overlapSeconds(a: TimeRange[], b: TimeRange[]): number {
	let i = 0;
	let j = 0;
	let total = 0;
	while (i < a.length && j < b.length) {
		const s = Math.max(a[i][0], b[j][0]);
		const e = Math.min(a[i][1], b[j][1]);
		if (e > s) total += e - s;
		if (a[i][1] < b[j][1]) i++;
		else j++;
	}
	return total;
}

export function totalSeconds(ranges: TimeRange[]): number {
	let t = 0;
	for (const [s, e] of ranges) t += e - s;
	return t;
}
