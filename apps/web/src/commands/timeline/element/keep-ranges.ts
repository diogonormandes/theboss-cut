import { Command, type CommandResult } from "@/commands/base-command";
import {
	buildCutScenes,
	CreateScenesFromCutsCommand,
	type CutSpec,
} from "@/commands/scene/create-scenes-from-cuts";
import { EditorCore } from "@/core";
import type { SceneTracks, TimelineElement, TimelineTrack } from "@/timeline";
import { generateUUID } from "@/utils/id";
import {
	addMediaTime,
	type MediaTime,
	roundMediaTime,
	subMediaTime,
	TICKS_PER_SECOND,
	ZERO_MEDIA_TIME,
} from "@/wasm";

/** Trecho da mídia de origem (segundos) que fica na linha do tempo. */
export type KeepRange = [srcStart: number, srcEnd: number];

type MediaElement = TimelineElement & { mediaId: string };

function hasMedia(element: TimelineElement): element is MediaElement {
	return "mediaId" in element && typeof element.mediaId === "string";
}

function toTicks(seconds: number): MediaTime {
	return roundMediaTime({ time: seconds * TICKS_PER_SECOND });
}

/**
 * Corta um elemento de mídia nos trechos a manter (em segundos da fonte).
 * Cada pedaço: trimStart = início do trecho, trimEnd = fim da mídia - fim do
 * trecho, e os pedaços ficam colados um no outro a partir do início do
 * elemento (sem buraco). Cada borda é arredondada uma vez só (em ticks), então
 * trimStart + duration + trimEnd = sourceDuration em todos os pedaços.
 * O primeiro pedaço mantém o id do elemento. Trechos fora do que o elemento
 * mostra são ignorados; se nada sobrar, devolve [].
 * Elemento com mudança de velocidade não é cortado (devolve o próprio).
 */
export function buildKeptPieces({
	element,
	keeps,
	newId = generateUUID,
}: {
	element: TimelineElement;
	keeps: KeepRange[];
	newId?: () => string;
}): TimelineElement[] {
	if ("retime" in element && element.retime) return [element];
	const sourceDuration =
		element.sourceDuration ??
		addMediaTime({
			a: addMediaTime({ a: element.trimStart, b: element.duration }),
			b: element.trimEnd,
		});
	const visibleStart = element.trimStart;
	const visibleEnd = addMediaTime({ a: element.trimStart, b: element.duration });

	const pieces: TimelineElement[] = [];
	let cursor = element.startTime;
	let lastEnd: MediaTime = ZERO_MEDIA_TIME;
	for (const [s, e] of keeps) {
		let start = toTicks(s);
		let end = toTicks(e);
		if (start < visibleStart) start = visibleStart;
		if (end > visibleEnd) end = visibleEnd;
		if (start < lastEnd) start = lastEnd; // trechos sobrepostos
		if (end <= start) continue;
		lastEnd = end;
		const duration = subMediaTime({ a: end, b: start });
		pieces.push({
			...element,
			id: pieces.length === 0 ? element.id : newId(),
			startTime: cursor,
			duration,
			trimStart: start,
			trimEnd: subMediaTime({ a: sourceDuration, b: end }),
			sourceDuration,
			// animações dependem do tempo do clipe: não fazem sentido picadas
			animations: undefined,
		} as TimelineElement);
		cursor = addMediaTime({ a: cursor, b: duration });
	}
	return pieces;
}

/**
 * Elementos "irmãos" do alvo: o áudio separado do vídeo (ou o vídeo do áudio):
 * tipo diferente (vídeo x áudio), mesma mídia, mesmo início, mesmo corte e
 * mesma duração. São cortados junto. Uma cópia do mesmo vídeo (ex.: um
 * enquadramento por cima) não é irmã e não é cortada.
 */
function isTwin(a: TimelineElement, b: TimelineElement): boolean {
	return (
		hasMedia(a) &&
		hasMedia(b) &&
		a.type !== b.type &&
		(a.type === "audio" || b.type === "audio") &&
		a.mediaId === b.mediaId &&
		a.startTime === b.startTime &&
		a.trimStart === b.trimStart &&
		a.duration === b.duration
	);
}

/** Aplica o corte nas faixas (função pura, sem editor). */
export function applyKeepRanges({
	tracks,
	trackId,
	elementId,
	keeps,
	newId = generateUUID,
}: {
	tracks: SceneTracks;
	trackId: string;
	elementId: string;
	keeps: KeepRange[];
	newId?: () => string;
}): { tracks: SceneTracks; pieces: number } | null {
	const all: TimelineTrack[] = [...tracks.overlay, tracks.main, ...tracks.audio];
	const target = all
		.find((track) => track.id === trackId)
		?.elements.find((el) => el.id === elementId);
	if (!target || !hasMedia(target)) return null;
	const first = buildKeptPieces({ element: target, keeps, newId });
	if (first.length === 0) return null;
	if (first.length === 1 && first[0] === target) return null; // não dá para cortar

	let pieces = 0;
	// Quanto o clipe encolheu: o que vem depois dele na mesma faixa anda para
	// trás esse tanto (não fica buraco antes do próximo clipe).
	const targetEnd = addMediaTime({ a: target.startTime, b: target.duration });
	const keptDuration = first.reduce<MediaTime>(
		(sum, el) => addMediaTime({ a: sum, b: el.duration }),
		ZERO_MEDIA_TIME,
	);
	const shrink = subMediaTime({ a: target.duration, b: keptDuration });
	const cutTrack = <T extends TimelineTrack>(track: T): T => {
		if (!track.elements.some((el) => el.id === elementId || isTwin(el, target))) {
			return track;
		}
		const elements = track.elements.flatMap((el) => {
			if (el.id === elementId) {
				pieces += first.length;
				return first;
			}
			if (isTwin(el, target)) {
				const twin = buildKeptPieces({ element: el, keeps, newId });
				pieces += twin.length;
				return twin;
			}
			if (shrink > ZERO_MEDIA_TIME && el.startTime >= targetEnd) {
				return [
					{
						...el,
						startTime: subMediaTime({ a: el.startTime, b: shrink }),
					} as TimelineElement,
				];
			}
			return [el];
		});
		return { ...track, elements } as T;
	};

	return {
		tracks: {
			overlay: tracks.overlay.map(cutTrack),
			main: cutTrack(tracks.main),
			audio: tracks.audio.map(cutTrack),
		},
		pieces,
	};
}

/**
 * Mantém só os trechos pedidos de um clipe (e do áudio separado dele, se
 * houver): gera todos os pedaços de uma vez, num único passo de desfazer.
 * Usado pelo "Cortar silêncios".
 *
 * `sceneId`: cena onde cortar (padrão: a cena aberta). Desfazer e refazer
 * agem sempre nessa cena, mesmo que outra esteja aberta.
 */
export class KeepRangesCommand extends Command {
	private sceneId: string | null;
	private savedState: SceneTracks | null = null;
	private resultState: SceneTracks | null = null;
	private pieceCount = 0;
	private readonly trackId: string;
	private readonly elementId: string;
	private readonly keeps: KeepRange[];

	constructor({
		trackId,
		elementId,
		keeps,
		sceneId,
	}: {
		trackId: string;
		elementId: string;
		keeps: KeepRange[];
		sceneId?: string;
	}) {
		super();
		this.trackId = trackId;
		this.elementId = elementId;
		this.keeps = keeps;
		this.sceneId = sceneId ?? null;
	}

	getTargetSceneId(): string | null {
		return this.sceneId;
	}

	/** Conta, sem mexer no editor, quantos pedaços o corte daria na cena aberta (0 = nada). */
	static countPieces({
		trackId,
		elementId,
		keeps,
	}: {
		trackId: string;
		elementId: string;
		keeps: KeepRange[];
	}): number {
		const scene = EditorCore.getInstance().scenes.getActiveSceneOrNull();
		if (!scene) return 0;
		return (
			applyKeepRanges({ tracks: scene.tracks, trackId, elementId, keeps, newId: () => "" })
				?.pieces ?? 0
		);
	}

	/** Quantos pedaços ficaram (vídeo + áudio separado). */
	getPieceCount(): number {
		return this.pieceCount;
	}

	private readTracks(): SceneTracks {
		const scenes = EditorCore.getInstance().scenes;
		if (!this.sceneId) this.sceneId = scenes.getActiveScene().id;
		const scene = scenes.getSceneById(this.sceneId);
		if (!scene) throw new Error(`Scene ${this.sceneId} no longer exists`);
		return scene.tracks;
	}

	private write(tracks: SceneTracks): void {
		EditorCore.getInstance().timeline.updateTracks(tracks, {
			sceneId: this.sceneId,
		});
	}

	execute(): CommandResult | undefined {
		this.savedState = this.readTracks();
		// refazer usa os mesmos pedaços (mesmos ids) da primeira vez
		if (!this.resultState) {
			const result = applyKeepRanges({
				tracks: this.savedState,
				trackId: this.trackId,
				elementId: this.elementId,
				keeps: this.keeps,
			});
			if (!result) return undefined;
			this.resultState = result.tracks;
			this.pieceCount = result.pieces;
		}
		this.write(this.resultState);
		return undefined;
	}

	undo(): void {
		if (this.savedState && this.resultState) this.write(this.savedState);
	}
}

/** Onde está o clipe numa cena de corte recém-montada. */
function sceneTarget(tracks: SceneTracks): { trackId: string; elementId: string } | null {
	const track = tracks.main.elements.length ? tracks.main : tracks.audio[0];
	const element = track?.elements[0];
	return track && element ? { trackId: track.id, elementId: element.id } : null;
}

/**
 * Cria uma cena nova com o trecho da live e corta nela (para nunca picar a
 * cena principal). Tudo num passo só de desfazer: desfazer tira a cena nova.
 * Se o corte não acontecer, a cena criada é tirada na hora.
 */
export class KeepRangesInNewSceneCommand extends Command {
	private create: CreateScenesFromCutsCommand;
	private keep: KeepRangesCommand | null = null;
	private readonly keeps: KeepRange[];

	constructor({ cut, keeps }: { cut: CutSpec; keeps: KeepRange[] }) {
		super();
		this.create = new CreateScenesFromCutsCommand({ cuts: [cut] });
		this.keeps = keeps;
	}

	/**
	 * Conta, sem mexer no editor, quantos pedaços o corte daria (0 = nada a
	 * fazer). Rode antes do comando para não gastar um passo de desfazer vazio.
	 */
	static countPieces({ cut, keeps }: { cut: CutSpec; keeps: KeepRange[] }): number {
		const [scene] = buildCutScenes({
			cuts: [cut],
			assets: EditorCore.getInstance().media.getAssets(),
		});
		const where = scene ? sceneTarget(scene.tracks) : null;
		if (!scene || !where) return 0;
		return (
			applyKeepRanges({ tracks: scene.tracks, keeps, ...where, newId: () => "" })
				?.pieces ?? 0
		);
	}

	/**
	 * A cena nova só é "alvo" enquanto existe. Depois do desfazer ela some, e o
	 * refazer (que a cria de novo) não pode ser descartado por isso.
	 */
	getTargetSceneId(): string | null {
		const sceneId = this.create.getSceneIds()[0];
		if (!sceneId) return null;
		return EditorCore.getInstance().scenes.getSceneById(sceneId) ? sceneId : null;
	}

	getPieceCount(): number {
		return this.keep?.getPieceCount() ?? 0;
	}

	execute(): CommandResult | undefined {
		this.create.execute();
		const sceneId = this.create.getSceneIds()[0];
		if (!sceneId) return undefined;
		if (!this.keep) {
			const scene = EditorCore.getInstance().scenes.getSceneById(sceneId);
			const where = scene ? sceneTarget(scene.tracks) : null;
			if (!where) {
				this.create.undo();
				return undefined;
			}
			this.keep = new KeepRangesCommand({ sceneId, keeps: this.keeps, ...where });
		}
		this.keep.execute();
		if (this.keep.getPieceCount() === 0) {
			// não cortou: não deixa a cena "Sem silêncios" inteira no projeto
			this.create.undo();
			this.keep = null;
		}
		return undefined;
	}

	undo(): void {
		if (!this.keep) return;
		this.keep.undo();
		this.create.undo();
	}
}
