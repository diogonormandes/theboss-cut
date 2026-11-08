// Temas do THEBOSS CUT: os mesmos do THEBOSSVERSE. As cores ficam em app/themes.css.
// O tema fica guardado neste PC e é aplicado na hora (sem recarregar).

import { useSyncExternalStore } from "react";
import { t } from "@/i18n";
import { DEFAULT_THEME as BOOT_DEFAULT, THEME_STORAGE_KEY } from "./boot";

export { THEME_BOOT_SCRIPT, THEME_STORAGE_KEY } from "./boot";

export const THEME_IDS = [
	"dourado",
	"obsidiana",
	"neon",
	"rubi",
	"esmeralda",
	"safira",
	"platina",
	"por-do-sol",
	"aurora",
	"carbono",
	"tatico",
	"royale",
	"aura",
	"sombras",
] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export const DEFAULT_THEME: ThemeId = BOOT_DEFAULT;

// cores só para o cartão de escolha (fundo, painel, destaque, destaque 2)
const THEME_SWATCHES: Record<ThemeId, [string, string, string, string]> = {
	dourado: ["#0a0a0b", "#16171a", "#c9a96a", "#f3dca2"],
	obsidiana: ["#000000", "#0b0b0c", "#e4e4e7", "#a1a1aa"],
	neon: ["#0a0713", "#140f24", "#c084fc", "#9333ea"],
	rubi: ["#12060c", "#1f0d16", "#ff4f8b", "#c2185b"],
	esmeralda: ["#04100a", "#0b1d13", "#22c55e", "#bbf7d0"],
	safira: ["#050b18", "#0b162e", "#3b82f6", "#bfdbfe"],
	platina: ["#16181c", "#20232a", "#cfe0f5", "#8fa6c4"],
	"por-do-sol": ["#130a16", "#211223", "#ff7a8a", "#a855f7"],
	aurora: ["#041210", "#0a1f1c", "#2dd4bf", "#f472b6"],
	carbono: ["#0a0a0a", "#141414", "#ef233c", "#565656"],
	tatico: ["#0d0e0a", "#181913", "#d4b77c", "#6b7a45"],
	royale: ["#110e04", "#1d1808", "#ffc400", "#ff7a00"],
	aura: ["#070a1a", "#0f1430", "#ff7a00", "#38bdf8"],
	sombras: ["#06040f", "#110c24", "#8b7bff", "#22d3ee"],
};

export type ThemeOption = {
	id: ThemeId;
	name: string;
	description: string;
	swatches: [string, string, string, string];
};

/** Lista para a tela de escolha (já no idioma atual). */
export function getThemeOptions(): ThemeOption[] {
	return THEME_IDS.map((id) => ({
		id,
		name: t(`theme.themes.${id}.name` as Parameters<typeof t>[0]),
		description: t(
			`theme.themes.${id}.description` as Parameters<typeof t>[0],
		),
		swatches: THEME_SWATCHES[id],
	}));
}

function parseTheme(value: unknown): ThemeId {
	return typeof value === "string" &&
		(THEME_IDS as readonly string[]).includes(value)
		? (value as ThemeId)
		: DEFAULT_THEME;
}

function readTheme(): ThemeId {
	if (typeof document === "undefined") return DEFAULT_THEME;
	return parseTheme(document.documentElement.getAttribute("data-tema"));
}

const listeners = new Set<() => void>();

export function getAppTheme(): ThemeId {
	return readTheme();
}

export function setAppTheme(theme: ThemeId): void {
	const root = document.documentElement;
	if (theme === DEFAULT_THEME) root.removeAttribute("data-tema");
	else root.setAttribute("data-tema", theme);
	try {
		localStorage.setItem(THEME_STORAGE_KEY, theme);
	} catch {
		// sem espaço para guardar: o tema vale só até fechar
	}
	for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function useAppTheme(): ThemeId {
	return useSyncExternalStore(subscribe, getAppTheme, () => DEFAULT_THEME);
}
