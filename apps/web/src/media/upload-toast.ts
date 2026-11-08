import { toast } from "sonner";
import { t } from "@/i18n";

export interface MediaUploadToastResult {
	uploadedCount: number;
	assetNames?: string[];
}


function waitForNextPaint(): Promise<void> {
	return new Promise((resolve) => {
		requestAnimationFrame(() => {
			requestAnimationFrame(() => resolve());
		});
	});
}

export async function showMediaUploadToast<T extends MediaUploadToastResult>({
	filesCount,
	promise,
}: {
	filesCount: number;
	promise: Promise<T> | (() => Promise<T>);
}) {
	const run = typeof promise === "function" ? promise : () => promise;
	const toastPromise = toast.promise(async () => {
		await waitForNextPaint();
		return run();
	}, {
		loading:
			filesCount === 1
				? t("media.upload.uploadingOne")
				: t("media.upload.uploadingMany"),
		success: ({ uploadedCount, assetNames }) => {
			if (uploadedCount === 1) {
				const assetName = assetNames?.[0];
				return assetName
					? t("media.upload.uploadedNamed", { name: assetName })
					: t("media.upload.uploadedOne");
			}

			if (uploadedCount > 1) {
				return t("media.upload.uploadedMany", { count: uploadedCount });
			}

			return t("media.upload.uploadedNone");
		},
		error:
			filesCount === 1
				? t("media.upload.failedOne")
				: t("media.upload.failedMany"),
	});

	return toastPromise.unwrap();
}
