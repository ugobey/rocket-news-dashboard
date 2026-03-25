const service_name = "Ajax";

const express = require("express");
const router = express.Router();

const fs = require("fs");

const pikudHaoref = require("pikud-haoref-api");

const { parseFeed } = require("@rowanmanning/feed-parser");

const { exec } = require("node:child_process");

const pkg = require("../package.json");
const localAppVersion = pkg.version;

const testAlertData = [
    {
        type: "missiles",
        cities: ["יבנה"],
        instructions: "ירי רקטות וטילים",
        id: "134182459160000000",
    },
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
        cities: ["שייח' דנון", "שחר", "יבנה"],
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
        cities: ["גאולים", "בת שלמה", "בת הדר", "בקוע", "כליל", "כוכב יעקב", "כפר קאסם", "כפר קרע", "כפר סבא", "לוד", "מזכרת בתיה", "מודיעין עילית", "נורדיה", "סביון", "סגולה", "מולדת", "פדואל", "קריית ענבים", "קריית מלאכי", "רעננה", "רמת השרון", "רמת גן - מזרח", "רמת גן - מערב", "רמלה", "שוהם"],
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
        cities: ["בן שמן", "בית עריף", "בית חנניה", "נווה אטי''ב"],
        instructions: "ירי רקטות וטילים",
        id: "134182459160000000",
    },
    {
        type: "hostileAircraftIntrusion",
        cities: ["בית השיטה", "ביר אלמכסור", "באר שבע - צפון", "כפר אחים", "כסלון"],
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
        cities: ["בענה", "דיר אל-אסד", "הר חלוץ", "לון", "נחף", "כסרא סמיע", "מכמנים - כמאנה מערבית", "חוסנייה", "יבנה"],
        instructions: "",
        id: "134182459160000000",
    },
    {
        type: "newsFlash",
        cities: ["גאולים", "בת שלמה", "בת הדר", "בקוע", "ליל", "כוכב יעקב", "כוכב השחר"],
        instructions: "",
        id: "134182459160000000",
    },
    {
        type: "newsFlash",
        cities: ["בענה", "דיר אל-אסד", "הר חלוץ", "לבון", "נחף"],
        instructions: "",
        id: "134182459160000000",
    },
];

router.use("/", async function (req, res) {
    try {
        const getService = req.body.service;
        const testmode = req.body.testmode;

        if (getService === "pikud_haoref") {
            const options = {};

            pikudHaoref.getActiveAlerts(function (err, alert) {
                if (err) {
                    console.log(service_name, err);
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
            const rssFeed = req.body.rssfeed;

            let response = {};

            if (rssFeed) {
                const fetchFeed = await fetch(rssFeed);
                const responseText = await fetchFeed.text();

                try {
                    const feed = parseFeed(responseText);

                    response = { feed: feed };
                } catch (error) {
                    response = { error: "INVALID_FEED" };
                }
            } else {
                response = { error: "Missing RSS URL" };
            }

            res.statusCode = 200;
            res.write(JSON.stringify(response));
            res.end();
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
        } else {
            res.statusCode = 200;
            res.write(JSON.stringify({ error: "No RSS Service Selected" }));
            res.end();
        }
    } catch (err) {
        console.log(service_name + " ERROR", err);
        res.statusCode = 500;
        res.write(JSON.stringify({ error: err.toString() }));
        res.end();
    }
});

module.exports = router;
