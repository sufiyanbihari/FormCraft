'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatRelativeTime } from '@/lib/utils';
import {
  MoreVertical,
  Edit3,
  ExternalLink,
  Copy,
  Trash2,
  RotateCcw,
  Users,
  CheckCircle,
  FileText,
  Share2,
} from 'lucide-react';

export interface FormCardData {
  id: string;
  publicId: string;
  title: string;
  description: string | null;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | 'TRASHED';
  isQuiz: boolean;
  updatedAt: string;
  theme?: {
    primaryColor: string;
    backgroundColor: string;
    headerImageUrl?: string | null;
  } | null;
  _count?: {
    submissions: number;
    questions: number;
  };
}

interface FormCardProps {
  form: FormCardData;
  onDuplicate: (id: string) => void;
  onMoveToTrash: (id: string) => void;
  onRestore?: (id: string) => void;
  onDeletePermanent?: (id: string) => void;
  isTrashView?: boolean;
}

export default function FormCard({
  form,
  onDuplicate,
  onMoveToTrash,
  onRestore,
  onDeletePermanent,
  isTrashView = false,
}: FormCardProps) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  const primaryColor = form.theme?.primaryColor || '#673ab7';
  const responseCount = form._count?.submissions || 0;
  const questionCount = form._count?.questions || 0;

  const handleCopyLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `${window.location.origin}/f/${form.publicId}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      onClick={() => {
        if (!isTrashView) {
          router.push(`/forms/${form.id}`);
        }
      }}
      className="group relative flex flex-col rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm hover:shadow-md hover:border-purple-300 dark:hover:border-purple-900 transition-all duration-200 cursor-pointer overflow-hidden"
    >
      {/* Top Banner with Theme Image or Default Banner */}
      <div
        className="h-28 w-full relative p-3 flex flex-col justify-between overflow-hidden bg-cover bg-center"
        style={{
          backgroundImage: `linear-gradient(to bottom, rgba(0, 75, 110, 0.45), rgba(0, 75, 110, 0.8)), url('${form.theme?.headerImageUrl || '/default-banner.jpg'}')`,
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {form.isQuiz && (
              <Badge className="bg-amber-400 text-amber-950 text-[10px] font-bold border-none">
                Quiz
              </Badge>
            )}
            <Badge
              variant={
                form.status === 'PUBLISHED'
                  ? 'success'
                  : form.status === 'TRASHED'
                    ? 'destructive'
                    : 'secondary'
              }
              className="text-[10px] font-bold"
            >
              {form.status}
            </Badge>
          </div>

          {/* Context Menu Trigger */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-full bg-white/20 hover:bg-white/40 text-white"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48" onClick={(e) => e.stopPropagation()}>
              {!isTrashView ? (
                <>
                  <DropdownMenuItem onClick={() => router.push(`/forms/${form.id}`)}>
                    <Edit3 className="h-4 w-4 mr-2" /> Open editor
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => window.open(`/f/${form.publicId}`, '_blank')}>
                    <ExternalLink className="h-4 w-4 mr-2" /> Preview form
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleCopyLink}>
                    <Copy className="h-4 w-4 mr-2" /> Copy link
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onDuplicate(form.id)}>
                    <Share2 className="h-4 w-4 mr-2" /> Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => onMoveToTrash(form.id)}
                    className="text-red-600 dark:text-red-400"
                  >
                    <Trash2 className="h-4 w-4 mr-2" /> Move to trash
                  </DropdownMenuItem>
                </>
              ) : (
                <>
                  {onRestore && (
                    <DropdownMenuItem onClick={() => onRestore(form.id)}>
                      <RotateCcw className="h-4 w-4 mr-2" /> Restore
                    </DropdownMenuItem>
                  )}
                  {onDeletePermanent && (
                    <DropdownMenuItem
                      onClick={() => onDeletePermanent(form.id)}
                      className="text-red-600 dark:text-red-400"
                    >
                      <Trash2 className="h-4 w-4 mr-2" /> Delete permanently
                    </DropdownMenuItem>
                  )}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center gap-1.5 text-white/90 text-xs">
          <FileText className="h-3.5 w-3.5" />
          <span>{questionCount} questions</span>
        </div>
      </div>

      {/* Card Details */}
      <div className="p-4 flex-1 flex flex-col justify-between">
        <div>
          <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100 group-hover:text-purple-600 dark:group-hover:text-purple-400 line-clamp-1 transition-colors">
            {form.title || 'Untitled form'}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-1">
            {form.description || 'No description provided'}
          </p>
        </div>

        <div className="pt-3 mt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <div className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5 text-purple-600" />
            <span className="font-medium text-gray-700 dark:text-gray-300">
              {responseCount} {responseCount === 1 ? 'response' : 'responses'}
            </span>
          </div>
          <span>{formatRelativeTime(form.updatedAt)}</span>
        </div>
      </div>
    </div>
  );
}
