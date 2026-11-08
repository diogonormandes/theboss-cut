/**
 * Medidor de memória para testes internos (Etapa 3).
 *
 * Lê `performance.memory`, que só existe no Chromium (Chrome, Edge e Electron).
 * Mostra apenas a memória do JavaScript desta aba: não inclui quadros de vídeo
 * na placa de vídeo, decodificadores nem o processo principal do Electron.
 */

type ChromiumPerformanceMemory = {
	usedJSHeapSize: number;
	totalJSHeapSize: number;
	jsHeapSizeLimit: number;
};

export type MemorySnapshot = {
	/** bytes em uso pelo JavaScript agora */
	usedJSHeapSize: number;
	/** bytes já reservados pelo JavaScript */
	totalJSHeapSize: number;
	/** limite de bytes do JavaScript nesta aba */
	jsHeapSizeLimit: number;
	/** quando a leitura foi feita (performance.now) */
	at: number;
};

/** Lê a memória do JavaScript. Devolve null quando o navegador não informa. */
export function readMemorySnapshot(): MemorySnapshot | null {
	if (typeof performance === "undefined") return null;
	const memory = (performance as Performance & {
		memory?: ChromiumPerformanceMemory;
	}).memory;
	if (!memory || typeof memory.usedJSHeapSize !== "number") return null;
	return {
		usedJSHeapSize: memory.usedJSHeapSize,
		totalJSHeapSize: memory.totalJSHeapSize,
		jsHeapSizeLimit: memory.jsHeapSizeLimit,
		at: performance.now(),
	};
}

/** Formata bytes em KB, MB ou GB (base 1024). */
export function formatBytes(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes < 0) return "—";
	if (bytes < 1024) return `${bytes} B`;
	const units = ["KB", "MB", "GB", "TB"];
	let value = bytes / 1024;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit += 1;
	}
	return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`;
}

/**
 * Acompanha a memória a cada `intervalMs` e guarda o maior valor visto.
 * Devolve a função que para o acompanhamento.
 */
export function watchMemory({
	intervalMs = 1000,
	onSample,
}: {
	intervalMs?: number;
	onSample: (sample: { current: MemorySnapshot | null; peakUsed: number }) => void;
}): () => void {
	let peakUsed = 0;
	const tick = () => {
		const current = readMemorySnapshot();
		if (current && current.usedJSHeapSize > peakUsed) {
			peakUsed = current.usedJSHeapSize;
		}
		onSample({ current, peakUsed });
	};
	tick();
	const id = setInterval(tick, intervalMs);
	return () => clearInterval(id);
}
