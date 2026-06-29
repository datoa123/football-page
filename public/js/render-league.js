import {escapeHtml, safeImageUrl} from "./utils.js";

function renderLeagueLogo(league) {
    const image = safeImageUrl(league.image);

    if (image) {
        return `<img class="league-detail-logo" src="${image}" alt="" loading="lazy" />`;
    }

    return `<span class="league-detail-logo league-detail-logo--fallback"></span>`;
}

function renderFormPills(form = []) {
    return form
        .map((result) => `<span class="form-pill form-pill--${escapeHtml(result.toLowerCase())}">${escapeHtml(result)}</span>`)
        .join("");
}

function renderTeamLogo(logo) {
    if (!logo) {
        return "";
    }

    const image = logo.startsWith("/") ? logo : safeImageUrl(logo);

    if (!image) {
        return "";
    }

    return `<img class="table-team-logo" src="${escapeHtml(image)}" alt="" loading="lazy" />`;
}

function renderTableRow(row) {
    const zoneClass = row.qualification ? `table-row--${escapeHtml(row.qualification)}` : "";

    return `
    <tr class="${zoneClass}">
      <td class="table-position">${escapeHtml(row.position)}</td>
      <td class="table-team">
        ${renderTeamLogo(row.teamLogo)}
        <span>${escapeHtml(row.team)}</span>
      </td>
      <td>${escapeHtml(row.played)}</td>
      <td>${escapeHtml(row.won)}</td>
      <td>${escapeHtml(row.drawn)}</td>
      <td>${escapeHtml(row.lost)}</td>
      <td>${escapeHtml(row.goals)}</td>
      <td>${escapeHtml(row.goalDiff)}</td>
      <td class="table-points">${escapeHtml(row.points)}</td>
      <td><span class="form-row">${renderFormPills(row.form)}</span></td>
    </tr>
  `;
}

function renderTableLegend(table) {
    const zonesPresent = new Set((table || []).map((row) => row.qualification).filter(Boolean));

    if (zonesPresent.size === 0) {
        return "";
    }

    const legendLabels = {
        green: "UEFA Champions League group stage",
        blue: "Europa League group stage",
        orange: "Europa Conference League qualifiers",
        red: "Relegation",
    };

    const items = Array.from(zonesPresent)
        .filter((zone) => legendLabels[zone])
        .map(
            (zone) =>
                `<span class="table-legend-item"><span class="table-legend-dot table-legend-dot--${escapeHtml(zone)}"></span>${escapeHtml(legendLabels[zone])}</span>`,
        )
        .join("");

    return `<div class="table-legend">${items}</div>`;
}

function renderTable(table) {
    const rows = (table || []).map(renderTableRow).join("");

    return `
    <div class="league-table-wrap">
      <table class="league-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Team</th>
            <th>PL</th>
            <th>W</th>
            <th>D</th>
            <th>L</th>
            <th>+/-</th>
            <th>GD</th>
            <th>PTS</th>
            <th>Form</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
    ${renderTableLegend(table)}
  `;
}

function renderBracketTeamBadge(teamName, slug) {
    const teamSlug = String(teamName || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    const folder = slug || "europa-league";
    const image = teamSlug ? safeImageUrl(`/${folder}/${teamSlug}.png`) : "";

    if (!image) {
        return `<span class="bracket-badge bracket-badge--fallback" aria-hidden="true"></span>`;
    }

    return `<img class="bracket-badge" src="${image}" alt="" loading="lazy" />`;
}

function getTeamAbbreviation(teamName) {
    return String(teamName || "")
        .replace(/[^a-zA-Z]/g, "")
        .slice(0, 3)
        .toUpperCase();
}

function renderBracketMatch([homeTeam, homeScore, awayTeam, awayScore], slug, gridRow) {
    const style = gridRow ? ` style="grid-row: ${gridRow};"` : "";

    return `
    <div class="bracket-match"${style}>
      <div class="bracket-match-teams">
        <div class="bracket-team">
          ${renderBracketTeamBadge(homeTeam, slug)}
          <span title="${escapeHtml(homeTeam)}">${escapeHtml(getTeamAbbreviation(homeTeam))}</span>
        </div>
        <div class="bracket-team">
          ${renderBracketTeamBadge(awayTeam, slug)}
          <span title="${escapeHtml(awayTeam)}">${escapeHtml(getTeamAbbreviation(awayTeam))}</span>
        </div>
      </div>
      <div class="bracket-match-score">
        <strong>${escapeHtml(homeScore)}</strong>
        <span>-</span>
        <strong>${escapeHtml(awayScore)}</strong>
      </div>
    </div>
  `;
}

function computeRoundPositions(roundSizes) {
    const totalUnits = roundSizes[0] * 4;
    const positionsByRound = [];

    positionsByRound[0] = Array.from({length: roundSizes[0]}, (_, i) => ({
        center: i * 4 + 2,
        span: 2,
    }));

    for (let round = 1; round < roundSizes.length; round += 1) {
        const previous = positionsByRound[round - 1];

        positionsByRound[round] = Array.from({length: roundSizes[round]}, (_, i) => {
            const center = (previous[i * 2].center + previous[i * 2 + 1].center) / 2;
            const span = previous[i * 2].span * 2;

            return {center, span};
        });
    }

    return {positionsByRound, totalUnits};
}

function renderBracketColumn(matches, positions, totalUnits, connectorClass, slug) {
    const matchesMarkup = matches
        .map((match, index) => {
            if (!match) {
                return "";
            }

            const {center, span} = positions[index];
            const startRow = center - span / 2 + 1;
            const gridRow = `${startRow} / span ${span}`;

            return renderBracketMatch(match, slug, gridRow);
        })
        .join("");

    return `
    <div class="bracket-column">
      <div class="bracket-column-matches bracket-column-matches--${escapeHtml(connectorClass || "")}" style="grid-template-rows: repeat(${totalUnits}, 1fr);">
        ${matchesMarkup}
      </div>
    </div>
  `;
}

function splitInHalf(matches) {
    const midpoint = Math.ceil(matches.length / 2);

    return [matches.slice(0, midpoint), matches.slice(midpoint)];
}

function renderKnockout(knockout, slug) {
    if (!knockout) {
        return `<div class="bracket-empty">No knockout data available</div>`;
    }

    const [playoffLeft, playoffRight] = splitInHalf(knockout.playoff || []);
    const [roundOf16Left, roundOf16Right] = splitInHalf(knockout.roundOf16 || []);
    const [quarterFinalsLeft, quarterFinalsRight] = splitInHalf(knockout.quarterFinals || []);
    const [semiFinalsLeft, semiFinalsRight] = splitInHalf(knockout.semiFinals || []);

    const roundSizes = [roundOf16Left.length, quarterFinalsLeft.length, semiFinalsLeft.length];
    const {positionsByRound, totalUnits} = computeRoundPositions(roundSizes);

    const r16Positions = positionsByRound[0];
    const playoffPositions = r16Positions;

    return `
    <div class="bracket bracket--${escapeHtml(slug || "")}">
      <div class="bracket-half">
        ${renderBracketColumn(playoffLeft, playoffPositions, totalUnits, "to-right", slug)}
        ${renderBracketColumn(roundOf16Left, positionsByRound[0], totalUnits, "to-right", slug)}
        ${renderBracketColumn(quarterFinalsLeft, positionsByRound[1], totalUnits, "to-right", slug)}
        ${renderBracketColumn(semiFinalsLeft, positionsByRound[2], totalUnits, "to-right", slug)}
      </div>

      <div class="bracket-final">
        <div class="bracket-champion">
          ${renderBracketTeamBadge(knockout.champion, slug)}
          <strong>${escapeHtml(knockout.champion || "")}</strong>
          <small>CHAMPION</small>
        </div>
        ${knockout.final ? renderBracketMatch(knockout.final, slug) : ""}
      </div>

      <div class="bracket-half bracket-half--right">
        ${renderBracketColumn(semiFinalsRight, positionsByRound[2], totalUnits, "to-left", slug)}
        ${renderBracketColumn(quarterFinalsRight, positionsByRound[1], totalUnits, "to-left", slug)}
        ${renderBracketColumn(roundOf16Right, positionsByRound[0], totalUnits, "to-left", slug)}
        ${renderBracketColumn(playoffRight, playoffPositions, totalUnits, "to-left", slug)}
      </div>
    </div>
  `;
}

export function renderLeagueDetail(detail, matchStack, activeTab = "table") {
    const {league, table, knockout} = detail;
    const hasKnockout = Boolean(knockout);
    const tabs = hasKnockout ? ["table", "knockout"] : ["table"];
    const tabLabels = {table: "Table", knockout: "Knockout"};

    document.body.classList.add("is-league-detail");

    matchStack.innerHTML = `
    <section class="league-detail">
      <header class="league-detail-hero">
        <button class="detail-back" type="button" aria-label="Back to matches">
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6" /></svg>
        </button>
        ${renderLeagueLogo(league)}
        <span>
          <strong>${escapeHtml(league.name)}</strong>
          <small>${escapeHtml(league.region || "")}</small>
        </span>
      </header>

      <nav class="league-detail-tabs" aria-label="League sections">
        ${tabs
        .map(
            (tab) =>
                `<button class="${tab === activeTab ? "is-active" : ""}" type="button" data-league-tab="${escapeHtml(tab)}">${escapeHtml(tabLabels[tab])}</button>`,
        )
        .join("")}
      </nav>

      <section class="league-detail-body">
        ${activeTab === "knockout" ? renderKnockout(knockout, league.slug) : renderTable(table)}
      </section>
    </section>
  `;
}