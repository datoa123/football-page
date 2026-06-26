import {formatRating, getRatingTone, normalizeLookupValue} from "./utils.js";

const homeLineupFallback = [
    {number: 24, name: "Freese", rating: "6.7", x: 8, y: 66, tone: "orange"},
    {number: 13, name: "Ream", rating: "7.0", x: 19, y: 38, tone: "green", captain: true},
    {number: 3, name: "Richards", rating: "7.6", x: 19, y: 64, tone: "blue"},
    {number: 5, name: "Robinson", rating: "7.5", x: 32, y: 28, tone: "green", card: true, event: "80'"},
    {number: 17, name: "Tillman", rating: "7.1", x: 32, y: 49, tone: "green"},
    {number: 4, name: "Adams", rating: "7.5", x: 32, y: 64, tone: "green"},
    {number: 20, name: "Balogun", rating: "6.3", x: 45, y: 49, tone: "orange", card: true},
];

const awayLineupFallback = [
    {number: 18, name: "Beach", rating: "5.9", x: 93, y: 66, tone: "red"},
    {number: 4, name: "Italiano", rating: "6.5", x: 82, y: 28, tone: "orange", card: true},
    {number: 13, name: "O'Neill", rating: "7.1", x: 72, y: 54, tone: "green"},
    {number: 3, name: "Circati", rating: "6.9", x: 82, y: 49, tone: "orange", card: true},
    {number: 19, name: "Souttar", rating: "6.0", x: 82, y: 66, tone: "orange", captain: true},
    {number: 7, name: "Leckie", rating: "6.3", x: 66, y: 28, tone: "orange", event: "61'"},
    {number: 9, name: "Toure", rating: "6.1", x: 58, y: 66, tone: "orange", event: "46'"},
];

export function getApiDetail(detail) {
    return detail.apiDetail || {};
}

function getSideTeamId(match, side) {
    return side === "home" ? match.homeId : match.awayId;
}

function getSideTeamName(match, side) {
    return side === "home" ? match.home : match.away;
}

export function isSameTeamRecord(record, match, side) {
    const sideId = getSideTeamId(match, side);

    if (sideId !== null && sideId !== undefined && record.teamId !== null && record.teamId !== undefined) {
        return Number(record.teamId) === Number(sideId);
    }

    return normalizeLookupValue(record.teamName) === normalizeLookupValue(getSideTeamName(match, side));
}

function findTeamRecord(records, match, side) {
    if (!Array.isArray(records) || records.length === 0) {
        return null;
    }

    const matchedRecord = records.find((record) => isSameTeamRecord(record, match, side));

    if (matchedRecord) {
        return matchedRecord;
    }

    return side === "home" ? records[0] : records[1] || null;
}

export function getLineupForSide(detail, side) {
    return findTeamRecord(getApiDetail(detail).lineups || [], detail.match, side);
}

export function getPlayerStatsForSide(detail, side) {
    return findTeamRecord(getApiDetail(detail).playerStats || [], detail.match, side);
}

export function getEventsForSide(detail, side) {
    const events = getApiDetail(detail).events || [];

    return events.filter((event) => isSameTeamRecord(event, detail.match, side));
}

export function isGoalEvent(event) {
    return normalizeLookupValue(event.type) === "goal" && !normalizeLookupValue(event.detail).includes("missed");
}

export function isCardEvent(event) {
    return normalizeLookupValue(event.type) === "card";
}

export function isSubstitutionEvent(event) {
    return normalizeLookupValue(event.type) === "subst";
}

function eventHasAssist(event, player) {
    if (event.assistId !== null && event.assistId !== undefined && player.id !== null && player.id !== undefined) {
        return Number(event.assistId) === Number(player.id);
    }

    return Boolean(event.assistName) && normalizeLookupValue(event.assistName) === normalizeLookupValue(player.name);
}

export function getCardColor(event) {
    return normalizeLookupValue(event.detail).includes("red") ? "red" : "yellow";
}

function eventMatchesPlayer(event, player) {
    if (event.playerId !== null && event.playerId !== undefined && player.id !== null && player.id !== undefined) {
        return Number(event.playerId) === Number(player.id);
    }

    return normalizeLookupValue(event.playerName) === normalizeLookupValue(player.name);
}

function getPlayerEvents(player, events) {
    return events.filter((event) => eventMatchesPlayer(event, player));
}

function getPlayerAssistEvents(player, events) {
    return events.filter((event) => isGoalEvent(event) && eventHasAssist(event, player));
}

export function getTeamAverageRating(detail, side, fallback = "-") {
    const ratings = (getPlayerStatsForSide(detail, side)?.players || [])
        .map((player) => Number.parseFloat(player.rating))
        .filter(Number.isFinite);

    if (ratings.length === 0) {
        return fallback;
    }

    const average = ratings.reduce((total, rating) => total + rating, 0) / ratings.length;

    return average.toFixed(1);
}

export function formatGoalEvent(event) {
    const detail = normalizeLookupValue(event.detail);
    const suffix = detail.includes("own goal") ? " (OG)" : detail.includes("penalty") ? " (P)" : "";
    const label = [event.playerName || "Goal", event.minute].filter(Boolean).join(" ");

    return `${label}${suffix}`;
}

function createPlayerStatsLookup(teamStats) {
    const lookup = {
        byId: new Map(),
        byName: new Map(),
    };

    (teamStats?.players || []).forEach((player) => {
        if (player.id !== null && player.id !== undefined) {
            lookup.byId.set(Number(player.id), player);
        }

        lookup.byName.set(normalizeLookupValue(player.name), player);
    });

    return lookup;
}

function getPlayerStats(player, lookup) {
    if (player.id !== null && player.id !== undefined && lookup.byId.has(Number(player.id))) {
        return lookup.byId.get(Number(player.id));
    }

    return lookup.byName.get(normalizeLookupValue(player.name)) || null;
}

function getGridParts(grid) {
    const match = String(grid || "").match(/^(\d+):(\d+)$/);

    if (!match) {
        return null;
    }

    return {
        row: Number.parseInt(match[1], 10),
        slot: Number.parseInt(match[2], 10),
    };
}

function getLineupGridMeta(players) {
    const rowCounts = new Map();
    let maxRow = 1;

    players.forEach((player) => {
        const gridParts = getGridParts(player.grid);

        if (!gridParts) {
            return;
        }

        maxRow = Math.max(maxRow, gridParts.row);
        rowCounts.set(gridParts.row, Math.max(rowCounts.get(gridParts.row) || 0, gridParts.slot));
    });

    return {maxRow, rowCounts};
}

function getFallbackPitchPosition(index, side) {
    const homePositions = [
        {x: 8, y: 50},
        {x: 19, y: 22},
        {x: 19, y: 40},
        {x: 19, y: 60},
        {x: 19, y: 78},
        {x: 32, y: 30},
        {x: 32, y: 50},
        {x: 32, y: 70},
        {x: 44, y: 28},
        {x: 44, y: 50},
        {x: 44, y: 72},
    ];
    const fallback = homePositions[index] || {x: 32, y: 50};

    return side === "home" ? fallback : {x: 100 - fallback.x, y: fallback.y};
}

function getLineupPitchPosition(player, side, meta, index) {
    const gridParts = getGridParts(player.grid);

    if (!gridParts) {
        return getFallbackPitchPosition(index, side);
    }

    const maxRow = Math.max(meta.maxRow, 1);
    const rowProgress = maxRow === 1 ? 0 : (gridParts.row - 1) / (maxRow - 1);
    const xStart = side === "home" ? 8 : 92;
    const xEnd = side === "home" ? 45 : 55;
    const rowCount = Math.max(meta.rowCounts.get(gridParts.row) || 1, 1);
    const y = rowCount === 1 ? 50 : 18 + ((gridParts.slot - 1) / (rowCount - 1)) * 64;

    return {
        x: xStart + (xEnd - xStart) * rowProgress,
        y,
    };
}

function buildPlayerCards(playerStats, playerEvents) {
    const eventCards = playerEvents
        .filter(isCardEvent)
        .map((event) => ({
            color: getCardColor(event),
            minute: event.minute,
        }));

    if (eventCards.length > 0) {
        return eventCards.slice(0, 2);
    }

    const cards = [];
    const yellowCards = Number(playerStats?.cards?.yellow || 0);
    const redCards = Number(playerStats?.cards?.red || 0);

    for (let index = 0; index < Math.min(yellowCards, 2); index += 1) {
        cards.push({color: "yellow"});
    }

    for (let index = 0; index < Math.min(redCards, 1); index += 1) {
        cards.push({color: "red"});
    }

    return cards.slice(0, 2);
}

export function getMatchHighestRating(detail) {
    const allRatings = ["home", "away"].flatMap((side) =>
        (getPlayerStatsForSide(detail, side)?.players || [])
            .map((player) => Number.parseFloat(player.rating))
            .filter(Number.isFinite),
    );

    return allRatings.length > 0 ? Math.max(...allRatings) : null;
}

function getPrimaryPlayerMinute(playerEvents, playerAssistEvents) {
    const event =
        playerEvents.find(isGoalEvent) ||
        playerAssistEvents.find(Boolean) ||
        playerEvents.find(isSubstitutionEvent) ||
        playerEvents.find(isCardEvent);

    return event?.minute || "";
}

export function buildLineupPlayers(detail, side, highestRating) {
    const lineup = getLineupForSide(detail, side);

    if (!lineup?.startXI?.length) {
        return detail.match.id ? [] : side === "home" ? homeLineupFallback : awayLineupFallback;
    }

    const statsLookup = createPlayerStatsLookup(getPlayerStatsForSide(detail, side));
    const teamEvents = getEventsForSide(detail, side);
    const gridMeta = getLineupGridMeta(lineup.startXI);

    return lineup.startXI.slice(0, 11).map((lineupPlayer, index) => {
        const playerStats = getPlayerStats(lineupPlayer, statsLookup);
        const name = lineupPlayer.name || playerStats?.name || "Player";
        const player = {
            ...lineupPlayer,
            id: lineupPlayer.id ?? playerStats?.id,
            name,
            number: lineupPlayer.number ?? playerStats?.number ?? "",
        };
        const playerEvents = getPlayerEvents(player, teamEvents);
        const playerAssistEvents = getPlayerAssistEvents(player, teamEvents);
        const rating = formatRating(playerStats?.rating);
        const position = getLineupPitchPosition(player, side, gridMeta, index);

        return {
            ...player,
            rating,
            tone: getRatingTone(rating, highestRating),
            photo: playerStats?.photo || "",
            x: position.x,
            y: position.y,
            event: getPrimaryPlayerMinute(playerEvents, playerAssistEvents),
            cards: buildPlayerCards(playerStats, playerEvents),
            captain: Boolean(playerStats?.captain),
            scoredGoal: playerEvents.some(isGoalEvent),
            gotAssist: playerAssistEvents.length > 0,
            substitutedOff: playerEvents.some(isSubstitutionEvent),
        };
    });
}
