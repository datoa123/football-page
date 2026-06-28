export function escapeHtml(value) {
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

export function safeImageUrl(value) {
    const url = String(value || "").trim();

    if (!url) return "";
    if (
        url.startsWith("/assets/") ||
        url.startsWith("/europa-league/") ||
        url.startsWith("/champions-league/") ||
        /^https?:\/\//i.test(url)
    ) {
        return escapeHtml(url);
    }

    return "";
}

export function getInitials(value) {
    return String(value || "")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join("")
        .toUpperCase();
}

export function normalizeLookupValue(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

export function formatRating(value) {
    const rating = Number.parseFloat(value);

    return Number.isFinite(rating) ? rating.toFixed(1) : "";
}

export function getRatingTone(rating, highestRating) {
    const numericRating = Number.parseFloat(rating);

    if (!Number.isFinite(numericRating)) {
        return "";
    }

    const numericHighest = Number.parseFloat(highestRating);
    const isMatchHighest = Number.isFinite(numericHighest) && numericRating === numericHighest;

    if (isMatchHighest && numericRating >= 7) {
        return "blue";
    }

    if (numericRating >= 7) {
        return "green";
    }

    if (numericRating >= 6) {
        return "orange";
    }

    return "red";
}

export function getDateForOffset(offset) {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    return date;
}

export function formatDateParam(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

export function formatDay(offset) {
    if (offset === 0) return "Today";
    if (offset === -1) return "Yesterday";
    if (offset === 1) return "Tomorrow";

    return new Intl.DateTimeFormat("en", {
        weekday: "short",
        month: "short",
        day: "numeric",
    }).format(getDateForOffset(offset));
}

export function formatDetailDate(value) {
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

export function getMatchScoreText(match) {
    const hasScore =
        match.homeScore !== null &&
        match.homeScore !== undefined &&
        match.awayScore !== null &&
        match.awayScore !== undefined;

    return hasScore ? `${match.homeScore} - ${match.awayScore}` : "vs";
}