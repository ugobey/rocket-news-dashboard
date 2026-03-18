const service_name = "Ajax";

const express = require("express");
const router = express.Router();

const sharedFunction = require("../shared/functions.js");
const errorHandler = sharedFunction.errorHandler;

const fs = require("fs");

const pikudHaoref = require("pikud-haoref-api");
const Parser = require("rss-parser");
const parser = new Parser();

const testAlertData = [
    {
        type: "missiles",
        cities: ["בענה", "דיר אל-אסד", "הר חלוץ", "לבון", "נחף", "כסרא סמיע", "מכמנים - כמאנה מערבית", "חוסנייה"],
        instructions: "ירי רקטות וטילים",
        id: "134182459160000000",
    },
    {
        type: "hostileAircraftIntrusion",
        cities: ["שקף", "שרונה", "שער מנשה", "שלומציון"],
        instructions: "ירי רקטות וטילים",
        id: "134182459160000000",
    },
    {
        type: "missiles",
        cities: ["שייח' דנון", "שחר", "שורש"],
        instructions: "ירי רקטות וטילים",
        id: "134182459160000000",
    },
    {
        type: "hostileAircraftIntrusion",
        cities: ["שדמות דבורה", "שדה נחמיה", "שדה יצחק"],
        instructions: "ירי רקטות וטילים",
        id: "134182459160000000",
    },
    {
        type: "newsFlash",
        cities: ["שדמות דבורה", "שדה נחמיה", "שדה יצחק"],
        instructions: "האירוע הסתיים",
        id: "134182459160000000",
    },
     {
        type: "newsFlash",
        cities: ["שדמות דבורה", "שדה נחמיה", "שדה יצחק"],
        instructions: "",
        id: "134182459160000000",
    },
];

router.use("/", function (req, res) {
    try {
        (async () => {
            const getService = req.body.service;
            const testmode = req.body.testmode;

            if (getService === "pikud_haoref") {
                const options = {};

                pikudHaoref.getActiveAlerts(function (err, alert) {
                    if (err) {
                        errorHandler(service_name, err);
                        fs.appendFileSync("./logs/pikudHaoref_errors.txt", err + "\n\n");

                        res.statusCode = 200;
                        res.write(JSON.stringify({ error: err.toString() }));
                        res.end();
                        return;
                    }

                    if (testmode === "true") {
                        alert = [testAlertData[Math.floor(Math.random() * testAlertData.length)]];
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
                            return "https://www.jpost.com/rss/rssfeedsfrontpage.aspx";
                        case "RSSynet":
                            return "https://www.ynet.co.il/Integration/StoryRss3082.xml";
                        case "RSSbnn":
                            return "https://www.bernie.news/api/news/rss";
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
            }),
        );
    } catch (err) {
        errorHandler(service_name, "Error : " + err);
        res.statusCode = 500;
        res.write(JSON.stringify({ error: err.toString() }));
        res.end();
    }
});

module.exports = router;
