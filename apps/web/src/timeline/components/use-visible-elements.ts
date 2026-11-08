"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { getTimelinePixelsPerSecond } from "@/timeline/pixel-utils";
import { TICKS_PER_SECOND } from "@/wasm";

/**
 * Virtualização horizontal da faixa: depois de "Cortar silêncios" uma live
 * longa vira centenas de pedaços numa faixa só. Desenhar todos (cada um
 * assinando o editor) pesa; aqui calculamos quais cruzam a área visível.
 */

interface ElementTimeSpan {
	id: string;
	startTime: number;
	duration: number;
}

/**
 * Função pura: devolve, na ordem original, os elementos que cruzam
 * [rangeStart, rangeEnd) (em ticks) ou cujo id está em alwaysIncludeIds.
 * Se o intervalo for nulo (ainda sem medida da tela), devolve todos.
 */
export function filterVisibleElements<T extends ElementTimeSpan>({
	elements,
	range,
	alwaysIncludeIds,
}: {
	elements: readonly T[];
	range: { start: number; end: number } | null;
	alwaysIncludeIds?: ReadonlySet<string>;
}): T[] {
	if (!range) return [...elements];
	const { start, end } = range;
	return elements.filter(
		(element) =>
			(element.startTime < end &&
				element.startTime + element.duration > start) ||
			(alwaysIncludeIds?.has(element.id) ?? false),
	);
}

/**
 * Converte a "página" de rolagem em intervalo de tempo (ticks).
 * Página = floor(scrollLeft / larguraDaTela). Cobrimos da página anterior
 * até 3 telas depois do início da página atual, o que garante pelo menos
 * ~1 tela de folga para cada lado da área visível.
 */
export function getPageTimeRange({
	page,
	viewportWidth,
	zoomLevel,
}: {
	page: number;
	viewportWidth: number;
	zoomLevel: number;
}): { start: number; end: number } | null {
	if (!(viewportWidth > 0)) return null;
	const pixelsPerSecond = getTimelinePixelsPerSecond({ zoomLevel });
	if (!(pixelsPerSecond > 0)) return null;
	const startPx = Math.max(0, (page - 1) * viewportWidth);
	const endPx = (page + 3) * viewportWidth;
	return {
		start: (startPx / pixelsPerSecond) * TICKS_PER_SECOND,
		end: (endPx / pixelsPerSecond) * TICKS_PER_SECOND,
	};
}

function findHorizontalScrollParent(node: HTMLElement | null): HTMLElement | null {
	let current = node?.parentElement ?? null;
	while (current) {
		const overflowX = getComputedStyle(current).overflowX;
		if (overflowX === "auto" || overflowX === "scroll") return current;
		current = current.parentElement;
	}
	return null;
}

/**
 * Até quantos selecionados (por faixa) ficam sempre desenhados mesmo fora da
 * tela. Com "selecionar todos" numa faixa de centenas de pedaços, desenhar
 * todos anularia a virtualização; selecionado fora da tela não precisa estar
 * no DOM (apagar, mover e snap usam os dados).
 */
export const MAX_PINNED_SELECTED = 50;

export function getPinnedSelectedIds({
	selectedElements,
	trackId,
	max = MAX_PINNED_SELECTED,
}: {
	selectedElements: readonly { trackId: string; elementId: string }[];
	trackId: string;
	max?: number;
}): string[] {
	const ids: string[] = [];
	for (const selected of selectedElements) {
		if (selected.trackId !== trackId) continue;
		ids.push(selected.elementId);
		if (ids.length > max) return [];
	}
	return ids;
}

export interface ScrollPageState {
	/** false até a primeira medida (feita antes da pintura). */
	ready: boolean;
	page: number;
	viewportWidth: number;
}

/**
 * Observa o contêiner com rolagem horizontal mais próximo de `anchorRef` e
 * devolve só a "página" atual + largura da tela. Só re-renderiza quando a
 * página ou a largura mudam (não a cada pixel de rolagem).
 *
 * - A primeira medida é feita em useLayoutEffect (antes da pintura); até lá
 *   `ready` é false e quem usa não deve desenhar a faixa inteira.
 * - Quando o zoom muda, o zoom-controller ajusta scrollLeft num layout effect
 *   do pai e o evento de scroll só chega depois da pintura. Para não pintar
 *   com página velha + escala nova, re-medimos num microtask (já depois de
 *   todos os layout effects, ainda antes da pintura) com flushSync.
 */
export function useScrollPage({
	anchorRef,
	zoomLevel,
}: {
	anchorRef: React.RefObject<HTMLElement | null>;
	zoomLevel?: number;
}): ScrollPageState {
	const [state, setState] = useState<ScrollPageState>({
		ready: false,
		page: 0,
		viewportWidth: 0,
	});
	const updateRef = useRef<(() => void) | null>(null);

	useLayoutEffect(() => {
		const scrollEl = findHorizontalScrollParent(anchorRef.current);
		if (!scrollEl) {
			// Sem contêiner de rolagem: sem virtualização (desenha todos).
			setState((prev) =>
				prev.ready && prev.viewportWidth === 0
					? prev
					: { ready: true, page: 0, viewportWidth: 0 },
			);
			updateRef.current = null;
			return;
		}

		const update = () => {
			const viewportWidth = scrollEl.clientWidth;
			const page =
				viewportWidth > 0 ? Math.floor(scrollEl.scrollLeft / viewportWidth) : 0;
			setState((prev) =>
				prev.ready && prev.page === page && prev.viewportWidth === viewportWidth
					? prev
					: { ready: true, page, viewportWidth },
			);
		};
		updateRef.current = update;

		update();
		scrollEl.addEventListener("scroll", update, { passive: true });
		const resizeObserver = new ResizeObserver(update);
		resizeObserver.observe(scrollEl);
		return () => {
			updateRef.current = null;
			scrollEl.removeEventListener("scroll", update);
			resizeObserver.disconnect();
		};
	}, [anchorRef]);

	const isFirstZoomRef = useRef(true);
	useLayoutEffect(() => {
		if (isFirstZoomRef.current) {
			isFirstZoomRef.current = false;
			return;
		}
		let cancelled = false;
		queueMicrotask(() => {
			if (cancelled) return;
			const update = updateRef.current;
			if (!update) return;
			try {
				flushSync(update);
			} catch {
				update();
			}
		});
		return () => {
			cancelled = true;
		};
	}, [zoomLevel]);

	return state;
}
