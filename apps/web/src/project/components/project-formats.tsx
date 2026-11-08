"use client";

// Tela inicial: cartões de formato (9:16, 16:9, 1:1, 4:5, Automático) e a janela "Novo projeto".

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEditor } from "@/editor/use-editor";
import { t, type TKey } from "@/i18n";
import {
	PROJECT_FORMATS,
	type ProjectFormat,
	type ProjectFormatId,
} from "@/project/formats";
import { cn } from "@/utils/ui";

function formatName(id: ProjectFormatId): string {
	return t(`projects.formats.${id}.name` as TKey);
}

function formatHint(id: ProjectFormatId): string {
	return t(`projects.formats.${id}.hint` as TKey);
}

/** Cria o projeto no formato escolhido e abre o editor. */
function useCreateProject() {
	const editor = useEditor();
	const router = useRouter();
	const [isCreating, setIsCreating] = useState(false);

	const create = async ({
		format,
		name,
	}: {
		format: ProjectFormat;
		name?: string;
	}) => {
		if (isCreating) return;
		setIsCreating(true);
		try {
			const projectId = await editor.project.createNewProject({
				name: name?.trim() || t("projects.newProject.defaultName"),
				canvasSize: format.canvasSize,
			});
			router.push(`/editor/${projectId}`);
		} catch (error) {
			console.error("Failed to create project:", error);
			toast.error(t("projects.newProject.createFailed"), {
				description: t("common.tryAgain"),
			});
			setIsCreating(false);
		}
	};

	return { create, isCreating };
}

/** O desenho do formato: um retângulo dourado com a proporção certa. */
function FormatShape({ format }: { format: ProjectFormat }) {
	const box = 56;
	const size = format.canvasSize;
	if (!size) {
		return (
			<span
				className="tb-format-shape is-auto"
				style={{ width: box * 0.78, height: box * 0.78 }}
			>
				<span>A</span>
			</span>
		);
	}
	const scale = box / Math.max(size.width, size.height);
	return (
		<span
			className="tb-format-shape"
			style={{
				width: Math.round(size.width * scale),
				height: Math.round(size.height * scale),
			}}
		/>
	);
}

function FormatCard({
	format,
	selected,
	disabled,
	onClick,
	compact,
}: {
	format: ProjectFormat;
	selected?: boolean;
	disabled?: boolean;
	onClick: () => void;
	compact?: boolean;
}) {
	return (
		<button
			type="button"
			className={cn("tb-format", selected && "is-on", compact && "is-compact")}
			onClick={onClick}
			disabled={disabled}
			aria-pressed={selected}
		>
			<span className="tb-format-stage">
				<FormatShape format={format} />
			</span>
			<span className="tb-format-text">
				<b>
					{formatName(format.id)}
					{format.ratio && <em>{format.ratio}</em>}
				</b>
				<small>{formatHint(format.id)}</small>
			</span>
		</button>
	);
}

/** Faixa "Começar um projeto" no topo da tela inicial: um clique já abre o editor. */
export function StartProjectStrip() {
	const { create, isCreating } = useCreateProject();

	return (
		<section className="tb-start px-4">
			<div className="flex flex-col gap-1">
				<h2 className="font-display text-2xl font-semibold tracking-wide sm:text-[1.7rem]">
					{t("projects.start.title")}
				</h2>
				<p className="text-muted-foreground text-sm">
					{t("projects.start.subtitle")}
				</p>
			</div>
			<div className="tb-formats">
				{PROJECT_FORMATS.map((format) => (
					<FormatCard
						key={format.id}
						format={format}
						disabled={isCreating}
						onClick={() => create({ format })}
					/>
				))}
			</div>
		</section>
	);
}

/** Janela "Novo projeto": nome + formato. */
export function NewProjectDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const { create, isCreating } = useCreateProject();
	const [name, setName] = useState("");
	const [formatId, setFormatId] = useState<ProjectFormatId>("vertical");
	const format =
		PROJECT_FORMATS.find((item) => item.id === formatId) ?? PROJECT_FORMATS[0];

	const submit = () => create({ format, name });

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-2xl">
				<DialogHeader>
					<DialogTitle className="font-display text-2xl font-semibold tracking-wide">
						{t("projects.newProjectDialog.title")}
					</DialogTitle>
					<DialogDescription>
						{t("projects.newProjectDialog.description")}
					</DialogDescription>
				</DialogHeader>
				<DialogBody className="flex flex-col gap-5">
					<div className="flex flex-col gap-2">
						<Label htmlFor="new-project-name">
							{t("projects.newProjectDialog.nameLabel")}
						</Label>
						<Input
							id="new-project-name"
							value={name}
							placeholder={t("projects.newProject.defaultName")}
							onChange={(event) => setName(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter") submit();
							}}
							autoFocus
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label>{t("projects.newProjectDialog.formatLabel")}</Label>
						<div className="tb-formats is-dialog">
							{PROJECT_FORMATS.map((item) => (
								<FormatCard
									key={item.id}
									format={item}
									compact
									selected={item.id === formatId}
									onClick={() => setFormatId(item.id)}
								/>
							))}
						</div>
					</div>
				</DialogBody>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						{t("common.cancel")}
					</Button>
					<Button className="btn-boss" onClick={submit} disabled={isCreating}>
						{isCreating
							? t("projects.newProjectDialog.creating")
							: t("projects.newProjectDialog.create")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
