# Multi-stage build for OBTV Studio Manager
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:18-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create app directory and user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S obtv -u 1001

WORKDIR /app

# Copy built application from builder stage
COPY --from=builder --chown=obtv:nodejs /app/dist ./dist
COPY --from=builder --chown=obtv:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=obtv:nodejs /app/package*.json ./

# Switch to non-root user
USER obtv

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/api/health || exit 1

# Start the application
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server/index.js"]