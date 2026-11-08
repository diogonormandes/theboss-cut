// Desenho da legenda automática palavra por palavra: destaque da palavra falada (cor, caixa ou karaokê),
// contorno, sombra e animação de entrada. Usado na prévia e no vídeo exportado (mesmo desenho).

import type {
	CaptionStyle,
	TextCaptionWord,
} from "@/timeline/types";
import type { TextCanvasContext } from "./layout";
import { setCanvasLetterSpacing } from "./layout";
import {
	drawTextLayoutBackground,
	type MeasuredTextLayout,
	type ResolvedTextBackgroundLike,
} from "./primitives";

const POP_RAMP_SECONDS = 0.08;
const ENTRY_SECONDS = 0.16;

export const DEFAULT_CAPTION_STYLE: CaptionStyle = {
	templateId: "boss-gold",
	highlight: "color",
	highlightColor: "#F3C969",
	boxColor: "#E2C27E",
	boxTextColor: "#0A0A0B",
	popScale: 1.12,
	strokeColor: "#000000",
	strokeWidth: 0.14,
	shadowColor: "rgba(0,0,0,0.6)",
	shadowBlur: 0.18,
	shadowOffsetY: 0.06,
	animation: "pop",
};

function easeOutBack(x: number): number {
	const c1 = 1.70158;
	const c3 = c1 + 1;
	return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2;
}

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
}

/** Palavras da legenda por linha, na mesma ordem do texto (se o texto foi editado e não bate, devolve null). */
function splitWordsByLine({
	lines,
	words,
}: {
	lines: string[];
	words: TextCaptionWord[];
}): Array<Array<{ text: string; word: TextCaptionWord }>> | null {
	const result: Array<Array<{ text: string; word: TextCaptionWord }>> = [];
	let index = 0;
	for (const line of lines) {
		const tokens = line.split(/\s+/).filter(Boolean);
		const lineWords: Array<{ text: string; word: TextCaptionWord }> = [];
		for (const token of tokens) {
			const word = words[index];
			if (!word) return null;
			lineWords.push({ text: token, word });
			index++;
		}
		result.push(lineWords);
	}
	return index === words.length ? result : null;
}

export function drawCaptionText({
	ctx,
	layout,
	textColor,
	background,
	backgroundColor,
	words,
	style,
	captionTime,
	elapsedSeconds,
	textBaseline = "middle",
}: {
	ctx: TextCanvasContext;
	layout: MeasuredTextLayout;
	textColor: string;
	background?: ResolvedTextBackgroundLike | null;
	backgroundColor?: string;
	words: TextCaptionWord[];
	style: CaptionStyle;
	/** segundos dentro da legenda, contando o corte inicial (mesma régua das palavras) */
	captionTime: number;
	/** segundos desde que a legenda apareceu na tela */
	elapsedSeconds: number;
	textBaseline?: CanvasTextBaseline;
}): void {
	const fontPx = layout.scaledFontSize;

	// animação de entrada da legenda inteira
	const entry = clamp01(elapsedSeconds / ENTRY_SECONDS);
	ctx.save();
	if (style.animation === "pop" && entry < 1) {
		const scale = 0.82 + 0.18 * easeOutBack(entry);
		ctx.scale(scale, scale);
	} else if (style.animation === "fade" && entry < 1) {
		ctx.globalAlpha *= entry;
	} else if (style.animation === "slide" && entry < 1) {
		ctx.globalAlpha *= entry;
		ctx.translate(0, (1 - entry) * fontPx * 0.4);
	}

	drawTextLayoutBackground({ ctx, layout, background, backgroundColor });

	ctx.font = layout.fontString;
	ctx.textAlign = "left";
	ctx.textBaseline = textBaseline;
	ctx.lineJoin = "round";
	ctx.lineCap = "round";
	setCanvasLetterSpacing({ ctx, letterSpacingPx: layout.letterSpacing });

	const byLine = splitWordsByLine({ lines: layout.lines, words });
	const spaceWidth = ctx.measureText(" ").width;
	const strokePx = style.strokeWidth * fontPx;
	const boxPadX = fontPx * 0.18;
	const shadowBlurPx = style.shadowBlur * fontPx;

	const applyShadow = (on: boolean) => {
		if (on && shadowBlurPx > 0) {
			ctx.shadowColor = style.shadowColor;
			ctx.shadowBlur = shadowBlurPx;
			ctx.shadowOffsetX = 0;
			ctx.shadowOffsetY = style.shadowOffsetY * fontPx;
		} else {
			ctx.shadowColor = "transparent";
			ctx.shadowBlur = 0;
			ctx.shadowOffsetY = 0;
		}
	};

	for (let lineIndex = 0; lineIndex < layout.lines.length; lineIndex++) {
		const lineY =
			lineIndex * layout.lineHeightPx - layout.block.visualCenterOffset;
		const lineWords =
			byLine?.[lineIndex] ??
			// texto editado sem bater com as palavras: desenha a linha sem destaque
			[{ text: layout.lines[lineIndex], word: null }];

		// 1ª passada: cor e tamanho de cada palavra agora
		const items = lineWords.map((item) => {
			const width = ctx.measureText(item.text).width;
			const word = item.word;
			const isSpoken =
				word !== null && captionTime >= word.start && captionTime < word.end;
			const wasSpoken = word !== null && captionTime >= word.start;
			let fill = textColor;
			let scale = 1;
			if (word && style.highlight !== "none") {
				if (style.highlight === "karaoke" ? wasSpoken : isSpoken) {
					fill =
						style.highlight === "box" ? style.boxTextColor : style.highlightColor;
				}
				if (isSpoken && style.popScale !== 1) {
					const ramp = clamp01((captionTime - word.start) / POP_RAMP_SECONDS);
					scale = 1 + (style.popScale - 1) * easeOutBack(ramp);
				}
			}
			// a caixa atrás da palavra falada também ocupa espaço na linha
			const extra =
				word && isSpoken && style.highlight === "box" ? boxPadX * 2 : 0;
			return { ...item, width, isSpoken, fill, scale, extra };
		});

		// a palavra que cresce empurra as vizinhas; a linha continua alinhada
		const lineWidth =
			items.reduce(
				(total, item) => total + (item.width + item.extra) * item.scale,
				0,
			) +
			spaceWidth * Math.max(0, items.length - 1);
		const startX =
			layout.textAlign === "center"
				? -lineWidth / 2
				: layout.textAlign === "right"
					? -lineWidth
					: 0;

		let x = startX;
		for (const { text, word, width, isSpoken, fill, scale, extra } of items) {
			const centerX = x + ((width + extra) * scale) / 2;
			ctx.save();
			ctx.translate(centerX, lineY);
			ctx.scale(scale, scale);

			if (word && isSpoken && style.highlight === "box") {
				const padX = boxPadX;
				const padY = fontPx * 0.08;
				const height = layout.lineHeightPx * 0.92 + padY * 2;
				applyShadow(true);
				ctx.fillStyle = style.boxColor;
				ctx.beginPath();
				ctx.roundRect(
					-width / 2 - padX,
					-height / 2,
					width + padX * 2,
					height,
					fontPx * 0.18,
				);
				ctx.fill();
				applyShadow(false);
			}

			if (strokePx > 0) {
				applyShadow(true);
				ctx.strokeStyle = style.strokeColor;
				ctx.lineWidth = strokePx;
				ctx.strokeText(text, -width / 2, 0);
				applyShadow(false);
				ctx.fillStyle = fill;
				ctx.fillText(text, -width / 2, 0);
			} else {
				applyShadow(true);
				ctx.fillStyle = fill;
				ctx.fillText(text, -width / 2, 0);
				applyShadow(false);
			}
			ctx.restore();

			x += (width + extra) * scale + spaceWidth;
		}
	}

	ctx.restore();
}
