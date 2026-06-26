import {formatDay} from "./utils.js";
import {renderScores, renderWorldCupDays} from "./render-list.js";
import {renderMatchDetail} from "./render-detail.js";
import {renderLeagueDetail} from "./render-league.js";
import {fetchLeagueDetail, fetchScores, fetchWorldCup, loadMatchApiDetail} from "./api.js";

const searchInput = document.querySelector("#global-search");
const matchStack = document.querySelector("#match-stack");
const dateLabel = document.querySelector("#date-label");
const filterChips = Array.from(document.querySelectorAll(".filter-chip"));

let dayOffset = 0;
let allCollapsed = false;
let activeRequestId = 0;
let activeDetailRequestId = 0;
let scoreMode = "world-cup";
let currentLeagues = [];
let currentWorldCupDays = [];
let currentLeagueDetail = null;
let currentLeagueTab = "table";

const leagueDetailCache = new Map();
const leagueSidebar = document.querySelector(".leagues-panel");

const matchDetailByKey = new Map();

const emptyState = document.createElement("div");
emptyState.className = "no-results";
emptyState.textContent = "No leagues match that search";

function getLeagueCards() {
    return Array.from(document.querySelectorAll("[data-league]"));
}

function updateDate() {
    if (scoreMode === "world-cup") {
        dateLabel.textContent = "Today";
        return;
    }

    dateLabel.textContent = scoreMode === "recent" ? "Recent" : formatDay(dayOffset);
}

function setActiveFilter(filter) {
    filterChips.forEach((item) => {
        item.classList.toggle("is-active", item.dataset.filter === filter);
    });
}

function refreshHideAllButton() {
    const hideAllButton = document.querySelector("#hide-all");

    if (!hideAllButton) return;

    hideAllButton.querySelector("span").textContent = allCollapsed ? "Show all" : "Hide all";
    hideAllButton.querySelector("svg").style.transform = allCollapsed ? "rotate(180deg)" : "";
}

function applySearch() {
    if (document.body.classList.contains("is-match-detail")) {
        return;
    }

    const query = searchInput.value.trim().toLowerCase();
    let visibleCount = 0;

    getLeagueCards().forEach((card) => {
        const matchesQuery = card.dataset.title.toLowerCase().includes(query);
        card.classList.toggle("is-hidden", !matchesQuery);
        if (matchesQuery) visibleCount += 1;
    });

    if (visibleCount === 0) {
        if (!matchStack.contains(emptyState)) matchStack.append(emptyState);
    } else {
        emptyState.remove();
    }
}

function showScoreList() {
    activeDetailRequestId += 1;
    document.body.classList.remove("is-match-detail", "is-league-detail");

    if (scoreMode === "world-cup") {
        renderWorldCupDays(currentWorldCupDays, matchStack, matchDetailByKey);
    } else {
        renderScores(currentLeagues, matchStack, matchDetailByKey);
    }

    allCollapsed = false;
    applySearch();
}

function showMatchDetail(detail) {
    const requestId = activeDetailRequestId + 1;
    activeDetailRequestId = requestId;

    document.body.classList.remove("is-league-detail");
    renderMatchDetail(detail, matchStack);
    loadMatchApiDetail(
        detail,
        matchStack,
        () => requestId === activeDetailRequestId && document.body.classList.contains("is-match-detail"),
    );
    window.scrollTo({top: 0, behavior: "smooth"});
}

function showLeagueDetail(tab) {
    if (!currentLeagueDetail) {
        return;
    }

    currentLeagueTab = tab;
    document.body.classList.remove("is-match-detail");
    renderLeagueDetail(currentLeagueDetail, matchStack, currentLeagueTab);
    window.scrollTo({top: 0, behavior: "smooth"});
}

async function loadLeagueDetail(slug) {
    const requestId = activeDetailRequestId + 1;
    activeDetailRequestId = requestId;
    currentLeagueTab = "table";

    if (leagueDetailCache.has(slug)) {
        currentLeagueDetail = leagueDetailCache.get(slug);
        showLeagueDetail(currentLeagueTab);
        return;
    }

    matchStack.classList.add("is-loading");

    try {
        const data = await fetchLeagueDetail(slug);

        if (requestId !== activeDetailRequestId) {
            return;
        }

        leagueDetailCache.set(slug, data);
        currentLeagueDetail = data;
        showLeagueDetail(currentLeagueTab);
    } catch (error) {
        console.error(error);
    } finally {
        if (requestId === activeDetailRequestId) {
            matchStack.classList.remove("is-loading");
        }
    }
}

async function loadWorldCup() {
    const requestId = activeRequestId + 1;
    activeRequestId = requestId;
    matchStack.classList.add("is-loading");

    try {
        const data = await fetchWorldCup();

        if (requestId !== activeRequestId) {
            return;
        }

        currentWorldCupDays = data.days || [];
        document.body.classList.remove("is-match-detail");
        renderWorldCupDays(currentWorldCupDays, matchStack, matchDetailByKey);
        allCollapsed = false;
        applySearch();
    } catch (error) {
        console.error(error);
    } finally {
        if (requestId === activeRequestId) {
            matchStack.classList.remove("is-loading");
        }
    }
}

async function loadScores() {
    const requestId = activeRequestId + 1;
    activeRequestId = requestId;
    matchStack.classList.add("is-loading");

    try {
        const data = await fetchScores({scoreMode, dayOffset});

        if (requestId !== activeRequestId) {
            return;
        }

        currentLeagues = data.leagues || [];
        document.body.classList.remove("is-match-detail");
        renderScores(currentLeagues, matchStack, matchDetailByKey);
        allCollapsed = false;
        applySearch();
    } catch (error) {
        console.error(error);
    } finally {
        if (requestId === activeRequestId) {
            matchStack.classList.remove("is-loading");
        }
    }
}

if (leagueSidebar) {
    leagueSidebar.addEventListener("click", (event) => {
        const leagueLink = event.target.closest("[data-league-slug]");

        if (!leagueLink) {
            return;
        }

        event.preventDefault();
        loadLeagueDetail(leagueLink.dataset.leagueSlug);
    });
}

document.querySelector("#prev-day").addEventListener("click", () => {
    scoreMode = "day";
    dayOffset -= 1;
    setActiveFilter("time");
    updateDate();
    loadScores();
});

document.querySelector("#next-day").addEventListener("click", () => {
    scoreMode = "day";
    dayOffset += 1;
    setActiveFilter("time");
    updateDate();
    loadScores();
});

searchInput.addEventListener("input", applySearch);

filterChips.forEach((chip) => {
    chip.addEventListener("click", () => {
        const filter = chip.dataset.filter;

        setActiveFilter(filter);

        if (filter === "recent") {
            scoreMode = "world-cup";
            dayOffset = 0;
            updateDate();
            loadWorldCup();
        }
    });
});

matchStack.addEventListener("click", (event) => {
    const backButton = event.target.closest(".detail-back");
    const matchRow = event.target.closest(".match-row[data-match-key]");
    const header = event.target.closest(".league-header");
    const hideAllButton = event.target.closest("#hide-all");
    const leagueTabButton = event.target.closest("[data-league-tab]");

    if (backButton) {
        showScoreList();
        return;
    }

    if (leagueTabButton) {
        showLeagueDetail(leagueTabButton.dataset.leagueTab);
        return;
    }

    if (matchRow) {
        const detail = matchDetailByKey.get(matchRow.dataset.matchKey);

        if (detail) {
            event.preventDefault();
            showMatchDetail(detail);
        }

        return;
    }

    if (header) {
        const card = header.closest(".match-card");
        const collapsed = card.classList.toggle("is-collapsed");
        header.setAttribute("aria-expanded", String(!collapsed));
    }

    if (hideAllButton) {
        allCollapsed = !allCollapsed;

        getLeagueCards().forEach((card) => {
            card.classList.toggle("is-collapsed", allCollapsed);
            const cardHeader = card.querySelector(".league-header");
            cardHeader.setAttribute("aria-expanded", String(!allCollapsed));
        });

        refreshHideAllButton();
    }
});

updateDate();
loadWorldCup();