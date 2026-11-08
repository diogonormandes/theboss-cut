import { describe, expect, test } from "bun:test";
import { loadOpencutWasmForTests } from "./load-wasm";

await loadOpencutWasmForTests();
const { nextCutNumber } = await import("@/commands/scene/create-scenes-from-cuts");

describe("nextCutNumber", () => {
	test("sem cortes começa no 1", () => {
		expect(nextCutNumber([{ kind: undefined, name: "Cena principal" }])).toBe(1);
	});
	test("continua depois do maior número (mesmo com buracos)", () => {
		expect(
			nextCutNumber([
				{ kind: "corte", name: "Corte 01 - Grito forte" },
				{ kind: "corte", name: "Corte 04 - Empolgação" },
				{ kind: undefined, name: "Cena 9" },
			]),
		).toBe(5);
	});
	test("funciona nos outros idiomas e com nome mudado", () => {
		expect(nextCutNumber([{ kind: "corte", name: "Clip 07 - Shout" }])).toBe(8);
		expect(nextCutNumber([{ kind: "corte", name: "Meu corte favorito" }])).toBe(1);
		expect(
			nextCutNumber([
				{ kind: "corte", name: "Corte 02 - Grito forte" },
				{ kind: "corte", name: "Live 2024 melhor parte" },
				{ kind: "corte", name: "Top 10 da live" },
			]),
		).toBe(3);
	});
});
