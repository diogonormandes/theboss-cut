"use client";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useStoragePersistence } from "@/services/storage/use-storage-persistence";
import { t } from "@/i18n";

export function StoragePersistenceDialog() {
	const { showDialog, onConfirm, onDismiss } = useStoragePersistence();

	return (
		<Dialog open={showDialog} onOpenChange={(open) => !open && onDismiss()}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>{t("media.storage.persistDialog.title")}</DialogTitle>
				</DialogHeader>
				<DialogBody>
					<p className="text-base text-muted-foreground">
						{t("media.storage.persistDialog.warning")}
					</p>
					<p className="text-base text-muted-foreground">
						{t("media.storage.persistDialog.question")}
					</p>
				</DialogBody>
				<DialogFooter>
					<Button variant="outline" onClick={onDismiss}>
						{t("media.storage.persistDialog.notNow")}
					</Button>
					<Button onClick={onConfirm}>
						{t("media.storage.persistDialog.allow")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
