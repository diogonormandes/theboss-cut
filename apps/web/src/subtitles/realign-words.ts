// Quando a pessoa corrige o texto de uma legenda, o tempo de cada palavra é refeito:
// as palavras que não mudaram mantêm o tempo; as novas ou trocadas dividem o espaço entre as vizinhas.

import type { TextCaptionWord } from "@/timeline/types";

function normalize(word: string): string {
	return word
		.toLowerCase()
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[^\p{L}\p{N}]/gu, "");
}

/** Pares (índice antigo, índice novo) das palavras iguais, na ordem (maior sequência em comum). */
function matchWords(oldWords: string[], newWords: string[]): Array<[number, number]> {
	const n = oldWords.length;
	const m = newWords.length;
	const table: number[][] = Array.from({ length: n + 1 }, () =>
		new Array<number>(m + 1).fill(0),
	);
	for (let i = n - 1; i >= 0; i--) {
		for (let j = m - 1; j >= 0; j--) {
			table[i][j] =
				oldWords[i] === newWords[j] && oldWords[i] !== ""
					? table[i + 1][j + 1] + 1
					: Math.max(table[i + 1][j], table[i][j + 1]);
		}
	}
	const pairs: Array<[number, number]> = [];
	let i = 0;
	let j = 0;
	while (i < n && j < m) {
		if (oldWords[i] === newWords[j] && oldWords[i] !== "") {
			pairs.push([i, j]);
			i++;
			j++;
		} else if (table[i + 1][j] >= table[i][j + 1]) {
			i++;
		} else {
			j++;
		}
	}
	return pairs;
}

export function realignCaptionWords({
	words,
	content,
}: {
	words: TextCaptionWord[];
	content: string;
}): TextCaptionWord[] {
	const tokens = content.split(/\s+/).filter(Boolean);
	if (tokens.length === 0 || words.length === 0) return [];

	// mesma quantidade de palavras: só troca o texto (o caso mais comum, corrigir uma palavra)
	if (tokens.length === words.length) {
		return words.map((word, index) => ({ ...word, text: tokens[index] }));
	}

	const spanStart = words[0].start;
	const spanEnd = words[words.length - 1].end;
	const pairs = matchWords(
		words.map((word) => normalize(word.text)),
		tokens.map(normalize),
	);

	const result: Array<TextCaptionWord | null> = tokens.map(() => null);
	for (const [oldIndex, newIndex] of pairs) {
		result[newIndex] = { ...words[oldIndex], text: tokens[newIndex] };
	}

	// palavras novas: ocupam o espaço livre entre a vizinha de antes e a de depois
	let index = 0;
	while (index < tokens.length) {
		if (result[index]) {
			index++;
			continue;
		}
		const runStart = index;
		while (index < tokens.length && !result[index]) index++;
		const runEnd = index; // exclusivo
		let first = runStart;
		let last = runEnd; // exclusivo
		const before = runStart > 0 ? result[runStart - 1] : null;
		const after = runEnd < tokens.length ? result[runEnd] : null;
		let gapStart = before ? before.end : spanStart;
		let gapEnd = after ? after.start : spanEnd;
		if (gapEnd - gapStart < 0.08 * (runEnd - runStart)) {
			// sem tempo livre: a vizinha divide o tempo dela com as palavras novas
			if (before) {
				first = runStart - 1;
				gapStart = before.start;
			} else if (after) {
				last = runEnd + 1;
				gapEnd = after.end;
			}
		}
		// divide pelo tamanho de cada palavra (palavra maior leva mais tempo para falar)
		const weights = tokens
			.slice(first, last)
			.map((token) => Math.max(1, token.length));
		const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
		let cursor = gapStart;
		for (let k = first; k < last; k++) {
			const share = ((gapEnd - gapStart) * weights[k - first]) / totalWeight;
			result[k] = { text: tokens[k], start: cursor, end: cursor + share };
			cursor += share;
		}
		index = Math.max(index, last);
	}

	return result.filter((word): word is TextCaptionWord => word !== null);
}

/** Depois de editar um item: se for legenda automática e o texto mudou, refaz o tempo das palavras. */
export function syncCaptionWordsAfterEdit<
	T extends { type: string; params: Record<string, unknown> },
>(
	original: T,
	next: T,
	rewrap?: (content: string, params: Record<string, unknown>) => string,
): T {
	const caption = (next as { caption?: { words: TextCaptionWord[] } }).caption;
	if (next.type !== "text" || !caption) return next;
	const content = next.params.content;
	if (typeof content !== "string" || content === original.params.content) {
		return next;
	}
	// arruma as linhas (o texto digitado na tela vem numa linha só)
	const wrapped = rewrap ? rewrap(content, next.params) : content;
	return {
		...next,
		params: { ...next.params, content: wrapped },
		caption: {
			...caption,
			words: realignCaptionWords({ words: caption.words, content: wrapped }),
		},
	};
}
