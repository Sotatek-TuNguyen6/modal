FROM python:3.9-slim

WORKDIR /app

# Cài đặt các thư viện hệ thống cần thiết
RUN apt-get update && apt-get install -y \
    build-essential \
    git \
    ffmpeg \
    libgl1 \
    && rm -rf /var/lib/apt/lists/*

# Cài đặt PyTorch CPU
RUN pip install --no-cache-dir torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu

# Cài đặt các thư viện Python cần thiết
RUN pip install --no-cache-dir \
    flask \
    faiss-cpu \
    numpy \
    pillow \
    opencv-python-headless \
    transformers \
    timm

# Tạo thư mục lưu ảnh
RUN mkdir -p /app/image_storage

# Sao chép mã nguồn vào container
COPY . .

# Mở cổng ứng dụng Flask
EXPOSE 5000

# Chạy ứng dụng Flask
CMD ["python", "app.py"]
