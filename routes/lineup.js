const express = require("express");
const Lineup = require("../models/Lineup");

function createLineupRoutes() {
    const router = express.Router();

    router.get("/lineup-builder", (req, res) => {
        res.render("lineup-builder", {
            title: "Build Your XI - PitchLive",
            userEmail: req.session?.userEmail || null,
        });
    });

    router.get("/api/lineup", async (req, res) => {
        const userEmail = req.session?.userEmail;

        if (!userEmail) {
            res.status(401).json({error: "You must be logged in to view a saved lineup"});
            return;
        }

        try {
            const saved = await Lineup.findOne({userEmail}).lean();

            if (!saved) {
                res.json({lineup: null});
                return;
            }

            res.json({
                lineup: {
                    formation: saved.formation,
                    lineup: saved.lineup,
                },
            });
        } catch (error) {
            console.error("Failed to load lineup", error);
            res.status(500).json({error: "Unable to load lineup right now"});
        }
    });

    router.post("/api/lineup", async (req, res) => {
        const userEmail = req.session?.userEmail;

        if (!userEmail) {
            res.status(401).json({error: "You must be logged in to save a lineup"});
            return;
        }

        const {formation, lineup} = req.body || {};

        if (!formation || !Array.isArray(lineup)) {
            res.status(400).json({error: "formation and lineup are required"});
            return;
        }

        try {
            await Lineup.findOneAndUpdate(
                {userEmail},
                {userEmail, formation, lineup},
                {upsert: true, new: true, setDefaultsOnInsert: true},
            );

            res.json({success: true});
        } catch (error) {
            console.error("Failed to save lineup", error);
            res.status(500).json({error: "Unable to save lineup right now"});
        }
    });

    router.delete("/api/lineup", async (req, res) => {
        const userEmail = req.session?.userEmail;

        if (!userEmail) {
            res.status(401).json({error: "You must be logged in to clear a saved lineup"});
            return;
        }

        try {
            await Lineup.deleteOne({userEmail});
            res.json({success: true});
        } catch (error) {
            console.error("Failed to delete lineup", error);
            res.status(500).json({error: "Unable to clear lineup right now"});
        }
    });

    return router;
}

module.exports = {createLineupRoutes};