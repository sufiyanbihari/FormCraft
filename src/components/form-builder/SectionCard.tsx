'use client';

import React from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Trash2, Layers, MoreVertical } from 'lucide-react';

export interface SectionData {
  id: string;
  title: string;
  description?: string | null;
  orderIndex: number;
  nextSectionId?: string | null;
}

interface SectionCardProps {
  section: SectionData;
  sectionIndex: number;
  totalSections: number;
  onChange: (updated: Partial<SectionData>) => void;
  onDelete: () => void;
  allSections: SectionData[];
  borderRadius?: string;
}

export default function SectionCard({
  section,
  sectionIndex,
  totalSections,
  onChange,
  onDelete,
  allSections,
  borderRadius = 'rounded-xl',
}: SectionCardProps) {
  return (
    <div className={`bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800/60 ${borderRadius || 'rounded-xl'} p-5 mb-4 shadow-sm`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-600 text-white">
            Section {sectionIndex + 1} of {totalSections}
          </span>
        </div>

        {totalSections > 1 && (
          <button
            onClick={onDelete}
            className="text-gray-400 hover:text-red-500 p-1.5 rounded-md hover:bg-white dark:hover:bg-gray-800 transition-colors"
            title="Delete section"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="space-y-3">
        <Input
          type="text"
          value={section.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="Section Title"
          className="text-lg font-bold border-none px-1 h-9 focus:ring-0 bg-transparent text-gray-900 dark:text-gray-100"
        />

        <Textarea
          value={section.description || ''}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Description (optional)"
          className="text-xs text-gray-500 border-none px-1 min-h-[50px] focus:ring-0 bg-transparent resize-none"
        />

        {/* Section Navigation Routing */}
        <div className="pt-2 border-t border-purple-100 dark:border-purple-900/40 flex items-center justify-between text-xs">
          <span className="text-gray-500 font-medium">After section {sectionIndex + 1}:</span>
          <div className="w-56">
            <Select
              value={section.nextSectionId || 'NEXT'}
              onValueChange={(val) => onChange({ nextSectionId: val })}
            >
              <SelectTrigger className="h-8 text-xs bg-white dark:bg-gray-900">
                <SelectValue placeholder="Continue to next section" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NEXT">Continue to next section</SelectItem>
                <SelectItem value="SUBMIT">Submit form</SelectItem>
                {allSections
                  .filter((s) => s.id !== section.id)
                  .map((s, idx) => (
                    <SelectItem key={s.id} value={s.id}>
                      Go to Section {idx + 1} ({s.title})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  );
}
