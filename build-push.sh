#!/bin/bash

# Cấu hình
DOCKER_USERNAME="ntu11022002"  # Thay đổi thành username Docker Hub của bạn
IMAGE_PREFIX="modal"  # Prefix cho tên image
VERSION="1.0.1"  # Version của images


sudo chmod 777 /var/run/docker.sock
# Kiểm tra đăng nhập Docker
echo "Kiểm tra đăng nhập Docker Hub..."
if ! docker info > /dev/null 2>&1; then
  echo "Docker không chạy. Vui lòng khởi động Docker và thử lại."
  exit 1
fi

# Đăng nhập vào Docker Hub (nếu chưa đăng nhập)
echo "Đăng nhập vào Docker Hub..."
docker login

# Build và push image cho client
echo "Building client image..."
docker build -t $DOCKER_USERNAME/$IMAGE_PREFIX-client:$VERSION ./client
echo "Pushing client image..."
docker push $DOCKER_USERNAME/$IMAGE_PREFIX-client:$VERSION
docker tag $DOCKER_USERNAME/$IMAGE_PREFIX-client:$VERSION $DOCKER_USERNAME/$IMAGE_PREFIX-client:latest
docker push $DOCKER_USERNAME/$IMAGE_PREFIX-client:latest

# Build và push image cho backend-nodejs
echo "Building backend image..."
docker build -t $DOCKER_USERNAME/$IMAGE_PREFIX-backend:$VERSION ./backend-nodejs
echo "Pushing backend image..."
docker push $DOCKER_USERNAME/$IMAGE_PREFIX-backend:$VERSION
docker tag $DOCKER_USERNAME/$IMAGE_PREFIX-backend:$VERSION $DOCKER_USERNAME/$IMAGE_PREFIX-backend:latest
docker push $DOCKER_USERNAME/$IMAGE_PREFIX-backend:latest

# Build và push image cho clip-python
echo "Building clip-python image..."
docker build -t $DOCKER_USERNAME/$IMAGE_PREFIX-clip:$VERSION ./clip-python
echo "Pushing clip-python image..."
docker push $DOCKER_USERNAME/$IMAGE_PREFIX-clip:$VERSION
docker tag $DOCKER_USERNAME/$IMAGE_PREFIX-clip:$VERSION $DOCKER_USERNAME/$IMAGE_PREFIX-clip:latest
docker push $DOCKER_USERNAME/$IMAGE_PREFIX-clip:latest

echo "Hoàn thành! Tất cả images đã được build và push lên Docker Hub."
echo ""
echo "Để pull về VPS, chạy các lệnh sau:"
echo "docker pull $DOCKER_USERNAME/$IMAGE_PREFIX-client:latest"
echo "docker pull $DOCKER_USERNAME/$IMAGE_PREFIX-backend:latest"
echo "docker pull $DOCKER_USERNAME/$IMAGE_PREFIX-clip:latest" 