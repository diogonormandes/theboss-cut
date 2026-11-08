import type { TProject, TProjectSettings } from "@/project/types";
import type { TScene } from "@/timeline/types";

/**
 * Configurações que valem para uma cena: as do projeto, trocando o formato
 * (`canvasSize`) quando a cena tem formato próprio (ex.: corte 9:16).
 *
 * Use onde o formato da cena deve valer — prévia, renderização e exportação.
 */
export function getSceneSettings({
	scene,
	project,
}: {
	scene: Pick<TScene, "canvasSize"> | null | undefined;
	project: Pick<TProject, "settings">;
}): TProjectSettings {
	const canvasSize = scene?.canvasSize;
	if (!canvasSize || canvasSize.width <= 0 || canvasSize.height <= 0) {
		return project.settings;
	}
	return { ...project.settings, canvasSize };
}
