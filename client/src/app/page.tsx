"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { signOut } from "next-auth/react";

// Helper function to format date in Vietnamese format (UTC+7)
const formatDateVN = (date: Date): string => {
  // Add 7 hours for UTC+7
  const vnDate = new Date(date.getTime() + (7 * 60 * 60 * 1000));
  
  // Format as dd/MM/yyyy HH:mm:ss
  const day = String(vnDate.getUTCDate()).padStart(2, '0');
  const month = String(vnDate.getUTCMonth() + 1).padStart(2, '0');
  const year = vnDate.getUTCFullYear();
  const hours = String(vnDate.getUTCHours()).padStart(2, '0');
  const minutes = String(vnDate.getUTCMinutes()).padStart(2, '0');
  const seconds = String(vnDate.getUTCSeconds()).padStart(2, '0');
  
  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
};

interface ImageResult {
  id: string;
  url: string;
  name: string;
  date: string;
  customer: string;
  folder?: string;
  similarity?: number;
}

// Interface cho dữ liệu trả về từ API
interface ApiImageResult {
  id: string;
  filename: string;
  path: string;
  url: string;
  name: string;
  customer: string;
  customerId: string | null;
  folder: string;
  date: string;
  similarity?: number;
}

interface SearchApiResponse {
  success: boolean;
  message: string;
  results: ApiImageResult[];
  total: number;
}

// Hàm gọi API tìm kiếm ảnh
const searchImages = async (imageFile: File): Promise<ImageResult[]> => {
  // Tạo FormData để gửi file ảnh
  const formData = new FormData();
  formData.append("image", imageFile);

  try {
    // Sử dụng URL nội bộ cho các yêu cầu API từ server-side
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.inhoanglinh.click';

    console.log(apiUrl);
    // Gọi API thực tế
    const response = await fetch(`${apiUrl}/search`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Lỗi: ${response.status} ${response.statusText}`);
    }

    // API hiện đã trả về JSON
    const data = (await response.json()) as SearchApiResponse;

    if (!data.success) {
      throw new Error(data.message || "Lỗi khi tìm kiếm ảnh");
    }

    // Luôn sử dụng URL công khai cho hiển thị ảnh trong trình duyệt
    return data.results.map((result) => ({
      id: result.id,
      url: result.url.startsWith('http') ? result.url : `${process.env.NEXT_PUBLIC_API_URL}${result.url}`,
      name: result.name || result.filename,
      date: result.date || formatDateVN(new Date()),
      customer: result.customer || "N/A",
      folder: result.folder || "general",
      similarity: result.similarity,
    }));
  } catch (error) {
    console.error("Lỗi khi tìm kiếm ảnh:", error);
    throw error;
  }
};

// Hàm xóa ảnh
// const deleteImage = async (filename: string) => {
//   try {
//     const response = await fetch(
//       `${process.env.NEXT_PUBLIC_API_URL}/api/images/${filename}`,
//       {
//         method: "DELETE",
//       }
//     );

//     if (!response.ok) {
//       throw new Error(`Lỗi: ${response.status} ${response.statusText}`);
//     }

//     const result = await response.json();
//     return result;
//   } catch (error) {
//     console.error("Lỗi khi xóa ảnh:", error);
//     throw error;
//   }
// };

export default function Home() {
  const { session, authenticated } = useAuth();
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sử dụng React Query mutation cho việc tìm kiếm
  const searchMutation = useMutation({
    mutationFn: searchImages,
    onError: (error) => {
      console.error("Error searching similar images:", error);
    },
  });

  // Thêm mutation cho việc xóa ảnh
  // const deleteMutation = useMutation({
  //   mutationFn: deleteImage,
  //   onSuccess: () => {
  //     // Sau khi xóa thành công, cập nhật lại kết quả tìm kiếm nếu có ảnh được chọn
  //     if (selectedImage) {
  //       searchMutation.mutate(selectedImage);
  //     }
  //   },
  //   onError: (error) => {
  //     console.error("Error deleting image:", error);
  //     alert("Có lỗi khi xóa ảnh. Vui lòng thử lại.");
  //   },
  // });

  const handleChooseImage = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    // Lấy ảnh đầu tiên được chọn
    const file = files[0];

    // Tạo URL để hiển thị preview
    const imageUrl = URL.createObjectURL(file);

    // Cập nhật state
    setSelectedImage(file);
    setSelectedImageUrl(imageUrl);

    // Tự động tìm kiếm khi có ảnh được chọn
    searchMutation.mutate(file);

    // Reset input file để có thể chọn lại cùng file nếu muốn
    event.target.value = "";
  };

  // Dọn dẹp URLs khi component unmount hoặc khi URL thay đổi
  useEffect(() => {
    return () => {
      if (selectedImageUrl) {
        URL.revokeObjectURL(selectedImageUrl);
      }
    };
  }, [selectedImageUrl]);

  // Truy cập kết quả tìm kiếm từ mutation
  const searchResults = searchMutation.data || [];
  console.log(searchResults);
  const isSearching = searchMutation.isPending;
  const error = searchMutation.isError
    ? "Có lỗi xảy ra khi tìm kiếm ảnh tương tự. Vui lòng thử lại."
    : null;

  // Xử lý sự kiện xóa ảnh
  // const handleDeleteImage = (filename: string) => {
  //   if (window.confirm(`Bạn có chắc chắn muốn xóa ảnh "${filename}" không?`)) {
  //     deleteMutation.mutate(filename);
  //   }
  // };

  const handleSignOut = () => {
    signOut({ callbackUrl: "/login" });
  };

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
                unoptimized={true}
              />
            </Link>
          </div>
          <nav className="flex items-center space-x-4">
            <Link
              href="/"
              className="font-medium text-gray-900 dark:text-gray-100 hover:text-primary"
            >
              Trang chủ
            </Link>
            <Link
              href="/add-image"
              className="font-medium text-gray-600 dark:text-gray-400 hover:text-primary"
            >
              Thêm ảnh
            </Link>
            <Link
              href="/add-customer"
              className="font-medium text-gray-600 dark:text-gray-400 hover:text-primary"
            >
              Thêm khách hàng
            </Link>
            
            {authenticated ? (
              <div className="flex items-center space-x-3">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {session?.user?.email}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSignOut}
                >
                  Đăng xuất
                </Button>
              </div>
            ) : (
              <Link href="/login">
                <Button variant="outline" size="sm">
                  Đăng nhập
                </Button>
              </Link>
            )}
          </nav>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 container mx-auto py-8 px-4">
        <div className="flex flex-col space-y-6">
          {/* Search section */}
          <section className="bg-gray-50 dark:bg-gray-900 p-6 rounded-lg">
            <h2 className="text-2xl font-bold mb-4">Tìm kiếm ảnh tương tự</h2>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <Button
                  variant="outline"
                  className="w-full h-12 relative flex items-center justify-center border-dashed"
                  onClick={handleChooseImage}
                  disabled={isSearching}
                >
                  {selectedImageUrl ? (
                    <div className="flex items-center">
                      <div className="w-8 h-8 relative mr-3 overflow-hidden rounded">
                        <Image
                          src={selectedImageUrl}
                          alt="Preview"
                          fill
                          className="object-cover"
                          unoptimized={true}
                        />
                      </div>
                      <span>
                        {selectedImage?.name.length &&
                        selectedImage.name.length > 25
                          ? selectedImage.name.substring(0, 22) + "..."
                          : selectedImage?.name}
                      </span>
                    </div>
                  ) : (
                    <span className="flex items-center">
                      <svg
                        className="w-5 h-5 mr-2 text-gray-500"
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
                      Chọn ảnh để tìm kiếm tương tự
                    </span>
                  )}
                </Button>
              </div>

              <Button
                className="whitespace-nowrap"
                disabled={isSearching || !selectedImage}
                onClick={() =>
                  selectedImage && searchMutation.mutate(selectedImage)
                }
              >
                {isSearching ? "Đang tìm kiếm..." : "Tìm kiếm tương tự"}
              </Button>

              {/* Hidden file input */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*"
                className="hidden"
              />
            </div>

            {selectedImageUrl && (
              <div className="mt-4">
                <p className="text-sm text-gray-500 mb-2">Ảnh đã chọn:</p>
                <div className="relative w-full max-w-xs h-40 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                  <Image
                    src={selectedImageUrl}
                    alt="Selected image"
                    fill
                    className="object-contain"
                    unoptimized={true}
                  />
                </div>
              </div>
            )}
          </section>

          {/* Results section */}
          <section>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold">Kết quả</h2>
              {searchResults.length > 0 && (
                <p className="text-sm text-gray-500">
                  Tìm thấy {searchResults.length} ảnh tương tự
                </p>
              )}
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
                {error}
              </div>
            )}

            {isSearching ? (
              <div className="flex flex-col justify-center items-center py-20">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mb-4"></div>
                <p className="text-gray-500">Đang tìm kiếm ảnh tương tự...</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {searchResults.length > 0 ? (
                  // Hiển thị kết quả tìm kiếm từ API
                  searchResults.map((image) => (
                    <div
                      key={image.id}
                      className="bg-white dark:bg-gray-800 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow"
                    >
                      <div className="relative aspect-square">
                        <Image
                          src={image.url}
                          alt={image.name}
                          fill
                          className="object-cover"
                          unoptimized={true}
                        />
                        {/* {image.similarity !== undefined && (
                          <div className="absolute top-2 right-2 bg-black bg-opacity-70 text-white text-xs font-medium px-2 py-1 rounded-full">
                            {image.similarity}% giống
                          </div>
                        )} */}
                      </div>
                      <div className="p-4">
                        <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-1 truncate">
                          {image.name}
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {image.customer}
                        </p>
                        {image.folder && (
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            Thư mục: {image.folder}
                          </p>
                        )}
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {image.date}
                        </div>
                        {/* <div className="mt-3 flex justify-between">
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDeleteImage(image.name)}
                            disabled={deleteMutation.isPending}
                          >
                            Xóa
                          </Button>
                          <Button variant="outline" size="sm">
                            Xem
                          </Button>
                        </div> */}
                      </div>
                    </div>
                  ))
                ) : (
                  // Hiển thị thông báo khi chưa có kết quả
                  <div className="col-span-full text-center py-10 text-gray-500">
                    <svg
                      className="w-16 h-16 mx-auto text-gray-400 mb-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.5"
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                      ></path>
                    </svg>
                    <p className="text-lg">Không tìm thấy ảnh tương tự</p>
                    <p className="mt-2">
                      {selectedImage ? 
                        "Không tìm thấy ảnh tương tự với ảnh bạn đã chọn" : 
                        "Hãy chọn một ảnh để tìm kiếm những ảnh tương tự"}
                    </p>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
