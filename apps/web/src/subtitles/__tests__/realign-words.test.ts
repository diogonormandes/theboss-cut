import { describe, expect, test } from "bun:test";
import { realignCaptionWords } from "../realign-words";

const words = [
	{ text: "live", start: 0, end: 0.4 },
	{ text: "do", start: 0.4, end: 0.6 },
	{ text: "Bosch.", start: 0.6, end: 1.0 },
];

describe("realignCaptionWords", () => {
	test("trocar uma palavra mantém o tempo de todas", () => {
		const result = realignCaptionWords({ words, content: "live do BOSS." });
		expect(result.map((w) => w.text)).toEqual(["live", "do", "BOSS."]);
		expect(result[2]).toMatchObject({ start: 0.6, end: 1.0 });
	});

	test("palavra nova divide o tempo com a vizinha", () => {
		const result = realignCaptionWords({
			words,
			content: "live do\nTHEBOSS CUT",
		});
		expect(result.map((w) => w.text)).toEqual(["live", "do", "THEBOSS", "CUT"]);
		expect(result[0]).toMatchObject({ start: 0, end: 0.4 });
		expect(result[2].start).toBeCloseTo(0.6);
		expect(result[3].end).toBeCloseTo(1.0);
		expect(result[2].end).toBeLessThanOrEqual(result[3].start + 1e-9);
	});

	test("apagar uma palavra mantém as outras", () => {
		const result = realignCaptionWords({ words, content: "live Bosch." });
		expect(result).toEqual([
			{ text: "live", start: 0, end: 0.4 },
			{ text: "Bosch.", start: 0.6, end: 1.0 },
		]);
	});

	test("palavras novas no fim, sem tempo livre, não ficam acesas junto com a vizinha", () => {
		const result = realignCaptionWords({
			words: [
				{ text: "Fala", start: 0, end: 0.4 },
				{ text: "galera,", start: 0.4, end: 1.0 },
			],
			content: "Fala, galera do BOSS!",
		});
		expect(result.map((w) => w.text)).toEqual(["Fala,", "galera", "do", "BOSS!"]);
		for (let i = 1; i < result.length; i++) {
			expect(result[i].start).toBeGreaterThanOrEqual(result[i - 1].end - 1e-9);
		}
		expect(result[3].end).toBeCloseTo(1.0);
	});
});
