"use client";

import { useState } from "react";

import type { ProjectPayment } from "@/lib/types";

type PaymentRow = {
  date: string;
  amount: string;
  note: string;
};

type ProjectPaymentsFieldsProps = {
  formId: string;
  initialPayments: ProjectPayment[];
};

function toDisplayDate(iso: string): string {
  if (!iso) return "";
  const parts = iso.split("-");
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return iso;
}

function toRows(initialPayments: ProjectPayment[]): PaymentRow[] {
  return initialPayments.map((payment) => ({
    date: toDisplayDate(payment.date),
    amount: String(payment.amount),
    note: payment.note || "",
  }));
}

export function ProjectPaymentsFields({ formId, initialPayments }: ProjectPaymentsFieldsProps) {
  const [rows, setRows] = useState<PaymentRow[]>(toRows(initialPayments));

  const addPayment = () => {
    setRows((current) => [...current, { date: "", amount: "", note: "" }]);
  };

  const removePayment = (index: number) => {
    setRows((current) => current.filter((_, currentIndex) => currentIndex !== index));
  };

  return (
    <div className="mt-2 space-y-2">
      {rows.length > 0 ? (
        rows.map((row, index) => (
          <div key={index} className="grid gap-2 rounded-xl border border-border/80 bg-zinc-50 p-3 sm:grid-cols-[160px_140px_minmax(0,1fr)_auto]">
            <input
              form={formId}
              name="paymentDate"
              type="text"
              defaultValue={row.date}
              placeholder="DD-MM-YYYY"
              className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
            />
            <input
              form={formId}
              name="paymentAmount"
              type="number"
              min="0"
              step="0.01"
              defaultValue={row.amount}
              placeholder="Amount"
              className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
            />
            <input
              form={formId}
              name="paymentNote"
              type="text"
              defaultValue={row.note}
              placeholder="Note"
              className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
            />
            <button
              type="button"
              onClick={() => removePayment(index)}
              className="h-10 rounded-xl border border-red-200 px-3 text-sm text-red-600 hover:border-red-400"
            >
              Remove
            </button>
          </div>
        ))
      ) : (
        <p className="rounded-xl border border-dashed border-border bg-zinc-50 px-3 py-3 text-sm text-muted-foreground">
          No payments added yet.
        </p>
      )}

      <button
        type="button"
        onClick={addPayment}
        className="rounded-full border border-border px-4 py-2 text-sm hover:border-foreground/30"
      >
        Add payment
      </button>
    </div>
  );
}