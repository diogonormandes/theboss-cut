"use client";

import { ArrowRightIcon } from "lucide-react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { useLocalStorage } from "@/services/storage/use-local-storage";
import { Button } from "../ui/button";
import { Dialog, DialogBody, DialogContent, DialogTitle } from "../ui/dialog";
import { t } from "@/i18n";
import { Emblem } from "../brand/emblem";

export function Onboarding() {
	const [step, setStep] = useState(0);
	const [hasSeenOnboarding, setHasSeenOnboarding] = useLocalStorage({
		key: "hasSeenOnboarding",
		defaultValue: false,
	});

	const isOpen = !hasSeenOnboarding;

	const handleNext = () => {
		setStep(step + 1);
	};

	const handleClose = () => {
		setHasSeenOnboarding({ value: true });
	};

	const getStepTitle = () => {
		switch (step) {
			case 0:
				return t("editor.onboarding.welcomeTitle");
			case 1:
				return t("editor.onboarding.localTitle");
			default:
				return t("editor.onboarding.tipsTitle");
		}
	};

	const renderStepContent = () => {
		switch (step) {
			case 0:
				return (
					<div className="space-y-5">
						<div className="space-y-3">
							<Title title={getStepTitle()} />
							<Description description={t("editor.onboarding.welcomeText")} />
						</div>
						<NextButton onClick={handleNext}>{t("common.next")}</NextButton>
					</div>
				);
			case 1:
				return (
					<div className="space-y-5">
						<div className="space-y-3">
							<Title title={getStepTitle()} />
							<Description description={t("editor.onboarding.localText")} />
							<Description description={t("editor.onboarding.localDrag")} />
						</div>
						<NextButton onClick={handleNext}>{t("common.next")}</NextButton>
					</div>
				);
			default:
				return (
					<div className="space-y-5">
						<div className="space-y-3">
							<Title title={getStepTitle()} />
							<Description description={t("editor.onboarding.tipsText")} />
						</div>
						<NextButton onClick={handleClose}>{t("editor.onboarding.start")}</NextButton>
					</div>
				);
		}
	};

	return (
		<Dialog open={isOpen} onOpenChange={handleClose}>
			<DialogContent className="sm:max-w-[425px]">
				<DialogTitle>
					<span className="sr-only">{getStepTitle()}</span>
				</DialogTitle>
				<DialogBody>{renderStepContent()}</DialogBody>
			</DialogContent>
		</Dialog>
	);
}

function Title({ title }: { title: string }) {
	return (
		<h2 className="flex items-center gap-2.5 font-display text-2xl font-semibold tracking-wide md:text-[1.7rem]">
			<Emblem size={36} />
			{title}
		</h2>
	);
}

function Description({ description }: { description: string }) {
	return (
		<div className="text-muted-foreground">
			<ReactMarkdown
				components={{
					p: ({ children }) => <p className="mb-0">{children}</p>,
					a: ({ href, children }) => (
						<a
							href={href}
							target="_blank"
							rel="noopener noreferrer"
							className="text-foreground hover:text-foreground/80 underline"
						>
							{children}
						</a>
					),
				}}
			>
				{description}
			</ReactMarkdown>
		</div>
	);
}

function NextButton({
	children,
	onClick,
}: {
	children: React.ReactNode;
	onClick: () => void;
}) {
	return (
		<Button onClick={onClick} variant="default" className="w-full">
			{children}
			<ArrowRightIcon className="size-4" />
		</Button>
	);
}
