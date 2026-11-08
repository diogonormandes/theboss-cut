import { describe, expect, test } from "bun:test";
import type { SceneTracks, TScene, VideoElement } from "@/timeline";
import { loadOpencutWasmForTests } from "../../../commands/__tests__/load-wasm";

await loadOpencutWasmForTests();
const { mediaTime, TICKS_PER_SECOND } = await import("@/wasm");
const {
	ApplyFramingCommand,
	buildCenteredTracks,
	buildFollowTracks,
	buildSplitTracks,
	withoutPreviousFraming,
} = await import("../apply-framing");
const { coverPlacement } = await import("../framing-math");
const { getChannel } = await import("@/animation/keyframes");

const LIVE = "live";
const CANVAS = { width: 1080, height: 1920 };
const SOURCE = { width: 1920, height: 1080 };
const FACE = { cx: 0.85, cy: 0.2, w: 0.06, h: 0.11 };

function ticks(seconds: number) {
	return mediaTime({ ticks: Math.round(seconds * TICKS_PER_SECOND) });
}

/** Pedaço da live: começa em `at` na linha do tempo e mostra [src, src+len]. */
function piece(id: string, at: number, src: number, len: number): VideoElement {
	return {
		id,
		type: "video",
		name: id,
		mediaId: LIVE,
		startTime: ticks(at),
		duration: ticks(len),
		trimStart: ticks(src),
		trimEnd: ticks(1000 - src - len),
		sourceDuration: ticks(1000),
		isSourceAudioEnabled: true,
		params: {
			"transform.positionX": 0,
			"transform.positionY": 0,
			"transform.scaleX": 1,
			"transform.scaleY": 1,
			"transform.rotate": 0,
			opacity: 1,
		},
	};
}

function tracksOf(elements: VideoElement[]): SceneTracks {
	return {
		overlay: [],
		main: {
			id: "main",
			name: "Main",
			type: "video",
			muted: false,
			hidden: false,
			elements,
		},
		audio: [],
	} as SceneTracks;
}

// corte de silêncios: 3 pedaços colados, de trechos diferentes da live
const PIECES = [piece("a", 0, 100, 10), piece("b", 10, 120, 5), piece("c", 15, 140, 8)];

function positionKeys(element: VideoElement) {
	const channel = getChannel({
		animations: element.animations,
		propertyPath: "transform.positionX",
	}) as { keys: { time: number; value: number; segmentToNext: string }[] } | undefined;
	return channel?.keys ?? [];
}

describe("Dividido", () => {
	test("todos os pedaços recebem a câmera e cada um tem a sua cópia do jogo", () => {
		const out = buildSplitTracks({
			tracks: tracksOf(PIECES),
			mediaId: LIVE,
			canvas: CANVAS,
			source: SOURCE,
			face: FACE,
		});
		expect(out.overlay.length).toBe(1);
		const games = out.overlay[0].elements as VideoElement[];
		expect(games.length).toBe(3);
		for (let i = 0; i < 3; i++) {
			const cam = out.main.elements[i] as VideoElement;
			expect(cam.params["transform.scaleX"]).toBeGreaterThan(1);
			expect(games[i].startTime).toBe(PIECES[i].startTime);
			expect(games[i].trimStart).toBe(PIECES[i].trimStart);
			expect(games[i].duration).toBe(PIECES[i].duration);
			expect(games[i].isSourceAudioEnabled).toBe(false);
		}
	});

	test("aplicar duas vezes não empilha duas faixas de jogo", () => {
		const once = buildSplitTracks({
			tracks: tracksOf(PIECES),
			mediaId: LIVE,
			canvas: CANVAS,
			source: SOURCE,
			face: FACE,
		});
		const twice = buildSplitTracks({
			tracks: withoutPreviousFraming(once, LIVE),
			mediaId: LIVE,
			canvas: CANVAS,
			source: SOURCE,
			face: FACE,
		});
		expect(twice.overlay.length).toBe(1);
		// e voltar para centralizado tira a faixa do jogo
		const centered = buildCenteredTracks({
			tracks: withoutPreviousFraming(twice, LIVE),
			mediaId: LIVE,
			canvas: CANVAS,
			source: SOURCE,
		});
		expect(centered.overlay.length).toBe(0);
	});
});

describe("Seguir rosto", () => {
	const cover = coverPlacement(CANVAS, SOURCE);
	const limit = (cover.renderedWidth - 1080) / 2;
	// rosto anda de 0,3 a 0,7 entre 100 s e 150 s da fonte
	const points = Array.from({ length: 51 }, (_, i) => ({
		t: 100 + i,
		x: 0.3 + (0.4 * i) / 50,
	}));

	test("keyframes em tempo local de cada pedaço, dentro do limite", () => {
		const out = buildFollowTracks({
			tracks: tracksOf(PIECES),
			mediaId: LIVE,
			canvas: CANVAS,
			source: SOURCE,
			points,
		});
		out.main.elements.forEach((el, i) => {
			const element = el as VideoElement;
			expect(element.params["transform.scaleX"]).toBeCloseTo(cover.scale, 5);
			const keys = positionKeys(element);
			expect(keys.length).toBeGreaterThanOrEqual(2);
			const len = Number(PIECES[i].duration) / TICKS_PER_SECOND;
			expect(keys[0].time).toBe(0);
			expect(Number(keys[keys.length - 1].time) / TICKS_PER_SECOND).toBeCloseTo(len, 3);
			for (const key of keys) {
				expect(Math.abs(key.value)).toBeLessThanOrEqual(limit + 0.1);
			}
			// valor no início do pedaço = posição do rosto naquele tempo da fonte
			const src = Number(PIECES[i].trimStart) / TICKS_PER_SECOND;
			const fx = 0.3 + (0.4 * (src - 100)) / 50;
			const expected = Math.max(-limit, Math.min(limit, (0.5 - fx) * cover.renderedWidth));
			expect(keys[0].value).toBeCloseTo(expected, 0);
		});
	});

	test("corte seco vira passo 'step' no ponto de antes", () => {
		const out = buildFollowTracks({
			tracks: tracksOf([piece("a", 0, 100, 10)]),
			mediaId: LIVE,
			canvas: CANVAS,
			source: SOURCE,
			points: [
				{ t: 100, x: 0.2 },
				{ t: 104, x: 0.2, hold: true },
				{ t: 104.33, x: 0.8 },
				{ t: 110, x: 0.8 },
			],
		});
		const keys = positionKeys(out.main.elements[0] as VideoElement);
		const step = keys.find((k) => k.segmentToNext === "step");
		expect(step).toBeDefined();
		expect(Number(step?.time) / TICKS_PER_SECOND).toBeCloseTo(4, 3);
	});
});

describe("ApplyFramingCommand", () => {
	function fakeEditor(scenes: TScene[]) {
		const byId = new Map(scenes.map((s) => [s.id, s]));
		return {
			scenes: { getSceneById: (id: string) => byId.get(id) ?? null },
			timeline: {
				updateTracks: (tracks: SceneTracks, { sceneId }: { sceneId: string }) => {
					const scene = byId.get(sceneId);
					if (scene) byId.set(sceneId, { ...scene, tracks });
				},
			},
			remove: (id: string) => byId.delete(id),
			get: (id: string) => byId.get(id) ?? null,
		};
	}
	const sceneOf = (id: string): TScene =>
		({ id, name: id, isMain: false, kind: "corte", tracks: tracksOf(PIECES), bookmarks: [] }) as unknown as TScene;

	test("monta na hora de executar (edição feita durante a análise fica) e desfaz", () => {
		const editor = fakeEditor([sceneOf("s1"), sceneOf("s2")]);
		const plans = ["s1", "s2"].map((sceneId) => ({
			sceneId,
			build: (tracks: SceneTracks) =>
				buildSplitTracks({ tracks, mediaId: LIVE, canvas: CANVAS, source: SOURCE, face: FACE }),
		}));
		const command = new ApplyFramingCommand(editor as never, plans);
		// a pessoa edita a cena s1 depois da análise e antes de executar
		const edited = editor.get("s1") as TScene;
		const extra = { ...edited.tracks, audio: [{ id: "musica" }] } as unknown as SceneTracks;
		editor.timeline.updateTracks(extra, { sceneId: "s1" });
		command.execute();
		const s1 = editor.get("s1") as TScene;
		expect(s1.tracks.overlay.length).toBe(1);
		expect((s1.tracks.audio as unknown[]).length).toBe(1); // edição não se perdeu
		command.undo();
		expect((editor.get("s1") as TScene).tracks).toBe(extra);
		expect((editor.get("s2") as TScene).tracks.overlay.length).toBe(0);
		command.redo();
		expect((editor.get("s2") as TScene).tracks.overlay.length).toBe(1);
	});

	test("cena apagada não faz o passo sumir para as outras", () => {
		const editor = fakeEditor([sceneOf("s1"), sceneOf("s2")]);
		const plans = ["s1", "s2"].map((sceneId) => ({
			sceneId,
			build: (tracks: SceneTracks) =>
				buildSplitTracks({ tracks, mediaId: LIVE, canvas: CANVAS, source: SOURCE, face: FACE }),
		}));
		const command = new ApplyFramingCommand(editor as never, plans);
		command.execute();
		editor.remove("s1");
		expect(command.getTargetSceneId()).toBe("s2");
		command.undo();
		expect((editor.get("s2") as TScene).tracks.overlay.length).toBe(0);
	});
});
