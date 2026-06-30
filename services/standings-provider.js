const FOOTBALL_DATA_BASE_URL = "https://api.football-data.org/v4";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour — standings don't change minute to minute

const standingsCache = new Map();

const competitionCodeBySlug = {
    "premier-league": "PL",
    "champions-league": "CL",
    "laliga": "PD",
    "bundesliga": "BL1",
    "serie-a": "SA",
    "ligue-1": "FL1",
};

function getApiKey() {
    return process.env.FOOTBALL_DATA_API_KEY || "";
}

function isSlugSupported(slug) {
    return Boolean(competitionCodeBySlug[slug]) && Boolean(getApiKey());
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

function parseForm(formString) {
    if (!formString || typeof formString !== "string") {
        return ["D", "D", "D", "D", "D"];
    }

    return formString
        .split(",")
        .slice(-5)
        .map((entry) => {
            const trimmed = entry.trim().toUpperCase();
            if (trimmed === "W" || trimmed === "D" || trimmed === "L") {
                return trimmed;
            }
            return "D";
        });
}

async function fetchStandingsFromApi(slug) {
    const competitionCode = competitionCodeBySlug[slug];
    const cacheKey = `standings:${competitionCode}:2025`;
    const cached = standingsCache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
        return cached.data;
    }

    const response = await fetch(`${FOOTBALL_DATA_BASE_URL}/competitions/${competitionCode}/standings?season=2025`, {
        headers: {
            "X-Auth-Token": getApiKey(),
        },
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`football-data.org responded with ${response.status} for ${competitionCode}: ${errorBody}`);
    }

    const payload = await response.json();
    const standingsBlock = (payload.standings || []).find((block) => block.type === "TOTAL");
    const table = standingsBlock?.table || [];

    standingsCache.set(cacheKey, {
        expiresAt: Date.now() + CACHE_TTL_MS,
        data: table,
    });

    return table;
}

async function getLiveStandings(slug, logoFolder, getQualificationZone) {
    if (!isSlugSupported(slug)) {
        return null;
    }

    try {
        const table = await fetchStandingsFromApi(slug);

        if (!table.length) {
            return null;
        }

        return table.map((row) => {
            const position = row.position;
            const teamName = row.team?.name || "TBD";

            return {
                position,
                team: teamName,
                teamLogo: row.team?.crest || null,
                played: row.playedGames,
                won: row.won,
                drawn: row.draw,
                lost: row.lost,
                goals: `${row.goalsFor}-${row.goalsAgainst}`,
                goalDiff: row.goalDifference >= 0 ? `+${row.goalDifference}` : String(row.goalDifference),
                points: row.points,
                form: parseForm(row.form),
                qualification: getQualificationZone(slug, position),
            };
        });
    } catch (error) {
        console.error(`Unable to fetch live standings for ${slug}:`, error.message);
        return null;
    }
}

module.exports = {getLiveStandings, isSlugSupported, competitionCodeBySlug};
