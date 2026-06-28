const express = require("express");
const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, ".env");

if (fs.existsSync(envPath) && typeof process.loadEnvFile === "function") {
    process.loadEnvFile(envPath);
}

const app = express();
const port = Number.parseInt(process.env.PORT || "3000", 10);

const API_FOOTBALL_BASE_URL = "https://v3.football.api-sports.io";
const apiFootballKey = process.env.API_FOOTBALL_KEY || process.env.APISPORTS_KEY || "";
const defaultApiFootballLeagueIds = [1, 2, 3, 39, 61, 78, 88, 135, 140];
const WORLD_CUP_LEAGUE_ID = 1;
const WORLD_CUP_TIMEZONE = process.env.API_FOOTBALL_TIMEZONE || "Asia/Tbilisi";
const apiFootballRecentStatuses = "FT-AET-PEN";
const defaultRecentDays = 7;
const defaultRecentLimit = 40;
const apiFootballCacheTtlMs = 60 * 1000;
const apiFootballCache = new Map();
const finishedFixtureStatuses = new Set(["FT", "AET", "PEN"]);

const leagueImages = {
    "FIFA World Cup": "/assets/world-cup.png",
    "Premier League": "/assets/premier-league.png",
    "Champions League": "/assets/champions-league.png",
    LaLiga: "/assets/laliga.png",
    Bundesliga: "/assets/bundesliga.png",
    "Serie A": "/assets/serie-a.png",
    "Ligue 1": "/assets/ligue-1.png",
    "Europa League": "/assets/europa-league.png",
    Eredivisie: "/assets/eredivisie.png",
};

const apiFootballLeagueNames = {
    1: "FIFA World Cup",
    2: "Champions League",
    3: "Europa League",
    39: "Premier League",
    61: "Ligue 1",
    78: "Bundesliga",
    88: "Eredivisie",
    135: "Serie A",
    140: "LaLiga",
};

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));

const pageData = {
    title: "PitchLive - Football Scores",
    apiConfigured: Boolean(apiFootballKey),
    topLeagues: [
        { name: "FIFA World Cup", slug: "world-cup", icon: "trophy", image: leagueImages["FIFA World Cup"] },
        { name: "Premier League", slug: "premier-league", icon: "lion", image: leagueImages["Premier League"] },
        { name: "Champions League", slug: "champions-league", icon: "ball", image: leagueImages["Champions League"] },
        { name: "LaLiga", slug: "laliga", icon: "laliga", image: leagueImages.LaLiga },
        { name: "Bundesliga", slug: "bundesliga", icon: "bundesliga", image: leagueImages.Bundesliga },
        { name: "Serie A", slug: "serie-a", icon: "seriea", image: leagueImages["Serie A"] },
        { name: "Ligue 1", slug: "ligue-1", icon: "ligue1", image: leagueImages["Ligue 1"] },
        { name: "Europa League", slug: "europa-league", icon: "europa", image: leagueImages["Europa League"] },
        { name: "Eredivisie", slug: "eredivisie", icon: "eredivisie", image: leagueImages.Eredivisie },
    ],
    transfers: [
        {
            name: "Jan Paul van Hecke",
            value: "EUR 60M",
            avatar: "avatar--one",
            clubs: ["mini-blue", "mini-navy"],
        },
        {
            name: "Victor Munoz",
            value: "EUR 40M",
            avatar: "avatar--two",
            clubs: ["mini-yellow", "mini-red"],
        },
        {
            name: "Afonso Moreira",
            value: "EUR 29.5M",
            avatar: "avatar--three",
            clubs: ["mini-violet", "mini-maroon"],
        },
    ],
};

function parseLeagueIds() {
    const rawLeagueIds = process.env.API_FOOTBALL_LEAGUES;

    if (!rawLeagueIds) {
        return defaultApiFootballLeagueIds;
    }

    const parsed = rawLeagueIds
        .split(",")
        .map((value) => Number.parseInt(value.trim(), 10))
        .filter(Number.isInteger);

    return parsed.length > 0 ? parsed : defaultApiFootballLeagueIds;
}

function isValidDate(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function formatDateParam(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function formatDateKeyInTimezone(date, timeZone) {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(date);

    const lookup = {};
    parts.forEach((part) => {
        lookup[part.type] = part.value;
    });

    return `${lookup.year}-${lookup.month}-${lookup.day}`;
}

function getTodayDate() {
    return formatDateParam(new Date());
}

function addDays(date, days) {
    return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function parseBoundedInteger(value, fallback, min, max) {
    const parsed = Number.parseInt(value, 10);

    if (!Number.isInteger(parsed)) {
        return fallback;
    }

    return Math.min(Math.max(parsed, min), max);
}

function getRecentDateRange(days) {
    const toDate = new Date();
    const fromDate = addDays(toDate, -(days - 1));

    return {
        from: formatDateParam(fromDate),
        to: formatDateParam(toDate),
    };
}

function formatKickoffTime(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "TBD";
    }

    return new Intl.DateTimeFormat("en", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    }).format(date);
}

function formatGroupDate(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "Recent";
    }

    return new Intl.DateTimeFormat("en", {
        weekday: "short",
        month: "short",
        day: "numeric",
    }).format(date);
}

function getFixtureTimestamp(fixture) {
    if (Number.isFinite(fixture.fixture?.timestamp)) {
        return fixture.fixture.timestamp * 1000;
    }

    const date = new Date(fixture.fixture?.date);

    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function normalizeStatus(fixture) {
    const status = fixture.fixture?.status || {};
    const short = status.short || "NS";
    const elapsed = status.elapsed;
    const liveStatuses = new Set(["1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT", "LIVE"]);

    if (liveStatuses.has(short)) {
        return {
            label: elapsed ? `${elapsed}'` : short,
            statusClass: "live",
            rowClass: "is-live",
            isUpcoming: false,
            isLive: true,
        };
    }

    if (short === "NS" || short === "TBD") {
        return {
            label: formatKickoffTime(fixture.fixture?.date),
            isUpcoming: true,
            isLive: false,
        };
    }

    return {
        label: short,
        isUpcoming: false,
        isLive: false,
    };
}

function normalizeTeamName(team) {
    return team?.name || "TBD";
}

function slugifyTeamName(teamName) {
    return String(teamName || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function getTeamLogoPath(teamName, folder) {
    const slug = slugifyTeamName(teamName);

    return slug ? `/${folder}/${slug}.png` : null;
}

function getEuropaLeagueTeamLogo(teamName) {
    return getTeamLogoPath(teamName, "europa-league");
}

function normalizeApiFixture(fixture) {
    const status = normalizeStatus(fixture);
    const home = normalizeTeamName(fixture.teams?.home);
    const away = normalizeTeamName(fixture.teams?.away);
    const homeScore = fixture.goals?.home ?? fixture.score?.fulltime?.home ?? null;
    const awayScore = fixture.goals?.away ?? fixture.score?.fulltime?.away ?? null;

    return {
        id: fixture.fixture?.id,
        status: status.label,
        statusClass: status.statusClass,
        rowClass: status.rowClass,
        homeId: fixture.teams?.home?.id,
        awayId: fixture.teams?.away?.id,
        home,
        away,
        homeScore,
        awayScore,
        fixtureText: status.isUpcoming || homeScore === null || awayScore === null ? "vs" : undefined,
        homeLogo: fixture.teams?.home?.logo,
        awayLogo: fixture.teams?.away?.logo,
        round: fixture.league?.round,
        kickoffAt: fixture.fixture?.date,
        venue: fixture.fixture?.venue?.name,
        referee: fixture.fixture?.referee,
        icons: status.isLive ? ["dot"] : [],
    };
}

function getLeagueName(league) {
    if (apiFootballLeagueNames[league.id]) {
        return apiFootballLeagueNames[league.id];
    }

    return league.country && league.country !== "World" ? `${league.country} - ${league.name}` : league.name;
}

function getLocalLeagueImage(name) {
    return leagueImages[name] || leagueImages[name.replace(/^.* - /, "")];
}

function isConfiguredLeagueFixture(fixture) {
    const configuredLeagueIds = parseLeagueIds();
    const configuredLeagueIdSet = new Set(configuredLeagueIds);

    return configuredLeagueIdSet.size === 0 || configuredLeagueIdSet.has(fixture.league?.id);
}

function normalizeApiLeagues(fixtures, options = {}) {
    const configuredLeagueIds = parseLeagueIds();
    const configuredLeagueIdSet = new Set(configuredLeagueIds);
    const leaguesById = new Map();

    fixtures.forEach((fixture) => {
        const league = fixture.league || {};

        if (configuredLeagueIdSet.size > 0 && !configuredLeagueIdSet.has(league.id)) {
            return;
        }

        if (!leaguesById.has(league.id)) {
            const name = getLeagueName(league);

            leaguesById.set(league.id, {
                id: league.id,
                name,
                image: getLocalLeagueImage(name) || league.logo,
                countryFlag: league.flag,
                searchParts: new Set([name, league.country, league.round].filter(Boolean)),
                groupsByName: new Map(),
            });
        }

        const normalizedLeague = leaguesById.get(league.id);
        const groupName = options.groupByDate ? formatGroupDate(fixture.fixture?.date) : league.round || "";
        const groupKey = groupName || "default";

        if (!normalizedLeague.groupsByName.has(groupKey)) {
            normalizedLeague.groupsByName.set(groupKey, {
                name: groupName,
                matches: [],
            });
        }

        const match = normalizeApiFixture(fixture);
        normalizedLeague.groupsByName.get(groupKey).matches.push(match);
        normalizedLeague.searchParts.add(match.home);
        normalizedLeague.searchParts.add(match.away);
    });

    return Array.from(leaguesById.values())
        .sort((a, b) => {
            const aIndex = configuredLeagueIds.indexOf(a.id);
            const bIndex = configuredLeagueIds.indexOf(b.id);

            if (aIndex === -1 && bIndex === -1) return a.name.localeCompare(b.name);
            if (aIndex === -1) return 1;
            if (bIndex === -1) return -1;

            return aIndex - bIndex;
        })
        .map((league, index) => ({
            id: league.id,
            name: league.name,
            image: league.image,
            countryFlag: league.countryFlag,
            className: index === 0 ? "featured-league" : "compact-league",
            searchTitle: Array.from(league.searchParts).join(" "),
            groups: Array.from(league.groupsByName.values()),
        }));
}

async function fetchApiFootballScores(date) {
    const fixtures = await fetchApiFootballFixtures({ date });

    return normalizeApiLeagues(fixtures);
}

async function fetchApiFootballResource(resourcePath, params, options = {}) {
    const requestParams = new URLSearchParams(params);
    const timezone = process.env.API_FOOTBALL_TIMEZONE;

    if (options.includeTimezone && timezone) {
        requestParams.set("timezone", timezone);
    }

    const requestUrl = `${API_FOOTBALL_BASE_URL}${resourcePath}?${requestParams.toString()}`;
    const cached = apiFootballCache.get(requestUrl);

    if (cached && cached.expiresAt > Date.now()) {
        return cached.response;
    }

    const response = await fetch(requestUrl, {
        headers: {
            "x-apisports-key": apiFootballKey,
        },
    });

    if (!response.ok) {
        throw new Error(`API-Football responded with ${response.status}`);
    }

    const payload = await response.json();

    if (payload.errors && Object.keys(payload.errors).length > 0) {
        console.error("API-Football error payload for", requestUrl, JSON.stringify(payload.errors));
        throw new Error(`API-Football returned an error payload: ${JSON.stringify(payload.errors)}`);
    }

    const responseData = payload.response || [];
    apiFootballCache.set(requestUrl, {
        expiresAt: Date.now() + apiFootballCacheTtlMs,
        response: responseData,
    });

    return responseData;
}

async function fetchApiFootballFixtures(params) {
    return fetchApiFootballResource("/fixtures", params, { includeTimezone: true });
}

function isFinishedFixture(fixture) {
    return finishedFixtureStatuses.has(fixture.fixture?.status?.short);
}

async function fetchApiFootballRecentMatches({ days, limit }) {
    const range = getRecentDateRange(days);
    const fixtures = await fetchApiFootballFixtures({
        from: range.from,
        to: range.to,
        status: apiFootballRecentStatuses,
    });

    const recentFixtures = fixtures
        .filter(isFinishedFixture)
        .filter(isConfiguredLeagueFixture)
        .sort((a, b) => getFixtureTimestamp(b) - getFixtureTimestamp(a))
        .slice(0, limit);

    return normalizeApiLeagues(recentFixtures, { groupByDate: true });
}

function formatEventMinute(time = {}) {
    if (!Number.isInteger(time.elapsed)) {
        return "";
    }

    return time.extra ? `${time.elapsed}+${time.extra}'` : `${time.elapsed}'`;
}

function normalizeFixtureEvent(event) {
    return {
        elapsed: event.time?.elapsed ?? null,
        extra: event.time?.extra ?? null,
        minute: formatEventMinute(event.time),
        teamId: event.team?.id,
        teamName: event.team?.name,
        playerId: event.player?.id,
        playerName: event.player?.name,
        assistId: event.assist?.id,
        assistName: event.assist?.name,
        type: event.type || "",
        detail: event.detail || "",
        comments: event.comments || "",
    };
}

function normalizeLineupPlayer(entry) {
    const player = entry.player || {};

    return {
        id: player.id,
        name: player.name || "Player",
        number: player.number ?? null,
        position: player.pos || "",
        grid: player.grid || "",
    };
}

function normalizeFixtureLineup(lineup) {
    return {
        teamId: lineup.team?.id,
        teamName: lineup.team?.name,
        teamLogo: lineup.team?.logo,
        formation: lineup.formation || "",
        coach: lineup.coach?.name || "",
        startXI: Array.isArray(lineup.startXI) ? lineup.startXI.map(normalizeLineupPlayer) : [],
        substitutes: Array.isArray(lineup.substitutes) ? lineup.substitutes.map(normalizeLineupPlayer) : [],
    };
}

function normalizeFixturePlayer(entry) {
    const player = entry.player || {};
    const statistics = Array.isArray(entry.statistics) ? entry.statistics[0] || {} : {};

    return {
        id: player.id,
        name: player.name || "Player",
        photo: player.photo,
        number: statistics.games?.number ?? null,
        position: statistics.games?.position || "",
        rating: statistics.games?.rating || "",
        captain: Boolean(statistics.games?.captain),
        cards: {
            yellow: statistics.cards?.yellow ?? 0,
            red: statistics.cards?.red ?? 0,
        },
        goals: {
            total: statistics.goals?.total ?? 0,
            assists: statistics.goals?.assists ?? 0,
        },
    };
}

function normalizeFixturePlayerTeam(teamStats) {
    return {
        teamId: teamStats.team?.id,
        teamName: teamStats.team?.name,
        teamLogo: teamStats.team?.logo,
        players: Array.isArray(teamStats.players) ? teamStats.players.map(normalizeFixturePlayer) : [],
    };
}

async function fetchOptionalApiFootballResource(resourcePath, params) {
    try {
        return await fetchApiFootballResource(resourcePath, params);
    } catch (error) {
        console.error(error);
        return [];
    }
}

async function fetchApiFootballMatchDetails(fixtureId) {
    const [events, lineups, players] = await Promise.all([
        fetchOptionalApiFootballResource("/fixtures/events", { fixture: fixtureId }),
        fetchOptionalApiFootballResource("/fixtures/lineups", { fixture: fixtureId }),
        fetchOptionalApiFootballResource("/fixtures/players", { fixture: fixtureId }),
    ]);

    return {
        source: "api-football",
        providerConfigured: true,
        fixtureId,
        events: events.map(normalizeFixtureEvent),
        lineups: lineups.map(normalizeFixtureLineup),
        playerStats: players.map(normalizeFixturePlayerTeam),
    };
}

function getEmptyLeague(emptyText = "No matches found for this date") {
    return [
        {
            name: "Matches",
            icon: "ball",
            className: "compact-league",
            searchTitle: "No matches found",
            emptyText,
        },
    ];
}

function getWorldCupDayBuckets() {
    const today = new Date();
    const yesterday = addDays(today, -1);
    const tomorrow = addDays(today, 1);

    return [
        { key: "yesterday", label: "Yesterday", date: formatDateKeyInTimezone(yesterday, WORLD_CUP_TIMEZONE) },
        { key: "today", label: "Today", date: formatDateKeyInTimezone(today, WORLD_CUP_TIMEZONE) },
        { key: "tomorrow", label: "Tomorrow", date: formatDateKeyInTimezone(tomorrow, WORLD_CUP_TIMEZONE) },
    ];
}

async function fetchWorldCupFixturesForBucket(bucket) {
    try {
        const fixturesForDate = await fetchApiFootballFixtures({ date: bucket.date });

        return fixturesForDate
            .filter((fixture) => fixture.league?.id === WORLD_CUP_LEAGUE_ID)
            .sort((a, b) => getFixtureTimestamp(a) - getFixtureTimestamp(b));
    } catch (error) {
        console.error(`Unable to load World Cup fixtures for ${bucket.date} (${bucket.label})`, error);
        return [];
    }
}

async function fetchWorldCupFixtures(buckets) {
    const fixturesByBucketDate = await Promise.all(buckets.map(fetchWorldCupFixturesForBucket));

    return buckets.map((bucket, index) => ({
        ...bucket,
        fixtures: fixturesByBucketDate[index],
    }));
}

function groupWorldCupFixturesByDay(bucketsWithFixtures) {
    return bucketsWithFixtures.map((bucket) => ({
        key: bucket.key,
        label: bucket.label,
        date: bucket.date,
        matches: bucket.fixtures.map(normalizeApiFixture),
    }));
}

function getFallbackWorldCupDays(buckets) {
    return buckets.map((bucket) => ({
        key: bucket.key,
        label: bucket.label,
        date: bucket.date,
        matches: [],
    }));
}

async function getWorldCupScores() {
    const buckets = getWorldCupDayBuckets();

    if (!apiFootballKey) {
        return {
            source: "static",
            providerConfigured: false,
            mode: "world-cup",
            days: getFallbackWorldCupDays(buckets),
        };
    }

    try {
        const bucketsWithFixtures = await fetchWorldCupFixtures(buckets);

        return {
            source: "api-football",
            providerConfigured: true,
            mode: "world-cup",
            days: groupWorldCupFixturesByDay(bucketsWithFixtures),
        };
    } catch (error) {
        console.error(error);

        return {
            source: "static",
            providerConfigured: true,
            mode: "world-cup",
            error: "Unable to load World Cup scores right now",
            days: getFallbackWorldCupDays(buckets),
        };
    }
}

async function getScores(date) {
    if (!apiFootballKey) {
        return {
            source: "static",
            providerConfigured: false,
            leagues: getEmptyLeague("No API key configured"),
        };
    }

    try {
        const leagues = await fetchApiFootballScores(date);

        return {
            source: "api-football",
            providerConfigured: true,
            leagues: leagues.length > 0 ? leagues : getEmptyLeague(),
        };
    } catch (error) {
        console.error(error);

        return {
            source: "static",
            providerConfigured: true,
            error: "Unable to load live scores right now",
            leagues: getEmptyLeague("Unable to load matches for this date"),
        };
    }
}

async function getRecentScores(options = {}) {
    const days = parseBoundedInteger(options.days || process.env.API_FOOTBALL_RECENT_DAYS, defaultRecentDays, 1, 14);
    const limit = parseBoundedInteger(options.limit || process.env.API_FOOTBALL_RECENT_LIMIT, defaultRecentLimit, 1, 80);
    const range = getRecentDateRange(days);

    if (!apiFootballKey) {
        return {
            source: "static",
            providerConfigured: false,
            mode: "recent",
            days,
            limit,
            ...range,
            leagues: getEmptyLeague("No API key configured"),
        };
    }

    try {
        const leagues = await fetchApiFootballRecentMatches({ days, limit });

        return {
            source: "api-football",
            providerConfigured: true,
            mode: "recent",
            days,
            limit,
            ...range,
            leagues: leagues.length > 0 ? leagues : getEmptyLeague("No recent finished matches found"),
        };
    } catch (error) {
        console.error(error);

        return {
            source: "static",
            providerConfigured: true,
            mode: "recent",
            days,
            limit,
            ...range,
            error: "Unable to load recent scores right now",
            leagues: getEmptyLeague("Unable to load recent matches right now"),
        };
    }
}

app.get("/", (req, res) => {
    res.render("index", pageData);
});

app.get("/api/scores", async (req, res) => {
    const date = isValidDate(req.query.date) ? req.query.date : getTodayDate();
    const scores = await getScores(date);

    res.json({
        date,
        generatedAt: new Date().toISOString(),
        ...scores,
    });
});

app.get("/api/world-cup", async (req, res) => {
    const scores = await getWorldCupScores();

    res.json({
        generatedAt: new Date().toISOString(),
        ...scores,
    });
});

app.get("/api/matches/:id/details", async (req, res) => {
    const fixtureId = Number.parseInt(req.params.id, 10);

    if (!Number.isInteger(fixtureId) || fixtureId <= 0) {
        res.status(400).json({
            error: "Invalid fixture id",
        });
        return;
    }

    if (!apiFootballKey) {
        res.json({
            generatedAt: new Date().toISOString(),
            source: "static",
            providerConfigured: false,
            fixtureId,
            events: [],
            lineups: [],
            playerStats: [],
        });
        return;
    }

    const details = await fetchApiFootballMatchDetails(fixtureId);

    res.json({
        generatedAt: new Date().toISOString(),
        ...details,
    });
});

app.get("/api/recent-matches", async (req, res) => {
    const scores = await getRecentScores({
        days: req.query.days,
        limit: req.query.limit,
    });

    res.json({
        generatedAt: new Date().toISOString(),
        ...scores,
    });
});

const leagueDetailSlugs = {
    "champions-league": { id: 2, name: "Champions League", region: "International" },
    "europa-league": { id: 3, name: "Europa League", region: "International" },
};

function getSampleLeagueTable(slug) {
    const teamsByLeague = {
        "champions-league": [
            ["Arsenal", 8, 8, 0, 0, "23-4", "+19", 24, ["W", "D", "D", "W", "D"]],
            ["Bayern Munich", 8, 7, 0, 1, "22-8", "+14", 21, ["W", "W", "W", "L", "D"]],
            ["Liverpool", 8, 6, 0, 2, "20-8", "+12", 18, ["W", "L", "W", "L", "L"]],
            ["Tottenham Hotspur", 8, 5, 2, 1, "17-7", "+10", 17, ["W", "W", "W", "L", "W"]],
            ["Barcelona", 8, 5, 1, 2, "22-14", "+8", 16, ["W", "D", "W", "L", "W"]],
            ["Chelsea", 8, 5, 1, 2, "17-10", "+7", 16, ["L", "W", "W", "L", "L"]],
            ["Sporting CP", 8, 5, 1, 2, "17-11", "+6", 16, ["W", "L", "W", "L", "D"]],
            ["Manchester City", 8, 5, 1, 2, "15-9", "+6", 16, ["W", "L", "W", "L", "L"]],
            ["Real Madrid", 8, 5, 0, 3, "21-12", "+9", 15, ["W", "W", "W", "L", "L"]],
            ["Inter", 8, 5, 0, 3, "15-7", "+8", 15, ["L", "L", "W", "L", "L"]],
            ["Paris Saint-Germain", 8, 4, 2, 2, "21-11", "+10", 14, ["W", "W", "W", "D", "D"]],
            ["Newcastle United", 8, 4, 2, 2, "17-7", "+10", 14, ["D", "W", "W", "D", "L"]],
            ["Juventus", 8, 3, 4, 1, "14-10", "+4", 13, ["W", "W", "D", "L", "W"]],
            ["Atletico Madrid", 8, 4, 1, 3, "17-15", "+2", 13, ["L", "W", "L", "D", "L"]],
            ["Atalanta", 8, 4, 1, 3, "10-10", "0", 13, ["L", "L", "W", "L", "L"]],
            ["Bayer Leverkusen", 8, 3, 3, 2, "13-14", "-1", 12, ["W", "W", "D", "D", "L"]],
            ["Borussia Dortmund", 8, 3, 2, 3, "19-17", "+2", 11, ["D", "L", "L", "W", "L"]],
            ["Olympiacos", 8, 3, 2, 3, "10-14", "-4", 11, ["W", "W", "W", "L", "D"]],
            ["Club Brugge", 8, 3, 1, 4, "15-17", "-2", 10, ["L", "W", "W", "D", "L"]],
            ["Galatasaray", 8, 3, 1, 4, "9-11", "-2", 10, ["W", "W", "L", "W", "D"]],
            ["Monaco", 8, 2, 4, 2, "8-14", "-6", 10, ["W", "L", "D", "D", "W"]],
            ["Qarabag FK", 8, 3, 1, 4, "13-21", "-8", 10, ["L", "W", "L", "L", "L"]],
            ["Bodo/Glimt", 8, 2, 3, 3, "14-15", "-1", 9, ["W", "W", "W", "W", "L"]],
            ["Benfica", 8, 3, 0, 5, "10-12", "-2", 9, ["W", "L", "W", "L", "L"]],
            ["Marseille", 8, 3, 0, 5, "11-14", "-3", 9, ["L", "W", "W", "L", "L"]],
            ["Pafos FC", 8, 2, 3, 3, "8-11", "-3", 9, ["W", "D", "L", "L", "W"]],
            ["Union St.Gilloise", 8, 3, 0, 5, "8-17", "-9", 9, ["L", "W", "L", "L", "W"]],
            ["PSV Eindhoven", 8, 2, 2, 4, "16-16", "0", 8, ["D", "W", "L", "L", "L"]],
            ["Athletic Club", 8, 2, 2, 4, "9-14", "-5", 8, ["L", "D", "D", "W", "L"]],
            ["Napoli", 8, 2, 2, 4, "9-15", "-6", 8, ["D", "W", "L", "D", "L"]],
            ["FC Kobenhavn", 8, 2, 2, 4, "12-21", "-9", 8, ["L", "W", "W", "D", "L"]],
            ["Ajax", 8, 2, 0, 6, "8-21", "-13", 6, ["L", "L", "W", "W", "L"]],
            ["Eintracht Frankfurt", 8, 1, 1, 6, "10-21", "-11", 4, ["D", "L", "L", "L", "L"]],
            ["Slavia Prague", 8, 0, 3, 5, "5-19", "-14", 3, ["L", "D", "L", "L", "L"]],
            ["Villarreal", 8, 0, 1, 7, "5-18", "-13", 1, ["L", "L", "L", "L", "L"]],
            ["Kairat Almaty", 8, 0, 1, 7, "7-22", "-15", 1, ["L", "L", "L", "L", "L"]],
        ],
        "europa-league": [
            ["Lyon", 8, 7, 0, 1, "18-5", "+13", 21, ["W", "W", "W", "D", "L"]],
            ["Aston Villa", 8, 7, 0, 1, "14-6", "+8", 21, ["W", "W", "L", "W", "W"]],
            ["FC Midtjylland", 8, 6, 1, 1, "18-8", "+10", 19, ["W", "D", "W", "W", "L"]],
            ["Real Betis", 8, 5, 2, 1, "13-7", "+6", 17, ["W", "L", "W", "D", "L"]],
            ["FC Porto", 8, 5, 2, 1, "13-7", "+6", 17, ["W", "W", "W", "D", "L"]],
            ["Braga", 8, 5, 2, 1, "11-5", "+6", 17, ["W", "D", "W", "W", "L"]],
            ["Freiburg", 8, 5, 2, 1, "10-4", "+6", 17, ["W", "W", "L", "W", "L"]],
            ["Roma", 8, 5, 1, 2, "13-6", "+7", 16, ["W", "D", "W", "D", "L"]],
            ["Genk", 8, 5, 1, 2, "11-7", "+4", 16, ["W", "W", "D", "W", "L"]],
            ["Bologna", 8, 4, 3, 1, "14-7", "+7", 15, ["W", "D", "W", "L", "L"]],
            ["VfB Stuttgart", 8, 5, 0, 3, "15-9", "+6", 15, ["W", "W", "L", "L", "L"]],
            ["Ferencvaros", 8, 4, 3, 1, "12-11", "+1", 15, ["L", "L", "W", "W", "L"]],
            ["Nottingham Forest", 8, 4, 2, 2, "15-7", "+8", 14, ["W", "D", "W", "W", "L"]],
            ["Viktoria Plzen", 8, 3, 5, 0, "8-3", "+5", 14, ["D", "D", "W", "D", "D"]],
            ["FK Crvena Zvezda", 8, 4, 2, 2, "7-6", "+1", 14, ["W", "W", "D", "W", "L"]],
            ["Celta Vigo", 8, 4, 1, 3, "15-11", "+4", 13, ["W", "D", "W", "L", "L"]],
            ["PAOK Thessaloniki", 8, 3, 3, 2, "17-14", "+3", 12, ["D", "W", "L", "L", "L"]],
            ["Lille", 8, 4, 0, 4, "12-9", "+3", 12, ["W", "L", "W", "L", "L"]],
            ["Fenerbahce", 8, 3, 3, 2, "10-7", "+3", 12, ["W", "L", "D", "L", "W"]],
            ["Panathinaikos", 8, 3, 3, 2, "11-9", "+2", 12, ["D", "D", "D", "W", "L"]],
            ["Celtic", 8, 3, 2, 3, "13-15", "-2", 11, ["L", "D", "W", "L", "W"]],
            ["Ludogorets Razgrad", 8, 3, 1, 4, "12-15", "-3", 10, ["D", "L", "W", "W", "L"]],
            ["Dinamo Zagreb", 8, 3, 1, 4, "12-16", "-4", 10, ["L", "W", "L", "L", "D"]],
            ["Brann", 8, 2, 3, 3, "9-11", "-2", 9, ["L", "D", "L", "L", "L"]],
            ["Young Boys", 8, 3, 0, 5, "10-16", "-6", 9, ["L", "L", "W", "L", "L"]],
            ["Sturm Graz", 8, 2, 1, 5, "5-11", "-6", 7, ["D", "L", "L", "L", "W"]],
            ["FCSB", 8, 2, 1, 5, "9-16", "-7", 7, ["L", "L", "W", "L", "D"]],
            ["Go Ahead Eagles", 8, 2, 1, 5, "6-14", "-8", 7, ["L", "L", "L", "L", "D"]],
            ["Feyenoord", 8, 2, 0, 6, "11-15", "-4", 6, ["L", "L", "L", "W", "L"]],
            ["Basel", 8, 2, 0, 6, "9-13", "-4", 6, ["W", "L", "L", "L", "L"]],
            ["Salzburg", 8, 2, 0, 6, "10-15", "-5", 6, ["W", "L", "L", "W", "L"]],
            ["Rangers", 8, 1, 1, 6, "5-14", "-9", 4, ["L", "D", "L", "W", "L"]],
            ["Nice", 8, 1, 0, 7, "7-15", "-8", 3, ["L", "L", "L", "W", "L"]],
            ["FC Utrecht", 8, 0, 1, 7, "5-15", "-10", 1, ["D", "L", "L", "L", "L"]],
            ["Malmo FF", 8, 0, 1, 7, "4-15", "-11", 1, ["L", "L", "L", "L", "L"]],
            ["Maccabi Tel Aviv", 8, 0, 1, 7, "2-22", "-20", 1, ["L", "L", "L", "L", "L"]],
        ],
    };

    const qualificationZonesBySlug = {
        "champions-league": [{ max: 8, zone: "green" }, { max: 24, zone: "blue" }],
        "europa-league": [{ max: 8, zone: "green" }, { max: 24, zone: "blue" }],
    };

    function getQualificationZone(slug, position) {
        const zones = qualificationZonesBySlug[slug] || [];
        const match = zones.find((zone) => position <= zone.max);

        return match ? match.zone : null;
    }

    const teams = teamsByLeague[slug] || [];
    const logoFoldersBySlug = {
        "champions-league": "champions-league",
        "europa-league": "europa-league",
    };

    return teams.map(([team, played, won, drawn, lost, goals, goalDiff, points, form], index) => {
        const position = index + 1;
        const logoFolder = logoFoldersBySlug[slug];

        return {
            position,
            team,
            teamLogo: logoFolder ? getTeamLogoPath(team, logoFolder) : null,
            played,
            won,
            drawn,
            lost,
            goals,
            goalDiff,
            points,
            form: form || ["W", "W", "W", "D", "L"],
            qualification: getQualificationZone(slug, position),
        };
    });
}

function getSampleKnockout(slug) {
    const knockoutsBySlug = {
        "europa-league": {
            playoff: [
                ["Lyon", 3, "FC Midtjylland", 1],
                ["Braga", 4, "Bologna", 2],
                ["Panathinaikos", 3, "Celta Vigo", 2],
                ["Dinamo Zagreb", 5, "Fenerbahce", 3],
                ["Freiburg", 3, "Brann", 0],
                ["VfB Stuttgart", 4, "Sturm Graz", 1],
                ["Lille", 3, "Go Ahead Eagles", 2],
                ["Salzburg", 4, "Basel", 3],
            ],
            roundOf16: [
                ["Lyon", 2, "Ferencvaros", 3],
                ["Braga", 5, "Real Betis", 3],
                ["Panathinaikos", 1, "Viktoria Plzen", 3],
                ["Dinamo Zagreb", 4, "Genk", 6],
                ["Freiburg", 5, "Celtic", 1],
                ["VfB Stuttgart", 1, "FC Porto", 4],
                ["Lille", 2, "Nottingham Forest", 4],
                ["Salzburg", 1, "Aston Villa", 4],
            ],
            quarterFinals: [
                ["Ferencvaros", 3, "Braga", 4],
                ["Viktoria Plzen", 1, "Genk", 3],
                ["Freiburg", 4, "FC Porto", 2],
                ["Nottingham Forest", 2, "Aston Villa", 3],
            ],
            semiFinals: [
                ["Braga", 1, "Genk", 2],
                ["Freiburg", 2, "Aston Villa", 4],
            ],
            final: ["Genk", 0, "Aston Villa", 3],
            champion: "Aston Villa",
        },
        "champions-league": {
            playoff: [
                ["Monaco", 4, "Paris Saint-Germain", 5],
                ["Galatasaray", 7, "Juventus", 5],
                ["Benfica", 1, "Real Madrid", 3],
                ["Borussia Dortmund", 3, "Atalanta", 4],
                ["Qarabag FK", 3, "Newcastle United", 9],
                ["Club Brugge", 4, "Atletico Madrid", 7],
                ["Bodo/Glimt", 5, "Inter", 2],
                ["Olympiacos", 0, "Bayer Leverkusen", 2],
            ],
            roundOf16: [
                ["Paris Saint-Germain", 8, "Chelsea", 2],
                ["Galatasaray", 1, "Liverpool", 4],
                ["Real Madrid", 5, "Manchester City", 1],
                ["Atalanta", 2, "Bayern Munich", 10],
                ["Newcastle United", 3, "Barcelona", 8],
                ["Atletico Madrid", 7, "Tottenham Hotspur", 5],
                ["Bodo/Glimt", 3, "Sporting CP", 5],
                ["Bayer Leverkusen", 1, "Arsenal", 3],
            ],
            quarterFinals: [
                ["Paris Saint-Germain", 4, "Liverpool", 0],
                ["Real Madrid", 4, "Bayern Munich", 6],
                ["Barcelona", 2, "Atletico Madrid", 3],
                ["Sporting CP", 0, "Arsenal", 1],
            ],
            semiFinals: [
                ["Paris Saint-Germain", 6, "Bayern Munich", 5],
                ["Atletico Madrid", 1, "Arsenal", 2],
            ],
            final: ["Paris Saint-Germain", 1, "Arsenal", 1],
            champion: "Paris Saint-Germain",
        },
    };

    return knockoutsBySlug[slug] || null;
}

function getLeagueDetail(slug) {
    const meta = leagueDetailSlugs[slug];

    if (!meta) {
        return null;
    }

    return {
        source: "static",
        league: {
            slug,
            id: meta.id,
            name: meta.name,
            region: meta.region,
            image: leagueImages[meta.name] || null,
        },
        table: getSampleLeagueTable(slug),
        knockout: getSampleKnockout(slug),
    };
}

app.get("/api/league/:slug", (req, res) => {
    const detail = getLeagueDetail(req.params.slug);

    if (!detail) {
        res.status(404).json({ error: "Unknown league" });
        return;
    }

    res.json({
        generatedAt: new Date().toISOString(),
        ...detail,
    });
});

function startServer(preferredPort) {
    const server = app.listen(preferredPort, () => {
        const address = server.address();
        const activePort = typeof address === "object" && address ? address.port : preferredPort;

        console.log(`PitchLive is running at http://localhost:${activePort}`);
    });

    server.on("error", (error) => {
        if (error.code === "EADDRINUSE" && !process.env.PORT) {
            const nextPort = preferredPort + 1;

            console.log(`Port ${preferredPort} is busy, trying ${nextPort}`);
            startServer(nextPort);
            return;
        }

        throw error;
    });
}

if (require.main === module) {
    startServer(port);
}

module.exports = { app, pageData, getScores, getRecentScores, getWorldCupScores, startServer };