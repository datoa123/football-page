const express = require("express");
const bcrypt = require("bcrypt");

function createAuthRoutes({findUserByEmail, createUser, validateRegistration}) {
    const router = express.Router();

    router.get("/signup", (req, res) => {
        if (req.session?.userEmail) {
            res.redirect("/");
            return;
        }

        res.render("signup", {
            title: "Sign up - PitchLive",
            errors: {},
            values: {email: ""},
        });
    });

    router.post("/api/auth/register", async (req, res) => {
        const {email, password, confirmPassword} = req.body || {};
        const {isValid, errors} = validateRegistration({email, password, confirmPassword});

        if (!isValid) {
            res.status(400).render("signup", {
                title: "Sign up - PitchLive",
                errors,
                values: {email: email || ""},
            });
            return;
        }

        const normalizedEmail = String(email).trim().toLowerCase();
        const existingUser = await findUserByEmail(normalizedEmail);

        if (existingUser) {
            res.status(409).render("signup", {
                title: "Sign up - PitchLive",
                errors: {email: "An account with this email already exists"},
                values: {email: normalizedEmail},
            });
            return;
        }

        try {
            const passwordHash = await bcrypt.hash(password, 12);
            await createUser({email: normalizedEmail, passwordHash});

            req.session.userEmail = normalizedEmail;
            res.redirect("/");
        } catch (error) {
            console.error("Registration failed", error);
            res.status(500).render("signup", {
                title: "Sign up - PitchLive",
                errors: {form: "Something went wrong, please try again"},
                values: {email: normalizedEmail},
            });
        }
    });

    router.get("/login", (req, res) => {
        if (req.session?.userEmail) {
            res.redirect("/");
            return;
        }

        res.render("login", {
            title: "Sign in - PitchLive",
            errors: {},
            values: {email: ""},
        });
    });

    router.post("/api/auth/login", async (req, res) => {
        const {email, password} = req.body || {};
        const normalizedEmail = String(email || "").trim().toLowerCase();

        if (!normalizedEmail || !password) {
            res.status(400).render("login", {
                title: "Sign in - PitchLive",
                errors: {form: "Email and password are required"},
                values: {email: normalizedEmail},
            });
            return;
        }

        const user = await findUserByEmail(normalizedEmail);

        if (!user) {
            res.status(401).render("login", {
                title: "Sign in - PitchLive",
                errors: {form: "Incorrect email or password"},
                values: {email: normalizedEmail},
            });
            return;
        }

        try {
            const match = await bcrypt.compare(password, user.passwordHash);

            if (!match) {
                res.status(401).render("login", {
                    title: "Sign in - PitchLive",
                    errors: {form: "Incorrect email or password"},
                    values: {email: normalizedEmail},
                });
                return;
            }

            req.session.userEmail = normalizedEmail;
            res.redirect("/");
        } catch (error) {
            console.error("Login failed", error);
            res.status(500).render("login", {
                title: "Sign in - PitchLive",
                errors: {form: "Something went wrong, please try again"},
                values: {email: normalizedEmail},
            });
        }
    });

    router.post("/api/auth/logout", (req, res) => {
        req.session.destroy(() => {
            res.redirect("/");
        });
    });

    return router;
}

module.exports = {createAuthRoutes};
