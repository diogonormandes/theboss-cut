import type { Dictionary } from "../../types";

const panels: Dictionary["panels"] = {
	assets: {
		tabs: {
			media: "Media",
			sounds: "Sounds",
			text: "Text",
			stickers: "Stickers",
			effects: "Effects",
			transitions: "Transitions",
			captions: "Captions",
			adjustment: "Adjustment",
			settings: "Settings",
		},
		comingSoon: {
			transitions: "Transitions coming soon...",
			adjustment: "Adjustments coming soon...",
		},
		dropZone: {
			processing: "Preparing your files ({progress}%)",
			hint: "Drag and drop videos, photos and audio files here",
		},
		addToTimeline: "Add to the timeline or drag to position",
	},
	media: {
		title: "Media",
		noProject: "No project open. Open or create a project to import files.",
		import: "Import",
		exportClips: "Export clips",
		deleteMany: "Delete {count} items",
		video: "Video",
		audio: "Audio",
		unknown: "Unknown",
		listView: "Show as list",
		gridView: "Show as grid",
		sortTooltip: "Sort by {key} ({order})",
		ascending: "ascending",
		descending: "descending",
		sort: {
			name: "Name",
			type: "Type",
			duration: "Duration",
			size: "File size",
		},
	},
	settings: {
		projectInfo: "Project info",
		background: "Background",
		name: "Name",
		fps: "Frames per second",
		fpsPlaceholder: "Choose the frames per second",
		aspectRatio: "Aspect ratio",
		custom: "Custom",
		canvasWidth: "Canvas width",
		canvasHeight: "Canvas height",
	},
	background: {
		blur: "Blur",
		selectBlur: "Choose {name} blur",
		selectBackground: "Choose background {value}",
		customColor: "Choose a background color",
		colors: "Colors",
	},
	properties: {
		emptyTitle: "Nothing here yet",
		emptyHint: "Click an item on the timeline to edit it",
		multipleSelected: "{count} items selected",
		toggleKeyframe: "Turn the {name} keyframe on or off",
		tabs: {
			transform: "Transform",
			blending: "Blending",
			audio: "Audio",
			speed: "Speed",
			masks: "Masks",
			effects: "Effects",
			text: "Text",
			graphic: "Graphic",
		},
	},
};

export default panels;
