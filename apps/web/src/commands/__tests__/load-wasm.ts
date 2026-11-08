import { mock } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

/**
 * O bun não carrega o `.wasm` do opencut-wasm por `import` (ESM de wasm).
 * Aqui o wasm é carregado à mão e o módulo é trocado pela versão pronta.
 * Chame antes de importar qualquer coisa que use `@/wasm`.
 */
export async function loadOpencutWasmForTests(): Promise<void> {
	const require = createRequire(import.meta.url);
	const dir = dirname(require.resolve("opencut-wasm/package.json"));
	const bg = await import(join(dir, "opencut_wasm_bg.js"));
	const bytes = readFileSync(join(dir, "opencut_wasm_bg.wasm"));
	const { instance } = await WebAssembly.instantiate(bytes, {
		"./opencut_wasm_bg.js": bg,
	});
	bg.__wbg_set_wasm(instance.exports);
	const start = (instance.exports as { __wbindgen_start?: () => void })
		.__wbindgen_start;
	start?.();
	mock.module("opencut-wasm", () => bg);
}
