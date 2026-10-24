'use client';

import React, { useState } from 'react';
import { FORM_TEMPLATES, TemplateDefinition } from '@/lib/templates/seedTemplates';
import { Button } from '@/components/ui/button';
import { Plus, ChevronDown, ChevronUp, Sparkles, FileText, CheckCircle2 } from 'lucide-react';

interface TemplateGalleryProps {
  onCreateBlank: () => void;
  onSelectTemplate: (templateId: string) => void;
  isCreating: boolean;
}

export default function TemplateGallery({
  onCreateBlank,
  onSelectTemplate,
  isCreating,
}: TemplateGalleryProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Show 4 templates initially, or all 10 when expanded
  const displayedTemplates = isExpanded ? FORM_TEMPLATES : FORM_TEMPLATES.slice(0, 4);

  return (
    <div className="bg-gray-100/70 dark:bg-gray-900/40 border-b border-gray-200 dark:border-gray-800 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">
              Start a new form
            </h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 font-medium">
              Templates
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          >
            {isExpanded ? (
              <>
                Show less <ChevronUp className="h-3.5 w-3.5 ml-1" />
              </>
            ) : (
              <>
                Template gallery ({FORM_TEMPLATES.length}) <ChevronDown className="h-3.5 w-3.5 ml-1" />
              </>
            )}
          </Button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {/* Blank Form Card */}
          <div
            onClick={onCreateBlank}
            className="group flex flex-col cursor-pointer transition-all duration-200"
          >
            <div className="aspect-[4/3] rounded-xl border-2 border-dashed border-purple-300 dark:border-purple-800 bg-white dark:bg-gray-900 hover:border-purple-600 hover:bg-purple-50/40 dark:hover:bg-purple-950/20 flex flex-col items-center justify-center p-4 transition-all shadow-sm group-hover:shadow-md">
              <div className="h-12 w-12 rounded-full bg-purple-100 dark:bg-purple-900/60 text-purple-600 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                <Plus className="h-6 w-6" />
              </div>
              <span className="text-xs font-semibold text-purple-700 dark:text-purple-300">
                Blank Form
              </span>
            </div>
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300 mt-2 truncate">
              Blank
            </span>
          </div>

          {/* Template Cards */}
          {displayedTemplates.map((template) => (
            <div
              key={template.id}
              onClick={() => onSelectTemplate(template.id)}
              className="group flex flex-col cursor-pointer transition-all duration-200"
            >
              <div className="aspect-[4/3] rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-purple-500 overflow-hidden relative shadow-sm group-hover:shadow-md transition-all flex flex-col">
                {/* Theme Color Bar */}
                <div
                  className="h-4 w-full shrink-0"
                  style={{ backgroundColor: template.theme.primaryColor }}
                />
                <div className="p-3 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                        {template.category}
                      </span>
                      {template.isQuiz && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200 font-bold">
                          Quiz
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-bold text-gray-900 dark:text-gray-100 line-clamp-2 leading-tight">
                      {template.title}
                    </p>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-gray-400 pt-2 border-t border-gray-100 dark:border-gray-800">
                    <span>
                      {template.sections.reduce((acc, s) => acc + s.questions.length, 0)} questions
                    </span>
                    <span className="text-purple-600 font-semibold group-hover:translate-x-0.5 transition-transform">
                      Use →
                    </span>
                  </div>
                </div>
              </div>
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300 mt-2 truncate">
                {template.title}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
