import type { LanguageCode } from "./languages";

export type TranscriptionLanguage = LanguageCode | "auto";

export interface TranscriptionSegment {
	text: string;
	start: number;
	end: number;
}

/** Uma palavra falada, com o tempo exato (segundos desde o começo do áudio). */
export interface TranscriptionWord {
	text: string;
	start: number;
	end: number;
}

export interface TranscriptionResult {
	text: string;
	segments: TranscriptionSegment[];
	/** palavra por palavra (vazio se o modelo não marcar o tempo de cada palavra) */
	words: TranscriptionWord[];
	language: string;
}

/** Rápida: baixa menos e termina antes. Precisa: entende melhor fala rápida e barulho. */
export type TranscriptionQuality = "fast" | "accurate";

export type TranscriptionStatus =
	| "idle"
	| "loading-model"
	| "transcribing"
	| "complete"
	| "error";

export interface TranscriptionProgress {
	status: TranscriptionStatus;
	progress: number;
	message?: string;
}

export type TranscriptionModelId = "whisper-small" | "whisper-large-v3-turbo";

export interface TranscriptionModel {
	id: TranscriptionModelId;
	quality: TranscriptionQuality;
	name: string;
	huggingFaceId: string;
	/** tamanho aproximado do download na primeira vez (MB) */
	downloadSizeMb: number;
	description: string;
}

/** Palavra dentro de uma legenda: tempo em segundos desde o começo da legenda. */
export interface CaptionWord {
	text: string;
	start: number;
	end: number;
}

export interface CaptionChunk {
	text: string;
	startTime: number;
	duration: number;
	/** palavra por palavra, para o destaque da palavra falada */
	words?: CaptionWord[];
}
