"use client";

import { useState, ChangeEvent, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useMutation } from "@tanstack/react-query";
import { CustomerCombobox } from "@/components/customer-combobox";

interface ImagePreview {
  url: string;
  name: string;
  id: string;
  status: "loading" | "loaded" | "error";
}

const addImages = async (data: {
  files: File[];
  customer: string;
  folder: string;
}) => {
  const formData = new FormData();

  // Thêm nhiều ảnh vào formData với cùng key 'images'
  data.files.forEach((file) => {
    formData.append("images", file);
  });

  // Thêm thông tin khác
  formData.append("customer", data.customer);
  formData.append("folder", data.folder);

  const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/addImage`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error("Failed to upload images");
  }

  const responseData = await response.json();
  return responseData;
};

export default function AddImage() {
  const [imagePreviews, setImagePreviews] = useState<ImagePreview[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filesToProcess, setFilesToProcess] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [folder, setFolder] = useState("");

  // Tham chiếu để lưu trữ các object URLs cần giải phóng
  const objectUrlsRef = useRef<string[]>([]);
  const fileMap = useRef<Map<string, File>>(new Map());

  // Lấy thông tin khách hàng từ URL khi component được mount
  useEffect(() => {
    // Chỉ chạy ở phía client
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const customerId = params.get("customer");
      const customerName = params.get("name");

      if (customerId) {
        console.log(`Khách hàng được chọn: ${customerName} (${customerId})`);
        setSelectedCustomer(customerId);

        // Nếu có tên khách hàng, sử dụng làm tên thư mục mặc định
        if (customerName && !folder) {
          setFolder(customerName);
        }
      }
    }
  }, [folder]);

  // Batch upload mutation for final form submission
  const batchUploadMutation = useMutation({
    mutationFn: async (data: {
      files: File[];
      customer: string;
      folder: string;
    }) => {
      try {
        // Upload tất cả ảnh cùng một lúc
        return await addImages(data);
      } catch (error) {
        console.error("Error uploading images:", error);
        throw error;
      }
    },
    onSuccess: (data) => {
      console.log("Upload successful:", data);
      // Clear previews after successful upload
      setImagePreviews([]);
      fileMap.current.clear();
      alert("Images uploaded successfully!");
    },
    onError: (error) => {
      console.error("Error saving images:", error);
      alert("Failed to upload images. Please try again.");
    },
  });

  // Xử lý ảnh theo batch để không block UI
  useEffect(() => {
    if (filesToProcess.length === 0) return;

    console.log("Xử lý", filesToProcess.length, "ảnh");

    // Tạo các placeholder ngay lập tức cho tất cả ảnh
    const placeholders = filesToProcess.map((file) => {
      const id = Date.now() + "-" + Math.random().toString(36).substr(2, 9);
      // Store file in map for later use
      fileMap.current.set(id, file);
      return {
        url: "",
        name: file.name,
        id,
        status: "loading" as const,
      };
    });

    // Cập nhật state một lần duy nhất
    setImagePreviews((prev) => [...prev, ...placeholders]);

    // Reset filesToProcess ngay để tránh xử lý lại cùng một file
    setFilesToProcess([]);

    // Xử lý ảnh theo batch
    const processFilesInBatches = async () => {
      const BATCH_SIZE = 2; // Xử lý 2 ảnh một lần
      const BATCH_DELAY = 50; // Độ trễ 50ms giữa các batch
      const totalFiles = placeholders.length;
      let processedCount = 0;

      // Xử lý từng batch
      for (let i = 0; i < totalFiles; i += BATCH_SIZE) {
        const batchPlaceholders = placeholders.slice(i, i + BATCH_SIZE);

        // Xử lý batch hiện tại
        await Promise.all(
          batchPlaceholders.map(async (placeholder) => {
            const placeholderId = placeholder.id;
            const file = fileMap.current.get(placeholderId);

            if (!file) {
              console.error("File not found for placeholder", placeholderId);
              return;
            }

            // Tạo object URL cho file (thao tác nhanh, không chặn thread)
            const url = URL.createObjectURL(file);
            objectUrlsRef.current.push(url);

            // Update the preview immediately with the object URL
            setImagePreviews((prev) =>
              prev.map((item) =>
                item.id === placeholderId
                  ? { ...item, url, status: "loading" as const }
                  : item
              )
            );

            try {
              // Không upload file ở đây nữa, chỉ tạo preview

              // Đánh dấu ảnh đã sẵn sàng để upload sau này
              setImagePreviews((prev) =>
                prev.map((item) =>
                  item.id === placeholderId
                    ? { ...item, status: "loaded" as const }
                    : item
                )
              );
            } catch (error) {
              // Handle error
              setImagePreviews((prev) =>
                prev.map((item) =>
                  item.id === placeholderId
                    ? { ...item, status: "error" as const }
                    : item
                )
              );
              console.error("Error processing image:", error);
            }

            processedCount++;
            setUploadProgress(Math.round((processedCount / totalFiles) * 100));
          })
        );

        // Đợi giữa các batch để cho phép UI cập nhật
        if (i + BATCH_SIZE < totalFiles) {
          await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY));
        }
      }

      // Hoàn thành
      setUploadProgress(100);

      // Reset states sau một khoảng thời gian ngắn
      setTimeout(() => {
        setIsLoading(false);
        setUploadProgress(0);
      }, 500);
    };

    processFilesInBatches();
  }, [filesToProcess]);

  // Cleanup object URLs khi component unmount
  useEffect(() => {
    return () => {
      // Giải phóng tất cả object URLs để tránh memory leak
      objectUrlsRef.current.forEach((url) => {
        URL.revokeObjectURL(url);
      });
      objectUrlsRef.current = [];
    };
  }, []);

  // Submit form handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Get only loaded images
    const loadedImages = imagePreviews.filter((img) => img.status === "loaded");
    if (loadedImages.length === 0) return;

    if (!selectedCustomer) {
      alert("Vui lòng chọn khách hàng");
      return;
    }

    if (!folder || folder.trim() === "") {
      alert("Vui lòng nhập tên thư mục");
      return;
    }

    // Get files from fileMap
    const files = loadedImages
      .map((img) => fileMap.current.get(img.id))
      .filter((file): file is File => file !== undefined);

    // Use React Query batch mutation
    batchUploadMutation.mutate({
      files,
      customer: selectedCustomer,
      folder,
    });
  };

  // Xử lý sự kiện khi chọn file
  const handleImagesChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    console.log("Đã chọn", files.length, "ảnh");

    // Hiển thị trạng thái loading ngay lập tức
    setIsLoading(true);
    setUploadProgress(0);

    // Xử lý files ngay lập tức, không dùng requestIdleCallback
    setFilesToProcess(Array.from(files));

    // Reset input file để cho phép chọn lại cùng một file
    e.target.value = "";
  };

  const removeImage = (id: string) => {
    // Tìm và giải phóng object URL trước khi xóa
    const imageToRemove = imagePreviews.find((img) => img.id === id);
    if (
      imageToRemove?.status === "loaded" &&
      imageToRemove.url.startsWith("blob:")
    ) {
      URL.revokeObjectURL(imageToRemove.url);
      objectUrlsRef.current = objectUrlsRef.current.filter(
        (url) => url !== imageToRemove.url
      );
    }

    setImagePreviews((prev) => prev.filter((item) => item.id !== id));

    // Also remove from fileMap
    fileMap.current.delete(id);
  };

  // Calculate stats for display
  const getLoadingStats = () => {
    const total = imagePreviews.length;
    const loaded = imagePreviews.filter(
      (img) => img.status === "loaded"
    ).length;
    const loading = imagePreviews.filter(
      (img) => img.status === "loading"
    ).length;
    const failed = imagePreviews.filter((img) => img.status === "error").length;

    return { total, loaded, loading, failed };
  };

  const stats = getLoadingStats();
  const isProcessing = stats.loading > 0;

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800">
        <div className="container mx-auto flex items-center justify-between h-16 px-4">
          <div className="flex items-center space-x-4">
            <Link href="/">
              <Image
                src="/logo.jpg"
                alt="Logo"
                width={100}
                height={24}
                className="dark:invert"
              />
            </Link>
          </div>
          <nav className="flex items-center space-x-4">
            <Link
              href="/"
              className="font-medium text-gray-600 dark:text-gray-400 hover:text-primary"
            >
              Trang chủ
            </Link>
            <Link
              href="/add-image"
              className="font-medium text-gray-900 dark:text-gray-100 hover:text-primary"
            >
              Thêm ảnh
            </Link>
            <Link
              href="/add-customer"
              className="font-medium text-gray-600 dark:text-gray-400 hover:text-primary"
            >
              Thêm khách hàng
            </Link>
          </nav>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 container mx-auto py-8 px-4">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-3xl font-bold mb-6">Thêm ảnh mới</h1>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-200 dark:border-gray-700">
            <form className="space-y-6" onSubmit={handleSubmit}>
              {/* Image upload section */}
              <div className="space-y-2">
                <label className="block text-sm font-medium">Hình ảnh</label>
                <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 text-center cursor-pointer hover:border-gray-400 transition-colors">
                  <input
                    type="file"
                    id="image-upload"
                    accept="image/*"
                    onChange={handleImagesChange}
                    multiple
                    className="hidden"
                    disabled={isLoading || isProcessing}
                  />
                  <label
                    htmlFor="image-upload"
                    className={`cursor-pointer block w-full h-full ${
                      isLoading || isProcessing
                        ? "opacity-50 pointer-events-none"
                        : ""
                    }`}
                  >
                    <div className="flex flex-col items-center justify-center py-6">
                      {isLoading || isProcessing ? (
                        <>
                          <div className="w-12 h-12 mb-2 relative">
                            <svg
                              className="w-12 h-12 animate-spin text-primary"
                              viewBox="0 0 24 24"
                              fill="none"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <circle
                                className="opacity-25"
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                strokeWidth="4"
                              ></circle>
                              <path
                                className="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                              ></path>
                            </svg>
                          </div>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            Đang xử lý ảnh...
                          </p>
                        </>
                      ) : (
                        <>
                          <svg
                            className="w-12 h-12 text-gray-400 mb-2"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                            ></path>
                          </svg>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            Kéo thả file hoặc click để chọn nhiều ảnh
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            PNG, JPG hoặc GIF (tối đa 10MB mỗi ảnh)
                          </p>
                        </>
                      )}
                    </div>
                  </label>
                </div>

                {/* Loading progress bar */}
                {(isLoading || isProcessing) && (
                  <div className="mt-4 bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="text-sm font-medium">
                        Tiến trình tải ảnh
                      </h3>
                      <span className="text-sm font-medium text-primary">
                        {uploadProgress > 0
                          ? `${uploadProgress}%`
                          : "Đang chuẩn bị..."}
                      </span>
                    </div>

                    <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700 overflow-hidden">
                      <div
                        className="bg-primary h-2.5 rounded-full transition-all duration-300 ease-in-out"
                        style={{ width: `${uploadProgress}%` }}
                      ></div>
                    </div>

                    <div className="flex justify-between mt-4">
                      <div className="flex flex-col items-center">
                        <span className="text-lg font-bold">{stats.total}</span>
                        <span className="text-xs text-gray-500">Tổng số</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-lg font-bold text-primary">
                          {stats.loaded}
                        </span>
                        <span className="text-xs text-gray-500">Đã tải</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-lg font-bold text-amber-500">
                          {stats.loading}
                        </span>
                        <span className="text-xs text-gray-500">Đang tải</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-lg font-bold text-red-500">
                          {stats.failed}
                        </span>
                        <span className="text-xs text-gray-500">Lỗi</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Image previews */}
                {imagePreviews.length > 0 && (
                  <div className="mt-4">
                    <h3 className="text-sm font-medium mb-2">
                      Đã chọn {imagePreviews.length} ảnh
                    </h3>
                    {(batchUploadMutation.isPending ||
                      batchUploadMutation.isError) && (
                      <div
                        className={`mb-4 p-3 rounded ${
                          batchUploadMutation.isError
                            ? "bg-red-100 text-red-800"
                            : "bg-blue-100 text-blue-800"
                        }`}
                      >
                        {batchUploadMutation.isPending && (
                          <p>Đang lưu ảnh lên máy chủ...</p>
                        )}
                        {batchUploadMutation.isError && (
                          <p>
                            Lỗi:{" "}
                            {batchUploadMutation.error.message ||
                              "Không thể lưu ảnh"}
                          </p>
                        )}
                      </div>
                    )}
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                      {imagePreviews.map((preview) => (
                        <div key={preview.id} className="relative group">
                          <div className="aspect-square bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden">
                            {preview.status === "loading" ? (
                              <div className="w-full h-full flex items-center justify-center">
                                <svg
                                  className="w-8 h-8 animate-spin text-primary"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  xmlns="http://www.w3.org/2000/svg"
                                >
                                  <circle
                                    className="opacity-25"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    strokeWidth="4"
                                  ></circle>
                                  <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                  ></path>
                                </svg>
                              </div>
                            ) : preview.status === "error" ? (
                              <div className="w-full h-full flex items-center justify-center text-red-500">
                                <svg
                                  className="w-8 h-8"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                  xmlns="http://www.w3.org/2000/svg"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="2"
                                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                                  ></path>
                                </svg>
                              </div>
                            ) : (
                              <div className="relative w-full h-full">
                                <Image
                                  src={preview.url}
                                  alt={`Preview ${preview.name}`}
                                  fill
                                  className="object-cover"
                                />
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => removeImage(preview.id)}
                            className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                            aria-label="Remove image"
                            disabled={preview.status === "loading"}
                          >
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                d="M6 18L18 6M6 6l12 12"
                              ></path>
                            </svg>
                          </button>
                          <div className="mt-1 flex items-center justify-between">
                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate flex-1">
                              {preview.name}
                            </p>
                            {preview.status === "loaded" && (
                              <span className="text-xs text-green-500 ml-1">
                                ✓
                              </span>
                            )}
                            {preview.status === "error" && (
                              <span className="text-xs text-red-500 ml-1">
                                ✗
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Image details */}
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="customer"
                    className="block text-sm font-medium mb-1"
                  >
                    Khách hàng <span className="text-red-500">*</span>
                  </label>
                  <CustomerCombobox
                    value={selectedCustomer}
                    onValueChange={setSelectedCustomer}
                    placeholder="Chọn khách hàng"
                  />
                </div>
                <div>
                  <label
                    htmlFor="folder"
                    className="block text-sm font-medium mb-1"
                  >
                    Folder <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="folder"
                    value={folder}
                    onChange={(e) => setFolder(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Nhập tên folder, đường dẫn"
                  />
                </div>
              </div>

              {/* Buttons */}
              <div className="flex justify-end space-x-4 pt-2">
                <Button
                  variant="outline"
                  type="button"
                  disabled={
                    isLoading || isProcessing || batchUploadMutation.isPending
                  }
                >
                  Hủy
                </Button>
                <Button
                  type="submit"
                  disabled={
                    stats.loaded === 0 ||
                    isLoading ||
                    isProcessing ||
                    batchUploadMutation.isPending
                  }
                >
                  {batchUploadMutation.isPending
                    ? "Đang lưu..."
                    : isProcessing
                    ? `Đang tải ảnh (${stats.loaded}/${stats.total})`
                    : stats.loaded > 0
                    ? `Lưu ${stats.loaded} ảnh`
                    : "Lưu ảnh"}
                </Button>
              </div>

              <div className="text-sm text-gray-500 mt-4 border-t pt-4">
                <p>
                  <span className="text-red-500">*</span> Trường bắt buộc phải
                  điền đầy đủ
                </p>
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
