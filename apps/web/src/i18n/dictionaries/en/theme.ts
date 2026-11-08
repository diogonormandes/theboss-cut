import type { Dictionary } from "../../types";

const theme: Dictionary["theme"] = {
	title: "Theme",
	choose: "Choose theme",
	dialogTitle: "Appearance",
	dialogDescription: "Pick the colors for THEBOSS CUT. It changes right away and is saved on this PC.",
	current: "Current theme",
	themes: {
		"dourado": { name: "BOSS Gold", description: "The classic: black and gold" },
		"obsidiana": { name: "Obsidian", description: "All black with silver" },
		"neon": { name: "Purple Neon", description: "Electric purple with a glow" },
		"rubi": { name: "Ruby", description: "Deep raspberry over wine" },
		"esmeralda": { name: "Emerald", description: "Pure jewel green" },
		"safira": { name: "Sapphire", description: "Deep royal blue" },
		"platina": { name: "Platinum", description: "Light graphite with icy silver" },
		"por-do-sol": { name: "Sunset", description: "Late-afternoon coral and lilac" },
		"aurora": { name: "Aurora", description: "Turquoise with a pink glow" },
		"carbono": { name: "Red Carbon", description: "Sporty carbon fiber" },
		"tatico": { name: "Tactical Ops", description: "Sand and olive green, mission mood" },
		"royale": { name: "Battle Royale", description: "Bright yellow and orange, arena mood" },
		"aura": { name: "Warrior Aura", description: "Energy orange over night blue" },
		"sombras": { name: "Shadow Awakening", description: "Violet and cyan, system mood" },
	},
};

export default theme;
