// A entrada "onnxruntime-web/wasm" (só o motor wasm, sem WebGPU/WebGL) não
// traz tipos próprios; a API é a mesma do pacote principal.
declare module "onnxruntime-web/wasm" {
	export * from "onnxruntime-common";
}
