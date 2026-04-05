// ==================== APPLICATION STATE ====================
// Accumulator arrays — each entry is an object {location, counter} or {zone, counter}
let alertsActive = false; // True while at least one active alert is ongoing (used to gate certain features until the first alert arrives)
let allowMapAutoMaximization = true; // When true, the map will automatically maximize when a new location alert is received. Can be disabled in settings.
let alertedLocations = []; // All unique locations that have received alerts this session
let alertedZones = []; // All unique zones that have received alerts this session
let errorLogs = []; // Unique Pikud HaOref error messages with occurrence counts
let unmatchedCitiesLogs = []; // Location names that couldn't be found in locationMap
let earlyWarningLocations = []; // Cities currently under an active early-warning (newsFlash)
let lastAlertedTimes = []; // Last unique times when alerts occurred (HH:mm format)
let pikudHaorefAlertHistory = []; // Newest-first list of rows shown in pikud_haoref_alerts

// Summary counters reflected in the Alerts Summary table
let rocketAlertCounter = 0; // Missile alert rows received
let droneAlertCounter = 0; // Hostile aircraft intrusion rows received
let generalAlertCounter = 0; // General alert rows received (non-missile, non-drone)
let earthquakeAlertCounter = 0; // Earthquake alert rows received
let radiologicalEventAlertCounter = 0; // Radiological event alert rows received
let tsunamiAlertCounter = 0; // Tsunami alert rows received
let hazardousMaterialsAlertCounter = 0; // Hazardous materials alert rows received
let terroristInfiltrationAlertCounter = 0; // Terrorist infiltration alert rows received

let totalEarlyWarningsAllCounter = 0; // Early warnings for any location
let totalEarlyWarningsSpecificCounter = 0; // Early warnings that include the user's saved city
let pikudHaorefErrorCounter = 0; // Total fetch errors from Pikud HaOref
let totalUnmatchedCitiesCounter = 0; // Total alerts for unrecognised location names

// Boolean flags for UI state
let pikudHaorefError = false; // True once the first Pikud HaOref error has occurred
let unmatchedCitiesFlag = false; // True once the first unmatched city has been logged
let earlyWarningActive = false; // True while an early-warning (newsFlash) alert is ongoing
let testmode = null; // When true, the server returns hardcoded mock alert data
let testModeTimeoutHandle = null; // Auto-disables test mode after the configured timeout
let soundAlertsEnabled = localStorage.getItem("soundAlertsEnabled") === "true"; // Controls whether live alerts play a short beep

let alertAudioContext = null;
let lastAlertSoundAtMs = 0;

const earlyWarningDurationMS = 5 * 60 * 1000; // Early warning countdown uses a fixed 5-minute duration
const alertedLocationsDedupSeconds = 65; // When a location receives an alert, ignore new alerts for the same location for 65 seconds to prevent spamming (Pikud HaOref can be noisy with repeated alerts for the same location)
const markerDurationMs = 70000; // Map markers for alerted locations last for 70 seconds before automatically disappearing
const testModeDurationMs = 60000; // Keep test mode enabled for 60 seconds max
const testModeMarkersDurationMs = 10000; // Test mode markers last for 10 seconds
const recentlyAlertedLocations = {}; // Dedup cache: location → Unix timestamp of last alert row added
const pikudHaorefHistoryStorageKey = "pikudHaorefHistoryV1";
const maxPersistedPikudRows = 250;
const websocketReconnectDelayMs = 3000;

const currentAppVersion = window.__appConfig?.appVersion || ""; // Injected via window.__appConfig

let dashboardSocket = null;
let websocketReconnectTimeoutHandle = null;

function getErrorMessage(error, fallback = "Unknown error") {
    if (!error) {
        return fallback;
    }

    if (typeof error === "string") {
        return error;
    }

    if (error instanceof Error && error.message) {
        return error.message;
    }

    if (error.message) {
        return String(error.message);
    }

    return fallback;
}

function logClientError(context, error, details) {
    const message = getErrorMessage(error);
    if (details) {
        console.error(`[${context}] ${message}`, {
            error,
            details,
        });
        return;
    }

    console.error(`[${context}] ${message}`, error);
}

function sendWebsocketMessage(payload) {
    if (!dashboardSocket || dashboardSocket.readyState !== WebSocket.OPEN) {
        return;
    }

    dashboardSocket.send(JSON.stringify(payload));
}

// ==================== LIVE CLOCK ====================
// Refreshes the HH:MM:SS badge in the alert panel header every second.
function updateClock() {
    const now = new Date();
    // padStart(2, '0') ensures single-digit values are zero-padded (e.g. '9' → '09')
    const h = String(now.getHours()).padStart(2, "0");
    const m = String(now.getMinutes()).padStart(2, "0");
    const s = String(now.getSeconds()).padStart(2, "0");

    const timeString = `${h}:${m}:${s}`;

    // Write the formatted time into the clock badge element
    const clockHeader = document.getElementById("liveClock");
    if (clockHeader) clockHeader.textContent = timeString;
}

updateClock(); // Run immediately to avoid a 1-second blank on page load

// ==================== PERIODIC DOM MAINTENANCE ====================
// After 5 seconds, strip the highlight classes added when a row first appears.
// This gives users a brief visual cue for new rows without permanently disrupting the table's uniform appearance.
setInterval(() => {
    $(".newRow").removeClass("table-light text-dark newRow");
}, 5000);

// ==================== BOOTSTRAP MODAL INSTANCES ====================
// Pre-instantiating modals avoids creation overhead on first show.
const earlyWarningModalEnter = new bootstrap.Modal("#earlyWarningModalEnter"); // Red danger — active missile warning
const earlyWarningModalExit = new bootstrap.Modal("#earlyWarningModalExit"); // Green success — all-clear signal
const errorMessagesModal = new bootstrap.Modal("#errorMessagesModal"); // List of unique Pikud HaOref fetch errors
const unmatchedCitiesModal = new bootstrap.Modal("#unmatchedCitiesModal"); // Locations the app couldn't map to locationMap
const settingsModal = new bootstrap.Modal("#settingsModal"); // User preferences (city selection)

// ==================== EARLY WARNING TIMER ====================
let earlyWarningCountdownInterval = null;

function resetEarlyWarningDisplay() {
    $("#earlyWarningCountdown").text("");
    $("#earlyWarningOpenedAt").text("");
}

function finishEarlyWarning(reason, options = {}) {
    const { showExitModal = false, keepLifecycleActive = false } = options;

    clearEarlyWarningTimer();

    if (earlyWarningModalEnter._isShown) {
        earlyWarningModalEnter.hide();
    }

    resetEarlyWarningDisplay();

    if (!keepLifecycleActive) {
        earlyWarningLocations = [];
        earlyWarningActive = false;
        $("#earlyWarningLocations").text("");
    }

    if (showExitModal) {
        if (!earlyWarningModalExit._isShown) {
            earlyWarningModalExit.show();
        }

        setTimeout(() => {
            if (earlyWarningModalExit._isShown) {
                earlyWarningModalExit.hide();
            }
        }, 10000);
    }
}

function startEarlyWarningTimer() {
    // Show the time the modal opened
    const now = new Date();
    const h = String(now.getHours()).padStart(2, "0");
    const m = String(now.getMinutes()).padStart(2, "0");
    const s = String(now.getSeconds()).padStart(2, "0");
    $("#earlyWarningOpenedAt").text(`${h}:${m}:${s}`);

    // Clear any existing countdown
    clearEarlyWarningTimer();

    let remaining = earlyWarningDurationMS;

    function updateDisplay() {
        const mins = String(Math.floor(remaining / 60000)).padStart(1, "0");
        const secs = String(Math.floor((remaining % 60000) / 1000)).padStart(2, "0");
        const el = $("#earlyWarningCountdown");
        if (el) el.text(`${mins}:${secs}`);
    }

    function tick() {
        remaining -= 1000;
        if (remaining < 0) remaining = 0;

        updateDisplay();

        if (remaining <= 0) {
            finishEarlyWarning("timer-expired");
        }
    }

    updateDisplay(); // Show the full dynamic duration immediately (before any countdown)
    earlyWarningCountdownInterval = setInterval(tick, 1000);
}

function clearEarlyWarningTimer() {
    if (earlyWarningCountdownInterval !== null) {
        clearInterval(earlyWarningCountdownInterval);
        earlyWarningCountdownInterval = null;
    }
}

// ==================== EVENT HANDLERS ====================
function isFullscreenActive() {
    return Boolean(document.fullscreenElement || document.webkitFullscreenElement);
}

function updateFullscreenToggleUI() {
    const icon = $("#fullscreen_icon");

    if (!icon.length) {
        return;
    }

    if (isFullscreenActive()) {
        icon.attr("title", "Exit Fullscreen");
        icon.removeClass("fa-expand").addClass("fa-compress");
    } else {
        icon.attr("title", "Enter Fullscreen");
        icon.removeClass("fa-compress").addClass("fa-expand");
    }
}

function setSoundAlertsUI(enabled) {
    const icon = $("#sound_alerts_icon");

    if (!icon.length) {
        return;
    }

    if (enabled) {
        icon.attr("title", "Turn off Sound Alerts");
        icon.removeClass("fa-bell-slash text-light").addClass("fa-bell text-danger");
    } else {
        icon.attr("title", "Turn on Sound Alerts");
        icon.removeClass("fa-bell text-danger").addClass("fa-bell-slash text-light");
    }
}

function setClearPikudHistoryButtonVisibility(isVisible) {
    $("#clear_pikud_history_row").toggle(Boolean(isVisible));
}

function syncClearPikudHistoryIconState() {
    const icon = $("#clear_pikud_history_icon");

    if (!icon.length) {
        return;
    }

    const hasPersistedHistory = localStorage.getItem(pikudHaorefHistoryStorageKey) !== null;
    icon.toggleClass("text-danger", hasPersistedHistory);
    icon.toggleClass("text-light", !hasPersistedHistory);
}

function ensureAlertAudioContext() {
    if (!alertAudioContext) {
        const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextCtor) {
            return null;
        }

        alertAudioContext = new AudioContextCtor();
    }

    if (alertAudioContext.state === "suspended") {
        alertAudioContext.resume().catch(() => {});
    }

    return alertAudioContext;
}

function playAlertSound() {
    if (!soundAlertsEnabled) {
        return;
    }

    const now = Date.now();
    // Prevent rapid duplicate beeps when multiple rows are added in the same second.
    if (now - lastAlertSoundAtMs < 750) {
        return;
    }

    const context = ensureAlertAudioContext();
    if (!context) {
        return;
    }

    try {
        const oscillator = context.createOscillator();
        const gainNode = context.createGain();

        oscillator.type = "square";
        oscillator.frequency.setValueAtTime(920, context.currentTime);
        oscillator.connect(gainNode);
        gainNode.connect(context.destination);

        gainNode.gain.setValueAtTime(0.0001, context.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.015);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.22);

        oscillator.start(context.currentTime);
        oscillator.stop(context.currentTime + 0.24);
        lastAlertSoundAtMs = now;
    } catch (error) {
        console.log("Alert sound playback failed:", error);
    }
}

$("#fullscreen_icon").on("click", async function () {
    try {
        if (!isFullscreenActive()) {
            const rootElement = document.documentElement;

            if (rootElement.requestFullscreen) {
                await rootElement.requestFullscreen();
            } else if (rootElement.webkitRequestFullscreen) {
                rootElement.webkitRequestFullscreen();
            }
        } else if (document.exitFullscreen) {
            await document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        }
    } catch (error) {
        console.log("Fullscreen toggle failed:", error);
    } finally {
        updateFullscreenToggleUI();
    }
});

document.addEventListener("fullscreenchange", updateFullscreenToggleUI);
document.addEventListener("webkitfullscreenchange", updateFullscreenToggleUI);
updateFullscreenToggleUI();
setSoundAlertsUI(soundAlertsEnabled);

["click", "keydown", "touchstart"].forEach((eventName) => {
    document.addEventListener(eventName, ensureAlertAudioContext, {
        once: true,
    });
});

function setTestModeUI(enabled) {
    if (enabled) {
        $("#test_mode_icon").attr("title", "Turn off Test Mode");
        $("#test_mode_icon").removeClass("fa-play text-light").addClass("fa-stop text-danger");
    } else {
        $("#test_mode_icon").attr("title", "Turn on Test Mode");
        $("#test_mode_icon").removeClass("fa-stop text-danger").addClass("fa-play text-light");
        alertsActive = false; // Reset this so that when test mode is re-enabled, the first alert will trigger all the usual "first alert" behaviors (map auto-maximization, early warning modal, etc)
    }
}

function disableTestMode() {
    testmode = null;

    if (testModeTimeoutHandle !== null) {
        clearTimeout(testModeTimeoutHandle);
        testModeTimeoutHandle = null;
    }

    setTestModeUI(false);
    sendWebsocketMessage({
        type: "set_test_mode",
        testmode: null,
    });
}

function enableTestMode() {
    testmode = $("#test_mode_type").val();
    setTestModeUI(true);

    if (testModeTimeoutHandle !== null) {
        clearTimeout(testModeTimeoutHandle);
    }

    // Safety timeout so test mode cannot stay active indefinitely.
    testModeTimeoutHandle = setTimeout(function () {
        disableTestMode();
    }, testModeDurationMs);

    sendWebsocketMessage({
        type: "set_test_mode",
        testmode,
    });
}

// Test mode toggle: enables/disables the selected mock scenario and updates
// the icon state (play when inactive, stop when active).
$("#test_mode_icon").on("click", function () {
    if (testmode) {
        disableTestMode();
    } else {
        enableTestMode();
    }
});

$("#sound_alerts_icon").on("click", function () {
    soundAlertsEnabled = !soundAlertsEnabled;
    localStorage.setItem("soundAlertsEnabled", String(soundAlertsEnabled));
    setSoundAlertsUI(soundAlertsEnabled);

    if (soundAlertsEnabled) {
        ensureAlertAudioContext();
        playAlertSound();
    }
});

// Show the error log modal listing all unique Pikud HaOref fetch errors
$("#show_error_messages").on("click", function () {
    errorMessagesModal.show();
});

// Show the unmatched cities modal for locations not found in locationMap
$("#show_unmatched_cities").on("click", function () {
    unmatchedCitiesModal.show();
});

// Pre-fill the city search input with the user's previously saved city before opening settings
$("#open_settings_icon").on("click", function () {
    const savedCityEn = localStorage.getItem("earlyWarningCity");
    if (savedCityEn) {
        const lang = getCurrentLang();
        if (lang === "he") {
            // Translate saved English name back to Hebrew for display
            const cityEntry = locationsJSON.find((c) => c.name_en === savedCityEn);
            $("#citySearch").val(cityEntry ? cityEntry.name : savedCityEn);
            if ($("#citySearch")[0]) $("#citySearch")[0].dataset.cityEn = savedCityEn;
        } else {
            $("#citySearch").val(savedCityEn);
        }
    }
    settingsModal.show();
});

$("#update_app_version_icon").on("click", function () {
    window.document.location.reload(true);
});

// Persist the selected city to localStorage; always save the English name for consistent lookup
$("#saveCityButton").on("click", function () {
    // dataset.cityEn is set when the user selects from autocomplete in Hebrew mode
    const cityInput = $("#citySearch");
    const cityEn = cityInput[0]?.dataset?.cityEn;
    const city = cityEn || cityInput.val().trim();

    if (city) {
        localStorage.setItem("earlyWarningCity", city); // Save English name
    } else {
        localStorage.removeItem("earlyWarningCity"); // Clear when user blanks the field
    }

    if (cityInput[0]) cityInput[0].dataset.cityEn = ""; // Reset helper attribute
    settingsModal.hide();
});

$("#clear_pikud_history_icon").on("click", function () {
    localStorage.removeItem(pikudHaorefHistoryStorageKey);
    syncClearPikudHistoryIconState();
    window.location.reload();
});

const themeStorageKey = "cssTheme";
// Load settings with defensive defaults so unsupported/stale values do not break UI state.
const supportedCssThemes = Array.from(document.querySelectorAll("#css_style_theme option"))
    .map((option) => option.value)
    .filter(Boolean);
const storedCssTheme = localStorage.getItem(themeStorageKey);
const initialCssTheme = supportedCssThemes.includes(storedCssTheme) ? storedCssTheme : "graphite";
const supportedTestModeTypes = ["alertByCity", "alertByRegion", "earlyWarning", "nonMissileUAV"];
const storedTestModeType = localStorage.getItem("testModeType");
const initialTestModeType = supportedTestModeTypes.includes(storedTestModeType) ? storedTestModeType : "alertByCity";
const storedAllowMapAutoMaximization = localStorage.getItem("allowMapAutoMaximization");
const storedPreventMapAutoMaximization = localStorage.getItem("preventMapAutoMaximization");
const initialAllowMapAutoMaximization = storedAllowMapAutoMaximization !== null ? storedAllowMapAutoMaximization === "true" : storedPreventMapAutoMaximization !== null ? storedPreventMapAutoMaximization !== "true" : true;

// Persist only cssTheme and remove the deprecated key if present.
localStorage.setItem(themeStorageKey, initialCssTheme);
localStorage.setItem("testModeType", initialTestModeType);
localStorage.setItem("allowMapAutoMaximization", initialAllowMapAutoMaximization);

if (storedPreventMapAutoMaximization !== null) {
    localStorage.removeItem("preventMapAutoMaximization");
}

// Auto-scroll toggle handlers
// Track which table auto-scroll features are enabled.
const supportedLanguages = ["en", "he"];
const storedUiLanguage = localStorage.getItem("uiLanguage");
const initialUiLanguage = supportedLanguages.includes(storedUiLanguage) ? storedUiLanguage : "en";

const settingStates = {
    pikudHaoref: localStorage.getItem("autoScrollPikudHaoref") === "true",
    zones: localStorage.getItem("autoScrollZones") === "true",
    locations: localStorage.getItem("autoScrollLocations") === "true",
    lastAlertedTimes: localStorage.getItem("autoScrollLastAlertedTimes") === "true",
    rss: localStorage.getItem("autoScrollRss") === "true",
    earlyWarning: localStorage.getItem("autoScrollEarlyWarning") !== "false",
    allowMapAutoMaximization: initialAllowMapAutoMaximization,
    testModeType: initialTestModeType,
    soundAlertsEnabled: localStorage.getItem("soundAlertsEnabled") === "true",
    cssTheme: initialCssTheme,
    persistHistory: localStorage.getItem("persistHistory") !== "false",
    language: initialUiLanguage,
};

soundAlertsEnabled = settingStates.soundAlertsEnabled;
allowMapAutoMaximization = settingStates.allowMapAutoMaximization;
setSoundAlertsUI(soundAlertsEnabled);
setClearPikudHistoryButtonVisibility(settingStates.persistHistory);
syncClearPikudHistoryIconState();

function applyDashboardTheme(themeName) {
    const selectedTheme = "/css/themes/" + themeName + ".css?" + (window.__appConfig?.randomKey || "");
    const themeStylesheet = document.getElementById("dashboardThemeStylesheet");

    if (themeStylesheet) {
        themeStylesheet.setAttribute("href", selectedTheme);
    }
}

applyDashboardTheme(settingStates.cssTheme);

// Runtime flags consumed by the scroller utilities.
let pikudHaorefAutoScrollEnabled = settingStates.pikudHaoref;
let locationsAutoScrollEnabled = settingStates.locations;
let zonesAutoScrollEnabled = settingStates.zones;
let lastAlertedTimesAutoScrollEnabled = settingStates.lastAlertedTimes;
let rssAutoScrollEnabled = settingStates.rss;
let earlyWarningAutoScrollEnabled = true;

// Initialize toggle states on load
document.addEventListener("DOMContentLoaded", () => {
    $("#toggle_pikud_scroll").prop("checked", settingStates.pikudHaoref);
    $("#toggle_zones_scroll").prop("checked", settingStates.zones);
    $("#toggle_locations_scroll").prop("checked", settingStates.locations);
    $("#toggle_last_alerted_times_scroll").prop("checked", settingStates.lastAlertedTimes);
    $("#toggle_rss_scroll").prop("checked", settingStates.rss);
    $("#toggle_early_warning_scroll").prop("checked", settingStates.earlyWarning);
    $("#toggle_allow_map_auto_maximization").prop("checked", settingStates.allowMapAutoMaximization);
    $("#test_mode_type").val(settingStates.testModeType);
    $("#css_style_theme").val(settingStates.cssTheme);
    $("#toggle_persist_history").prop("checked", settingStates.persistHistory);
    $("#ui_language").val(settingStates.language);
    applyLanguage(settingStates.language);
});

// Stop functions for each autoscroller
function stopPikudHaorefAutoScroll() {
    pikudHaorefAutoScrollEnabled = false;
    const pikudFeed = document.getElementById("pikud_haoref_feed");
    if (pikudFeed) pikudFeed.scrollTop = 0;
}

function stopAlertLocationsAutoScroll() {
    locationsAutoScrollEnabled = false;
    const locationsFeed = document.getElementById("locations_feed");
    if (locationsFeed) locationsFeed.scrollTop = 0;
}

function stopAlertZonesAutoScroll() {
    zonesAutoScrollEnabled = false;
    const zonesFeed = document.getElementById("zones_feed");
    if (zonesFeed) zonesFeed.scrollTop = 0;
}

function stopLastAlertedTimesAutoScroll() {
    lastAlertedTimesAutoScrollEnabled = false;
    const timesFeed = document.getElementById("last_alerted_times_feed");
    if (timesFeed) timesFeed.scrollTop = 0;
}

function stopRssAutoScroll() {
    rssAutoScrollEnabled = false;
    const rssFeed = document.getElementById("rss_feed");
    if (rssFeed) rssFeed.scrollTop = 0;
}

function stopEarlyWarningAutoScroll() {
    earlyWarningAutoScrollEnabled = false;
    const earlyWarningFeed = document.getElementById("early_warning_feed");
    if (earlyWarningFeed) earlyWarningFeed.scrollTop = 0;
}

// Pikud HaOref auto-scroll toggle
$("#toggle_pikud_scroll").on("change", function () {
    settingStates.pikudHaoref = $(this).is(":checked");
    localStorage.setItem("autoScrollPikudHaoref", settingStates.pikudHaoref);

    if (settingStates.pikudHaoref && typeof startPikudHaorefAutoScroll === "function") {
        pikudHaorefAutoScrollEnabled = true;
        startPikudHaorefAutoScroll();
    } else {
        stopPikudHaorefAutoScroll();
    }
});

// Zones auto-scroll toggle
$("#toggle_zones_scroll").on("change", function () {
    settingStates.zones = $(this).is(":checked");
    localStorage.setItem("autoScrollZones", settingStates.zones);

    if (settingStates.zones && typeof startAlertZonesAutoScroll === "function") {
        zonesAutoScrollEnabled = true;
        startAlertZonesAutoScroll();
    } else {
        stopAlertZonesAutoScroll();
    }
});

// Locations auto-scroll toggle
$("#toggle_locations_scroll").on("change", function () {
    settingStates.locations = $(this).is(":checked");
    localStorage.setItem("autoScrollLocations", settingStates.locations);

    if (settingStates.locations && typeof startAlertLocationsAutoScroll === "function") {
        locationsAutoScrollEnabled = true;
        startAlertLocationsAutoScroll();
    } else {
        stopAlertLocationsAutoScroll();
    }
});

// Last Alerted Times auto-scroll toggle
$("#toggle_last_alerted_times_scroll").on("change", function () {
    settingStates.lastAlertedTimes = $(this).is(":checked");
    localStorage.setItem("autoScrollLastAlertedTimes", settingStates.lastAlertedTimes);

    if (settingStates.lastAlertedTimes && typeof startLastAlertedTimesAutoScroll === "function") {
        lastAlertedTimesAutoScrollEnabled = true;
        startLastAlertedTimesAutoScroll();
    } else {
        stopLastAlertedTimesAutoScroll();
    }
});

// RSS auto-scroll toggle
$("#toggle_rss_scroll").on("change", function () {
    settingStates.rss = $(this).is(":checked");
    localStorage.setItem("autoScrollRss", settingStates.rss);

    if (settingStates.rss && typeof startRssAutoScroll === "function") {
        rssAutoScrollEnabled = true;
        startRssAutoScroll();
    } else {
        stopRssAutoScroll();
    }
});

// Early Warning auto-scroll toggle
$("#toggle_early_warning_scroll").on("change", function () {
    settingStates.earlyWarning = $(this).is(":checked");
    localStorage.setItem("autoScrollEarlyWarning", settingStates.earlyWarning);

    if (settingStates.earlyWarning && typeof startEarlyWarningAutoScroll === "function") {
        earlyWarningAutoScrollEnabled = true;
        startEarlyWarningAutoScroll();
    } else {
        stopEarlyWarningAutoScroll();
    }
});

// Allow Map Auto Maximization toggle
$("#toggle_allow_map_auto_maximization").on("change", function () {
    settingStates.allowMapAutoMaximization = $(this).is(":checked");
    localStorage.setItem("allowMapAutoMaximization", settingStates.allowMapAutoMaximization);
    allowMapAutoMaximization = settingStates.allowMapAutoMaximization;
});

// Test Mode Type dropdown toggle
$("#test_mode_type").on("change", function () {
    settingStates.testModeType = $(this).val();

    if (testmode) {
        testmode = $(this).val();
    }

    localStorage.setItem("testModeType", settingStates.testModeType);
});

$("#css_style_theme").on("change", function () {
    settingStates.cssTheme = $(this).val();
    localStorage.setItem(themeStorageKey, settingStates.cssTheme);
    applyDashboardTheme(settingStates.cssTheme);
});

$("#ui_language").on("change", function () {
    const newLang = $(this).val();
    if (!supportedLanguages.includes(newLang)) return;
    const prevLang = settingStates.language;
    settingStates.language = newLang;
    localStorage.setItem("uiLanguage", newLang);
    applyLanguage(newLang);
    // Reload the page when the language changes so Google Maps reloads
    // with the correct language parameter in its API URL.
    if (newLang !== prevLang) {
        window.location.reload();
    }
});

$("#toggle_persist_history").on("change", function () {
    settingStates.persistHistory = $(this).is(":checked");
    localStorage.setItem("persistHistory", settingStates.persistHistory);
    setClearPikudHistoryButtonVisibility(settingStates.persistHistory);

    if (!settingStates.persistHistory) {
        localStorage.removeItem(pikudHaorefHistoryStorageKey);
    }

    syncClearPikudHistoryIconState();
});

// ==================== ALERT HELPER FUNCTIONS ====================

// Filters alert locations to only those not seen within the dedup window.
// Uses recentlyAlertedLocations as a Unix-timestamp cache to prevent duplicate
// table rows when the API keeps returning the same active alert on every poll.
function extractNewLocations(alertLocations) {
    const newLocations = [];
    const now = Math.floor(Date.now() / 1000); // Current time as Unix seconds

    for (let location of alertLocations) {
        // Accept the location if it has never been seen, or if X seconds have elapsed
        if (!recentlyAlertedLocations[location] || recentlyAlertedLocations[location] < now - alertedLocationsDedupSeconds) {
            newLocations.push(location);
            recentlyAlertedLocations[location] = now; // Record the timestamp for this location
        }
    }

    return newLocations;
}

// Upsert a location into alertedLocations:
// increments its counter if it already exists, otherwise adds a new entry.
function updateAlertedLocation(location, location_he) {
    const index = alertedLocations.findIndex((item) => item.location === location);

    if (index !== -1) {
        alertedLocations[index].counter++; // Location already tracked — bump its count
    } else {
        alertedLocations.push({
            location: location,
            location_he: location_he || location,
            counter: 1,
        }); // First alert for this location
    }
}

// Upsert a zone into alertedZones (same upsert pattern as updateAlertedLocation).
function updateAlertedZone(zone_en, zone_he) {
    const index = alertedZones.findIndex((item) => item.zone === zone_en);

    if (index !== -1) {
        alertedZones[index].counter++;
    } else {
        alertedZones.push({
            zone: zone_en,
            zone_he: zone_he || zone_en,
            counter: 1,
        });
    }
}

// Upsert an error message into errorLogs so the modal shows unique messages
// with a count rather than one entry per occurrence.
function incrementErrorCount(errorMessage) {
    const index = errorLogs.findIndex((item) => item.error === errorMessage);

    if (index !== -1) {
        errorLogs[index].count += 1;
    } else {
        errorLogs.push({
            error: errorMessage,
            count: 1,
        });
    }
}

// Records Pikud HaOref errors in both the summary and modal list.
// The modal list stays unique while the summary counter tracks all occurrences.
function recordError(errorInput, sourceName = "pikudHaorefPoll") {
    pikudHaorefErrorCounter++;
    $("#pikud_haoref_error_counter").text(pikudHaorefErrorCounter);
    $("#error_message").show();

    const rawErrorMessage = getErrorMessage(errorInput, "Unknown Pikud HaOref error");
    const normalizedErrorMessage = rawErrorMessage.indexOf("Request failed with status code 403") > -1 ? "403 Forbidden - Requires Israeli IP" : rawErrorMessage;
    const hasSourcePrefix = /^\[[^\]]+\]/.test(normalizedErrorMessage);
    const displayErrorMessage = hasSourcePrefix ? normalizedErrorMessage : `[${sourceName}] ${normalizedErrorMessage}`;

    // Keep one visible entry per unique message.
    if (errorLogs.findIndex((item) => item.error === displayErrorMessage) === -1) {
        incrementErrorCount(displayErrorMessage);

        if (!pikudHaorefError) {
            pikudHaorefError = true;
            $("#error_counter").show();
        }

        $("#pikud_haoref_error_messages").prepend("<li>" + displayErrorMessage + "</li>");
    }

    persistPikudHaorefHistoryState();
    return rawErrorMessage;
}

// Refreshes advanced summary metrics derived from rockets/drones/early warnings.
function updateAdvancedSummaryStats() {
    const totalThreatAlerts = rocketAlertCounter + droneAlertCounter;

    const rocketShare = totalThreatAlerts > 0 ? `${((rocketAlertCounter / totalThreatAlerts) * 100).toFixed(1)}%` : "0%";
    const droneShare = totalThreatAlerts > 0 ? `${((droneAlertCounter / totalThreatAlerts) * 100).toFixed(1)}%` : "0%";

    $("#rocketShareCounter").text(rocketShare);
    $("#droneShareCounter").text(droneShare);
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function buildPikudHaorefAlertRowMarkup(entry, options = {}) {
    const { includeHighlight = false } = options;
    const lang = getCurrentLang();
    const time = escapeHtml(entry?.time || "");
    const typeIcon = escapeHtml(entry?.typeIcon || "fa-triangle-exclamation");
    // Determine type text: use stored typeKey for live translation, else fall back to typeText
    let typeText;
    if (entry?.typeKey && alertTypeMap[entry.typeKey]) {
        const tm = alertTypeMap[entry.typeKey];
        typeText = escapeHtml(lang === "he" && tm.text_he ? tm.text_he : tm.text);
    } else {
        typeText = escapeHtml(entry?.typeText || "Alert");
    }
    // Use Hebrew location/zone names when Hebrew is active
    const location = escapeHtml(lang === "he" && entry?.location_he ? entry.location_he : entry?.location || "Unknown");
    const zone = escapeHtml(lang === "he" && entry?.zone_he ? entry.zone_he : entry?.zone || "Unknown");
    const lat = entry?.lat ?? "";
    const lng = entry?.lng ?? "";
    const rowClasses = includeHighlight ? "animate__animated animate__fadeInDown animate__faster newRow table-light" : "";
    const hasCoordinates = lat !== "" && lng !== "";
    const href = hasCoordinates ? `https://www.google.com/maps/search/${encodeURIComponent(String(lat))},${encodeURIComponent(String(lng))}` : "";
    const highlightedCellClasses = includeHighlight ? "newRow text-dark" : "";
    const locationCell = hasCoordinates ? `<a href="${href}" target="_blank" class="${highlightedCellClasses}">${location}</a>` : location;

    return `
        <tr class="${rowClasses}">
            <td><font class='text-info'>${time}</font></td>
            <td><i class="fa-solid ${typeIcon} collapse-icon" title="${typeText}"></i></td>
            <td>${locationCell}</td>
            <td class="${highlightedCellClasses}">${zone}</td>
        </tr>
    `;
}

function renderAlertedLocationsCounterTable(resetScroller = false) {
    $("#alerted_locations_counter").html("");
    const lang = getCurrentLang();

    const sortedAlertedLocations = alertedLocations.toSorted((a, b) => {
        if (b.counter !== a.counter) {
            return b.counter - a.counter;
        }

        return a.location.localeCompare(b.location);
    });

    for (let i = 0; i < sortedAlertedLocations.length; i++) {
        const location = lang === "he" && sortedAlertedLocations[i].location_he ? sortedAlertedLocations[i].location_he : sortedAlertedLocations[i].location;
        const counter = sortedAlertedLocations[i].counter;

        $("#alerted_locations_counter").append(`
            <tr>
                <td width="95%"><font class='text-white'>${location}</font></td>
                <td>${counter}</td>
            </tr>
        `);
    }

    $("#totalLocationsCounter").text(sortedAlertedLocations.length);

    if (resetScroller && alertLocationsScroller) {
        alertLocationsScroller.reset();
    }
}

function renderAlertedZonesCounterTable(resetScroller = false) {
    $("#alerted_zones_counter").html("");
    const lang = getCurrentLang();

    const sortedAlertedZones = alertedZones.toSorted((a, b) => {
        if (b.counter !== a.counter) {
            return b.counter - a.counter;
        }

        return a.zone.localeCompare(b.zone);
    });

    for (let i = 0; i < sortedAlertedZones.length; i++) {
        const zone = lang === "he" && sortedAlertedZones[i].zone_he ? sortedAlertedZones[i].zone_he : sortedAlertedZones[i].zone;
        const counter = sortedAlertedZones[i].counter;

        $("#alerted_zones_counter").append(`
            <tr>
                <td width="95%"><font class='text-white'>${zone}</font></td>
                <td>${counter}</td>
            </tr>
        `);
    }

    $("#totalZonesCounter").text(sortedAlertedZones.length);

    if (resetScroller && alertZonesScroller) {
        alertZonesScroller.reset();
    }
}

function renderLastAlertedTimesTable(resetScroller = false) {
    $("#last_alerted_times").html("");

    for (let i = lastAlertedTimes.length - 1; i >= 0; i--) {
        const displayTime = escapeHtml(lastAlertedTimes[i]);

        $("#last_alerted_times").append(`
            <tr>
                <td><span class="text-white">${displayTime}</span></td>
            </tr>
        `);
    }

    if (resetScroller && lastAlertedTimesScroller) {
        lastAlertedTimesScroller.reset();
    }
}

function syncAlertSummaryCountersToDom() {
    $("#rocketAlertCounter").text(rocketAlertCounter);
    $("#droneAlertCounter").text(droneAlertCounter);
    $("#generalAlertCounter").text(generalAlertCounter);
    $("#earthquakeAlertCounter").text(earthquakeAlertCounter);
    $("#radiologicalEventAlertCounter").text(radiologicalEventAlertCounter);
    $("#tsunamiAlertCounter").text(tsunamiAlertCounter);
    $("#hazardousMaterialsAlertCounter").text(hazardousMaterialsAlertCounter);
    $("#terroristInfiltrationAlertCounter").text(terroristInfiltrationAlertCounter);
    $("#totalAlertsCounter").text(rocketAlertCounter + droneAlertCounter);
    $("#totalEarlyWarningsAllCounter").text(totalEarlyWarningsAllCounter);
    $("#totalEarlyWarningsSpecificCounter").text(totalEarlyWarningsSpecificCounter);
    $("#pikud_haoref_error_counter").text(pikudHaorefErrorCounter);
    $("#totalUnmatchedCitiesCounter").text(totalUnmatchedCitiesCounter);

    if (generalAlertCounter > 0) {
        $("#total_general_alerts_counter").show();
    }

    if (earthquakeAlertCounter > 0) {
        $("#total_earthquake_alerts_counter").show();
    }

    if (radiologicalEventAlertCounter > 0) {
        $("#total_radiological_event_alerts_counter").show();
    }

    if (tsunamiAlertCounter > 0) {
        $("#total_tsunami_alerts_counter").show();
    }

    if (hazardousMaterialsAlertCounter > 0) {
        $("#total_hazardous_materials_alerts_counter").show();
    }

    if (terroristInfiltrationAlertCounter > 0) {
        $("#total_terrorist_infiltration_alerts_counter").show();
    }

    if (totalEarlyWarningsSpecificCounter > 0) {
        $("#total_early_warnings_specific_counter").show();
    }

    if (totalUnmatchedCitiesCounter > 0) {
        unmatchedCitiesFlag = true;
        $("#unmatched_cities_counter, #unmatched_cities").show();
    }

    if (pikudHaorefErrorCounter > 0) {
        pikudHaorefError = true;
        $("#error_counter, #error_message").show();
    }

    updateAdvancedSummaryStats();
}

function persistPikudHaorefHistoryState() {
    // History persistence is optional and can be disabled from Settings.
    if (!settingStates.persistHistory) {
        return;
    }

    try {
        const historyState = {
            version: 1,
            pikudHaorefAlertHistory: pikudHaorefAlertHistory.slice(0, maxPersistedPikudRows),
            alertedLocations,
            alertedZones,
            lastAlertedTimes,
            counters: {
                rocketAlertCounter,
                droneAlertCounter,
                generalAlertCounter,
                earthquakeAlertCounter,
                radiologicalEventAlertCounter,
                tsunamiAlertCounter,
                hazardousMaterialsAlertCounter,
                terroristInfiltrationAlertCounter,
                totalEarlyWarningsAllCounter,
                totalEarlyWarningsSpecificCounter,
            },
        };

        localStorage.setItem(pikudHaorefHistoryStorageKey, JSON.stringify(historyState));
        syncClearPikudHistoryIconState();
    } catch (error) {
        logClientError("persistPikudHaorefHistoryState", error);
    }
}

function restorePikudHaorefHistoryState() {
    // Restore persisted counters and tables on page load to keep continuity across refreshes.
    const rawState = localStorage.getItem(pikudHaorefHistoryStorageKey);

    if (!rawState) {
        return;
    }

    try {
        const parsedState = JSON.parse(rawState);
        const counters = parsedState?.counters || {};

        const parsedRows = Array.isArray(parsedState?.pikudHaorefAlertHistory) ? parsedState.pikudHaorefAlertHistory : [];
        pikudHaorefAlertHistory = parsedRows.slice(0, maxPersistedPikudRows).map((entry) => ({
            time: String(entry?.time || ""),
            typeText: String(entry?.typeText || "Alert"),
            typeIcon: String(entry?.typeIcon || "fa-triangle-exclamation"),
            location: String(entry?.location || "Unknown"),
            zone: String(entry?.zone || "Unknown"),
            lat: entry?.lat ?? "",
            lng: entry?.lng ?? "",
        }));

        alertedLocations = Array.isArray(parsedState?.alertedLocations) ? parsedState.alertedLocations : [];
        alertedZones = Array.isArray(parsedState?.alertedZones) ? parsedState.alertedZones : [];
        lastAlertedTimes = Array.isArray(parsedState?.lastAlertedTimes) ? parsedState.lastAlertedTimes : [];

        rocketAlertCounter = Number.isFinite(counters.rocketAlertCounter) ? counters.rocketAlertCounter : 0;
        droneAlertCounter = Number.isFinite(counters.droneAlertCounter) ? counters.droneAlertCounter : 0;
        generalAlertCounter = Number.isFinite(counters.generalAlertCounter) ? counters.generalAlertCounter : 0;
        earthquakeAlertCounter = Number.isFinite(counters.earthquakeAlertCounter) ? counters.earthquakeAlertCounter : 0;
        radiologicalEventAlertCounter = Number.isFinite(counters.radiologicalEventAlertCounter) ? counters.radiologicalEventAlertCounter : 0;
        tsunamiAlertCounter = Number.isFinite(counters.tsunamiAlertCounter) ? counters.tsunamiAlertCounter : 0;
        hazardousMaterialsAlertCounter = Number.isFinite(counters.hazardousMaterialsAlertCounter) ? counters.hazardousMaterialsAlertCounter : 0;
        terroristInfiltrationAlertCounter = Number.isFinite(counters.terroristInfiltrationAlertCounter) ? counters.terroristInfiltrationAlertCounter : 0;
        totalEarlyWarningsAllCounter = Number.isFinite(counters.totalEarlyWarningsAllCounter) ? counters.totalEarlyWarningsAllCounter : 0;
        totalEarlyWarningsSpecificCounter = Number.isFinite(counters.totalEarlyWarningsSpecificCounter) ? counters.totalEarlyWarningsSpecificCounter : 0;

        $("#pikud_haoref_alerts").html(pikudHaorefAlertHistory.map((entry) => buildPikudHaorefAlertRowMarkup(entry)).join(""));
        renderAlertedLocationsCounterTable();
        renderAlertedZonesCounterTable();
        renderLastAlertedTimesTable();

        const now = Math.floor(Date.now() / 1000);
        pikudHaorefAlertHistory.forEach((entry) => {
            if (entry.location) {
                recentlyAlertedLocations[entry.location] = now;
            }
        });

        syncAlertSummaryCountersToDom();
    } catch (error) {
        logClientError("restorePikudHaorefHistoryState", error);
    }
}

updateAdvancedSummaryStats();

// ==================== I18N / LANGUAGE SUPPORT ====================

const translations = {
    en: {
        alerts: "Alerts",
        thTime: "Time",
        thType: "Type",
        thLocation: "Location",
        thZone: "Zone",
        alertLocations: "Alert Locations",
        alertZones: "Alert Zones",
        alertsSummary: "Alerts Summary",
        totalAlerts: "Total Alerts",
        totalGeneralAlerts: "Total General Alerts",
        totalEarthquakeAlerts: "Total Earthquake Alerts",
        totalRadiologicalAlerts: "Total Radiological Event Alerts",
        totalTsunamiAlerts: "Total Tsunami Alerts",
        totalHazardousMaterialsAlerts: "Total Hazardous Materials Alerts",
        totalTerroristInfiltrationAlerts: "Total Terrorist Infiltration Alerts",
        totalDroneAlerts: "Total Drone Alerts",
        totalRocketAlerts: "Total Rocket Alerts",
        droneShare: "Drone Share",
        rocketShare: "Rocket Share",
        totalLocations: "Total Locations",
        totalZones: "Total Zones",
        totalEarlyWarningsAll: "Total Early Warnings (All)",
        totalEarlyWarningsSpecific: "Total Early Warnings (Specific)",
        totalUnmatchedCities: "Total Unmatched Cities",
        openUnmatchedCities: "Open Unmatched Cities",
        totalErrors: "Total Errors",
        openErrorMessages: "Open Error Messages",
        soundAlerts: "Sound Alerts",
        fullscreen: "Fullscreen",
        settingsLabel: "Settings",
        clearAlertHistory: "Clear Alert History",
        testMode: "Test Mode",
        appVersion: "App Version",
        appUpdateAvailable: "App Update Available",
        lastAlertedTimes: "Last Alerted Times",
        newsUpdates: "News Updates",
        mapAlerts: "Map Alerts",
        earlyWarningTitle: "Early Missile Warning Alert",
        alertedAt: "Alerted at",
        timeBeforeSirens: "Estimated time before missile sirens:",
        earlyWarningAutoClose: "This message will disappear automatically when the threat is no longer active.",
        affectedLocations: "The following locations are affected:",
        safeToExitTitle: "Safe To Exit Bomb Shelter",
        safeToExitBody: "You can now exit the bomb shelter.",
        autoCloseAfter10s: "This message will disappear automatically after 10 seconds.",
        close: "Close",
        errorMessagesTitle: "Error Messages",
        errorMessagesDesc: "Unique error messages received from the Pikud HaOref service.",
        unmatchedCitiesTitle: "Unmatched Cities",
        unmatchedCitiesDesc: "These are the unmatched cities received from the Pikud HaOref service.",
        settingsModalTitle: "Settings",
        cityEarlyWarning: "City (Early Warning)",
        typeCityName: "Type city name...",
        save: "Save",
        pikudAutoScroll: "Pikud HaOref Auto-Scroll",
        zonesAutoScroll: "Zones Auto-Scroll",
        locationsAutoScroll: "Locations Auto-Scroll",
        lastAlertedTimesAutoScroll: "Last Alerted Times Auto-Scroll",
        rssAutoScroll: "RSS Feed Auto-Scroll",
        earlyWarningAutoScroll: "Early Warning Auto-Scroll",
        allowMapAutoMax: "Allow Map Auto-Maximization",
        persistHistorySetting: "Persist Alert History",
        testModeType: "Test Mode Type",
        testModeOptionAlertByCity: "Alert by City",
        testModeOptionAlertByRegion: "Alert by Region",
        testModeOptionEarlyWarning: "Early Warning",
        testModeOptionOtherAlertsOnly: "Other Alerts Only",
        dashboardStyle: "Dashboard Style",
        language: "Language",
    },
    he: {
        alerts: "\u05D4\u05EA\u05E8\u05D0\u05D5\u05EA",
        thTime: "\u05E9\u05E2\u05D4",
        thType: "\u05E1\u05D5\u05D2",
        thLocation: "\u05DE\u05D9\u05E7\u05D5\u05DD",
        thZone: "\u05D0\u05D6\u05D5\u05E8",
        alertLocations: "\u05DE\u05D9\u05E7\u05D5\u05DE\u05D9 \u05D4\u05EA\u05E8\u05D0\u05D5\u05EA",
        alertZones: "\u05D0\u05D6\u05D5\u05E8\u05D9 \u05D4\u05EA\u05E8\u05D0\u05D5\u05EA",
        alertsSummary: "\u05E1\u05D9\u05DB\u05D5\u05DD \u05D4\u05EA\u05E8\u05D0\u05D5\u05EA",
        totalAlerts: '\u05E1\u05D4"\u05DB \u05D4\u05EA\u05E8\u05D0\u05D5\u05EA',
        totalGeneralAlerts: '\u05E1\u05D4"\u05DB \u05D4\u05EA\u05E8\u05D0\u05D5\u05EA \u05DB\u05DC\u05DC\u05D9\u05D5\u05EA',
        totalEarthquakeAlerts: '\u05E1\u05D4"\u05DB \u05D4\u05EA\u05E8\u05D0\u05D5\u05EA \u05E8\u05E2\u05D9\u05D3\u05EA \u05D0\u05D3\u05DE\u05D4',
        totalRadiologicalAlerts: '\u05E1\u05D4"\u05DB \u05D4\u05EA\u05E8\u05D0\u05D5\u05EA \u05D0\u05D9\u05E8\u05D5\u05E2 \u05E8\u05D3\u05D9\u05D5\u05DC\u05D5\u05D2\u05D9',
        totalTsunamiAlerts: '\u05E1\u05D4"\u05DB \u05D4\u05EA\u05E8\u05D0\u05D5\u05EA \u05E6\u05D5\u05E0\u05D0\u05DE\u05D9',
        totalHazardousMaterialsAlerts: '\u05E1\u05D4"\u05DB \u05D4\u05EA\u05E8\u05D0\u05D5\u05EA \u05D7\u05D5\u05DE\u05E8\u05D9\u05DD \u05DE\u05E1\u05D5\u05DB\u05E0\u05D9\u05DD',
        totalTerroristInfiltrationAlerts: '\u05E1\u05D4"\u05DB \u05D4\u05EA\u05E8\u05D0\u05D5\u05EA \u05D7\u05D3\u05D9\u05E8\u05EA \u05DE\u05D7\u05D1\u05DC\u05D9\u05DD',
        totalDroneAlerts: '\u05E1\u05D4"\u05DB \u05D4\u05EA\u05E8\u05D0\u05D5\u05EA \u05DB\u05D8\u05D1"\u05DE',
        totalRocketAlerts: '\u05E1\u05D4"\u05DB \u05D4\u05EA\u05E8\u05D0\u05D5\u05EA \u05D8\u05D9\u05DC\u05D9\u05DD',
        droneShare: '\u05D0\u05D7\u05D5\u05D6 \u05DB\u05D8\u05D1"\u05DE',
        rocketShare: "\u05D0\u05D7\u05D5\u05D6 \u05D8\u05D9\u05DC\u05D9\u05DD",
        totalLocations: '\u05E1\u05D4"\u05DB \u05DE\u05D9\u05E7\u05D5\u05DE\u05D9\u05DD',
        totalZones: '\u05E1\u05D4"\u05DB \u05D0\u05D6\u05D5\u05E8\u05D9\u05DD',
        totalEarlyWarningsAll: '\u05E1\u05D4"\u05DB \u05D0\u05D6\u05D4\u05E8\u05D5\u05EA \u05DE\u05D5\u05E7\u05D3\u05DE\u05D5\u05EA (\u05DB\u05DC\u05DC)',
        totalEarlyWarningsSpecific: '\u05E1\u05D4"\u05DB \u05D0\u05D6\u05D4\u05E8\u05D5\u05EA \u05DE\u05D5\u05E7\u05D3\u05DE\u05D5\u05EA (\u05E1\u05E4\u05E6\u05D9\u05E4\u05D9)',
        totalUnmatchedCities: '\u05E1\u05D4"\u05DB \u05E2\u05E8\u05D9\u05DD \u05DC\u05D0 \u05DE\u05DE\u05D5\u05E4\u05D5\u05EA',
        openUnmatchedCities: "\u05E4\u05EA\u05D7 \u05E2\u05E8\u05D9\u05DD \u05DC\u05D0 \u05DE\u05DE\u05D5\u05E4\u05D5\u05EA",
        totalErrors: '\u05E1\u05D4"\u05DB \u05E9\u05D2\u05D9\u05D0\u05D5\u05EA',
        openErrorMessages: "\u05E4\u05EA\u05D7 \u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05E9\u05D2\u05D9\u05D0\u05D4",
        soundAlerts: "\u05D4\u05EA\u05E8\u05D0\u05D5\u05EA \u05E7\u05D5\u05DC\u05D9\u05D5\u05EA",
        fullscreen: "\u05DE\u05E1\u05DA \u05DE\u05DC\u05D0",
        settingsLabel: "\u05D4\u05D2\u05D3\u05E8\u05D5\u05EA",
        clearAlertHistory: "\u05DE\u05D7\u05E7 \u05D4\u05D9\u05E1\u05D8\u05D5\u05E8\u05D9\u05D9\u05EA \u05D4\u05EA\u05E8\u05D0\u05D5\u05EA",
        testMode: "\u05DE\u05E6\u05D1 \u05D1\u05D3\u05D9\u05E7\u05D4",
        appVersion: "\u05D2\u05E8\u05E1\u05EA \u05D0\u05E4\u05DC\u05D9\u05E7\u05E6\u05D9\u05D4",
        appUpdateAvailable: "\u05E2\u05D3\u05DB\u05D5\u05DF \u05D6\u05DE\u05D9\u05DF",
        lastAlertedTimes: "\u05D6\u05DE\u05E0\u05D9 \u05D4\u05EA\u05E8\u05D0\u05D4 \u05D0\u05D7\u05E8\u05D5\u05E0\u05D9\u05DD",
        newsUpdates: "\u05E2\u05D3\u05DB\u05D5\u05E0\u05D9 \u05D7\u05D3\u05E9\u05D5\u05EA",
        mapAlerts: "\u05DE\u05E4\u05EA \u05D4\u05EA\u05E8\u05D0\u05D5\u05EA",
        earlyWarningTitle: "\u05D0\u05D6\u05D4\u05E8\u05D4 \u05DE\u05D5\u05E7\u05D3\u05DE\u05EA - \u05DE\u05EA\u05E7\u05E4\u05EA \u05D8\u05D9\u05DC\u05D9\u05DD",
        alertedAt: "\u05D4\u05D5\u05EA\u05E8\u05E2 \u05D1\u05E9\u05E2\u05D4",
        timeBeforeSirens: "\u05D6\u05DE\u05DF \u05DE\u05E9\u05D5\u05E2\u05E8 \u05E2\u05D3 \u05E6\u05E4\u05D9\u05E8\u05D4:",
        earlyWarningAutoClose: "\u05D4\u05D5\u05D3\u05E2\u05D4 \u05D6\u05D5 \u05EA\u05D9\u05E2\u05DC\u05DD \u05D0\u05D5\u05D8\u05D5\u05DE\u05D8\u05D9\u05EA \u05DB\u05E9\u05D4\u05D0\u05D9\u05D5\u05DD \u05D9\u05E1\u05EA\u05D9\u05D9\u05DD.",
        affectedLocations: "\u05D4\u05DE\u05D9\u05E7\u05D5\u05DE\u05D9\u05DD \u05D4\u05D1\u05D0\u05D9\u05DD \u05DE\u05D5\u05E9\u05E4\u05E2\u05D9\u05DD:",
        safeToExitTitle: "\u05E0\u05D9\u05EA\u05DF \u05DC\u05E6\u05D0\u05EA \u05DE\u05D4\u05DE\u05E8\u05D7\u05D1 \u05D4\u05DE\u05D5\u05D2\u05DF",
        safeToExitBody: "\u05DB\u05E2\u05EA \u05E0\u05D9\u05EA\u05DF \u05DC\u05E6\u05D0\u05EA \u05DE\u05D4\u05DE\u05E8\u05D7\u05D1 \u05D4\u05DE\u05D5\u05D2\u05DF.",
        autoCloseAfter10s: "\u05D4\u05D5\u05D3\u05E2\u05D4 \u05D6\u05D5 \u05EA\u05D9\u05E2\u05DC\u05DD \u05D0\u05D5\u05D8\u05D5\u05DE\u05D8\u05D9\u05EA \u05DC\u05D0\u05D7\u05E8 10 \u05E9\u05E0\u05D9\u05D5\u05EA.",
        close: "\u05E1\u05D2\u05D5\u05E8",
        errorMessagesTitle: "\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05E9\u05D2\u05D9\u05D0\u05D4",
        errorMessagesDesc: "\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05E9\u05D2\u05D9\u05D0\u05D4 \u05D9\u05D9\u05D7\u05D5\u05D3\u05D9\u05D5\u05EA \u05E9\u05D4\u05EA\u05E7\u05D1\u05DC\u05D5 \u05DE\u05E9\u05D9\u05E8\u05D5\u05EA \u05E4\u05D9\u05E7\u05D5\u05D3 \u05D4\u05E2\u05D5\u05E8\u05E3.",
        unmatchedCitiesTitle: "\u05E2\u05E8\u05D9\u05DD \u05DC\u05D0 \u05DE\u05DE\u05D5\u05E4\u05D5\u05EA",
        unmatchedCitiesDesc: "\u05D0\u05DC\u05D5 \u05D4\u05DF \u05D4\u05E2\u05E8\u05D9\u05DD \u05D4\u05DC\u05D0 \u05DE\u05DE\u05D5\u05E4\u05D5\u05EA \u05E9\u05D4\u05EA\u05E7\u05D1\u05DC\u05D5 \u05DE\u05E9\u05D9\u05E8\u05D5\u05EA \u05E4\u05D9\u05E7\u05D5\u05D3 \u05D4\u05E2\u05D5\u05E8\u05E3.",
        settingsModalTitle: "\u05D4\u05D2\u05D3\u05E8\u05D5\u05EA",
        cityEarlyWarning: "\u05E2\u05D9\u05E8 (\u05D0\u05D6\u05D4\u05E8\u05D4 \u05DE\u05D5\u05E7\u05D3\u05DE\u05EA)",
        typeCityName: "\u05D4\u05D6\u05DF \u05E9\u05DD \u05E2\u05D9\u05E8...",
        save: "\u05E9\u05DE\u05D5\u05E8",
        pikudAutoScroll: "\u05D2\u05DC\u05D9\u05DC\u05D4 \u05D0\u05D5\u05D8\u05D5\u05DE\u05D8\u05D9\u05EA - \u05E4\u05D9\u05E7\u05D5\u05D3 \u05D4\u05E2\u05D5\u05E8\u05E3",
        zonesAutoScroll: "\u05D2\u05DC\u05D9\u05DC\u05D4 \u05D0\u05D5\u05D8\u05D5\u05DE\u05D8\u05D9\u05EA - \u05D0\u05D6\u05D5\u05E8\u05D9\u05DD",
        locationsAutoScroll: "\u05D2\u05DC\u05D9\u05DC\u05D4 \u05D0\u05D5\u05D8\u05D5\u05DE\u05D8\u05D9\u05EA - \u05DE\u05D9\u05E7\u05D5\u05DE\u05D9\u05DD",
        lastAlertedTimesAutoScroll: "\u05D2\u05DC\u05D9\u05DC\u05D4 \u05D0\u05D5\u05D8\u05D5\u05DE\u05D8\u05D9\u05EA - \u05D6\u05DE\u05E0\u05D9 \u05D4\u05EA\u05E8\u05D0\u05D4",
        rssAutoScroll: "\u05D2\u05DC\u05D9\u05DC\u05D4 \u05D0\u05D5\u05D8\u05D5\u05DE\u05D8\u05D9\u05EA - \u05D7\u05D3\u05E9\u05D5\u05EA",
        earlyWarningAutoScroll: "\u05D2\u05DC\u05D9\u05DC\u05D4 \u05D0\u05D5\u05D8\u05D5\u05DE\u05D8\u05D9\u05EA - \u05D0\u05D6\u05D4\u05E8\u05D4 \u05DE\u05D5\u05E7\u05D3\u05DE\u05EA",
        allowMapAutoMax: "\u05D4\u05D2\u05D3\u05DC\u05D4 \u05D0\u05D5\u05D8\u05D5\u05DE\u05D8\u05D9\u05EA \u05E9\u05DC \u05D4\u05DE\u05E4\u05D4",
        persistHistorySetting: "\u05E9\u05DE\u05D5\u05E8 \u05D4\u05D9\u05E1\u05D8\u05D5\u05E8\u05D9\u05D9\u05EA \u05D4\u05EA\u05E8\u05D0\u05D5\u05EA",
        testModeType: "\u05E1\u05D5\u05D2 \u05DE\u05E6\u05D1 \u05D1\u05D3\u05D9\u05E7\u05D4",
        testModeOptionAlertByCity: "\u05D4\u05EA\u05E8\u05D0\u05D4 \u05DC\u05E4\u05D9 \u05E2\u05D9\u05E8",
        testModeOptionAlertByRegion: "\u05D4\u05EA\u05E8\u05D0\u05D4 \u05DC\u05E4\u05D9 \u05D0\u05D6\u05D5\u05E8",
        testModeOptionEarlyWarning: "\u05D0\u05D6\u05D4\u05E8\u05D4 \u05DE\u05D5\u05E7\u05D3\u05DE\u05EA",
        testModeOptionOtherAlertsOnly: "\u05D4\u05EA\u05E8\u05D0\u05D5\u05EA \u05D0\u05D7\u05E8\u05D5\u05EA \u05D1\u05DC\u05D1\u05D3",
        dashboardStyle: "\u05E2\u05D9\u05E6\u05D5\u05D1 \u05DC\u05D5\u05D7",
        language: "\u05E9\u05E4\u05D4",
    },
};

function getCurrentLang() {
    if (typeof settingStates !== "undefined" && settingStates.language) {
        return settingStates.language;
    }
    const stored = localStorage.getItem("uiLanguage");
    return stored === "he" ? "he" : "en";
}

function applyLanguage(lang) {
    // Update HTML lang and direction
    document.documentElement.setAttribute("lang", lang);
    document.documentElement.setAttribute("dir", lang === "he" ? "rtl" : "ltr");

    // Swap Bootstrap RTL/LTR stylesheet
    const bootstrapStylesheet = document.getElementById("bootstrapStylesheet");
    if (bootstrapStylesheet) {
        bootstrapStylesheet.href = lang === "he" ? "/css/bootstrap-5.3.3/bootstrap.rtl.min.css" : "/css/bootstrap-5.3.3/bootstrap.min.css";
    }

    const t = translations[lang] || translations.en;

    // Update all data-i18n text elements
    document.querySelectorAll("[data-i18n]").forEach((el) => {
        const key = el.getAttribute("data-i18n");
        if (t[key] !== undefined) el.textContent = t[key];
    });

    // Update all placeholder elements
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
        const key = el.getAttribute("data-i18n-placeholder");
        if (t[key] !== undefined) el.placeholder = t[key];
    });

    // Re-render dynamic tables with language-aware names
    renderAlertedLocationsCounterTable();
    renderAlertedZonesCounterTable();

    // Re-render the full alert history table so type/location/zone text updates
    const pikudTbody = document.getElementById("pikud_haoref_alerts");
    if (pikudTbody) {
        pikudTbody.innerHTML = "";
        pikudHaorefAlertHistory.forEach((entry) => {
            pikudTbody.innerHTML += buildPikudHaorefAlertRowMarkup(entry);
        });
        if (pikudHaorefScroller) pikudHaorefScroller.reset();
    }

    // Re-render early warning locations if a warning is active
    if (earlyWarningActive && earlyWarningLocations.length > 0) {
        const locationParts = earlyWarningLocations.map((city) => {
            return lang === "he" ? locationMap[city]?.name_he || locationMap[city]?.name_en || city : locationMap[city]?.name_en || city;
        });
        $("#earlyWarningLocations").text(locationParts.reverse().join(", ") + ", ");
    }

    // Position early-warning modals to the right edge in Hebrew (RTL) mode
    const earlyWarningModals = document.querySelectorAll("#earlyWarningModalEnter, #earlyWarningModalExit");
    earlyWarningModals.forEach((el) => {
        el.querySelector(".modal-dialog")?.classList.toggle("modal-dialog-end", lang === "he");
    });

    // Update settingStates if already initialised
    if (typeof settingStates !== "undefined") {
        settingStates.language = lang;
    }
}

// ==================== LOCATION DATA & CITY AUTOCOMPLETE ====================

// locationsJSON is injected server-side from the pikud-haoref-api package.
// It is the full list of recognized Israeli cities/locations with IDs, names,
// zone info, coordinates, and shelter countdown values.
const locationsJSON = Array.isArray(window.__appConfig?.cities) ? window.__appConfig.cities : [];

const input = document.getElementById("citySearch");
const suggestionsList = document.getElementById("city_suggestions");

// Filter locationsJSON on every keystroke and render matching city names as
// clickable dropdown items beneath the Settings search input.
input.addEventListener("input", function () {
    const query = this.value.toLowerCase().trim();

    // Clear previous suggestions before rendering a fresh set
    suggestionsList.innerHTML = "";

    // Hide the dropdown immediately when the input is empty
    if (query.length === 0) {
        suggestionsList.style.display = "none";
        return;
    }

    const lang = getCurrentLang();

    // Case-insensitive substring match against city name in the active language
    const filtered = locationsJSON.filter((city) => {
        if (!city) return false;
        if (lang === "he") {
            return typeof city.name === "string" && city.name.includes(query.trim());
        }
        return typeof city.name_en === "string" && city.name_en.toLowerCase().includes(query);
    });

    if (filtered.length === 0) {
        suggestionsList.style.display = "none";
        return;
    }

    // Build and append a <li> for each matching city
    filtered.forEach((city) => {
        const li = document.createElement("li");
        li.className = "list-group-item list-group-item-action bg-light text-dark border-secondary";
        const displayName = lang === "he" ? city.name : city.name_en;
        li.innerHTML = `<strong>${displayName}</strong>`;

        // Selecting a suggestion fills the input and closes the dropdown
        // Always store English name as the canonical value for the earlyWarningCity lookup
        li.addEventListener("click", () => {
            input.value = displayName;
            input.dataset.cityEn = city.name_en; // store English name for saving
            suggestionsList.style.display = "none";
        });

        suggestionsList.appendChild(li);
    });

    suggestionsList.style.display = "block";
});

// Dismiss the autocomplete dropdown when the user clicks anywhere
// outside the search container (identified by its .position-relative ancestor).
document.addEventListener("click", (e) => {
    if (!e.target.closest(".position-relative")) {
        suggestionsList.style.display = "none";
    }
});

// Build a lookup map keyed by location numeric ID (loc.value) for O(1) lookups
// inside the polling loop instead of scanning the full array every alert.
const locationMap = Object.fromEntries(
    locationsJSON.map((loc) => [
        loc.value,
        {
            name_en: loc.name_en, // English city/location name
            name_he: loc.name, // Hebrew city/location name
            zone: loc.zone, // Hebrew zone name (used internally)
            zone_en: loc.zone_en, // English zone name (displayed in the table)
            lng: loc.lng, // Longitude — used for Google Maps link
            lat: loc.lat, // Latitude  — used for Google Maps link
            countdown: loc.countdown, // Seconds until shelter must be reached
        },
    ]),
);

// ==================== PIKUD HAOREF ====================
// ==================== ALERT TYPE LOOKUP ====================
// Maps the API's string type codes to human-readable labels and icon paths.
// Keys match the values returned in alert[0].type from the Pikud HaOref API.
const alertTypeMap = {
    general: {
        text: "General Alert",
        text_he: "\u05D4\u05EA\u05E8\u05D0\u05D4 \u05DB\u05DC\u05DC\u05D9\u05EA",
        icon: "fa-triangle-exclamation text-general-alerts",
    },
    newsFlash: {
        text: "Early Warning",
        text_he: "\u05D0\u05D6\u05D4\u05E8\u05D4 \u05DE\u05D5\u05E7\u05D3\u05DE\u05EA",
        icon: "fa-triangle-exclamation text-danger",
    },
    missiles: {
        text: "Rocket Alert",
        text_he: "\u05D4\u05EA\u05E8\u05D0\u05EA \u05D8\u05D9\u05DC\u05D9\u05DD",
        icon: "fa-rocket text-danger",
    },
    hostileAircraftIntrusion: {
        text: "Drone Alert",
        text_he: '\u05D4\u05EA\u05E8\u05D0\u05EA \u05DB\u05D8\u05D1"\u05DE',
        icon: "fa-plane-up text-orange",
    },
    earthQuake: {
        text: "Earthquake Alert",
        text_he: "\u05D4\u05EA\u05E8\u05D0\u05EA \u05E8\u05E2\u05D9\u05D3\u05EA \u05D0\u05D3\u05DE\u05D4",
        icon: "fa-house-chimney-crack text-general-alerts",
    },
    radiologicalEvent: {
        text: "Radiological Alert",
        text_he: "\u05D4\u05EA\u05E8\u05D0\u05D4 \u05E8\u05D3\u05D9\u05D5\u05DC\u05D5\u05D2\u05D9\u05EA",
        icon: "fa-radiation text-general-alerts",
    },
    tsunami: {
        text: "Tsunami Alert",
        text_he: "\u05D4\u05EA\u05E8\u05D0\u05EA \u05E6\u05D5\u05E0\u05D0\u05DE\u05D9",
        icon: "fa-house-tsunami text-general-alerts",
    },
    hazardousMaterials: {
        text: "Hazardous Materials Alert",
        text_he: "\u05D4\u05EA\u05E8\u05D0\u05EA \u05D7\u05D5\u05DE\u05E8\u05D9\u05DD \u05DE\u05E1\u05D5\u05DB\u05E0\u05D9\u05DD",
        icon: "fa-skull-crossbones text-general-alerts",
    },
    terroristInfiltration: {
        text: "Terrorist Infiltration Alert",
        text_he: "\u05D4\u05EA\u05E8\u05D0\u05EA \u05D7\u05D3\u05D9\u05E8\u05EA \u05DE\u05D7\u05D1\u05DC\u05D9\u05DD",
        icon: "fa-circle-exclamation text-general-alerts",
    },
};

// Returns the display details object for a given API type code,
// or null if the type is not recognised (prevents rendering broken rows).
function getAlertDetailsByCategory(type) {
    const entry = alertTypeMap[type];
    if (!entry) return null;
    const lang = getCurrentLang();
    return {
        text: lang === "he" && entry.text_he ? entry.text_he : entry.text,
        icon: entry.icon,
    };
}

// ==================== PIKUD HAOREF PUSH HANDLER ====================
// Handles a pushed active-alert payload from the websocket stream.
const processPikudHaorefAlert = async function (alert) {
    try {
        // Cap the alert table at 500 rows to prevent unbounded DOM growth
        // during long sessions with many incoming alerts.
        if (pikud_haoref_alerts.children.length > 500) {
            $("#pikud_haoref_alerts tr:last").remove(); // Remove the oldest (bottom) row

            if (pikudHaorefAlertHistory.length > 0) {
                pikudHaorefAlertHistory.pop();
                persistPikudHaorefHistoryState();
            }
        }

        //console.log("Pikud HaOref API response:", alert[0]);

        if (alert) {
            window.alertsJSON = alert; // Expose raw response for debugging in the browser console

            // --- Error response handler ---
            // The server returns { error: '...' } when the Pikud HaOref fetch fails.
            if (alert.error) {
                const rawErrorMessage = recordError(alert.error, "pikudHaorefPoll");

                console.log("Pikud HaOref Error: " + rawErrorMessage);
            } else {
                // alert is an array when there is at least one active alert
                if (alert.length) {
                    const alertType = alert[0].type; // API type code, e.g. 'missiles', 'newsFlash'
                    const alertCities = alert[0].cities; // Array of city/location ID strings
                    const instructions = alert[0].instructions; // Hebrew instruction text from the API
                    const id = alert[0].id; // Unique alert ID (numeric string)

                    // --- Early Warning (newsFlash) path ---
                    // newsFlash is a pre-siren warning: the threat is detected but sirens
                    // haven't sounded yet. It needs separate handling because locations
                    // must be accumulated across polls (not deduplicated like rocket alerts).
                    if (alertType === "newsFlash") {
                        const earlyWarningCity = localStorage.getItem("earlyWarningCity") || "undefined";

                        // Hebrew string "האירוע הסתיים" means "The event has ended".
                        // When the API sends this instruction, the early warning is over.
                        if (instructions === "האירוע הסתיים") {
                            // Show the all-clear modal only when an early warning was actually active
                            if (earlyWarningActive && typeof id !== "undefined") {
                                finishEarlyWarning("api-end", {
                                    showExitModal: true,
                                });
                            }
                        } else {
                            // Early warning is still active (or just started).
                            // Resolve each city ID to its English name for the affectedCity check.
                            const checkIfCityAffected = alertCities.map((city) => locationMap[city]?.name_en).includes(earlyWarningCity);

                            // Only increment counters once per warning event (earlyWarningActive guard)
                            if (!earlyWarningActive) {
                                if (checkIfCityAffected) {
                                    // The user's saved city is in the alert — increment the specific counter
                                    totalEarlyWarningsSpecificCounter++;
                                    $("#totalEarlyWarningsSpecificCounter").text(totalEarlyWarningsSpecificCounter);
                                    $("#total_early_warnings_specific_counter").show();
                                }

                                totalEarlyWarningsAllCounter++;
                                $("#totalEarlyWarningsAllCounter").text(totalEarlyWarningsAllCounter);
                                updateAdvancedSummaryStats();
                                persistPikudHaorefHistoryState();
                            }

                            earlyWarningActive = true;

                            // Make sure the all-clear modal is not overlapping the danger modal
                            if (earlyWarningModalExit._isShown) {
                                earlyWarningModalExit.hide();
                            }

                            // Append newly affected cities to the modal's location list (no duplicates)
                            for (let i = 0; i < alertCities.length; i++) {
                                const city = alertCities[i].replace("''", "'");

                                if (!earlyWarningLocations.includes(city)) {
                                    earlyWarningLocations.push(city);
                                    // Use name appropriate for current language; fall back to raw ID string if unmapped
                                    const cityLang = getCurrentLang();
                                    const cityName = cityLang === "he" ? locationMap[city]?.name_he || locationMap[city]?.name_en || city : locationMap[city]?.name_en || city;
                                    $("#earlyWarningLocations").prepend(cityName + ", ");
                                }
                            }

                            if (!earlyWarningModalEnter._isShown) {
                                startEarlyWarningTimer();
                                earlyWarningModalEnter.show(); // Open the danger modal
                            }
                        }

                        // --- Non-early-warning alert path (rockets, drones, earthquakes, etc.) ---
                        // When a real siren-type alert comes in, any pending early warning is cleared
                        // because the pre-siren phase is now superseded by the actual event.
                    } else if (alertType != "newsFlash") {
                        if (earlyWarningActive) {
                            finishEarlyWarning("first-live-alert", {
                                keepLifecycleActive: true,
                            });
                        }

                        const alertTypeDetails = getAlertDetailsByCategory(alertType);

                        if (alertTypeDetails) {
                            const alertTypeText = alertTypeDetails.text;
                            const alertTypeIcon = alertTypeDetails.icon;
                            const timeStamp = moment().format("HH:mm:ss");

                            // Filter out locations already shown within the last 60 seconds
                            // to avoid flooding the table with duplicate rows during sustained alerts.
                            const locations = extractNewLocations(alertCities);

                            if (locations.length > 0) {
                                playAlertSound();
                            }

                            // Refresh map marker durations only for locations that pass
                            // the 60-second dedup gate used by extractNewLocations.
                            const mapCitiesForRefresh = locations.map((locationId) => {
                                const cityKey = String(locationId).replace("''", "'");
                                const location = locationMap[cityKey]?.name_en || String(locationId);
                                const lat = locationMap[cityKey]?.lat || "";
                                const lng = locationMap[cityKey]?.lng || "";

                                return {
                                    name: location,
                                    lat,
                                    lng,
                                    duration: markerDurationMs,
                                    type: alertType,
                                };
                            });

                            let alertedTimesAdded = false; // Flag to ensure we only update lastAlertedTimes once per alert, even if multiple new locations

                            for (let i = 0; i < locations.length; i++) {
                                const locationOriginal = locations[i];

                                // The API occasionally uses '' (two single-quotes) instead of ' (apostrophe)
                                // in location names. Normalise before looking up in locationMap.
                                const locationKey = locations[i].replace("''", "'");
                                // Resolve location details from the pre-built O(1) index; fall back to raw values
                                const location = locationMap[locationKey]?.name_en || locationOriginal;
                                const location_he = locationMap[locationKey]?.name_he || locationOriginal;
                                const zone = locationMap[locationKey]?.zone || "Unknown";
                                const zone_en = locationMap[locationKey]?.zone_en || "Unknown";
                                const lat = locationMap[locationKey]?.lat || "";
                                const lng = locationMap[locationKey]?.lng || "";

                                if (location) {
                                    // Increment the type-specific counter (rockets vs. drones)
                                    if (alertType === "missiles") {
                                        rocketAlertCounter++;
                                        $("#rocketAlertCounter").text(rocketAlertCounter);
                                    } else if (alertType === "hostileAircraftIntrusion") {
                                        droneAlertCounter++;
                                        $("#droneAlertCounter").text(droneAlertCounter);
                                    } else if (alertType === "general") {
                                        generalAlertCounter++;
                                        $("#generalAlertCounter").text(generalAlertCounter);
                                        $("#total_general_alerts_counter").show();
                                    } else if (alertType === "earthQuake") {
                                        earthquakeAlertCounter++;
                                        $("#earthquakeAlertCounter").text(earthquakeAlertCounter);
                                        $("#total_earthquake_alerts_counter").show();
                                    } else if (alertType === "radiologicalEvent") {
                                        radiologicalEventAlertCounter++;
                                        $("#radiologicalEventAlertCounter").text(radiologicalEventAlertCounter);
                                        $("#total_radiological_event_alerts_counter").show();
                                    } else if (alertType === "tsunami") {
                                        tsunamiAlertCounter++;
                                        $("#tsunamiAlertCounter").text(tsunamiAlertCounter);
                                        $("#total_tsunami_alerts_counter").show();
                                    } else if (alertType === "hazardousMaterials") {
                                        hazardousMaterialsAlertCounter++;
                                        $("#hazardousMaterialsAlertCounter").text(hazardousMaterialsAlertCounter);
                                        $("#total_hazardous_materials_alerts_counter").show();
                                    } else if (alertType === "terroristInfiltration") {
                                        terroristInfiltrationAlertCounter++;
                                        $("#terroristInfiltrationAlertCounter").text(terroristInfiltrationAlertCounter);
                                        $("#total_terrorist_infiltration_alerts_counter").show();
                                    }

                                    if (alertType === "missiles" || alertType === "hostileAircraftIntrusion") {
                                        // Combined total is rockets + drones (other types not counted here)
                                        $("#totalAlertsCounter").text(rocketAlertCounter + droneAlertCounter);
                                        updateAdvancedSummaryStats();

                                        updateAlertedLocation(location, location_he); // Upsert into locations accumulator
                                        updateAlertedZone(zone_en, zone); // Upsert into zones accumulator

                                        // If zone_en is 'Unknown' the location wasn't found in locationMap.
                                        // Log it so the operator can investigate and update the city dataset.
                                        if (zone_en === "Unknown") {
                                            console.log("Unmatched location:", alert[0]);

                                            totalUnmatchedCitiesCounter++;
                                            $("#totalUnmatchedCitiesCounter").text(totalUnmatchedCitiesCounter);

                                            // Only add each unique unmatched name to the modal list once
                                            if (!unmatchedCitiesLogs.includes(location)) {
                                                unmatchedCitiesLogs.push(location);
                                                $("#unmatched_cities_messages").prepend("<li>" + location + "</li>");
                                            }

                                            // Reveal the unmatched-cities counter row the first time
                                            if (!unmatchedCitiesFlag) {
                                                unmatchedCitiesFlag = true;
                                                $("#unmatched_cities_counter, #unmatched_cities").show();
                                            }
                                        }

                                        if (!alertedTimesAdded) {
                                            alertedTimesAdded = true;

                                            // Track and display the last unique times when alerts occurred.
                                            // Only adds a time if it's not already in the list (ensures uniqueness).
                                            const dayOrdinal = moment().format("Do");
                                            const time = timeStamp.slice(0, -3);

                                            // Only add if this time hasn't been recorded yet
                                            if (!lastAlertedTimes.includes(dayOrdinal + " - " + time)) {
                                                lastAlertedTimes.push(dayOrdinal + " - " + time);

                                                $("#last_alerted_times").prepend(`
                                                    <tr>
                                                        <td><span class="text-white">${dayOrdinal} - ${time}</span></td>
                                                    </tr>
                                                `);

                                                if (lastAlertedTimesScroller) {
                                                    lastAlertedTimesScroller.reset();
                                                }
                                            }
                                        }
                                    }

                                    // Prepend a new row to the alerts table.
                                    // animate__fadeInDown gives a visual entry cue; newRow and table-light
                                    // trigger the 5-second highlight fade set up in the cleanup interval above.
                                    // The location name links to Google Maps using the alert's coordinates.
                                    const alertHistoryEntry = {
                                        time: timeStamp,
                                        typeKey: alertType,
                                        typeText: alertTypeText,
                                        typeIcon: alertTypeIcon,
                                        location,
                                        location_he,
                                        zone: zone_en,
                                        zone_he: zone,
                                        lat,
                                        lng,
                                    };

                                    pikudHaorefAlertHistory.unshift(alertHistoryEntry);

                                    if (pikudHaorefAlertHistory.length > maxPersistedPikudRows) {
                                        pikudHaorefAlertHistory.length = maxPersistedPikudRows;
                                    }

                                    $("#pikud_haoref_alerts").prepend(
                                        buildPikudHaorefAlertRowMarkup(alertHistoryEntry, {
                                            includeHighlight: true,
                                        }),
                                    );

                                    if (pikudHaorefScroller) {
                                        pikudHaorefScroller.reset();
                                    }
                                }
                            }

                            addCitiesToMap(mapCitiesForRefresh); // Add new cities to the map and refresh duration for already-active ones

                            // Rebuild the Locations and Zones counter tables after each missile/drone alert.
                            // Only these two types update the counters; other alert types (earthquakes, etc.)
                            // are intentionally excluded because they don't have the same location semantics.
                            if (alertType === "missiles" || alertType === "hostileAircraftIntrusion") {
                                renderAlertedLocationsCounterTable(true);
                                renderAlertedZonesCounterTable(true);
                            }

                            if (allowMapAutoMaximization && !alertsActive) {
                                alertsActive = true; // Set the global flag indicating that at least one alert has been received

                                $("#locationsZoneTile, #summaryLastAlertedTimesTile, #newsHeader, #newsBody, #mapHeader").hide();
                                $("#newsMapTile").removeClass("col-lg-4 col-xl-5").addClass("col-lg-9 col-xl-9");
                            }

                            persistPikudHaorefHistoryState();
                        }
                    }
                }
            }
        }
    } catch (error) {
        const rawErrorMessage = recordError(error, "processPikudHaorefAlert");
        console.error("Error in pushed Pikud HaOref alert handling:", error);
        console.error("Pikud HaOref push handler error message:", rawErrorMessage);
    }
};

restorePikudHaorefHistoryState();
setInterval(() => {
    updateClock();
}, 1000);

// ==================== RSS NEWS FEED SERVICE ====================
// Cycles through a list of RSS feeds (one per poll tick) and prepends
// new articles to the news table, deduplicating by published timestamp.

let rssUpdatePopupTimeoutHandle = null;

function ensureRssUpdatePopupElement() {
    let popup = document.getElementById("rssUpdatesPopup");

    if (popup) {
        return popup;
    }

    popup = document.createElement("div");
    popup.id = "rssUpdatesPopup";
    popup.className = "position-fixed top-0 start-50 translate-middle-x mt-3 px-3 py-2 card table-card bg-dark text-light";
    popup.style.zIndex = "1080";
    popup.style.display = "none";
    popup.style.pointerEvents = "none";
    popup.innerHTML = '<i class="fa-solid fa-newspaper me-2"></i><span id="rssUpdatesPopupText">News update</span>';

    document.body.appendChild(popup);
    return popup;
}

function hideRssUpdatesPopup() {
    const popup = document.getElementById("rssUpdatesPopup");

    if (popup) {
        popup.style.display = "none";
    }

    if (rssUpdatePopupTimeoutHandle !== null) {
        clearTimeout(rssUpdatePopupTimeoutHandle);
        rssUpdatePopupTimeoutHandle = null;
    }
}

// True only when the map has been auto-maximized due to active alerts.
function isAlertMapAutoMaximizedLayout() {
    return alertsActive && $("#newsHeader").is(":hidden") && $("#newsBody").is(":hidden") && $("#mapHeader").is(":hidden");
}

function showRssUpdatesPopup(headline) {
    if (!isAlertMapAutoMaximizedLayout()) {
        return;
    }

    const popup = ensureRssUpdatePopupElement();
    const popupText = document.getElementById("rssUpdatesPopupText");
    const safeHeadline = typeof headline === "string" ? headline.trim() : "";

    if (popupText) {
        popupText.textContent = safeHeadline || "News update";
    }

    popup.style.display = "block";

    if (rssUpdatePopupTimeoutHandle !== null) {
        clearTimeout(rssUpdatePopupTimeoutHandle);
    }

    rssUpdatePopupTimeoutHandle = setTimeout(() => {
        hideRssUpdatesPopup();
    }, 30000);
}

const newsArray = []; // Published timestamps already shown; prevents duplicate rows across polls

// Raw RSS config from server (includes language-specific fields from config.json).
const rssFeedsRaw = Array.isArray(window.__appConfig?.rssFeeds) ? window.__appConfig.rssFeeds : [];

function getLocalizedRssFeeds(lang) {
    const useHebrew = lang === "he";
    const nameKey = useHebrew ? "realname_he" : "realname_en";
    const urlKey = useHebrew ? "url_he" : "url_en";

    return rssFeedsRaw
        .filter((feed) => {
            const localizedName = typeof feed?.[nameKey] === "string" ? feed[nameKey].trim() : "";
            const localizedUrl = typeof feed?.[urlKey] === "string" ? feed[urlKey].trim() : "";
            // Strict rules: if chosen language name/url are missing, skip this feed.
            return Boolean(localizedName && localizedUrl);
        })
        .map((feed) => ({
            codename: feed.codename,
            realname: feed[nameKey].trim(),
            url: feed[urlKey].trim(),
        }));
}

// Registered RSS feeds for the current UI language.
// Language is persisted and the page reloads on language change.
const rssFeeds = getLocalizedRssFeeds(getCurrentLang());

function renderFeedItems(feed, news) {
    try {
        if (!news || news.error) {
            recordError(news?.error || "RSS feed request failed", "rss");
            return;
        }

        const items = Array.isArray(news?.feed?.items) ? news.feed.items : [];
        let reversedArray = [];

        // Extract only the fields needed for display
        items.forEach((item) => {
            if (!item || !item.published || !item.title || !item.url) {
                return;
            }

            const title = String(item.title);
            if (title.includes("🟠") || title.includes("🔴")) {
                return;
            }

            reversedArray.push({
                published: item.published, // Used as the dedup key in newsArray
                title,
                idpublished: item.id,
                url: item.url,
            });
        });

        // Reverse so that older items are prepended first; since each prepend
        // pushes earlier entries down, the final order is newest-on-top.
        reversedArray = reversedArray.reverse();

        reversedArray.forEach((item) => {
            const published = item.published;
            const timeStamp = moment().format("HH:mm");

            // Only add rows for articles not yet shown (dedup by published timestamp)
            if (!newsArray.includes(published)) {
                newsArray.push(published); // Mark as seen

                $("#rss_alerts").prepend(`
                    <tr class="animate__animated animate__fadeInDown animate__faster newRow table-light">
                        <td width="5%"><font class="text-info">${timeStamp}</font></td>
                        <td width="7%"><font class="text-warning">${feed.realname}</font></td>
                        <td><a href="${item.url}" target="_blank" class="newRow text-dark">${item.title}</a></td>
                    </tr>
                `);

                showRssUpdatesPopup(item.title);

                if (rssScroller) {
                    rssScroller.reset();
                }
            }
        });
    } catch (error) {
        logClientError("renderFeedItems", error, {
            feed: feed?.codename || null,
            url: feed?.url || null,
        });
        recordError(error, "rss");
    }
}

function processRssFeedPayload(news, feedUrl) {
    if (!feedUrl) {
        recordError("Missing feed URL in websocket RSS payload", "rss.push");
        return;
    }

    const feed = rssFeeds.find((rssFeed) => rssFeed.url === feedUrl);

    if (!feed) {
        return;
    }

    renderFeedItems(feed, news);
}

function connectDashboardWebsocket() {
    if (typeof WebSocket === "undefined") {
        recordError("WebSocket is not supported by this browser", "websocket");
        return;
    }

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const websocketURL = `${protocol}://${window.location.host}/ws`;
    dashboardSocket = new WebSocket(websocketURL);

    dashboardSocket.addEventListener("open", () => {
        sendWebsocketMessage({
            type: "config",
            rssFeeds,
        });

        sendWebsocketMessage({
            type: "set_test_mode",
            testmode,
        });
    });

    dashboardSocket.addEventListener("message", async (event) => {
        try {
            const message = JSON.parse(String(event?.data || "{}"));

            if (message?.type === "pikud_alert") {
                await processPikudHaorefAlert(message.payload);
                return;
            }

            if (message?.type === "rss_feed") {
                processRssFeedPayload(message.payload, message.feedUrl);
                return;
            }

            if (message?.type === "version_check") {
                if (!message?.payload?.error) {
                    const latestVersion = message.payload?.latestVersion;
                    const serverAppVersion = message.payload?.serverAppVersion;

                    if (serverAppVersion === latestVersion && serverAppVersion !== currentAppVersion) {
                        $("#update_app_version").show();
                    } else {
                        $("#update_app_version").hide();
                    }
                }

                return;
            }

            if (message?.type === "system_error") {
                recordError(message?.payload?.error || "Websocket system error", "websocket");
            }
        } catch (error) {
            logClientError("dashboardSocket.message", error);
        }
    });

    dashboardSocket.addEventListener("close", () => {
        if (websocketReconnectTimeoutHandle !== null) {
            clearTimeout(websocketReconnectTimeoutHandle);
        }

        websocketReconnectTimeoutHandle = setTimeout(() => {
            connectDashboardWebsocket();
        }, websocketReconnectDelayMs);
    });

    dashboardSocket.addEventListener("error", (error) => {
        logClientError("dashboardSocket.error", error);
    });
}

connectDashboardWebsocket();

// ==================== MAP ====================
let map;
let allMarkers = []; // Keeps all active markers
const defaultMapCenter = {
    lat: 31.765352,
    lng: 34.988067,
};
const defaultMapZoom = 9;
const minMapZoom = 9;
const maxMapZoom = 12;

let shouldAutoCenterIdleMap = false;
let hasAutoCenteredIdleMap = false;

// Active city alerts keyed by a stable city identifier.
// A city remains here while its marker is active, then is removed on timeout.
const alertedCitiesState = {
    activeByKey: {},
    activeList: [],
};

// Define map init implementation, then run it immediately if callback already fired.
window.__initMapImpl = function initMapImpl() {
    map = new google.maps.Map(document.getElementById("map"), {
        zoom: defaultMapZoom,
        center: defaultMapCenter,
        minZoom: minMapZoom,
        maxZoom: maxMapZoom,
        mapId: "rocket-alerts-map",
        mapTypeId: "roadmap",
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
        zoomControl: true,
    });
};

if (window.__googleMapsCallbackFired) {
    window.__initMapImpl();
}

function buildMarkerContent(type) {
    const markerElement = document.createElement("div");
    markerElement.className = "adv-marker";

    if (type === "missiles" || type === "hostileAircraftIntrusion") {
        markerElement.classList.add(`adv-marker--${type}`);
    } else {
        markerElement.classList.add("adv-marker--default");
    }

    return markerElement;
}

function armIdleAutoCenter() {
    shouldAutoCenterIdleMap = true;
    hasAutoCenteredIdleMap = false;
}

function resetMapToDefaultIfIdle() {
    if (!map) {
        return;
    }

    const visibleMarkers = allMarkers.filter((marker) => marker && marker.map);
    if (visibleMarkers.length > 0) {
        return;
    }

    if (!shouldAutoCenterIdleMap || hasAutoCenteredIdleMap) {
        return;
    }

    map.panTo(defaultMapCenter);
    map.setZoom(defaultMapZoom);
    hasAutoCenteredIdleMap = true;
}

function restoreDefaultMapLayout() {
    $("#locationsZoneTile, #summaryLastAlertedTimesTile, #newsHeader, #newsBody, #mapHeader").show();
    $("#newsMapTile").removeClass("col-lg-9 col-xl-9").addClass("col-lg-4 col-xl-5");
    hideRssUpdatesPopup();
}

document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
        restoreDefaultMapLayout();
    }
});

// Keeps all active markers visible as markers are added/removed.
function fitMapToActiveMarkers() {
    if (!map) {
        return;
    }

    const visibleMarkers = allMarkers.filter((marker) => marker && marker.map);

    if (visibleMarkers.length === 0) {
        armIdleAutoCenter();
        resetMapToDefaultIfIdle();
        restoreDefaultMapLayout();
        alertsActive = false;

        return;
    }

    shouldAutoCenterIdleMap = false;
    hasAutoCenteredIdleMap = false;

    const bounds = new google.maps.LatLngBounds();
    visibleMarkers.forEach((marker) => bounds.extend(marker.position));

    map.fitBounds(bounds, {
        top: 20,
        right: 30,
        bottom: 20,
        left: 30,
        maxZoom: 12,
    });
}

function getCityKey(city) {
    if (!city || typeof city !== "object") {
        return "invalid-city";
    }

    if (city.id !== undefined && city.id !== null) {
        return String(city.id);
    }

    if (city.name) {
        return String(city.name).toLowerCase();
    }

    return `${city.lat || ""},${city.lng || ""}`;
}

function removeCityFromActiveList(cityKey) {
    alertedCitiesState.activeList = alertedCitiesState.activeList.filter((item) => item.cityKey !== cityKey);
}

function cleanupExpiredCity(cityKey, marker) {
    const activeRecord = alertedCitiesState.activeByKey[cityKey];
    if (activeRecord?.timeoutHandle) {
        clearTimeout(activeRecord.timeoutHandle);
    }

    marker.map = null;
    allMarkers = allMarkers.filter((m) => m !== marker);
    delete alertedCitiesState.activeByKey[cityKey];
    removeCityFromActiveList(cityKey);
    fitMapToActiveMarkers();
}

function scheduleActiveMarkerExpiry(activeRecord, duration) {
    if (!activeRecord) {
        return;
    }

    if (activeRecord.timeoutHandle) {
        clearTimeout(activeRecord.timeoutHandle);
    }

    activeRecord.expiresAt = Date.now() + duration;
    activeRecord.timeoutHandle = setTimeout(() => {
        removeMarkerWithFade(activeRecord.marker, () => {
            cleanupExpiredCity(activeRecord.cityKey, activeRecord.marker);
        });
    }, duration);
}

// Returns only cities that are not currently active on the map.
// Use this before issuing API calls to avoid repeatedly querying active cities.
function getCitiesNeedingApiCall(cities) {
    const safeCities = Array.isArray(cities) ? cities : [];
    return safeCities.filter((city) => !alertedCitiesState.activeByKey[getCityKey(city)]);
}

// Add new city markers without removing existing ones.
// Already-active cities are ignored until their per-city duration expires.
async function addCitiesToMap(cities) {
    try {
        // Wait until map is ready
        if (!map) {
            await waitForMap();
        }

        const incomingCities = Array.isArray(cities) ? cities : [];

        const { PinElement } = await google.maps.importLibrary("marker");

        incomingCities.forEach((city) => {
            if (!city || !Number.isFinite(Number(city.lat)) || !Number.isFinite(Number(city.lng))) {
                return;
            }

            let duration = testModeMarkersDurationMs; // Default duration for test mode markers
            if (!testmode) {
                duration = Number(city.duration) > 0 ? Number(city.duration) : duration;
            }

            const cityKey = getCityKey(city);

            // Refresh expiry if the city is already active on the map.
            if (alertedCitiesState.activeByKey[cityKey]) {
                const activeRecord = alertedCitiesState.activeByKey[cityKey];
                activeRecord.city = city;
                scheduleActiveMarkerExpiry(activeRecord, duration);
                return;
            }

            const type = city.type;

            let backgroundColor = "#1064e2"; // Default
            if (type === "missiles") {
                backgroundColor = "#FF0000"; // Red for missiles
            } else if (type === "hostileAircraftIntrusion") {
                backgroundColor = "#fd7e14"; // Orange for hostile aircraft intrusion
            }

            const pin = new PinElement({
                background: backgroundColor, // fill color (any hex)
                borderColor: "#000000",
                glyphColor: "#FFFFFF", // White color of the letter/icon inside
                scale: 1.2,
            });

            // Start transparent so we can fade in
            pin.style.opacity = "0";

            const marker = new google.maps.marker.AdvancedMarkerElement({
                position: {
                    lat: Number(city.lat),
                    lng: Number(city.lng),
                },
                map: map,
                content: pin,
            });

            // Fade the marker in after it is placed on the map
            addMarkerWithFade(marker);

            // Store it globally so we can track it
            allMarkers.push(marker);

            // Optional: InfoWindow
            const infoWindow = new google.maps.InfoWindow({
                content: `<h3>${city.name || "Unknown location"}</h3>`,
            });
            marker.addEventListener("gmp-click", () => {
                infoWindow.open(map, marker);
            });

            // Store active city record so repeated API cycles can ignore duplicates.
            const activeRecord = {
                cityKey,
                city,
                marker,
                createdAt: Date.now(),
                expiresAt: Date.now() + duration,
                timeoutHandle: null,
            };

            alertedCitiesState.activeByKey[cityKey] = activeRecord;
            alertedCitiesState.activeList.push(activeRecord);

            // On timeout: fade marker, then remove from active state so city can alert again.
            scheduleActiveMarkerExpiry(activeRecord, duration);
        });

        // Fit map to all currently active markers, not only this batch.
        fitMapToActiveMarkers();
    } catch (error) {
        logClientError("addCitiesToMap", error);
    }
}

// Smooth fade-in when a marker first appears
function addMarkerWithFade(marker) {
    if (!marker || !marker.content) return;

    let opacity = 0;
    const fadeStep = 0.08;
    const interval = 50;
    const markerContent = marker.content;

    const fadeInterval = setInterval(() => {
        opacity += fadeStep;
        if (opacity >= 1) {
            clearInterval(fadeInterval);
            markerContent.style.opacity = "1";
        } else {
            markerContent.style.opacity = String(opacity);
        }
    }, interval);
}

// Smooth fade-out + remove marker
function removeMarkerWithFade(marker, onComplete) {
    if (!marker) return;

    let opacity = 1.0;
    const fadeStep = 0.08;
    const interval = 50;
    const markerContent = marker.content;

    const fadeInterval = setInterval(() => {
        opacity -= fadeStep;
        if (opacity <= 0) {
            clearInterval(fadeInterval);
            if (markerContent) {
                markerContent.style.opacity = "0";
            }
            if (typeof onComplete === "function") {
                onComplete();
            }
        } else {
            if (markerContent) {
                markerContent.style.opacity = String(opacity);
            }
        }
    }, interval);
}

// Optional: Clear everything if needed
function clearAllMarkers() {
    alertedCitiesState.activeList.forEach((item) => {
        if (item?.timeoutHandle) {
            clearTimeout(item.timeoutHandle);
        }
    });

    allMarkers.forEach((marker) => {
        marker.map = null;
    });
    allMarkers = [];
    alertedCitiesState.activeByKey = {};
    alertedCitiesState.activeList = [];
    fitMapToActiveMarkers();
}

// Helper: Wait for map to be ready
function waitForMap() {
    return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
            if (map) {
                clearInterval(checkInterval);
                resolve();
            }
        }, 100); // check every 100ms

        // Failsafe to avoid waiting forever if map init never completes.
        setTimeout(() => {
            clearInterval(checkInterval);
            resolve();
        }, 10000);
    });
}

// Expose helper methods for the parent page / external scripts.
window.mapAlerts = {
    addCitiesToMap,
    getCitiesNeedingApiCall,
    getActiveAlerts: function () {
        return alertedCitiesState.activeList.map((item) => ({
            key: item.cityKey,
            city: item.city,
            createdAt: item.createdAt,
            expiresAt: item.expiresAt,
        }));
    },
    clearAllMarkers,
};

// ==================== GENERIC FEED SIZING ====================
// Dynamically constrains any feed element to fit the viewport without extending below the page.
// Shared across all feed panels to avoid code duplication.
const feedSizeConfig = {
    pikud_haoref_feed: {
        bodyId: "pikudBody",
        minHeight: 200,
    },
    zones_feed: {
        bodyId: "zonesBody",
        minHeight: 150,
    },
    last_alerted_times_feed: {
        bodyId: "lastAlertedTimesBody",
        minHeight: 150,
    },
};

const feedRafIds = {}; // Debounce tracking for each feed

function fitFeedToViewport(feedId) {
    const config = feedSizeConfig[feedId];
    if (!config) return; // Unknown feed ID

    const feed = document.getElementById(feedId);
    const bodyElement = document.getElementById(config.bodyId);

    // Skip if the feed doesn't exist or is collapsed
    if (!feed || !bodyElement || !bodyElement.classList.contains("show")) {
        return;
    }

    const rect = feed.getBoundingClientRect(); // Live position relative to viewport
    const viewportBottomGap = 15; // Leave a small breathing room at the bottom of the screen

    // availableHeight = distance from the feed's top edge to the viewport bottom, minus the gap
    const availableHeight = Math.max(config.minHeight, Math.floor(window.innerHeight - rect.top - viewportBottomGap));

    // Apply the computed height as max-height so the feed doesn't exceed the page
    feed.style.maxHeight = `${availableHeight}px`;
}

// Generic debounce helper
function scheduleFitFeedToViewport(feedId) {
    if (feedRafIds[feedId] !== null && feedRafIds[feedId] !== undefined) {
        cancelAnimationFrame(feedRafIds[feedId]);
    }

    feedRafIds[feedId] = requestAnimationFrame(() => {
        feedRafIds[feedId] = null;
        fitFeedToViewport(feedId);
    });
}

// Convenience wrappers for backward compatibility
const fitPikudFeedToViewport = () => fitFeedToViewport("pikud_haoref_feed");
const scheduleFitPikudFeedToViewport = () => scheduleFitFeedToViewport("pikud_haoref_feed");
const fitZonesFeedToViewport = () => fitFeedToViewport("zones_feed");
const scheduleFitZonesFeedToViewport = () => scheduleFitFeedToViewport("zones_feed");
const fitLastAlertedTimesFeedToViewport = () => fitFeedToViewport("last_alerted_times_feed");
const scheduleFitLastAlertedTimesFeedToViewport = () => scheduleFitFeedToViewport("last_alerted_times_feed");

// ==================== MAP SIZING ====================
// Dynamically stretches the map iframe to fill whatever vertical
// space remains between its top edge and the bottom of the viewport.
// This keeps the map as large as possible without causing page scroll.
function fitMapBodyToViewport() {
    const mapBody = $("#mapBody");

    // Skip if the section is collapsed — no point sizing a hidden element
    if (!mapBody || !mapBody.hasClass("show")) {
        return;
    }

    const mapFrame = $("#mapFrame")[0];
    const mapCard = mapBody.find(".card")[0];
    const rect = mapBody[0].getBoundingClientRect(); // Live position relative to viewport
    const viewportBottomGap = 15; // Leave a small breathing room at the bottom of the screen
    const minHeight = 150; // Never shrink the map below this height (px)
    // availableHeight = distance from the section's top edge to the viewport bottom, minus the gap
    const availableHeight = Math.max(minHeight, Math.floor(window.innerHeight - rect.top - viewportBottomGap));

    // Apply the computed height to the wrapper div so the card and iframe can fill it with '100%'
    mapBody.css("height", `${availableHeight}px`);

    if (mapCard) {
        $(mapCard).css("height", "100%"); // Card stretches to fill the wrapper
    }

    if (mapFrame) {
        $(mapFrame).css("height", "100%"); // iframe fills the card
    }
}

let fitMapRafId = null; // Tracks the pending requestAnimationFrame ID for debouncing

// Debounce helper: cancels any queued resize calculation and re-schedules one
// for the next animation frame. This coalesces rapid resize/collapse events
// (e.g. window resize bursts) into a single layout recalculation per frame.
function scheduleFitMapBodyToViewport() {
    if (fitMapRafId !== null) {
        cancelAnimationFrame(fitMapRafId); // Cancel the previously queued frame
    }

    // Queue a fresh calculation; clear the ID once it executes
    fitMapRafId = requestAnimationFrame(() => {
        fitMapRafId = null;
        fitMapBodyToViewport();
    });
}

const mapBodyElement = $("#mapBody");
const newsBodyElement = $("#newsBody");
const pikudBodyElement = $("#pikudBody");
const zonesBodyElement = $("#zonesBody");
const lastAlertedTimesBodyElement = $("#lastAlertedTimesBody");

// Re-size the pikud feed whenever the pikud panel is expanded ('shown') or collapsed ('hidden').
// On 'hidden' we reset the max-height so the panel collapses fully to zero.
if (pikudBodyElement.length) {
    pikudBodyElement.on("shown.bs.collapse", scheduleFitPikudFeedToViewport);
    pikudBodyElement.on("hidden.bs.collapse", () => {
        const pikudFeed = document.getElementById("pikud_haoref_feed");
        if (pikudFeed) pikudFeed.style.maxHeight = ""; // Clear inline max-height so CSS collapse transition works
    });
}

// Watch the pikud alerts table body for new rows being added (via MutationObserver)
// and resize the feed when they appear.
const pikudAlertsElement = document.getElementById("pikud_haoref_alerts");
if (pikudAlertsElement) {
    const pikudMutationObserver = new MutationObserver(() => {
        scheduleFitPikudFeedToViewport();
    });

    pikudMutationObserver.observe(pikudAlertsElement, {
        childList: true, // Detect added/removed rows
        subtree: true, // Include any nested changes
    });
}

// Re-size the zones feed whenever the zones panel is expanded ('shown') or collapsed ('hidden').
// On 'hidden' we reset the max-height so the panel collapses fully to zero.
if (zonesBodyElement.length) {
    zonesBodyElement.on("shown.bs.collapse", scheduleFitZonesFeedToViewport);
    zonesBodyElement.on("hidden.bs.collapse", () => {
        const zonesFeed = document.getElementById("zones_feed");
        if (zonesFeed) zonesFeed.style.maxHeight = ""; // Clear inline max-height so CSS collapse transition works
    });
}

// Watch the zones counter table body for new rows being added (via MutationObserver)
// and resize the feed when they appear.
const zonesCounterElement = document.getElementById("alerted_zones_counter");
if (zonesCounterElement) {
    const zonesMutationObserver = new MutationObserver(() => {
        scheduleFitZonesFeedToViewport();
    });

    zonesMutationObserver.observe(zonesCounterElement, {
        childList: true, // Detect added/removed rows
        subtree: true, // Include any nested changes
    });
}

// Re-size the last alerted times feed whenever the panel is expanded ('shown') or collapsed ('hidden').
// On 'hidden' we reset the max-height so the panel collapses fully to zero.
if (lastAlertedTimesBodyElement.length) {
    lastAlertedTimesBodyElement.on("shown.bs.collapse", scheduleFitLastAlertedTimesFeedToViewport);
    lastAlertedTimesBodyElement.on("hidden.bs.collapse", () => {
        const lastAlertedTimesFeed = document.getElementById("last_alerted_times_feed");
        if (lastAlertedTimesFeed) lastAlertedTimesFeed.style.maxHeight = ""; // Clear inline max-height so CSS collapse transition works
    });
}

// Watch the last alerted times table body for new rows being added (via MutationObserver)
// and resize the feed when they appear.
const lastAlertedTimesElement = document.getElementById("last_alerted_times");
if (lastAlertedTimesElement) {
    const lastAlertedTimesMutationObserver = new MutationObserver(() => {
        scheduleFitLastAlertedTimesFeedToViewport();
    });

    lastAlertedTimesMutationObserver.observe(lastAlertedTimesElement, {
        childList: true, // Detect added/removed rows
        subtree: true, // Include any nested changes
    });
}

// Re-size the map whenever the map panel is expanded ('shown') or collapsed ('hidden').
// On 'hidden' we reset the explicit height so the panel collapses fully to zero.
if (mapBodyElement.length) {
    mapBodyElement.on("shown.bs.collapse", scheduleFitMapBodyToViewport);
    mapBodyElement.on("hidden.bs.collapse", () => {
        $(mapBodyElement).css("height", ""); // Clear inline height so CSS collapse transition works
    });
}

// The news feed panel sits above the map; any change in its height affects
// how much space remains for the map, so we must resize on its collapse events too.
if (newsBodyElement.length) {
    newsBodyElement.on("shown.bs.collapse", scheduleFitMapBodyToViewport);
    newsBodyElement.on("hidden.bs.collapse", scheduleFitMapBodyToViewport);

    // Prefer ResizeObserver (modern browsers) to react to news feed height changes
    // as new RSS rows are prepended, without needing polling.
    if (typeof ResizeObserver !== "undefined") {
        const newsBodyResizeObserver = new ResizeObserver(() => {
            scheduleFitMapBodyToViewport();
        });

        newsBodyResizeObserver.observe(newsBodyElement[0]);
    } else {
        // Fallback for browsers that lack ResizeObserver: watch the table body
        // for DOM mutations (row prepends) and resize when they occur.
        const rssAlertsElement = $("#rss_alerts")[0];

        if (rssAlertsElement) {
            const newsBodyMutationObserver = new MutationObserver(() => {
                scheduleFitMapBodyToViewport();
            });

            newsBodyMutationObserver.observe(rssAlertsElement, {
                childList: true, // Detect added/removed rows
                subtree: true, // Include any nested changes
            });
        }
    }
}

// Resize map, pikud feed, zones feed, and last alerted times feed on window resize
$(window).on("resize", () => {
    scheduleFitMapBodyToViewport();
    scheduleFitPikudFeedToViewport();
    scheduleFitZonesFeedToViewport();
    scheduleFitLastAlertedTimesFeedToViewport();
});

// Run initial sizing once all resources have loaded
$(window).on("load", () => {
    scheduleFitMapBodyToViewport();
    scheduleFitPikudFeedToViewport();
    scheduleFitZonesFeedToViewport();
    scheduleFitLastAlertedTimesFeedToViewport();
});

// Initial calls on script execution
scheduleFitMapBodyToViewport();
scheduleFitPikudFeedToViewport();
scheduleFitZonesFeedToViewport();
scheduleFitLastAlertedTimesFeedToViewport();

// ==================== AUTOSCROLLERS ======================

// ==================== AUTOSCROLLER FACTORY ====================
// Single reusable autoscroller. Waits, slowly scrolls an element to the
// bottom, jumps back to top, then repeats — stopping whenever isEnabled()
// returns false.
//
// Options:
//   elementId            — ID of the scrollable container
//   isEnabled            — function() → bool; scroll pauses when false
//   waitBeforeScrollDown — ms to wait before scrolling down  (default: 5000)
//   waitBeforeScrollUp   — ms to wait at bottom before reset (default: 1000)
//   scrollStepPx         — pixels moved per tick              (default: 1)
//   scrollStepInterval   — ms between each tick               (default: 20)
function createAutoScroller({ elementId, isEnabled, waitBeforeScrollDown = 5000, waitBeforeScrollUp = 1000, scrollStepPx = 1, scrollStepInterval = 20 }) {
    const element = document.getElementById(elementId);
    if (!element) {
        return;
    }

    let waitTimeoutId = null;
    let scrollIntervalId = null;

    function clearScrollTimers() {
        if (waitTimeoutId !== null) {
            clearTimeout(waitTimeoutId);
            waitTimeoutId = null;
        }

        if (scrollIntervalId !== null) {
            clearInterval(scrollIntervalId);
            scrollIntervalId = null;
        }
    }

    function runScrollCycle() {
        if (!isEnabled()) {
            clearScrollTimers();
            return;
        }

        clearScrollTimers();

        waitTimeoutId = setTimeout(() => {
            scrollIntervalId = setInterval(() => {
                if (!isEnabled()) {
                    clearInterval(scrollIntervalId);
                    scrollIntervalId = null;
                    return;
                }

                const maxScrollTop = element.scrollHeight - element.clientHeight;

                // Nothing to scroll
                if (maxScrollTop <= 0) {
                    clearInterval(scrollIntervalId);
                    scrollIntervalId = null;
                    runScrollCycle();
                    return;
                }

                const nextScrollTop = Math.min(element.scrollTop + scrollStepPx, maxScrollTop);
                element.scrollTop = nextScrollTop;

                // Reached bottom: wait, then jump to top and restart cycle
                if (nextScrollTop >= maxScrollTop) {
                    clearInterval(scrollIntervalId);
                    scrollIntervalId = null;

                    waitTimeoutId = setTimeout(() => {
                        element.scrollTop = 0;
                        runScrollCycle();
                    }, waitBeforeScrollUp);
                }
            }, scrollStepInterval);
        }, waitBeforeScrollDown);
    }

    runScrollCycle();

    // Return a reset handle so callers can jump back to top and restart
    return {
        reset() {
            clearScrollTimers();
            element.scrollTop = 0;
            runScrollCycle();
        },
    };
}

// ==================== PIKUD HAOREF AUTO-SCROLL ====================
let pikudHaorefScroller = null; // Exposed so the polling loop can reset it on new rows

function startPikudHaorefAutoScroll() {
    pikudHaorefScroller = createAutoScroller({
        elementId: "pikud_haoref_feed",
        isEnabled: () => pikudHaorefAutoScrollEnabled,
        waitBeforeScrollDown: 30000,
        waitBeforeScrollUp: 1000,
        scrollStepPx: 1,
        scrollStepInterval: 20,
    });
}

if (localStorage.getItem("autoScrollPikudHaoref") === "true") {
    startPikudHaorefAutoScroll();
}

// ==================== ALERT LOCATIONS AUTO-SCROLL ====================
let alertLocationsScroller = null; // Exposed so the polling loop can reset it on new rows

function startAlertLocationsAutoScroll() {
    alertLocationsScroller = createAutoScroller({
        elementId: "locations_feed",
        isEnabled: () => locationsAutoScrollEnabled,
        waitBeforeScrollDown: 30000,
        waitBeforeScrollUp: 1000,
        scrollStepPx: 1,
        scrollStepInterval: 20,
    });
}

if (localStorage.getItem("autoScrollLocations") === "true") {
    startAlertLocationsAutoScroll();
}

// ==================== ALERT ZONES AUTO-SCROLL ====================
let alertZonesScroller = null; // Exposed so the polling loop can reset it on new rows

function startAlertZonesAutoScroll() {
    alertZonesScroller = createAutoScroller({
        elementId: "zones_feed",
        isEnabled: () => zonesAutoScrollEnabled,
        waitBeforeScrollDown: 30000,
        waitBeforeScrollUp: 1000,
        scrollStepPx: 1,
        scrollStepInterval: 20,
    });
}

if (localStorage.getItem("autoScrollZones") === "true") {
    startAlertZonesAutoScroll();
}

// ==================== LAST ALERTED TIMES AUTO-SCROLL ====================
let lastAlertedTimesScroller = null; // Exposed so the polling loop can reset it on new rows

function startLastAlertedTimesAutoScroll() {
    lastAlertedTimesScroller = createAutoScroller({
        elementId: "last_alerted_times_feed",
        isEnabled: () => lastAlertedTimesAutoScrollEnabled,
        waitBeforeScrollDown: 30000,
        waitBeforeScrollUp: 1000,
        scrollStepPx: 1,
        scrollStepInterval: 20,
    });
}

if (localStorage.getItem("autoScrollLastAlertedTimes") === "true") {
    startLastAlertedTimesAutoScroll();
}

// ==================== RSS AUTO-SCROLL ====================
let rssScroller = null; // Exposed so the polling loop can reset it on new rows

function startRssAutoScroll() {
    rssScroller = createAutoScroller({
        elementId: "rss_feed",
        isEnabled: () => rssAutoScrollEnabled,
        waitBeforeScrollDown: 30000,
        waitBeforeScrollUp: 1000,
        scrollStepPx: 1,
        scrollStepInterval: 55,
    });
}

if (localStorage.getItem("autoScrollRss") === "true") {
    startRssAutoScroll();
}

// ==================== EARLY WARNING AUTO-SCROLL ====================
function startEarlyWarningAutoScroll() {
    createAutoScroller({
        elementId: "earlyWarningLocations",
        isEnabled: () => earlyWarningAutoScrollEnabled,
        waitBeforeScrollDown: 30000,
        waitBeforeScrollUp: 1000,
        scrollStepPx: 1,
        scrollStepInterval: 55,
    });
}

if (localStorage.getItem("autoScrollEarlyWarning") !== "false") {
    startEarlyWarningAutoScroll();
}

allowMapAutoMaximization = localStorage.getItem("allowMapAutoMaximization") !== "false";
