FROM node:lts-alpine

# Install system dependencies & Docker CLI, plus build tools for node-pty
RUN apk update && apk add --no-cache \
    docker \
    python3 \
    make \
    g++

WORKDIR /app

# Copy package info and install deps
COPY package*.json ./
COPY tsconfig.json ./
RUN npm install

# Copy source code
COPY src ./src
COPY tools ./tools
COPY containers.yaml ./containers.yaml

# Build TypeScript
RUN npm run build

# Create workspace directory
RUN mkdir -p workspace_data && chmod 777 workspace_data

# Environment
ENV NODE_ENV=production

# By default, run in Docker mode
CMD ["node", "dist/index.js", "--mode", "docker"]
