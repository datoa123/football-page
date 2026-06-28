import { escapeHtml, safeImageUrl, getInitials, formatDetailDate, getMatchScoreText } from "./utils.js";
import {
    getLineupForSide,
    getEventsForSide,
    isGoalEvent,
    isCardEvent,
    isSubstitutionEvent,
    getCardColor,
    formatGoalEvent,
    getTeamAverageRating,
    getMatchHighestRating,
    buildLineupPlayers,
    getPlayerStatsForSide,
    isSameTeamRecord,
    getApiDetail,
} from "./lineup.js";

const detailTabs = ["Lineup", "Table", "Stats"];

function getDisplayLastName(fullName) {
    const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);

    return parts.length > 0 ? parts[parts.length - 1] : fullName;
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

    return fallbackEvents
        .slice(0, Math.min(goals, fallbackEvents.length))
        .map((event) => `<span>${escapeHtml(event)}</span>`)
        .join("");
}

function renderPlayer(player, teamLogo, teamName, side) {
    const initials = getInitials(player.name);
    const safeImage = safeImageUrl(player.photo || teamLogo);
    const toneClass = player.tone ? `lineup-rating--${escapeHtml(player.tone)}` : "";
    const markerStyle = `left: ${player.x}%; top: ${player.y}%;`;
    const playerCards = Array.isArray(player.cards) ? player.cards : player.card ? [{ color: "yellow" }] : [];
    const cards = playerCards
        .map(
            (card, index) =>
                `<span class="player-card player-card--${escapeHtml(card.color || "yellow")}" style="left:${1.15 + index * 0.42}rem"></span>`,
        )
        .join("");
    const number = player.number ? `${player.number} ` : "";

    // Render one icon per goal event, and one icon per assist event
    const goalEvents   = Array.isArray(player.goalEvents)   ? player.goalEvents   : [];
    const assistEvents = Array.isArray(player.assistEvents) ? player.assistEvents : [];

    const eventIcons = [
        ...goalEvents.map((e) =>
            `<span class="player-stat-icon player-stat-icon--goal" title="Goal ${escapeHtml(e.minute)}"><img src="/assets/football-ball.svg" alt="Goal" /></span>`,
        ),
        ...assistEvents.map((e) =>
            `<span class="player-stat-icon player-stat-icon--assist" title="Assist ${escapeHtml(e.minute)}"><img src="/assets/football-shoe.svg" alt="Assist" /></span>`,
        ),
    ];

    const eventIconsMarkup = eventIcons.length
        ? `<span class="player-stat-icons">${eventIcons.join("")}</span>`
        : "";

    const subOffMarkup = player.substitutedOff
        ? `<span class="player-sub-off" title="Substituted off"></span>`
        : "";
    const captainMarkup = player.captain ? `<span class="captain-mark">C</span>` : "";

    return `
    <div class="lineup-player lineup-player--${escapeHtml(side)}" style="${escapeHtml(markerStyle)}">
      ${player.event ? `<span class="player-event">${escapeHtml(player.event)}</span>` : ""}
      ${player.rating ? `<span class="lineup-rating ${toneClass}">${escapeHtml(player.rating)}</span>` : ""}
      ${subOffMarkup}
      ${cards}
      ${eventIconsMarkup}
      <span class="player-avatar">
        ${
        safeImage
            ? `<img class="${player.photo ? "player-avatar__photo" : ""}" src="${safeImage}" alt="${escapeHtml(teamName)}" loading="lazy" />`
            : `<span>${escapeHtml(initials)}</span>`
    }
      </span>
      <strong>${captainMarkup}${escapeHtml(number)}<span class="player-name-group">${escapeHtml(getDisplayLastName(player.name))}</span></strong>
    </div>
  `;
}

function renderPitch(detail) {
    const match = detail.match;
    const highestRating = getMatchHighestRating(detail);
    const homePlayers = buildLineupPlayers(detail, "home", highestRating);
    const awayPlayers = buildLineupPlayers(detail, "away", highestRating);
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

// ─── SUBSTITUTES ─────────────────────────────────────────────────────────────

function buildSubstitutePlayers(detail, side) {
    const lineup = getLineupForSide(detail, side);

    if (!lineup?.substitutes?.length) {
        return [];
    }

    const apiDetail = getApiDetail(detail);
    const allEvents = apiDetail.events || [];
    const teamEvents = allEvents.filter((event) => isSameTeamRecord(event, detail.match, side));
    const subEvents = teamEvents.filter(isSubstitutionEvent);

    const statsLookup = (() => {
        const teamStats = getPlayerStatsForSide(detail, side);
        const byId = new Map();
        const byName = new Map();

        (teamStats?.players || []).forEach((p) => {
            if (p.id != null) byId.set(Number(p.id), p);

            const { normalizeLookupValue } = { normalizeLookupValue: (v) =>
                    String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
            };
            byName.set(normalizeLookupValue(p.name), p);
        });

        return { byId, byName };
    })();

    function normalize(v) {
        return String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    }

    function lookupStats(player) {
        if (player.id != null && statsLookup.byId.has(Number(player.id))) {
            return statsLookup.byId.get(Number(player.id));
        }
        return statsLookup.byName.get(normalize(player.name)) || null;
    }

    function matchesPlayer(event, player) {
        if (event.assistId != null && player.id != null) {
            return Number(event.assistId) === Number(player.id);
        }
        return normalize(event.assistName) === normalize(player.name);
    }

    function findSubEvent(player) {
        // sub events have the player coming ON stored in assistId/assistName
        return subEvents.find((e) => matchesPlayer(e, player)) || null;
    }

    function getPlayerGoalEvents(player) {
        return teamEvents.filter((e) => {
            if (!isGoalEvent(e)) return false;
            if (e.playerId != null && player.id != null) return Number(e.playerId) === Number(player.id);
            return normalize(e.playerName) === normalize(player.name);
        });
    }

    function getPlayerAssistEvents(player) {
        return teamEvents.filter((e) => {
            if (!isGoalEvent(e)) return false;
            if (e.assistId != null && player.id != null) return Number(e.assistId) === Number(player.id);
            return Boolean(e.assistName) && normalize(e.assistName) === normalize(player.name);
        });
    }

    function getPlayerCards(player) {
        return teamEvents.filter((e) => {
            if (!isCardEvent(e)) return false;
            if (e.playerId != null && player.id != null) return Number(e.playerId) === Number(player.id);
            return normalize(e.playerName) === normalize(player.name);
        });
    }

    return lineup.substitutes.map((entry) => {
        const lp = entry.player || entry;
        const stats = lookupStats(lp);
        const subEvent = findSubEvent(lp);
        const goalEvents = getPlayerGoalEvents(lp);
        const assistEvents = getPlayerAssistEvents(lp);
        const cardEvents = getPlayerCards(lp);

        return {
            id: lp.id,
            name: lp.name || stats?.name || "Player",
            number: lp.number ?? stats?.number ?? "",
            position: stats?.position || lp.pos || "",
            photo: stats?.photo || "",
            rating: stats?.rating ? Number.parseFloat(stats.rating).toFixed(1) : "",
            minuteOn: subEvent?.minute || "",
            goalEvents,
            assistEvents,
            cardEvents,
        };
    });
}

function getRatingToneClass(rating) {
    const r = Number.parseFloat(rating);
    if (!Number.isFinite(r)) return "";
    if (r >= 7) return "lineup-rating--green";
    if (r >= 6) return "lineup-rating--orange";
    return "lineup-rating--red";
}

function renderSubstituteRow(player, teamLogo, teamName) {
    const safePhoto = safeImageUrl(player.photo || teamLogo);
    const initials = getInitials(player.name);
    const ratingTone = getRatingToneClass(player.rating);

    const avatar = safePhoto
        ? `<img class="${player.photo ? "player-avatar__photo" : ""}" src="${safePhoto}" alt="${escapeHtml(teamName)}" loading="lazy" />`
        : `<span>${escapeHtml(initials)}</span>`;

    const ratingMarkup = player.rating
        ? `<span class="lineup-rating ${ratingTone}">${escapeHtml(player.rating)}</span>`
        : "";

    const numberMarkup = player.number !== "" && player.number != null
        ? `<span class="sub-number">${escapeHtml(String(player.number))}</span>`
        : "";

    const goalIcons = player.goalEvents.map((e) =>
        `<span class="player-stat-icon player-stat-icon--goal" title="Goal ${escapeHtml(e.minute)}"><img src="/assets/football-ball.svg" alt="Goal" /></span>`
    ).join("");

    const assistIcons = player.assistEvents.map((e) =>
        `<span class="player-stat-icon player-stat-icon--assist" title="Assist ${escapeHtml(e.minute)}"><img src="/assets/football-shoe.svg" alt="Assist" /></span>`
    ).join("");

    const cardIcons = player.cardEvents.map((e) =>
        `<span class="player-card player-card--${escapeHtml(getCardColor(e))}" title="${escapeHtml(e.minute)}"></span>`
    ).join("");

    const iconsMarkup = (goalIcons || assistIcons || cardIcons)
        ? `<span class="player-stat-icons">${goalIcons}${assistIcons}${cardIcons}</span>`
        : "";

    const minuteMarkup = player.minuteOn
        ? `<span class="sub-minute">${escapeHtml(player.minuteOn)}</span>`
        : "";

    const subInIcon = player.minuteOn
        ? `<span class="sub-arrow sub-arrow--in" title="Substituted on"></span>`
        : "";

    return `
    <div class="sub-row">
      <span class="sub-avatar">${avatar}</span>
      ${ratingMarkup}
      ${numberMarkup}
      <span class="sub-info">
        <strong>${escapeHtml(player.name)}</strong>
        <small>${escapeHtml(player.position)}</small>
      </span>
      <span class="sub-events">
        ${iconsMarkup}
        ${minuteMarkup}
        ${subInIcon}
      </span>
    </div>
  `;
}

function renderCoachRow(lineup, side) {
    if (!lineup?.coach) return "";
    const alignClass = side === "away" ? "sub-coach--away" : "";

    return `<div class="sub-coach ${alignClass}">
      <span class="sub-coach__name">${escapeHtml(lineup.coach)}</span>
      <span class="sub-coach__label">Coach</span>
    </div>`;
}

function renderSubstitutes(detail) {
    const { match } = detail;
    const homeLineup = getLineupForSide(detail, "home");
    const awayLineup = getLineupForSide(detail, "away");
    const homeSubs = buildSubstitutePlayers(detail, "home");
    const awaySubs = buildSubstitutePlayers(detail, "away");

    if (homeSubs.length === 0 && awaySubs.length === 0) {
        return "";
    }

    const maxRows = Math.max(homeSubs.length, awaySubs.length);
    const rows = Array.from({ length: maxRows }, (_, i) => {
        const home = homeSubs[i]
            ? renderSubstituteRow(homeSubs[i], match.homeLogo, match.home)
            : `<div class="sub-row sub-row--empty"></div>`;
        const away = awaySubs[i]
            ? renderSubstituteRow(awaySubs[i], match.awayLogo, match.away)
            : `<div class="sub-row sub-row--empty"></div>`;

        return `<div class="subs-pair">${home}${away}</div>`;
    }).join("");

    return `
    <div class="substitutes-section">
      <div class="subs-coaches">
        ${renderCoachRow(homeLineup, "home")}
        ${renderCoachRow(awayLineup, "away")}
      </div>
      <h3 class="subs-heading">Substitutes</h3>
      <div class="subs-grid">
        ${rows}
      </div>
    </div>
  `;
}


export function renderMatchDetail(detail, matchStack) {
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
              <small>${escapeHtml(league.name)}</small>
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
              <small>${escapeHtml(league.name)}</small>
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
        ${renderSubstitutes(detail)}
      </section>
    </section>
  `;
}