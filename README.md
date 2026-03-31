# Rocket News Dashboard

## Requirements

- Node.js 24
- Israeli IP (or use proxy)

## Run Locally

```
npm install
node app.js
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
