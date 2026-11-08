"use client";

// "Estilo das legendas" no painel Legendas: modelos prontos (cartões com prévia) e personalização.
// Tudo vale para todas as legendas automáticas do vídeo e dá para desfazer com Ctrl+Z.

import { useState } from "react";
import { toast } from "sonner";
import { ColorPicker } from "@/components/ui/color-picker";
import { FontPicker } from "@/components/ui/font-picker";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useEditor } from "@/editor/use-editor";
import { t, type TKey } from "@/i18n";
import { DEFAULT_CAPTION_STYLE } from "@/text/caption-render";
import type {
	CaptionEntryAnimation,
	CaptionHighlightMode,
} from "@/timeline/types";
import { cn } from "@/utils/ui";
import {
	CAPTION_TEMPLATE_IDS,
	CAPTION_TEMPLATES,
	type CaptionLook,
	type CaptionTemplateId,
	applyCaptionLook,
	getCaptionElements,
	readCurrentLook,
} from "../caption-templates";

const HIGHLIGHT_MODES: CaptionHighlightMode[] = ["color", "box", "karaoke", "none"];
const ANIMATIONS: CaptionEntryAnimation[] = ["pop", "fade", "slide", "none"];

/** Contorno e sombra feitos com sombra de texto, só para a prévia dos cartões. */
function previewTextShadow(look: CaptionLook): string {
	const parts: string[] = [];
	const style = look.style;
	if (style.strokeWidth > 0) {
		const w = Math.max(1, Math.round(style.strokeWidth * 12));
		for (const [x, y] of [
			[w, 0],
			[-w, 0],
			[0, w],
			[0, -w],
			[w, w],
			[-w, -w],
			[w, -w],
			[-w, w],
		]) {
			parts.push(`${x}px ${y}px 0 ${style.strokeColor}`);
		}
	}
	if (style.shadowBlur > 0) {
		parts.push(
			`0 ${Math.round(style.shadowOffsetY * 18)}px ${Math.round(style.shadowBlur * 22)}px ${style.shadowColor}`,
		);
	}
	return parts.join(", ") || "none";
}

function TemplatePreview({ look }: { look: CaptionLook }) {
	const [first, second] = t("media.captionStyle.sample").split(" ");
	const style = look.style;
	const highlighted =
		style.highlight === "box"
			? {
					background: style.boxColor,
					color: style.boxTextColor,
					borderRadius: 6,
					padding: "0 6px",
					textShadow: "none",
				}
			: style.highlight === "none"
				? {}
				: { color: style.highlightColor };
	return (
		<span
			className="tb-caption-preview"
			style={{
				fontFamily: `"${look.fontFamily}", sans-serif`,
				fontWeight: look.fontWeight === "bold" ? 700 : 400,
				color: look.color,
				textShadow: previewTextShadow(look),
			}}
		>
			{style.highlight === "karaoke" ? (
				<>
					<span style={{ color: style.highlightColor }}>{first}</span>{" "}
					<span>{second}</span>
				</>
			) : (
				<>
					<span>{first}</span>{" "}
					<span
						style={{
							display: "inline-block",
							transform: `scale(${style.popScale})`,
							...highlighted,
						}}
					>
						{second}
					</span>
				</>
			)}
		</span>
	);
}

export function CaptionStyleSection() {
	const editor = useEditor();
	// redesenha quando as legendas mudam (gerar, aplicar visual, desfazer)
	const captionCount = useEditor((e) => getCaptionElements(e).length);
	// a 1ª legenda (o objeto só muda quando ela muda de verdade) dispara o redesenho
	const firstCaption = useEditor(
		(e) => getCaptionElements(e)[0]?.element ?? null,
	);
	const currentLook = firstCaption ? readCurrentLook(editor) : null;
	const [isApplying, setIsApplying] = useState(false);

	if (captionCount === 0 || !currentLook) return null;

	const apply = async (look: CaptionLook) => {
		if (isApplying) return;
		setIsApplying(true);
		try {
			await applyCaptionLook({ editor, look });
		} catch (error) {
			console.error("Failed to apply caption style:", error);
			toast.error(t("media.captionStyle.applyFailed"));
		} finally {
			setIsApplying(false);
		}
	};

	const applyTemplate = (id: CaptionTemplateId) => apply(CAPTION_TEMPLATES[id]);

	const update = (patch: Partial<CaptionLook>) =>
		apply({ ...currentLook, ...patch });
	const updateStyle = (patch: Partial<CaptionLook["style"]>) =>
		apply({
			...currentLook,
			style: { ...currentLook.style, ...patch, templateId: undefined },
		});

	const canvasSize = editor.project.getActive().settings.canvasSize;
	const isVertical = canvasSize.height > canvasSize.width;
	const fontSize = isVertical
		? currentLook.fontSizeVertical
		: currentLook.fontSizeHorizontal;
	const style = currentLook.style;

	return (
		<div className="flex flex-col gap-3 border-t pt-4">
			<div className="flex flex-col gap-1">
				<b className="text-sm font-semibold">{t("media.captionStyle.title")}</b>
				<span className="text-muted-foreground text-xs">
					{t("media.captionStyle.hint")}
				</span>
			</div>

			<div className="grid grid-cols-2 gap-2">
				{CAPTION_TEMPLATE_IDS.map((id) => {
					const isOn = style.templateId === id;
					return (
						<button
							key={id}
							type="button"
							disabled={isApplying}
							onClick={() => void applyTemplate(id)}
							aria-pressed={isOn}
							className={cn("tb-caption-template", isOn && "is-on")}
						>
							<span className="tb-caption-stage">
								<TemplatePreview look={CAPTION_TEMPLATES[id]} />
							</span>
							<span className="text-xs font-medium">
								{t(`media.captionStyle.templates.${id}` as TKey)}
							</span>
						</button>
					);
				})}
			</div>

			<b className="mt-2 text-sm font-semibold">
				{t("media.captionStyle.customize")}
			</b>

			<div className="flex flex-col gap-1.5">
				<span className="text-muted-foreground text-xs">
					{t("media.captionStyle.font")}
				</span>
				<FontPicker
					key={currentLook.fontFamily}
					defaultValue={currentLook.fontFamily}
					onValueChange={(fontFamily) => void update({ fontFamily })}
				/>
			</div>

			<div className="flex flex-col gap-1.5">
				<span className="text-muted-foreground text-xs">
					{t("media.captionStyle.size")}
				</span>
				<Slider
					min={3}
					max={12}
					step={0.5}
					value={[fontSize]}
					onValueCommit={([value]) =>
						void update(
							isVertical
								? { fontSizeVertical: value }
								: { fontSizeHorizontal: value },
						)
					}
				/>
			</div>

			<div className="grid grid-cols-2 gap-2">
				<div className="flex flex-col gap-1.5">
					<span className="text-muted-foreground text-xs">
						{t("media.captionStyle.textColor")}
					</span>
					<ColorPicker
						value={currentLook.color.replace(/^#/, "").toUpperCase()}
						onChangeEnd={(color) => void update({ color: `#${color}` })}
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<span className="text-muted-foreground text-xs">
						{t("media.captionStyle.highlightColor")}
					</span>
					<ColorPicker
						value={(style.highlight === "box"
							? style.boxColor
							: style.highlightColor
						)
							.replace(/^#/, "")
							.toUpperCase()}
						onChangeEnd={(color) =>
							void updateStyle(
								style.highlight === "box"
									? { boxColor: `#${color}` }
									: { highlightColor: `#${color}` },
							)
						}
					/>
				</div>
			</div>

			<div className="flex flex-col gap-1.5">
				<span className="text-muted-foreground text-xs">
					{t("media.captionStyle.highlightMode")}
				</span>
				<Select
					value={style.highlight}
					onValueChange={(value) =>
						void updateStyle({ highlight: value as CaptionHighlightMode })
					}
				>
					<SelectTrigger>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{HIGHLIGHT_MODES.map((mode) => (
							<SelectItem key={mode} value={mode}>
								{t(`media.captionStyle.modes.${mode}` as TKey)}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<label className="flex items-center justify-between gap-2 text-sm">
				{t("media.captionStyle.pop")}
				<Switch
					checked={style.popScale > 1}
					onCheckedChange={(on) =>
						void updateStyle({
							popScale: on ? DEFAULT_CAPTION_STYLE.popScale : 1,
						})
					}
				/>
			</label>

			<label className="flex items-center justify-between gap-2 text-sm">
				{t("media.captionStyle.stroke")}
				<Switch
					checked={style.strokeWidth > 0}
					onCheckedChange={(on) =>
						void updateStyle({
							strokeWidth: on ? DEFAULT_CAPTION_STYLE.strokeWidth : 0,
						})
					}
				/>
			</label>
			{style.strokeWidth > 0 && (
				<div className="flex flex-col gap-1.5">
					<span className="text-muted-foreground text-xs">
						{t("media.captionStyle.strokeColor")}
					</span>
					<ColorPicker
						value={style.strokeColor.replace(/^#/, "").toUpperCase()}
						onChangeEnd={(color) =>
							void updateStyle({ strokeColor: `#${color}` })
						}
					/>
				</div>
			)}

			<label className="flex items-center justify-between gap-2 text-sm">
				{t("media.captionStyle.shadow")}
				<Switch
					checked={style.shadowBlur > 0}
					onCheckedChange={(on) =>
						void updateStyle({
							shadowBlur: on ? DEFAULT_CAPTION_STYLE.shadowBlur : 0,
							shadowColor: on
								? DEFAULT_CAPTION_STYLE.shadowColor
								: style.shadowColor,
							shadowOffsetY: DEFAULT_CAPTION_STYLE.shadowOffsetY,
						})
					}
				/>
			</label>

			<div className="flex flex-col gap-1.5">
				<span className="text-muted-foreground text-xs">
					{t("media.captionStyle.animation")}
				</span>
				<Select
					value={style.animation}
					onValueChange={(value) =>
						void updateStyle({ animation: value as CaptionEntryAnimation })
					}
				>
					<SelectTrigger>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{ANIMATIONS.map((animation) => (
							<SelectItem key={animation} value={animation}>
								{t(`media.captionStyle.animations.${animation}` as TKey)}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
		</div>
	);
}
