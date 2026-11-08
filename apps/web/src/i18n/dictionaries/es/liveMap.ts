import type { Dictionary } from "../../types";

// Mapa del directo: franja encima de la línea de tiempo con habla, gritos y silencios.
const liveMap: Dictionary["liveMap"] = {
	title: "Mapa del directo",
	analyze: "Analizar el directo",
	explain: "Escucha el directo en tu PC para encontrar habla, gritos y silencios. Nada sale de tu computadora.",
	track: "Pista de audio",
	trackNumber: "Pista {n}",
	trackHint: "Si tu grabación tiene una pista solo del micrófono, elígela: el mapa será más preciso.",
	analyzing: "Escuchando el directo… {done} de {total}",
	remaining: "faltan unos {time}",
	starting: "Preparando…",
	cancel: "Cancelar",
	retry: "Intentar de nuevo",
	reanalyze: "Analizar de nuevo",
	errorNoAudio: "Este video no tiene sonido para analizar. Elige un video con audio.",
	errorCannotDecode: "El sonido de este archivo no se puede abrir aquí. En OBS, usa Archivo → Remuxear grabaciones a MP4 e impórtalo de nuevo.",
	errorFailed: "No se pudo escuchar el directo. Comprueba que el archivo sigue en el mismo lugar e inténtalo de nuevo.",
	errorOffline: "No se encontró el archivo del directo. Usa “Buscar archivo” en el medio e inténtalo de nuevo.",
	summaryShoutsOne: "1 grito",
	summaryShouts: "{n} gritos",
	summaryPeaksOne: "1 momento fuerte",
	summaryPeaks: "{n} momentos fuertes",
	summarySilence: "{silence} de silencio",
	legendSpeech: "Habla",
	legendSilence: "Silencio",
	legendShout: "Grito",
	legendPeak: "Momento fuerte",
	clickHint: "Haz clic para llevar el cabezal a ese punto.",
	hoverShout: "Grito",
	hoverPeak: "Momento fuerte",
	hoverSilence: "Silencio",
	hoverSpeech: "Habla",
	hoverSound: "Sonido",
};

export default liveMap;
