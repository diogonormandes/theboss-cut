/**
 * Aplica o enquadramento 9:16 às cenas de corte (kind "corte", com
 * sourceRange e canvasSize). Tudo num único passo de desfazer.
 *
 * - "centered": vídeo cobre o canvas, centralizado.
 * - "split": acha a facecam em ~20 quadros espalhados pela live (caixa média);
 *   câmera em cima (faixa principal, com o som) e jogo embaixo (faixa nova
 *   por cima, sem som). Sem rosto: fica centralizado e avisa.
 * - "follow": acha o rosto 3 vezes por segundo só no trecho do corte, suaviza
 *   e grava keyframes de posição X (~1 por segundo).
 *
 * Vale para todos os pedaços da live na faixa principal (ex.: depois do corte
 * de silêncios): cada pedaço recebe a escala/posição; no Seguir rosto, os
 * keyframes usam o tempo local de cada pedaço (t da fonte − início do
 * pedaço); no Dividido, cada pedaço ganha a sua cópia do jogo, no mesmo lugar.
 *
 * As análises são feitas antes; as faixas novas são montadas só na hora de
 * executar o comando, a partir da cena como está naquele momento (o que a
 * pessoa editou durante a análise não se perde).
 */
import { setChannel } from "@/animation/keyframes";
import type { ScalarAnimationKey } from "@/animation/types";
import { Command, type CommandResult } from "@/commands/base-command";
import type { EditorCore } from "@/core";
import { t } from "@/i18n";
import { getSceneSettings } from "@/project/scene-settings";
import type {
	OverlayTrack,
	SceneTracks,
	TScene,
	VideoElement,
	VideoTrack,
} from "@/timeline";
import { generateUUID } from "@/utils/id";
import { roundMediaTime, TICKS_PER_SECOND } from "@/wasm";
import {
	averageBox,
	coverPlacement,
	followPositionX,
	type KeyPoint,
	keyPointsForPiece,
	type NormBox,
	type Size,
	sampleTimes,
	smoothFaceTrack,
	splitLayout,
	toKeyPoints,
} from "./framing-math";
import { detectFaces } from "./service";

export type FramingMode = "centered" | "split" | "follow";

export interface ApplyFramingResult {
	/** cenas que receberam o enquadramento pedido */
	applied: string[];
	/** cenas que ficaram centralizadas por não achar rosto */
	noFace: string[];
	/** cenas que ficaram centralizadas porque o vídeo não pôde ser lido */
	unreadable: string[];
	/** tempo total, em ms */
	elapsedMs: number;
}

/**
 * Quadros espalhados pela live para achar a facecam fixa (modo Dividido).
 * 20 em vez de 10: o rosto some em alguns quadros (olhando para o lado);
 * custa ~1 s a mais.
 */
const SPLIT_SAMPLES = 20;
/** Quadros por segundo analisados no modo Seguir rosto. */
const FOLLOW_SAMPLES_PER_SECOND = 3;

const POSITION_X = "transform.positionX";

function secondsToTicks(seconds: number) {
	return roundMediaTime({ time: seconds * TICKS_PER_SECOND });
}

function ticksToSeconds(ticks: number): number {
	return ticks / TICKS_PER_SECOND;
}

function isCutScene(
	scene: TScene | null,
): scene is TScene & Required<Pick<TScene, "sourceRange">> {
	return !!scene && scene.kind === "corte" && !!scene.sourceRange;
}

/** Todos os pedaços da live na faixa principal (em ordem). */
function findLiveElements(
	tracks: SceneTracks,
	mediaId: string,
): VideoElement[] {
	return tracks.main.elements.filter(
		(item): item is VideoElement =>
			item.type === "video" && item.mediaId === mediaId,
	);
}

/** Tira o enquadramento anterior (faixa do jogo). */
export function withoutPreviousFraming(
	tracks: SceneTracks,
	mediaId: string,
): SceneTracks {
	const overlay = tracks.overlay.filter(
		(track) =>
			!(
				track.type === "video" &&
				track.elements.length > 0 &&
				track.elements.every(
					(el) => el.type === "video" && el.mediaId === mediaId,
				)
			),
	);
	return { ...tracks, overlay };
}

function placeElement(
	element: VideoElement,
	placement: { scale: number; positionX: number; positionY: number },
): VideoElement {
	return {
		...element,
		animations: setChannel({
			animations: element.animations,
			propertyPath: POSITION_X,
			channel: undefined,
		}),
		params: {
			...element.params,
			"transform.scaleX": placement.scale,
			"transform.scaleY": placement.scale,
			"transform.positionX": placement.positionX,
			"transform.positionY": placement.positionY,
			"transform.rotate": 0,
		},
	};
}

/** Troca os pedaços da live na faixa principal pelo que `place` devolver. */
function replaceLiveElements(
	tracks: SceneTracks,
	mediaId: string,
	place: (element: VideoElement) => VideoElement,
): SceneTracks {
	return {
		...tracks,
		main: {
			...tracks.main,
			elements: tracks.main.elements.map((item) =>
				item.type === "video" && item.mediaId === mediaId
					? place(item as VideoElement)
					: item,
			),
		},
	};
}

/** Monta as faixas do modo centralizado (pura, exportada para teste). */
export function buildCenteredTracks({
	tracks,
	mediaId,
	canvas,
	source,
}: {
	tracks: SceneTracks;
	mediaId: string;
	canvas: Size;
	source: Size;
}): SceneTracks {
	const cover = coverPlacement(canvas, source);
	return replaceLiveElements(tracks, mediaId, (element) =>
		placeElement(element, { scale: cover.scale, positionX: 0, positionY: 0 }),
	);
}

/** Monta as faixas do modo Dividido (pura, exportada para teste). */
export function buildSplitTracks({
	tracks,
	mediaId,
	canvas,
	source,
	face,
}: {
	tracks: SceneTracks;
	mediaId: string;
	canvas: Size;
	source: Size;
	face: NormBox;
}): SceneTracks {
	const pieces = findLiveElements(tracks, mediaId);
	if (pieces.length === 0) return tracks;
	const layout = splitLayout({ face, source, canvas });
	// uma cópia do jogo por pedaço, no mesmo lugar e com o mesmo trecho
	const games: VideoElement[] = pieces.map((element) => ({
		...placeElement(element, layout.game),
		id: generateUUID(),
		name: t("framing.gameTrack"),
		isSourceAudioEnabled: false,
	}));
	const gameTrack: VideoTrack = {
		id: generateUUID(),
		name: t("framing.gameTrack"),
		type: "video",
		elements: games,
		muted: true,
		hidden: false,
	};
	const withCam = replaceLiveElements(tracks, mediaId, (element) =>
		placeElement(element, layout.cam),
	);
	return {
		...withCam,
		overlay: [gameTrack as OverlayTrack, ...withCam.overlay],
	};
}

/** Monta as faixas do modo Seguir rosto (pura, exportada para teste). */
export function buildFollowTracks({
	tracks,
	mediaId,
	canvas,
	source,
	points,
}: {
	tracks: SceneTracks;
	mediaId: string;
	canvas: Size;
	source: Size;
	/** t = segundos da FONTE (live); x = centro do rosto (0 a 1) */
	points: KeyPoint[];
}): SceneTracks {
	const cover = coverPlacement(canvas, source);
	const toPosition = (fx: number) =>
		Math.round(
			followPositionX({
				fx,
				renderedWidth: cover.renderedWidth,
				canvasWidth: canvas.width,
			}) * 10,
		) / 10 || 0;
	return replaceLiveElements(tracks, mediaId, (element) => {
		const start = ticksToSeconds(element.trimStart);
		const end = start + ticksToSeconds(element.duration);
		const local = keyPointsForPiece(points, start, end);
		const placed = placeElement(element, {
			scale: cover.scale,
			positionX: local[0] ? toPosition(local[0].x) : 0,
			positionY: 0,
		});
		const distinct = new Set(local.map((p) => toPosition(p.x)));
		if (local.length < 2 || distinct.size < 2) return placed;
		const keys: ScalarAnimationKey[] = local.map((p) => ({
			id: generateUUID(),
			time: secondsToTicks(Math.max(0, p.t)),
			value: toPosition(p.x),
			segmentToNext: p.hold ? "step" : "bezier",
			tangentMode: "flat",
		}));
		return {
			...placed,
			animations: setChannel({
				animations: placed.animations,
				propertyPath: POSITION_X,
				channel: { keys },
			}),
		};
	});
}

/** O que fazer numa cena; as faixas são montadas na hora de executar. */
export interface FramingPlan {
	sceneId: string;
	/** recebe as faixas atuais e devolve as novas (null = não mexe) */
	build: (tracks: SceneTracks) => SceneTracks | null;
}

/** Um passo de desfazer para todas as cenas mexidas. */
export class ApplyFramingCommand extends Command {
	private readonly editor: EditorCore;
	private readonly plans: FramingPlan[];
	private changes: {
		sceneId: string;
		before: SceneTracks;
		after: SceneTracks;
	}[] = [];
	private built = false;

	constructor(editor: EditorCore, plans: FramingPlan[]) {
		super();
		this.editor = editor;
		this.plans = plans;
	}

	execute(): CommandResult | undefined {
		if (!this.built) {
			// 1ª vez: parte da cena como está agora
			this.built = true;
			for (const plan of this.plans) {
				const scene = this.editor.scenes.getSceneById(plan.sceneId);
				if (!scene) continue;
				const after = plan.build(scene.tracks);
				if (!after) continue;
				this.changes.push({ sceneId: plan.sceneId, before: scene.tracks, after });
			}
		}
		this.write("after");
		return undefined;
	}

	undo(): void {
		this.write("before");
	}

	/** Cenas que o comando de fato mudou. */
	getChangedSceneIds(): string[] {
		return this.changes.map((change) => change.sceneId);
	}

	private write(which: "before" | "after"): void {
		const editor = this.editor;
		for (const change of this.changes) {
			if (!editor.scenes.getSceneById(change.sceneId)) continue;
			editor.timeline.updateTracks(change[which], { sceneId: change.sceneId });
		}
	}

	/**
	 * A primeira cena mexida que ainda existe: o passo só é descartado quando
	 * todas sumiram (cena apagada é pulada em `write`).
	 */
	getTargetSceneId(): string | null {
		const ids = this.built
			? this.changes.map((change) => change.sceneId)
			: this.plans.map((plan) => plan.sceneId);
		return (
			ids.find((id) => this.editor.scenes.getSceneById(id) !== null) ??
			ids[0] ??
			null
		);
	}
}

/**
 * Aplica o enquadramento às cenas de corte indicadas. Cenas que não são de
 * corte (ou sem o vídeo da live) são ignoradas. Uma análise de cada vez.
 */
export async function applyFraming({
	editor,
	sceneIds,
	mode,
}: {
	editor: EditorCore;
	sceneIds: string[];
	mode: FramingMode;
}): Promise<ApplyFramingResult> {
	const started = performance.now();
	const result: ApplyFramingResult = {
		applied: [],
		noFace: [],
		unreadable: [],
		elapsedMs: 0,
	};
	const project = editor.project.getActive();
	const assets = editor.media.getAssets();
	const plans: FramingPlan[] = [];
	// facecam média por live (modo Dividido): analisa a live uma vez só
	const splitCache = new Map<
		string,
		Promise<{ face: NormBox | null; source: Size } | null>
	>();

	for (const sceneId of sceneIds) {
		const scene = editor.scenes.getSceneById(sceneId);
		if (!isCutScene(scene)) continue;
		const mediaId = scene.sourceRange.mediaId;
		const asset = assets.find((item) => item.id === mediaId);
		if (!asset || asset.type !== "video") continue;
		if (findLiveElements(scene.tracks, mediaId).length === 0) continue;
		const canvas = getSceneSettings({ scene, project }).canvasSize;
		let source: Size = {
			width: asset.width || 1920,
			height: asset.height || 1080,
		};

		type Plan =
			| {
					kind: "centered";
					outcome: keyof Omit<ApplyFramingResult, "elapsedMs">;
			  }
			| { kind: "split"; face: NormBox }
			| { kind: "follow"; points: KeyPoint[] };
		let plan: Plan;
		try {
			if (mode === "split") {
				let pending = splitCache.get(asset.id);
				if (!pending) {
					const duration = asset.duration ?? scene.sourceRange.srcEnd;
					pending = detectFaces({
						file: asset.file,
						times: sampleTimes({
							start: 0,
							end: duration,
							perSecond: SPLIT_SAMPLES / Math.max(1, duration),
							maxCount: SPLIT_SAMPLES,
						}),
					}).then((detection) => ({
						source: {
							width: detection.sourceWidth,
							height: detection.sourceHeight,
						},
						face: averageBox(
							detection.frames.flatMap((f) => (f.face ? [f.face] : [])),
						),
					}));
					splitCache.set(asset.id, pending);
				}
				const found = await pending;
				if (found) source = found.source;
				plan = found?.face
					? { kind: "split", face: found.face }
					: { kind: "centered", outcome: "noFace" };
			} else if (mode === "follow") {
				const { srcStart, srcEnd } = scene.sourceRange;
				const detection = await detectFaces({
					file: asset.file,
					times: sampleTimes({
						start: srcStart,
						end: srcEnd,
						perSecond: FOLLOW_SAMPLES_PER_SECOND,
					}),
				});
				source = {
					width: detection.sourceWidth,
					height: detection.sourceHeight,
				};
				// tempo da fonte: cada pedaço converte para o seu tempo local
				const samples = detection.frames.map((f) => ({
					t: f.t,
					fx: f.face ? f.face.cx : null,
					candidates: f.candidates,
				}));
				plan = samples.every((s) => s.fx === null)
					? { kind: "centered", outcome: "noFace" }
					: { kind: "follow", points: toKeyPoints(smoothFaceTrack(samples)) };
			} else {
				plan = { kind: "centered", outcome: "applied" };
			}
		} catch (error) {
			console.warn("[framing] could not analyze video", error);
			plan = { kind: "centered", outcome: "unreadable" };
		}

		const finalSource = source;
		const decided = plan;
		plans.push({
			sceneId,
			build: (current) => {
				const base = withoutPreviousFraming(current, mediaId);
				if (findLiveElements(base, mediaId).length === 0) return null;
				if (decided.kind === "split") {
					result.applied.push(sceneId);
					return buildSplitTracks({
						tracks: base,
						mediaId,
						canvas,
						source: finalSource,
						face: decided.face,
					});
				}
				if (decided.kind === "follow") {
					result.applied.push(sceneId);
					return buildFollowTracks({
						tracks: base,
						mediaId,
						canvas,
						source: finalSource,
						points: decided.points,
					});
				}
				result[decided.outcome].push(sceneId);
				return buildCenteredTracks({
					tracks: base,
					mediaId,
					canvas,
					source: finalSource,
				});
			},
		});
	}

	if (plans.length > 0) {
		editor.command.execute({
			command: new ApplyFramingCommand(editor, plans),
		});
	}
	result.elapsedMs = Math.round(performance.now() - started);
	return result;
}
