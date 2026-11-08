/**
 * Junta o que o mapa da live desenha, a partir do resultado da análise:
 * silêncios, trechos com voz, gritos e picos de empolgação. Puro e rápido
 * (dezenas de milissegundos para 4 h), roda uma vez por análise.
 */

import type { LiveAnalysis } from "./format";
import {
	detectShouts,
	type ExcitementPeak,
	excitementCurve,
	excitementPeaks,
	localLevels,
	type ShoutEvent,
	speechRanges,
} from "./moments";
import { detectSilences, type SilenceOptions, type TimeRange, totalSeconds } from "./silence";

export type LiveSummary = {
	noiseFloorDb: number;
	thresholdDb: number;
	silences: TimeRange[];
	speech: TimeRange[];
	shouts: ShoutEvent[];
	peaks: ExcitementPeak[];
	silenceSec: number;
};

export function summarizeLive(
	analysis: LiveAnalysis,
	silenceOptions: Partial<SilenceOptions> = {},
): LiveSummary {
	const silence = detectSilences(analysis, silenceOptions);
	const levels = localLevels(analysis);
	const shouts = detectShouts(analysis, levels);
	const curve = excitementCurve(analysis, levels);
	const maxPeaks = Math.max(10, Math.min(80, Math.round(analysis.durationSec / 300)));
	const peaks = excitementPeaks(curve, {
		hopSec: analysis.hopSec,
		windowSec: analysis.windowSec,
		maxPeaks,
	});
	return {
		noiseFloorDb: silence.noiseFloorDb,
		thresholdDb: silence.thresholdDb,
		silences: silence.silences,
		speech: speechRanges(analysis, silence.thresholdDb + 4),
		shouts,
		peaks,
		silenceSec: totalSeconds(silence.silences),
	};
}
