import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { TProject } from "@/project/types";
import type { SceneTracks, TScene, VideoElement } from "@/timeline";
import { loadOpencutWasmForTests } from "./load-wasm";

await loadOpencutWasmForTests();
const { mediaTime, TICKS_PER_SECOND, ZERO_MEDIA_TIME } = await import("@/wasm");

// Editor de mentira: managers reais de cenas, linha do tempo e comandos;
// projeto, mídia e seleção bem simples.
// biome-ignore lint/suspicious/noExplicitAny: editor falso só para teste
const editor: any = {};
mock.module("@/core", () => ({
	EditorCore: { getInstance: () => editor },
}));
// Serviços de disco/cache do RemoveMediaAssetCommand: não interessam aqui.
mock.module("@/services/storage/service", () => ({
	storageService: {
		deleteMediaAsset: async () => {},
		saveMediaAsset: async () => {},
	},
}));
mock.module("@/services/video-cache/service", () => ({
	videoCache: { clearVideo: () => {} },
}));
mock.module("@/services/waveform-cache/service", () => ({
	waveformCache: { clearSource: () => {} },
}));

const { ScenesManager } = await import("@/core/managers/scenes-manager");
const { TimelineManager } = await import("@/core/managers/timeline-manager");
const { CommandManager } = await import("@/core/managers/commands");
const {
	KeepRangesCommand,
	KeepRangesInNewSceneCommand,
	DeleteElementsCommand,
	ToggleTrackMuteCommand,
	SplitElementsCommand,
	UpdateElementsCommand,
	TracksSnapshotCommand,
	CreateScenesFromCutsCommand,
	AddBookmarksCommand,
	RemoveMediaAssetCommand,
	ToggleBookmarkCommand,
} = await import("@/commands");
const { getSceneSettings } = await import("@/project/scene-settings");

const LIVE_ID = "live-4h";
const AUDIO_ID = "audio-1h";
const IMAGE_ID = "foto";
const NO_DURATION_ID = "live-sem-duracao";
const LIVE_SECONDS = 4 * 60 * 60;

function ticks(seconds: number) {
	return mediaTime({ ticks: Math.round(seconds * TICKS_PER_SECOND) });
}

function video(id: string, startSeconds: number, seconds: number): VideoElement {
	return {
		id,
		type: "video",
		name: id,
		mediaId: LIVE_ID,
		startTime: ticks(startSeconds),
		duration: ticks(seconds),
		trimStart: ZERO_MEDIA_TIME,
		trimEnd: ZERO_MEDIA_TIME,
		sourceDuration: ticks(seconds),
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

function scene(id: string, isMain: boolean, elements: VideoElement[]): TScene {
	const tracks: SceneTracks = {
		overlay: [],
		main: {
			id: `${id}-main`,
			name: "Main",
			type: "video",
			muted: false,
			hidden: false,
			elements,
		},
		audio: [],
	};
	return {
		id,
		name: id,
		isMain,
		tracks,
		bookmarks: [],
		createdAt: new Date(0),
		updatedAt: new Date(0),
	};
}

function setup() {
	let project: TProject = {
		metadata: {
			id: "p1",
			name: "Teste",
			duration: ZERO_MEDIA_TIME,
			createdAt: new Date(0),
			updatedAt: new Date(0),
		},
		scenes: [],
		currentSceneId: "A",
		settings: {
			fps: { numerator: 30, denominator: 1 },
			canvasSize: { width: 1920, height: 1080 },
			background: { type: "color", color: "#000000" },
		},
		version: 1,
	};
	editor.project = {
		getActive: () => project,
		getActiveOrNull: () => project,
		setActiveProject: ({ project: next }: { project: TProject }) => {
			project = next;
		},
	};
	let assets: Array<Record<string, unknown>> = [
		{
			id: LIVE_ID,
			name: "live",
			type: "video",
			duration: LIVE_SECONDS,
			file: new File([], "live.mp4"),
		},
		{ id: AUDIO_ID, name: "audio", type: "audio", duration: 3600 },
		{ id: IMAGE_ID, name: "foto", type: "image" },
		{ id: NO_DURATION_ID, name: "sem", type: "video" },
	];
	editor.media = {
		getAssets: () => assets,
		setAssets: ({ assets: next }: { assets: typeof assets }) => {
			assets = next;
		},
	};
	editor.selection = {
		getSnapshot: () => ({}),
		applySelectionPatch: () => ({}),
		restoreSnapshot: () => {},
	};
	editor.save = { markDirty: () => {} };
	editor.scenes = new ScenesManager(editor);
	editor.timeline = new TimelineManager(editor);
	editor.command = new CommandManager(editor);

	editor.scenes.initializeScenes({
		scenes: [
			scene("A", true, [video("a1", 0, 10), video("a2", 10, 10)]),
			scene("B", false, [video("b1", 0, 20)]),
		],
		currentSceneId: "A",
	});
}

const tracksOf = (id: string): SceneTracks =>
	editor.scenes.getSceneById(id).tracks;
const run = (command: unknown) => editor.command.execute({ command });

beforeEach(setup);

const { detectSilences, clipRanges } = await import(
	"@/services/live-analysis/silence"
);

/** 500 trechos a manter espalhados pela live de 4 h. */
function makeKeeps(count: number, total: number): [number, number][] {
	const out: [number, number][] = [];
	const step = total / count;
	for (let i = 0; i < count; i++) {
		const s = i * step + 0.123 * (i % 7);
		out.push([s, s + step * 0.6 + 0.0371 * (i % 3)]);
	}
	return out;
}

function liveScene() {
	const el = {
		...video("live", 0, LIVE_SECONDS),
		sourceDuration: ticks(LIVE_SECONDS),
	};
	const audio = {
		...el,
		id: "live-audio",
		type: "audio" as const,
		sourceType: "upload" as const,
	};
	const s = scene("C", false, [el]);
	s.tracks.audio = [
		{ id: "C-audio", name: "a", type: "audio", muted: false, elements: [audio] },
	] as unknown as SceneTracks["audio"];
	editor.scenes.initializeScenes({
		scenes: [...editor.scenes.getScenes(), s],
		currentSceneId: "C",
	});
}

function checkInvariants(elements: VideoElement[] | SceneTracks["audio"][number]["elements"]) {
	const full = ticks(LIVE_SECONDS);
	let cursor = 0;
	let lastSrcEnd = -1;
	for (const el of elements) {
		expect(el.startTime as number).toBe(cursor); // sem buraco
		expect((el.trimStart + el.duration + el.trimEnd) as number).toBe(full);
		expect(el.sourceDuration as number).toBe(full);
		expect(el.duration as number).toBeGreaterThan(0);
		expect(el.trimStart as number).toBeGreaterThanOrEqual(lastSrcEnd);
		lastSrcEnd = el.trimStart + el.duration;
		cursor = (el.startTime + el.duration) as number;
	}
	return cursor;
}

describe("KeepRangesCommand", () => {
	test("500 trechos: invariantes, sem buraco, áudio junto, desfazer/refazer", () => {
		liveScene();
		const keeps = makeKeeps(500, LIVE_SECONDS);
		const before = structuredClone(tracksOf("C"));
		const t0 = performance.now();
		run(new KeepRangesCommand({ trackId: "C-main", elementId: "live", keeps }));
		const ms = performance.now() - t0;
		console.log(`KeepRanges 500 trechos: ${ms.toFixed(1)} ms`);
		const main = tracksOf("C").main.elements as VideoElement[];
		const audio = tracksOf("C").audio[0].elements;
		expect(main.length).toBe(500);
		expect(audio.length).toBe(500);
		expect(main[0].id).toBe("live");
		const end = checkInvariants(main);
		checkInvariants(audio);
		const expected = keeps.reduce(
			(sum, [s, e]) => sum + (ticks(e) - ticks(s)),
			0,
		);
		expect(end).toBe(expected);
		for (let i = 0; i < 500; i++) {
			expect(main[i].trimStart as number).toBe(ticks(keeps[i][0]) as number);
			expect(audio[i].startTime).toBe(main[i].startTime);
		}

		// outra cena aberta: desfazer volta C, sem mexer em A
		const aBefore = structuredClone(tracksOf("A"));
		editor.command.undo();
		expect(tracksOf("C")).toEqual(before);
		expect(tracksOf("A")).toEqual(aBefore);
		editor.command.redo();
		const again = tracksOf("C").main.elements;
		expect(again.length).toBe(500);
		expect(again.map((e) => e.id)).toEqual(main.map((e) => e.id));
	});

	test("trechos fora do clipe e sobrepostos são limitados", () => {
		liveScene();
		run(
			new KeepRangesCommand({
				trackId: "C-main",
				elementId: "live",
				keeps: [
					[-5, 10],
					[8, 20],
					[LIVE_SECONDS - 1, LIVE_SECONDS + 50],
				],
			}),
		);
		const main = tracksOf("C").main.elements as VideoElement[];
		expect(main.length).toBe(3);
		checkInvariants(main);
		expect(main[0].trimStart as number).toBe(0);
		expect(main[1].trimStart as number).toBe(ticks(10) as number);
		expect(main[2].trimEnd as number).toBe(0);
	});

	test("com ripple ligado o resultado é o mesmo (clipe sozinho)", () => {
		liveScene();
		editor.command.isRippleEnabled = true;
		try {
			const keeps = makeKeeps(50, LIVE_SECONDS);
			run(new KeepRangesCommand({ trackId: "C-main", elementId: "live", keeps }));
			checkInvariants(tracksOf("C").main.elements as VideoElement[]);
			checkInvariants(tracksOf("C").audio[0].elements);
		} finally {
			editor.command.isRippleEnabled = false;
		}
	});

	test("o que vem depois na mesma faixa anda para trás; cópia de vídeo não é cortada", () => {
		liveScene();
		const tracks = tracksOf("C");
		const liveEl = tracks.main.elements[0] as VideoElement;
		const outro = { ...video("outro", LIVE_SECONDS, 5), mediaId: "outra" };
		const copy = { ...liveEl, id: "copia" }; // enquadramento por cima
		editor.timeline.updateTracks(
			{
				...tracks,
				main: { ...tracks.main, elements: [liveEl, outro] },
				overlay: [{ ...tracks.main, id: "C-over", elements: [copy] }],
			},
			{ sceneId: "C" },
		);
		const keeps: [number, number][] = [
			[0, 100],
			[200, 300],
		];
		const spec = { trackId: "C-main", elementId: "live", keeps };
		expect(KeepRangesCommand.countPieces(spec)).toBe(4);
		run(new KeepRangesCommand(spec));
		const main = tracksOf("C").main.elements;
		expect(main.map((e) => e.id).slice(-1)).toEqual(["outro"]);
		expect(main.at(-1)?.startTime as number).toBe(ticks(200) as number);
		expect(tracksOf("C").overlay[0].elements.length).toBe(1);
		expect(tracksOf("C").audio[0].elements.length).toBe(2);
	});
});

describe("KeepRangesInNewSceneCommand", () => {
	const cut = (srcStart: number, srcEnd: number) => ({
		name: "Sem silêncios",
		mediaId: LIVE_ID,
		srcStart,
		srcEnd,
	});

	test("cria a cena cortada; desfazer tira; refazer volta igual", () => {
		const keeps: [number, number][] = makeKeeps(300, LIVE_SECONDS).map(
			([s, e]) => [s, e] as [number, number],
		);
		const spec = { cut: cut(10, LIVE_SECONDS), keeps };
		const count = KeepRangesInNewSceneCommand.countPieces(spec);
		expect(count).toBeGreaterThan(0);
		const mainBefore = structuredClone(tracksOf("A"));
		const command = new KeepRangesInNewSceneCommand(spec);
		run(command);
		const sceneId = command.getTargetSceneId() as string;
		expect(sceneId).not.toBeNull();
		const firstIds = tracksOf(sceneId).main.elements.map((e) => e.id);
		expect(firstIds.length).toBe(count);
		expect(command.getPieceCount()).toBe(count);
		expect(tracksOf("A")).toEqual(mainBefore); // principal intacta

		editor.command.undo();
		expect(editor.scenes.getSceneById(sceneId)).toBeNull();
		expect(editor.command.canRedo()).toBe(true);

		editor.command.redo();
		expect(editor.scenes.getSceneById(sceneId)).not.toBeNull();
		expect(tracksOf(sceneId).main.elements.map((e) => e.id)).toEqual(firstIds);
		expect(editor.command.canUndo()).toBe(true);

		editor.command.undo();
		expect(editor.scenes.getSceneById(sceneId)).toBeNull();
	});

	test("sem nada a cortar: conta 0 e não deixa cena no projeto", () => {
		const spec = { cut: cut(10, 20), keeps: [[100, 200]] as [number, number][] };
		expect(KeepRangesInNewSceneCommand.countPieces(spec)).toBe(0);
		const total = editor.scenes.getScenes().length;
		const command = new KeepRangesInNewSceneCommand(spec);
		run(command);
		expect(command.getPieceCount()).toBe(0);
		expect(editor.scenes.getScenes().length).toBe(total);
	});
});

describe("trechos a manter a partir dos silêncios", () => {
	// 60 s: fala 0–10, silêncio 10–20, fala 20–20.2 (curta), silêncio 20.2–30, fala 30–60
	function series() {
		const hop = 0.05;
		const n = Math.round(60 / hop) - 1;
		const rms = new Int16Array(n);
		for (let i = 0; i < n; i++) {
			const t = i * hop + 0.05;
			const loud = t < 10 || (t >= 20 && t < 20.2) || t >= 30;
			rms[i] = loud ? -2000 : -6000;
		}
		return { rmsDb: rms, frameCount: n, durationSec: 60 };
	}

	test("margem de 150 ms em volta da fala; todo trecho mantido tem 300 ms ou mais", () => {
		const r = detectSilences(series(), { deltaDb: 8, minSilenceSec: 0.5 });
		expect(r.silences.length).toBe(2);
		expect(r.silences[0][0]).toBeGreaterThan(10.1);
		expect(r.silences[0][0]).toBeLessThan(10.3);
		expect(r.silences[1][1]).toBeGreaterThan(29.7);
		expect(r.silences[1][1]).toBeLessThan(29.9);
		for (const [a, b] of r.keeps) expect(b - a).toBeGreaterThanOrEqual(0.3);
	});

	test("sem margem, a fala de 200 ms vira silêncio (mínimo de 300 ms)", () => {
		const r = detectSilences(series(), {
			deltaDb: 8,
			minSilenceSec: 0.5,
			marginSec: 0,
		});
		expect(r.silences.length).toBe(1);
		expect(r.keeps.length).toBe(2);
		for (const [a, b] of r.keeps) expect(b - a).toBeGreaterThanOrEqual(0.3);
	});

	test("clipRanges limita ao trecho do clipe e descarta pedaços curtos", () => {
		const keeps: [number, number][] = [
			[0, 10],
			[20, 20.1],
			[30, 60],
		];
		expect(clipRanges(keeps, 5, 40, 0.3)).toEqual([
			[5, 10],
			[30, 40],
		]);
		expect(clipRanges(keeps, 9.9, 30.1, 0.3)).toEqual([]);
	});
});
