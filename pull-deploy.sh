#!/bin/bash

# Cấu hình
DOCKER_USERNAME="ntu11022002"
IMAGE_PREFIX="modal"
DOMAIN="inhoanglinh.click"
API_DOMAIN="api.inhoanglinh.click"

# Kiểm tra Docker
echo "Kiểm tra Docker..."
if ! docker info > /dev/null 2>&1; then
  echo "Docker không chạy. Vui lòng khởi động Docker và thử lại."
  exit 1
fi

# Pull images
echo "Pulling images từ Docker Hub..."
docker pull $DOCKER_USERNAME/$IMAGE_PREFIX-client:latest
docker pull $DOCKER_USERNAME/$IMAGE_PREFIX-backend:latest
docker pull $DOCKER_USERNAME/$IMAGE_PREFIX-clip:latest

# Dừng và xóa container cũ
echo "Dừng và xóa các container cũ..."
docker compose down

# Tạo thư mục nginx config
mkdir -p ./nginx/conf.d

# Tạo Nginx config chỉ HTTP
cat > ./nginx/conf.d/default.conf << EOF
# Domain chính
server {
    listen 80;
    server_name ${DOMAIN} www.${DOMAIN};

    location / {
        proxy_pass http://client:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }

    location /uploads {
        proxy_pass http://backend:4000/uploads;
    }
}

# API domain
server {
    listen 80;
    server_name ${API_DOMAIN};

    location / {
        proxy_pass http://backend:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

# Tạo docker-compose.yml
cat > docker-compose.yml << EOF
services:
  nginx:
    image: nginx:stable-alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx/conf.d:/etc/nginx/conf.d
    depends_on:
      - client
      - backend
    networks:
      - app-network
    restart: always

  client:
    image: $DOCKER_USERNAME/$IMAGE_PREFIX-client:latest
    expose:
      - "3000"
    depends_on:
      - backend
    environment:
      - NEXT_PUBLIC_API_URL=https://${API_DOMAIN}
      - NEXT_PUBLIC_INTERNAL_API_URL=https://${API_DOMAIN}
      - NODE_ENV=production
    networks:
      - app-network
    restart: always

  backend:
    image: $DOCKER_USERNAME/$IMAGE_PREFIX-backend:latest
    expose:
      - "4000"
    depends_on:
      - clip-service
    environment:
      - CLIP_SERVICE_URL=http://clip-service:5000
      - MONGO_URI=mongodb+srv://nguyendinhtu11022002:v0YGqRqtzoUw72Mp@inbe.htme7st.mongodb.net/
      - NODE_ENV=production
    volumes:
      - backend-uploads:/usr/src/app/uploads
    networks:
      - app-network
    restart: always

  clip-service:
    image: $DOCKER_USERNAME/$IMAGE_PREFIX-clip:latest
    expose:
      - "5000"
    volumes:
      - clip-storage:/app/image_storage
      - clip-data:/app/data
      - clip-model-cache:/root/.cache/clip
    environment:
      - FLASK_ENV=production
    networks:
      - app-network
    restart: always

networks:
  app-network:
    driver: bridge

volumes:
  backend-uploads:
  clip-storage:
  clip-data:
  clip-model-cache:
EOF

# Khởi động các container
echo "Khởi động các container..."
docker compose up -d

# Hiển thị trạng thái
echo "Trạng thái các container:"
docker compose ps

echo "Hoàn thành! Ứng dụng đã được triển khai trong môi trường production (Cloudflare Flexible SSL)."
echo "Frontend: https://${DOMAIN}"
echo "API: https://${API_DOMAIN}"
