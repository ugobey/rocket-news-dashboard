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
        cities: ["שקף", "שרונה", "שער מנשה", "שלומציון", "משהד", "ניר משה"],
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
        cities: ["שדמות דבורה", "שדה נחמיה", "שדה יצחק", "מלונות ים המלח מרכז"],
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
        cities: ["בענה", "דיר אל-אסד", "הר חלוץ", "עמוקה", "כסרא סמיע", "מכמנים - כמאנה מערבית", "חוסנייה", "יבנה", "גאולים", "בת שלמה", "בת הדר", "בקוע", "ליל", "כוכב יעקב", "כוכב השחר", "סער", "עין ורד", "לבון", "נחף", "פורת", "פני קדם", "פנימיית עין כרם", "פסגות", "פסוטה", "פעמי תש'ז", "פצאל", "פקיעין", "פקיעין החדשה", "פרדס חנה כרכור", "פרדסיה", "פרוד", "פרי גן", "פתח תקווה", "פתחיה", "צאלים", "צבעון", "צובה", "צוחר, אוהד", "צומת אלמוג", "צומת הגוש", "צופים", "צופית", "צופר", "צוקים", "צור הדסה", "צור יצחק", "צור משה", "צור נתן", "צוריאל", "צורית גילון", "ציפורי", "צלפון", "צמח", "צפריה", "צפרירים", "צפת - נוף כנרת", "צפת - עיר", "צפת - עכברה", "צרופה", "צרעה", "קבוצת גבע", "קבוצת יבנה", "קדומים", "קדימה צורן", "קדיתא", "קדם ערבה", "קדמה", "קדמת צבי", "קדר", "קדר דרום", "קדרון", "קדרים", "קדש ברנע", "קוממיות", "קורנית", "קטורה", "קיבוץ דן", "קיבוץ מגידו", "קידה", "קיסריה", "קלחים", "קליה", "קלנסווה", "קלע אלון", "קסר א-סר", "קציר", "קצרין", "קצרין - אזור תעשייה", "קריית אונו", "קריית אתא", "קריית ביאליק", "קריית גת, כרמי גת", "קריית חינוך מרחבים", "קריית טבעון - בית זייד", "קריית ים", "קריית יערים", "קריית מוצקין", "קריית מלאכי", "קריית נטפים", "קריית ענבים", "קריית עקרון", "קריית שמונה", "קרית ארבע", "קרני שומרון", "קשת", "ראמה", "ראס אל-עין", "ראס עלי", "ראש הנקרה", "ראש העין", "ראש פינה", "ראש צורים", "ראשון לציון - מזרח", "ראשון לציון - מערב", "רבבה", "רבדים", "רביבים", "רביד", "רגבה", "רגבים", "רהט", "רווחה", "רוויה", "רוחמה", "רומת אל הייב", "רועי", "רותם", "רחוב", "רחובות", "רחלים", "ריחן", "ריינה", "רימונים", "רינתיה", "רכסים", "רם און", "רמות", "רמות השבים", "רמות מאיר", "רמות מנשה", "רמות נפתלי", "רמלה", "רמת גן - מזרח", "רמת גן - מערב", "רמת דוד", "רמת הכובש", "רמת השופט", "רמת השרון", "רמת טראמפ", "רמת יוחנן", "רמת ישי", "רמת מגרון", "רמת מגשימים", "רמת צבי", "רמת רזיאל", "רנן", "רעים", "רעננה", "רקפת", "רשפון", "רשפים, שלוחות, שלפים", "רתמים", "שאנטי במדבר", "שאר ישוב", "שבות רחל", "שבי דרום", "שבי ציון", "שבי שומרון", "שגב שלום", "שדה אילן", "שדה אליהו", "שדה אליעזר", "שדה אפרים", "שדה בועז", "שדה בוקר", "שדה בר", "שדה דוד", "שדה ורבורג", "שדה יואב", "שדה יעקב", "שדה יצחק", "שדה משה", "שדה נחום", "שדה נחמיה", "שדה ניצן", "שדה עוזיהו", "שדה צבי", "שדות ים", "שדות מיכה", "שדי אברהם", "שדי חמד", "שדי תרומות", "שדמה", "שדמות דבורה", "שדמות מחולה", "שדרות, איבים"],
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
