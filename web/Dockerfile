FROM node:22-alpine AS deps
WORKDIR /srv
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /srv
COPY --from=deps /srv/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_API_URL is inlined at build time — set it as a build variable
# on the Railway web service.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /srv
ENV NODE_ENV=production
COPY --from=build /srv ./
EXPOSE 3000
CMD ["sh", "-c", "npm run start -- --port ${PORT:-3000}"]
