import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { t } from "@/i18n";

export function DeleteProjectDialog({
	isOpen,
	onOpenChange,
	onConfirm,
	projectNames,
}: {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
	projectNames: string[];
}) {
	const count = projectNames.length;
	const isSingle = count === 1;
	const singleName = isSingle ? projectNames[0] : null;

	return (
		<Dialog open={isOpen} onOpenChange={onOpenChange}>
			<DialogContent
				onOpenAutoFocus={(event) => {
					event.preventDefault();
					event.stopPropagation();
				}}
			>
				<DialogHeader>
					<DialogTitle>
						{singleName ? (
							<>
								{t("projects.deleteDialog.titleSingleBefore")}
								<span className="inline-block max-w-[300px] truncate align-bottom">
									{singleName}
								</span>
								{t("projects.deleteDialog.titleSingleAfter")}
							</>
						) : (
							t("projects.deleteDialog.titleMany", { count })
						)}
					</DialogTitle>
				</DialogHeader>
				<DialogBody>
					<Alert variant="destructive">
						<AlertTitle>{t("projects.deleteDialog.warning")}</AlertTitle>
						<AlertDescription>
							{singleName
								? t("projects.deleteDialog.descriptionSingle", {
										name: singleName,
									})
								: t("projects.deleteDialog.descriptionMany", { count })}
						</AlertDescription>
					</Alert>
					<div className="flex flex-col gap-3">
						<Label className="text-xs font-semibold text-slate-500">
							{t("projects.deleteDialog.typeToConfirm")}
						</Label>
						<Input
							type="text"
							placeholder={t("projects.deleteDialog.confirmWord")}
							size="lg"
							variant="destructive"
						/>
					</div>
				</DialogBody>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						{t("common.cancel")}
					</Button>
					<Button variant="destructive" onClick={onConfirm}>
						{t("projects.deleteDialog.confirm")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
