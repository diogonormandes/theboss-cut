import type { Dictionary } from "../../types";

const editor: Dictionary["editor"] = {
	header: {
		exitProject: "Exit project",
		shortcuts: "Shortcuts",
		renameFailed: "Couldn't rename the project",
		deleteFailed: "Couldn't delete the project",
	},
	loader: {
		opening: "Opening the project…",
		closing: "Leaving the project…",
		createFailed:
			"Couldn't create the project. Go back to the project list and try again.",
		loadFailed:
			"Couldn't open the project. Go back to the project list and try again.",
	},
	degradedBanner: "For the best experience, keep THEBOSS CUT up to date.",
	storage: {
		incomplete:
			"Storage on this computer isn't fully available. Some features may not work.",
		unknownError: "Something went wrong while loading your projects.",
	},
	export: {
		button: "Export",
		title: "Export project",
		titleExporting: "Exporting project",
		format: "Format",
		formatMp4: "MP4 (H.264) - plays everywhere",
		formatWebm: "WebM (VP9) - smaller file",
		quality: "Quality",
		qualityLow: "Low - smaller file",
		qualityMedium: "Medium - balanced",
		qualityHigh: "High - recommended",
		qualityVeryHigh: "Very high - larger file",
		audio: "Audio",
		includeAudio: "Export with audio",
		failed: "Couldn't export",
		unknownError: "Something went wrong. Try exporting again.",
		copy: "Copy",
		retry: "Try again",
	},
	mobileGate: {
		title: "Computer only (for now)",
		text: "THEBOSS CUT was made for computers. On small screens editing gets cramped.",
		continue: "View anyway",
	},
	onboarding: {
		welcomeTitle: "Welcome to THEBOSS CUT",
		welcomeText:
			"The THEBOSSVERSE video editor: cut, caption, add text, effects and music, and export ready to post.",
		localTitle: "Your videos stay on your PC",
		localText:
			"Nothing is uploaded to the internet: your projects and files are kept on this computer.",
		localDrag:
			"Drag videos, photos and music into the media area to get started.",
		tipsTitle: "Quick tips",
		tipsText:
			"Space plays and pauses. S splits at the playhead. All shortcuts are in the trident menu at the top.",
		start: "Start editing",
	},
	scenes: {
		title: "Scenes",
		description: "Switch between the scenes in your project",
		selectTitle: "Select scenes ({count})",
		selectDescription: "Choose the scenes you want to delete",
		select: "Select",
		deleteCount: "Delete ({count})",
		empty: "No scenes",
		deleteFailed: "Couldn't delete the scene",
		deleteTitle: "Delete scenes",
		deleteConfirmOne: "Delete 1 scene? This can't be undone.",
		deleteConfirmMany: "Delete {count} scenes? This can't be undone.",
	},
	timecode: {
		clickToEdit: "Click to change the time",
	},
	section: {
		collapse: "Collapse section",
		expand: "Expand section",
	},
	theme: {
		light: "Light",
		dark: "Dark",
	},
	icons: {
		video: "Video",
		checkerboard: "Checkerboard",
		sliders: "Adjustments",
		social: "Social media",
		textWidth: "Text width",
		textHeight: "Text height",
		font: "Font",
		shapes: "Shapes",
		mirror: "Mirror",
		squarePlus: "Add",
		ripple: "Ripple",
	},
};

export default editor;
