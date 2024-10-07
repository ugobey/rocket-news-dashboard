const service_name = "Ajax";

const express = require("express");
const router = express.Router();

const sharedFunction = require("../shared/functions.js");
const errorHandler = sharedFunction.errorHandler;

const fs = require("fs");

const pikudHaoref = require("pikud-haoref-api");
const moment = require("moment");
const Parser = require("rss-parser");
const parser = new Parser();

router.use("/", function (req, res) {
    try {
        (async () => {
            const getService = req.body.service;

            if (getService === "pikud_haoref") {
                const options = {};

                pikudHaoref.getActiveAlert(function (err, alert) {
                    if (err) {
                        errorHandler(service_name, err);
                        fs.appendFileSync("./logs/pikudHaoref_errors.txt", err + "\n\n");

                        res.statusCode = 200;
                        res.write(JSON.stringify({ error: err.toString() }));
                        res.end();
                        return;
                    }

                    res.statusCode = 200;
                    res.write(JSON.stringify(alert));
                    res.end();
                }, options);
            } else if (getService === "rss") {
                const feed = await parser.parseURL("https://www.israelnationalnews.com/Rss.aspx?act=.1");

                res.statusCode = 200;
                res.write(JSON.stringify({ feed: feed }));
                res.end();
            } else {
                res.statusCode = 200;
                res.write(JSON.stringify({ error: "No Service Selected" }));
                res.end();
            }
        })().catch((err) =>
            setImmediate(() => {
                errorHandler(service_name, "ERROR " + err);
                res.statusCode = 500;
                res.write(JSON.stringify({ error: err.toString() }));
                res.end();
            })
        );
    } catch (err) {
        errorHandler(service_name, "Error : " + err);
        res.statusCode = 500;
        res.write(JSON.stringify({ error: err.toString() }));
        res.end();
    }
});

module.exports = router;
