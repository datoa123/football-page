const express = require("express");

function createLeagueRoutes({pageData, getLeagueDetail}) {
    const router = express.Router();

    router.get("/:leagueSlug", async (req, res, next) => {
        const detail = await getLeagueDetail(req.params.leagueSlug);

        if (!detail) {
            next();
            return;
        }

        res.render("index", {
            ...pageData,
            userEmail: req.session?.userEmail || null,
            initialLeagueDetail: detail,
        });
    });

    return router;
}

module.exports = {createLeagueRoutes};
