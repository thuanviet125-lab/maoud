FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY proxy.js .
USER node
EXPOSE 8080 9000
CMD ["node", "proxy.js"]
