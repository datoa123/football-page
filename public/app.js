import {formatDay} from "./utils.js";
import {renderScores} from "./render-list.js";
import {renderMatchDetail} from "./render-detail.js";
import {fetchScores, loadMatchApiDetail} from "./api.js";

const searchInput = document.querySelector("#global-search");
const matchStack = document.querySelector("#match-stack");
const dateLabel = document.querySelector("#date-label");
const filterChips = Array.from(document.querySelectorAll(".filter-chip"));

// --- shared state -----------------------------------------------------
let dayOffset = 0;
let allCollapsed = false;
let activeRequestId = 0;
let activeDetailRequestId = 0;
let scoreMode = "recent";
let currentLeagues = [];

// Maps "leagueIndex:groupIndex:matchIndex" -> { match, league, group } so a
// click on a match row can look up the full object behind it.
const matchDetailByKey = new Map();

const emptyState = document.createElement("div");
emptyState.className = "no-results";
emptyState.textContent = "No leagues match that search";

// --- small DOM helpers that don't belong in a rendering module --------

function getLeagueCards() {
    return Array.from(document.querySelectorAll("[data-league]"));
}

function updateDate() {
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

// --- view switching -----------------------------------------------------

function showScoreList() {
    activeDetailRequestId += 1;
    document.body.classList.remove("is-match-detail");
    renderScores(currentLeagues, matchStack, matchDetailByKey);
    allCollapsed = false;
    applySearch();
}

function showMatchDetail(detail) {
    const requestId = activeDetailRequestId + 1;
    activeDetailRequestId = requestId;

    renderMatchDetail(detail, matchStack);
    loadMatchApiDetail(
        detail,
        matchStack,
        () => requestId === activeDetailRequestId && document.body.classList.contains("is-match-detail"),
    );
    window.scrollTo({top: 0, behavior: "smooth"});
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

// --- event wiring -----------------------------------------------------

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
            scoreMode = "recent";
            dayOffset = 0;
            updateDate();
            loadScores();
        }
    });
});

matchStack.addEventListener("click", (event) => {
    const backButton = event.target.closest(".detail-back");
    const matchRow = event.target.closest(".match-row[data-match-key]");
    const header = event.target.closest(".league-header");
    const hideAllButton = event.target.closest("#hide-all");

    if (backButton) {
        showScoreList();
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

// --- init ---------------------------------------------------------------

updateDate();
loadScores();
