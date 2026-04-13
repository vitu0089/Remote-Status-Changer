FROM node:24.11.1

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 3306

CMD [ "npm", "start" ]