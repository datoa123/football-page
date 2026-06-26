import {formatDateParam, getDateForOffset} from "./utils.js";
import {renderMatchDetail} from "./render-detail.js";

const matchApiDetailCache = new Map();

export async function fetchWorldCup() {
    const response = await fetch("/api/world-cup", {
        headers: {Accept: "application/json"},
    });

    if (!response.ok) {
        throw new Error(`World Cup request failed with ${response.status}`);
    }

    return response.json();
}

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

export async function fetchLeagueDetail(slug) {
    const response = await fetch(`/api/league/${encodeURIComponent(slug)}`, {
        headers: {Accept: "application/json"},
    });

    if (!response.ok) {
        throw new Error(`League detail request failed with ${response.status}`);
    }

    return response.json();
}

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