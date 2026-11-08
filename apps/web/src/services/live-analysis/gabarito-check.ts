/**
 * Confere o mapa da live com o gabarito da live de teste (/dev/gerar-live-teste).
 * Usado pelo bun test e pela conferência interna no navegador (só desenvolvimento).
 */

import type { LiveAnalysis } from "./format";
import { detectShouts, localLevels } from "./moments";
import { detectSilences, overlapSeconds, type TimeRange, totalSeconds } from "./silence";

export type GabaritoIntervalos = Record<"silencio" | "fala" | "grito" | "musica", [number, number][]>;

export function conferirComGabarito(
	analise: LiveAnalysis,
	gabarito: GabaritoIntervalos,
) {
	const sil = detectSilences(analise);
	// silêncios do gabarito que o corte deveria achar (≥ 0,6 s), sem as margens
	const esperados = gabarito.silencio
		.filter(([s, e]) => e - s >= 0.6 + 0.3)
		.map(([s, e]) => [s + 0.2, e - 0.2] as TimeRange);
	const silencioAchadoPct = (100 * overlapSeconds(esperados, sil.silences)) / Math.max(1e-9, totalSeconds(esperados));
	const somAlto = [...gabarito.fala, ...gabarito.grito, ...gabarito.musica].sort((a, b) => a[0] - b[0]);
	const falaCortadaPct = (100 * overlapSeconds(somAlto, sil.silences)) / Math.max(1e-9, totalSeconds(somAlto));

	const levels = localLevels(analise);
	const gritos = detectShouts(analise, levels);
	const perto = (a: TimeRange, b: { start: number; end: number }) => a[0] < b.end + 0.3 && b.start < a[1] + 0.3;
	const gritosAchados = gabarito.grito.filter((g) => gritos.some((d) => perto(g, d))).length;
	const gritosCertos = gritos.filter((d) => gabarito.grito.some((g) => perto(g, d))).length;
	const erroInicioMs = gabarito.grito
		.map((g) => gritos.find((d) => perto(g, d)))
		.map((d, i) => (d ? Math.abs(d.start - gabarito.grito[i][0]) * 1000 : null))
		.filter((v): v is number => v !== null)
		.sort((a, b) => a - b);
	return {
		ruidoDb: sil.noiseFloorDb,
		silencioAchadoPct,
		falaCortadaPct,
		gritosGabarito: gabarito.grito.length,
		gritosDetectados: gritos.length,
		gritosAchados,
		gritosCertos,
		erroInicioGritoMedianoMs: erroInicioMs[Math.floor(erroInicioMs.length / 2)] ?? null,
	};
}
