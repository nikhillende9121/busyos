"use client";

import type { ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";

// One generic table, reused by every module's list page — a column config
// array + a row-shaped type is all a new resource needs (see
// Docs-equivalent: lib/resources/*.config.ts). Keeps ~15 modules' worth of
// list screens from re-implementing the same pagination/empty/loading
// states each time.
export type DataTableColumn<T> = {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
};

export type DataTablePagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  rows: T[];
  isLoading?: boolean;
  getRowId: (row: T) => string;
  pagination?: DataTablePagination;
  onPageChange?: (page: number) => void;
  actions?: (row: T) => ReactNode;
  emptyMessage?: string;
};

export function DataTable<T extends Record<string, unknown>>({
  columns,
  rows,
  isLoading,
  getRowId,
  pagination,
  onPageChange,
  actions,
  emptyMessage = "No records found.",
}: DataTableProps<T>) {
  const columnCount = columns.length + (actions ? 1 : 0);

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead key={column.key}>{column.header}</TableHead>
              ))}
              {actions && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={columnCount} className="h-24 text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columnCount} className="h-24 text-center text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={getRowId(row)}>
                  {columns.map((column) => (
                    <TableCell key={column.key}>
                      {column.render ? column.render(row) : String(row[column.key] ?? "")}
                    </TableCell>
                  ))}
                  {actions && <TableCell className="text-right">{actions(row)}</TableCell>}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => onPageChange?.(pagination.page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => onPageChange?.(pagination.page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
