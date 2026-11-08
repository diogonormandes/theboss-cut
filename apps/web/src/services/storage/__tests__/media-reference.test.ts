import { describe, expect, test } from "bun:test";
import {
	REFERENCE_MIN_BYTES,
	REFERENCE_MIN_VIDEO_SECONDS,
	checkLinkedFileSize,
	decideMediaStorage,
	findOfflineMediaInUse,
	isPlausibleRelink,
	normalizeMediaStorage,
} from "../media-reference";
import { readLinkedFile } from "../file-handle";

const MB = 1024 * 1024;
const GB = 1024 * MB;

describe("decideMediaStorage: copiar ou só referenciar", () => {
	test("sem handle sempre copia (navegador sem suporte)", () => {
		expect(
			decideMediaStorage({ size: 10 * GB, type: "video", durationSeconds: 5 * 3600, hasHandle: false }),
		).toBe("opfs");
	});

	test("1 GB ou mais com handle não copia", () => {
		expect(decideMediaStorage({ size: REFERENCE_MIN_BYTES, type: "video", hasHandle: true })).toBe("handle");
		expect(decideMediaStorage({ size: 10 * GB, type: "audio", hasHandle: true })).toBe("handle");
		expect(decideMediaStorage({ size: 2 * GB, type: "image", hasHandle: true })).toBe("handle");
	});

	test("logo abaixo de 1 GB e vídeo curto copia", () => {
		expect(
			decideMediaStorage({ size: REFERENCE_MIN_BYTES - 1, type: "video", durationSeconds: 600, hasHandle: true }),
		).toBe("opfs");
	});

	test("vídeo de mais de 30 min não copia, mesmo pequeno (live de teste de 293 MB e 4 h)", () => {
		expect(
			decideMediaStorage({ size: 293 * MB, type: "video", durationSeconds: 4 * 3600, hasHandle: true }),
		).toBe("handle");
		expect(
			decideMediaStorage({
				size: 50 * MB,
				type: "video",
				durationSeconds: REFERENCE_MIN_VIDEO_SECONDS + 1,
				hasHandle: true,
			}),
		).toBe("handle");
	});

	test("vídeo de exatamente 30 min, duração desconhecida ou áudio longo e pequeno copia", () => {
		expect(
			decideMediaStorage({ size: 50 * MB, type: "video", durationSeconds: REFERENCE_MIN_VIDEO_SECONDS, hasHandle: true }),
		).toBe("opfs");
		expect(decideMediaStorage({ size: 50 * MB, type: "video", hasHandle: true })).toBe("opfs");
		expect(
			decideMediaStorage({ size: 50 * MB, type: "video", durationSeconds: Number.NaN, hasHandle: true }),
		).toBe("opfs");
		expect(
			decideMediaStorage({ size: 100 * MB, type: "audio", durationSeconds: 3 * 3600, hasHandle: true }),
		).toBe("opfs");
	});
});

describe("normalizeMediaStorage: dados antigos", () => {
	test("metadado antigo, sem o campo storage, conta como cópia no OPFS", () => {
		const antigo: Record<string, unknown> = {
			id: "a",
			name: "clipe.mp4",
			type: "video",
			size: 1000,
			lastModified: 1,
		};
		expect(normalizeMediaStorage(antigo.storage)).toBe("opfs");
	});

	test("valores estranhos viram opfs; só 'handle' vira handle", () => {
		expect(normalizeMediaStorage(null)).toBe("opfs");
		expect(normalizeMediaStorage("HANDLE")).toBe("opfs");
		expect(normalizeMediaStorage(42)).toBe("opfs");
		expect(normalizeMediaStorage("opfs")).toBe("opfs");
		expect(normalizeMediaStorage("handle")).toBe("handle");
	});
});

describe("conferência do arquivo", () => {
	test("ao reabrir, só tamanho idêntico é o mesmo arquivo", () => {
		expect(checkLinkedFileSize({ expectedSize: 100, actualSize: 100 })).toBe("ok");
		expect(checkLinkedFileSize({ expectedSize: 100, actualSize: 101 })).toBe("changed");
	});

	test("Localizar arquivo aceita tamanho e duração parecidos", () => {
		const live = { size: 10 * GB, duration: 4 * 3600 };
		expect(isPlausibleRelink({ expected: live, actual: live })).toBe(true);
		expect(
			isPlausibleRelink({ expected: live, actual: { size: live.size * 1.005, duration: live.duration + 30 } }),
		).toBe(true);
		// tamanho bem diferente
		expect(isPlausibleRelink({ expected: live, actual: { size: live.size * 0.9, duration: live.duration } })).toBe(false);
		// mesma ordem de tamanho, duração bem diferente (outra live)
		expect(isPlausibleRelink({ expected: live, actual: { size: live.size, duration: 2 * 3600 } })).toBe(false);
		// vídeo curto: folga mínima de 1 s
		expect(isPlausibleRelink({ expected: { size: 1000, duration: 10 }, actual: { size: 1000, duration: 10.9 } })).toBe(true);
		expect(isPlausibleRelink({ expected: { size: 1000, duration: 10 }, actual: { size: 1000, duration: 11.5 } })).toBe(false);
		// sem duração de um dos lados, decide pelo tamanho
		expect(isPlausibleRelink({ expected: { size: 1000 }, actual: { size: 1000, duration: 5 } })).toBe(true);
		// arquivo vazio nunca
		expect(isPlausibleRelink({ expected: { size: 0 }, actual: { size: 0 } })).toBe(false);
	});
});

function fakeHandle({
	size,
	permission = "granted",
	request = "granted",
	fail,
}: {
	size: number;
	permission?: PermissionState;
	request?: PermissionState;
	fail?: string;
}) {
	let requested = 0;
	const handle = {
		kind: "file",
		name: "live.mp4",
		queryPermission: async () => permission,
		requestPermission: async () => {
			requested++;
			return request;
		},
		getFile: async () => {
			if (fail) {
				const error = new Error(fail);
				error.name = fail;
				throw error;
			}
			return new File([new Uint8Array(size)], "live.mp4");
		},
	};
	return { handle: handle as unknown as FileSystemFileHandle, requested: () => requested };
}

describe("readLinkedFile: ao abrir o projeto", () => {
	test("arquivo no lugar e com o mesmo tamanho fica online", async () => {
		const { handle } = fakeHandle({ size: 8 });
		const result = await readLinkedFile({ handle, expectedSize: 8 });
		expect(result.status).toBe("online");
	});

	test("tamanho diferente fica offline (changed)", async () => {
		const { handle } = fakeHandle({ size: 9 });
		expect(await readLinkedFile({ handle, expectedSize: 8 })).toEqual({ status: "offline", reason: "changed" });
	});

	test("arquivo apagado ou movido fica offline (missing)", async () => {
		const { handle } = fakeHandle({ size: 8, fail: "NotFoundError" });
		expect(await readLinkedFile({ handle, expectedSize: 8 })).toEqual({ status: "offline", reason: "missing" });
		expect(await readLinkedFile({ handle: undefined, expectedSize: 8 })).toEqual({ status: "offline", reason: "missing" });
	});

	test("sem permissão: ao abrir não pede (sem clique); no clique pede", async () => {
		const semClique = fakeHandle({ size: 8, permission: "prompt" });
		expect(await readLinkedFile({ handle: semClique.handle, expectedSize: 8 })).toEqual({
			status: "offline",
			reason: "permission",
		});
		expect(semClique.requested()).toBe(0);

		const comClique = fakeHandle({ size: 8, permission: "prompt", request: "granted" });
		const result = await readLinkedFile({ handle: comClique.handle, expectedSize: 8, request: true });
		expect(result.status).toBe("online");
		expect(comClique.requested()).toBe(1);

		const negou = fakeHandle({ size: 8, permission: "prompt", request: "denied" });
		expect(await readLinkedFile({ handle: negou.handle, expectedSize: 8, request: true })).toEqual({
			status: "offline",
			reason: "permission",
		});
	});
});

describe("findOfflineMediaInUse: bloquear exportação com mídia offline", () => {
	const tracks = {
		overlay: [{ elements: [{ mediaId: "img" }, { text: "oi" }] }],
		main: { elements: [{ mediaId: "live" }] },
		audio: [{ elements: [{ mediaId: "musica" }] }],
	};

	test("acha a live offline usada na linha do tempo", () => {
		const result = findOfflineMediaInUse({
			tracks,
			offline: [{ id: "live", name: "Live" }, { id: "outra", name: "Outra" }],
		});
		expect(result.map((a) => a.id)).toEqual(["live"]);
	});

	test("mídia offline que não está na linha do tempo não bloqueia", () => {
		expect(findOfflineMediaInUse({ tracks, offline: [{ id: "outra" }] })).toEqual([]);
	});

	test("sem mídia offline, nada a fazer", () => {
		expect(findOfflineMediaInUse({ tracks, offline: [] })).toEqual([]);
	});
});
