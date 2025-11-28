FROM node:18

WORKDIR /app

COPY event/package*.json ./

RUN npm install

COPY event/ ./

EXPOSE 5000

CMD ["npm", "start"]