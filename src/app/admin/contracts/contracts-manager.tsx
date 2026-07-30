"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FolderPlus, Pencil, Trash2 } from "lucide-react";

import type { ContractFolder, ContractRecord } from "@/lib/contract-data";

import {
  createFolderAction,
  deleteContractsAction,
  deleteFolderAction,
  moveContractsAction,
  renameFolderAction,
} from "./actions";
import { ContractRow } from "./contract-row";

export function ContractsManager({
  contracts,
  folders,
  activeFolderId,
}: {
  contracts: ContractRecord[];
  folders: ContractFolder[];
  activeFolderId: string | null;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [renamingFolder, setRenamingFolder] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const activeFolder = folders.find((folder) => folder.id === activeFolderId) ?? null;
  const unfiledCount = contracts.length;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected = contracts.length > 0 && selected.size === contracts.length;
  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(contracts.map((c) => c.id)));
  };

  const selectedIds = useMemo(() => [...selected], [selected]);
  const selectedSignedCount = useMemo(
    () => contracts.filter((c) => selected.has(c.id) && c.status === "signed").length,
    [contracts, selected],
  );

  const clearSelection = () => {
    setSelected(new Set());
    setConfirmingDelete(false);
  };

  const tabClass = (isActive: boolean) =>
    isActive
      ? "rounded-xl bg-foreground/[0.07] px-3 py-1.5 text-sm font-medium text-foreground"
      : "rounded-xl px-3 py-1.5 text-sm text-muted-foreground transition hover:bg-foreground/[0.03] hover:text-foreground";

  return (
    <div className="space-y-4">
      {/* --- Folder tabs ---------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Link href="/admin/contracts" className={tabClass(!activeFolderId)} onClick={clearSelection}>
          Active <span className="text-xs text-muted-foreground">({unfiledCount})</span>
        </Link>

        {folders.map((folder) => (
          <Link
            key={folder.id}
            href={`/admin/contracts?folder=${folder.id}`}
            className={tabClass(activeFolderId === folder.id)}
            onClick={clearSelection}
          >
            {folder.name} <span className="text-xs text-muted-foreground">({folder.contractCount})</span>
          </Link>
        ))}

        <div className="ml-auto flex items-center gap-1.5">
          {activeFolder ? (
            <>
              <button
                type="button"
                onClick={() => setRenamingFolder((value) => !value)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition hover:border-foreground/40 hover:text-foreground"
              >
                <Pencil className="size-3.5" strokeWidth={1.8} />
                Rename
              </button>
              <form action={deleteFolderAction}>
                <input type="hidden" name="folderId" value={activeFolder.id} />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition hover:border-red-300 hover:text-red-700"
                  title="Deletes the folder only — its contracts move back to Active"
                >
                  <Trash2 className="size-3.5" strokeWidth={1.8} />
                  Delete folder
                </button>
              </form>
            </>
          ) : null}

          <button
            type="button"
            onClick={() => setCreatingFolder((value) => !value)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-2.5 py-1.5 text-xs transition hover:border-foreground/40"
          >
            <FolderPlus className="size-3.5" strokeWidth={1.8} />
            New folder
          </button>
        </div>
      </div>

      {creatingFolder ? (
        <form action={createFolderAction} className="flex items-center gap-2 rounded-xl border border-border/70 bg-white p-2.5">
          <input
            name="name"
            placeholder="Folder name — e.g. Archive 2026"
            maxLength={60}
            autoFocus
            required
            className="h-9 flex-1 rounded-lg border border-border px-3 text-sm outline-none focus:border-foreground/40"
          />
          <button type="submit" className="h-9 rounded-lg bg-foreground px-3.5 text-sm font-medium text-background">
            Create
          </button>
          <button
            type="button"
            onClick={() => setCreatingFolder(false)}
            className="h-9 px-2 text-sm text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </form>
      ) : null}

      {renamingFolder && activeFolder ? (
        <form action={renameFolderAction} className="flex items-center gap-2 rounded-xl border border-border/70 bg-white p-2.5">
          <input type="hidden" name="folderId" value={activeFolder.id} />
          <input
            name="name"
            defaultValue={activeFolder.name}
            maxLength={60}
            autoFocus
            required
            className="h-9 flex-1 rounded-lg border border-border px-3 text-sm outline-none focus:border-foreground/40"
          />
          <button type="submit" className="h-9 rounded-lg bg-foreground px-3.5 text-sm font-medium text-background">
            Save
          </button>
          <button
            type="button"
            onClick={() => setRenamingFolder(false)}
            className="h-9 px-2 text-sm text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </form>
      ) : null}

      {/* --- Bulk action bar ------------------------------------------------ */}
      {selected.size > 0 ? (
        <div className="space-y-2.5 rounded-xl border border-foreground/20 bg-foreground/[0.03] p-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <p className="text-sm font-medium">
              {selected.size} selected
              {selectedSignedCount > 0 ? (
                <span className="ml-1.5 font-normal text-muted-foreground">
                  ({selectedSignedCount} signed)
                </span>
              ) : null}
            </p>

            <form action={moveContractsAction} className="flex items-center gap-2">
              {selectedIds.map((id) => (
                <input key={id} type="hidden" name="selected" value={id} />
              ))}
              {activeFolderId ? <input type="hidden" name="folderId" value={activeFolderId} /> : null}
              <select
                name="targetFolderId"
                defaultValue=""
                className="h-9 rounded-lg border border-border bg-white px-2.5 text-sm outline-none"
              >
                <option value="">Active (unfiled)</option>
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="h-9 rounded-lg border border-border bg-white px-3 text-sm transition hover:border-foreground/40"
              >
                Move
              </button>
            </form>

            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={clearSelection}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete((value) => !value)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-200 px-3 text-sm text-red-700 transition hover:bg-red-50"
              >
                <Trash2 className="size-3.5" strokeWidth={1.8} />
                Delete
              </button>
            </div>
          </div>

          {confirmingDelete ? (
            <form
              action={deleteContractsAction}
              className="space-y-2.5 rounded-lg border border-red-200 bg-red-50 p-3"
            >
              {selectedIds.map((id) => (
                <input key={id} type="hidden" name="selected" value={id} />
              ))}
              {activeFolderId ? <input type="hidden" name="folderId" value={activeFolderId} /> : null}

              <p className="text-sm text-red-900">
                Permanently delete {selected.size} contract{selected.size === 1 ? "" : "s"}, including
                the stored PDF{selected.size === 1 ? "" : "s"} and audit trail.
                {selectedSignedCount > 0 ? (
                  <strong className="mt-1 block font-semibold">
                    {selectedSignedCount} of these {selectedSignedCount === 1 ? "is" : "are"} signed.
                    Deleting destroys the evidence behind {selectedSignedCount === 1 ? "it" : "them"}.
                    Consider moving to a folder instead.
                  </strong>
                ) : null}
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  name="confirm"
                  placeholder="Type DELETE"
                  autoComplete="off"
                  autoFocus
                  className="h-9 w-36 rounded-lg border border-red-300 bg-white px-3 text-sm outline-none"
                />
                <button
                  type="submit"
                  className="h-9 rounded-lg bg-red-600 px-3.5 text-sm font-medium text-white transition hover:bg-red-700"
                >
                  Delete permanently
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  className="h-9 px-2 text-sm text-red-800 hover:text-red-950"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : null}
        </div>
      ) : null}

      {/* --- Table ---------------------------------------------------------- */}
      <section className="overflow-hidden rounded-2xl border border-border/80 bg-white/80">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-xs tracking-wide text-muted-foreground uppercase">
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Select all contracts"
                  className="size-4 accent-neutral-800"
                  disabled={contracts.length === 0}
                />
              </th>
              <th className="px-4 py-3">Recipient</th>
              <th className="px-4 py-3">Project</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Updated</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {contracts.map((contract) => (
              <ContractRow
                key={contract.id}
                contract={contract}
                selected={selected.has(contract.id)}
                onToggle={toggle}
              />
            ))}
            {contracts.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-muted-foreground">
                  {activeFolder
                    ? `Nothing filed in ${activeFolder.name} yet.`
                    : "No contracts yet. Send one with the form above."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
