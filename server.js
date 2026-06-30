const express = require("express");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");
const session = require("express-session");
const {findUserByEmail, createUser} = require("./users-store");
const {validateRegistration} = require("./validate-registration");
const {createLeagueRoutes} = require("./routes/leagues");
const {getLiveStandings} = require("./services/standings-provider");
const {createAuthRoutes} = require("./routes/auth");
const {connectToDatabase} = require("./db");
const {createLineupRoutes} = require("./routes/lineup");

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
app.use(express.urlencoded({extended: false}));
app.use(express.json());

const sessionSecret = process.env.SESSION_SECRET || "dev-only-secret-change-me";

app.use(
    session({
        secret: sessionSecret,
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            maxAge: 30 * 24 * 60 * 60 * 1000,
        },
    }),
);

const pageData = {
    title: "PitchLive - Football Scores",
    apiConfigured: Boolean(apiFootballKey),
    topLeagues: [
        {name: "Premier League", slug: "premier-league", icon: "lion", image: leagueImages["Premier League"]},
        {name: "Champions League", slug: "champions-league", icon: "ball", image: leagueImages["Champions League"]},
        {name: "LaLiga", slug: "laliga", icon: "laliga", image: leagueImages.LaLiga},
        {name: "Bundesliga", slug: "bundesliga", icon: "bundesliga", image: leagueImages.Bundesliga},
        {name: "Serie A", slug: "serie-a", icon: "seriea", image: leagueImages["Serie A"]},
        {name: "Ligue 1", slug: "ligue-1", icon: "ligue1", image: leagueImages["Ligue 1"]},
        {name: "Europa League", slug: "europa-league", icon: "europa", image: leagueImages["Europa League"]},
        {name: "Eredivisie", slug: "eredivisie", icon: "eredivisie", image: leagueImages.Eredivisie},
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
    const fixtures = await fetchApiFootballFixtures({date});

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
    return fetchApiFootballResource("/fixtures", params, {includeTimezone: true});
}

function isFinishedFixture(fixture) {
    return finishedFixtureStatuses.has(fixture.fixture?.status?.short);
}

async function fetchApiFootballRecentMatches({days, limit}) {
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

    return normalizeApiLeagues(recentFixtures, {groupByDate: true});
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
        fetchOptionalApiFootballResource("/fixtures/events", {fixture: fixtureId}),
        fetchOptionalApiFootballResource("/fixtures/lineups", {fixture: fixtureId}),
        fetchOptionalApiFootballResource("/fixtures/players", {fixture: fixtureId}),
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
        {key: "yesterday", label: "Yesterday", date: formatDateKeyInTimezone(yesterday, WORLD_CUP_TIMEZONE)},
        {key: "today", label: "Today", date: formatDateKeyInTimezone(today, WORLD_CUP_TIMEZONE)},
        {key: "tomorrow", label: "Tomorrow", date: formatDateKeyInTimezone(tomorrow, WORLD_CUP_TIMEZONE)},
    ];
}

async function fetchWorldCupFixturesForBucket(bucket) {
    try {
        const fixturesForDate = await fetchApiFootballFixtures({date: bucket.date});

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

let worldCupScoresCache = null;
const worldCupScoresCacheTtlMs = 3 * 60 * 1000;

async function getWorldCupScores() {
    if (worldCupScoresCache && worldCupScoresCache.expiresAt > Date.now()) {
        return worldCupScoresCache.data;
    }

    const buckets = getWorldCupDayBuckets();
    let result;

    if (!apiFootballKey) {
        result = {
            source: "static",
            providerConfigured: false,
            mode: "world-cup",
            days: getFallbackWorldCupDays(buckets),
        };
    } else {
        try {
            const bucketsWithFixtures = await fetchWorldCupFixtures(buckets);

            result = {
                source: "api-football",
                providerConfigured: true,
                mode: "world-cup",
                days: groupWorldCupFixturesByDay(bucketsWithFixtures),
            };
        } catch (error) {
            console.error(error);

            result = {
                source: "static",
                providerConfigured: true,
                mode: "world-cup",
                error: "Unable to load World Cup scores right now",
                days: getFallbackWorldCupDays(buckets),
            };
        }
    }

    worldCupScoresCache = {
        expiresAt: Date.now() + worldCupScoresCacheTtlMs,
        data: result,
    };

    return result;
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
        const leagues = await fetchApiFootballRecentMatches({days, limit});

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
    res.render("index", {
        ...pageData,
        userEmail: req.session?.userEmail || null,
    });
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

app.get("/test-api", async (req, res) => {
    console.log("API Key:", apiFootballKey);

    const response = await fetch("https://v3.football.api-sports.io/status", {
        method: "GET",
        headers: {
            "x-apisports-key": apiFootballKey,
            "Accept": "application/json"
        }
    });

    console.log("Status:", response.status);

    const text = await response.text();

    console.log(text);

    res.send(text);
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

app.get('/api/fpl/players', async (req, res) => {
    const FPL_URL = 'https://fantasy.premierleague.com/api/bootstrap-static/';
    const cacheKey = '__fpl_bootstrap__';
    const TTL = 5 * 60 * 1000; // 5-minute cache

    const cached = apiFootballCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
        return res.json(cached.response);
    }

    try {
        const response = await fetch(FPL_URL, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; PitchLive/1.0)',
            },
        });

        if (!response.ok) {
            throw new Error(`FPL API responded with ${response.status}`);
        }

        const data = await response.json();

        const result = {
            players: (data.elements || []).map((p) => ({
                id: p.id,
                code: p.code,
                first_name: p.first_name,
                second_name: p.second_name,
                web_name: p.web_name,
                team: p.team,
                element_type: p.element_type,   // 1=GK 2=DEF 3=MID 4=FWD
                total_points: p.total_points,
                now_cost: p.now_cost,        // divide by 10 for £m
                squad_number: p.squad_number,
                status: p.status,
            })),
            teams: (data.teams || []).map((t) => ({
                id: t.id,
                name: t.name,
                short_name: t.short_name,
                code: t.code,
            })),
        };

        apiFootballCache.set(cacheKey, {
            expiresAt: Date.now() + TTL,
            response: result,
        });

        res.json(result);
    } catch (error) {
        console.error('FPL proxy error:', error);
        res.status(502).json({error: 'Unable to load FPL data right now', players: [], teams: []});
    }
});


const leagueDetailSlugs = {
    "champions-league": {id: 2, name: "Champions League", region: "International"},
    "europa-league": {id: 3, name: "Europa League", region: "International"},
    "laliga": {id: 140, name: "LaLiga", region: "Spain"},
    "premier-league": {id: 39, name: "Premier League", region: "England"},
    "bundesliga": {id: 78, name: "Bundesliga", region: "Germany"},
    "serie-a": {id: 135, name: "Serie A", region: "Italy"},
    "ligue-1": {id: 61, name: "Ligue 1", region: "France"},
    "eredivisie": {id: 88, name: "Eredivisie", region: "Netherlands"},
};

const qualificationZonesBySlug = {
    "champions-league": [
        {max: 8, zone: "green"},
        {max: 24, zone: "blue"},
    ],
    "europa-league": [
        {max: 8, zone: "green"},
        {max: 24, zone: "blue"},
    ],
    "laliga": [
        {max: 5, zone: "blue"},
        {max: 7, zone: "orange"},
        {max: 8, zone: "green"},
        {min: 18, zone: "red"},
    ],
    "premier-league": [
        {max: 5, zone: "blue"},
        {max: 7, zone: "orange"},
        {max: 8, zone: "green"},
        {min: 18, zone: "red"},
    ],
    "bundesliga": [
        {max: 4, zone: "blue"},
        {max: 6, zone: "orange"},
        {max: 7, zone: "green"},
        {min: 17, zone: "red"},
    ],
    "serie-a": [
        {max: 4, zone: "blue"},
        {max: 6, zone: "orange"},
        {max: 7, zone: "green"},
        {min: 18, zone: "red"},
    ],
    "ligue-1": [
        {max: 3, zone: "blue"},
        {max: 5, zone: "orange"},
        {max: 6, zone: "green"},
        {min: 17, zone: "red"},
    ],
    "eredivisie": [
        {max: 2, zone: "blue"},
        {max: 3, zone: "orange"},
        {max: 8, zone: "green"},
        {min: 17, zone: "red"},
    ],
};

function getQualificationZoneForSlug(slug, position) {
    const zones = qualificationZonesBySlug[slug] || [];

    for (const zone of zones) {
        if (zone.max !== undefined && position <= zone.max) {
            return zone.zone;
        }

        if (zone.min !== undefined && position >= zone.min) {
            return zone.zone;
        }
    }

    return null;
}

function getSampleLeagueTable(slug) {
    const teamsByLeague = {
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
        "eredivisie": [
            ["PSV", 34, 27, 3, 4, "101-45", "+56", 84, ["W", "W", "D", "W", "W"]],
            ["Feyenoord", 34, 19, 8, 7, "70-44", "+26", 65, ["D", "W", "W", "D", "W"]],
            ["NEC", 34, 16, 11, 7, "77-53", "+24", 59, ["D", "D", "D", "L", "W"]],
            ["Twente", 34, 15, 13, 6, "59-40", "+19", 58, ["W", "D", "D", "D", "L"]],
            ["Ajax", 34, 14, 14, 6, "62-41", "+21", 56, ["W", "W", "L", "L", "D"]],
            ["Utrecht", 34, 15, 8, 11, "55-42", "+13", 53, ["W", "L", "W", "W", "W"]],
            ["AZ Alkmaar", 34, 14, 10, 10, "58-51", "+7", 52, ["W", "D", "D", "D", "D"]],
            ["Heerenveen", 34, 14, 9, 11, "57-53", "+4", 51, ["L", "W", "W", "L", "D"]],
            ["Groningen", 34, 14, 6, 14, "49-45", "+4", 48, ["D", "L", "L", "W", "W"]],
            ["Sparta Rotterdam", 34, 12, 7, 15, "40-62", "-22", 43, ["L", "L", "W", "L", "L"]],
            ["Fortuna Sittard", 34, 11, 6, 17, "49-63", "-14", 39, ["D", "L", "L", "W", "L"]],
            ["Go Ahead Eagles", 34, 8, 14, 12, "54-53", "+1", 38, ["D", "D", "D", "L", "L"]],
            ["Excelsior", 34, 10, 8, 16, "43-56", "-13", 38, ["D", "W", "W", "W", "W"]],
            ["Telstar", 34, 9, 10, 15, "49-55", "-6", 37, ["L", "W", "W", "W", "W"]],
            ["PEC Zwolle", 34, 9, 10, 15, "44-71", "-27", 37, ["D", "L", "W", "L", "L"]],
            ["FC Volendam", 34, 8, 8, 18, "35-55", "-20", 32, ["L", "W", "W", "D", "L"]],
            ["NAC", 34, 6, 11, 17, "35-58", "-23", 29, ["D", "D", "D", "W", "D"]],
            ["Heracles", 34, 5, 4, 25, "35-85", "-50", 19, ["L", "L", "L", "L", "L"]],
        ],
    };

    const teams = teamsByLeague[slug];

    if (slug === "world-cup") {
        const groupsMap = new Map();
        teams.forEach((team) => {
            if (!groupsMap.has(team.group)) {
                groupsMap.set(team.group, []);
            }
            groupsMap.get(team.group).push(team);
        });
        return Array.from(groupsMap.entries()).map(([groupLetter, groupTeams]) => ({
            groupName: `Group ${groupLetter}`,
            rows: groupTeams.map((team, index) => ({
                position: index + 1,
                team: team.team,
                teamLogo: null,
                played: team.played,
                won: team.won,
                drawn: team.drawn,
                lost: team.lost,
                goals: team.goals,
                goalDiff: team.goalDiff,
                points: team.points,
                form: team.form,
                qualification: index === 0 ? "green" : index === 1 ? "blue" : null,
            })),
        }));
    }

    const logoFoldersBySlug = {
        "champions-league": "champions-league",
        "europa-league": "europa-league",
        "laliga": "laliga",
        "premier-league": "premier-league",
        "bundesliga": "bundesliga",
        "serie-a": "serie-a",
        "ligue-1": "ligue-1",
        "eredivisie": "eredivisie",
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
            qualification: getQualificationZoneForSlug(slug, position),
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

async function getLeagueDetail(slug) {
    const meta = leagueDetailSlugs[slug];

    if (!meta) {
        return null;
    }

    const logoFoldersBySlug = {
        "champions-league": "champions-league",
        "europa-league": "europa-league",
        "laliga": "laliga",
        "premier-league": "premier-league",
        "bundesliga": "bundesliga",
        "serie-a": "serie-a",
        "ligue-1": "ligue-1",
        "eredivisie": "eredivisie",
    };

    const staticOnlySlugs = new Set(["europa-league", "eredivisie"]);

    let table;
    let source;

    if (staticOnlySlugs.has(slug)) {
        table = getSampleLeagueTable(slug);
        source = "static";
    } else {
        table = await getLiveStandings(slug, logoFoldersBySlug[slug], getQualificationZoneForSlug);
        source = "football-data.org";

        if (!table) {
            table = [];
            source = "unavailable";
        }
    }

    return {
        source,
        league: {
            slug,
            id: meta.id,
            name: meta.name,
            region: meta.region,
            image: leagueImages[meta.name] || null,
        },
        table,
        knockout: getSampleKnockout(slug),
    };
}

app.get("/api/league/:slug", async (req, res) => {
    const detail = await getLeagueDetail(req.params.slug);

    if (!detail) {
        res.status(404).json({error: "Unknown league"});
        return;
    }

    res.json({
        generatedAt: new Date().toISOString(),
        ...detail,
    });
});

app.use(createLeagueRoutes({pageData, getLeagueDetail}));
app.use(createAuthRoutes({findUserByEmail, createUser, validateRegistration}));
app.use(createLineupRoutes());

async function startServer(preferredPort) {
    await connectToDatabase();

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

module.exports = {app, pageData, getScores, getRecentScores, getWorldCupScores, startServer};