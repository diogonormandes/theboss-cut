// Stage 3 (silenceCut): "Cut silences" section.
const silenceCut = {
	title: "Cut silences",
	explain: "Removes the pauses with no talking. The red on the map shows what will go.",
	strength: "Strength",
	soft: "Gentle",
	strong: "Strong",
	strengthHint: "Gentle removes only total silence. Strong also removes very quiet parts.",
	minSilence: "Shortest pause",
	minSilenceHint: "Only cuts pauses at least this long.",
	seconds: "{n} s",
	willCutOne: "Will cut 1 part ({time})",
	willCut: "Will cut {n} parts ({time})",
	nothing: "No silences with this setting. Try a stronger strength.",
	apply: "Cut silences",
	needAnalysis: "To find the silences, analyze the live first.",
	analyzing: "Analyzing the live… the result shows up here when it is done.",
	noLive: "Put a live (video of 10 minutes or more) on the timeline to use this.",
	noClip: "Select on the timeline the part of the live you want to clean.",
	retimed: "This part has a changed speed. Set the speed back to normal to cut the silences.",
	doneOne: "Done: 1 silence cut. To go back, use Undo (Ctrl+Z).",
	done: "Done: {n} silences cut. To go back, use Undo (Ctrl+Z).",
	newScene: "No silences",
	newSceneDone: "We created the \"No silences\" scene with the clean live. The main scene was left untouched.",
	failed: "Could not cut. Select the part of the live again and try once more.",
};

export default silenceCut;
