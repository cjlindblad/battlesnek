FROM node:24

ENV NODE_ENV=production

WORKDIR /app

COPY . .
RUN npm install --production

CMD [ "npm", "start" ]
