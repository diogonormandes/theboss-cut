import { t } from "@/i18n";

// Os nomes são traduzidos na hora em que aparecem na tela.
export const STICKER_CATEGORIES = {
	get all() {
		return t("media.stickers.categories.all");
	},
	// v0.4.0
	// logos: "Logos",
	get flags() {
		return t("media.stickers.categories.flags");
	},
	get shapes() {
		return t("media.stickers.categories.shapes");
	},
};
