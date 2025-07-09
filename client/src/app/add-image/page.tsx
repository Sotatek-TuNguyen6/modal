"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import ProtectedRoute from "@/components/auth/ProtectedRoute";

export default function AddImagePage() {
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (files.length === 0) {
      setUploadStatus({
        success: false,
        message: "Vui lòng chọn ít nhất một ảnh để tải lên",
      });
      return;
    }

    setIsUploading(true);
    setUploadStatus(null);

    try {
      const formData = new FormData();
      files.forEach((file) => {
        formData.append("images", file);
      });

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.inhoanglinh.click';
      const response = await fetch(`${apiUrl}/upload-batch`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Lỗi: ${response.status} ${response.statusText}`);
      }

      await response.json();
      setUploadStatus({
        success: true,
        message: `Đã tải lên thành công ${files.length} ảnh`,
      });
      
      // Reset form after successful upload
      setFiles([]);
      
    } catch (error) {
      console.error("Lỗi khi tải lên ảnh:", error);
      setUploadStatus({
        success: false,
        message: "Có lỗi xảy ra khi tải lên ảnh. Vui lòng thử lại.",
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <ProtectedRoute>
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
                  unoptimized={true}
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
            <h1 className="text-2xl font-bold mb-6">Thêm ảnh mới</h1>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <form onSubmit={handleUpload} className="space-y-6">
                {uploadStatus && (
                  <div
                    className={`p-4 rounded-lg ${
                      uploadStatus.success
                        ? "bg-green-50 border border-green-200 text-green-700"
                        : "bg-red-50 border border-red-200 text-red-700"
                    }`}
                  >
                    {uploadStatus.message}
                  </div>
                )}

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Chọn ảnh để tải lên
                  </label>
                  <div className="flex items-center justify-center w-full">
                    <label
                      htmlFor="dropzone-file"
                      className="flex flex-col items-center justify-center w-full h-64 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-700 hover:bg-gray-100 dark:border-gray-600"
                    >
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <svg
                          className="w-10 h-10 mb-3 text-gray-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                          ></path>
                        </svg>
                        <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
                          <span className="font-semibold">Nhấp để tải lên</span>{" "}
                          hoặc kéo và thả
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          PNG, JPG (Tối đa 10MB mỗi ảnh)
                        </p>
                      </div>
                      <input
                        id="dropzone-file"
                        type="file"
                        className="hidden"
                        multiple
                        accept="image/*"
                        onChange={handleFileChange}
                      />
                    </label>
                  </div>
                </div>

                {files.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Đã chọn {files.length} ảnh:
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {Array.from(files).map((file, index) => (
                        <div
                          key={index}
                          className="relative h-24 bg-gray-100 dark:bg-gray-700 rounded overflow-hidden"
                        >
                          <Image
                            src={URL.createObjectURL(file)}
                            alt={`Preview ${index + 1}`}
                            fill
                            className="object-cover"
                            unoptimized={true}
                          />
                          <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs p-1 truncate">
                            {file.name}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-end">
                  <Button
                    type="submit"
                    disabled={isUploading || files.length === 0}
                  >
                    {isUploading ? "Đang tải lên..." : "Tải lên"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
