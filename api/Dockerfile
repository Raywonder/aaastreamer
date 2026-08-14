FROM node:20-alpine

WORKDIR /app
RUN apk add --no-cache ffmpeg

COPY api/package.json api/package-lock.json ./
RUN npm ci --omit=dev

COPY api/src ./src
COPY docs ./docs
COPY scripts ./scripts

EXPOSE 8095

CMD ["npm", "start"]
