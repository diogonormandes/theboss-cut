// Formatos prontos para começar um projeto (tela inicial).
import type { TCanvasSize } from "@/project/types";

export const PROJECT_FORMAT_IDS = [
	"vertical",
	"horizontal",
	"square",
	"portrait",
	"auto",
] as const;
export type ProjectFormatId = (typeof PROJECT_FORMAT_IDS)[number];

export type ProjectFormat = {
	id: ProjectFormatId;
	/** proporção mostrada no cartão, ex.: "9:16" (o automático não tem) */
	ratio: string | null;
	/** tamanho do vídeo; sem tamanho = segue o primeiro vídeo colocado */
	canvasSize?: TCanvasSize;
};

export const PROJECT_FORMATS: ProjectFormat[] = [
	{ id: "vertical", ratio: "9:16", canvasSize: { width: 1080, height: 1920 } },
	{ id: "horizontal", ratio: "16:9", canvasSize: { width: 1920, height: 1080 } },
	{ id: "square", ratio: "1:1", canvasSize: { width: 1080, height: 1080 } },
	{ id: "portrait", ratio: "4:5", canvasSize: { width: 1080, height: 1350 } },
	{ id: "auto", ratio: null },
];
