import type { ReactNode } from "react";

export interface Column<T> {
  key: string;
  header: string;
  align?: "left" | "right" | "center";
  render: (row: T) => ReactNode;
  numeric?: boolean;
}

export interface PrimaryAction<T> {
  label: (row: T) => string;
}

interface DataTableProps<T> {
  title: string;
  columns: Column<T>[];
  rows: T[];
  emptyMessage?: string;
  /**
   * Optional primary action rendered on the mobile card view as a full-width
   * button. Desktop table does not render this (rows are dense there).
   */
  primaryAction?: PrimaryAction<T>;
}

export function DataTable<T extends { id?: string | number }>({
  title,
  columns,
  rows,
  emptyMessage = "No records.",
  primaryAction,
}: DataTableProps<T>) {
  return (
    <section className="flex flex-col gap-3">
      <header className="flex items-baseline justify-between gap-3">
        <h3 className="t-body font-semibold">{title}</h3>
        <span className="t-caption text-text-muted tabular">
          {rows.length} row{rows.length === 1 ? "" : "s"}
        </span>
      </header>

      {/* -------- Desktop: flat high-contrast table -------- */}
      <div className="surface-flat overflow-hidden hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full t-body">
            <thead className="bg-surface-elevated">
              <tr className="text-text-muted">
                {columns.map((c) => (
                  <th
                    key={c.key}
                    className={`px-4 py-2 font-medium ${
                      c.align === "right"
                        ? "text-right"
                        : c.align === "center"
                        ? "text-center"
                        : "text-left"
                    }`}
                  >
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="px-4 py-6 text-center text-text-muted"
                  >
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                rows.map((row, i) => (
                  <tr
                    key={row.id ?? i}
                    className={i % 2 === 1 ? "bg-surface-elevated" : ""}
                  >
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className={`px-4 py-2 ${
                          c.align === "right"
                            ? "text-right"
                            : c.align === "center"
                            ? "text-center"
                            : "text-left"
                        } ${c.numeric ? "tabular" : ""}`}
                      >
                        {c.render(row)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* -------- Mobile: card list (one card per row) -------- */}
      <ul className="md:hidden flex flex-col gap-3">
        {rows.length === 0 ? (
          <li className="surface-flat px-4 py-6 text-center text-text-muted">
            {emptyMessage}
          </li>
        ) : (
          rows.map((row, i) => (
            <li key={row.id ?? i} className="neu-raised-sm p-4 flex flex-col gap-3">
              <dl className="flex flex-col gap-2">
                {columns.map((c) => (
                  <div
                    key={c.key}
                    className="flex items-baseline justify-between gap-3"
                  >
                    <dt className="t-caption text-text-muted uppercase tracking-wide">
                      {c.header}
                    </dt>
                    <dd
                      className={`t-body text-right min-w-0 truncate ${
                        c.numeric ? "tabular" : ""
                      }`}
                    >
                      {c.render(row)}
                    </dd>
                  </div>
                ))}
              </dl>
              {primaryAction ? (
                <button
                  type="button"
                  className="neu-raised-sm w-full py-2 t-body font-medium text-accent"
                >
                  {primaryAction.label(row)}
                </button>
              ) : null}
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
