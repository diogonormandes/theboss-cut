import { useState, useRef } from "react";
import { useEditor } from "@/editor/use-editor";
import {
	showOpenFilePickerSafe,
	supportsOpenFilePicker,
	type OpenFilePickerOptions,
} from "@/services/storage/file-handle";
import { rememberFileHandle, resolveDroppedFiles } from "./file-handle-registry";

interface UseFileUploadOptions {
	accept?: string;
	multiple?: boolean;
	onFilesSelected?: (files: File[]) => void;
}

const EXTENSIONS_BY_KIND: Record<string, string[]> = {
	"video/*": [".mp4", ".mkv", ".mov", ".webm", ".m4v", ".avi", ".flv", ".ts"],
	"audio/*": [".mp3", ".wav", ".m4a", ".aac", ".ogg", ".opus", ".flac"],
	"image/*": [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".bmp"],
};

/** Converte o `accept` do <input> no formato do seletor do sistema. */
export function buildPickerTypes(
	accept: string | undefined,
): OpenFilePickerOptions["types"] {
	if (!accept || accept === "*") return undefined;
	const mimeAccept: Record<string, string[]> = {};
	for (const part of accept.split(",").map((p) => p.trim())) {
		if (!part) continue;
		if (part.startsWith(".")) {
			mimeAccept["application/octet-stream"] = [
				...(mimeAccept["application/octet-stream"] ?? []),
				part,
			];
			continue;
		}
		mimeAccept[part] = EXTENSIONS_BY_KIND[part] ?? [];
	}
	return Object.keys(mimeAccept).length > 0 ? [{ accept: mimeAccept }] : undefined;
}

/**
 * Abre o seletor de arquivos do sistema e devolve os arquivos já ligados aos
 * handles (assim lives longas não precisam ser copiadas).
 * `null` = navegador sem suporte (use o <input> comum); `[]` = cancelou.
 */
export async function pickFilesWithHandles({
	accept,
	multiple,
}: {
	accept?: string;
	multiple?: boolean;
}): Promise<File[] | null> {
	if (!supportsOpenFilePicker()) return null;
	const handles = await showOpenFilePickerSafe({
		multiple: multiple ?? false,
		types: buildPickerTypes(accept),
	});
	if (!handles) return [];
	const files: File[] = [];
	for (const handle of handles) {
		const file = await handle.getFile();
		rememberFileHandle({ file, handle });
		files.push(file);
	}
	return files;
}

export function useFileUpload({
	accept,
	multiple,
	onFilesSelected,
}: UseFileUploadOptions = {}) {
	const editor = useEditor();
	const [isDragOver, setIsDragOver] = useState(false);
	const dragCounterRef = useRef(0);
	const inputRef = useRef<HTMLInputElement>(null);

	function containsFiles(dataTransfer: DataTransfer): boolean {
		return (
			!editor.timeline.dragSource.isActive() &&
			dataTransfer.types.includes("Files")
		);
	}

	function openInputPicker() {
		if (!inputRef.current) return;

		inputRef.current.accept = accept || "*";
		inputRef.current.multiple = multiple || false;
		inputRef.current.click();
	}

	function openFilePicker() {
		if (!supportsOpenFilePicker()) {
			openInputPicker();
			return;
		}
		pickFilesWithHandles({ accept, multiple })
			.then((files) => {
				if (files === null) {
					openInputPicker();
					return;
				}
				if (files.length > 0 && onFilesSelected) onFilesSelected(files);
			})
			.catch((error) => {
				// Seletor recusado (ex.: página dentro de outra): usa o <input>.
				console.warn("showOpenFilePicker failed, using <input>:", error);
				openInputPicker();
			});
	}

	function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
		const files = Array.from(event.target.files ?? []);
		if (files.length > 0 && onFilesSelected) {
			onFilesSelected(files);
		}

		if (event.target) {
			event.target.value = "";
		}
	}

	function handleDragEnter(e: React.DragEvent) {
		e.preventDefault();

		if (!containsFiles(e.dataTransfer)) return;

		dragCounterRef.current += 1;
		setIsDragOver(true);
	}

	function handleDragOver(e: React.DragEvent) {
		e.preventDefault();

		if (!containsFiles(e.dataTransfer)) return;
	}

	function handleDragLeave(e: React.DragEvent) {
		e.preventDefault();

		if (!containsFiles(e.dataTransfer)) return;

		dragCounterRef.current -= 1;
		if (dragCounterRef.current === 0) {
			setIsDragOver(false);
		}
	}

	function handleDrop(e: React.DragEvent) {
		e.preventDefault();
		setIsDragOver(false);
		dragCounterRef.current = 0;

		if (!onFilesSelected || !containsFiles(e.dataTransfer)) return;

		const shouldUseMultiple = multiple ?? false;
		const pick = (files: File[]) => {
			if (shouldUseMultiple) onFilesSelected(files);
			else if (files.length > 0) onFilesSelected([files[0]]);
		};

		// Tudo precisa ser lido AGORA: depois do evento a lista fica vazia.
		void resolveDroppedFiles(e.dataTransfer).then(pick);
	}

	return {
		isDragOver,
		openFilePicker,
		fileInputProps: {
			ref: inputRef,
			type: "file",
			style: { display: "none" },
			onChange: handleFileChange,
		},
		dragProps: {
			onDragEnter: handleDragEnter,
			onDragOver: handleDragOver,
			onDragLeave: handleDragLeave,
			onDrop: handleDrop,
		},
	};
}
