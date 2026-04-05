const config = require("./config");

const webServerPort = process.env.PORT || config.webServerPort;

const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const http = require("http");
const { setupWebsocketServer } = require("./websocket");

require("dotenv").config();

const sharedFunction = require("./shared/functions.js");
const errorHandler = sharedFunction.errorHandler;

errorHandler("Rocket Alert / News Dashboard", "Service Started");

try {
    const app = express();

    // Allow dashboard data to be consumed from any origin (display-only client use case).
    app.use((req, res, next) => {
        res.append("Access-Control-Allow-Origin", "*");
        res.append("Access-Control-Allow-Methods", "GET,POST");
        res.append("Access-Control-Allow-Headers", "Content-Type");
        next();
    });

    // Render server pages with EJS templates.
    app.set("views", path.join(__dirname, "views"));
    app.set("view engine", "ejs");
    app.locals.moment = require("moment");

    // Accept large payloads from integrations that can post bulky alert/news bodies.
    app.use(bodyParser.json({ limit: "1000mb" }));
    app.use(
        bodyParser.urlencoded({
            extended: true,
            limit: "1000mb",
        }),
    );

    // Serve client assets (CSS, JS, fonts, images).
    app.use(express.static(path.join(__dirname, "public")));

    // Primary dashboard routes.
    const main = require("./routes/main");
    app.use(
        "/",
        function (req, res, next) {
            next();
        },
        main,
    );

    app.use(
        "*wildcard",
        function (req, res, next) {
            // Keep unknown routes on the dashboard entrypoint.
            res.redirect("/main");
        },
        main,
    );

    // Catch 404 and forward to the shared Express error handler.
    app.use(function (req, res, next) {
        const err = new Error("Not Found");
        err.status = 404;
        next(err);
    });

    // Express error renderer.
    app.use(function (err, req, res, next) {
        // Expose stack traces only outside production.
        res.locals.message = err.message;
        res.locals.error = req.app.get("env") === "production" ? err : {};

        // Render the fallback error view.
        res.status(err.status || 500);
        res.render("error");
    });

    // Single HTTP server hosts both Express routes and websocket upgrades.
    const server = http.createServer(app);
    setupWebsocketServer({ server });

    server.listen(webServerPort, function () {
        console.log(`Listening on port ${webServerPort}`);
    });

    module.exports = app;
} catch (err) {
    errorHandler("Error : " + err);
}
