import type { Dictionary } from "../../types";

const media: Dictionary["media"] = {
	upload: {
		uploadingOne: "Importando archivo…",
		uploadingMany: "Importando archivos…",
		uploadedNamed: "Se importó {name}",
		uploadedOne: "Se importó 1 archivo",
		uploadedMany: "Se importaron {count} archivos",
		uploadedNone: "No se importó ningún archivo",
		failedOne: "No se pudo importar el archivo. Inténtalo de nuevo.",
		failedMany: "No se pudieron importar los archivos. Inténtalo de nuevo.",
		unsupportedType:
			"THEBOSS CUT no abre este tipo de archivo: {name}. Usa un video, una imagen o un audio.",
		noSpace: "No hay espacio para guardar {name}",
		noSpaceSize:
			"El archivo pesa {size}. Borra proyectos o archivos que ya no uses para liberar espacio.",
		noSpaceSizeAvailable:
			"El archivo pesa {size}, pero solo quedan {available} libres. Borra proyectos o archivos que ya no uses para liberar espacio.",
		cantPreview: "No se puede ver la vista previa de {name}",
		unknownCodec: "Este formato de video",
		codecHint:
			"{codec} no se puede reproducir aquí, así que este video puede no verse bien en la vista previa. Conviértelo a MP4 (H.264) e impórtalo de nuevo.",
		processFailed: "No se pudo abrir {name}",
		processFailedDescription:
			"El archivo puede estar dañado o en otro formato. Intenta convertirlo a MP4 e impórtalo de nuevo.",
		failed: "No se pudo importar {name}. Inténtalo de nuevo.",
	},
	storage: {
		quotaExceeded:
			"No hay espacio para guardar un archivo de {size}. Borra proyectos o archivos que ya no uses e inténtalo de nuevo.",
		persistDialog: {
			title: "No pierdas tus proyectos",
			warning:
				"Cuando la computadora se queda con poco espacio, los proyectos pueden borrarse solos.",
			question: "¿Dejar que THEBOSS CUT proteja tus proyectos?",
			notNow: "Ahora no",
			allow: "Permitir",
		},
	},
	offline: {
		badge: "Medio sin conexión",
		wasAt: "Estaba en: {path}",
		locate: "Buscar archivo",
		locating: "Buscando…",
		reasonMissing:
			"El archivo se movió, se renombró o se borró. Haz clic en Buscar archivo y elige dónde está ahora.",
		reasonChanged:
			"El archivo en este lugar ya no es el mismo. Haz clic en Buscar archivo y elige la grabación original.",
		reasonPermission:
			"Haz clic en Buscar archivo para volver a permitir el acceso a esta grabación.",
		relinked: "{name} volvió a funcionar",
		mismatch: "No parece ser el mismo archivo",
		mismatchHint:
			"El tamaño o la duración no coinciden con {name}. Elige la grabación original.",
		failed: "No se pudo volver a conectar el archivo. Inténtalo de nuevo.",
		remove: "Quitar de la lista",
		linked: "Usado directo desde tu PC",
		linkedHint:
			"Este archivo no se copió a THEBOSS CUT, para no ocupar el doble de espacio. No muevas ni borres el archivo mientras lo uses.",
		exportBlocked:
			"{name} no está conectado. Haz clic en Buscar archivo en la pestaña de medios y luego exporta de nuevo.",
	},
	sounds: {
		tabs: {
			soundEffects: "Efectos de sonido",
			saved: "Guardados",
		},
		searchPlaceholder: "Buscar efectos de sonido",
		filter: "Filtrar sonidos",
		commercialOnly: "Solo los permitidos para uso comercial",
		commercialOnlyOn: "Mostrando solo sonidos permitidos para uso comercial",
		commercialOnlyOff: "Mostrando todos los sonidos, con cualquier licencia",
		loading: "Cargando sonidos…",
		searching: "Buscando…",
		loadingMore: "Cargando más sonidos…",
		notFound: "No se encontraron sonidos",
		noneAvailable: "No hay sonidos disponibles",
		loadingSaved: "Cargando sonidos guardados…",
		emptySavedTitle: "No hay sonidos guardados",
		emptySavedHint: "Haz clic en el corazón de un sonido para guardarlo aquí",
		savedCountOne: "1 sonido guardado",
		savedCountMany: "{count} sonidos guardados",
		clearAll: "Borrar todo",
		clearDialog: {
			title: "¿Borrar todos los sonidos guardados?",
			description:
				"Los {count} sonidos guardados se quitarán de tu lista. No se puede deshacer.",
			confirm: "Borrar todos los sonidos",
		},
		addToTimeline: "Agregar a la línea de tiempo",
		save: "Guardar sonido",
		unsave: "Quitar de guardados",
		errors: {
			searchFailed: "No se pudieron buscar sonidos. Revisa tu conexión a internet e inténtalo de nuevo.",
			loadSaved:
				"No se pudieron cargar los sonidos guardados. Cierra y vuelve a abrir THEBOSS CUT.",
			save: "No se pudo guardar el sonido. Inténtalo de nuevo.",
			remove: "No se pudo quitar el sonido. Inténtalo de nuevo.",
			clear: "No se pudieron borrar los sonidos guardados. Inténtalo de nuevo.",
		},
		toast: {
			saveFailed: "No se pudo guardar el sonido",
			removeFailed: "No se pudo quitar el sonido",
			clearFailed: "No se pudieron borrar los sonidos guardados",
			unavailable: "Sonido no disponible",
			addFailed:
				"No se pudo agregar el sonido. Revisa tu conexión a internet e inténtalo de nuevo.",
		},
	},
	stickers: {
		searchPlaceholder: "Buscar…",
		categoriesLabel: "Categorías de stickers",
		categories: {
			all: "Todos",
			flags: "Banderas",
			shapes: "Formas",
		},
		recent: "Usados recientemente",
		clear: "Borrar",
		seeAll: "Ver todo",
		results: "{count} resultados",
		emptyTitle: "No se encontraron stickers",
		notFoundFor: "No se encontraron stickers para “{query}”",
		noneAvailable: "Todavía no hay stickers disponibles.",
		noneInCategory: "Todavía no hay stickers en {category}.",
		addFailed: "No se pudo agregar el sticker",
		shapes: {
			square: "Cuadrado",
			circle: "Círculo",
			triangle: "Triángulo",
			hexagon: "Hexágono",
			diamond: "Rombo",
			star: "Estrella",
		},
		regionGroups: {
			europe: "Europa",
			asia: "Asia",
			africa: "África",
			america: "América",
		},
		regions: {
			westernEurope: "Europa Occidental",
			easternEurope: "Europa del Este",
			northernEurope: "Norte de Europa",
			southernEurope: "Sur de Europa",
			southAsia: "Sur de Asia",
			southeastAsia: "Sudeste Asiático",
			eastAsia: "Asia Oriental",
			centralAsia: "Asia Central",
			middleEast: "Medio Oriente",
			northAfrica: "Norte de África",
			subSaharanAfrica: "África Subsahariana",
			northAmerica: "América del Norte",
			southAmerica: "América del Sur",
			centralAmerica: "Centroamérica",
			caribbean: "Caribe",
			oceania: "Oceanía",
			antarctica: "Antártida",
			atlanticOcean: "Océano Atlántico",
			northAtlantic: "Atlántico Norte",
		},
		countries: {
			england: "Inglaterra",
			northernIreland: "Irlanda del Norte",
			scotland: "Escocia",
			wales: "Gales",
		},
	},
	wordFixes: {
		title: "Corregir palabras",
		hint: "Cambia una palabra en todos los subtítulos. El cambio se guarda y se aplica solo en los próximos.",
		from: "Cambiar",
		fromPlaceholder: "Ej.: Bosch",
		to: "por",
		toPlaceholder: "Ej.: BOSS",
		apply: "Corregir",
		appliedOne: "1 subtítulo corregido",
		applied: "{count} subtítulos corregidos",
		none: "Ningún subtítulo tenía esa palabra. El cambio quedó guardado para los próximos.",
		saved: "Cambios guardados",
		remove: "Quitar el cambio de {word}",
	},
	captionStyle: {
		title: "Estilo de los subtítulos",
		hint: "Toca un modelo para aplicarlo a todos los subtítulos. Puedes deshacer con Ctrl+Z.",
		sample: "Hola a todos",
		customize: "Personalizar",
		font: "Fuente",
		size: "Tamaño",
		textColor: "Color del texto",
		highlightColor: "Color del resaltado",
		highlightMode: "Resaltado de la palabra hablada",
		pop: "La palabra crece al hablar",
		stroke: "Contorno",
		strokeColor: "Color del contorno",
		shadow: "Sombra",
		animation: "Entrada del subtítulo",
		applied: "Estilo aplicado a {count} subtítulos",
		applyFailed: "No se pudo cambiar el estilo. Inténtalo de nuevo.",
		templates: {
			"boss-gold": "BOSS dorado",
			"neon": "Neón",
			"classic": "Clásico",
			"karaoke": "Karaoke",
			"box": "Caja",
		},
		modes: {
			color: "Solo el color",
			box: "Caja detrás",
			karaoke: "Karaoke (se va iluminando)",
			none: "Sin resaltado",
		},
		animations: {
			pop: "Saltar",
			fade: "Aparecer",
			slide: "Subir",
			none: "Ninguna",
		},
	},
	subtitles: {
		title: "Subtítulos",
		import: "Importar",
		language: "Idioma",
		chooseLanguage: "Elige el idioma",
		autoDetect: "Detectar automáticamente",
		quality: "Calidad",
		qualityFast: "Rápida",
		qualityFastHint: "Termina antes. Buena para habla clara.",
		qualityAccurate: "Precisa",
		qualityAccurateHint: "Entiende mejor el habla rápida y el ruido de transmisión.",
		firstDownload: "Descarga {size} MB solo la primera vez",
		privacyNote: "Todo se hace en tu PC: el video no sale de tu computadora.",
		generate: "Generar subtítulos",
		captionName: "Subtítulo {number}",
		steps: {
			extractingAudio: "Separando el audio…",
			preparingAudio: "Preparando el audio…",
			loadingModel: "Descargando el reconocimiento de voz {percent}% (solo la primera vez)",
			transcribing: "Transcribiendo…",
			generating: "Creando los subtítulos…",
			reading: "Leyendo el archivo de subtítulos…",
			importing: "Importando los subtítulos…",
		},
		errors: {
			noCaptions:
				"No se creó ningún subtítulo. Revisa que el video tenga voz.",
			noCues:
				"No encontramos subtítulos en este archivo. Revisa que sea un archivo .srt o .ass válido.",
			transcribeFailed:
				"No se pudieron generar los subtítulos. Inténtalo de nuevo o elige el idioma del video.",
			importFailed:
				"No se pudieron importar los subtítulos. Usa un archivo .srt o .ass e inténtalo de nuevo.",
		},
		warnings: {
			skipped:
				"Se importaron {imported} subtítulos; se omitieron {skipped} con errores.",
			strippedTags:
				"Se quitaron algunos efectos dentro del texto de {count} subtítulos.",
			ignoredEffects:
				"Se ignoraron efectos de animación en {count} subtítulos.",
			missingStyles:
				"{count} subtítulos usaban un estilo que no está en el archivo y quedaron con el estilo predeterminado.",
			nonDialogue: "Se ignoraron {count} elementos que no son diálogos.",
			unsupportedStyles:
				"Se ignoraron algunos estilos del archivo, como contorno, sombra, rotación o tamaño.",
		},
	},
	transcription: {
		noAudio:
			"No se encontró audio. Primero agrega a la línea de tiempo un video o audio con sonido.",
		languages: {
			en: "Inglés",
			es: "Español",
			it: "Italiano",
			fr: "Francés",
			de: "Alemán",
			pt: "Portugués",
			ru: "Ruso",
			ja: "Japonés",
			zh: "Chino",
		},
		models: {
			tiny: "La más rápida, menos precisa",
			small: "Buen equilibrio entre rapidez y precisión",
			medium: "Más precisa, más lenta",
			largeTurbo: "La más precisa; es rápida en tarjetas gráficas más nuevas",
		},
	},
};

export default media;
