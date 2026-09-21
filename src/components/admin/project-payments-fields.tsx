"use client";

import { useState } from "react";

import type { ProjectPayment } from "@/lib/types";

type PaymentRow = {
  id: number;
  date: string;
  amount: string;
  note: string;
};

type ProjectPaymentsFieldsProps = {
  formId: string;
  initialPayments: ProjectPayment[];
};

// Rows are uncontrolled inputs, so each needs a stable key: keyed by index,
// removing a middle payment would leave its values on screen.
let nextRowId = 0;

function toRows(initialPayments: ProjectPayment[]): PaymentRow[] {
  return initialPayments.map((payment) => ({
    id: nextRowId++,
    date: payment.date,
    amount: String(payment.amount),
    note: payment.note || "",
  }));
}

export function ProjectPaymentsFields({ formId, initialPayments }: ProjectPaymentsFieldsProps) {
  const [rows, setRows] = useState<PaymentRow[]>(() => toRows(initialPayments));

  const addPayment = () => {
    setRows((current) => [...current, { id: nextRowId++, date: "", amount: "", note: "" }]);
  };

  const removePayment = (id: number) => {
    setRows((current) => current.filter((row) => row.id !== id));
  };

  return (
    <div className="mt-2 space-y-2">
      {rows.length > 0 ? (
        rows.map((row) => (
          <div key={row.id} className="grid gap-2 rounded-xl border border-border/80 bg-zinc-50 p-3 sm:grid-cols-[160px_140px_minmax(0,1fr)_auto]">
            <input
              form={formId}
              name="paymentDate"
              type="date"
              defaultValue={row.date}
              aria-label="Payment date"
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
              onClick={() => removePayment(row.id)}
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