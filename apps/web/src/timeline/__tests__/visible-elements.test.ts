import { describe, expect, test } from "bun:test";
import {
	filterVisibleElements,
	getPageTimeRange,
	getPinnedSelectedIds,
} from "@/timeline/components/use-visible-elements";
import { TICKS_PER_SECOND } from "@/wasm";
import { getTimelinePixelsPerSecond } from "@/timeline/pixel-utils";

const el = (id: string, startTime: number, duration: number) => ({
	id,
	startTime,
	duration,
});

const elements = [
	el("a", 0, 10),
	el("b", 10, 10),
	el("c", 20, 10),
	el("d", 30, 10),
	el("e", 40, 10),
];

describe("filterVisibleElements", () => {
	test("sem intervalo devolve todos", () => {
		expect(filterVisibleElements({ elements, range: null }).map((e) => e.id)).toEqual([
			"a", "b", "c", "d", "e",
		]);
	});

	test("inclui só os que cruzam o intervalo (borda aberta)", () => {
		const ids = filterVisibleElements({ elements, range: { start: 15, end: 30 } }).map(
			(e) => e.id,
		);
		// b (10-20) cruza, c (20-30) cruza, d começa em 30 = fim -> fora
		expect(ids).toEqual(["b", "c"]);
	});

	test("elemento que cobre todo o intervalo entra", () => {
		const ids = filterVisibleElements({
			elements: [el("big", 0, 1000)],
			range: { start: 400, end: 500 },
		}).map((e) => e.id);
		expect(ids).toEqual(["big"]);
	});

	test("sempre incluídos entram mesmo fora, e a ordem é preservada", () => {
		const ids = filterVisibleElements({
			elements,
			range: { start: 21, end: 29 },
			alwaysIncludeIds: new Set(["e", "a"]),
		}).map((e) => e.id);
		expect(ids).toEqual(["a", "c", "e"]);
	});
});

describe("getPageTimeRange", () => {
	test("sem largura de tela -> null (desenha todos)", () => {
		expect(getPageTimeRange({ page: 0, viewportWidth: 0, zoomLevel: 1 })).toBeNull();
	});

	test("folga de pelo menos 1 tela de cada lado da área visível", () => {
		const viewportWidth = 1000;
		const zoomLevel = 2;
		const pps = getTimelinePixelsPerSecond({ zoomLevel });
		const toPx = (ticks: number) => (ticks / TICKS_PER_SECOND) * pps;
		for (const scrollLeft of [0, 999, 1000, 1500, 5999, 12345]) {
			const page = Math.floor(scrollLeft / viewportWidth);
			const range = getPageTimeRange({ page, viewportWidth, zoomLevel });
			if (!range) throw new Error("range");
			const startPx = toPx(range.start);
			const endPx = toPx(range.end);
			expect(startPx).toBeLessThanOrEqual(Math.max(0, scrollLeft - viewportWidth) + 1e-6);
			expect(endPx).toBeGreaterThanOrEqual(scrollLeft + 2 * viewportWidth - 1e-6);
		}
	});

	test("começa em 0 na primeira página", () => {
		const range = getPageTimeRange({ page: 0, viewportWidth: 800, zoomLevel: 1 });
		expect(range?.start).toBe(0);
	});
});

describe("getPinnedSelectedIds", () => {
	const sel = (n: number, trackId = "t1") =>
		Array.from({ length: n }, (_, i) => ({ trackId, elementId: `e${i}` }));

	test("poucos selecionados da faixa ficam fixos", () => {
		expect(
			getPinnedSelectedIds({
				selectedElements: [...sel(3), { trackId: "t2", elementId: "x" }],
				trackId: "t1",
			}),
		).toEqual(["e0", "e1", "e2"]);
	});

	test("selecionar todos (muitos) não fixa nenhum", () => {
		expect(getPinnedSelectedIds({ selectedElements: sel(745), trackId: "t1" })).toEqual([]);
	});

	test("limite exato ainda fixa", () => {
		expect(
			getPinnedSelectedIds({ selectedElements: sel(5), trackId: "t1", max: 5 }),
		).toHaveLength(5);
		expect(
			getPinnedSelectedIds({ selectedElements: sel(6), trackId: "t1", max: 5 }),
		).toEqual([]);
	});
});
