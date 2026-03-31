# Rocket News Dashboard

## Requirements

- Node.js 24
- Israeli IP (or use proxy)

## Run Locally

```
npm install
npm start or node app.js
```

Open your browser at:

http://localhost:8080

## Configuration

All configuration is stored in `config.json` at the project root:

```json
{
    "proxyUrl": "http://...",
    "webServerPort": 8080,
    "gitRepo": "git@github.com:...",
    "googleMapsApiKey": "YOUR_API_KEY"
}
```

| Key | Description |
|-----|-------------|
| `proxyUrl` | HTTP proxy used to route requests through an Israeli IP (required if running outside Israel) |
| `webServerPort` | Port the web server listens on (default: `8080`) |
| `gitRepo` | SSH URL of the Git repository |
| `googleMapsApiKey` | Google Maps API key used for the map view |

## Running as a Service (PM2)

It is recommended to use [PM2](https://pm2.keymetrics.io/) to keep the app running in the background and restart it automatically on crashes or reboots.

Install PM2 globally:

```
npm install pm2 -g
```

Start the app with PM2:

```
pm2 start app.js --name rocket-news-dashboard
```

To make it persist across system reboots:

```
pm2 save
pm2 startup
```
