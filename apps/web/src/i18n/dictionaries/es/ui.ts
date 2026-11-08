import type { Dictionary } from "../../types";

const ui: Dictionary["ui"] = {
	breadcrumb: {
		label: "Ruta de navegación",
		more: "Más",
	},
	colorPicker: {
		modePlaceholder: "Elige un modo",
		custom: "Personalizado",
		saved: "Guardados",
	},
	fontPicker: {
		tabs: {
			all: "Todas las fuentes",
			myFonts: "Mis fuentes",
			favorites: "Favoritos",
		},
		selectFont: "Elige una fuente",
		searchPlaceholder: "Buscar en {tab}…",
		loading: "Cargando fuentes…",
		loadFailed: "No se pudieron cargar las fuentes.",
		noResults: "No se encontraron fuentes.",
	},
	input: {
		clear: "Borrar",
		showPassword: "Mostrar contraseña",
		hidePassword: "Ocultar contraseña",
	},
	numberField: {
		dragToAdjust: "Arrastra para ajustar",
		resetToDefault: "Restablecer",
	},
};

export default ui;
