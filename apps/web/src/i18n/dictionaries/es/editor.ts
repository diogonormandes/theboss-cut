import type { Dictionary } from "../../types";

const editor: Dictionary["editor"] = {
	save: {
		saving: "Guardando…",
		saved: "Guardado",
		savedHint: "Todo guardado en tu PC a las {time}",
		pending: "Guardando…",
		error: "Sin guardar",
		errorHint: "No se pudo guardar. Libera espacio en tu PC; THEBOSS CUT lo intentará de nuevo solo.",
		errorToast: "No se pudo guardar el proyecto",
		errorToastText: "Libera espacio en tu PC (borra archivos que no uses). THEBOSS CUT intentará guardar de nuevo solo.",
	},
	header: {
		exitProject: "Salir del proyecto",
		shortcuts: "Atajos",
		renameFailed: "No se pudo renombrar el proyecto",
		deleteFailed: "No se pudo eliminar el proyecto",
	},
	loader: {
		opening: "Abriendo el proyecto…",
		closing: "Saliendo del proyecto…",
		createFailed:
			"No se pudo crear el proyecto. Vuelve a la lista de proyectos e inténtalo de nuevo.",
		loadFailed:
			"No se pudo abrir el proyecto. Vuelve a la lista de proyectos e inténtalo de nuevo.",
	},
	degradedBanner: "Para una mejor experiencia, usa THEBOSS CUT actualizado.",
	storage: {
		incomplete:
			"El almacenamiento de esta computadora no está completo. Algunas funciones pueden fallar.",
		unknownError: "Algo salió mal al cargar tus proyectos.",
	},
	export: {
		button: "Exportar",
		title: "Exportar proyecto",
		titleExporting: "Exportando proyecto",
		format: "Formato",
		formatMp4: "MP4 (H.264) - se abre en todo",
		formatWebm: "WebM (VP9) - archivo más liviano",
		quality: "Calidad",
		qualityLow: "Baja - archivo más liviano",
		qualityMedium: "Media - equilibrada",
		qualityHigh: "Alta - recomendada",
		qualityVeryHigh: "Muy alta - archivo más pesado",
		audio: "Audio",
		includeAudio: "Exportar con audio",
		failed: "No se pudo exportar",
		unknownError: "Algo salió mal. Intenta exportar de nuevo.",
		copy: "Copiar",
		retry: "Intentar de nuevo",
	},
	mobileGate: {
		title: "Solo en computadora (por ahora)",
		text: "THEBOSS CUT fue hecho para computadora. En pantallas pequeñas la edición queda apretada.",
		continue: "Ver de todos modos",
	},
	onboarding: {
		welcomeTitle: "Bienvenido a THEBOSS CUT",
		welcomeText:
			"El editor de video de THEBOSSVERSE: corta, subtitula, agrega textos, efectos y música, y exporta listo para publicar.",
		localTitle: "Tus videos se quedan en tu PC",
		localText:
			"Nada se sube a internet: tus proyectos y archivos se guardan en esta computadora.",
		localDrag:
			"Arrastra videos, fotos y música al área de medios para empezar.",
		tipsTitle: "Consejos rápidos",
		tipsText:
			"Espacio reproduce y pausa. S divide en el cabezal. En el menú del tridente, arriba, están todos los atajos.",
		start: "Empezar a editar",
	},
	scenes: {
		title: "Escenas",
		description: "Cambia entre las escenas de tu proyecto",
		selectTitle: "Seleccionar escenas ({count})",
		selectDescription: "Elige las escenas que quieres eliminar",
		select: "Seleccionar",
		deleteCount: "Eliminar ({count})",
		empty: "No hay escenas",
		deleteFailed: "No se pudo eliminar la escena",
		deleteTitle: "Eliminar escenas",
		deleteConfirmOne: "¿Eliminar 1 escena? No se puede deshacer.",
		deleteConfirmMany: "¿Eliminar {count} escenas? No se puede deshacer.",
	},
	timecode: {
		clickToEdit: "Haz clic para cambiar el tiempo",
	},
	section: {
		collapse: "Contraer sección",
		expand: "Abrir sección",
	},
	theme: {
		light: "Claro",
		dark: "Oscuro",
	},
	icons: {
		video: "Video",
		checkerboard: "Cuadrícula",
		sliders: "Ajustes",
		social: "Redes sociales",
		textWidth: "Ancho del texto",
		textHeight: "Alto del texto",
		font: "Fuente",
		shapes: "Formas",
		mirror: "Reflejar",
		squarePlus: "Agregar",
		ripple: "Edición en cascada",
	},
};

export default editor;
