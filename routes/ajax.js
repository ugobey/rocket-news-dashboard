const service_name = "Ajax";

const express = require("express");
const router = express.Router();

const sharedFunction = require("../shared/functions.js");
const errorHandler = sharedFunction.errorHandler;

const fs = require("fs");

const pikudHaoref = require("pikud-haoref-api");
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
                const getRSSfeed = req.body.rssfeed;

                function getFeedURL(feed) {
                    switch (feed) {
                        case "RSSarutz7":
                            return "https://www.israelnationalnews.com/Rss.aspx";
                        case "RSSjerusalemPost":
                            return "https://www.jpost.com/Rss/RssFeedsHeadlines.aspx";
                        case "RSSynet":
                            return "https://www.ynet.co.il/Integration/StoryRss3082.xml";
                        default:
                            return;
                    }
                }

                const rssFeed = getFeedURL(getRSSfeed);

                if (rssFeed) {
                    const feed = await parser.parseURL(rssFeed);

                    res.statusCode = 200;
                    res.write(JSON.stringify({ feed: feed }));
                    res.end();
                } else {
                    res.statusCode = 200;
                    res.write(JSON.stringify({ error: "Invalid RSS Service" }));
                    res.end();
                }
            } else {
                res.statusCode = 200;
                res.write(JSON.stringify({ error: "No RSS Service Selected" }));
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
