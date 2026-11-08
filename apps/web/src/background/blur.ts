import { t } from "@/i18n";

export const BACKGROUND_BLUR_INTENSITY_PRESETS: Array<{
	label: string;
	value: number;
}> = [
	{ get label() { return t("effects.backgroundBlur.light"); }, value: 100 },
	{ get label() { return t("effects.backgroundBlur.medium"); }, value: 200 },
	{ get label() { return t("effects.backgroundBlur.strong"); }, value: 500 },
] as const;

export const DEFAULT_BACKGROUND_BLUR_INTENSITY = 10;
