/**
 * Desenho do mapa da live num canvas (função pura sobre o contexto 2D).
 *
 * Cada coluna de pixel resume os quadros daquele pedaço da live:
 *  - barra espelhada com o volume (área de energia);
 *  - cinza onde é silêncio, dourado suave onde tem fala, dourado apagado
 *    onde é outro som (música, jogo);
 *  - marcadores dourados fortes nos gritos e pontos nos momentos fortes.
 */

import type { LiveAnalysis } from "@/services/live-analysis/format";
import type { TimeRange } from "@/services/live-analysis/silence";
import type { LiveSummary } from "@/services/live-analysis/summary";

export type MapColors = {
	goldRgb: string;
	goldClaro: string;
	muted: string;
	surface: string;
};

export function readMapColors(): MapColors {
	const css = getComputedStyle(document.documentElement);
	const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
	return {
		goldRgb: v("--tb-gold-rgb", "201, 169, 106"),
		goldClaro: v("--tb-gold-claro", "#f3dca2"),
		muted: v("--tb-text-muted", "#8a8f98"),
		surface: v("--tb-surface", "#16171a"),
	};
}

/** 0 = silêncio, 1 = fala, 2 = outro som */
export type ColumnData = {
	/** volume médio da coluna, 0 a 1 */
	level: Float32Array;
	/** volume mais alto da coluna, 0 a 1 */
	peak: Float32Array;
	kind: Uint8Array;
};

function insideRanges(ranges: TimeRange[], t: number): boolean {
	let lo = 0;
	let hi = ranges.length - 1;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		if (ranges[mid][1] <= t) lo = mid + 1;
		else if (ranges[mid][0] > t) hi = mid - 1;
		else return true;
	}
	return false;
}

/** Resume a análise em `columns` colunas (uma passada pelos quadros). */
export function buildColumns(
	analysis: LiveAnalysis,
	summary: LiveSummary,
	columns: number,
): ColumnData {
	const n = analysis.frameCount;
	const level = new Float32Array(columns);
	const peak = new Float32Array(columns);
	const kind = new Uint8Array(columns);
	const duration = analysis.durationSec;
	const hop = analysis.hopSec;
	const win = analysis.windowSec;
	// escala: do ruído de fundo até o volume mais alto da live
	// (rmsDb vem em dB×100: o máximo é procurado na mesma unidade)
	let maxDb100 = -12000;
	for (let i = 0; i < n; i++) if (analysis.rmsDb[i] > maxDb100) maxDb100 = analysis.rmsDb[i];
	const top = maxDb100 / 100;
	const bottom = Math.min(summary.noiseFloorDb, top - 20);
	const range = Math.max(6, top - bottom);

	for (let c = 0; c < columns; c++) {
		const t0 = (c / columns) * duration;
		const t1 = ((c + 1) / columns) * duration;
		let f0 = Math.floor((t0 - win / 2) / hop);
		let f1 = Math.ceil((t1 - win / 2) / hop);
		f0 = Math.max(0, Math.min(n - 1, f0));
		f1 = Math.max(f0 + 1, Math.min(n, f1));
		let best = -12000;
		let power = 0;
		for (let i = f0; i < f1; i++) {
			const v = analysis.rmsDb[i];
			if (v > best) best = v;
			power += 10 ** (v / 1000);
		}
		const meanDb = 10 * Math.log10(power / (f1 - f0));
		// curva para a fala não virar um bloco cheio e o grito se destacar
		peak[c] = Math.max(0, Math.min(1, (best / 100 - bottom) / range)) ** 1.7;
		level[c] = Math.max(0, Math.min(1, (meanDb - bottom) / range)) ** 1.7;
		const mid = (t0 + t1) / 2;
		kind[c] = insideRanges(summary.speech, mid)
			? 1
			: insideRanges(summary.silences, mid)
				? 0
				: 2;
	}
	return { level, peak, kind };
}

export function drawLiveMap({
	ctx,
	width,
	height,
	dpr,
	columns,
	summary,
	durationSec,
	colors,
}: {
	ctx: CanvasRenderingContext2D;
	/** em pixels do aparelho */
	width: number;
	height: number;
	dpr: number;
	columns: ColumnData;
	summary: LiveSummary;
	durationSec: number;
	colors: MapColors;
}): void {
	ctx.clearRect(0, 0, width, height);
	const mid = height / 2;
	const maxHalf = height / 2 - 3 * dpr;
	const n = columns.level.length;
	const colW = width / n;
	const gold = colors.goldRgb;

	// linha do centro
	ctx.fillStyle = `rgba(${gold}, 0.10)`;
	ctx.fillRect(0, Math.round(mid), width, Math.max(1, Math.round(dpr / 2)));

	const fills = [
		colors.muted, // silêncio
		`rgba(${gold}, 0.78)`, // fala
		`rgba(${gold}, 0.32)`, // outro som
	];
	// duas camadas: o pico (apagado) por trás e o volume médio na frente
	for (const layer of [columns.peak, columns.level]) {
		const front = layer === columns.level;
		for (let k = 0; k < 3; k++) {
			ctx.globalAlpha = (k === 0 ? 0.35 : 1) * (front ? 1 : 0.38);
			ctx.fillStyle = fills[k];
			ctx.beginPath();
			for (let c = 0; c < n; c++) {
				if (columns.kind[c] !== k) continue;
				const h = Math.max(dpr * 0.75, layer[c] * maxHalf);
				ctx.rect(c * colW, mid - h, Math.max(1, colW), h * 2);
			}
			ctx.fill();
		}
	}
	ctx.globalAlpha = 1;

	if (durationSec <= 0) return;
	const xOf = (t: number) => (t / durationSec) * width;

	// momentos fortes: ponto no alto, mais forte quanto maior a nota
	for (const p of summary.peaks) {
		const x = xOf(p.time);
		ctx.fillStyle = `rgba(${gold}, ${0.35 + 0.6 * p.score})`;
		ctx.beginPath();
		ctx.arc(x, 4 * dpr, (1.6 + 1.4 * p.score) * dpr, 0, Math.PI * 2);
		ctx.fill();
	}

	// gritos: traço dourado forte com losango no alto
	ctx.fillStyle = colors.goldClaro;
	ctx.strokeStyle = colors.goldClaro;
	ctx.lineWidth = Math.max(1, 1.25 * dpr);
	for (const s of summary.shouts) {
		const x = Math.round(xOf((s.start + s.end) / 2)) + 0.5;
		ctx.globalAlpha = 0.55;
		ctx.beginPath();
		ctx.moveTo(x, 8 * dpr);
		ctx.lineTo(x, height - 2 * dpr);
		ctx.stroke();
		ctx.globalAlpha = 1;
		const r = 3.2 * dpr;
		ctx.beginPath();
		ctx.moveTo(x, 4 * dpr - r + 3 * dpr);
		ctx.lineTo(x + r, 4 * dpr + 3 * dpr);
		ctx.lineTo(x, 4 * dpr + r + 3 * dpr);
		ctx.lineTo(x - r, 4 * dpr + 3 * dpr);
		ctx.closePath();
		ctx.fill();
	}
}
