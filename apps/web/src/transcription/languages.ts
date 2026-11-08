import { t } from "@/i18n";

// O nome de cada idioma é traduzido na hora em que aparece na tela.
export const LANGUAGES = [
	{
		code: "en",
		get name() {
			return t("media.transcription.languages.en");
		},
	},
	{
		code: "es",
		get name() {
			return t("media.transcription.languages.es");
		},
	},
	{
		code: "it",
		get name() {
			return t("media.transcription.languages.it");
		},
	},
	{
		code: "fr",
		get name() {
			return t("media.transcription.languages.fr");
		},
	},
	{
		code: "de",
		get name() {
			return t("media.transcription.languages.de");
		},
	},
	{
		code: "pt",
		get name() {
			return t("media.transcription.languages.pt");
		},
	},
	{
		code: "ru",
		get name() {
			return t("media.transcription.languages.ru");
		},
	},
	{
		code: "ja",
		get name() {
			return t("media.transcription.languages.ja");
		},
	},
	{
		code: "zh",
		get name() {
			return t("media.transcription.languages.zh");
		},
	},
] as const;

export type Language = (typeof LANGUAGES)[number];
export type LanguageCode = Language["code"];
