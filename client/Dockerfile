# Use Node.js with glibc instead of Alpine
FROM node:18-slim

# Set working directory
WORKDIR /app

# Copy package files first
COPY package*.json ./

# Install dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# rm node_modules
RUN rm -rf node_modules package-lock.json

# Install dependencies with node-gyp support
RUN npm install

# Copy source code
COPY . .

# Build-time arguments

# Set environment variables for build
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV HOSTNAME="0.0.0.0"
ENV NEXT_PUBLIC_API_URL=https://api.inhoanglinh.click

# Rebuild lightningcss for the current platform
RUN npm rebuild lightningcss --platform=linux --arch=x64

# Build the application with verbose output
RUN npm run build

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "run", "start"] 