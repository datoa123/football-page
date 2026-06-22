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

const teamImages = {
  Australia: "/assets/australia.png",
  Canada: "/assets/canada.png",
  Mexico: "/assets/mexico.png",
  Qatar: "/assets/qatar.png",
  "South Korea": "/assets/south-korea.png",
  USA: "/assets/usa.png",
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
    { name: "FIFA World Cup", icon: "trophy", image: leagueImages["FIFA World Cup"] },
    { name: "Premier League", icon: "lion", image: leagueImages["Premier League"] },
    { name: "Champions League", icon: "ball", image: leagueImages["Champions League"] },
    { name: "LaLiga", icon: "laliga", image: leagueImages.LaLiga },
    { name: "Bundesliga", icon: "bundesliga", image: leagueImages.Bundesliga },
    { name: "Serie A", icon: "seriea", image: leagueImages["Serie A"] },
    { name: "Ligue 1", icon: "ligue1", image: leagueImages["Ligue 1"] },
    { name: "Europa League", icon: "europa", image: leagueImages["Europa League"] },
    { name: "Eredivisie", icon: "eredivisie", image: leagueImages.Eredivisie },
  ],
  leagues: [
    {
      name: "FIFA World Cup",
      icon: "trophy",
      image: leagueImages["FIFA World Cup"],
      className: "featured-league",
      searchTitle: "FIFA World Cup Canada Qatar Mexico South Korea USA Australia",
      groups: [
        {
          name: "Group B",
          matches: [
            {
              status: "FT",
              home: "Canada",
              away: "Qatar",
              homeScore: 6,
              awayScore: 0,
              homeBadge: "flag flag--canada",
              awayBadge: "flag flag--qatar",
              homeLogo: teamImages.Canada,
              awayLogo: teamImages.Qatar,
              icons: ["dot"],
            },
          ],
        },
        {
          name: "Group A",
          matches: [
            {
              status: "FT",
              home: "Mexico",
              away: "South Korea",
              homeScore: 1,
              awayScore: 0,
              homeBadge: "flag flag--mexico",
              awayBadge: "flag flag--korea",
              homeLogo: teamImages.Mexico,
              awayLogo: teamImages["South Korea"],
              icons: ["dot"],
            },
          ],
        },
        {
          name: "Group D",
          matches: [
            {
              status: "3",
              statusClass: "live",
              rowClass: "is-live",
              home: "USA",
              away: "Australia",
              homeScore: 0,
              awayScore: 0,
              homeBadge: "flag flag--usa",
              awayBadge: "flag flag--australia",
              homeLogo: teamImages.USA,
              awayLogo: teamImages.Australia,
              icons: ["dot", "tv"],
            },
          ],
        },
      ],
      footer: "2 matches start after midnight",
    },
    {
      name: "Argentina - Primera B Metropolitana",
      countryDot: "country-dot--argentina",
      className: "compact-league",
      searchTitle: "Argentina Primera B Metropolitana no matches today",
      emptyText: "No matches today",
      footer: "1 match starts after midnight",
    },
    {
      name: "Belarus - Premier League",
      countryDot: "country-dot--belarus",
      className: "compact-league",
      searchTitle: "Belarus Premier League Dnepr Minsk Slavia Mozyr",
      groups: [
        {
          matches: [
            {
              status: "78'",
              home: "Dnepr Minsk",
              away: "Slavia Mozyr",
              homeScore: 2,
              awayScore: 1,
              homeBadge: "club crest-blue",
              awayBadge: "club crest-green",
              icons: ["tv"],
            },
          ],
        },
      ],
    },
    {
      name: "Brazil - Serie A",
      countryDot: "country-dot--brazil",
      className: "compact-league",
      searchTitle: "Brazil Serie A Flamengo Palmeiras",
      groups: [
        {
          matches: [
            {
              status: "21:00",
              home: "Flamengo",
              away: "Palmeiras",
              fixtureText: "vs",
              homeBadge: "club crest-red",
              awayBadge: "club crest-green",
              icons: ["dot"],
            },
          ],
        },
      ],
    },
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

function getTodayDate() {
  return formatDateParam(new Date());
}

function addDays(date, days) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);

  return nextDate;
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
    homeLogo: fixture.teams?.home?.logo || teamImages[home],
    awayLogo: fixture.teams?.away?.logo || teamImages[away],
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
    throw new Error("API-Football returned an error payload");
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

function getFallbackRecentLeagues() {
  return [
    {
      name: "FIFA World Cup",
      icon: "trophy",
      image: leagueImages["FIFA World Cup"],
      className: "featured-league",
      searchTitle: "FIFA World Cup recent matches Canada Qatar Mexico South Korea USA Australia",
      groups: [
        {
          name: "Sample results",
          matches: [
            {
              status: "FT",
              home: "Canada",
              away: "Qatar",
              homeScore: 6,
              awayScore: 0,
              homeLogo: teamImages.Canada,
              awayLogo: teamImages.Qatar,
            },
            {
              status: "FT",
              home: "Mexico",
              away: "South Korea",
              homeScore: 1,
              awayScore: 0,
              homeLogo: teamImages.Mexico,
              awayLogo: teamImages["South Korea"],
            },
            {
              status: "FT",
              home: "USA",
              away: "Australia",
              homeScore: 2,
              awayScore: 2,
              homeLogo: teamImages.USA,
              awayLogo: teamImages.Australia,
            },
          ],
        },
      ],
    },
  ];
}

async function getScores(date) {
  if (!apiFootballKey) {
    return {
      source: "static",
      providerConfigured: false,
      leagues: pageData.leagues,
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
      leagues: pageData.leagues,
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
      leagues: getFallbackRecentLeagues(),
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
      leagues: getFallbackRecentLeagues(),
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

module.exports = { app, pageData, getScores, getRecentScores, startServer };
