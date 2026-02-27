FROM mcr.microsoft.com/devcontainers/javascript-node:1-22-bullseye as builder

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package.json yarn.lock ./
RUN corepack enable && corepack prepare yarn@1.22.22 --activate
RUN yarn install --frozen-lockfile 

COPY . .

RUN yarn build 

FROM mcr.microsoft.com/devcontainers/javascript-node:1-22-bullseye

ENV NODE_ENV=production

# Create app directory and install deps as root (corepack needs root)
WORKDIR /usr/src/app
COPY package.json yarn.lock ./
RUN corepack enable && corepack prepare yarn@1.22.22 --activate && \
    yarn install --production --frozen-lockfile

COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/.env ./.env
COPY --from=builder /usr/src/app/.env ./dist/.env

RUN chown -R node:node /usr/src/app
USER node

EXPOSE 3000 
CMD [ "node", "dist/server.js" ]
