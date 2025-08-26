FROM node:18-alpine

# Install security tools
RUN apk add --no-cache \
    nmap \
    openssl \
    curl \
    netcat-openbsd

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S security -u 1001

# Set ownership
RUN chown -R security:nodejs /app
USER security

# Expose port
EXPOSE 3007

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3007/health || exit 1

CMD ["node", "src/index.js"]