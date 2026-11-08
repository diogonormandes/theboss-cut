import { describe, expect, test } from "bun:test";
import { buildCutFileName } from "../export-queue-manager";

describe("buildCutFileName", () => {
	test("Corte NN - motivo.mp4", () => {
		expect(buildCutFileName({ index: 1, motivo: "Jogada incrível", format: "mp4" })).toBe(
			"Corte 01 - Jogada incrível.mp4",
		);
		expect(buildCutFileName({ index: 12, motivo: "x", format: "webm" })).toBe("Corte 12 - x.webm");
	});
	test("limpa caracteres que o Windows não aceita", () => {
		expect(buildCutFileName({ index: 3, motivo: 'a/b\\c:"d"?', format: "mp4" })).toBe(
			"Corte 03 - a b c d.mp4",
		);
	});
	test("sem motivo fica só o número", () => {
		expect(buildCutFileName({ index: 0, motivo: "  ", format: "mp4" })).toBe("Corte 01.mp4");
	});
});
