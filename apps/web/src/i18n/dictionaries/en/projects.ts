import type { Dictionary } from "../../types";

const projects: Dictionary["projects"] = {
	allProjects: "All projects",
	view: {
		grid: "Grid view",
		list: "List view",
	},
	sort: {
		createdAt: "Created",
		updatedAt: "Modified",
		name: "Name",
		duration: "Duration",
		ascending: "Ascending order",
		descending: "Descending order",
	},
	selectAll: "Select all",
	searchPlaceholder: "Search…",
	start: {
		title: "Start a project",
		subtitle: "Pick a format. You can change it later in the project settings.",
		recentTitle: "Recent projects",
	},
	formats: {
		vertical: { name: "Vertical", hint: "TikTok, Reels and Shorts" },
		horizontal: { name: "Landscape", hint: "YouTube and streams" },
		square: { name: "Square", hint: "Feed and posts" },
		portrait: { name: "Portrait", hint: "Instagram feed" },
		auto: { name: "Automatic", hint: "Matches the first video's size" },
	},
	newProjectDialog: {
		title: "New project",
		description: "Give it a name and pick the video format.",
		nameLabel: "Project name",
		formatLabel: "Format",
		create: "Create and open",
		creating: "Creating…",
	},
	newProject: {
		button: "New project",
		buttonShort: "New",
		defaultName: "New project",
		createFailed: "Couldn't create the project",
	},
	card: {
		thumbnailAlt: "Project cover",
		createdOn: "Created {date}",
	},
	menu: {
		label: "Project menu",
		info: "Info",
	},
	empty: {
		noResultsTitle: "Nothing found",
		noResultsText: "No projects match \"{query}\". Try another word.",
		clearSearch: "Clear search",
		noProjectsTitle: "No projects yet",
		noProjectsText:
			"Create your first project: bring in your media, edit and export your videos. Everything stays on your computer.",
		createFirst: "Create your first project",
	},
	deleteDialog: {
		titleSingleBefore: "Delete \"",
		titleSingleAfter: "\"?",
		titleMany: "Delete {count} projects?",
		warning: "Warning",
		descriptionSingle:
			"This will permanently delete \"{name}\" and all of its files.",
		descriptionMany:
			"This will permanently delete {count} projects and all of their files.",
		typeToConfirm: "Type DELETE to confirm",
		confirmWord: "DELETE",
		confirm: "Delete project",
	},
	renameDialog: {
		title: "Rename project",
		newName: "New name",
		placeholder: "Type the new name",
	},
	infoDialog: {
		duration: "Duration",
		created: "Created",
		updated: "Modified",
		projectCode: "Project code",
	},
	migration: {
		titleSingle: "Updating the project",
		titleMany: "Updating the projects",
		descriptionSingle:
			"Getting \"{name}\" ready for the new version of THEBOSS CUT. Don't close the program.",
		descriptionMany:
			"Getting your projects ready for the new version of THEBOSS CUT. Don't close the program.",
	},
};

export default projects;
