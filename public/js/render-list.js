import {escapeHtml, safeImageUrl} from "./utils.js";

export function renderTeamMark(image, fallbackClass) {
    const safeImage = safeImageUrl(image);

    if (safeImage) {
        return `<img class="team-logo" src="${safeImage}" alt="" loading="lazy" />`;
    }

    return `<span class="${escapeHtml(fallbackClass || "club")}"></span>`;
}

export function renderLeagueMark(league) {
    const image = safeImageUrl(league.image || league.countryFlag);

    if (image) {
        return `<img class="league-logo league-logo--card" src="${image}" alt="" loading="lazy" />`;
    }

    if (league.icon) {
        return `<span class="league-icon ${escapeHtml(league.icon)}"></span>`;
    }

    return `<span class="country-dot ${escapeHtml(league.countryDot || "")}"></span>`;
}

export function renderScore(match) {
    const hasScore =
        match.homeScore !== null &&
        match.homeScore !== undefined &&
        match.awayScore !== null &&
        match.awayScore !== undefined;

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

export function renderMatchIcons(icons = []) {
    return icons
        .map((icon) => {
            if (icon === "tv") {
                return `<span class="tv">tv</span>`;
            }

            return "<span></span>";
        })
        .join("");
}

export function renderMatch(match, context, matchDetailByKey) {
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

export function renderGroup(group, league, leagueIndex, groupIndex, matchDetailByKey) {
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
            }, matchDetailByKey),
        )
        .join("");

    return `${groupName}${matches}`;
}

export function renderLeagueCard(league, leagueIndex, matchDetailByKey) {
    const groups = (league.groups || [])
        .map((group, groupIndex) => renderGroup(group, league, leagueIndex, groupIndex, matchDetailByKey))
        .join("");
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

export function renderScores(leagues, matchStack, matchDetailByKey) {
    matchDetailByKey.clear();

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

            return `${hideAllButton}${renderLeagueCard(league, index, matchDetailByKey)}`;
        })
        .join("");

    matchStack.innerHTML = html;
}

function groupMatchesByRound(matches) {
    const groupsByRound = new Map();

    matches.forEach((match) => {
        const roundKey = match.round || "";

        if (!groupsByRound.has(roundKey)) {
            groupsByRound.set(roundKey, {name: roundKey, matches: []});
        }

        groupsByRound.get(roundKey).matches.push(match);
    });

    return Array.from(groupsByRound.values());
}

export function renderWorldCupDay(day, dayIndex, matchDetailByKey) {
    const groups = groupMatchesByRound(day.matches || []);
    const emptyText = groups.length === 0 ? `<p>No matches ${escapeHtml(day.label.toLowerCase())}</p>` : "";
    const body = groups
        .map((group, groupIndex) => renderGroup(group, {
            name: "FIFA World Cup",
            icon: "trophy"
        }, dayIndex, groupIndex, matchDetailByKey))
        .join("");

    return `
    <article class="match-card featured-league" data-league data-title="${escapeHtml(day.label)} FIFA World Cup">
      <button class="league-header" type="button" aria-expanded="true">
        <span class="league-title">
          <span class="league-icon trophy"></span>
          FIFA World Cup &middot; ${escapeHtml(day.label)}
        </span>
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m7 14 5-5 5 5" /></svg>
      </button>
 
      <div class="league-body ${groups.length === 0 ? "league-body--empty" : ""}">
        ${emptyText}
        ${body}
      </div>
    </article>
  `;
}

export function renderWorldCupDays(days, matchStack, matchDetailByKey) {
    matchDetailByKey.clear();

    const html = days
        .map((day, index) => renderWorldCupDay(day, index, matchDetailByKey))
        .join("");

    matchStack.innerHTML = html;
}
