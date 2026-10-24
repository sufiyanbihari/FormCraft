'use client';

import React from 'react';
import {
  PlusCircle,
  Heading,
  Image as ImageIcon,
  Video,
  Layers,
  Sparkles,
} from 'lucide-react';

interface FloatingToolbarProps {
  onAddQuestion: (type?: string) => void;
  onAddSection: () => void;
}

export default function FloatingToolbar({
  onAddQuestion,
  onAddSection,
}: FloatingToolbarProps) {
  return (
    <aside aria-label="Form editor actions" className="sticky top-24 self-start flex flex-col items-center bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-lg p-1.5 space-y-1.5 z-30">
      <button
        onClick={() => onAddQuestion('MULTIPLE_CHOICE')}
        className="p-2.5 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-950/40 text-gray-600 dark:text-gray-300 hover:text-purple-600 transition-colors group relative"
        title="Add question"
      >
        <PlusCircle className="h-5 w-5" />
      </button>

      <button
        onClick={() => onAddQuestion('SECTION_HEADER')}
        className="p-2.5 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-950/40 text-gray-600 dark:text-gray-300 hover:text-purple-600 transition-colors group relative"
        title="Add title and description"
      >
        <Heading className="h-5 w-5" />
      </button>

      <button
        onClick={() => onAddQuestion('IMAGE_BLOCK')}
        className="p-2.5 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-950/40 text-gray-600 dark:text-gray-300 hover:text-purple-600 transition-colors group relative"
        title="Add image"
      >
        <ImageIcon className="h-5 w-5" />
      </button>

      <button
        onClick={() => onAddQuestion('VIDEO_EMBED')}
        className="p-2.5 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-950/40 text-gray-600 dark:text-gray-300 hover:text-purple-600 transition-colors group relative"
        title="Add video"
      >
        <Video className="h-5 w-5" />
      </button>

      <div className="w-6 h-px bg-gray-200 dark:bg-gray-800 my-1" />

      <button
        onClick={onAddSection}
        className="p-2.5 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-950/40 text-gray-600 dark:text-gray-300 hover:text-purple-600 transition-colors group relative"
        title="Add section"
      >
        <Layers className="h-5 w-5" />
      </button>
    </aside>
  );
}
