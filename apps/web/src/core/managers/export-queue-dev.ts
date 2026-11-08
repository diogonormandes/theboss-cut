// Só em desenvolvimento: ajuda a testar a exportação de uma cena sem baixar
// arquivo. No console: `await window.__tbExportQueueDev.exportSceneToMemory(id)`
// devolve tamanho, duração e dimensões do vídeo gerado.
import { ALL_FORMATS, BufferSource, Input } from "mediabunny";
import type { EditorCore } from "@/core";
import type { ExportFileSink } from "@/services/renderer/scene-exporter";
import { CreateScenesFromCutsCommand } from "@/commands/scene/create-scenes-from-cuts";

/** Destino em memória (só para teste): junta os pedaços nas posições certas. */
export function createMemorySink() {
	let bytes = new Uint8Array(0);
	let size = 0;
	let writes = 0;
	const sink: ExportFileSink = {
		write: async (position, data) => {
			writes++;
			const end = position + data.byteLength;
			if (end > bytes.byteLength) {
				const grown = new Uint8Array(Math.max(end, bytes.byteLength * 2));
				grown.set(bytes.subarray(0, size));
				bytes = grown;
			}
			bytes.set(data, position);
			size = Math.max(size, end);
		},
	};
	return {
		sink,
		result: () => ({ data: bytes.slice(0, size), writes }),
	};
}

export function installExportQueueDevHook(editor: EditorCore): void {
	if (typeof window === "undefined") return;
	const heap = () =>
		(performance as Performance & { memory?: { usedJSHeapSize: number } })
			.memory?.usedJSHeapSize ?? null;

	(window as unknown as Record<string, unknown>).__tbExportQueueDev = {
		editor,
		heap,
		createCuts(
			cuts: { name: string; mediaId: string; srcStart: number; srcEnd: number; canvasSize?: { width: number; height: number } }[],
		) {
			const command = new CreateScenesFromCutsCommand({ cuts });
			editor.command.execute({ command });
			return command.getSceneIds();
		},
		async exportSceneToMemory(sceneId: string, options?: { quality?: "low" | "medium" | "high" | "very_high"; includeAudio?: boolean }) {
			const memory = createMemorySink();
			const startedAt = performance.now();
			const result = await editor.renderer.exportProject({
				options: {
					format: "mp4",
					quality: options?.quality ?? "low",
					includeAudio: options?.includeAudio ?? true,
				},
				sceneId,
				fileSink: memory.sink,
			});
			const elapsedMs = Math.round(performance.now() - startedAt);
			if (!result.success) return { ok: false, error: result.error, elapsedMs };
			const { data, writes } = memory.result();
			const input = new Input({ formats: ALL_FORMATS, source: new BufferSource(data) });
			try {
				const video = await input.getPrimaryVideoTrack();
				const audio = await input.getPrimaryAudioTrack();
				return {
					ok: true,
					elapsedMs,
					bytes: data.byteLength,
					writes,
					returnedBufferBytes: result.buffer?.byteLength ?? null,
					duration: await input.computeDuration(),
					width: video?.displayWidth ?? null,
					height: video?.displayHeight ?? null,
					hasAudio: !!audio,
				};
			} finally {
				input.dispose();
			}
		},
	};
}
