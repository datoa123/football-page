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
    const image = safeImageUrl(logo);

    if (!image) {
        return "";
    }

    return `<img class="table-team-logo" src="${image}" alt="" loading="lazy" />`;
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
        green: "Qualification to 1/8 Finals",
        blue: "Qualification to 1/16 Finals",
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

function renderBracketMatch([homeTeam, homeScore, awayTeam, awayScore]) {
    return `
    <div class="bracket-match">
      <div class="bracket-team">
        <span>${escapeHtml(homeTeam)}</span>
        <strong>${escapeHtml(homeScore)}</strong>
      </div>
      <div class="bracket-team">
        <span>${escapeHtml(awayTeam)}</span>
        <strong>${escapeHtml(awayScore)}</strong>
      </div>
    </div>
  `;
}

function renderBracketColumn(matches, label, columnClass) {
    const matchesMarkup = matches.map(renderBracketMatch).join("");

    return `
    <div class="bracket-column ${escapeHtml(columnClass || "")}">
      <span class="bracket-column-label">${escapeHtml(label)}</span>
      <div class="bracket-column-matches">${matchesMarkup}</div>
    </div>
  `;
}

function splitInHalf(matches) {
    const midpoint = Math.ceil(matches.length / 2);

    return [matches.slice(0, midpoint), matches.slice(midpoint)];
}

function renderKnockout(knockout) {
    if (!knockout) {
        return `<div class="bracket-empty">No knockout data available</div>`;
    }

    const [roundOf16Left, roundOf16Right] = splitInHalf(knockout.roundOf16 || []);
    const [quarterFinalsLeft, quarterFinalsRight] = splitInHalf(knockout.quarterFinals || []);
    const [semiFinalsLeft, semiFinalsRight] = splitInHalf(knockout.semiFinals || []);

    return `
    <div class="bracket">
      <div class="bracket-half">
        ${renderBracketColumn(roundOf16Left, "Round of 16")}
        ${renderBracketColumn(quarterFinalsLeft, "Quarter-finals")}
        ${renderBracketColumn(semiFinalsLeft, "Semi-finals")}
      </div>

      <div class="bracket-final">
        <span class="bracket-column-label">Final</span>
        ${knockout.final ? renderBracketMatch(knockout.final) : ""}
        <div class="bracket-champion">
          <span class="bracket-trophy" aria-hidden="true"></span>
          <strong>${escapeHtml(knockout.champion || "")}</strong>
          <small>CHAMPION</small>
        </div>
      </div>

      <div class="bracket-half bracket-half--right">
        ${renderBracketColumn(semiFinalsRight, "Semi-finals")}
        ${renderBracketColumn(quarterFinalsRight, "Quarter-finals")}
        ${renderBracketColumn(roundOf16Right, "Round of 16")}
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
        ${activeTab === "knockout" ? renderKnockout(knockout) : renderTable(table)}
      </section>
    </section>
  `;
}