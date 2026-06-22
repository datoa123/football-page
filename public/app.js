const searchInput = document.querySelector("#global-search");
const matchStack = document.querySelector("#match-stack");
const dateLabel = document.querySelector("#date-label");
const filterChips = Array.from(document.querySelectorAll(".filter-chip"));

let dayOffset = 0;
let allCollapsed = false;
let activeRequestId = 0;
let activeDetailRequestId = 0;
let scoreMode = "recent";
let currentLeagues = [];

const matchDetailByKey = new Map();
const matchApiDetailCache = new Map();
const detailTabs = ["Facts", "Commentary", "Lineup", "Table", "Stats", "Head-to-Head"];
const homeLineup = [
  { number: 24, name: "Freese", rating: "6.7", x: 8, y: 66, tone: "orange" },
  { number: 13, name: "Ream", rating: "7.0", x: 19, y: 38, captain: true },
  { number: 3, name: "Richards", rating: "7.6", x: 19, y: 64 },
  { number: 5, name: "Robinson", rating: "7.5", x: 32, y: 28, card: true, event: "80'" },
  { number: 17, name: "Tillman", rating: "7.1", x: 32, y: 49 },
  { number: 4, name: "Adams", rating: "7.5", x: 32, y: 64 },
  { number: 20, name: "Balogun", rating: "6.3", x: 45, y: 49, tone: "orange", card: true },
];
const awayLineup = [
  { number: 18, name: "Beach", rating: "5.9", x: 93, y: 66, tone: "orange" },
  { number: 4, name: "Italiano", rating: "6.5", x: 82, y: 28, tone: "orange", card: true },
  { number: 13, name: "O'Neill", rating: "7.1", x: 72, y: 54 },
  { number: 3, name: "Circati", rating: "6.9", x: 82, y: 49, tone: "orange", card: true },
  { number: 19, name: "Souttar", rating: "6.0", x: 82, y: 66, tone: "orange", captain: true },
  { number: 7, name: "Leckie", rating: "6.3", x: 66, y: 28, tone: "orange", event: "61'" },
  { number: 9, name: "Toure", rating: "6.1", x: 58, y: 66, tone: "orange", event: "46'" },
];

const emptyState = document.createElement("div");
emptyState.className = "no-results";
emptyState.textContent = "No leagues match that search";

function getLeagueCards() {
  return Array.from(document.querySelectorAll("[data-league]"));
}

function getDateForOffset(offset) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date;
}

function formatDateParam(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatDay(offset) {
  if (offset === 0) return "Today";
  if (offset === -1) return "Yesterday";
  if (offset === 1) return "Tomorrow";

  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(getDateForOffset(offset));
}

function updateDate() {
  dateLabel.textContent = scoreMode === "recent" ? "Recent" : formatDay(dayOffset);
}

function setActiveFilter(filter) {
  filterChips.forEach((item) => {
    item.classList.toggle("is-active", item.dataset.filter === filter);
  });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const replacements = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return replacements[character];
  });
}

function safeImageUrl(value) {
  const url = String(value || "").trim();

  if (!url) return "";
  if (url.startsWith("/assets/") || /^https?:\/\//i.test(url)) {
    return escapeHtml(url);
  }

  return "";
}

function formatDetailDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Fri, June 19, 11:00 PM";
  }

  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function getMatchScoreText(match) {
  const hasScore = match.homeScore !== null && match.homeScore !== undefined && match.awayScore !== null && match.awayScore !== undefined;

  return hasScore ? `${match.homeScore} - ${match.awayScore}` : "vs";
}

function getTeamRank(teamName, side) {
  const knownRanks = {
    USA: "#17",
    Australia: "#27",
    Canada: "#31",
    Qatar: "#53",
    Mexico: "#14",
    "South Korea": "#23",
  };

  return knownRanks[teamName] || "";
}

function getInitials(value) {
  return String(value || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function normalizeLookupValue(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getSideTeamId(match, side) {
  return side === "home" ? match.homeId : match.awayId;
}

function getSideTeamName(match, side) {
  return side === "home" ? match.home : match.away;
}

function isSameTeamRecord(record, match, side) {
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

function getApiDetail(detail) {
  return detail.apiDetail || {};
}

function getLineupForSide(detail, side) {
  return findTeamRecord(getApiDetail(detail).lineups || [], detail.match, side);
}

function getPlayerStatsForSide(detail, side) {
  return findTeamRecord(getApiDetail(detail).playerStats || [], detail.match, side);
}

function getEventsForSide(detail, side) {
  const events = getApiDetail(detail).events || [];

  return events.filter((event) => isSameTeamRecord(event, detail.match, side));
}

function isGoalEvent(event) {
  return normalizeLookupValue(event.type) === "goal" && !normalizeLookupValue(event.detail).includes("missed");
}

function isCardEvent(event) {
  return normalizeLookupValue(event.type) === "card";
}

function getCardColor(event) {
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

function formatRating(value) {
  const rating = Number.parseFloat(value);

  return Number.isFinite(rating) ? rating.toFixed(1) : "";
}

function getRatingTone(rating) {
  const numericRating = Number.parseFloat(rating);

  return Number.isFinite(numericRating) && numericRating < 6.5 ? "orange" : "";
}

function getTeamAverageRating(detail, side, fallback = "-") {
  const ratings = (getPlayerStatsForSide(detail, side)?.players || [])
    .map((player) => Number.parseFloat(player.rating))
    .filter(Number.isFinite);

  if (ratings.length === 0) {
    return fallback;
  }

  const average = ratings.reduce((total, rating) => total + rating, 0) / ratings.length;

  return average.toFixed(1);
}

function formatGoalEvent(event) {
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

  return { maxRow, rowCounts };
}

function getFallbackPitchPosition(index, side) {
  const homePositions = [
    { x: 8, y: 50 },
    { x: 19, y: 22 },
    { x: 19, y: 40 },
    { x: 19, y: 60 },
    { x: 19, y: 78 },
    { x: 32, y: 30 },
    { x: 32, y: 50 },
    { x: 32, y: 70 },
    { x: 44, y: 28 },
    { x: 44, y: 50 },
    { x: 44, y: 72 },
  ];
  const fallback = homePositions[index] || { x: 32, y: 50 };

  return side === "home" ? fallback : { x: 100 - fallback.x, y: fallback.y };
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
    cards.push({ color: "yellow" });
  }

  for (let index = 0; index < Math.min(redCards, 1); index += 1) {
    cards.push({ color: "red" });
  }

  return cards.slice(0, 2);
}

function getPrimaryPlayerMinute(playerEvents) {
  const event = playerEvents.find(isGoalEvent) || playerEvents.find(isCardEvent);

  return event?.minute || "";
}

function buildLineupPlayers(detail, side) {
  const lineup = getLineupForSide(detail, side);

  if (!lineup?.startXI?.length) {
    return detail.match.id ? [] : side === "home" ? homeLineup : awayLineup;
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
    const rating = formatRating(playerStats?.rating);
    const position = getLineupPitchPosition(player, side, gridMeta, index);

    return {
      ...player,
      rating,
      tone: getRatingTone(rating),
      photo: playerStats?.photo || "",
      x: position.x,
      y: position.y,
      event: getPrimaryPlayerMinute(playerEvents),
      cards: buildPlayerCards(playerStats, playerEvents),
      captain: Boolean(playerStats?.captain),
    };
  });
}

function renderMetaIcon(path) {
  return `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="${path}" /></svg>`;
}

function renderDetailTeamLogo(image, fallbackClass, label) {
  const safeImage = safeImageUrl(image);

  if (safeImage) {
    return `<img class="detail-team-logo" src="${safeImage}" alt="${escapeHtml(label)}" loading="lazy" />`;
  }

  return `<span class="detail-team-logo detail-team-logo--fallback ${escapeHtml(fallbackClass || "club")}"></span>`;
}

function renderLeagueLogo(league) {
  const image = safeImageUrl(league.image || league.countryFlag);

  if (image) {
    return `<img class="detail-league-logo" src="${image}" alt="" loading="lazy" />`;
  }

  if (league.icon) {
    return `<span class="league-icon ${escapeHtml(league.icon)}"></span>`;
  }

  return `<span class="country-dot ${escapeHtml(league.countryDot || "")}"></span>`;
}

function renderLeagueMark(league) {
  const image = safeImageUrl(league.image || league.countryFlag);

  if (image) {
    return `<img class="league-logo league-logo--card" src="${image}" alt="" loading="lazy" />`;
  }

  if (league.icon) {
    return `<span class="league-icon ${escapeHtml(league.icon)}"></span>`;
  }

  return `<span class="country-dot ${escapeHtml(league.countryDot || "")}"></span>`;
}

function renderTeamMark(image, fallbackClass) {
  const safeImage = safeImageUrl(image);

  if (safeImage) {
    return `<img class="team-logo" src="${safeImage}" alt="" loading="lazy" />`;
  }

  return `<span class="${escapeHtml(fallbackClass || "club")}"></span>`;
}

function renderScore(match) {
  const hasScore = match.homeScore !== null && match.homeScore !== undefined && match.awayScore !== null && match.awayScore !== undefined;

  if (match.fixtureText || !hasScore) {
    return `<span class="score score--time">${escapeHtml(match.fixtureText || "vs")}</span>`;
  }

  return `
    <span class="score">
      <strong>${escapeHtml(match.homeScore)}</strong>
      <span>-</span>
      <strong>${escapeHtml(match.awayScore)}</strong>
    </span>
  `;
}

function renderMatchIcons(icons = []) {
  return icons
    .map((icon) => {
      if (icon === "tv") {
        return `<span class="tv">tv</span>`;
      }

      return "<span></span>";
    })
    .join("");
}

function renderMatch(match, context) {
  matchDetailByKey.set(context.key, {
    match,
    league: context.league,
    group: context.group,
  });

  return `
    <a class="match-row ${escapeHtml(match.rowClass || "")}" href="#match-detail" data-match-key="${escapeHtml(context.key)}">
      <span class="status ${escapeHtml(match.statusClass || "")}">${escapeHtml(match.status || "")}</span>
      <span class="team team--home">
        ${escapeHtml(match.home)}
        ${renderTeamMark(match.homeLogo, match.homeBadge)}
      </span>
      ${renderScore(match)}
      <span class="team team--away">
        ${renderTeamMark(match.awayLogo, match.awayBadge)}
        ${escapeHtml(match.away)}
      </span>
      <span class="match-icons">
        ${renderMatchIcons(match.icons || [])}
      </span>
    </a>
  `;
}

function renderGroup(group, league, leagueIndex, groupIndex) {
  const groupName = group.name
    ? `
      <div class="group-row">
        <span>${escapeHtml(group.name)}</span>
      </div>
    `
    : "";
  const matches = (group.matches || [])
    .map((match, matchIndex) =>
      renderMatch(match, {
        league,
        group,
        key: `${leagueIndex}:${groupIndex}:${matchIndex}`,
      }),
    )
    .join("");

  return `${groupName}${matches}`;
}

function renderLeagueCard(league, leagueIndex) {
  const groups = (league.groups || []).map((group, groupIndex) => renderGroup(group, league, leagueIndex, groupIndex)).join("");
  const emptyText = league.emptyText ? `<p>${escapeHtml(league.emptyText)}</p>` : "";
  const footer = league.footer
    ? `
      <button class="after-midnight" type="button">
        <span>${escapeHtml(league.footer)}</span>
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m7 10 5 5 5-5" /></svg>
      </button>
    `
    : "";

  return `
    <article class="match-card ${escapeHtml(league.className || "compact-league")}" data-league data-title="${escapeHtml(league.searchTitle || league.name)}">
      <button class="league-header" type="button" aria-expanded="true">
        <span class="league-title">
          ${renderLeagueMark(league)}
          ${escapeHtml(league.name)}
        </span>
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m7 14 5-5 5 5" /></svg>
      </button>

      <div class="league-body ${league.emptyText ? "league-body--empty" : ""}">
        ${emptyText}
        ${groups}
        ${footer}
      </div>
    </article>
  `;
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

function renderEventLines(detail, side) {
  const goalEvents = getEventsForSide(detail, side).filter(isGoalEvent);

  if (goalEvents.length > 0) {
    return goalEvents.map((event) => `<span>${escapeHtml(formatGoalEvent(event))}</span>`).join("");
  }

  if (detail.match.id) {
    return "";
  }

  const goals = side === "home" ? Number(detail.match.homeScore || 0) : Number(detail.match.awayScore || 0);
  const fallbackEvents = side === "home" ? ["Burgess 11' (OG)", "Freeman 43'"] : ["Leckie 61'"];

  if (!Number.isFinite(goals) || goals <= 0) {
    return "";
  }

  return fallbackEvents.slice(0, Math.min(goals, fallbackEvents.length)).map((event) => `<span>${escapeHtml(event)}</span>`).join("");
}

function renderPlayer(player, teamLogo, teamName, side) {
  const initials = getInitials(player.name);
  const safeImage = safeImageUrl(player.photo || teamLogo);
  const toneClass = player.tone === "orange" ? "lineup-rating--orange" : "";
  const markerStyle = `left: ${player.x}%; top: ${player.y}%;`;
  const playerCards = Array.isArray(player.cards) ? player.cards : player.card ? [{ color: "yellow" }] : [];
  const cards = playerCards
    .map(
      (card, index) =>
        `<span class="player-card player-card--${escapeHtml(card.color || "yellow")}" style="left:${1.15 + index * 0.42}rem"></span>`,
    )
    .join("");
  const number = player.number ? `${player.number} ` : "";

  return `
    <div class="lineup-player lineup-player--${escapeHtml(side)}" style="${escapeHtml(markerStyle)}">
      ${player.event ? `<span class="player-event">${escapeHtml(player.event)}</span>` : ""}
      ${player.rating ? `<span class="lineup-rating ${toneClass}">${escapeHtml(player.rating)}</span>` : ""}
      ${cards}
      <span class="player-avatar">
        ${
          safeImage
            ? `<img class="${player.photo ? "player-avatar__photo" : ""}" src="${safeImage}" alt="${escapeHtml(teamName)}" loading="lazy" />`
            : `<span>${escapeHtml(initials)}</span>`
        }
      </span>
      <strong>${escapeHtml(number)}${escapeHtml(player.name)}</strong>
      ${player.captain ? `<span class="captain-mark">C</span>` : ""}
    </div>
  `;
}

function renderPitch(detail) {
  const match = detail.match;
  const homePlayers = buildLineupPlayers(detail, "home");
  const awayPlayers = buildLineupPlayers(detail, "away");
  const hasPlayers = homePlayers.length > 0 || awayPlayers.length > 0;
  const players = [
    ...homePlayers.map((player) => renderPlayer(player, match.homeLogo, match.home, "home")),
    ...awayPlayers.map((player) => renderPlayer(player, match.awayLogo, match.away, "away")),
  ].join("");

  return `
    <div class="lineup-pitch ${hasPlayers ? "" : "lineup-pitch--empty"}" aria-label="Lineup">
      <span class="pitch-line pitch-line--middle"></span>
      <span class="pitch-circle"></span>
      <span class="pitch-box pitch-box--left"></span>
      <span class="pitch-box pitch-box--right"></span>
      ${players}
    </div>
  `;
}

function renderDetailTiming(statusText) {
  const status = String(statusText || "");

  if (/^\d+'$/.test(status)) {
    return `<b>${escapeHtml(status)} <i>LIVE</i></b>`;
  }

  if (status === "FT") {
    return "<b>Full-time</b>";
  }

  if (status === "AET" || status === "PEN") {
    return `<b>${escapeHtml(status)}</b>`;
  }

  return "";
}

function renderMatchDetail(detail) {
  const { match, league, group } = detail;
  const leagueContext = match.round || group?.name || "";
  const leagueTitle = `${league.name}${leagueContext ? ` ${leagueContext}` : ""}`;
  const scoreText = getMatchScoreText(match);
  const statusText = match.status || (scoreText === "vs" ? "Upcoming" : "FT");
  const homeEvents = renderEventLines(detail, "home");
  const awayEvents = renderEventLines(detail, "away");
  const homeLineupInfo = getLineupForSide(detail, "home");
  const awayLineupInfo = getLineupForSide(detail, "away");
  const homeFormation = homeLineupInfo?.formation || match.homeFormation || (!match.id ? "3-5-2" : "-");
  const awayFormation = awayLineupInfo?.formation || match.awayFormation || (!match.id ? "5-4-1" : "-");
  const homeTeamRating = getTeamAverageRating(detail, "home", !match.id ? "7.0" : "-");
  const awayTeamRating = getTeamAverageRating(detail, "away", !match.id ? "6.3" : "-");
  const homeRank = getTeamRank(match.home, "home");
  const awayRank = getTeamRank(match.away, "away");
  const timing = renderDetailTiming(statusText);
  const lineupLoadingClass = match.id && !detail.apiDetail ? "is-loading" : "";

  document.body.classList.add("is-match-detail");

  matchStack.innerHTML = `
    <section class="match-detail">
      <header class="detail-hero">
        <div class="detail-hero__top">
          <button class="detail-back" type="button" aria-label="Back to matches">
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6" /></svg>
          </button>
          <strong>Matches</strong>
          <span class="detail-competition">
            ${renderLeagueLogo(league)}
            <span>${escapeHtml(leagueTitle)}</span>
          </span>
          <span class="detail-audio" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 0 1 16 0M7 12v4a2 2 0 0 0 2 2h1v-8H9a2 2 0 0 0-2 2Zm10-2h-1v8h1a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2Z" /></svg>
            <i></i>
          </span>
          <button class="detail-follow" type="button">Follow</button>
        </div>

        <div class="detail-meta">
          <span>${renderMetaIcon("M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13H4V6a1 1 0 0 1 1-1Z")} ${escapeHtml(formatDetailDate(match.kickoffAt))}</span>
          <span>${renderMetaIcon("M4 11h16M7 11v7M17 11v7M6 8h12l-1.5-3h-9L6 8Z")} ${escapeHtml(match.venue || "Seattle Stadium")}</span>
          <span>${renderMetaIcon("M5 12h14M8 8h8M9 16h6")} ${escapeHtml(match.referee || "Felix Zwayer")}</span>
          <span>${renderMetaIcon("M4 7h16v10H4zM8 11h3M13 11h3")} ${escapeHtml(match.broadcast || "Setanta Sports Georgia...")}</span>
        </div>

        <div class="detail-scoreboard">
          <div class="detail-team detail-team--home">
            <span>
              <strong>${escapeHtml(match.home)}</strong>
              <small>${escapeHtml(homeRank ? `FIFA ${homeRank}` : league.name)}</small>
            </span>
            ${renderDetailTeamLogo(match.homeLogo, match.homeBadge, match.home)}
            <div class="detail-events">${homeEvents}</div>
          </div>

          <div class="detail-score">
            <strong>${escapeHtml(scoreText)}</strong>
            <span>${escapeHtml(statusText)}</span>
            ${timing}
            <small class="detail-ball" aria-hidden="true"></small>
          </div>

          <div class="detail-team detail-team--away">
            ${renderDetailTeamLogo(match.awayLogo, match.awayBadge, match.away)}
            <span>
              <strong>${escapeHtml(match.away)}</strong>
              <small>${escapeHtml(awayRank ? `FIFA ${awayRank}` : league.name)}</small>
            </span>
            <div class="detail-events">${awayEvents}</div>
          </div>
        </div>

        <nav class="detail-tabs" aria-label="Match sections">
          ${detailTabs.map((tab) => `<button class="${tab === "Lineup" ? "is-active" : ""}" type="button">${escapeHtml(tab)}</button>`).join("")}
        </nav>
      </header>

      <section class="lineup-card-detail ${lineupLoadingClass}">
        <div class="lineup-summary">
          <span class="team-rating">${escapeHtml(homeTeamRating)}</span>
          ${renderDetailTeamLogo(match.homeLogo, match.homeBadge, match.home)}
          <strong>${escapeHtml(match.home)}</strong>
          <b>${escapeHtml(homeFormation)}</b>
          <b>${escapeHtml(awayFormation)}</b>
          <strong>${escapeHtml(match.away)}</strong>
          ${renderDetailTeamLogo(match.awayLogo, match.awayBadge, match.away)}
          <span class="team-rating team-rating--away">${escapeHtml(awayTeamRating)}</span>
        </div>

        <div class="lineup-tools" aria-label="Lineup filters">
          <button type="button">Transfer value</button>
          <button type="button">Age</button>
          <button type="button">Club</button>
        </div>

        ${renderPitch(detail)}
      </section>
    </section>
  `;
}

async function loadMatchApiDetail(detail) {
  const fixtureId = detail.match.id;

  if (!fixtureId) {
    return;
  }

  const cacheKey = String(fixtureId);

  if (matchApiDetailCache.has(cacheKey)) {
    detail.apiDetail = matchApiDetailCache.get(cacheKey);
    renderMatchDetail(detail);
    return;
  }

  const requestId = activeDetailRequestId + 1;
  activeDetailRequestId = requestId;

  try {
    const response = await fetch(`/api/matches/${encodeURIComponent(fixtureId)}/details`, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Match details request failed with ${response.status}`);
    }

    const apiDetail = await response.json();

    if (requestId !== activeDetailRequestId || !document.body.classList.contains("is-match-detail")) {
      return;
    }

    matchApiDetailCache.set(cacheKey, apiDetail);
    detail.apiDetail = apiDetail;
    renderMatchDetail(detail);
  } catch (error) {
    console.error(error);

    if (requestId === activeDetailRequestId && document.body.classList.contains("is-match-detail")) {
      detail.apiDetail = {
        events: [],
        lineups: [],
        playerStats: [],
      };
      renderMatchDetail(detail);
    }
  }
}

function showScoreList() {
  activeDetailRequestId += 1;
  document.body.classList.remove("is-match-detail");
  renderScores(currentLeagues);
}

function renderScores(leagues) {
  currentLeagues = leagues;
  matchDetailByKey.clear();
  document.body.classList.remove("is-match-detail");

  const html = leagues
    .map((league, index) => {
      const hideAllButton =
        index === 1
          ? `
            <button class="hide-all" type="button" id="hide-all">
              <span>Hide all</span>
              <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m7 14 5-5 5 5" /></svg>
            </button>
          `
          : "";

      return `${hideAllButton}${renderLeagueCard(league, index)}`;
    })
    .join("");

  matchStack.innerHTML = html;
  allCollapsed = false;
  applySearch();
}

async function loadScores() {
  const requestId = activeRequestId + 1;
  activeRequestId = requestId;
  matchStack.classList.add("is-loading");

  try {
    const date = formatDateParam(getDateForOffset(dayOffset));
    const endpoint = scoreMode === "recent" ? "/api/recent-matches" : `/api/scores?date=${date}`;
    const response = await fetch(endpoint, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Scores request failed with ${response.status}`);
    }

    const data = await response.json();

    if (requestId !== activeRequestId) {
      return;
    }

    renderScores(data.leagues || []);
  } catch (error) {
    console.error(error);
  } finally {
    if (requestId === activeRequestId) {
      matchStack.classList.remove("is-loading");
    }
  }
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
      renderMatchDetail(detail);
      loadMatchApiDetail(detail);
      window.scrollTo({ top: 0, behavior: "smooth" });
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
loadScores();
