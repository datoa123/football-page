import {formatDateParam, getDateForOffset} from "./utils.js";
import {renderMatchDetail} from "./render-detail.js";

const matchApiDetailCache = new Map();

// Fetches /api/recent-matches or /api/scores?date=... depending on scoreMode.
// requestIdRef is a mutable { current } box so callers can detect and ignore
// stale responses if a newer request started before this one resolved.
export async function fetchScores({scoreMode, dayOffset}) {
    if (scoreMode === "recent") {
        const response = await fetch("/api/recent-matches", {
            headers: {Accept: "application/json"},
        });

        if (!response.ok) {
            throw new Error(`Scores request failed with ${response.status}`);
        }

        return response.json();
    }

    const date = formatDateParam(getDateForOffset(dayOffset));
    const response = await fetch(`/api/scores?date=${date}`, {
        headers: {Accept: "application/json"},
    });

    if (!response.ok) {
        throw new Error(`Scores request failed with ${response.status}`);
    }

    return response.json();
}

// Fetches and caches per-fixture detail (lineups/playerStats/events), then
// re-renders the detail screen once data is in. Safe to call even if the
// user has since navigated away or opened a different match: it checks
// isStillRelevant() before touching the DOM.
export async function loadMatchApiDetail(detail, matchStack, isStillRelevant) {
    const fixtureId = detail.match.id;

    if (!fixtureId) {
        return;
    }

    const cacheKey = String(fixtureId);

    if (matchApiDetailCache.has(cacheKey)) {
        detail.apiDetail = matchApiDetailCache.get(cacheKey);
        renderMatchDetail(detail, matchStack);
        return;
    }

    try {
        const response = await fetch(`/api/matches/${encodeURIComponent(fixtureId)}/details`, {
            headers: {Accept: "application/json"},
        });

        if (!response.ok) {
            throw new Error(`Match details request failed with ${response.status}`);
        }

        const apiDetail = await response.json();

        if (!isStillRelevant()) {
            return;
        }

        matchApiDetailCache.set(cacheKey, apiDetail);
        detail.apiDetail = apiDetail;
        renderMatchDetail(detail, matchStack);
    } catch (error) {
        console.error(error);

        if (isStillRelevant()) {
            detail.apiDetail = {
                events: [],
                lineups: [],
                playerStats: [],
            };
            renderMatchDetail(detail, matchStack);
        }
    }
}
