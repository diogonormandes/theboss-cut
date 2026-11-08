import { t } from "@/i18n";
import type { TrackType } from "@/timeline";

// Getters: o nome é traduzido na hora em que a faixa é criada.
export const DEFAULT_TRACK_NAMES: Record<TrackType, string> = {
	get video() {
		return t("timeline.track.defaultNames.video");
	},
	get text() {
		return t("timeline.track.defaultNames.text");
	},
	get audio() {
		return t("timeline.track.defaultNames.audio");
	},
	get graphic() {
		return t("timeline.track.defaultNames.graphic");
	},
	get effect() {
		return t("timeline.track.defaultNames.effect");
	},
};
