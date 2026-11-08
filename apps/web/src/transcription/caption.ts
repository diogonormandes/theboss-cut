import type {
	CaptionChunk,
	TranscriptionSegment,
	TranscriptionWord,
} from "@/transcription/types";
import {
	DEFAULT_WORDS_PER_CAPTION,
	MIN_CAPTION_DURATION_SECONDS,
} from "@/transcription/caption-defaults";

export function buildCaptionChunks({
	segments,
	wordsPerChunk = DEFAULT_WORDS_PER_CAPTION,
	minDuration = MIN_CAPTION_DURATION_SECONDS,
}: {
	segments: TranscriptionSegment[];
	wordsPerChunk?: number;
	minDuration?: number;
}): CaptionChunk[] {
	const captions: CaptionChunk[] = [];
	let globalEndTime = 0;

	for (const segment of segments) {
		const words = segment.text.trim().split(/\s+/);
		if (words.length === 0 || (words.length === 1 && words[0] === "")) continue;

		const segmentDuration = segment.end - segment.start;
		const wordsPerSecond = words.length / segmentDuration;

		const chunks: string[] = [];
		for (let i = 0; i < words.length; i += wordsPerChunk) {
			chunks.push(words.slice(i, i + wordsPerChunk).join(" "));
		}

		let chunkStartTime = segment.start;
		for (const chunk of chunks) {
			const chunkWords = chunk.split(/\s+/).length;
			const chunkDuration = Math.max(minDuration, chunkWords / wordsPerSecond);
			const adjustedStartTime = Math.max(chunkStartTime, globalEndTime);

			captions.push({
				text: chunk,
				startTime: adjustedStartTime,
				duration: chunkDuration,
			});

			globalEndTime = adjustedStartTime + chunkDuration;
			chunkStartTime += chunkDuration;
		}
	}

	return captions;
}

// ---------- legenda palavra por palavra (estilo CapCut) ----------

const CAPTION_BREAK_PAUSE_SECONDS = 0.5;
const CAPTION_HOLD_GAP_SECONDS = 0.6;
const MIN_WORD_CAPTION_SECONDS = 0.3;
const PUNCTUATION_END = /[.,!?;:…]$/;

/**
 * Monta legendas curtas a partir das palavras com tempo exato.
 * Quebra a cada `maxWords` palavras, numa pontuação ou numa pausa na fala.
 * Cada legenda guarda as palavras com o tempo (desde o começo da legenda) para o destaque.
 */
export function buildCaptionChunksFromWords({
	words: rawWords,
	maxWords = DEFAULT_WORDS_PER_CAPTION,
}: {
	words: TranscriptionWord[];
	maxWords?: number;
}): CaptionChunk[] {
	const words = fixWordTimings(mergeWordFragments(rawWords));
	const groups: TranscriptionWord[][] = [];
	let current: TranscriptionWord[] = [];

	for (const word of words) {
		const previous = current[current.length - 1];
		if (
			previous &&
			(current.length >= maxWords ||
				word.start - previous.end > CAPTION_BREAK_PAUSE_SECONDS)
		) {
			groups.push(current);
			current = [];
		}
		current.push(word);
		if (PUNCTUATION_END.test(word.text) && current.length >= 2) {
			groups.push(current);
			current = [];
		}
	}
	if (current.length > 0) groups.push(current);

	const captions: CaptionChunk[] = [];
	for (let index = 0; index < groups.length; index++) {
		const group = groups[index];
		const startTime = group[0].start;
		const lastEnd = group[group.length - 1].end;
		const nextStart = groups[index + 1]?.[0].start;
		// fica na tela até a próxima legenda quando a pausa é curta (não pisca)
		const endTime =
			nextStart !== undefined && nextStart - lastEnd < CAPTION_HOLD_GAP_SECONDS
				? nextStart
				: lastEnd;
		const duration = Math.max(MIN_WORD_CAPTION_SECONDS, endTime - startTime);
		captions.push({
			text: group.map((word) => word.text).join(" "),
			startTime,
			duration,
			words: group.map((word) => ({
				text: word.text,
				start: Math.max(0, word.start - startTime),
				end: Math.max(0, word.end - startTime),
			})),
		});
	}
	return captions;
}

// Pedaços que o reconhecimento separa ("bem" + "-vindos", "galera" + ",") voltam a ser uma palavra só.
const FRAGMENT_START = /^[-–—'’.,!?;:…%)]/;

function mergeWordFragments(words: TranscriptionWord[]): TranscriptionWord[] {
	const merged: TranscriptionWord[] = [];
	for (const word of words) {
		const previous = merged[merged.length - 1];
		if (previous && FRAGMENT_START.test(word.text)) {
			merged[merged.length - 1] = {
				text: `${previous.text}${word.text}`,
				start: previous.start,
				end: Math.max(previous.end, word.end),
			};
			continue;
		}
		merged.push({ ...word });
	}
	return merged;
}

// O reconhecimento às vezes "estica" uma palavra por cima do silêncio antes ou depois dela
// (ex.: a primeira palavra começando no 0 quando a fala só começa depois).
// Uma palavra falada dura no máximo uns 0,07 s por letra (até 1,2 s).
const PHRASE_GAP_SECONDS = 0.3;

function maxWordSeconds(text: string): number {
	return Math.min(1.2, 0.15 + 0.07 * text.length);
}

function fixWordTimings(words: TranscriptionWord[]): TranscriptionWord[] {
	return words.map((word, index) => {
		const limit = maxWordSeconds(word.text);
		if (word.end - word.start <= limit) return word;
		const previous = words[index - 1];
		const startsPhrase =
			!previous || word.start - previous.end > PHRASE_GAP_SECONDS || index === 0;
		// começo de frase: o silêncio está antes (puxa o começo); senão está depois (puxa o fim)
		return startsPhrase
			? { ...word, start: word.end - limit }
			: { ...word, end: word.start + limit };
	});
}
