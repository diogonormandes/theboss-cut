/**
 * Cache do mapa da live no OPFS: `analysis/<chave>.bin`.
 * A chave muda se o arquivo mudar (tamanho/data) ou se a faixa for outra.
 * Ao gravar, as chaves velhas da mesma mídia e faixa são apagadas; e
 * `pruneCachedAnalyses` apaga o que é de mídias que não existem mais.
 */

import { decodeAnalysis, encodeAnalysis, type LiveAnalysis } from "./format";

const DIR = "analysis";

async function getDir(create: boolean): Promise<FileSystemDirectoryHandle | null> {
	if (typeof navigator === "undefined" || !navigator.storage?.getDirectory) return null;
	try {
		const root = await navigator.storage.getDirectory();
		return await root.getDirectoryHandle(DIR, { create });
	} catch {
		return null;
	}
}

export async function readCachedAnalysis(key: string): Promise<LiveAnalysis | null> {
	const dir = await getDir(false);
	if (!dir) return null;
	try {
		const file = await (await dir.getFileHandle(`${key}.bin`)).getFile();
		return decodeAnalysis(await file.arrayBuffer());
	} catch {
		return null;
	}
}

export async function writeCachedAnalysis(
	key: string,
	data: LiveAnalysis | ArrayBuffer,
): Promise<boolean> {
	const dir = await getDir(true);
	if (!dir) return false;
	try {
		const handle = await dir.getFileHandle(`${key}.bin`, { create: true });
		const writable = await handle.createWritable();
		await writable.write(data instanceof ArrayBuffer ? data : encodeAnalysis(data));
		await writable.close();
		await deleteStaleKeys(dir, key);
		return true;
	} catch (error) {
		console.warn("Mapa da live: não deu para guardar o resultado.", error);
		return false;
	}
}

/** Partes da chave `<id>-<tamanho>-<data>-t<faixa>` (o id já vem limpo). */
const KEY_RE = /^(.+)-(\d+)-(\d+)-t(\d+)\.bin$/;

function parseFileName(name: string): { id: string; track: string } | null {
	const m = KEY_RE.exec(name);
	return m ? { id: m[1], track: m[4] } : null;
}

/** Apaga as versões antigas (outro tamanho/data) da mesma mídia e faixa. */
async function deleteStaleKeys(dir: FileSystemDirectoryHandle, key: string): Promise<void> {
	const current = parseFileName(`${key}.bin`);
	if (!current) return;
	try {
		const stale: string[] = [];
		for await (const name of dir.keys()) {
			if (name === `${key}.bin`) continue;
			const other = parseFileName(name);
			if (other && other.id === current.id && other.track === current.track) stale.push(name);
		}
		for (const name of stale) await dir.removeEntry(name).catch(() => {});
	} catch {}
}

/**
 * Apaga os resultados de mídias que não existem mais em nenhum projeto.
 * `assetIds`: todos os ids de mídia que ainda existem. Devolve quantos apagou.
 */
export async function pruneCachedAnalyses(
	assetIds: Iterable<string>,
	cleanId: (id: string) => string,
): Promise<number> {
	const dir = await getDir(false);
	if (!dir) return 0;
	const keep = new Set<string>();
	for (const id of assetIds) keep.add(cleanId(id));
	const orphans: string[] = [];
	try {
		for await (const name of dir.keys()) {
			const parsed = parseFileName(name);
			if (parsed && !keep.has(parsed.id)) orphans.push(name);
		}
	} catch {
		return 0;
	}
	let removed = 0;
	for (const name of orphans) {
		try {
			await dir.removeEntry(name);
			removed++;
		} catch {}
	}
	return removed;
}
