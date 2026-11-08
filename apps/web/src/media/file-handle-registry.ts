/**
 * Liga cada File escolhido (pelo seletor ou arrastado) ao seu
 * FileSystemFileHandle, para `processMediaAssets` decidir se guarda só a
 * referência (lives longas) em vez de copiar o arquivo para o app.
 * WeakMap: some sozinho quando o File deixa de ser usado.
 */

import { collectDroppedFileHandles } from "@/services/storage/file-handle";

const handles = new WeakMap<File, FileSystemFileHandle>();

export function rememberFileHandle({
	file,
	handle,
}: {
	file: File;
	handle: FileSystemFileHandle;
}): void {
	handles.set(file, handle);
}

export function getRememberedFileHandle({
	file,
}: {
	file: File;
}): FileSystemFileHandle | null {
	return handles.get(file) ?? null;
}

/**
 * Lê os arquivos de um arrastar-e-soltar já ligados aos handles (assim
 * lives longas não são copiadas para o app). Chame DENTRO do evento `drop`,
 * antes de qualquer `await`: a parte que lê o evento roda na hora; só a
 * abertura dos arquivos fica para a promessa devolvida.
 */
export function resolveDroppedFiles(
	dataTransfer: DataTransfer,
): Promise<File[]> {
	const droppedFiles = Array.from(dataTransfer.files ?? []);
	const handlePromises = collectDroppedFileHandles(dataTransfer);
	if (!handlePromises || handlePromises.length !== droppedFiles.length) {
		return Promise.resolve(droppedFiles);
	}

	return Promise.all(handlePromises)
		.then(async (fileHandles) => {
			const files: File[] = [];
			for (let i = 0; i < droppedFiles.length; i++) {
				const handle = fileHandles[i];
				if (!handle) {
					files.push(droppedFiles[i]);
					continue;
				}
				try {
					const file = await handle.getFile();
					rememberFileHandle({ file, handle });
					files.push(file);
				} catch {
					files.push(droppedFiles[i]);
				}
			}
			return files;
		})
		.catch(() => droppedFiles);
}
