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

describe("desfazer por cena", () => {
	test("editar A, trocar para B, desfazer: B intacta e A volta", async () => {
		const aBefore = structuredClone(tracksOf("A"));
		const bBefore = structuredClone(tracksOf("B"));

		run(
			new DeleteElementsCommand({
				elements: [{ trackId: "A-main", elementId: "a1" }],
			}),
		);
		expect(tracksOf("A").main.elements.map((e) => e.id)).toEqual(["a2"]);

		await editor.scenes.switchToScene({ sceneId: "B" });
		editor.command.undo();

		expect(editor.scenes.getActiveScene().id).toBe("B");
		expect(tracksOf("B")).toEqual(bBefore);
		expect(tracksOf("A")).toEqual(aBefore);

		// Refazer também vai para A, não para B.
		editor.command.redo();
		expect(tracksOf("A").main.elements.map((e) => e.id)).toEqual(["a2"]);
		expect(tracksOf("B")).toEqual(bBefore);
	});

	test("vários tipos de comando, desfeitos com outra cena aberta", async () => {
		const aBefore = structuredClone(tracksOf("A"));
		const bBefore = structuredClone(tracksOf("B"));

		run(new ToggleTrackMuteCommand("A-main"));
		run(
			new SplitElementsCommand({
				elements: [{ trackId: "A-main", elementId: "a1" }],
				splitTime: ticks(5),
			}),
		);
		run(
			new UpdateElementsCommand({
				updates: [
					{ trackId: "A-main", elementId: "a2", patch: { name: "novo" } },
				],
			}),
		);
		const before = tracksOf("A");
		const after = { ...before, overlay: [] };
		editor.command.push({
			command: new TracksSnapshotCommand({ before, after }),
		});
		expect(tracksOf("A").main.elements.length).toBe(3);

		await editor.scenes.switchToScene({ sceneId: "B" });
		for (let i = 0; i < 4; i++) editor.command.undo();

		expect(tracksOf("A")).toEqual(aBefore);
		expect(tracksOf("B")).toEqual(bBefore);
		expect(editor.scenes.getActiveScene().id).toBe("B");
	});

	test("marcador: refazer volta na cena original", async () => {
		run(new ToggleBookmarkCommand(ticks(3)));
		expect(editor.scenes.getSceneById("A").bookmarks.length).toBe(1);
		editor.command.undo();
		await editor.scenes.switchToScene({ sceneId: "B" });
		editor.command.redo();
		expect(editor.scenes.getSceneById("A").bookmarks.length).toBe(1);
		expect(editor.scenes.getSceneById("B").bookmarks.length).toBe(0);
	});
});

describe("cenas a partir de trechos", () => {
	test("cria 20 cenas num passo e desfaz tudo num passo", () => {
		const cuts = Array.from({ length: 20 }, (_, i) => {
			const srcStart = 600 + i * 600 + 0.3333; // espalhados pela live de 4 h
			return {
				name: `Corte ${String(i + 1).padStart(2, "0")}`,
				mediaId: LIVE_ID,
				srcStart,
				srcEnd: srcStart + 45.5 + (i % 3) * 7,
				canvasSize: { width: 1080, height: 1920 },
			};
		});
		const scenesBefore = editor.scenes.getScenes();
		const command = new CreateScenesFromCutsCommand({ cuts });
		run(command);

		const ids: string[] = command.getSceneIds();
		expect(ids.length).toBe(20);
		expect(editor.scenes.getScenes().length).toBe(scenesBefore.length + 20);
		expect(editor.scenes.getActiveScene().id).toBe("A");

		const fullTicks = ticks(LIVE_SECONDS);
		ids.forEach((id, i) => {
			const created: TScene = editor.scenes.getSceneById(id);
			expect(created.kind).toBe("corte");
			expect(created.canvasSize).toEqual({ width: 1080, height: 1920 });
			expect(created.sourceRange).toEqual({
				mediaId: LIVE_ID,
				srcStart: cuts[i].srcStart,
				srcEnd: cuts[i].srcEnd,
			});
			const els = created.tracks.main.elements;
			expect(els.length).toBe(1);
			const el = els[0] as VideoElement;
			expect(el.type).toBe("video");
			expect(el.mediaId).toBe(LIVE_ID);
			expect(el.isSourceAudioEnabled).toBe(true);
			expect(el.startTime).toBe(0);
			for (const v of [el.trimStart, el.trimEnd, el.duration]) {
				expect(Number.isInteger(v)).toBe(true);
				expect(v).toBeGreaterThanOrEqual(0);
			}
			expect(el.sourceDuration).toBe(fullTicks);
			expect(el.trimStart + el.duration + el.trimEnd).toBe(fullTicks);
			expect(el.trimStart).toBe(ticks(cuts[i].srcStart));
			expect(el.duration / TICKS_PER_SECOND).toBeCloseTo(
				cuts[i].srcEnd - cuts[i].srcStart,
				4,
			);
		});

		editor.command.undo();
		expect(editor.scenes.getScenes().map((s: TScene) => s.id)).toEqual(
			scenesBefore.map((s: TScene) => s.id),
		);

		editor.command.redo();
		expect(command.getSceneIds()).toEqual(ids);
		expect(editor.scenes.getScenes().length).toBe(scenesBefore.length + 20);
	});

	test("trecho além do fim da live é cortado no fim; trecho vazio é ignorado", () => {
		const command = new CreateScenesFromCutsCommand({
			cuts: [
				{ name: "fim", mediaId: LIVE_ID, srcStart: LIVE_SECONDS - 20, srcEnd: LIVE_SECONDS + 50 },
				{ name: "vazio", mediaId: LIVE_ID, srcStart: 30, srcEnd: 30 },
			],
		});
		run(command);
		expect(command.getSceneIds().length).toBe(1);
		const el = editor.scenes.getSceneById(command.getSceneIds()[0]).tracks
			.main.elements[0] as VideoElement;
		expect(el.trimEnd).toBe(0);
		expect(el.duration).toBe(ticks(20));
	});

	test("desfazer com uma cena de corte aberta volta para a cena de antes", async () => {
		await editor.scenes.switchToScene({ sceneId: "B" });
		const command = new CreateScenesFromCutsCommand({
			cuts: [{ name: "c", mediaId: LIVE_ID, srcStart: 10, srcEnd: 40 }],
		});
		run(command);
		await editor.scenes.switchToScene({ sceneId: command.getSceneIds()[0] });
		editor.command.undo();
		expect(editor.scenes.getActiveScene().id).toBe("B");
	});

	test("se a cena de antes sumiu, o desfazer cai na principal", async () => {
		await editor.scenes.switchToScene({ sceneId: "B" });
		const command = new CreateScenesFromCutsCommand({
			cuts: [{ name: "c", mediaId: LIVE_ID, srcStart: 10, srcEnd: 40 }],
		});
		run(command);
		const cutId = command.getSceneIds()[0];
		await editor.scenes.switchToScene({ sceneId: cutId });
		editor.scenes.setScenes({
			scenes: editor.scenes.getScenes().filter((s: TScene) => s.id !== "B"),
		});
		editor.command.undo();
		expect(editor.scenes.getActiveScene().id).toBe("A");
	});

	test("trecho fora da live: sourceRange igual ao trecho do elemento", () => {
		const command = new CreateScenesFromCutsCommand({
			cuts: [
				{ name: "fim", mediaId: LIVE_ID, srcStart: LIVE_SECONDS - 20, srcEnd: LIVE_SECONDS + 50 },
				{ name: "inicio", mediaId: LIVE_ID, srcStart: -2, srcEnd: 8 },
			],
		});
		run(command);
		const [fim, inicio] = command
			.getSceneIds()
			.map((id: string) => editor.scenes.getSceneById(id) as TScene);
		expect(fim.sourceRange).toEqual({
			mediaId: LIVE_ID,
			srcStart: LIVE_SECONDS - 20,
			srcEnd: LIVE_SECONDS,
		});
		expect(inicio.sourceRange).toEqual({ mediaId: LIVE_ID, srcStart: 0, srcEnd: 8 });
		for (const created of [fim, inicio]) {
			const el = created.tracks.main.elements[0] as VideoElement;
			const range = created.sourceRange;
			if (!range) throw new Error("sem sourceRange");
			expect(el.trimStart).toBe(ticks(range.srcStart));
			expect(el.trimStart + el.duration).toBe(ticks(range.srcEnd));
		}
	});

	test("mídia só de áudio vira faixa de áudio; principal fica vazia", () => {
		const command = new CreateScenesFromCutsCommand({
			cuts: [{ name: "a", mediaId: AUDIO_ID, srcStart: 100.25, srcEnd: 150 }],
		});
		run(command);
		const created: TScene = editor.scenes.getSceneById(command.getSceneIds()[0]);
		expect(created.tracks.main.elements.length).toBe(0);
		expect(created.tracks.audio.length).toBe(1);
		const el = created.tracks.audio[0].elements[0];
		expect(el.type).toBe("audio");
		if (el.type !== "audio" || !("mediaId" in el)) throw new Error("tipo");
		expect(el.mediaId).toBe(AUDIO_ID);
		const full = ticks(3600);
		expect(el.sourceDuration).toBe(full);
		expect(el.trimStart).toBe(ticks(100.25));
		expect(el.trimStart + el.duration + el.trimEnd).toBe(full);
	});

	test("imagem, mídia fora do projeto e mídia sem duração são ignoradas", () => {
		const cuts = [
			{ name: "img", mediaId: IMAGE_ID, srcStart: 0, srcEnd: 5 },
			{ name: "sumiu", mediaId: "nao-existe", srcStart: 0, srcEnd: 5 },
			{ name: "sem", mediaId: NO_DURATION_ID, srcStart: 600, srcEnd: 650 },
		];
		expect(CreateScenesFromCutsCommand.hasScenesToCreate({ cuts })).toBe(false);
		const command = new CreateScenesFromCutsCommand({ cuts });
		command.execute();
		expect(command.getSceneIds()).toEqual([]);
		expect(editor.scenes.getScenes().length).toBe(2);

		// Com a duração informada no corte, a mídia sem duração vale.
		const withDuration = [{ ...cuts[2], sourceDuration: 7200 }];
		expect(
			CreateScenesFromCutsCommand.hasScenesToCreate({ cuts: withDuration }),
		).toBe(true);
	});
});

describe("marcadores em lote e formato da cena", () => {
	test("AddBookmarksCommand põe vários marcadores na cena indicada", () => {
		run(
			new AddBookmarksCommand({
				sceneId: "B",
				bookmarks: [
					{ time: ticks(30), duration: ticks(40), note: "8.5" },
					{ time: ticks(5), color: "#d4af37" },
					{ time: ticks(90) },
				],
			}),
		);
		const marks = editor.scenes.getSceneById("B").bookmarks;
		expect(marks.map((b: { time: number }) => b.time)).toEqual([
			ticks(5),
			ticks(30),
			ticks(90),
		]);
		expect(editor.scenes.getSceneById("A").bookmarks.length).toBe(0);
		editor.command.undo();
		expect(editor.scenes.getSceneById("B").bookmarks.length).toBe(0);
	});

	test("getSceneSettings usa o formato da cena ou o do projeto", () => {
		const project = editor.project.getActive();
		expect(getSceneSettings({ scene: tracksOf("A") && editor.scenes.getSceneById("A"), project }).canvasSize)
			.toEqual({ width: 1920, height: 1080 });
		const vertical = getSceneSettings({
			scene: { canvasSize: { width: 1080, height: 1920 } },
			project,
		});
		expect(vertical.canvasSize).toEqual({ width: 1080, height: 1920 });
		expect(vertical.fps).toEqual(project.settings.fps);
		expect(getSceneSettings({ scene: null, project })).toBe(project.settings);
		expect(
			getSceneSettings({
				scene: { canvasSize: { width: 0, height: 0 } },
				project,
			}),
		).toBe(project.settings);
	});
});

describe("histórico e cenas que somem", () => {
	test("remover mídia: refazer com outra cena aberta limpa a cena certa, sem passo extra", async () => {
		const aBefore = structuredClone(tracksOf("A"));
		const bBefore = structuredClone(tracksOf("B"));
		run(new RemoveMediaAssetCommand({ projectId: "p1", assetId: LIVE_ID }));
		expect(tracksOf("A").main.elements.length).toBe(0);
		expect(tracksOf("B").main.elements.length).toBe(0);

		editor.command.undo();
		expect(tracksOf("A")).toEqual(aBefore);
		expect(tracksOf("B")).toEqual(bBefore);

		await editor.scenes.switchToScene({ sceneId: "B" });
		editor.command.redo();
		expect(tracksOf("A").main.elements.length).toBe(0);
		expect(tracksOf("B").main.elements.length).toBe(0);
		expect(
			editor.media.getAssets().some((a: { id: string }) => a.id === LIVE_ID),
		).toBe(false);
		// Um passo só no histórico (nada de DeleteElements aninhado).
		editor.command.undo();
		expect(editor.command.canUndo()).toBe(false);
		expect(tracksOf("A")).toEqual(aBefore);
	});

	test("comando de uma cena que sumiu é descartado, não cai na cena aberta", async () => {
		run(
			new DeleteElementsCommand({
				elements: [{ trackId: "A-main", elementId: "a1" }],
			}),
		);
		editor.command.undo();
		await editor.scenes.switchToScene({ sceneId: "B" });
		// A cena A some (por exemplo, outro projeto foi aberto).
		editor.scenes.setScenes({
			scenes: editor.scenes.getScenes().filter((s: TScene) => s.id !== "A"),
		});
		const bBefore = structuredClone(tracksOf("B"));
		editor.command.redo();
		expect(tracksOf("B")).toEqual(bBefore);
		expect(editor.command.canRedo()).toBe(false);
	});

	test("abrir outro projeto limpa o histórico", () => {
		run(
			new DeleteElementsCommand({
				elements: [{ trackId: "A-main", elementId: "a1" }],
			}),
		);
		expect(editor.command.canUndo()).toBe(true);
		editor.scenes.clearScenes();
		editor.scenes.initializeScenes({
			scenes: [scene("P2", true, [video("p", 0, 5)])],
			currentSceneId: "P2",
		});
		expect(editor.command.canUndo()).toBe(false);
		expect(editor.command.canRedo()).toBe(false);
	});

	test("reatores recebem a cena do comando no refazer", async () => {
		const seen: Array<string | null> = [];
		editor.command.registerReactor(({ sceneId }: { sceneId: string | null }) =>
			seen.push(sceneId),
		);
		run(
			new DeleteElementsCommand({
				elements: [{ trackId: "A-main", elementId: "a1" }],
			}),
		);
		editor.command.undo();
		await editor.scenes.switchToScene({ sceneId: "B" });
		editor.command.redo();
		expect(seen).toEqual(["A", "A"]);
	});
});
