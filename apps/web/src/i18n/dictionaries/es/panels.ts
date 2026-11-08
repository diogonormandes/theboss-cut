import type { Dictionary } from "../../types";

const panels: Dictionary["panels"] = {
	assets: {
		tabs: {
			media: "Medios",
			sounds: "Sonidos",
			text: "Texto",
			stickers: "Stickers",
			effects: "Efectos",
			transitions: "Transiciones",
			captions: "Subtítulos",
			adjustment: "Ajuste",
			settings: "Configuración",
		},
		comingSoon: {
			transitions: "Transiciones muy pronto...",
			adjustment: "Ajustes muy pronto...",
		},
		dropZone: {
			processing: "Preparando tus archivos ({progress}%)",
			hint: "Arrastra y suelta videos, fotos y audios aquí",
		},
		addToTimeline: "Agrega a la línea de tiempo o arrastra para ubicar",
	},
	media: {
		title: "Medios",
		noProject: "No hay ningún proyecto abierto. Abre o crea un proyecto para importar archivos.",
		import: "Importar",
		exportClips: "Exportar fragmentos",
		deleteMany: "Eliminar {count} elementos",
		video: "Video",
		audio: "Audio",
		unknown: "Desconocido",
		listView: "Ver como lista",
		gridView: "Ver como cuadrícula",
		sortTooltip: "Ordenar por {key} ({order})",
		ascending: "ascendente",
		descending: "descendente",
		sort: {
			name: "Nombre",
			type: "Tipo",
			duration: "Duración",
			size: "Tamaño del archivo",
		},
	},
	settings: {
		projectInfo: "Información del proyecto",
		background: "Fondo",
		name: "Nombre",
		fps: "Fotogramas por segundo",
		fpsPlaceholder: "Elige los fotogramas por segundo",
		aspectRatio: "Relación de aspecto",
		custom: "Personalizado",
		canvasWidth: "Ancho del lienzo",
		canvasHeight: "Alto del lienzo",
	},
	background: {
		blur: "Desenfoque",
		selectBlur: "Elegir desenfoque {name}",
		selectBackground: "Elegir fondo {value}",
		customColor: "Elegir un color de fondo",
		colors: "Colores",
	},
	properties: {
		emptyTitle: "Todavía está vacío",
		emptyHint: "Haz clic en un elemento de la línea de tiempo para editarlo",
		multipleSelected: "{count} elementos seleccionados",
		toggleKeyframe: "Activar o desactivar el fotograma clave de {name}",
		tabs: {
			transform: "Transformar",
			blending: "Fusión",
			audio: "Audio",
			speed: "Velocidad",
			masks: "Máscaras",
			effects: "Efectos",
			text: "Texto",
			graphic: "Gráfico",
		},
	},
};

export default panels;
