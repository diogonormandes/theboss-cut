import type { Dictionary } from "../../types";

const ui: Dictionary["ui"] = {
	breadcrumb: {
		label: "Breadcrumb",
		more: "More",
	},
	colorPicker: {
		modePlaceholder: "Choose a mode",
		custom: "Custom",
		saved: "Saved",
	},
	fontPicker: {
		tabs: {
			all: "All fonts",
			myFonts: "My fonts",
			favorites: "Favorites",
		},
		selectFont: "Choose a font",
		searchPlaceholder: "Search {tab}…",
		loading: "Loading fonts…",
		loadFailed: "Couldn't load the fonts.",
		noResults: "No fonts found.",
	},
	input: {
		clear: "Clear",
		showPassword: "Show password",
		hidePassword: "Hide password",
	},
	numberField: {
		dragToAdjust: "Drag to adjust",
		resetToDefault: "Reset to default",
	},
};

export default ui;
