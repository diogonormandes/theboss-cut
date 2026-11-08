// Troca de palavras do dicionário de correções (só texto, sem nada do editor: fácil de testar).

export interface WordFix {
	from: string;
	to: string;
}

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Troca palavras inteiras (sem diferenciar maiúscula/minúscula), mantendo a pontuação em volta. */
export function applyWordFixes(text: string, fixes: WordFix[]): string {
	let result = text;
	for (const fix of fixes) {
		const from = fix.from.trim();
		if (!from) continue;
		const pattern = from.split(/\s+/).map(escapeRegExp).join("\\s+");
		const regex = new RegExp(
			`(?<![\\p{L}\\p{N}])${pattern}(?![\\p{L}\\p{N}])`,
			"giu",
		);
		result = result.replace(regex, fix.to.trim());
	}
	return result;
}

