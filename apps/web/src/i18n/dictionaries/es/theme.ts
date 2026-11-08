import type { Dictionary } from "../../types";

const theme: Dictionary["theme"] = {
	title: "Tema",
	choose: "Elegir tema",
	dialogTitle: "Apariencia",
	dialogDescription: "Elige los colores de THEBOSS CUT. Cambia al instante y queda guardado en esta PC.",
	current: "Tema actual",
	themes: {
		"dourado": { name: "Dorado BOSS", description: "El clásico: negro y dorado" },
		"obsidiana": { name: "Obsidiana", description: "Negro total con plata" },
		"neon": { name: "Neón Morado", description: "Morado eléctrico con brillo" },
		"rubi": { name: "Rubí", description: "Frambuesa intensa sobre vino" },
		"esmeralda": { name: "Esmeralda", description: "Verde joya puro" },
		"safira": { name: "Zafiro", description: "Azul real profundo" },
		"platina": { name: "Platino", description: "Grafito claro con plata helada" },
		"por-do-sol": { name: "Atardecer", description: "Coral y lila de atardecer" },
		"aurora": { name: "Aurora", description: "Turquesa con brillo rosa" },
		"carbono": { name: "Carbono Rojo", description: "Fibra de carbono deportiva" },
		"tatico": { name: "Operación Táctica", description: "Arena y verde oliva, ambiente de misión" },
		"royale": { name: "Battle Royale", description: "Amarillo vivo y naranja, ambiente de arena" },
		"aura": { name: "Aura de Guerrero", description: "Naranja energía sobre azul noche" },
		"sombras": { name: "Despertar de las Sombras", description: "Violeta y cian, ambiente de sistema" },
	},
};

export default theme;
