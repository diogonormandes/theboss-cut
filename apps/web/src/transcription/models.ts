import { t } from "@/i18n";
import type {
	TranscriptionModel,
	TranscriptionModelId,
	TranscriptionQuality,
} from "./types";

// Modelos "_timestamped": marcam o tempo de cada palavra (para a legenda palavra por palavra).
// São baixados uma vez e ficam guardados no PC; o áudio nunca sai do computador.
export const TRANSCRIPTION_MODELS: TranscriptionModel[] = [
	{
		id: "whisper-small",
		quality: "fast",
		name: "Small",
		huggingFaceId: "onnx-community/whisper-small_timestamped",
		downloadSizeMb: 300,
		get description() {
			return t("media.transcription.models.small");
		},
	},
	{
		id: "whisper-large-v3-turbo",
		quality: "accurate",
		name: "Large v3 Turbo",
		huggingFaceId: "onnx-community/whisper-large-v3-turbo_timestamped",
		downloadSizeMb: 760,
		get description() {
			return t("media.transcription.models.largeTurbo");
		},
	},
];

export const DEFAULT_TRANSCRIPTION_QUALITY: TranscriptionQuality = "fast";

export const DEFAULT_TRANSCRIPTION_MODEL: TranscriptionModelId =
	"whisper-small";

export function getModelForQuality(
	quality: TranscriptionQuality,
): TranscriptionModel {
	return (
		TRANSCRIPTION_MODELS.find((model) => model.quality === quality) ??
		TRANSCRIPTION_MODELS[0]
	);
}
