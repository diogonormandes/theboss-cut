// Dicionário pessoal de correções: "Bosch" → "BOSS", "Tabu Escote" → "THEBOSS CUT"...
// Fica guardado no PC e é aplicado sozinho em toda legenda nova.

import type { EditorCore } from "@/core";
import type { TimelineElement } from "@/timeline/types";
import { rewrapCaptionContent } from "./build-subtitle-text-element";
import { getCaptionElements } from "./caption-templates";
import { realignCaptionWords } from "./realign-words";
import type { SubtitleCue } from "./types";

import { applyWordFixes, type WordFix } from "./word-fix-text";

export { applyWordFixes, type WordFix } from "./word-fix-text";

const STORAGE_KEY = "thebosscut-correcoes";

export function loadWordFixes(): WordFix[] {
	try {
		const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
		return Array.isArray(parsed)
			? parsed.filter(
					(fix): fix is WordFix =>
						typeof fix?.from === "string" && typeof fix?.to === "string",
				)
			: [];
	} catch {
		return [];
	}
}

export function saveWordFixes(fixes: WordFix[]): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(fixes));
	} catch {
		// sem espaço: só não fica lembrado
	}
}

/** Guarda (ou atualiza) uma correção. */
export function rememberWordFix(fix: WordFix): WordFix[] {
	const key = fix.from.trim().toLowerCase();
	const next = [
		...loadWordFixes().filter((item) => item.from.trim().toLowerCase() !== key),
		{ from: fix.from.trim(), to: fix.to.trim() },
	];
	saveWordFixes(next);
	return next;
}

export function forgetWordFix(from: string): WordFix[] {
	const key = from.trim().toLowerCase();
	const next = loadWordFixes().filter(
		(item) => item.from.trim().toLowerCase() !== key,
	);
	saveWordFixes(next);
	return next;
}

/** Legendas novas: aplica o dicionário antes de colocar na linha do tempo. */
export function applyWordFixesToCues(
	cues: SubtitleCue[],
	fixes: WordFix[],
): SubtitleCue[] {
	if (fixes.length === 0) return cues;
	return cues.map((cue) => {
		const text = applyWordFixes(cue.text, fixes);
		if (text === cue.text) return cue;
		return {
			...cue,
			text,
			words: cue.words
				? realignCaptionWords({ words: cue.words, content: text })
				: cue.words,
		};
	});
}

/** Legendas que já estão no vídeo: corrige todas de uma vez (dá para desfazer com Ctrl+Z). */
export function applyWordFixesToTimeline({
	editor,
	fixes,
}: {
	editor: EditorCore;
	fixes: WordFix[];
}): number {
	const canvasSize = editor.project.getActiveCanvasSize();
	const updates: Array<{
		trackId: string;
		elementId: string;
		patch: Partial<TimelineElement>;
	}> = [];
	for (const { trackId, element } of getCaptionElements(editor)) {
		const current = String(element.params.content ?? "");
		const fixed = applyWordFixes(current, fixes);
		if (fixed === current) continue;
		const content = rewrapCaptionContent({
			content: fixed,
			params: element.params,
			canvasSize,
		});
		updates.push({
			trackId,
			elementId: element.id,
			patch: {
				params: { content },
				caption: {
					...element.caption,
					words: realignCaptionWords({ words: element.caption.words, content }),
				},
			} as Partial<TimelineElement>,
		});
	}
	editor.timeline.updateElements({ updates });
	return updates.length;
}
