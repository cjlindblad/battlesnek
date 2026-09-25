FROM node:24

ENV NODE_ENV=production

WORKDIR /app

COPY . .
RUN npm install --production

ARG GIT_COMMIT
ENV GIT_COMMIT=$GIT_COMMIT

CMD [ "npm", "start" ]
