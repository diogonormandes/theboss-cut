"use client";

/**
 * Camada do mapa com os trechos que o "Cortar silêncios" vai tirar
 * (vermelho translúcido com riscas finas). A seção de silêncio escreve aqui;
 * o mapa só desenha. Canvas próprio: mexer no controle não redesenha o mapa.
 */

import { useEffect, useRef } from "react";
import { create } from "zustand";
import type { TimeRange } from "@/services/live-analysis/silence";

type PreviewState = {
	assetId: string | null;
	ranges: TimeRange[] | null;
	setPreview: (assetId: string | null, ranges: TimeRange[] | null) => void;
};

export const useSilencePreviewStore = create<PreviewState>((set) => ({
	assetId: null,
	ranges: null,
	setPreview: (assetId, ranges) => set({ assetId, ranges }),
}));

export function SilencePreviewLayer({
	assetId,
	durationSec,
	width,
	height,
	dpr,
}: {
	assetId: string;
	durationSec: number;
	width: number;
	height: number;
	dpr: number;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const ranges = useSilencePreviewStore((s) => (s.assetId === assetId ? s.ranges : null));

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const w = Math.max(1, Math.round(width * dpr));
		const h = Math.max(1, Math.round(height * dpr));
		if (canvas.width !== w) canvas.width = w;
		if (canvas.height !== h) canvas.height = h;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		ctx.clearRect(0, 0, w, h);
		if (!ranges || ranges.length === 0 || durationSec <= 0) return;
		const css = getComputedStyle(document.documentElement);
		const danger = css.getPropertyValue("--tb-danger-rgb").trim() || "229, 72, 77";
		const k = w / durationSec;
		// junta trechos que caem no mesmo pixel (milhares de trechos em 4 h)
		const path = new Path2D();
		let runA = -1;
		let runB = -1;
		const flush = () => {
			if (runA >= 0) path.rect(runA, 0, Math.max(1, runB - runA), h);
		};
		for (const [s, e] of ranges) {
			const a = s * k;
			const b = e * k;
			if (runA >= 0 && a <= runB + 0.5) {
				runB = Math.max(runB, b);
			} else {
				flush();
				runA = a;
				runB = b;
			}
		}
		flush();
		ctx.fillStyle = `rgba(${danger}, 0.30)`;
		ctx.fill(path);
		// riscas diagonais por cima, só dentro dos trechos
		ctx.save();
		ctx.clip(path);
		ctx.strokeStyle = `rgba(${danger}, 0.55)`;
		ctx.lineWidth = Math.max(1, dpr);
		ctx.beginPath();
		const step = 6 * dpr;
		for (let x = -h; x < w; x += step) {
			ctx.moveTo(x, h);
			ctx.lineTo(x + h, 0);
		}
		ctx.stroke();
		ctx.restore();
	}, [ranges, durationSec, width, height, dpr]);

	return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 size-full" aria-hidden />;
}
