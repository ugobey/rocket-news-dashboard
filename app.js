const parameters = process.argv;

const webServerPort = 8080;

const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");

require("dotenv").config();

const sharedFunction = require("./shared/functions.js");
const errorHandler = sharedFunction.errorHandler;

errorHandler("Rocket Alert / News Dashboard", "Service Started");

try {
    const app = express();

    app.use((req, res, next) => {
        res.append("Access-Control-Allow-Origin", "*");
        res.append("Access-Control-Allow-Methods", "GET,POST");
        res.append("Access-Control-Allow-Headers", "Content-Type");
        next();
    });

    // view engine setup
    app.set("views", path.join(__dirname, "views"));
    app.set("view engine", "ejs");
    app.locals.moment = require("moment");

    app.use(bodyParser.json({ limit: "1000mb" }));
    app.use(
        bodyParser.urlencoded({
            extended: true,
            limit: "1000mb",
        })
    );

    app.use(express.static(path.join(__dirname, "public")));

    app.listen(webServerPort, function () {
        console.log(`Listening on port ${webServerPort}`);
    });

    //ROUTES
    const main = require("./routes/main");
    const ajax = require("./routes/ajax");

    app.use(
        "/ajax",
        function (req, res, next) {
            next();
        },
        ajax
    );

    app.use(
        "/main",
        function (req, res, next) {
            next();
        },
        main
    );

    app.use(
        "*",
        function (req, res, next) {
            res.redirect("/main");
        },
        main
    );

    // catch 404 and forward to error handler
    app.use(function (req, res, next) {
        const err = new Error("Not Found");
        err.status = 404;
        next(err);
    });

    // error handler
    app.use(function (err, req, res, next) {
        // set locals, only providing error in development
        res.locals.message = err.message;
        res.locals.error = req.app.get("env") === "production" ? err : {};

        // render the error page
        res.status(err.status || 500);
        res.render("error");
    });

    module.exports = app;
} catch (err) {
    errorHandler("Error : " + err);
}
