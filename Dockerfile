FROM node:20

RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    python3-pip

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

CMD ["npm", "start"]
