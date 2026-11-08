import { describe, expect, test } from "bun:test";
import {
	SintetizadorAudio,
	intervalosPorTipo,
	montarRoteiro,
} from "@/app/dev/gerar-live-teste/roteiro";
import { FeatureAccumulator } from "../features";
import { HOP_SEC } from "../format";
import { detectShouts, localLevels, snapToPause, suggestMoments } from "../moments";
import { StreamingResampler } from "../resampler";
import { detectSilences, type TimeRange } from "../silence";

/** Série sintética: fala com pausas, com alguns trechos especiais. */
function sinal(durSec: number) {
	const n = Math.round(durSec / HOP_SEC);
	const rmsDb = new Int16Array(n);
	const peakDb = new Int16Array(n);
	const flux = new Uint8Array(n);
	const centroid = new Uint8Array(n);
	const voice = new Uint8Array(n);
	for (let i = 0; i < n; i++) {
		const sec = i * HOP_SEC;
		const pausa = sec % 12 > 10.5; // pausa de 1,5 s a cada 12 s
		rmsDb[i] = (pausa ? -55 : i % 10 < 7 ? -24 : -34) * 100;
		peakDb[i] = rmsDb[i] + 600;
		centroid[i] = Math.round((900 / 8000) * 255);
		voice[i] = pausa ? 40 : 200;
		flux[i] = pausa ? 5 : 30;
	}
	const grito = (sec: number, dur: number) => {
		for (let i = Math.round(sec / HOP_SEC); i < Math.round((sec + dur) / HOP_SEC); i++) {
			rmsDb[i] = -8 * 100;
			peakDb[i] = -2 * 100;
			centroid[i] = Math.round((2400 / 8000) * 255);
			flux[i] = 200;
		}
	};
	const empolgado = (sec: number, dur: number) => {
		for (let i = Math.round(sec / HOP_SEC); i < Math.round((sec + dur) / HOP_SEC); i++) {
			rmsDb[i] = (i % 6 < 3 ? -12 : -20) * 100;
			flux[i] = 160;
		}
	};
	return { rmsDb, peakDb, flux, centroid, voice, frameCount: n, durationSec: n * HOP_SEC, grito, empolgado };
}

describe("melhores momentos (sinal sintético)", () => {
	test("acha gritos e trechos empolgados, sem sobrepor, até 60 s", () => {
		const s = sinal(30 * 60);
		const gritos = [130, 400, 777, 1200, 1650];
		for (const g of gritos) s.grito(g, 1);
		s.empolgado(950, 15);
		s.empolgado(1450, 20);
		const silences = detectSilences(s).silences;
		const t0 = performance.now();
		const m = suggestMoments(s, { silences, options: { count: 10 } });
		const ms = performance.now() - t0;
		console.log(`[momentos sintético] ${m.length} em ${ms.toFixed(1)} ms`, m.slice(0, 8).map((x) => `${x.reason}@${x.peak.toFixed(0)}:${x.score}`).join(" "));

		expect(m.length).toBe(10);
		// os 7 eventos aparecem entre os 7 primeiros
		const top = m.slice(0, 7);
		for (const g of gritos) expect(top.some((x) => x.start <= g && x.end >= g + 1)).toBe(true);
		for (const e of [957, 1460]) expect(top.some((x) => x.start <= e && x.end >= e)).toBe(true);
		expect(top.filter((x) => x.reason === "shout").length).toBe(5);
		// limites
		for (const x of m) {
			expect(x.end - x.start).toBeLessThanOrEqual(60 + 1e-6);
			expect(x.end - x.start).toBeGreaterThanOrEqual(15 - 1e-6);
			expect(x.score).toBeGreaterThanOrEqual(1);
			expect(x.score).toBeLessThanOrEqual(100);
		}
		expect(m[0].score).toBe(100);
		const ord = [...m].sort((a, b) => a.start - b.start);
		for (let i = 1; i < ord.length; i++) expect(ord[i].start).toBeGreaterThanOrEqual(ord[i - 1].end - 1e-6);
		// a maioria das bordas cai numa pausa
		const naPausa = (t: number) => silences.some(([a, b]) => t >= a - 0.01 && t <= b + 0.01);
		const bordas = m.flatMap((x) => [x.start, x.end]);
		expect(bordas.filter(naPausa).length / bordas.length).toBeGreaterThan(0.8);
	});

	test("quantidade ajustável e live sem nada", () => {
		const s = sinal(20 * 60);
		expect(suggestMoments(s, { options: { count: 5 } }).length).toBe(5);
		expect(suggestMoments(s, { options: { count: 20 } }).length).toBe(20);
		expect(suggestMoments({ ...s, frameCount: 0, durationSec: 0 })).toEqual([]);
	});

	test("live fraca: silêncio não vira momento e fala comum não ganha 100", () => {
		const serie = (durSec: number, f: (i: number, sec: number) => [number, number, number]) => {
			const n = Math.round(durSec / HOP_SEC);
			const rmsDb = new Int16Array(n);
			const peakDb = new Int16Array(n);
			const flux = new Uint8Array(n);
			const centroid = new Uint8Array(n).fill(29);
			const voice = new Uint8Array(n);
			for (let i = 0; i < n; i++) {
				const [r, fl, v] = f(i, i * HOP_SEC);
				rmsDb[i] = r * 100;
				peakDb[i] = rmsDb[i] + 600;
				flux[i] = fl;
				voice[i] = v;
			}
			return { rmsDb, peakDb, flux, centroid, voice, frameCount: n, durationSec: n * HOP_SEC };
		};
		// 10 min de silêncio digital: nada
		expect(suggestMoments(serie(600, () => [-120, 5, 0]))).toEqual([]);
		// fala comum: aparece, mas com nota baixa
		const fala = sinal(10 * 60);
		const mf = suggestMoments(fala, { silences: detectSilences(fala).silences, options: { count: 20 } });
		expect(mf.length).toBeGreaterThan(0);
		for (const x of mf) expect(x.score).toBeLessThan(70);
		// volume constante (curva plana): não fica preso num único momento
		const plano = suggestMoments(serie(30 * 60, () => [-24, 30, 200]), { options: { count: 10 } });
		expect(plano.length).toBe(10);
		for (const x of plano) expect(x.end - x.start).toBeGreaterThanOrEqual(15 - 1e-6);
	});

	test("picos colados: todo momento tem pelo menos 15 s e nenhum sobrepõe", () => {
		const s = sinal(20 * 60);
		for (let g = 40; g < 1100; g += 13) s.grito(g, 1);
		const silences = detectSilences(s).silences;
		const m = suggestMoments(s, { silences, options: { count: 20 } });
		expect(m.length).toBeGreaterThan(0);
		for (const x of m) expect(x.end - x.start).toBeGreaterThanOrEqual(15 - 1e-6);
		const ord = [...m].sort((a, b) => a.start - b.start);
		for (let i = 1; i < ord.length; i++) expect(ord[i].start).toBeGreaterThanOrEqual(ord[i - 1].end - 1e-6);
	});

	test("borda vai para a pausa mais perto, sem passar do limite", () => {
		const sil: TimeRange[] = [
			[10, 12],
			[30, 31],
			[50, 52],
		];
		expect(snapToPause(sil, 29, "start", 8, 40)).toBeCloseTo(30.75);
		expect(snapToPause(sil, 47, "end", 8, 40)).toBeCloseTo(50.25);
		expect(snapToPause(sil, 47, "end", 8, 60)).toBe(47); // pausa antes do limite: fica
		expect(snapToPause(sil, 70, "start", 8, 80)).toBe(70);
	});
});

function analisarRoteiro(duracaoSeg: number, taxa: number) {
	const blocos = montarRoteiro({ duracaoSeg });
	const sint = new SintetizadorAudio({ blocos, taxa, semente: 1 });
	const r = new StreamingResampler(taxa, 16000);
	const acc = new FeatureAccumulator(duracaoSeg / HOP_SEC);
	const pedaco = new Float32Array(taxa);
	for (let s = 0; s < duracaoSeg; s++) {
		sint.preencher({ amostraInicial: s * taxa, saida: pedaco });
		acc.push(r.push(pedaco));
	}
	acc.push(r.flush());
	const analise = acc.finish({ durationSec: duracaoSeg, sourceRate: taxa, trackIndex: 0, trackCount: 1 });
	return { analise, gabarito: intervalosPorTipo(blocos) };
}

describe("melhores momentos na live do gerador", () => {
	test("gritos do gabarito aparecem entre os primeiros sugeridos", () => {
		const { analise, gabarito } = analisarRoteiro(30 * 60, 48000);
		const silences = detectSilences(analise).silences;
		const levels = localLevels(analise);
		const shouts = detectShouts(analise, levels);
		const t0 = performance.now();
		const m = suggestMoments(analise, { silences, levels, shouts, options: { count: 20 } });
		const ms = performance.now() - t0;
		const gritos = gabarito.grito;
		const k = Math.min(15, m.length);
		const top = m.slice(0, k);
		// gritos do gabarito separados por menos de 60 s contam como um momento só
		const cobertos = gritos.filter(([a, b]) => top.some((x) => x.start <= a && x.end >= b)).length;
		const momentosComGrito = top.filter((x) => gritos.some(([a, b]) => x.start <= a && x.end >= b)).length;
		console.log(
			`[momentos gabarito] gritos=${gritos.length} cobertos nos ${k} primeiros=${cobertos} momentos com grito=${momentosComGrito}/${k} (${ms.toFixed(1)} ms)`,
		);
		expect(cobertos / gritos.length).toBeGreaterThanOrEqual(0.8);
		for (const x of m) expect(x.end - x.start).toBeLessThanOrEqual(60 + 1e-6);
	}, 120_000);
});
