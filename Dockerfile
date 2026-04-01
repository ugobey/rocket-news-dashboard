# Use Node 24 LTS base image
FROM node:24-alpine

# Set workdir
WORKDIR /usr/src/app

# Copy dependency manifests
COPY package.json package-lock.json* ./

# Install git and dependencies (npm ci works only with package-lock.json; fallback to npm install)
RUN apk add --no-cache git \
    && if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

# Copy app source
COPY . .

# Expose default port (can be overridden via PORT envvar)
EXPOSE 8080

ENV PORT=8080

CMD ["node", "app.js", "--use-system-ca"]
