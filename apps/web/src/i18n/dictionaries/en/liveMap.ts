import type { Dictionary } from "../../types";

// Live map: strip above the timeline with speech, shouts and silences.
const liveMap: Dictionary["liveMap"] = {
	title: "Live map",
	analyze: "Analyze the live",
	explain: "Listens to the live on your PC to find speech, shouts and silences. Nothing leaves your computer.",
	track: "Audio track",
	trackNumber: "Track {n}",
	trackHint: "If your recording has a microphone-only track, pick it: the map gets more accurate.",
	analyzing: "Listening to the live… {done} of {total}",
	remaining: "about {time} left",
	starting: "Getting ready…",
	cancel: "Cancel",
	retry: "Try again",
	reanalyze: "Analyze again",
	errorNoAudio: "This video has no sound to analyze. Pick a video with audio.",
	errorCannotDecode: "The sound in this file can't be opened here. In OBS, use File → Remux Recordings to MP4 and import it again.",
	errorFailed: "Couldn't listen to the live. Check that the file is still in the same place and try again.",
	errorOffline: "The live file wasn't found. Use “Locate file” on the media and try again.",
	summaryShoutsOne: "1 shout",
	summaryShouts: "{n} shouts",
	summaryPeaksOne: "1 big moment",
	summaryPeaks: "{n} big moments",
	summarySilence: "{silence} of silence",
	legendSpeech: "Speech",
	legendSilence: "Silence",
	legendShout: "Shout",
	legendPeak: "Big moment",
	clickHint: "Click to move the playhead to that point.",
	hoverShout: "Shout",
	hoverPeak: "Big moment",
	hoverSilence: "Silence",
	hoverSpeech: "Speech",
	hoverSound: "Sound",
};

export default liveMap;
