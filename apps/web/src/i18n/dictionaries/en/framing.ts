// Stage 3 (framing): 9:16 layout for clips (Centered, Split, Follow face).
const framing = {
	title: "Framing",
	centered: "Centered",
	centeredHint: "Shows the middle of the picture.",
	split: "Split",
	splitHint: "Camera on top, game below.",
	follow: "Follow face",
	followHint: "The picture follows your face.",
	cameraTrack: "Camera",
	gameTrack: "Game",
	alreadyFits: "Your video is already vertical: the clip uses the whole picture, no adjustment needed.",
	working: "Adjusting the framing…",
	doneOne: "Framing applied to 1 clip.",
	done: "Framing applied to {n} clips.",
	noFace: "We couldn't find your face in the stream. The clip stayed centered.",
	cannotRead:
		"We couldn't read this video to find the face. The clip stayed centered.",
};

export default framing;
