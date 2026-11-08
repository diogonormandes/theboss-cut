import { t } from "@/i18n";
import { useEffect } from "react";
import { useSoundsStore } from "@/sounds/sounds-store";

export function useSoundSearch({
	query,
	commercialOnly,
}: {
	query: string;
	commercialOnly: boolean;
}) {
	const {
		searchResults,
		isSearching,
		searchError,
		lastSearchQuery,
		currentPage,
		hasNextPage,
		isLoadingMore,
		totalCount,
		setSearchResults,
		setSearching,
		setSearchError,
		setLastSearchQuery,
		setCurrentPage,
		setHasNextPage,
		setTotalCount,
		setLoadingMore,
		appendSearchResults,
		appendTopSounds,
		resetPagination,
	} = useSoundsStore();

	const loadMore = async () => {
		if (isLoadingMore || !hasNextPage) return;

		try {
			setLoadingMore({ loading: true });
			const nextPage = currentPage + 1;

			const searchParams = new URLSearchParams({
				page: nextPage.toString(),
				type: "effects",
			});

			if (query.trim()) {
				searchParams.set("q", query);
			}

			searchParams.set("commercial_only", commercialOnly.toString());
			const response = await fetch(
				`/api/sounds/search?${searchParams.toString()}`,
			);

			if (response.ok) {
				const data = await response.json();

				if (query.trim()) {
					appendSearchResults(data.results);
				} else {
					appendTopSounds(data.results);
				}

				setCurrentPage({ page: nextPage });
				setHasNextPage({ hasNext: !!data.next });
				setTotalCount(data.count);
			} else {
				setSearchError({ error: t("media.sounds.errors.searchFailed") });
			}
		} catch (err) {
			setSearchError({
				error: t("media.sounds.errors.searchFailed"),
			});
		} finally {
			setLoadingMore({ loading: false });
		}
	};

	useEffect(() => {
		if (!query.trim()) {
			setSearchResults({ results: [] });
			setSearchError({ error: null });
			setLastSearchQuery({ query: "" });
			return;
		}

		if (query === lastSearchQuery && searchResults.length > 0) {
			return;
		}

		let ignore = false;

		const timeoutId = setTimeout(async () => {
			try {
				setSearching({ searching: true });
				setSearchError({ error: null });
				resetPagination();

				const response = await fetch(
					`/api/sounds/search?q=${encodeURIComponent(query)}&type=effects&page=1`,
				);

				if (!ignore) {
					if (response.ok) {
						const data = await response.json();
						setSearchResults({ results: data.results });
						setLastSearchQuery({ query: query });
						setHasNextPage({ hasNext: !!data.next });
						setTotalCount({ count: data.count });
						setCurrentPage({ page: 1 });
					} else {
						setSearchError({ error: t("media.sounds.errors.searchFailed") });
					}
				}
			} catch (err) {
				if (!ignore) {
					setSearchError({
						error: t("media.sounds.errors.searchFailed"),
					});
				}
			} finally {
				if (!ignore) {
					setSearching({ searching: false });
				}
			}
		}, 300);

		return () => {
			clearTimeout(timeoutId);
			ignore = true;
		};
	}, [
		query,
		lastSearchQuery,
		searchResults.length,
		setSearchResults,
		setSearching,
		setSearchError,
		setLastSearchQuery,
		setCurrentPage,
		setHasNextPage,
		setTotalCount,
		resetPagination,
	]);

	return {
		results: searchResults,
		isLoading: isSearching,
		error: searchError,
		loadMore,
		hasNextPage,
		isLoadingMore,
		totalCount,
	};
}
