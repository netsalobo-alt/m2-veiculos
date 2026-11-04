FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && npm ci --omit=dev \
  && apt-get purge -y python3 make g++ && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*
COPY . .
ENV PORT=3000 DATA_DIR=/app/data
VOLUME /app/data
EXPOSE 3000
CMD ["node", "src/server.js"]
