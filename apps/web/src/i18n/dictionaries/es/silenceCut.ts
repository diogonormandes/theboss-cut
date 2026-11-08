// Etapa 3 (silenceCut): sección "Cortar silencios".
const silenceCut = {
	title: "Cortar silencios",
	explain: "Quita las pausas sin habla del video. El rojo en el mapa muestra lo que saldrá.",
	strength: "Intensidad",
	soft: "Suave",
	strong: "Fuerte",
	strengthHint: "Suave quita solo el silencio total. Fuerte quita también las partes muy bajas.",
	minSilence: "Pausa mínima",
	minSilenceHint: "Solo corta pausas de al menos este tiempo.",
	seconds: "{n} s",
	willCutOne: "Cortará 1 tramo ({time})",
	willCut: "Cortará {n} tramos ({time})",
	nothing: "Ningún silencio con este ajuste. Prueba una intensidad más fuerte.",
	apply: "Cortar silencios",
	needAnalysis: "Para encontrar los silencios, primero analiza el directo.",
	analyzing: "Analizando el directo… el resultado aparece aquí al terminar.",
	noLive: "Pon un directo (video de 10 minutos o más) en la línea de tiempo para usar esto.",
	noClip: "Selecciona en la línea de tiempo la parte del directo que quieres limpiar.",
	retimed: "Esta parte tiene la velocidad cambiada. Vuelve la velocidad a normal para cortar los silencios.",
	doneOne: "Listo: 1 silencio cortado. Para volver, usa Deshacer (Ctrl+Z).",
	done: "Listo: {n} silencios cortados. Para volver, usa Deshacer (Ctrl+Z).",
	newScene: "Sin silencios",
	newSceneDone: "Creamos la escena \"Sin silencios\" con el directo limpio. La escena principal quedó intacta.",
	failed: "No se pudo cortar. Selecciona de nuevo la parte del directo y vuelve a intentarlo.",
};

export default silenceCut;
