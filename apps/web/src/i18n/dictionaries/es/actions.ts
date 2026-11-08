import type { Dictionary } from "../../types";

const actions: Dictionary["actions"] = {
	list: {
		togglePlay: "Reproducir/Pausar",
		stopPlayback: "Detener",
		seekForward: "Avanzar 1 segundo",
		seekBackward: "Retroceder 1 segundo",
		frameStepForward: "Avanzar un fotograma",
		frameStepBackward: "Retroceder un fotograma",
		jumpForward: "Avanzar 5 segundos",
		jumpBackward: "Retroceder 5 segundos",
		gotoStart: "Ir al inicio",
		gotoEnd: "Ir al final",
		split: "Dividir en el cabezal",
		splitLeft: "Dividir y quitar la izquierda",
		splitRight: "Dividir y quitar la derecha",
		deleteSelected: "Eliminar la selección",
		copySelected: "Copiar los elementos seleccionados",
		pasteCopied: "Pegar elementos en el cabezal",
		toggleSnapping: "Activar/desactivar el ajuste",
		toggleRippleEditing: "Activar/desactivar la edición en cascada",
		toggleSourceAudio: "Separar o recuperar el audio original",
		selectAll: "Seleccionar todos los elementos",
		cancelInteraction: "Cancelar la acción actual",
		deselectAll: "Quitar la selección",
		duplicateSelected: "Duplicar el elemento seleccionado",
		toggleElementsMutedSelected:
			"Silenciar o activar el sonido de los elementos seleccionados",
		toggleElementsVisibilitySelected:
			"Mostrar u ocultar los elementos seleccionados",
		toggleBookmark: "Marcador en el cabezal",
		undo: "Deshacer",
		redo: "Rehacer",
		removeMediaAsset: "Quitar archivo",
		removeMediaAssets: "Quitar archivos",
	},
	selection: {
		selectableItems: "Elementos seleccionables",
	},
	categories: {
		playback: "Reproducción",
		navigation: "Navegación",
		editing: "Edición",
		selection: "Selección",
		history: "Historial",
		timeline: "Línea de tiempo",
		controls: "Controles",
		assets: "Archivos",
	},
	shortcutsDialog: {
		title: "Atajos de teclado",
		resetToDefaults: "Restablecer",
		or: "o",
		pressKeys: "Presiona una combinación de teclas…",
		clickToEdit: "Haz clic para cambiar el atajo",
		keyInUse: 'La tecla "{key}" ya se usa para "{action}". Elige otra.',
	},
	elementName: {
		copy: "{name} (copia)",
		left: "{name} (izquierda)",
		right: "{name} (derecha)",
	},
	project: {
		mainScene: "Escena principal",
		createFailed: "No se pudo guardar el proyecto nuevo",
		notFound: "Proyecto no encontrado",
		notFoundMany: "Proyectos no encontrados",
		someNotFound:
			"No se encontraron algunos proyectos. Actualiza la lista e inténtalo de nuevo.",
		renameFailed: "No se pudo cambiar el nombre del proyecto",
		duplicateFailed: "No se pudieron duplicar los proyectos",
	},
	storage: {
		lowSpace: "Queda poco espacio para guardar",
		lowSpaceHint:
			"Elimina proyectos o archivos que ya no uses e inténtalo de nuevo.",
	},
	snapshot: {
		notSupported:
			'Este navegador no permite copiar imágenes. Usa "Guardar captura".',
		nothingToCapture: "Abre un proyecto para tomar una captura.",
		projectEmpty:
			"El proyecto está vacío. Agrega algo a la línea de tiempo primero.",
		imageFailed: "No se pudo crear la imagen. Inténtalo de nuevo.",
		unknownError: "Algo salió mal. Inténtalo de nuevo.",
		defaultFileName: "captura",
	},
	export: {
		noProject: "Abre un proyecto para exportar.",
		projectEmpty:
			"El proyecto está vacío. Agrega algo a la línea de tiempo antes de exportar.",
		failed: "No se pudo generar el video. Inténtalo de nuevo.",
		unknownError: "Algo salió mal al exportar. Inténtalo de nuevo.",
	},
};

export default actions;
