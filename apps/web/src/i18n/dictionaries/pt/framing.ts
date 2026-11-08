// Etapa 3 (framing): formato 9:16 dos cortes (Centralizado, Dividido, Seguir rosto).
const framing = {
	title: "Enquadramento",
	centered: "Centralizado",
	centeredHint: "Mostra o meio da imagem.",
	split: "Dividido",
	splitHint: "Câmera em cima, jogo embaixo.",
	follow: "Seguir rosto",
	followHint: "A imagem acompanha o seu rosto.",
	cameraTrack: "Câmera",
	gameTrack: "Jogo",
	working: "Ajustando o enquadramento…",
	doneOne: "Enquadramento aplicado em 1 corte.",
	done: "Enquadramento aplicado em {n} cortes.",
	noFace: "Não achamos o seu rosto na live. O corte ficou centralizado.",
	cannotRead:
		"Não deu para ler este vídeo para achar o rosto. O corte ficou centralizado.",
};

export default framing;
