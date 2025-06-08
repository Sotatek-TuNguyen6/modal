"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useQuery } from "@tanstack/react-query";
import { Customer } from "@/types/customer";

// Hàm lấy danh sách khách hàng từ API - chỉ gọi 1 lần
const getCustomers = async (): Promise<Customer[]> => {
  console.log("Fetching customers from API...");
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/customers`
  );
  const data = await response.json();
  return data;
};

interface CustomerComboboxProps {
  onValueChange: (value: string) => void;
  value?: string;
  placeholder?: string;
  className?: string;
}

export function CustomerCombobox({
  onValueChange,
  value = "",
  placeholder = "Chọn khách hàng...",
  className,
}: CustomerComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [selectedValue, setSelectedValue] = React.useState(value);
  const [searchTerm, setSearchTerm] = React.useState("");

  // Sử dụng staleTime để giữ dữ liệu trong cache lâu hơn
  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["customers"],
    queryFn: getCustomers,
    staleTime: 5 * 60 * 1000, // Dữ liệu vẫn "tươi" trong 5 phút
    gcTime: 10 * 60 * 1000, // Giữ trong cache 10 phút (gcTime thay thế cacheTime trong các phiên bản mới)
  });

  // Update internal state when external value changes
  React.useEffect(() => {
    setSelectedValue(value);
  }, [value]);

  // Tìm kiếm trên dữ liệu đã fetch về
  const filteredCustomers = React.useMemo(() => {
    if (!searchTerm.trim()) return customers;

    const searchLower = searchTerm.toLowerCase();
    const filtered = customers.filter((customer: Customer) => {
      return (
        customer.name.toLowerCase().includes(searchLower) ||
        customer.code.toLowerCase().includes(searchLower)
      );
    });
    console.log(filtered);
    return filtered;
  }, [customers, searchTerm]);

  // Handle selection change
  const handleSelect = (currentValue: string) => {
    const newValue = currentValue === selectedValue ? "" : currentValue;
    setSelectedValue(newValue);
    onValueChange(newValue);
    setOpen(false);
    setSearchTerm("");
  };

  // Get the selected customer's name
  const getSelectedLabel = () => {
    if (!selectedValue || customers.length === 0) return placeholder;
    const customer = customers.find((c: Customer) => c._id === selectedValue);
    return customer ? `${customer.name} (${customer.code})` : placeholder;
  };

  // Directly handle CommandInput change
  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
  };
  console.log("isLoading", isLoading);

  return (
    <div className="relative w-full">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn("w-full justify-between px-3 h-10", className)}
          >
            {isLoading ? "Đang tải..." : getSelectedLabel()}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="p-0 w-full"
          align="start"
          style={{ width: "var(--radix-popover-trigger-width)" }}
        >
          <Command className="w-full" shouldFilter={false}>
            <CommandInput
              placeholder="Tìm khách hàng..."
              className="h-9"
              value={searchTerm}
              onValueChange={handleSearchChange}
            />
            <CommandList className="max-h-[300px]">
              {isLoading ? (
                <div className="p-2 text-center text-sm">Đang tải...</div>
              ) : filteredCustomers.length > 0 ? (
                <CommandGroup>
                  {filteredCustomers.map((customer: Customer) => (
                    <CommandItem
                      key={customer._id}
                      value={customer._id}
                      onSelect={handleSelect}
                      className="flex items-center justify-between"
                    >
                      <div className="flex-1 truncate">
                        {customer.name}
                        <span className="ml-1 text-sm text-gray-500">
                          ({customer.code})
                        </span>
                      </div>
                      <Check
                        className={cn(
                          "ml-2 h-4 w-4",
                          selectedValue === customer._id
                            ? "opacity-100"
                            : "opacity-0"
                        )}
                      />
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : (
                <div className="p-2 text-center text-sm">
                  {searchTerm
                    ? `Không tìm thấy khách hàng nào cho "${searchTerm}"`
                    : "Không có khách hàng nào"}
                </div>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Debug panel */}
      {process.env.NODE_ENV === "development" && (
        <div className="hidden">
          <div>Search: {searchTerm}</div>
          <div>Results: {filteredCustomers.length}</div>
          <div>Loading: {isLoading ? "true" : "false"}</div>
        </div>
      )}
    </div>
  );
}
