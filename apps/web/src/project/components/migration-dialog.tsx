"use client";

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useEditor } from "@/editor/use-editor";
import { Loader2 } from "lucide-react";
import { t } from "@/i18n";

export function MigrationDialog() {
	const editor = useEditor();
	const migrationState = editor.project.getMigrationState();

	if (!migrationState.isMigrating) return null;

	const title = migrationState.projectName
		? t("projects.migration.titleSingle")
		: t("projects.migration.titleMany");
	const description = migrationState.projectName
		? t("projects.migration.descriptionSingle", {
				name: migrationState.projectName,
			})
		: t("projects.migration.descriptionMany");

	return (
		<Dialog open={true}>
			<DialogContent
				className="sm:max-w-md"
				onPointerDownOutside={(event) => event.preventDefault()}
				onEscapeKeyDown={(event) => event.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>

				<div className="flex items-center justify-center py-4">
					<Loader2 className="text-muted-foreground size-8 animate-spin" />
				</div>
			</DialogContent>
		</Dialog>
	);
}
