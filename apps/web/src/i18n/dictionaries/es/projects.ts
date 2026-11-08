import type { Dictionary } from "../../types";

const projects: Dictionary["projects"] = {
	allProjects: "Todos los proyectos",
	view: {
		grid: "Ver en cuadrícula",
		list: "Ver en lista",
	},
	sort: {
		createdAt: "Creado",
		updatedAt: "Modificado",
		name: "Nombre",
		duration: "Duración",
		ascending: "Orden ascendente",
		descending: "Orden descendente",
	},
	selectAll: "Seleccionar todo",
	searchPlaceholder: "Buscar…",
	start: {
		title: "Empezar un proyecto",
		subtitle: "Elige el formato. Puedes cambiarlo después en la configuración del proyecto.",
		recentTitle: "Proyectos recientes",
	},
	formats: {
		vertical: { name: "Vertical", hint: "TikTok, Reels y Shorts" },
		horizontal: { name: "Horizontal", hint: "YouTube y transmisiones" },
		square: { name: "Cuadrado", hint: "Feed y publicaciones" },
		portrait: { name: "Retrato", hint: "Feed de Instagram" },
		auto: { name: "Automático", hint: "Sigue el tamaño del primer video" },
	},
	newProjectDialog: {
		title: "Nuevo proyecto",
		description: "Ponle un nombre y elige el formato del video.",
		nameLabel: "Nombre del proyecto",
		formatLabel: "Formato",
		create: "Crear y abrir",
		creating: "Creando…",
	},
	newProject: {
		button: "Proyecto nuevo",
		buttonShort: "Nuevo",
		defaultName: "Proyecto nuevo",
		createFailed: "No se pudo crear el proyecto",
	},
	card: {
		thumbnailAlt: "Portada del proyecto",
		createdOn: "Creado el {date}",
	},
	menu: {
		label: "Menú del proyecto",
		info: "Información",
	},
	empty: {
		noResultsTitle: "No se encontró nada",
		noResultsText: "Ningún proyecto coincide con \"{query}\". Prueba con otra palabra.",
		clearSearch: "Borrar búsqueda",
		noProjectsTitle: "Todavía no hay proyectos",
		noProjectsText:
			"Crea tu primer proyecto: trae tus archivos, edita y exporta tus videos. Todo se queda en tu computadora.",
		createFirst: "Crea tu primer proyecto",
	},
	deleteDialog: {
		titleSingleBefore: "¿Eliminar \"",
		titleSingleAfter: "\"?",
		titleMany: "¿Eliminar {count} proyectos?",
		warning: "Atención",
		descriptionSingle:
			"Esto eliminará \"{name}\" para siempre, junto con todos sus archivos.",
		descriptionMany:
			"Esto eliminará {count} proyectos para siempre, junto con todos sus archivos.",
		typeToConfirm: "Escribe ELIMINAR para confirmar",
		confirmWord: "ELIMINAR",
		confirm: "Eliminar proyecto",
	},
	renameDialog: {
		title: "Renombrar proyecto",
		newName: "Nombre nuevo",
		placeholder: "Escribe el nombre nuevo",
	},
	infoDialog: {
		duration: "Duración",
		created: "Creado",
		updated: "Modificado",
		projectCode: "Código del proyecto",
	},
	migration: {
		titleSingle: "Actualizando el proyecto",
		titleMany: "Actualizando los proyectos",
		descriptionSingle:
			"Preparando \"{name}\" para la nueva versión de THEBOSS CUT. No cierres el programa.",
		descriptionMany:
			"Preparando tus proyectos para la nueva versión de THEBOSS CUT. No cierres el programa.",
	},
};

export default projects;
