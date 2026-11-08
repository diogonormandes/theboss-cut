// Idiomas do THEBOSS CUT. Português é o padrão.
export const LOCALES = ["pt", "en", "es"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "pt";

// Guardado em cookie (para o servidor já montar a tela no idioma certo) e no navegador.
export const LOCALE_STORAGE_KEY = "thebosscut-idioma";

// Valor do atributo lang do <html> e da formatação de datas/números.
export const LOCALE_TAGS: Record<Locale, string> = {
	pt: "pt-BR",
	en: "en-US",
	es: "es",
};

// Nome de cada idioma escrito no próprio idioma (não traduz).
export const LOCALE_NATIVE_NAMES: Record<Locale, string> = {
	pt: "Português",
	en: "English",
	es: "Español",
};

export function parseLocale(value: unknown): Locale {
	return typeof value === "string" &&
		(LOCALES as readonly string[]).includes(value)
		? (value as Locale)
		: DEFAULT_LOCALE;
}
