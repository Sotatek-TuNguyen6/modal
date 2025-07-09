from flask import Flask, request, jsonify
import torch
import faiss
import numpy as np
import os
import io
import cv2
from PIL import Image
import time
from functools import lru_cache
from transformers import AutoImageProcessor, AutoModel, ConditionalDetrForObjectDetection, ConditionalDetrImageProcessor
from huggingface_hub import login

import shutil

app = Flask(__name__)
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# === Đường dẫn ===
INDEX_PATH = "faiss_index_dino.idx"
PATHS_PATH = "features_paths_dino.npy"
STORAGE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "image_storage")
os.makedirs(STORAGE_DIR, exist_ok=True)

# === Cấu hình tối ưu ===
# Giới hạn bộ nhớ PyTorch
torch.backends.cudnn.benchmark = True
if DEVICE.type == 'cuda':
    torch.cuda.empty_cache()
else:
    # Giới hạn số luồng cho CPU
    torch.set_num_threads(2)  # Giới hạn số luồng CPU để tránh quá tải

# Thêm timeout cho các hoạt động
TIMEOUT_SECONDS = 30

# === Lazy loading mô hình ===
dino_processor = None
dino_model = None
detr_processor = None
detr_model = None

def load_models_if_needed():
    global dino_processor, dino_model, detr_processor, detr_model
    
    # Tải DINO model nếu chưa tải
    if dino_processor is None or dino_model is None:
        print("Đang tải mô hình DINO...")
        try:
            dino_processor = AutoImageProcessor.from_pretrained("facebook/dinov2-base")
            dino_model = AutoModel.from_pretrained("facebook/dinov2-base").to(DEVICE).eval()
            print("Đã tải xong mô hình DINO")
        except Exception as e:
            print(f"Lỗi khi tải mô hình DINO: {e}")
            raise
    
    # Tải DETR model nếu chưa tải và cần thiết
    if detr_processor is None or detr_model is None:
        print("Đang tải mô hình DETR...")
        try:
            detr_processor = ConditionalDetrImageProcessor.from_pretrained("yainage90/fashion-object-detection")
            detr_model = ConditionalDetrForObjectDetection.from_pretrained("yainage90/fashion-object-detection").to(DEVICE).eval()
            print("Đã tải xong mô hình DETR")
        except Exception as e:
            print(f"Lỗi khi tải mô hình DETR: {e}")
            raise

# Preload models in background to avoid cold start
def preload_models():
    print("⏳ Preloading models in background...")
    try:
        load_models_if_needed()
        print("✅ Models preloaded successfully!")
    except Exception as e:
        print(f"❌ Error preloading models: {e}")

# === Load index ===
print("Đang tải FAISS index...")
if os.path.exists(INDEX_PATH) and os.path.exists(PATHS_PATH):
    index = faiss.read_index(INDEX_PATH)
    image_paths = list(np.load(PATHS_PATH, allow_pickle=True))
    print(f"Đã tải index với {len(image_paths)} ảnh")
else:
    index = faiss.IndexFlatIP(768)
    image_paths = []
    print("Tạo index mới")

# === Hàm trích xuất đặc trưng với cache ===
@lru_cache(maxsize=200)  # Tăng cache size lên 200 ảnh
def extract_feature_dino(image_path):
    start_time = time.time()
    try:
        # Đảm bảo model đã được tải
        load_models_if_needed()
        
        # Đọc ảnh với chất lượng gốc
        image = Image.open(image_path).convert("RGB")
            
        # Xử lý với DINO - giữ nguyên chất lượng ảnh
        inputs = dino_processor(images=image, return_tensors="pt").to(DEVICE)
        with torch.no_grad():
            outputs = dino_model(**inputs)
            feat = outputs.last_hidden_state[:, 0]
            feat = torch.nn.functional.normalize(feat, dim=-1)
        
        result = feat.cpu().numpy().squeeze()
        
        elapsed = time.time() - start_time
        print(f"Trích xuất đặc trưng DINO: {elapsed:.2f}s")
        return result
    except Exception as e:
        print(f"Lỗi trích xuất đặc trưng: {e}")
        # Trả về vector rỗng nếu có lỗi
        return np.zeros(768, dtype=np.float32)

# === Crop váy bằng DETR với timeout ===
def crop_dress(image_path, save_path):
    start_time = time.time()
    try:
        # Đảm bảo model đã được tải
        load_models_if_needed()
            
        # Đọc ảnh với OpenCV giữ nguyên kích thước gốc
        img_cv2 = cv2.imread(image_path)
        if img_cv2 is None:
            print(f"⚠️ Không thể đọc ảnh: {image_path}")
            return False
            
        # Lấy kích thước ảnh
        height, width = img_cv2.shape[:2]
        
        # Sử dụng ảnh gốc không resize
        orig_img = img_cv2
            
        # Chuyển đổi sang PIL để xử lý với DETR
        image = Image.fromarray(cv2.cvtColor(img_cv2, cv2.COLOR_BGR2RGB))
        
        # Xử lý với DETR - giữ nguyên chất lượng ảnh
        inputs = detr_processor(images=image, return_tensors="pt").to(DEVICE)
        with torch.no_grad():
            outputs = detr_model(**inputs)

        # Xử lý kết quả
        probs = outputs.logits.softmax(-1)[0, :, :-1]
        keep = probs.max(dim=-1).values > 0.7
        boxes = outputs.pred_boxes[0, keep]
        labels = probs[keep].argmax(dim=-1)
        
        # Tìm váy/skirt
        found = False
        for i, box in enumerate(boxes):
            label = detr_model.config.id2label[labels[i].item()]
            if "dress" in label.lower() or "skirt" in label.lower():
                # Lấy tọa độ box
                cx, cy, w, h = box
                
                # Tính toán tọa độ trên ảnh gốc
                x1 = int((cx - w / 2) * width)
                y1 = int((cy - h / 2) * height)
                x2 = int((cx + w / 2) * width)
                y2 = int((cy + h / 2) * height)
                
                x1, y1 = max(x1, 0), max(y1, 0)
                x2, y2 = min(x2, width), min(y2, height)

                # Crop và lưu ảnh với kích thước gốc
                crop = orig_img[y1:y2, x1:x2]
                if crop.size == 0:
                    continue
                    
                # Lưu ảnh crop không resize
                crop = cv2.resize(crop, (224, 224))
                cv2.imwrite(save_path, crop)
                found = True
                break
        
        # Nếu không tìm thấy, sử dụng crop mặc định
        if not found:
            # Crop mặc định vùng giữa ảnh
            x1, y1, x2, y2 = 89, 273, 300, 600
            x1, y1 = max(x1, 0), max(y1, 0)
            x2, y2 = min(x2, width), min(y2, height)

            crop = img_cv2[y1:y2, x1:x2]
            crop = cv2.resize(crop, (224, 224))
            cv2.imwrite(save_path, crop)
        
        print(f"Crop ảnh: {time.time() - start_time:.2f}s")
        return True
    except Exception as e:
        print(f"Lỗi khi crop ảnh: {e}")
        # Nếu có lỗi, giữ nguyên ảnh gốc
        try:
            # Sao chép ảnh gốc mà không resize
            shutil.copy(image_path, save_path)
            return True
        except:
            return False

# === API ===

@app.route('/')
def status():
    # Kiểm tra xem model đã được tải chưa
    models_loaded = {
        "dino_processor": dino_processor is not None,
        "dino_model": dino_model is not None,
        "detr_processor": detr_processor is not None,
        "detr_model": detr_model is not None
    }
    
    return jsonify({
        "model": "DINOv2 + DETR",
        "device": str(DEVICE),
        "index_size": len(image_paths),
        "models_loaded": models_loaded,
        "memory_usage": f"{torch.cuda.memory_allocated() / 1024**2:.1f}MB" if torch.cuda.is_available() else "N/A"
    })

@app.route('/add', methods=['POST'])
def add_image():
    start_time = time.time()
    file = request.files['image']
    filename = file.filename
    save_path = os.path.join(STORAGE_DIR, filename)
    file.save(save_path)

    # Trích xuất đặc trưng trực tiếp từ ảnh gốc, không cần crop
    vec = extract_feature_dino(save_path).astype("float32").reshape(1, -1)
    index.add(vec)
    image_paths.append(save_path)

    # Chỉ lưu index sau mỗi 5 ảnh hoặc khi thời gian xử lý dưới ngưỡng
    if len(image_paths) % 5 == 0 or time.time() - start_time < 5:
        faiss.write_index(index, INDEX_PATH)
        np.save(PATHS_PATH, np.array(image_paths))
        print(f"Đã lưu index với {len(image_paths)} ảnh")
    
    print(f"Thêm ảnh: {time.time() - start_time:.2f}s")
    return jsonify({"message": "Đã thêm ảnh", "path": save_path})

@app.route('/add-batch', methods=['POST'])
def add_images_batch():
    start_time = time.time()
    if 'images' not in request.files:
        return jsonify({"error": "Không có file nào được gửi"}), 400
    
    files = request.files.getlist('images')
    if len(files) == 0:
        return jsonify({"error": "Không có file nào được gửi"}), 400
    
    # Lưu tất cả các file trước khi xử lý bất đồng bộ
    saved_files = []
    for file in files:
        if file.filename == '':
            continue
            
        filename = file.filename
        save_path = os.path.join(STORAGE_DIR, filename)
        # Lưu file ngay lập tức để tránh lỗi "I/O operation on closed file"
        file.save(save_path)
        saved_files.append((save_path, filename))
    
    # Trả về response ngay lập tức để không block client
    response = {
        "message": f"Đang xử lý {len(saved_files)} ảnh...",
        "status": "processing",
        "total": len(saved_files)
    }
    
    # Tạo thread để xử lý ảnh trong background
    def process_images():
        added_paths = []
        vectors = []
        
        # Tăng batch size để xử lý nhanh hơn
        batch_size = min(10, len(saved_files))  # Xử lý tối đa 10 ảnh cùng lúc
        
        for i in range(0, len(saved_files), batch_size):
            batch_files = saved_files[i:i+batch_size]
            batch_vectors = []
            batch_paths = []
            
            # Xử lý từng ảnh trong batch
            for save_path, filename in batch_files:
                try:
                    # Trích xuất đặc trưng trực tiếp từ ảnh gốc, không cần crop
                    vec = extract_feature_dino(save_path).astype("float32").reshape(1, -1)
                    batch_vectors.append(vec)
                    batch_paths.append(save_path)
                    added_paths.append(save_path)
                except Exception as e:
                    print(f"Lỗi xử lý ảnh {filename}: {e}")
            
            # Thêm vectors vào index
            if batch_vectors:
                vectors.extend(batch_vectors)
                image_paths.extend(batch_paths)
        
        # Thêm tất cả các vector vào index một lần
        if vectors:
            index.add(np.vstack(vectors))
            faiss.write_index(index, INDEX_PATH)
            np.save(PATHS_PATH, np.array(image_paths))
            print(f"Đã lưu index batch với {len(image_paths)} ảnh")
        
        elapsed = time.time() - start_time
        print(f"Thêm batch {len(added_paths)} ảnh: {elapsed:.2f}s ({elapsed/len(saved_files):.2f}s/ảnh)")
    
    # Chạy xử lý ảnh trong thread riêng
    import threading
    thread = threading.Thread(target=process_images)
    thread.daemon = True
    thread.start()
    
    return jsonify(response)

@app.route('/search', methods=['POST'])
def search_image():
    start_time = time.time()
    if index.ntotal == 0:
        return jsonify([])

    file = request.files['image']
    temp_path = f"temp_query_{int(time.time())}.jpg"  # Tên file duy nhất
    try:
        # Lưu file trước khi xử lý
        file.save(temp_path)
        
        # Trích xuất đặc trưng trực tiếp từ ảnh gốc
        vec = extract_feature_dino(temp_path).astype("float32").reshape(1, -1)
        D, I = index.search(vec, k=min(10, index.ntotal))

        results = [image_paths[i] for i in I[0] if i < len(image_paths)]
        
        print(f"Tìm kiếm ảnh: {time.time() - start_time:.2f}s")
        return jsonify(results)
    except Exception as e:
        print(f"Lỗi tìm kiếm: {e}")
        return jsonify([])
    finally:
        # Dọn dẹp file tạm
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except:
                pass

@app.route('/delete', methods=['POST'])
def delete_image():
    global index, image_paths
    start_time = time.time()

    filename = request.json.get('filename')
    if not filename:
        return jsonify({"error": "Thiếu tên file"}), 400

    # Tìm file cần xóa
    idx_to_remove = -1
    for i, path in enumerate(image_paths):
        if os.path.basename(path) == filename:
            idx_to_remove = i
            break

    if idx_to_remove == -1:
        return jsonify({"error": "Không tìm thấy file"}), 404

    # Xóa phần tử khỏi danh sách
    removed_path = image_paths.pop(idx_to_remove)
    
    # Tái tạo index (vì FAISS IndexFlatIP không hỗ trợ xóa)
    # Chỉ tạo lại index nếu số lượng ảnh > 0
    if image_paths:
        # Tạo index mới
        new_index = faiss.IndexFlatIP(768)
        
        # Xử lý theo batch để tránh OOM
        batch_size = 50
        for i in range(0, len(image_paths), batch_size):
            batch_paths = image_paths[i:i+batch_size]
            batch_vectors = []
            
            for path in batch_paths:
                try:
                    vec = extract_feature_dino(path).astype("float32").reshape(1, -1)
                    batch_vectors.append(vec)
                except Exception as e:
                    print(f"Lỗi xử lý ảnh {path}: {e}")
            
            if batch_vectors:
                new_index.add(np.vstack(batch_vectors))
        
        index = new_index
    else:
        # Nếu không còn ảnh nào, tạo index trống
        index = faiss.IndexFlatIP(768)

    # Lưu index mới
    faiss.write_index(index, INDEX_PATH)
    np.save(PATHS_PATH, np.array(image_paths))

    # Xóa ảnh gốc
    to_delete = [os.path.join(STORAGE_DIR, filename)]
    for path in to_delete:
        if os.path.exists(path):
            try:
                os.remove(path)
            except Exception as e:
                print(f"Lỗi xóa file {path}: {e}")
    
    print(f"Xóa ảnh: {time.time() - start_time:.2f}s")
    return jsonify({"message": "Đã xóa ảnh", "filename": filename})

@app.route('/reload', methods=['POST'])
def reload_index():
    global index, image_paths
    start_time = time.time()

    image_files = [
        os.path.join(STORAGE_DIR, f)
        for f in os.listdir(STORAGE_DIR)
        if f.lower().endswith(('.jpg', '.jpeg', '.png'))
    ]

    image_paths = []
    
    # Tạo index mới
    new_index = faiss.IndexFlatIP(768)
    
    # Xử lý theo batch để tránh OOM
    batch_size = 20
    for i in range(0, len(image_files), batch_size):
        batch_files = image_files[i:i+batch_size]
        batch_vectors = []
        batch_paths = []
        
        for path in batch_files:
            # Kiểm tra timeout
            if time.time() - start_time > TIMEOUT_SECONDS * 5:  # Cho phép thời gian dài hơn cho reload
                print("Timeout khi reload index")
                break
                
            try:
                # Trích xuất đặc trưng trực tiếp từ ảnh gốc
                vec = extract_feature_dino(path).astype("float32").reshape(1, -1)
                batch_vectors.append(vec)
                batch_paths.append(path)
            except Exception as e:
                print(f"Lỗi ảnh {path}: {e}")
        
        if batch_vectors:
            new_index.add(np.vstack(batch_vectors))
            image_paths.extend(batch_paths)
    
    # Cập nhật index
    index = new_index
    
    # Lưu index
    faiss.write_index(index, INDEX_PATH)
    np.save(PATHS_PATH, np.array(image_paths))
    
    print(f"Reload index: {time.time() - start_time:.2f}s")
    return jsonify({
        "message": "Đã reload toàn bộ index",
        "total_images": len(image_paths)
    })

@app.route('/reset', methods=['POST'])
def reset_index():
    global index, image_paths
    start_time = time.time()

    if os.path.exists(INDEX_PATH): os.remove(INDEX_PATH)
    if os.path.exists(PATHS_PATH): os.remove(PATHS_PATH)

    for file in os.listdir(STORAGE_DIR):
        path = os.path.join(STORAGE_DIR, file)
        if os.path.isfile(path): 
            try:
                os.remove(path)
            except Exception as e:
                print(f"Lỗi xóa file {path}: {e}")

    index = faiss.IndexFlatIP(768)
    image_paths = []
    
    print(f"Reset index: {time.time() - start_time:.2f}s")
    return jsonify({"message": "Đã reset toàn bộ hệ thống và xóa ảnh"})

if __name__ == '__main__':
    # Preload models in background thread
    import threading
    preload_thread = threading.Thread(target=preload_models)
    preload_thread.daemon = True
    preload_thread.start()
    
    # Khởi động Flask với timeout cao hơn
    app.run(host="0.0.0.0", port=5000, threaded=True)
