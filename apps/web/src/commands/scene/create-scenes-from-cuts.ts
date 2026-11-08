import { Command, type CommandResult } from "@/commands/base-command";
import { EditorCore } from "@/core";
import type { MediaAsset } from "@/media/types";
import type { TCanvasSize } from "@/project/types";
import type {
	AudioTrack,
	SceneTracks,
	TScene,
	UploadAudioElement,
	VideoElement,
} from "@/timeline";
import { buildElementFromMedia } from "@/timeline/element-utils";
import { buildDefaultScene } from "@/timeline/scenes";
import { generateUUID } from "@/utils/id";
import {
	type MediaTime,
	roundMediaTime,
	subMediaTime,
	TICKS_PER_SECOND,
	ZERO_MEDIA_TIME,
} from "@/wasm";

/** Um trecho da mídia (em segundos da fonte) que vira uma cena. */
export interface CutSpec {
	name: string;
	mediaId: string;
	srcStart: number;
	srcEnd: number;
	canvasSize?: TCanvasSize;
	/** Duração total da mídia, em segundos. Sem ela, usa a da mídia no projeto. */
	sourceDuration?: number;
}

function secondsToTicks(seconds: number): MediaTime {
	return roundMediaTime({ time: seconds * TICKS_PER_SECOND });
}

function validDuration(seconds: number | undefined): number | null {
	return seconds !== undefined && Number.isFinite(seconds) && seconds > 0
		? seconds
		: null;
}

/**
 * Trecho efetivo (em segundos), já limitado a [0, duração da mídia].
 * `null` quando o trecho fica vazio ou os números não valem.
 */
export function effectiveCutRange({
	cut,
	sourceDurationSeconds,
}: {
	cut: Pick<CutSpec, "srcStart" | "srcEnd">;
	sourceDurationSeconds: number;
}): { srcStart: number; srcEnd: number } | null {
	if (
		!Number.isFinite(cut.srcStart) ||
		!Number.isFinite(cut.srcEnd) ||
		!Number.isFinite(sourceDurationSeconds) ||
		sourceDurationSeconds <= 0
	) {
		return null;
	}
	const srcStart = Math.min(Math.max(0, cut.srcStart), sourceDurationSeconds);
	const srcEnd = Math.min(cut.srcEnd, sourceDurationSeconds);
	if (secondsToTicks(srcEnd) <= secondsToTicks(srcStart)) return null;
	return { srcStart, srcEnd };
}

/**
 * Monta as faixas de uma cena de corte: um único elemento da mídia, começando
 * em 0, com trimStart = srcStart e trimEnd = (fim da mídia - srcEnd).
 * Vídeo vai na faixa principal com o próprio áudio ligado; áudio vai numa
 * faixa de áudio. Invariante (em ticks):
 * trimStart + duration + trimEnd = sourceDuration.
 * Sem duração conhecida da mídia, não monta (não dá para inventar o fim).
 */
export function buildCutSceneTracks({
	baseTracks,
	cut,
	mediaType,
	sourceDurationSeconds,
}: {
	baseTracks: SceneTracks;
	cut: CutSpec;
	mediaType: "video" | "audio";
	sourceDurationSeconds: number;
}): SceneTracks | null {
	const range = effectiveCutRange({ cut, sourceDurationSeconds });
	if (!range) return null;

	const fullDuration = secondsToTicks(sourceDurationSeconds);
	const srcStart = secondsToTicks(range.srcStart);
	const srcEnd = secondsToTicks(range.srcEnd);
	const duration = subMediaTime({ a: srcEnd, b: srcStart });
	const trimEnd = subMediaTime({ a: fullDuration, b: srcEnd });

	const base = buildElementFromMedia({
		mediaId: cut.mediaId,
		mediaType,
		name: cut.name,
		duration,
		startTime: ZERO_MEDIA_TIME,
	});

	const timing = {
		startTime: ZERO_MEDIA_TIME,
		duration,
		trimStart: srcStart,
		trimEnd,
		sourceDuration: fullDuration,
	};

	if (mediaType === "video") {
		const element = {
			...base,
			...timing,
			id: generateUUID(),
		} as VideoElement;
		return {
			...baseTracks,
			main: { ...baseTracks.main, elements: [element] },
		};
	}

	const element = {
		...base,
		...timing,
		id: generateUUID(),
	} as UploadAudioElement;
	const audioTrack: AudioTrack = {
		id: generateUUID(),
		name: cut.name,
		type: "audio",
		muted: false,
		elements: [element],
	};
	return { ...baseTracks, audio: [audioTrack] };
}

/**
 * Monta as cenas de corte (sem mexer no editor). Pula: mídia que não está no
 * projeto, imagem, mídia sem duração conhecida e trecho vazio.
 * Quem chama pode usar para conferir se há algo a criar antes de rodar o
 * comando (assim um passo vazio não entra no histórico).
 */
export function buildCutScenes({
	cuts,
	assets,
}: {
	cuts: CutSpec[];
	assets: Pick<MediaAsset, "id" | "type" | "duration">[];
}): TScene[] {
	const created: TScene[] = [];
	for (const cut of cuts) {
		const asset = assets.find((item) => item.id === cut.mediaId);
		if (!asset || asset.type === "image") continue;
		const sourceDurationSeconds =
			validDuration(cut.sourceDuration) ?? validDuration(asset.duration);
		if (sourceDurationSeconds === null) continue;
		const range = effectiveCutRange({ cut, sourceDurationSeconds });
		if (!range) continue;

		const scene = buildDefaultScene({ name: cut.name, isMain: false });
		const tracks = buildCutSceneTracks({
			baseTracks: scene.tracks,
			cut,
			mediaType: asset.type === "audio" ? "audio" : "video",
			sourceDurationSeconds,
		});
		if (!tracks) continue;

		created.push({
			...scene,
			tracks,
			kind: "corte",
			sourceRange: {
				mediaId: cut.mediaId,
				srcStart: range.srcStart,
				srcEnd: range.srcEnd,
			},
			...(cut.canvasSize ? { canvasSize: { ...cut.canvasSize } } : {}),
		});
	}
	return created;
}

/**
 * Cria várias cenas de uma vez, uma por trecho, todas apontando para a mesma
 * mídia (a live não é copiada). Um único passo de desfazer remove todas.
 *
 * Antes de rodar, confira `buildCutScenes(...).length > 0` (ou
 * `CreateScenesFromCutsCommand.hasScenesToCreate`): se nenhum trecho valer,
 * não rode o comando, para não gastar um passo de desfazer vazio.
 */
export class CreateScenesFromCutsCommand extends Command {
	private savedScenes: TScene[] | null = null;
	private savedActiveSceneId: string | null = null;
	private createdScenes: TScene[] = [];
	private readonly cuts: CutSpec[];

	constructor({ cuts }: { cuts: CutSpec[] }) {
		super();
		this.cuts = cuts;
	}

	/** Se algum trecho vira cena com as mídias atuais do projeto. */
	static hasScenesToCreate({ cuts }: { cuts: CutSpec[] }): boolean {
		return (
			buildCutScenes({
				cuts,
				assets: EditorCore.getInstance().media.getAssets(),
			}).length > 0
		);
	}

	execute(): CommandResult | undefined {
		const editor = EditorCore.getInstance();
		const scenes = editor.scenes.getScenes();
		this.savedScenes = [...scenes];
		this.savedActiveSceneId = editor.scenes.getActiveSceneOrNull()?.id ?? null;

		// Refazer reaproveita as mesmas cenas (mesmos ids) da primeira vez.
		if (this.createdScenes.length === 0) {
			this.createdScenes = buildCutScenes({
				cuts: this.cuts,
				assets: editor.media.getAssets(),
			});
		}

		if (this.createdScenes.length === 0) {
			return undefined;
		}

		editor.scenes.setScenes({
			scenes: [...this.savedScenes, ...this.createdScenes],
		});
		return undefined;
	}

	undo(): void {
		if (!this.savedScenes || this.createdScenes.length === 0) return;
		const editor = EditorCore.getInstance();
		const createdIds = new Set(this.createdScenes.map((scene) => scene.id));
		const activeId = editor.scenes.getActiveSceneOrNull()?.id ?? null;
		// Só tira as cenas criadas; as outras ficam como estão agora.
		const remaining = editor.scenes
			.getScenes()
			.filter((scene) => !createdIds.has(scene.id));
		// Se a cena aberta é uma das criadas, volta para a que estava aberta
		// quando os cortes foram criados (ou, se ela sumiu, para a principal).
		let fallbackId: string | undefined;
		if (activeId && createdIds.has(activeId)) {
			const previous = remaining.find(
				(scene) => scene.id === this.savedActiveSceneId,
			);
			fallbackId =
				previous?.id ??
				remaining.find((scene) => scene.isMain)?.id ??
				remaining[0]?.id;
		}
		editor.scenes.setScenes({
			scenes: remaining,
			activeSceneId: fallbackId,
		});
	}

	getSceneIds(): string[] {
		return this.createdScenes.map((scene) => scene.id);
	}
}

/** Número do próximo corte: continua depois do maior que já existe (sem repetir nomes). */
export function nextCutNumber(scenes: Pick<TScene, "kind" | "name">[]): number {
	let max = 0;
	for (const s of scenes) {
		if (s.kind !== "corte") continue;
		// só o número do formato padrão ("Corte 05 - …", "Clip 05 - …"): nome mudado pela pessoa
		// com ano ou placar ("Live 2024") não conta
		const found = /^\S+\s+(\d{1,4})\s+-/.exec(s.name.trim());
		const n = found ? Number(found[1]) : 0;
		max = Math.max(max, Number.isFinite(n) ? n : 0);
	}
	return max + 1;
}
