FROM node:22-bookworm-slim AS validator

ENV PUPPETEER_SKIP_DOWNLOAD=true
WORKDIR /validator
COPY package*.json ./
RUN npm ci --production=false
COPY data data
COPY tsconfig.json ./
COPY src src
RUN npm run build-server

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    GULCHDALE_VALIDATOR=/opt/gulchdale-validator/dist/src/tools/validateGulchdaleCandidate.js

WORKDIR /workspace
COPY compiler /workspace/compiler
RUN pip install --no-cache-dir /workspace/compiler

COPY --from=validator /usr/local/bin/node /usr/local/bin/node
COPY --from=validator /validator/dist /opt/gulchdale-validator/dist
COPY --from=validator /validator/node_modules /opt/gulchdale-validator/node_modules
COPY --from=validator /validator/package.json /opt/gulchdale-validator/package.json

ENTRYPOINT ["gulchdale-compiler", "--root", "/workspace"]
CMD ["status"]
