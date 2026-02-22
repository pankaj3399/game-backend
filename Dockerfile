FROM mcr.microsoft.com/devcontainers/javascript-node:1-22-bullseye as builder

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package.json yarn.lock ./

RUN yarn install --frozen-lockfile 

COPY . .

RUN yarn build 

FROM mcr.microsoft.com/devcontainers/javascript-node:1-22-bullseye

ENV NODE_ENV production
USER node

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package.json yarn.lock ./

RUN yarn install --production --frozen-lockfile

COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/.env ./.env
COPY --from=builder /usr/src/app/.env ./dist/.env

EXPOSE 3000 
CMD [ "node", "dist/server.js" ]
