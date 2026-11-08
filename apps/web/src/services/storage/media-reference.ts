/**
 * Lives longas NÃO são copiadas para dentro do app (decisão 1.1 do plano da
 * Etapa 3). Em vez da cópia no armazenamento interno (OPFS), o app guarda só
 * uma referência ao arquivo original (FileSystemFileHandle) no IndexedDB.
 *
 * Este arquivo só tem funções puras (testadas com bun:test): a decisão
 * "copiar ou referenciar", a leitura de dados antigos e a conferência de um
 * arquivo reencontrado.
 */

import type { MediaType } from "@/media/types";

export type MediaStorageKind = "opfs" | "handle";

/** A partir deste tamanho o arquivo fica onde está (1 GB). */
export const REFERENCE_MIN_BYTES = 1024 * 1024 * 1024;

/** Vídeo mais longo que isto também fica onde está (30 min), mesmo pequeno. */
export const REFERENCE_MIN_VIDEO_SECONDS = 30 * 60;

/**
 * Decide se o arquivo é copiado para o OPFS ou só referenciado.
 * Sem handle (navegador sem suporte) a única opção é copiar, como antes.
 */
export function decideMediaStorage({
	size,
	type,
	durationSeconds,
	hasHandle,
}: {
	size: number;
	type: MediaType;
	durationSeconds?: number | null;
	hasHandle: boolean;
}): MediaStorageKind {
	if (!hasHandle) return "opfs";
	if (size >= REFERENCE_MIN_BYTES) return "handle";
	if (
		type === "video" &&
		typeof durationSeconds === "number" &&
		Number.isFinite(durationSeconds) &&
		durationSeconds > REFERENCE_MIN_VIDEO_SECONDS
	) {
		return "handle";
	}
	return "opfs";
}

/** Dados antigos (sem o campo) ou valores estranhos contam como cópia no OPFS. */
export function normalizeMediaStorage(raw: unknown): MediaStorageKind {
	return raw === "handle" ? "handle" : "opfs";
}

export type OfflineReason =
	/** O arquivo está lá, mas falta a pessoa liberar o acesso de novo. */
	| "permission"
	/** O arquivo foi movido, renomeado ou apagado. */
	| "missing"
	/** O arquivo no mesmo lugar não é mais o mesmo (tamanho diferente). */
	| "changed";

/** Ao reabrir: o arquivo achado pelo handle ainda é o mesmo? */
export function checkLinkedFileSize({
	expectedSize,
	actualSize,
}: {
	expectedSize: number;
	actualSize: number;
}): "ok" | "changed" {
	return expectedSize === actualSize ? "ok" : "changed";
}

/** Folga aceita ao "Localizar arquivo": 1 % no tamanho. */
export const RELINK_SIZE_TOLERANCE = 0.01;
/** Folga aceita na duração: 1 % ou 1 s, o que for maior. */
export const RELINK_DURATION_TOLERANCE = 0.01;
export const RELINK_DURATION_MIN_SECONDS = 1;

/**
 * O arquivo que a pessoa escolheu em "Localizar arquivo" parece ser o mesmo?
 * Confere tamanho e duração parecidos (a duração só quando as duas existem).
 */
export function isPlausibleRelink({
	expected,
	actual,
}: {
	expected: { size: number; duration?: number | null };
	actual: { size: number; duration?: number | null };
}): boolean {
	if (expected.size <= 0 || actual.size <= 0) return false;
	const sizeDiff = Math.abs(expected.size - actual.size);
	if (sizeDiff > expected.size * RELINK_SIZE_TOLERANCE) return false;

	const a = expected.duration;
	const b = actual.duration;
	if (
		typeof a === "number" &&
		typeof b === "number" &&
		Number.isFinite(a) &&
		Number.isFinite(b)
	) {
		const tolerance = Math.max(
			RELINK_DURATION_MIN_SECONDS,
			a * RELINK_DURATION_TOLERANCE,
		);
		if (Math.abs(a - b) > tolerance) return false;
	}
	return true;
}

type TrackWithElements = { elements: ReadonlyArray<unknown> };

/**
 * Quais mídias offline a linha do tempo está usando? Exportar (ou gerar a
 * miniatura) com uma delas daria tela preta e sem som, então quem chama
 * deve parar e pedir para "Localizar arquivo" antes.
 */
export function findOfflineMediaInUse<T extends { id: string }>({
	tracks,
	offline,
}: {
	tracks: {
		overlay: ReadonlyArray<TrackWithElements>;
		main: TrackWithElements;
		audio: ReadonlyArray<TrackWithElements>;
	};
	offline: ReadonlyArray<T>;
}): T[] {
	if (offline.length === 0) return [];
	const used = new Set<string>();
	for (const track of [...tracks.overlay, tracks.main, ...tracks.audio]) {
		for (const element of track.elements) {
			const mediaId = (element as { mediaId?: unknown }).mediaId;
			if (typeof mediaId === "string") used.add(mediaId);
		}
	}
	return offline.filter((asset) => used.has(asset.id));
}
