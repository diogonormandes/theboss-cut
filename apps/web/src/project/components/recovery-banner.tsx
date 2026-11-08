"use client";

// Aviso na tela inicial quando o programa fechou de repente com um projeto aberto
// (queda de luz, travamento): o projeto foi salvo e dá para continuar de onde parou.

import { CloudSavingDone01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/editor/use-editor";
import { t } from "@/i18n";
import { type OpenSession, takeInterruptedSession } from "@/project/session";

export function RecoveryBanner() {
	const [session, setSession] = useState<OpenSession | null>(null);
	const [dismissed, setDismissed] = useState(false);
	const isInitialized = useEditor((e) => e.project.getIsInitialized());
	const savedProjects = useEditor((e) => e.project.getSavedProjects());

	useEffect(() => {
		setSession(takeInterruptedSession());
	}, []);

	if (!session || dismissed || !isInitialized) return null;
	const project = savedProjects.find((item) => item.id === session.projectId);
	if (!project) return null;

	return (
		<div className="tb-recovery mx-4 mt-3" role="status">
			<HugeiconsIcon
				icon={CloudSavingDone01Icon}
				className="text-primary size-6 shrink-0"
			/>
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<b className="text-sm font-semibold">{t("projects.recovery.title")}</b>
				<span className="text-muted-foreground text-sm">
					{project.name
						? t("projects.recovery.text", { name: project.name })
						: t("projects.recovery.textNoName")}
				</span>
			</div>
			<div className="flex shrink-0 items-center gap-2">
				<Button variant="ghost" size="sm" onClick={() => setDismissed(true)}>
					{t("projects.recovery.dismiss")}
				</Button>
				<Button asChild size="sm" className="btn-boss px-3">
					<Link href={`/editor/${project.id}`}>
						{t("projects.recovery.continue")}
					</Link>
				</Button>
			</div>
		</div>
	);
}
