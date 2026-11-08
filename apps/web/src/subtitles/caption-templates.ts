// Modelos prontos de legenda (estilo CapCut) e aplicar o visual em todas as legendas automáticas.

import type { EditorCore } from "@/core";
import { loadFonts } from "@/fonts/google-fonts";
import { DEFAULT_CAPTION_STYLE } from "@/text/caption-render";
import type { TextFontWeight } from "@/text/primitives";
import type {
	CaptionStyle,
	TextElement,
	TimelineElement,
} from "@/timeline/types";
import { buildSubtitleTextElement } from "./build-subtitle-text-element";
import type { SubtitleCue, SubtitleStyleOverrides } from "./types";

export const CAPTION_TEMPLATE_IDS = [
	"boss-gold",
	"neon",
	"classic",
	"karaoke",
	"box",
] as const;
export type CaptionTemplateId = (typeof CAPTION_TEMPLATE_IDS)[number];

/** Letra e visual de uma legenda (o que os modelos e a personalização mudam). */
export interface CaptionLook {
	fontFamily: string;
	fontWeight: TextFontWeight;
	/** tamanho da letra no vídeo vertical / horizontal */
	fontSizeVertical: number;
	fontSizeHorizontal: number;
	color: string;
	style: CaptionStyle;
}

export const CAPTION_TEMPLATES: Record<CaptionTemplateId, CaptionLook> = {
	"boss-gold": {
		fontFamily: "Montserrat",
		fontWeight: "bold",
		fontSizeVertical: 5.8,
		fontSizeHorizontal: 6,
		color: "#FFFFFF",
		style: { ...DEFAULT_CAPTION_STYLE, templateId: "boss-gold" },
	},
	neon: {
		fontFamily: "Poppins",
		fontWeight: "bold",
		fontSizeVertical: 5.3,
		fontSizeHorizontal: 6,
		color: "#FFFFFF",
		style: {
			...DEFAULT_CAPTION_STYLE,
			templateId: "neon",
			highlight: "color",
			highlightColor: "#3DF5FF",
			popScale: 1.08,
			strokeWidth: 0,
			shadowColor: "#00D4FF",
			shadowBlur: 0.45,
			shadowOffsetY: 0,
			animation: "fade",
		},
	},
	classic: {
		fontFamily: "Arial",
		fontWeight: "bold",
		fontSizeVertical: 5,
		fontSizeHorizontal: 5,
		color: "#FFFFFF",
		style: {
			...DEFAULT_CAPTION_STYLE,
			templateId: "classic",
			highlight: "none",
			popScale: 1,
			strokeWidth: 0.08,
			shadowBlur: 0.1,
			animation: "none",
		},
	},
	karaoke: {
		fontFamily: "Anton",
		fontWeight: "normal",
		fontSizeVertical: 6.2,
		fontSizeHorizontal: 6.5,
		color: "#FFFFFF",
		style: {
			...DEFAULT_CAPTION_STYLE,
			templateId: "karaoke",
			highlight: "karaoke",
			highlightColor: "#FFD400",
			popScale: 1,
			strokeWidth: 0.14,
			shadowBlur: 0.15,
			animation: "fade",
		},
	},
	box: {
		fontFamily: "Montserrat",
		fontWeight: "bold",
		fontSizeVertical: 5.8,
		fontSizeHorizontal: 6,
		color: "#FFFFFF",
		style: {
			...DEFAULT_CAPTION_STYLE,
			templateId: "box",
			highlight: "box",
			boxColor: "#E2C27E",
			boxTextColor: "#0A0A0B",
			popScale: 1.06,
			strokeWidth: 0,
			shadowBlur: 0.15,
			animation: "pop",
		},
	},
};

export const DEFAULT_CAPTION_TEMPLATE: CaptionTemplateId = "boss-gold";

/**
 * Posição segura: no vídeo vertical a legenda fica acima dos botões e da descrição
 * do TikTok/Reels/Shorts (que ocupam mais ou menos a parte de baixo da tela).
 */
export function getSafeCaptionPlacement(canvasSize: {
	width: number;
	height: number;
}): NonNullable<SubtitleStyleOverrides["placement"]> {
	const isVertical = canvasSize.height > canvasSize.width;
	return {
		verticalAlign: "bottom",
		marginVerticalRatio: isVertical ? 0.27 : 0.08,
		marginLeftRatio: isVertical ? 0.06 : 0.1,
		// à direita no vertical ficam os botões de curtir/comentar
		marginRightRatio: isVertical ? 0.12 : 0.1,
	};
}

/** Estilo (letra, cor, posição) para montar a legenda com um visual. */
export function cueStyleFromLook({
	look,
	canvasSize,
}: {
	look: CaptionLook;
	canvasSize: { width: number; height: number };
}): SubtitleStyleOverrides {
	const isVertical = canvasSize.height > canvasSize.width;
	return {
		fontFamily: look.fontFamily,
		fontWeight: look.fontWeight,
		fontSize: isVertical ? look.fontSizeVertical : look.fontSizeHorizontal,
		color: look.color,
		textAlign: "center",
		placement: getSafeCaptionPlacement(canvasSize),
	};
}

function isCaptionElement(
	element: TimelineElement,
): element is TextElement & { caption: NonNullable<TextElement["caption"]> } {
	return element.type === "text" && Boolean(element.caption?.words?.length);
}

/** Legendas automáticas da cena aberta. */
export function getCaptionElements(editor: EditorCore) {
	const tracks = editor.scenes.getActiveScene().tracks;
	const all = [
		...tracks.overlay,
		tracks.main,
		...tracks.audio,
	] as Array<{ id: string; elements: TimelineElement[] }>;
	const result: Array<{
		trackId: string;
		element: TextElement & { caption: NonNullable<TextElement["caption"]> };
	}> = [];
	for (const track of all) {
		for (const element of track.elements) {
			if (isCaptionElement(element)) result.push({ trackId: track.id, element });
		}
	}
	return result;
}

/** Visual atual (da primeira legenda), para mostrar na personalização. */
export function readCurrentLook(editor: EditorCore): CaptionLook | null {
	const first = getCaptionElements(editor)[0]?.element;
	if (!first) return null;
	const canvasSize = editor.project.getActiveCanvasSize();
	const isVertical = canvasSize.height > canvasSize.width;
	const fontSize = Number(first.params.fontSize) || 6;
	return {
		fontFamily: String(first.params.fontFamily ?? "Arial"),
		fontWeight: first.params.fontWeight === "bold" ? "bold" : "normal",
		fontSizeVertical: isVertical ? fontSize : 6.5,
		fontSizeHorizontal: isVertical ? 6 : fontSize,
		color: String(first.params.color ?? "#FFFFFF"),
		style: first.caption.style ?? DEFAULT_CAPTION_STYLE,
	};
}

/**
 * Aplica um visual em todas as legendas automáticas (dá para desfazer com Ctrl+Z).
 * Mantém o texto (inclusive palavras corrigidas) e o tempo de cada palavra; arruma as linhas de novo.
 */
export async function applyCaptionLook({
	editor,
	look,
}: {
	editor: EditorCore;
	look: CaptionLook;
}): Promise<number> {
	const captions = getCaptionElements(editor);
	if (captions.length === 0) return 0;

	await loadFonts({ families: [look.fontFamily] }).catch(() => undefined);

	const canvasSize = editor.project.getActiveCanvasSize();
	const cueStyle = cueStyleFromLook({ look, canvasSize });

	const updates = captions.map(({ trackId, element }, index) => {
		const currentText = String(element.params.content ?? "").replace(/\s+/g, " ").trim();
		const cue: SubtitleCue = {
			text: currentText || element.caption.words.map((word) => word.text).join(" "),
			startTime: 0,
			duration: 1,
			words: element.caption.words,
			style: cueStyle,
		};
		const built = buildSubtitleTextElement({ index, caption: cue, canvasSize });
		return {
			trackId,
			elementId: element.id,
			patch: {
				params: built.params,
				caption: { words: element.caption.words, style: { ...look.style } },
			} as Partial<TimelineElement>,
		};
	});

	editor.timeline.updateElements({ updates });
	return captions.length;
}
