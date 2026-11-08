/**
 * Acesso a arquivos do PC por referência (API de acesso a arquivos do
 * navegador). Usado para lives longas, que não são copiadas para o app.
 *
 * Nada aqui lê o arquivo para a memória: `handle.getFile()` devolve um File
 * ligado ao disco, lido aos pedaços por quem usar.
 */

import { checkLinkedFileSize, type OfflineReason } from "./media-reference";

type PermissionMode = { mode: "read" | "readwrite" };

/** Partes da API que o TypeScript ainda não descreve. */
interface FileHandleWithPermission extends FileSystemFileHandle {
	queryPermission?: (descriptor?: PermissionMode) => Promise<PermissionState>;
	requestPermission?: (descriptor?: PermissionMode) => Promise<PermissionState>;
}

export interface OpenFilePickerOptions {
	multiple?: boolean;
	excludeAcceptAllOption?: boolean;
	types?: Array<{ description?: string; accept: Record<string, string[]> }>;
}

type WindowWithPicker = Window & {
	showOpenFilePicker?: (
		options?: OpenFilePickerOptions,
	) => Promise<FileSystemFileHandle[]>;
};

type ItemWithHandle = DataTransferItem & {
	getAsFileSystemHandle?: () => Promise<FileSystemHandle | null>;
};

type DesktopBridge = { caminhoDoArquivo?: (file: File) => string };

/** Caminho do arquivo no PC (só no app do Windows; vazio no navegador). */
export function getDesktopFilePath(file: File): string {
	if (typeof window === "undefined") return "";
	const bridge = (window as Window & { theBossCut?: DesktopBridge }).theBossCut;
	try {
		return bridge?.caminhoDoArquivo?.(file) ?? "";
	} catch {
		return "";
	}
}

export function supportsOpenFilePicker(): boolean {
	return (
		typeof window !== "undefined" &&
		typeof (window as WindowWithPicker).showOpenFilePicker === "function"
	);
}

/** Abre o seletor do sistema. Devolve `null` se a pessoa cancelar. */
export async function showOpenFilePickerSafe(
	options: OpenFilePickerOptions,
): Promise<FileSystemFileHandle[] | null> {
	const picker = (window as WindowWithPicker).showOpenFilePicker;
	if (!picker) return null;
	try {
		return await picker.call(window, options);
	} catch (error) {
		if ((error as Error)?.name === "AbortError") return null;
		throw error;
	}
}

/**
 * Pega os handles de um arrastar-e-soltar. PRECISA ser chamado dentro do
 * evento `drop` (antes de qualquer `await`): depois o navegador esvazia a
 * lista. Devolve uma promessa por item de arquivo (`null` quando não deu).
 */
export function collectDroppedFileHandles(
	dataTransfer: DataTransfer,
): Promise<FileSystemFileHandle | null>[] | null {
	const items = Array.from(dataTransfer.items ?? []).filter(
		(item) => item.kind === "file",
	) as ItemWithHandle[];
	if (items.length === 0) return null;
	if (!items.every((item) => typeof item.getAsFileSystemHandle === "function")) {
		return null;
	}
	return items.map((item) =>
		(item.getAsFileSystemHandle?.() ?? Promise.resolve(null))
			.then((handle) =>
				handle && handle.kind === "file" ? (handle as FileSystemFileHandle) : null,
			)
			.catch(() => null),
	);
}

/**
 * Confere (e, se `request`, pede) a permissão de leitura do handle.
 * `request` só funciona logo depois de um clique da pessoa.
 */
export async function ensureReadPermission(
	handle: FileSystemFileHandle,
	{ request }: { request: boolean },
): Promise<boolean> {
	const h = handle as FileHandleWithPermission;
	const descriptor: PermissionMode = { mode: "read" };
	try {
		if (typeof h.queryPermission === "function") {
			const state = await h.queryPermission(descriptor);
			if (state === "granted") return true;
			if (!request || typeof h.requestPermission !== "function") return false;
			return (await h.requestPermission(descriptor)) === "granted";
		}
		// Sem queryPermission (navegador antigo): tenta ler direto.
		return true;
	} catch {
		return false;
	}
}

export type LinkedFileResult =
	| { status: "online"; file: File }
	| { status: "offline"; reason: OfflineReason };

/** Abre o arquivo apontado pelo handle e confere se ainda é o mesmo. */
export async function readLinkedFile({
	handle,
	expectedSize,
	request = false,
}: {
	handle: FileSystemFileHandle | null | undefined;
	expectedSize: number;
	request?: boolean;
}): Promise<LinkedFileResult> {
	if (!handle || typeof handle.getFile !== "function") {
		return { status: "offline", reason: "missing" };
	}
	const allowed = await ensureReadPermission(handle, { request });
	if (!allowed) return { status: "offline", reason: "permission" };

	let file: File;
	try {
		file = await handle.getFile();
	} catch (error) {
		const name = (error as Error)?.name;
		if (name === "NotAllowedError" || name === "SecurityError") {
			return { status: "offline", reason: "permission" };
		}
		return { status: "offline", reason: "missing" };
	}

	if (checkLinkedFileSize({ expectedSize, actualSize: file.size }) !== "ok") {
		return { status: "offline", reason: "changed" };
	}
	return { status: "online", file };
}
