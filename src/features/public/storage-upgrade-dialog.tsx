'use client';

import Link from 'next/link';
import { Database, Sparkles } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type StorageUpgradeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpgrade?: () => void;
};

export const storageUpgradeDialogCopy = {
  title: '存储空间不足',
  description: '当前“我的媒体”空间已满，保存失败。',
  note: '升级云空间升级可获得更大云资料额度。',
  action: '去开通云空间升级',
  dismiss: '暂不升级',
  link: '/membership?plan=yearly',
} as const;

export function StorageUpgradeDialog({
  open,
  onOpenChange,
  onUpgrade,
}: StorageUpgradeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Database size={20} />
          </div>
          <DialogTitle className="text-xl">{storageUpgradeDialogCopy.title}</DialogTitle>
          <DialogDescription className="text-sm leading-6">
            {storageUpgradeDialogCopy.description}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-border bg-secondary/40 px-4 py-3 text-sm text-muted-foreground">
          {storageUpgradeDialogCopy.note}
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="cursor-pointer rounded-xl border border-border px-4 py-2.5 text-sm text-foreground transition-colors hover:border-ring"
          >
            {storageUpgradeDialogCopy.dismiss}
          </button>
          <Link
            href={storageUpgradeDialogCopy.link}
            onClick={() => {
              onUpgrade?.();
              onOpenChange(false);
            }}
            className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/85"
          >
            <Sparkles size={14} />
            {storageUpgradeDialogCopy.action}
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
