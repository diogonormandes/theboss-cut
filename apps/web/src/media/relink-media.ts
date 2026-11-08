/**
 * "Localizar arquivo" de uma mídia offline: escolher o arquivo de novo e
 * conferir se é o mesmo (tamanho e duração parecidos).
 * Só lê o cabeçalho do arquivo (mediabunny lê aos pedaços), nunca o todo.
 */

import { ALL_FORMATS, BlobSource, Input } from "mediabunny";
import type { MediaType } from "@/media/types";
import type { OfflineMediaAsset } from "@/services/storage/types";
import { isPlausibleRelink } from "@/services/storage/media-reference";
import { pickFilesWithHandles } from "./use-file-upload";
import { getRememberedFileHandle } from "./file-handle-registry";

const ACCEPT_BY_TYPE: Record<MediaType, string> = {
	video: "video/*",
	audio: "audio/*",
	image: "image/*",
};

export async function probeMediaDuration({
	file,
	type,
}: {
	file: File;
	type: MediaType;
}): Promise<number | null> {
	if (type === "image") return null;
	const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
	try {
		const duration = await input.computeDuration();
		return Number.isFinite(duration) ? duration : null;
	} catch {
		return null;
	} finally {
		input.dispose();
	}
}

/** Abre um <input type=file> escondido (navegador sem seletor do sistema). */
function pickWithInput({ accept }: { accept: string }): Promise<File | null> {
	return new Promise((resolve) => {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = accept;
		input.style.display = "none";
		input.addEventListener("change", () => {
			resolve(input.files?.[0] ?? null);
			input.remove();
		});
		input.addEventListener("cancel", () => {
			resolve(null);
			input.remove();
		});
		document.body.appendChild(input);
		input.click();
	});
}

export type PickReplacementResult =
	| { status: "cancelled" }
	| { status: "mismatch" }
	| {
			status: "ok";
			file: File;
			handle: FileSystemFileHandle | null;
			duration: number | null;
	  };

/** Pede à pessoa o arquivo e confere se ele bate com a mídia offline. */
export async function pickReplacementFile({
	asset,
}: {
	asset: OfflineMediaAsset;
}): Promise<PickReplacementResult> {
	const accept = ACCEPT_BY_TYPE[asset.type];
	let file: File | null;
	const picked = await pickFilesWithHandles({ accept, multiple: false });
	if (picked === null) file = await pickWithInput({ accept });
	else file = picked[0] ?? null;
	if (!file) return { status: "cancelled" };

	const duration = await probeMediaDuration({ file, type: asset.type });
	const ok = isPlausibleRelink({
		expected: { size: asset.size, duration: asset.duration },
		actual: { size: file.size, duration },
	});
	if (!ok) return { status: "mismatch" };
	return {
		status: "ok",
		file,
		handle: getRememberedFileHandle({ file }),
		duration,
	};
}
