import { Button } from "@/components/ui/button";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useReducer, useRef, useState } from "react";
import { extractTimelineAudioSamples } from "@/media/mediabunny";
import { useEditor } from "@/editor/use-editor";
import { TRANSCRIPTION_DIAGNOSTICS_SCOPE } from "@/transcription/diagnostics";
import { DEFAULT_TRANSCRIPTION_SAMPLE_RATE } from "@/transcription/audio";
import { TRANSCRIPTION_LANGUAGES } from "@/transcription/supported-languages";
import type {
	TranscriptionLanguage,
	TranscriptionProgress,
} from "@/transcription/types";
import { transcriptionService } from "@/services/transcription/service";
import {
	buildCaptionChunks,
	buildCaptionChunksFromWords,
} from "@/transcription/caption";
import { insertCaptionChunksAsTextTrack } from "@/subtitles/insert";
import type { SubtitleCue } from "@/subtitles/types";
import { parseSubtitleFile } from "@/subtitles/parse";
import { Spinner } from "@/components/ui/spinner";
import {
	Section,
	SectionContent,
	SectionField,
	SectionFields,
} from "@/components/section";
import { AlertCircleIcon, CloudUploadIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type { DiagnosticSeverity } from "@/diagnostics/types";
import { getLocale, t } from "@/i18n";
import type { TranscriptionQuality } from "@/transcription/types";
import {
	DEFAULT_TRANSCRIPTION_QUALITY,
	getModelForQuality,
} from "@/transcription/models";
import { cn } from "@/utils/ui";
import { loadFonts } from "@/fonts/google-fonts";
import {
	CAPTION_TEMPLATES,
	DEFAULT_CAPTION_TEMPLATE,
	cueStyleFromLook,
} from "@/subtitles/caption-templates";
import { CaptionStyleSection } from "@/subtitles/components/caption-style";
import { WordFixesSection } from "@/subtitles/components/word-fixes-section";
import { applyWordFixesToCues, loadWordFixes } from "@/subtitles/word-fixes";

const DIAGNOSTIC_BUTTON_VARIANT: Record<
	DiagnosticSeverity,
	"caution" | "destructive-foreground"
> = {
	caution: "caution",
	error: "destructive-foreground",
};

const QUALITY_STORAGE_KEY = "thebosscut-legenda-qualidade";
const QUALITY_OPTIONS: TranscriptionQuality[] = ["fast", "accurate"];
// idiomas do programa primeiro na lista
const FEATURED_LANGUAGES = ["pt", "en", "es"];

function readSavedQuality(): TranscriptionQuality {
	try {
		const saved = localStorage.getItem(QUALITY_STORAGE_KEY);
		return saved === "accurate" || saved === "fast"
			? saved
			: DEFAULT_TRANSCRIPTION_QUALITY;
	} catch {
		return DEFAULT_TRANSCRIPTION_QUALITY;
	}
}

/** Vertical: legendas curtas (3 palavras). Horizontal: um pouco mais (5). */
function getWordsPerCaption(canvasSize: { width: number; height: number }) {
	return canvasSize.height > canvasSize.width ? 3 : 5;
}

type ProcessingState =
	| { status: "idle"; error: string | null; warnings: string[] }
	| { status: "processing"; step: string };

type ProcessingAction =
	| { type: "start"; step: string }
	| { type: "update_step"; step: string }
	| { type: "succeed"; warnings: string[] }
	| { type: "fail"; error: string };

const IDLE_STATE: ProcessingState = {
	status: "idle",
	error: null,
	warnings: [],
};

/* eslint-disable opencut/prefer-object-params -- React reducers must accept (state, action). */
function processingReducer(
	state: ProcessingState,
	action: ProcessingAction,
): ProcessingState {
	switch (action.type) {
		case "start":
			return { status: "processing", step: action.step };
		case "update_step":
			if (state.status !== "processing") return state;
			return { status: "processing", step: action.step };
		case "succeed":
			return { status: "idle", error: null, warnings: action.warnings };
		case "fail":
			return { status: "idle", error: action.error, warnings: [] };
	}
}
/* eslint-enable opencut/prefer-object-params */

export function Captions() {
	// começa no idioma do programa (o mais provável de ser o do vídeo)
	const [selectedLanguage, setSelectedLanguage] =
		useState<TranscriptionLanguage>(() => getLocale());
	const [quality, setQuality] = useState<TranscriptionQuality>(readSavedQuality);
	const [processing, dispatch] = useReducer(processingReducer, IDLE_STATE);
	const containerRef = useRef<HTMLDivElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const editor = useEditor();

	const isProcessing = processing.status === "processing";

	const activeDiagnostics = useEditor((e) =>
		e.diagnostics.getActive({ scope: TRANSCRIPTION_DIAGNOSTICS_SCOPE }),
	);

	const handleProgress = (progress: TranscriptionProgress) => {
		if (progress.status === "loading-model") {
			dispatch({
				type: "update_step",
				step: t("media.subtitles.steps.loadingModel", {
					percent: Math.round(progress.progress),
				}),
			});
		} else if (progress.status === "transcribing") {
			dispatch({ type: "update_step", step: t("media.subtitles.steps.transcribing") });
		}
	};

	const insertCaptions = ({
		captions,
	}: {
		captions: SubtitleCue[];
	}): boolean => {
		const trackId = insertCaptionChunksAsTextTrack({ editor, captions });
		return trackId !== null;
	};

	const handleGenerateTranscript = async () => {
		dispatch({ type: "start", step: t("media.subtitles.steps.extractingAudio") });
		try {
			// só os trechos que estão na linha do tempo, já em mono 16 kHz
			// (sem WAV intermediário); o array é transferido para o Worker
			const samples = await extractTimelineAudioSamples({
				tracks: editor.scenes.getActiveScene().tracks,
				mediaAssets: editor.media.getAssets(),
				totalDuration: editor.timeline.getTotalDuration(),
				sampleRate: DEFAULT_TRANSCRIPTION_SAMPLE_RATE,
			});

			dispatch({ type: "update_step", step: t("media.subtitles.steps.preparingAudio") });

			const result = await transcriptionService.transcribe({
				audioData: samples,
				language: selectedLanguage === "auto" ? undefined : selectedLanguage,
				modelId: getModelForQuality(quality).id,
				onProgress: handleProgress,
			});

			dispatch({ type: "update_step", step: t("media.subtitles.steps.generating") });
			const canvasSize = editor.project.getActive().settings.canvasSize;
			// as legendas nascem com o modelo BOSS dourado, na posição segura do vertical
			const look = CAPTION_TEMPLATES[DEFAULT_CAPTION_TEMPLATE];
			await loadFonts({ families: [look.fontFamily] }).catch(() => undefined);
			const cueStyle = cueStyleFromLook({ look, canvasSize });
			// palavra por palavra quando o modelo marca o tempo de cada palavra
			const rawChunks =
				result.words.length > 0
					? buildCaptionChunksFromWords({
							words: result.words,
							maxWords: getWordsPerCaption(canvasSize),
						})
					: buildCaptionChunks({ segments: result.segments });
			// o dicionário de correções da pessoa ("Bosch" → "BOSS") entra sozinho
			const captionChunks = applyWordFixesToCues(
				rawChunks.map((chunk) => ({
					...chunk,
					style: cueStyle,
					captionStyle: { ...look.style },
				})),
				loadWordFixes(),
			);

			if (!insertCaptions({ captions: captionChunks })) {
				dispatch({
					type: "fail",
					error: t("media.subtitles.errors.noCaptions"),
				});
				return;
			}

			dispatch({ type: "succeed", warnings: [] });
		} catch (error) {
			console.error("Transcription failed:", error);
			dispatch({
				type: "fail",
				error: t("media.subtitles.errors.transcribeFailed"),
			});
		}
	};

	const handleImportClick = () => {
		fileInputRef.current?.click();
	};

	const handleImportFile = async ({ file }: { file: File }) => {
		dispatch({ type: "start", step: t("media.subtitles.steps.reading") });
		try {
			const input = await file.text();
			const result = parseSubtitleFile({
				fileName: file.name,
				input,
			});

			if (result.captions.length === 0) {
				dispatch({
					type: "fail",
					error: t("media.subtitles.errors.noCues"),
				});
				return;
			}

			dispatch({ type: "update_step", step: t("media.subtitles.steps.importing") });

			if (!insertCaptions({ captions: result.captions })) {
				dispatch({
					type: "fail",
					error: t("media.subtitles.errors.noCaptions"),
				});
				return;
			}

			const nextWarnings = [...result.warnings];
			if (result.skippedCueCount > 0) {
				nextWarnings.unshift(
					t("media.subtitles.warnings.skipped", {
						imported: result.captions.length,
						skipped: result.skippedCueCount,
					}),
				);
			}

			dispatch({ type: "succeed", warnings: nextWarnings });
		} catch (error) {
			console.error("Subtitle import failed:", error);
			dispatch({
				type: "fail",
				error: t("media.subtitles.errors.importFailed"),
			});
		}
	};

	const handleFileChange = async ({
		event,
	}: {
		event: React.ChangeEvent<HTMLInputElement>;
	}) => {
		const file = event.target.files?.[0];
		if (event.target) {
			event.target.value = "";
		}
		if (!file) return;

		await handleImportFile({ file });
	};

	const handleLanguageChange = ({ value }: { value: string }) => {
		if (value === "auto") {
			setSelectedLanguage("auto");
			return;
		}

		const matchedLanguage = TRANSCRIPTION_LANGUAGES.find(
			(language) => language.code === value,
		);
		if (!matchedLanguage) return;
		setSelectedLanguage(matchedLanguage.code);
	};

	const handleQualityChange = (next: TranscriptionQuality) => {
		setQuality(next);
		try {
			localStorage.setItem(QUALITY_STORAGE_KEY, next);
		} catch {
			// só não fica lembrado
		}
	};

	const sortedLanguages = [
		...FEATURED_LANGUAGES.flatMap((code) =>
			TRANSCRIPTION_LANGUAGES.filter((language) => language.code === code),
		),
		...TRANSCRIPTION_LANGUAGES.filter(
			(language) => !FEATURED_LANGUAGES.includes(language.code),
		),
	];

	const error = processing.status === "idle" ? processing.error : null;
	const warnings = processing.status === "idle" ? processing.warnings : [];

	return (
		<PanelView
			title={t("media.subtitles.title")}
			contentClassName="px-0 flex flex-col h-full"
			actions={
				<TooltipProvider>
					<div className="flex items-center gap-1.5">
						{!isProcessing &&
							activeDiagnostics.map((diagnostic) => (
								<Tooltip key={diagnostic.id}>
									<TooltipTrigger asChild>
										<Button
											variant={DIAGNOSTIC_BUTTON_VARIANT[diagnostic.severity]}
											size="icon"
											aria-label={diagnostic.message}
										>
											<HugeiconsIcon icon={AlertCircleIcon} size={16} />
										</Button>
									</TooltipTrigger>
									<TooltipContent>{diagnostic.message}</TooltipContent>
								</Tooltip>
							))}
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={handleImportClick}
							disabled={isProcessing}
							className="items-center justify-center gap-1.5"
						>
							<HugeiconsIcon icon={CloudUploadIcon} />
							{t("media.subtitles.import")}
						</Button>
					</div>
				</TooltipProvider>
			}
			ref={containerRef}
		>
			<input
				ref={fileInputRef}
				type="file"
				accept=".srt,.ass"
				className="hidden"
				onChange={(event) => void handleFileChange({ event })}
			/>
			<Section
				showTopBorder={false}
				showBottomBorder={false}
				className="flex-1"
			>
				<SectionContent className="flex flex-col gap-4 h-full pt-1">
					<SectionFields>
						<SectionField label={t("media.subtitles.language")}>
							<Select
								value={selectedLanguage}
								onValueChange={(value) => handleLanguageChange({ value })}
							>
								<SelectTrigger>
									<SelectValue placeholder={t("media.subtitles.chooseLanguage")} />
								</SelectTrigger>
								<SelectContent>
									{sortedLanguages.map((language) => (
										<SelectItem key={language.code} value={language.code}>
											{language.name}
										</SelectItem>
									))}
									<SelectItem value="auto">
										{t("media.subtitles.autoDetect")}
									</SelectItem>
								</SelectContent>
							</Select>
						</SectionField>
						<SectionField label={t("media.subtitles.quality")}>
							<div className="grid grid-cols-1 gap-2" role="radiogroup">
								{QUALITY_OPTIONS.map((option) => {
									const isOn = option === quality;
									const model = getModelForQuality(option);
									return (
										<button
											key={option}
											type="button"
											role="radio"
											aria-checked={isOn}
											disabled={isProcessing}
											onClick={() => handleQualityChange(option)}
											className={cn(
												"tb-quality flex flex-col gap-1 rounded-lg border p-2.5 text-left transition-colors",
												isOn
													? "border-primary bg-secondary"
													: "border-border hover:border-muted-foreground/40",
											)}
										>
											<b className="text-sm font-semibold">
												{option === "fast"
													? t("media.subtitles.qualityFast")
													: t("media.subtitles.qualityAccurate")}
											</b>
											<span className="text-muted-foreground text-xs leading-snug">
												{option === "fast"
													? t("media.subtitles.qualityFastHint")
													: t("media.subtitles.qualityAccurateHint")}
											</span>
											<span className="text-muted-foreground/80 text-[0.7rem]">
												{t("media.subtitles.firstDownload", {
													size: model.downloadSizeMb,
												})}
											</span>
										</button>
									);
								})}
							</div>
						</SectionField>
					</SectionFields>
					<p className="text-muted-foreground text-xs">
						{t("media.subtitles.privacyNote")}
					</p>

					<Button
						type="button"
						className="btn-boss mt-auto w-full"
						onClick={handleGenerateTranscript}
						disabled={isProcessing || activeDiagnostics.length > 0}
					>
						{isProcessing && <Spinner className="mr-1" />}
						{isProcessing ? processing.step : t("media.subtitles.generate")}
					</Button>
					{error && (
						<div className="bg-destructive/10 border-destructive/20 rounded-md border p-3">
							<p className="text-destructive text-sm">{error}</p>
						</div>
					)}
					{warnings.length > 0 && (
						<div className="rounded-md border border-amber-500/20 bg-amber-500/10 p-3">
							<ul className="space-y-1 text-sm text-amber-700">
								{warnings.map((warning) => (
									<li key={warning}>{warning}</li>
								))}
							</ul>
						</div>
					)}
					<WordFixesSection />
					<CaptionStyleSection />
				</SectionContent>
			</Section>
		</PanelView>
	);
}
