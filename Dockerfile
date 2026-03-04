FROM mcr.microsoft.com/devcontainers/javascript-node:1-22-bullseye AS builder

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies (Yarn 4 - matches current lockfile)
COPY package.json yarn.lock .yarnrc.yml ./
RUN corepack enable && corepack prepare yarn@4.12.0 --activate
RUN yarn install --immutable

COPY . .

RUN yarn build

FROM mcr.microsoft.com/devcontainers/javascript-node:1-22-bullseye

ENV NODE_ENV=production

# Create app directory and install deps as root (corepack needs root)
WORKDIR /usr/src/app
COPY package.json yarn.lock .yarnrc.yml ./
RUN corepack enable && corepack prepare yarn@4.12.0 --activate && \
    yarn install --immutable --production

COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/.env ./.env
COPY --from=builder /usr/src/app/.env ./dist/.env

RUN chown -R node:node /usr/src/app
USER node

EXPOSE 3000
CMD [ "node", "dist/server.js" ]
