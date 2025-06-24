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
@lru_cache(maxsize=100)  # Cache kết quả cho 100 ảnh gần nhất
def extract_feature_dino(image_path):
    start_time = time.time()
    try:
        # Đảm bảo model đã được tải
        load_models_if_needed()
        
        image = Image.open(image_path).convert("RGB")
        # Giảm kích thước ảnh để tăng tốc xử lý
        if max(image.size) > 512:
            image.thumbnail((512, 512), Image.LANCZOS)
            
        inputs = dino_processor(images=image, return_tensors="pt").to(DEVICE)
        with torch.no_grad():
            outputs = dino_model(**inputs)
            feat = outputs.last_hidden_state[:, 0]
            feat = torch.nn.functional.normalize(feat, dim=-1)
        result = feat.cpu().numpy().squeeze()
        
        print(f"Trích xuất đặc trưng DINO: {time.time() - start_time:.2f}s")
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
        
        # Kiểm tra thời gian tối đa
        if time.time() - start_time > TIMEOUT_SECONDS:
            print("Timeout khi crop ảnh")
            return False
            
        image = Image.open(image_path).convert("RGB")
        width, height = image.size
        
        # Giảm kích thước ảnh để tăng tốc xử lý
        if max(width, height) > 512:
            image.thumbnail((512, 512), Image.LANCZOS)
            width, height = image.size
            
        inputs = detr_processor(images=image, return_tensors="pt").to(DEVICE)
        with torch.no_grad():
            outputs = detr_model(**inputs)

        logits = outputs.logits
        boxes = outputs.pred_boxes
        probs = logits.softmax(-1)[0, :, :-1]
        keep = probs.max(dim=-1).values > 0.7
        boxes = boxes[0, keep]
        labels = probs[keep].argmax(dim=-1)
        
        # Đọc ảnh với OpenCV với kích thước nhỏ hơn
        img_cv2 = cv2.imread(image_path)
        if img_cv2 is None:
            print(f"Không thể đọc ảnh: {image_path}")
            return False
            
        if max(img_cv2.shape[0], img_cv2.shape[1]) > 1024:
            scale = 1024 / max(img_cv2.shape[0], img_cv2.shape[1])
            img_cv2 = cv2.resize(img_cv2, None, fx=scale, fy=scale)

        for i, box in enumerate(boxes):
            # Kiểm tra timeout
            if time.time() - start_time > TIMEOUT_SECONDS:
                print("Timeout khi xử lý boxes")
                return False
                
            label = detr_model.config.id2label[labels[i].item()]
            if "dress" in label.lower() or "skirt" in label.lower():
                cx, cy, w, h = box
                x1 = int((cx - w / 2) * width)
                y1 = int((cy - h / 2) * height)
                x2 = int((cx + w / 2) * width)
                y2 = int((cy + h / 2) * height)
                
                # Tính toán tỷ lệ giữa ảnh gốc và ảnh đã resize
                img_height, img_width = img_cv2.shape[:2]
                scale_x = img_width / width
                scale_y = img_height / height
                
                # Áp dụng tỷ lệ vào tọa độ
                x1_scaled = int(x1 * scale_x)
                y1_scaled = int(y1 * scale_y)
                x2_scaled = int(x2 * scale_x)
                y2_scaled = int(y2 * scale_y)
                
                crop = img_cv2[max(y1_scaled,0):min(y2_scaled,img_height), max(x1_scaled,0):min(x2_scaled,img_width)]
                if crop.size == 0: continue
                
                # Resize nhỏ hơn để tiết kiệm bộ nhớ
                crop = cv2.resize(crop, (224, 224))
                cv2.imwrite(save_path, crop)
                
                print(f"Crop ảnh: {time.time() - start_time:.2f}s")
                return True
                
        print(f"Không tìm thấy váy/chân váy: {time.time() - start_time:.2f}s")
        return False
    except Exception as e:
        print(f"Lỗi khi crop ảnh: {e}")
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

    crop_path = save_path.replace(".", "_crop.")
    cropped = crop_dress(save_path, crop_path)
    used_path = crop_path if cropped else save_path

    vec = extract_feature_dino(used_path).astype("float32").reshape(1, -1)
    index.add(vec)
    image_paths.append(used_path)

    # Chỉ lưu index sau mỗi 5 ảnh hoặc khi thời gian xử lý dưới ngưỡng
    if len(image_paths) % 5 == 0 or time.time() - start_time < 5:
        faiss.write_index(index, INDEX_PATH)
        np.save(PATHS_PATH, np.array(image_paths))
        print(f"Đã lưu index với {len(image_paths)} ảnh")
    
    print(f"Thêm ảnh: {time.time() - start_time:.2f}s")
    return jsonify({"message": "Đã thêm ảnh", "path": used_path})

@app.route('/add-batch', methods=['POST'])
def add_images_batch():
    start_time = time.time()
    if 'images' not in request.files:
        return jsonify({"error": "Không có file nào được gửi"}), 400
    
    files = request.files.getlist('images')
    if len(files) == 0:
        return jsonify({"error": "Không có file nào được gửi"}), 400
    
    added_paths = []
    vectors = []
    
    for file in files:
        # Kiểm tra timeout
        if time.time() - start_time > TIMEOUT_SECONDS * 2:  # Cho phép thời gian dài hơn cho batch
            break
            
        if file.filename == '':
            continue
            
        filename = file.filename
        save_path = os.path.join(STORAGE_DIR, filename)
        file.save(save_path)
        
        crop_path = save_path.replace(".", "_crop.")
        cropped = crop_dress(save_path, crop_path)
        used_path = crop_path if cropped else save_path
        
        try:
            vec = extract_feature_dino(used_path).astype("float32").reshape(1, -1)
            vectors.append(vec)
            image_paths.append(used_path)
            added_paths.append(used_path)
        except Exception as e:
            print(f"Lỗi xử lý ảnh {filename}: {e}")
    
    # Thêm tất cả các vector vào index một lần
    if vectors:
        index.add(np.vstack(vectors))
        faiss.write_index(index, INDEX_PATH)
        np.save(PATHS_PATH, np.array(image_paths))
        print(f"Đã lưu index batch với {len(image_paths)} ảnh")
    
    print(f"Thêm batch {len(added_paths)} ảnh: {time.time() - start_time:.2f}s")
    return jsonify({
        "message": f"Đã thêm {len(added_paths)} ảnh",
        "added": added_paths,
        "total": len(image_paths)
    })

@app.route('/search', methods=['POST'])
def search_image():
    start_time = time.time()
    if index.ntotal == 0:
        return jsonify([])

    file = request.files['image']
    temp_path = f"temp_query_{int(time.time())}.jpg"  # Tên file duy nhất
    try:
        with open(temp_path, "wb") as f:
            f.write(file.read())

        crop_path = temp_path.replace(".", "_crop.")
        cropped = crop_dress(temp_path, crop_path)
        used_path = crop_path if cropped else temp_path

        vec = extract_feature_dino(used_path).astype("float32").reshape(1, -1)
        D, I = index.search(vec, k=min(10, index.ntotal))

        results = [image_paths[i] for i in I[0] if i < len(image_paths)]
        
        print(f"Tìm kiếm ảnh: {time.time() - start_time:.2f}s")
        return jsonify(results)
    except Exception as e:
        print(f"Lỗi tìm kiếm: {e}")
        return jsonify([])
    finally:
        # Dọn dẹp file tạm
        for p in [temp_path, temp_path.replace(".", "_crop.")]:
            if os.path.exists(p):
                try:
                    os.remove(p)
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

    # Xóa ảnh gốc và ảnh crop nếu có
    to_delete = [os.path.join(STORAGE_DIR, filename)]
    crop_version = filename.replace(".", "_crop.")
    to_delete.append(os.path.join(STORAGE_DIR, crop_version))
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
        if f.lower().endswith(('.jpg', '.jpeg', '.png')) and '_crop' not in f
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
                
            crop_path = path.replace(".", "_crop.")
            cropped = crop_dress(path, crop_path)
            used_path = crop_path if cropped else path

            try:
                vec = extract_feature_dino(used_path).astype("float32").reshape(1, -1)
                batch_vectors.append(vec)
                batch_paths.append(used_path)
            except Exception as e:
                print(f"Lỗi ảnh {used_path}: {e}")
        
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
    # Khởi động Flask với timeout cao hơn
    app.run(host="0.0.0.0", port=5000, threaded=True)
