import { describe, expect, test } from "bun:test";
import {
	SintetizadorAudio,
	intervalosPorTipo,
	montarRoteiro,
} from "@/app/dev/gerar-live-teste/roteiro";
import { FeatureAccumulator, FrameFeatureExtractor, type FrameFeatures } from "../features";
import {
	analysisKey,
	centroidHz,
	decodeAnalysis,
	encodeAnalysis,
	HOP_SEC,
} from "../format";
import { detectShouts, excitementCurve, excitementPeaks, localLevels } from "../moments";
import { conferirComGabarito } from "../gabarito-check";
import { StreamingResampler } from "../resampler";
import {
	complement,
	detectSilences,
	overlapSeconds,
	percentileDb,
	type TimeRange,
	totalSeconds,
} from "../silence";

function sine({ freq, rate, seconds, amp }: { freq: number; rate: number; seconds: number; amp: number }) {
	const out = new Float32Array(Math.round(rate * seconds));
	for (let i = 0; i < out.length; i++) out[i] = amp * Math.sin((2 * Math.PI * freq * i) / rate);
	return out;
}

function rmsDbOf(x: Float32Array, from = 0, to = x.length): number {
	let s = 0;
	for (let i = from; i < to; i++) s += x[i] * x[i];
	return 10 * Math.log10(s / (to - from));
}

/** Passa o sinal pelo reamostrador em pedaços irregulares (como o decodificador entrega). */
function resampleAll(input: Float32Array, rate: number): Float32Array {
	const r = new StreamingResampler(rate, 16000);
	const parts: Float32Array[] = [];
	let pos = 0;
	let k = 0;
	while (pos < input.length) {
		const size = [1024, 960, 2048, 333][k++ % 4];
		const chunk = input.subarray(pos, Math.min(input.length, pos + size));
		parts.push(r.push(chunk).slice());
		pos += size;
	}
	parts.push(r.flush().slice());
	const total = parts.reduce((s, p) => s + p.length, 0);
	const out = new Float32Array(total);
	let o = 0;
	for (const p of parts) {
		out.set(p, o);
		o += p.length;
	}
	return out;
}

describe("reamostrador para 16 kHz", () => {
	for (const rate of [48000, 44100, 32000]) {
		test(`${rate} Hz: mantém 1 kHz e corta 10 kHz`, () => {
			const ok = resampleAll(sine({ freq: 1000, rate, seconds: 1, amp: 0.5 }), rate);
			expect(Math.abs(ok.length - 16000)).toBeLessThanOrEqual(4);
			expect(Math.abs(rmsDbOf(ok, 200, 15800) - rmsDbOf(sine({ freq: 1000, rate, seconds: 1, amp: 0.5 })))).toBeLessThan(0.2);
			// fase: amostra 4000 de 16 kHz = 0,25 s → seno de 1 kHz em 0,25 s = 0
			const expected = sine({ freq: 1000, rate: 16000, seconds: 1, amp: 0.5 });
			let err = 0;
			for (let i = 200; i < 15800; i++) err = Math.max(err, Math.abs(ok[i] - expected[i]));
			expect(err).toBeLessThan(0.02);

			const alto = resampleAll(sine({ freq: 10000, rate, seconds: 1, amp: 0.5 }), rate);
			expect(rmsDbOf(alto, 200, alto.length - 200)).toBeLessThan(rmsDbOf(ok, 200, 15800) - 30);

			// 9 kHz (acima da metade de 16 kHz) não pode voltar dobrado em 7 kHz
			const dobra = resampleAll(sine({ freq: 9000, rate, seconds: 1, amp: 0.5 }), rate);
			expect(rmsDbOf(dobra, 200, dobra.length - 200)).toBeLessThan(rmsDbOf(ok, 200, 15800) - 40);
		});
	}
});

describe("medidas do quadro", () => {
	const ex = new FrameFeatureExtractor();
	const f: FrameFeatures = { rmsDb: 0, peakDb: 0, zcr: 0, flux: 0, centroidHz: 0, voiceRatio: 0 };

	test("seno de 1 kHz", () => {
		const x = sine({ freq: 1000, rate: 16000, seconds: 0.1, amp: 0.5 });
		ex.compute(x, 0, f);
		expect(f.rmsDb).toBeCloseTo(-9.03, 1);
		expect(f.peakDb).toBeCloseTo(-6.02, 1);
		expect(Math.abs(f.centroidHz - 1000)).toBeLessThan(60);
		expect(f.voiceRatio).toBeGreaterThan(0.99);
		expect(f.zcr).toBeCloseTo(2000 / 16000, 2);
	});

	test("ruído branco: centróide e cruzamentos altos, fluxo existe", () => {
		let s = 12345;
		const x = new Float32Array(1600);
		for (let i = 0; i < x.length; i++) {
			s = (s * 1103515245 + 12345) & 0x7fffffff;
			x[i] = (s / 0x7fffffff) * 2 - 1;
		}
		ex.compute(x, 0, f);
		expect(f.centroidHz).toBeGreaterThan(3500);
		expect(f.zcr).toBeGreaterThan(0.4);
		expect(f.voiceRatio).toBeLessThan(0.45);
	});

	test("silêncio digital", () => {
		ex.compute(new Float32Array(1600), 0, f);
		expect(f.rmsDb).toBe(-120);
		expect(f.peakDb).toBe(-120);
	});
});

describe("formato binário", () => {
	test("vai e volta igual", () => {
		const acc = new FeatureAccumulator(100);
		acc.push(sine({ freq: 440, rate: 16000, seconds: 3, amp: 0.3 }));
		const a = acc.finish({ durationSec: 3, sourceRate: 48000, trackIndex: 1, trackCount: 2 });
		expect(a.frameCount).toBeGreaterThanOrEqual(59);
		const b = decodeAnalysis(encodeAnalysis(a));
		expect(b).not.toBeNull();
		expect(b?.frameCount).toBe(a.frameCount);
		expect(b?.trackIndex).toBe(1);
		expect(b?.durationSec).toBe(3);
		expect(Array.from(b?.rmsDb ?? [])).toEqual(Array.from(a.rmsDb));
		expect(Array.from(b?.voice ?? [])).toEqual(Array.from(a.voice));
		expect(decodeAnalysis(new ArrayBuffer(10))).toBeNull();
		expect(analysisKey({ assetId: "a/b", size: 10, lastModified: 5.4, trackIndex: 0 })).toBe("a_b-10-5-t0");
	});
});

function seriesFromDb(values: number[], hop = HOP_SEC) {
	const rmsDb = Int16Array.from(values.map((v) => Math.round(v * 100)));
	return { rmsDb, frameCount: values.length, durationSec: values.length * hop };
}

describe("silêncio", () => {
	test("percentil por histograma", () => {
		const v = Int16Array.from(Array.from({ length: 100 }, (_, i) => -i * 100));
		expect(percentileDb(v, 10)).toBeCloseTo(-89, 0);
	});

	test("acha silêncios, respeita margem, mínimo e histerese", () => {
		// 2 s fala, 1 s silêncio, 2 s fala, 0,3 s silêncio (curto), 2 s fala, 3 s silêncio
		const parts: [number, number][] = [
			[-20, 2],
			[-60, 1],
			[-20, 2],
			[-60, 0.3],
			[-20, 2],
			[-60, 3],
		];
		const values: number[] = [];
		for (const [db, sec] of parts) for (let i = 0; i < Math.round(sec / HOP_SEC); i++) values.push(db);
		// ruído de fundo oscilando 1 dB não pode quebrar o silêncio (histerese)
		for (let i = 0; i < values.length; i++) if (values[i] === -60) values[i] += i % 2 ? 1 : -1;
		const s = detectSilences(seriesFromDb(values), { deltaDb: 8, minSilenceSec: 0.6, marginSec: 0.15 });
		expect(s.noiseFloorDb).toBeCloseTo(-61, 0);
		expect(s.silences.length).toBe(2);
		const [a, b] = s.silences;
		// silêncio do meio: 2,0 → 3,0 s, menos margem de 0,15 s
		expect(a[0]).toBeGreaterThan(2.1);
		expect(a[0]).toBeLessThan(2.25);
		expect(a[1]).toBeGreaterThan(2.8);
		expect(a[1]).toBeLessThan(2.95);
		// o último vai até o fim, sem margem no fim
		expect(b[1]).toBeCloseTo(values.length * HOP_SEC, 5);
		expect(s.keeps.length).toBe(2);
		expect(totalSeconds(s.keeps) + totalSeconds(s.silences)).toBeCloseTo(values.length * HOP_SEC, 5);
	});

	test("abertura muda (silêncio digital) não derruba o ruído de fundo", () => {
		const values: number[] = [];
		const add = (db: number, sec: number) => {
			for (let i = 0; i < Math.round(sec / HOP_SEC); i++) values.push(db);
		};
		add(-120, 180); // 3 min de tela de "começando" sem som
		for (let k = 0; k < 170; k++) {
			add(-20, 4);
			add(-55, 3); // pausa da fala com ruído de sala
		}
		add(-120, 60); // buraco preenchido com zeros no fim
		const s = detectSilences(seriesFromDb(values));
		expect(s.noiseFloorDb).toBeCloseTo(-55, 0);
		expect(s.silences.length).toBeGreaterThanOrEqual(170);
		expect(percentileDb(Int16Array.from([-12000, -12000]), 10, 2, -100)).toBe(-120);
	});

	test("delta maior corta mais (intensidade)", () => {
		const values = Array.from({ length: 2000 }, (_, i) => -60 + 30 * Math.abs(Math.sin(i / 50)));
		const leve = detectSilences(seriesFromDb(values), { deltaDb: 3 });
		const forte = detectSilences(seriesFromDb(values), { deltaDb: 15 });
		expect(totalSeconds(forte.silences)).toBeGreaterThan(totalSeconds(leve.silences));
	});

	test("trecho mantido curto vira silêncio", () => {
		const values: number[] = [];
		const add = (db: number, sec: number) => {
			for (let i = 0; i < Math.round(sec / HOP_SEC); i++) values.push(db);
		};
		add(-20, 2);
		add(-60, 2);
		add(-20, 0.25); // estalo de 250 ms entre dois silêncios
		add(-60, 2);
		add(-20, 2);
		const s = detectSilences(seriesFromDb(values), { minKeepSec: 0.6, marginSec: 0.15 });
		expect(s.silences.length).toBe(1);
	});

	test("complemento e sobreposição", () => {
		const r: TimeRange[] = [
			[1, 2],
			[3, 4],
		];
		expect(complement(r, 5)).toEqual([
			[0, 1],
			[2, 3],
			[4, 5],
		]);
		expect(overlapSeconds(r, [[1.5, 3.5]])).toBeCloseTo(1, 6);
	});
});

describe("gritos e empolgação", () => {
	test("grito curto e brilhante no meio da fala é achado; fala alta longa não", () => {
		const n = Math.round(180 / HOP_SEC);
		const rms = new Int16Array(n);
		const centroid = new Uint8Array(n);
		const peak = new Int16Array(n);
		const flux = new Uint8Array(n);
		for (let i = 0; i < n; i++) {
			rms[i] = (i % 10 < 7 ? -22 : -45) * 100; // fala com pausas
			centroid[i] = Math.round((800 / 8000) * 255);
			peak[i] = rms[i] + 600;
		}
		const shoutAt = (sec: number, dur: number) => {
			for (let i = Math.round(sec / HOP_SEC); i < Math.round((sec + dur) / HOP_SEC); i++) {
				rms[i] = -9 * 100;
				centroid[i] = Math.round((2200 / 8000) * 255);
			}
		};
		shoutAt(40, 1);
		shoutAt(120, 0.6);
		// 5 s de som alto mas grave (não é grito)
		for (let i = Math.round(80 / HOP_SEC); i < Math.round(85 / HOP_SEC); i++) rms[i] = -9 * 100;
		const a = { rmsDb: rms, centroid, peakDb: peak, flux, frameCount: n, durationSec: n * HOP_SEC };
		const levels = localLevels(a);
		const shouts = detectShouts(a, levels);
		expect(shouts.length).toBe(2);
		expect(Math.abs(shouts[0].start - 40)).toBeLessThan(0.15);
		expect(Math.abs(shouts[1].start - 120)).toBeLessThan(0.15);
		expect(centroidHz(centroid[Math.round(40 / HOP_SEC)])).toBeGreaterThan(2000);

		const peaks = excitementPeaks(excitementCurve(a, levels));
		const tempos = peaks.map((p) => p.time);
		for (const alvo of [40, 82.5, 120]) {
			expect(tempos.some((t) => Math.abs(t - alvo) < 3)).toBe(true);
		}
	});
});

// ---------------------------------------------------------------------------
// Live sintética (mesmo roteiro e mesmo áudio da página /dev/gerar-live-teste)
// ---------------------------------------------------------------------------

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

describe("live sintética do gerador (sem compressão)", () => {
	for (const taxa of [48000, 44100]) {
		test(`20 min a ${taxa} Hz batem com o gabarito`, () => {
			const t0 = performance.now();
			const { analise, gabarito } = analisarRoteiro(20 * 60, taxa);
			const r = conferirComGabarito(analise, gabarito);
			console.log(`[mapa ${taxa}]`, JSON.stringify(r), `${Math.round(performance.now() - t0)} ms`);
			expect(r.silencioAchadoPct).toBeGreaterThan(95);
			// a "fala" do gabarito tem pausas entre palavras; algumas passam de 0,6 s
			expect(r.falaCortadaPct).toBeLessThan(2);
			expect(r.gritosAchados / r.gritosGabarito).toBeGreaterThan(0.9);
			expect(r.gritosCertos / Math.max(1, r.gritosDetectados)).toBeGreaterThan(0.9);
		}, 120_000);
	}
});
