FROM mcr.microsoft.com/playwright:v1.62.1-noble

WORKDIR /app

RUN mkdir -p /root/.ssh && chmod 700 /root/.ssh

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY scripts ./scripts

ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "src/index.js"]
