"use client";

/**
 * Ferramenta INTERNA (só em desenvolvimento, sem links no app): testa o
 * detector de rosto (YuNet) na live de teste do OPFS e compara com o gabarito.
 * Textos em português direto de propósito: o público nunca vê esta página.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
	ApplyFramingCommand,
	applyFraming,
	buildSplitTracks,
} from "@/services/face-tracking/apply-framing";
import { detectFaces } from "@/services/face-tracking/service";
import { sampleTimes } from "@/services/face-tracking/framing-math";

type Linha = string;

/**
 * Exporta a cena (sem som, qualidade baixa) e devolve um mapa grosso do
 * quadro no tempo `t`: 9×16 células, "P" = pele da facecam, "." = escuro,
 * "o" = outra cor. Serve para conferir o Dividido sem olhar a tela.
 */
async function quadroDaCena(
	editor: {
		renderer: {
			exportProject: (
				a: unknown,
			) => Promise<{ success: boolean; buffer?: ArrayBuffer; error?: string }>;
		};
	},
	sceneId: string,
	t: number,
): Promise<unknown> {
	const r = await editor.renderer.exportProject({
		options: { format: "mp4", quality: "low", includeAudio: false },
		sceneId,
	});
	if (!r.success || !r.buffer) return { erro: r.error };
	const mb = await import("mediabunny");
	const input = new mb.Input({
		formats: mb.ALL_FORMATS,
		source: new mb.BufferSource(r.buffer),
	});
	try {
		const track = await input.getPrimaryVideoTrack();
		if (!track) return { erro: "sem vídeo" };
		const sink = new mb.CanvasSink(track, {
			width: 90,
			height: 160,
			fit: "fill",
		});
		const w = await sink.getCanvas(t);
		if (!w) return { erro: "sem quadro" };
		const ctx = (w.canvas as HTMLCanvasElement | OffscreenCanvas).getContext(
			"2d",
		) as CanvasRenderingContext2D;
		const img = ctx.getImageData(0, 0, 90, 160).data;
		const linhas: string[] = [];
		for (let cy = 0; cy < 16; cy++) {
			let linha = "";
			for (let cx = 0; cx < 9; cx++) {
				let pele = 0;
				let escuro = 0;
				for (let y = cy * 10; y < cy * 10 + 10; y++) {
					for (let x = cx * 10; x < cx * 10 + 10; x++) {
						const i = (y * 90 + x) * 4;
						const [R, G, B] = [img[i], img[i + 1], img[i + 2]];
						if (
							Math.abs(R - 233) < 40 &&
							Math.abs(G - 201) < 40 &&
							Math.abs(B - 138) < 50
						)
							pele++;
						else if (R + G + B < 120) escuro++;
					}
				}
				linha += pele > 30 ? "P" : escuro > 60 ? "." : "o";
			}
			linhas.push(linha);
		}
		return {
			largura: track.displayWidth,
			altura: track.displayHeight,
			mapa: linhas,
		};
	} finally {
		input.dispose();
	}
}

async function acharLive(): Promise<{ video: File; gabarito: unknown | null }> {
	const raiz = await navigator.storage.getDirectory();
	for (const base of [
		"live-teste-240min",
		"live-teste-10min",
		"live-teste-1min",
	]) {
		try {
			const video = await (await raiz.getFileHandle(`${base}.mp4`)).getFile();
			const gabarito = JSON.parse(
				await (
					await (await raiz.getFileHandle(`${base}.gabarito.json`)).getFile()
				).text(),
			);
			return { video, gabarito };
		} catch {
			// tenta a próxima
		}
	}
	throw new Error(
		"Nenhuma live de teste no OPFS. Gere em /dev/gerar-live-teste.",
	);
}

export default function TesteRostoPage() {
	const [linhas, setLinhas] = useState<Linha[]>([]);
	const [rodando, setRodando] = useState(false);
	const router = useRouter();

	// Para testar no editor: abre esta página, depois navega pelo app (sem
	// recarregar) e chama `window.__tbFramingDev.applyFraming(...)` no console.
	useEffect(() => {
		(window as unknown as Record<string, unknown>).__tbFramingDev = {
			applyFraming,
			ApplyFramingCommand,
			buildSplitTracks,
			ir: (url: string) => router.push(url),
			quadroDaCena,
		};
	}, [router]);

	if (process.env.NODE_ENV === "production") return null;

	const log = (linha: string) => setLinhas((atual) => [...atual, linha]);

	async function rodar(limiar: number) {
		setRodando(true);
		setLinhas([]);
		try {
			const { video, gabarito } = await acharLive();
			log(`Arquivo: ${video.name} (${(video.size / 1e6).toFixed(1)} MB)`);
			const g = gabarito as {
				duracaoSeg: number;
				facecam: { amostras: [number, number, number][] };
			} | null;
			const duracao = g?.duracaoSeg ?? 600;

			// 1) 10 quadros espalhados (modo Dividido)
			const tempos = sampleTimes({
				start: 0,
				end: duracao,
				perSecond: 10 / duracao,
				maxCount: 10,
			});
			const t0 = performance.now();
			const r = await detectFaces({
				file: video,
				times: tempos,
				scoreThreshold: limiar,
			});
			const ms = performance.now() - t0;
			let achou = 0;
			const erros: number[] = [];
			for (const f of r.frames) {
				const esperado = g?.facecam.amostras[Math.round(f.t)];
				if (f.face) achou++;
				const erro =
					f.face && esperado
						? Math.hypot(f.face.cx - esperado[1], f.face.cy - esperado[2])
						: null;
				if (erro !== null) erros.push(erro);
				log(
					`t=${f.t.toFixed(1)}s  achado=${f.face ? `(${f.face.cx.toFixed(3)}, ${f.face.cy.toFixed(3)}) nota ${f.face.score.toFixed(2)}` : "nada"}  gabarito=${esperado ? `(${esperado[1]}, ${esperado[2]})` : "?"}  erro=${erro === null ? "-" : `${(erro * 100).toFixed(1)}%`}`,
				);
			}
			const media = erros.length
				? erros.reduce((a, b) => a + b, 0) / erros.length
				: NaN;
			log(
				`10 quadros: ${achou}/10 com rosto, erro médio ${(media * 100).toFixed(1)}%, ${ms.toFixed(0)} ms (decodificar ${r.decodeMs} ms, detectar ${r.detectMs} ms), vídeo ${r.sourceWidth}×${r.sourceHeight}`,
			);

			// 2) 1 minuto de corte a 3 quadros/s (modo Seguir rosto)
			const inicio = Math.min(1800, Math.max(0, duracao - 70));
			const tempos60 = sampleTimes({
				start: inicio,
				end: inicio + 60,
				perSecond: 3,
			});
			const t1 = performance.now();
			const r60 = await detectFaces({
				file: video,
				times: tempos60,
				scoreThreshold: limiar,
			});
			const ms60 = performance.now() - t1;
			const achou60 = r60.frames.filter((f) => f.face).length;
			const erros60: number[] = [];
			for (const f of r60.frames) {
				const a = g?.facecam.amostras;
				if (!f.face || !a) continue;
				// gabarito por segundo: interpola entre os dois segundos vizinhos
				const s0 = a[Math.floor(f.t)];
				const s1 = a[Math.min(a.length - 1, Math.floor(f.t) + 1)];
				if (!s0 || !s1) continue;
				const k = f.t - Math.floor(f.t);
				erros60.push(Math.abs(f.face.cx - (s0[1] + (s1[1] - s0[1]) * k)));
			}
			const erroX60 = erros60.length
				? erros60.reduce((x, y) => x + y, 0) / erros60.length
				: NaN;
			log(
				`1 min: erro médio do centro X nos quadros com rosto = ${(erroX60 * 100).toFixed(2)}% da largura (máx ${(Math.max(...erros60) * 100).toFixed(2)}%)`,
			);
			log(
				`1 min de corte (${tempos60.length} quadros): ${achou60} com rosto, ${ms60.toFixed(0)} ms (decodificar ${r60.decodeMs} ms, detectar ${r60.detectMs} ms)`,
			);
			(window as unknown as { __rosto?: unknown }).__rosto = {
				limiar,
				dez: {
					achou,
					erroMedio: media,
					ms,
					decodeMs: r.decodeMs,
					detectMs: r.detectMs,
				},
				minuto: {
					quadros: tempos60.length,
					achou: achou60,
					erroX: erroX60,
					ms: ms60,
					decodeMs: r60.decodeMs,
					detectMs: r60.detectMs,
				},
			};
		} catch (error) {
			log(`ERRO: ${error instanceof Error ? error.message : String(error)}`);
			(window as unknown as { __rosto?: unknown }).__rosto = {
				erro: String(error),
			};
		} finally {
			setRodando(false);
		}
	}

	return (
		<main
			className="flex min-h-screen flex-col gap-4 p-6"
			style={{ background: "var(--tb-bg)", color: "var(--tb-text)" }}
		>
			<h1 className="text-lg font-semibold">Teste do detector de rosto</h1>
			<div className="flex gap-2">
				<button
					type="button"
					disabled={rodando}
					onClick={() => rodar(0.6)}
					className="rounded-sm border px-3 py-1 text-sm"
					style={{ borderColor: "var(--tb-border)" }}
				>
					Rodar (limiar 0,6)
				</button>
				<button
					type="button"
					disabled={rodando}
					onClick={() => rodar(0.1)}
					className="rounded-sm border px-3 py-1 text-sm"
					style={{ borderColor: "var(--tb-border)" }}
				>
					Rodar (limiar 0,1)
				</button>
			</div>
			<pre id="resultado" className="text-xs whitespace-pre-wrap">
				{linhas.join("\n")}
			</pre>
		</main>
	);
}
