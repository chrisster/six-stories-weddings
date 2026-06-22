import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Format an ISO date string (YYYY-MM-DD) to dd-mm-yy display format */
export function formatDateDDMMYY(iso: string | null | undefined): string {
  if (!iso) return "-";
  const parts = iso.split("-");
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}-${parts[1]}-${parts[0].slice(2)}`;
  }
  return iso;
}
