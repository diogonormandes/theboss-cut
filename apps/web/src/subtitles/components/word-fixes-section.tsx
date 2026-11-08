"use client";

// "Corrigir palavras": troca uma palavra em todas as legendas e guarda a troca para as próximas.

import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEditor } from "@/editor/use-editor";
import { t } from "@/i18n";
import { getCaptionElements } from "../caption-templates";
import {
	type WordFix,
	applyWordFixesToTimeline,
	forgetWordFix,
	loadWordFixes,
	rememberWordFix,
} from "../word-fixes";

export function WordFixesSection() {
	const editor = useEditor();
	const captionCount = useEditor((e) => getCaptionElements(e).length);
	const [from, setFrom] = useState("");
	const [to, setTo] = useState("");
	const [fixes, setFixes] = useState<WordFix[]>(() => loadWordFixes());

	if (captionCount === 0) return null;

	const apply = () => {
		if (!from.trim() || !to.trim()) return;
		const fix = { from: from.trim(), to: to.trim() };
		setFixes(rememberWordFix(fix));
		const count = applyWordFixesToTimeline({ editor, fixes: [fix] });
		if (count === 1) toast.success(t("media.wordFixes.appliedOne"));
		else if (count > 1) toast.success(t("media.wordFixes.applied", { count }));
		else toast(t("media.wordFixes.none"));
		setFrom("");
		setTo("");
	};

	return (
		<div className="flex flex-col gap-3 border-t pt-4">
			<div className="flex flex-col gap-1">
				<b className="text-sm font-semibold">{t("media.wordFixes.title")}</b>
				<span className="text-muted-foreground text-xs">
					{t("media.wordFixes.hint")}
				</span>
			</div>
			<div className="flex flex-col gap-2">
				<Input
					value={from}
					onChange={(event) => setFrom(event.target.value)}
					placeholder={t("media.wordFixes.fromPlaceholder")}
					aria-label={t("media.wordFixes.from")}
				/>
				<span className="text-muted-foreground px-1 text-xs">
					{t("media.wordFixes.to")}
				</span>
				<Input
					value={to}
					onChange={(event) => setTo(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter") apply();
					}}
					placeholder={t("media.wordFixes.toPlaceholder")}
					aria-label={t("media.wordFixes.to")}
				/>
				<Button
					variant="secondary"
					onClick={apply}
					disabled={!from.trim() || !to.trim()}
				>
					{t("media.wordFixes.apply")}
				</Button>
			</div>
			{fixes.length > 0 && (
				<div className="flex flex-col gap-1.5">
					<span className="text-muted-foreground text-xs">
						{t("media.wordFixes.saved")}
					</span>
					<div className="flex flex-wrap gap-1.5">
						{fixes.map((fix) => (
							<span
								key={fix.from}
								className="bg-secondary text-secondary-foreground border-secondary-border flex items-center gap-1 rounded-full border py-0.5 pr-1 pl-2.5 text-xs"
							>
								{fix.from} → {fix.to}
								<button
									type="button"
									className="hover:bg-background/40 rounded-full p-0.5"
									onClick={() => setFixes(forgetWordFix(fix.from))}
									aria-label={t("media.wordFixes.remove", { word: fix.from })}
									title={t("media.wordFixes.remove", { word: fix.from })}
								>
									<HugeiconsIcon icon={Cancel01Icon} className="size-3" />
								</button>
							</span>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
