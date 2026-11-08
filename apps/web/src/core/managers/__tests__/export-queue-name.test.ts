import { describe, expect, test } from "bun:test";
import { buildCutFileName } from "../export-queue-manager";

describe("buildCutFileName", () => {
	test("usa o nome da cena (que já tem o número), sem repetir o prefixo", () => {
		expect(
			buildCutFileName({ index: 1, motivo: "Corte 05 - Grito forte", format: "mp4" }),
		).toBe("Corte 05 - Grito forte.mp4");
		expect(buildCutFileName({ index: 12, motivo: "Sem silêncios", format: "webm" })).toBe(
			"Sem silêncios.webm",
		);
	});
	test("limpa caracteres que o Windows não aceita", () => {
		expect(buildCutFileName({ index: 3, motivo: 'a/b\\c:"d"?', format: "mp4" })).toBe(
			"a b c d.mp4",
		);
	});
	test("sem nome fica \"Corte NN\" no idioma da tela", () => {
		expect(buildCutFileName({ index: 0, motivo: "  ", format: "mp4" })).toBe("Corte 01.mp4");
	});
});
