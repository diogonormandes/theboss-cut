import { useSyncExternalStore } from "react";
import { en } from "./dictionaries/en";
import { es } from "./dictionaries/es";
import { pt } from "./dictionaries/pt";
import {
	DEFAULT_LOCALE,
	LOCALE_STORAGE_KEY,
	LOCALE_TAGS,
	type Locale,
	parseLocale,
} from "./locales";
import type { Dictionary, TKey, TVars } from "./types";

export * from "./locales";
export type { Dictionary, TKey, TVars } from "./types";

const DICTIONARIES: Record<Locale, Dictionary> = { pt, en, es };

function readInitialLocale(): Locale {
	if (typeof document === "undefined") return DEFAULT_LOCALE;
	const match = document.cookie.match(
		new RegExp(`(?:^|; )${LOCALE_STORAGE_KEY}=([^;]*)`),
	);
	if (match) return parseLocale(decodeURIComponent(match[1]));
	try {
		return parseLocale(localStorage.getItem(LOCALE_STORAGE_KEY));
	} catch {
		return DEFAULT_LOCALE;
	}
}

let currentLocale: Locale = readInitialLocale();
const listeners = new Set<() => void>();

export function getLocale(): Locale {
	return currentLocale;
}

/** Tag do idioma atual para datas e números (ex.: "pt-BR"). */
export function getLocaleTag(): string {
	return LOCALE_TAGS[currentLocale];
}

/**
 * Usado pelo provedor de idioma para alinhar o idioma com o que o servidor leu do cookie.
 * Não salva nada: para o usuário trocar de idioma, use `changeLocale`.
 */
export function syncLocale(locale: Locale): void {
	if (locale === currentLocale) return;
	currentLocale = locale;
	for (const listener of listeners) listener();
}

/** Salva o idioma escolhido e recarrega a tela para tudo aparecer no idioma novo. */
export function changeLocale(locale: Locale): void {
	const maxAge = 60 * 60 * 24 * 365 * 10;
	document.cookie = `${LOCALE_STORAGE_KEY}=${locale}; path=/; max-age=${maxAge}; samesite=lax`;
	try {
		localStorage.setItem(LOCALE_STORAGE_KEY, locale);
	} catch {
		// o cookie já basta
	}
	syncLocale(locale);
	window.location.reload();
}

function lookup(dictionary: Dictionary, key: string): string | undefined {
	let node: unknown = dictionary;
	for (const part of key.split(".")) {
		if (node === null || typeof node !== "object") return undefined;
		node = (node as Record<string, unknown>)[part];
	}
	return typeof node === "string" ? node : undefined;
}

function interpolate(text: string, vars?: TVars): string {
	if (!vars) return text;
	return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
		name in vars ? String(vars[name]) : whole,
	);
}

/**
 * Busca um texto no idioma atual. Pode ser usado em qualquer lugar (componentes, toasts, listas).
 * Ex.: t("projects.deleted", { count: 3 })
 */
export function t(key: TKey, vars?: TVars): string {
	const text =
		lookup(DICTIONARIES[currentLocale], key) ??
		lookup(DICTIONARIES[DEFAULT_LOCALE], key) ??
		key;
	return interpolate(text, vars);
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

/** Idioma atual dentro de um componente (re-renderiza se mudar). */
export function useLocale(): Locale {
	return useSyncExternalStore(subscribe, getLocale, getLocale);
}

/** Em componentes: `const t = useT();` e depois `t("common.cancel")`. */
export function useT(): typeof t {
	useLocale();
	return t;
}
