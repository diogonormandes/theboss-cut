import { getLocaleTag } from "@/i18n";

export function formatDate({ date }: { date: Date }): string {
	return date.toLocaleDateString(getLocaleTag(), {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}
