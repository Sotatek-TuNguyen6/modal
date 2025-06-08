from flask import Flask, request, jsonify
import torch
import clip
from PIL import Image
import faiss
import numpy as np
import os
import io

# Fix for OpenMP library conflict on Windows
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

app = Flask(__name__)
device = "cuda" if torch.cuda.is_available() else "cpu"

# Load CLIP
model, preprocess = clip.load("ViT-B/32", device=device)

# Paths
INDEX_PATH = "faiss_index.idx"
PATHS_PATH = "features_paths.npy"
# Use absolute path for image storage
STORAGE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "image_storage")
os.makedirs(STORAGE_DIR, exist_ok=True)

print(f"🖼️ Images will be stored in: {STORAGE_DIR}")

# Load or init
if os.path.exists(INDEX_PATH) and os.path.exists(PATHS_PATH):
    index = faiss.read_index(INDEX_PATH)
    image_paths = list(np.load(PATHS_PATH, allow_pickle=True))
else:
    index = faiss.IndexFlatL2(512)
    image_paths = []

@app.route('/search', methods=['POST'])
def search_image():
    file = request.files['image']
    image = Image.open(io.BytesIO(file.read())).convert("RGB")
    image_input = preprocess(image).unsqueeze(0).to(device)

    with torch.no_grad():
        vec = model.encode_image(image_input).cpu().numpy().astype("float32")

    D, I = index.search(vec, k=3)
    results = [image_paths[i] for i in I[0]]
    return jsonify(results)

@app.route('/add', methods=['POST'])
def add_image():
    file = request.files['image']
    filename = file.filename
    save_path = os.path.join(STORAGE_DIR, filename)
    file.save(save_path)

    image = Image.open(save_path).convert("RGB")
    image_input = preprocess(image).unsqueeze(0).to(device)
    with torch.no_grad():
        vec = model.encode_image(image_input).cpu().numpy().astype("float32")

    index.add(vec)
    image_paths.append(save_path)

    faiss.write_index(index, INDEX_PATH)
    np.save(PATHS_PATH, np.array(image_paths))

    return jsonify({"message": "Đã thêm ảnh vào hệ thống", "path": save_path})

@app.route('/delete', methods=['POST'])
def delete_image():
    global index, image_paths
    
    filename = request.json.get('filename')
    if not filename:
        return jsonify({"error": "Không tìm thấy tên file"}), 400
    
    # Tìm đường dẫn đầy đủ từ tên file
    target_path = None
    target_index = -1
    
    for i, path in enumerate(image_paths):
        if os.path.basename(path) == filename:
            target_path = path
            target_index = i
            break
    
    if target_path is None:
        return jsonify({"error": f"Không tìm thấy ảnh {filename} trong index"}), 404
    
    # Xóa vector từ index
    # FAISS không hỗ trợ xóa trực tiếp từ IndexFlatL2, nên ta cần tạo index mới
    temp_vectors = []
    
    # Lưu tất cả các vector trừ vector cần xóa
    for i in range(len(image_paths)):
        if i != target_index:
            # Trích xuất vector từ index
            d, i_results = index.search(np.zeros((1, 512), dtype=np.float32), k=1)
            if i_results[0][0] == i:  # Đảm bảo chúng ta có vector đúng
                temp_vectors.append(index.reconstruct(i))
    
    # Tạo index mới
    new_index = faiss.IndexFlatL2(512)
    if temp_vectors:
        new_index.add(np.vstack(temp_vectors))
    
    # Cập nhật danh sách đường dẫn
    new_image_paths = [path for path in image_paths if path != target_path]
    
    # Cập nhật biến toàn cục
    index = new_index
    image_paths = new_image_paths
    
    # Lưu thay đổi
    faiss.write_index(index, INDEX_PATH)
    np.save(PATHS_PATH, np.array(image_paths))
    
    # Xóa file ảnh nếu tồn tại
    if os.path.exists(target_path):
        try:
            os.remove(target_path)
        except OSError as e:
            print(f"Lỗi khi xóa file: {e}")
    
    return jsonify({"message": f"Đã xóa ảnh {filename} khỏi hệ thống"})

@app.route('/reload', methods=['POST'])
def reload_index():
    global index, image_paths
    
    # Kiểm tra xem đã có index hay chưa
    if not os.path.exists(INDEX_PATH) or not os.path.exists(PATHS_PATH):
        # Nếu chưa có index, tạo mới hoàn toàn
        index = faiss.IndexFlatL2(512)
        image_paths = []
        need_full_rebuild = True
    else:
        # Nếu đã có index, chỉ thêm ảnh mới
        need_full_rebuild = False
    
    # Lấy danh sách tất cả các file ảnh trong thư mục
    image_files = [
        os.path.join(STORAGE_DIR, f)
        for f in os.listdir(STORAGE_DIR)
        if f.lower().endswith(('.jpg', '.jpeg'))
    ]

    if not image_files:
        return jsonify({
            "message": "Thư mục image_storage không chứa ảnh nào. Đã tạo index rỗng.",
            "total_images": 0
        })
    
    if need_full_rebuild:
        print(f"🔄 Tạo index mới với {len(image_files)} ảnh...")
        processed = 0
        errors = 0
        
        # Xử lý theo lô cho hiệu suất tốt hơn
        batch_size = 32
        for i in range(0, len(image_files), batch_size):
            batch = image_files[i:i+batch_size]
            batch_vectors = []
            batch_paths = []
            
            for path in batch:
                try:
                    image = Image.open(path).convert("RGB")
                    image_input = preprocess(image).unsqueeze(0).to(device)

                    with torch.no_grad():
                        vec = model.encode_image(image_input).cpu().numpy().astype("float32")

                    batch_vectors.append(vec)
                    batch_paths.append(path)
                    processed += 1
                except Exception as e:
                    errors += 1
                    print(f"⚠️ Lỗi khi xử lý ảnh: {path} -> {e}")
            
            # Thêm lô vào index
            if batch_vectors:
                vectors = np.vstack(batch_vectors)
                index.add(vectors)
                image_paths.extend(batch_paths)
            
            print(f"Tiến độ: {processed}/{len(image_files)} ảnh đã xử lý")
    else:
        # Chỉ xử lý ảnh mới
        existing_filenames = set(os.path.basename(path) for path in image_paths)
        new_image_files = []
        
        for path in image_files:
            filename = os.path.basename(path)
            if filename not in existing_filenames:
                new_image_files.append(path)
        
        if not new_image_files:
            print("✅ Không có ảnh mới để thêm vào index.")
            return jsonify({
                "message": "Không có ảnh mới để thêm vào index.",
                "total_images": len(image_paths),
                "new_images": 0
            })
        
        print(f"🔄 Thêm {len(new_image_files)} ảnh mới vào index...")
        processed = 0
        errors = 0
        
        # Xử lý theo lô cho ảnh mới
        batch_size = 32
        for i in range(0, len(new_image_files), batch_size):
            batch = new_image_files[i:i+batch_size]
            batch_vectors = []
            batch_paths = []
            
            for path in batch:
                try:
                    image = Image.open(path).convert("RGB")
                    image_input = preprocess(image).unsqueeze(0).to(device)

                    with torch.no_grad():
                        vec = model.encode_image(image_input).cpu().numpy().astype("float32")

                    batch_vectors.append(vec)
                    batch_paths.append(path)
                    processed += 1
                except Exception as e:
                    errors += 1
                    print(f"⚠️ Lỗi khi xử lý ảnh: {path} -> {e}")
            
            # Thêm lô vào index
            if batch_vectors:
                vectors = np.vstack(batch_vectors)
                index.add(vectors)
                image_paths.extend(batch_paths)
            
            print(f"Tiến độ: {processed}/{len(new_image_files)} ảnh mới đã xử lý")

    # Lưu lại index và paths
    faiss.write_index(index, INDEX_PATH)
    np.save(PATHS_PATH, np.array(image_paths))

    if need_full_rebuild:
        print(f"✅ Đã xây dựng lại index với {len(image_paths)} ảnh. {errors} lỗi gặp phải.")
        return jsonify({
            "message": "Đã rebuild FAISS index từ thư mục image_storage.",
            "total_images": len(image_paths),
            "errors": errors
        })
    else:
        print(f"✅ Đã thêm {processed} ảnh mới vào index. Tổng cộng: {len(image_paths)} ảnh.")
        return jsonify({
            "message": "Đã thêm ảnh mới vào FAISS index.",
            "total_images": len(image_paths),
            "new_images": processed,
            "errors": errors
        })


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001)
