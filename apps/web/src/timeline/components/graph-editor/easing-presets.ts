import { t } from "@/i18n";
import type { NormalizedCubicBezier } from "@/animation/types";

export const PRESET_MATCH_TOLERANCE = 0.02;

export interface EasingPreset {
	id: string;
	label: string;
	value: NormalizedCubicBezier;
	isCustom?: boolean;
}

export const BUILTIN_PRESETS: EasingPreset[] = [
	{
		id: "smooth",
		get label() {
			return t("timeline.graphEditor.presetNames.smooth");
		},
		value: [0.25, 0.1, 0.25, 1],
	},
	{
		id: "ease-out",
		get label() {
			return t("timeline.graphEditor.presetNames.easeOut");
		},
		value: [0, 0, 0.2, 1],
	},
	{
		id: "ease-in",
		get label() {
			return t("timeline.graphEditor.presetNames.easeIn");
		},
		value: [0.8, 0, 1, 1],
	},
	{
		id: "ease-in-out",
		get label() {
			return t("timeline.graphEditor.presetNames.easeInOut");
		},
		value: [0.4, 0, 0.2, 1],
	},
	{
		id: "pop",
		get label() {
			return t("timeline.graphEditor.presetNames.pop");
		},
		value: [0.175, 0.885, 0.32, 1.275],
	},
	{
		id: "linear",
		get label() {
			return t("timeline.graphEditor.presetNames.linear");
		},
		value: [0, 0, 1, 1],
	},
];
