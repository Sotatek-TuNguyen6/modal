"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";

interface Customer {
  _id: string;
  name: string;
  code: string;
  createdAt: string;
}

// Hàm gọi API lấy danh sách khách hàng
const fetchCustomers = async (): Promise<Customer[]> => {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/customers`
  );

  if (!response.ok) {
    throw new Error(`Lỗi: ${response.status} ${response.statusText}`);
  }

  return response.json();
};

// Hàm gọi API thêm khách hàng mới
const addCustomer = async (name: string): Promise<Customer> => {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/customers`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name }),
    }
  );

  if (!response.ok) {
    throw new Error(`Lỗi: ${response.status} ${response.statusText}`);
  }

  return response.json();
};

// Hàm gọi API xóa khách hàng
const deleteCustomer = async (id: string): Promise<{ message: string }> => {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/customers/${id}`,
    {
      method: "DELETE",
    }
  );

  if (!response.ok) {
    throw new Error(`Lỗi: ${response.status} ${response.statusText}`);
  }

  return response.json();
};

export default function AddCustomer() {
  const [newCustomerName, setNewCustomerName] = useState("");
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  // Sử dụng React Query để lấy danh sách khách hàng
  const {
    data: customers = [],
    isLoading: isLoadingCustomers,
    refetch: refetchCustomers,
    error: customersError,
  } = useQuery({
    queryKey: ["customers"],
    queryFn: fetchCustomers,
  });

  // Sử dụng React Query mutation để thêm khách hàng mới
  const addCustomerMutation = useMutation({
    mutationFn: addCustomer,
    onSuccess: () => {
      // Làm mới danh sách khách hàng sau khi thêm thành công
      refetchCustomers();
      // Xóa tên khách hàng trong form
      setNewCustomerName("");
    },
    onError: (error) => {
      console.error("Lỗi khi thêm khách hàng:", error);
      alert(`Lỗi khi thêm khách hàng: ${error.message}`);
    },
  });

  // Sử dụng React Query mutation để xóa khách hàng
  const deleteCustomerMutation = useMutation({
    mutationFn: deleteCustomer,
    onSuccess: () => {
      // Làm mới danh sách khách hàng sau khi xóa thành công
      refetchCustomers();
      setIsDeleting(null);
    },
    onError: (error) => {
      console.error("Lỗi khi xóa khách hàng:", error);
      alert(`Lỗi khi xóa khách hàng: ${error.message}`);
      setIsDeleting(null);
    },
  });

  const handleAddCustomer = () => {
    if (!newCustomerName.trim()) return;
    addCustomerMutation.mutate(newCustomerName.trim());
  };

  const handleDeleteCustomer = (id: string, name: string) => {
    if (
      window.confirm(`Bạn có chắc chắn muốn xóa khách hàng "${name}" không?`)
    ) {
      setIsDeleting(id);
      deleteCustomerMutation.mutate(id);
    }
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
              className="font-medium text-gray-600 dark:text-gray-400 hover:text-primary"
            >
              Thêm ảnh
            </Link>
            <Link
              href="/add-customer"
              className="font-medium text-gray-900 dark:text-gray-100 hover:text-primary"
            >
              Thêm khách hàng
            </Link>
          </nav>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 container mx-auto py-8 px-4">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-3xl font-bold mb-6">Quản lý khách hàng</h1>

          {/* Form thêm khách hàng */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-200 dark:border-gray-700 mb-8">
            <h2 className="text-xl font-semibold mb-4">Thêm khách hàng mới</h2>

            <div className="flex gap-4">
              <div className="flex-1">
                <input
                  type="text"
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                  placeholder="Nhập tên khách hàng"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={addCustomerMutation.isPending}
                />
              </div>

              <Button
                onClick={handleAddCustomer}
                disabled={
                  !newCustomerName.trim() || addCustomerMutation.isPending
                }
              >
                {addCustomerMutation.isPending
                  ? "Đang thêm..."
                  : "Thêm khách hàng"}
              </Button>
            </div>
          </div>

          {/* Bảng danh sách khách hàng */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-semibold">Danh sách khách hàng</h2>
            </div>

            {customersError && (
              <div className="p-4 text-red-500">
                Lỗi khi tải danh sách khách hàng: {customersError.message}
              </div>
            )}

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">Mã KH</TableHead>
                    <TableHead>Tên khách hàng</TableHead>
                    <TableHead>Ngày tạo</TableHead>
                    <TableHead className="text-right">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingCustomers ? (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="text-center py-8 text-gray-500"
                      >
                        Đang tải danh sách khách hàng...
                      </TableCell>
                    </TableRow>
                  ) : customers.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="text-center py-8 text-gray-500"
                      >
                        Chưa có khách hàng nào
                      </TableCell>
                    </TableRow>
                  ) : (
                    customers.map((customer) => (
                      <TableRow key={customer._id}>
                        <TableCell className="font-medium">
                          {customer.code}
                        </TableCell>
                        <TableCell>{customer.name}</TableCell>
                        <TableCell>
                          {new Date(customer.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() =>
                                handleDeleteCustomer(
                                  customer._id,
                                  customer.name
                                )
                              }
                              disabled={isDeleting === customer._id}
                            >
                              {isDeleting === customer._id ? (
                                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-1"></span>
                              ) : (
                                <Trash2 className="h-4 w-4 mr-1" />
                              )}
                              Xóa
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                // Redirect to add image page with selected customer
                                window.location.href = `/add-image?customer=${
                                  customer._id
                                }&name=${encodeURIComponent(customer.name)}`;
                              }}
                            >
                              Chọn
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
