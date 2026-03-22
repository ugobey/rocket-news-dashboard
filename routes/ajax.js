const service_name = "Ajax";

const express = require("express");
const router = express.Router();

const sharedFunction = require("../shared/functions.js");
const errorHandler = sharedFunction.errorHandler;

const fs = require("fs");

const pikudHaoref = require("pikud-haoref-api");
const Parser = require("rss-parser");
const parser = new Parser();

const { spawn, exec } = require("node:child_process");

const pkg = require("../package.json");
const localAppVersion = pkg.version;

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
        cities: ["שייח' דנון", "שחר", "שורש", "דוב״ב"],
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
        type: "missiles",
        cities: ["גאולים", "בת שלמה", "בת הדר", "בקוע"],
        instructions: "ירי רקטות וטילים",
        id: "134182459160000000",
    },
    {
        type: "hostileAircraftIntrusion",
        cities: ["גני יוחנן", "גורן", "גבעת עדה"],
        instructions: "ירי רקטות וטילים",
        id: "134182459160000000",
    },
    {
        type: "missiles",
        cities: ["בן שמן", "בית עריף", "בית ניר", "בית חנניה"],
        instructions: "ירי רקטות וטילים",
        id: "134182459160000000",
    },
    {
        type: "hostileAircraftIntrusion",
        cities: ["בית השיטה", "ביר אלמכסור", "באר שבע - צפון"],
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
        cities: ["בענה", "דיר אל-אסד", "הר חלוץ", "לבון", "נחף", "כסרא סמיע", "מכמנים - כמאנה מערבית", "חוסנייה"],
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
            } else if (getService === "version_check") {
                exec("npm view git@github.com:ugobey/rocket-news-dashboard.git version", (error, stdout, stderr) => {
                    if (error) {
                        res.statusCode = 500;
                        res.write(JSON.stringify({ error: error.toString() }));
                        res.end();
                        return;
                    }

                    const latestVersion = stdout.trim();

                    if (localAppVersion !== latestVersion) {
                        res.statusCode = 200;
                        res.write(JSON.stringify({ updateAvailable: true, latestVersion: latestVersion }));
                        res.end();
                    } else {
                        res.statusCode = 200;
                        res.write(JSON.stringify({ updateAvailable: false, latestVersion: latestVersion }));
                        res.end();
                    }
                });
            } else if (getService === "update_app") {
                exec("git pull origin && npm install", (error, stdout, stderr) => {
                    if (error) {
                        res.statusCode = 500;
                        res.write(JSON.stringify({ error: error.toString() }));
                        res.end();
                        return;
                    }

                    res.statusCode = 200;
                    res.write(JSON.stringify({ updated: true }));
                    res.end();

                    // Spawn a new process with the same arguments as current process
                    const args = process.argv.slice(1); // remove node binary
                    const child = spawn(process.argv[0], args, {
                        cwd: process.cwd(),
                        detached: true, // very important!
                    });

                    // Optional: you can listen to errors
                    child.on("error", (err) => {
                        console.error("Failed to spawn restart:", err);
                    });

                    // Exit current process → new one takes over
                    process.exit(0);
                });
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
