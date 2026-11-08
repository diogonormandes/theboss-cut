import { describe, expect, test } from "bun:test";
import {
	averageBox,
	coverPlacement,
	followPositionX,
	placeRegionInArea,
	sampleTimes,
	smoothFaceTrack,
	splitLayout,
	toKeyPoints,
} from "../framing-math";
import { decodeYunet, pickMainFace, rgbaToYunetInput } from "../yunet";

const CANVAS = { width: 1080, height: 1920 };
const SOURCE = { width: 1920, height: 1080 };

describe("averageBox", () => {
	test("média de caixas parecidas", () => {
		const box = averageBox([
			{ cx: 0.8, cy: 0.2, w: 0.1, h: 0.18 },
			{ cx: 0.82, cy: 0.22, w: 0.12, h: 0.2 },
			{ cx: 0.81, cy: 0.21, w: 0.11, h: 0.19 },
		]);
		expect(box?.cx).toBeCloseTo(0.81, 5);
		expect(box?.cy).toBeCloseTo(0.21, 5);
		expect(box?.w).toBeCloseTo(0.11, 5);
	});

	test("descarta rosto solto longe da facecam", () => {
		const box = averageBox([
			{ cx: 0.8, cy: 0.2, w: 0.1, h: 0.18 },
			{ cx: 0.8, cy: 0.2, w: 0.1, h: 0.18 },
			{ cx: 0.8, cy: 0.2, w: 0.1, h: 0.18 },
			{ cx: 0.2, cy: 0.7, w: 0.1, h: 0.18 },
		]);
		expect(box?.cx).toBeCloseTo(0.8, 5);
		expect(box?.cy).toBeCloseTo(0.2, 5);
	});

	test("sem caixas devolve null", () => {
		expect(averageBox([])).toBeNull();
	});
});

describe("Seguir rosto: posição X", () => {
	const cover = coverPlacement(CANVAS, SOURCE);

	test("escala cobre a altura (≈3,16) e W ≈ 3413", () => {
		expect(cover.scale).toBeCloseTo(1920 / 607.5, 5);
		expect(cover.renderedWidth).toBeCloseTo(3413.33, 1);
		expect(cover.renderedHeight).toBeCloseTo(1920, 5);
	});

	test("rosto no meio = posição 0", () => {
		expect(
			followPositionX({
				fx: 0.5,
				renderedWidth: cover.renderedWidth,
				canvasWidth: 1080,
			}),
		).toBe(0);
	});

	test("(0,5 − fx)·W dentro do limite", () => {
		const v = followPositionX({
			fx: 0.6,
			renderedWidth: cover.renderedWidth,
			canvasWidth: 1080,
		});
		expect(v).toBeCloseTo(-0.1 * cover.renderedWidth, 5);
	});

	test("limitado a ±(W−1080)/2 nas bordas", () => {
		const limit = (cover.renderedWidth - 1080) / 2;
		expect(
			followPositionX({
				fx: 0.98,
				renderedWidth: cover.renderedWidth,
				canvasWidth: 1080,
			}),
		).toBeCloseTo(-limit, 5);
		expect(
			followPositionX({
				fx: 0.0,
				renderedWidth: cover.renderedWidth,
				canvasWidth: 1080,
			}),
		).toBeCloseTo(limit, 5);
	});
});

describe("Dividido", () => {
	test("câmera preenche a metade de cima e jogo a de baixo", () => {
		const { cam, game, camRegion } = splitLayout({
			face: { cx: 0.85, cy: 0.2, w: 0.06, h: 0.11 },
			source: SOURCE,
			canvas: CANVAS,
		});
		// jogo: altura exata da metade de baixo, centrado nela
		const baseH = 1080 * (1080 / 1920);
		expect(baseH * game.scale).toBeCloseTo(960, 3);
		expect(game.positionY).toBeCloseTo(480, 5);
		expect(game.positionX).toBeCloseTo(0, 5);
		// região da câmera com o formato da metade de cima (1080×960)
		expect((camRegion.w * 1920) / (camRegion.h * 1080)).toBeCloseTo(
			1080 / 960,
			5,
		);
		// a câmera cobre a metade de cima inteira
		const ew = 1080 * cam.scale;
		const eh = 607.5 * cam.scale;
		expect(cam.positionX - ew / 2).toBeLessThanOrEqual(-540 + 1e-6);
		expect(cam.positionX + ew / 2).toBeGreaterThanOrEqual(540 - 1e-6);
		expect(cam.positionY - eh / 2).toBeLessThanOrEqual(-960 + 1e-6);
		expect(cam.positionY + eh / 2).toBeGreaterThanOrEqual(0 - 1e-6);
	});

	test("centro da região fica no centro da área quando cabe", () => {
		const p = placeRegionInArea({
			region: { cx: 0.5, cy: 0.5, w: 0.5, h: 0.5 },
			source: SOURCE,
			canvas: CANVAS,
			area: { centerX: 0, centerY: -480, width: 1080, height: 960 },
		});
		expect(p.positionX).toBeCloseTo(0, 5);
		expect(p.positionY).toBeCloseTo(-480, 5);
	});
});

describe("suavização", () => {
	test("zona morta: tremidas pequenas não mexem", () => {
		const track = smoothFaceTrack(
			[0.5, 0.52, 0.48, 0.53, 0.49, 0.51].map((fx, i) => ({ t: i / 3, fx })),
		);
		for (const p of track) expect(p.x).toBeCloseTo(0.5, 5);
	});

	test("anda em direção ao rosto sem passar dele", () => {
		const samples = Array.from({ length: 30 }, (_, i) => ({
			t: i / 3,
			fx: i < 3 ? 0.4 : 0.6,
		}));
		const track = smoothFaceTrack(samples);
		const last = track[track.length - 1].x;
		expect(last).toBeGreaterThan(0.5);
		expect(last).toBeLessThanOrEqual(0.6);
		for (let i = 1; i < track.length; i++) {
			expect(track[i].x).toBeGreaterThanOrEqual(track[i - 1].x - 1e-9);
		}
	});

	test("rosto parado fora do centro termina centralizado", () => {
		const samples = Array.from({ length: 60 }, (_, i) => ({
			t: i / 3,
			fx: i < 3 ? 0.5 : 0.6,
		}));
		const track = smoothFaceTrack(samples);
		expect(track[track.length - 1].x).toBeGreaterThan(0.59);
		expect(track[track.length - 1].x).toBeLessThanOrEqual(0.6);
	});

	test("salto grande confirmado vira corte seco desde a 1ª amostra", () => {
		const track = smoothFaceTrack([
			{ t: 0, fx: 0.2 },
			{ t: 0.33, fx: 0.8 },
			{ t: 0.67, fx: 0.8 },
		]);
		expect(track[0].x).toBeCloseTo(0.2, 5);
		expect(track[1].x).toBeCloseTo(0.8, 5);
		expect(track[1].cut).toBe(true);
		expect(track[2].x).toBeCloseTo(0.8, 5);
		const keys = toKeyPoints(track);
		expect(keys.find((k) => k.hold)?.t).toBe(0);
		expect(keys.some((k) => k.t === 0.33 && k.x === 0.8)).toBe(true);
	});

	test("rosto solto longe (personagem do jogo) é ignorado", () => {
		const track = smoothFaceTrack([
			{ t: 0, fx: 0.2 },
			{ t: 0.33, fx: 0.8 },
			{ t: 0.67, fx: 0.2 },
			{ t: 1, fx: 0.2 },
		]);
		for (const p of track) expect(p.x).toBeCloseTo(0.2, 5);
		expect(track.some((p) => p.cut)).toBe(false);
	});

	test("com vários rostos, segue o mais perto da trilha e não o maior", () => {
		const track = smoothFaceTrack(
			Array.from({ length: 9 }, (_, i) => ({
				t: i / 3,
				// o maior (fx) é do jogo, em 0,8; a facecam está em 0,2
				fx: i === 0 ? 0.2 : 0.8,
				candidates: i === 0 ? [0.2] : [0.8, 0.21],
			})),
		);
		for (const p of track) expect(p.x).toBeLessThan(0.25);
	});

	test("sem rosto: segura e depois volta devagar ao centro", () => {
		const samples = [
			{ t: 0, fx: 0.8 },
			...Array.from({ length: 30 }, (_, i) => ({ t: (i + 1) / 3, fx: null })),
		];
		const track = smoothFaceTrack(samples);
		expect(track[3].x).toBeCloseTo(0.8, 5); // 1 s depois: segura
		expect(track[track.length - 1].x).toBeLessThan(0.8);
		expect(track[track.length - 1].x).toBeGreaterThan(0.5);
	});

	test("keyframes a ~1 por segundo e sem pontos inúteis", () => {
		const track = Array.from({ length: 181 }, (_, i) => ({
			t: i / 3,
			x: 0.5 + 0.1 * Math.sin(i / 20),
		}));
		const points = toKeyPoints(track);
		expect(points.length).toBeLessThanOrEqual(61);
		expect(points.length).toBeGreaterThan(10);
		const flat = toKeyPoints(track.map((p) => ({ ...p, x: 0.5 })));
		expect(flat.length).toBe(2);
	});

	test("tempos de amostra só dentro do corte", () => {
		const times = sampleTimes({ start: 100, end: 160, perSecond: 3 });
		expect(times.length).toBe(180);
		expect(Math.min(...times)).toBeGreaterThan(100);
		expect(Math.max(...times)).toBeLessThan(160);
	});
});

describe("YuNet: leitura das saídas", () => {
	test("acha a caixa na célula certa e tira repetidas", () => {
		const n8 = 80 * 80;
		const cls = new Float32Array(n8);
		const obj = new Float32Array(n8);
		const bbox = new Float32Array(n8 * 4);
		const idx = 10 * 80 + 60; // linha 10, coluna 60
		cls[idx] = 0.9;
		obj[idx] = 0.9;
		bbox.set([0.5, 0.5, Math.log(4), Math.log(5)], idx * 4);
		cls[idx + 1] = 0.8; // vizinha quase igual
		obj[idx + 1] = 0.8;
		bbox.set([-0.4, 0.5, Math.log(4), Math.log(5)], (idx + 1) * 4);
		const faces = decodeYunet({
			cls_8: { data: cls },
			obj_8: { data: obj },
			bbox_8: { data: bbox },
		});
		expect(faces.length).toBe(1);
		expect(faces[0].cx).toBeCloseTo(60.5 * 8, 3);
		expect(faces[0].cy).toBeCloseTo(10.5 * 8, 3);
		expect(faces[0].w).toBeCloseTo(32, 3);
		expect(faces[0].h).toBeCloseTo(40, 3);
		expect(pickMainFace(faces)?.score).toBeCloseTo(0.9, 5);
	});

	test("RGBA vira BGR planar 640×640 com o resto preto", () => {
		const rgba = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255]);
		const out = rgbaToYunetInput({ rgba, width: 2, height: 1 });
		const plane = 640 * 640;
		expect(out[0]).toBe(30);
		expect(out[plane]).toBe(20);
		expect(out[2 * plane]).toBe(10);
		expect(out[1]).toBe(60);
		expect(out[640]).toBe(0);
	});
});
