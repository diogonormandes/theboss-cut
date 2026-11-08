// Etapa 3 (framing): formato 9:16 de los cortes (Centrado, Dividido, Seguir rostro).
const framing = {
	title: "Encuadre",
	centered: "Centrado",
	centeredHint: "Muestra el centro de la imagen.",
	split: "Dividido",
	splitHint: "Cámara arriba, juego abajo.",
	follow: "Seguir rostro",
	followHint: "La imagen sigue tu rostro.",
	cameraTrack: "Cámara",
	gameTrack: "Juego",
	alreadyFits: "Tu video ya es vertical: el clip usa la imagen completa, sin necesidad de ajustar.",
	working: "Ajustando el encuadre…",
	doneOne: "Encuadre aplicado a 1 corte.",
	done: "Encuadre aplicado a {n} cortes.",
	noFace: "No encontramos tu rostro en el directo. El corte quedó centrado.",
	cannotRead:
		"No se pudo leer este video para encontrar el rostro. El corte quedó centrado.",
};

export default framing;
