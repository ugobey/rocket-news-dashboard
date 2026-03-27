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
    //Dan Missile Alert
    {
        type: "missiles",
        cities: ["אור יהודה", "אזור", "בחלק מהאזורים בארץ", "בני ברק", "בת ים", "גבעת השלושה", "גבעת שמואל", "גבעתיים", "גני תקווה", "גת רימון", "הרצליה - מערב", "הרצליה - מרכז וגליל ים", "חולון", "יהוד מונוסון", "כפר סירקין", "כפר שמריהו"],
        instructions: "ירי רקטות וטילים",
        id: "134182459160000000",
    },
    //Dan Hostile Aircraft Intrusion Alert
    {
        type: "hostileAircraftIntrusion",
        cities: ["מגשימים", "מעש", "מקווה ישראל", "מתחם גלילות", "מתחם פי גלילות", "סביון", "פארק אריאל שרון", "פתח תקווה", "קריית אונו", "רמת גן - מזרח", "רמת גן - מערב", "רמת השרון", "תל אביב - דרום העיר ויפו", "תל אביב - מזרח", "תל אביב - מרכז העיר", "תל אביב - עבר הירקון"],
        instructions: "ירי רקטות וטילים",
        id: "134182459160000000",
    },
    //Gaza Envelope Rocket Alert
    {
        type: "missiles",
        cities: ["חוף זיקים", "חניון רעים אנדרטת הנובה", "יבול", "יד מרדכי", "יכיני", "יתד", "כיסופים", "כפר מימון ותושיה", "כפר עזה", "כרם שלום", "כרמיה", "מבטחים, עמיעוז, ישע", "מגן", "מטווח ניר עם", "מפלסים", "נווה"],
        instructions: "ירי רקטות וטילים",
        id: "134182459160000000",
    },
    //Upper Galilee Hostile Aircraft Intrusion Alert
    {
        type: "hostileAircraftIntrusion",
        cities: ["מגדל תפן", "מזרעה", "מחניים", "מירון", "מנחת מחניים", "מרכז אזורי מרום גליל", "מרכז אזורי רמת כורזים", "משמר הירדן", "נחף", "נס עמים", "נתיב השיירה", "סאג'ור", "ספסופה - כפר חושן", "עין אל אסד", "עין המפרץ", "עכו", "עכו - אזור תעשייה", "עכו - רמות ים"],
        instructions: "ירי רקטות וטילים",
        id: "134182459160000000",
    },
    //Early Warning Started Alert
    {
        type: "newsFlash",
        cities: [
            "בענה",
            "דיר אל-אסד",
            "הר חלוץ",
            "עמוקה",
            "כסרא סמיע",
            "מכמנים - כמאנה מערבית",
            "חוסנייה",
            "יבנה",
            "גאולים",
            "בת שלמה",
            "בת הדר",
            "בקוע",
            "ליל",
            "כוכב יעקב",
            "כוכב השחר",
            "סער",
            "עין ורד",
            "לבון",
            "נחף",
            "פורת",
            "פני קדם",
            "פנימיית עין כרם",
            "פסגות",
            "פסוטה",
            "פעמי תש'ז",
            "פצאל",
            "פקיעין",
            "פקיעין החדשה",
            "פרדס חנה כרכור",
            "פרדסיה",
            "פרוד",
            "פרי גן",
            "פתח תקווה",
            "פתחיה",
            "צאלים",
            "צבעון",
            "צובה",
            "צוחר, אוהד",
            "צומת אלמוג",
            "צומת הגוש",
            "צופים",
            "צופית",
            "צופר",
            "צוקים",
            "צור הדסה",
            "צור יצחק",
            "צור משה",
            "צור נתן",
            "צוריאל",
            "צורית גילון",
            "ציפורי",
            "צלפון",
            "צמח",
            "צפריה",
            "צפרירים",
            "צפת - נוף כנרת",
            "צפת - עיר",
            "צפת - עכברה",
            "צרופה",
            "צרעה",
            "קבוצת גבע",
            "קבוצת יבנה",
            "קדומים",
            "קדימה צורן",
            "קדיתא",
            "קדם ערבה",
            "קדמה",
            "קדמת צבי",
            "קדר",
            "קדר דרום",
            "קדרון",
            "קדרים",
            "קדש ברנע",
            "קוממיות",
            "קורנית",
            "קטורה",
            "קיבוץ דן",
            "קיבוץ מגידו",
            "קידה",
            "קיסריה",
            "קלחים",
            "קליה",
            "קלנסווה",
            "קלע אלון",
            "קסר א-סר",
            "קציר",
            "קצרין",
            "קצרין - אזור תעשייה",
            "קריית אונו",
            "קריית אתא",
            "קריית ביאליק",
            "קריית גת, כרמי גת",
            "קריית חינוך מרחבים",
            "קריית טבעון - בית זייד",
            "קריית ים",
            "קריית יערים",
            "קריית מוצקין",
            "קריית מלאכי",
            "קריית נטפים",
            "קריית ענבים",
            "קריית עקרון",
            "קריית שמונה",
            "קרית ארבע",
            "קרני שומרון",
            "קשת",
            "ראמה",
            "ראס אל-עין",
            "ראס עלי",
            "ראש הנקרה",
            "ראש העין",
            "ראש פינה",
            "ראש צורים",
            "ראשון לציון - מזרח",
            "ראשון לציון - מערב",
            "רבבה",
            "רבדים",
            "רביבים",
            "רביד",
            "רגבה",
            "רגבים",
            "רהט",
            "רווחה",
            "רוויה",
            "רוחמה",
            "רומת אל הייב",
            "רועי",
            "רותם",
            "רחוב",
            "רחובות",
            "רחלים",
            "ריחן",
            "ריינה",
            "רימונים",
            "רינתיה",
            "רכסים",
            "רם און",
            "רמות",
            "רמות השבים",
            "רמות מאיר",
            "רמות מנשה",
            "רמות נפתלי",
            "רמלה",
            "רמת גן - מזרח",
            "רמת גן - מערב",
            "רמת דוד",
            "רמת הכובש",
            "רמת השופט",
            "רמת השרון",
            "רמת טראמפ",
            "רמת יוחנן",
            "רמת ישי",
            "רמת מגרון",
            "רמת מגשימים",
            "רמת צבי",
            "רמת רזיאל",
            "רנן",
            "רעים",
            "רעננה",
            "רקפת",
            "רשפון",
            "רשפים, שלוחות, שלפים",
            "רתמים",
            "שאנטי במדבר",
            "שאר ישוב",
            "שבות רחל",
            "שבי דרום",
            "שבי ציון",
            "שבי שומרון",
            "שגב שלום",
            "שדה אילן",
            "שדה אליהו",
            "שדה אליעזר",
            "שדה אפרים",
            "שדה בועז",
            "שדה בוקר",
            "שדה בר",
            "שדה דוד",
            "שדה ורבורג",
            "שדה יואב",
            "שדה יעקב",
            "שדה יצחק",
            "שדה משה",
            "שדה נחום",
            "שדה נחמיה",
            "שדה ניצן",
            "שדה עוזיהו",
            "שדה צבי",
            "שדות ים",
            "שדות מיכה",
            "שדי אברהם",
            "שדי חמד",
            "שדי תרומות",
            "שדמה",
            "שדמות דבורה",
            "שדמות מחולה",
            "שדרות, איבים",
        ],
        instructions: "",
        id: "134182459160000000",
    },
    //Early Warning Ended Alert
    {
        type: "newsFlash",
        cities: ["שדמות דבורה", "שדה נחמיה", "שדה יצחק"],
        instructions: "האירוע הסתיים",
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
