'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/useAuth';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import TemplateGallery from '@/components/dashboard/TemplateGallery';
import FormCard, { FormCardData } from '@/components/dashboard/FormCard';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  FileText,
  Plus,
  LayoutGrid,
  List,
  Sparkles,
  FolderOpen,
  Trash2,
  Share2,
  Clock,
  Loader2,
  AlertCircle,
} from 'lucide-react';

export default function DashboardPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [forms, setForms] = useState<FormCardData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all'); // all, owned, shared, published, draft, trash
  const [sortBy, setSortBy] = useState('updatedAt-desc'); // updatedAt-desc, title-asc, responses-desc
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isCreating, setIsCreating] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const fetchForms = async () => {
    try {
      setIsLoading(true);
      const queryParams = new URLSearchParams({
        filter: activeFilter,
        search: searchQuery,
      });

      const res = await fetch(`/api/forms?${queryParams.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setForms(data.forms || []);
      }
    } catch (err) {
      console.error('Error fetching forms:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (user) {
      fetchForms();
    }
  }, [user, activeFilter, searchQuery]);

  // Handle Blank Form Creation
  const handleCreateBlank = async () => {
    if (!user) {
      showToast('Please sign in to create a form');
      router.push('/login');
      return;
    }
    try {
      setIsCreating(true);
      const res = await fetch('/api/forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Untitled form' }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        form?: { id: string };
        error?: string;
      };
      if (res.ok && data.form?.id) {
        router.push(`/forms/${data.form.id}`);
      } else if (res.status === 401) {
        showToast('Your session has expired. Please sign in again.');
        router.push('/login');
      } else {
        showToast(data.error || 'Failed to create form');
      }
    } catch {
      showToast('Error creating form');
    } finally {
      setIsCreating(false);
    }
  };

  // Handle Template Form Creation
  const handleSelectTemplate = async (templateId: string) => {
    if (!user) {
      showToast('Please sign in to create a form');
      router.push('/login');
      return;
    }
    try {
      setIsCreating(true);
      const res = await fetch('/api/forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        form?: { id: string };
        error?: string;
      };
      if (res.ok && data.form?.id) {
        router.push(`/forms/${data.form.id}`);
      } else if (res.status === 401) {
        showToast('Your session has expired. Please sign in again.');
        router.push('/login');
      } else {
        showToast(data.error || 'Failed to create template form');
      }
    } catch {
      showToast('Error instantiating template');
    } finally {
      setIsCreating(false);
    }
  };

  // Handle Duplicate
  const handleDuplicate = async (id: string) => {
    try {
      const res = await fetch(`/api/forms/${id}/duplicate`, { method: 'POST' });
      if (res.ok) {
        showToast('Form duplicated successfully');
        fetchForms();
      } else {
        showToast('Failed to duplicate form');
      }
    } catch {
      showToast('Error duplicating form');
    }
  };

  // Handle Move to Trash
  const handleMoveToTrash = async (id: string) => {
    try {
      const res = await fetch(`/api/forms/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('Form moved to trash');
        fetchForms();
      } else {
        showToast('Failed to move form to trash');
      }
    } catch {
      showToast('Error deleting form');
    }
  };

  // Handle Restore
  const handleRestore = async (id: string) => {
    try {
      const res = await fetch(`/api/forms/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'DRAFT' }),
      });
      if (res.ok) {
        showToast('Form restored');
        fetchForms();
      }
    } catch {
      showToast('Error restoring form');
    }
  };

  // Handle Delete Permanent
  const handleDeletePermanent = async (id: string) => {
    if (!confirm('Are you sure you want to permanently delete this form and all its responses?')) {
      return;
    }
    try {
      const res = await fetch(`/api/forms/${id}?permanent=true`, { method: 'DELETE' });
      if (res.ok) {
        showToast('Form permanently deleted');
        fetchForms();
      }
    } catch {
      showToast('Error deleting form');
    }
  };

  // Sorted Forms
  const sortedForms = [...forms].sort((a, b) => {
    if (sortBy === 'updatedAt-desc') {
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    }
    if (sortBy === 'title-asc') {
      return a.title.localeCompare(b.title);
    }
    if (sortBy === 'responses-desc') {
      return (b._count?.submissions || 0) - (a._count?.submissions || 0);
    }
    return 0;
  });

  if (authLoading || (!user && !forms.length)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="flex flex-col items-center gap-3 text-purple-600">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Loading FormCraft...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50/50 dark:bg-gray-950 flex flex-col">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 text-sm animate-in fade-in slide-in-from-bottom-4">
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <DashboardHeader
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onCreateBlank={handleCreateBlank}
      />

      {/* Template Gallery Banner */}
      <TemplateGallery
        onCreateBlank={handleCreateBlank}
        onSelectTemplate={handleSelectTemplate}
        isCreating={isCreating}
      />

      {/* Main Forms Section */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full flex-1">
        {/* Navigation & Filter Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
            {[
              { id: 'all', label: 'All Forms' },
              { id: 'owned', label: 'Owned by me' },
              { id: 'shared', label: 'Shared with me' },
              { id: 'published', label: 'Published' },
              { id: 'draft', label: 'Drafts' },
              { id: 'trash', label: 'Trash' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveFilter(tab.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-full whitespace-nowrap transition-colors ${
                  activeFilter === tab.id
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Sort & View Mode */}
          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <div className="w-44">
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="h-8 text-xs bg-white dark:bg-gray-900">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="updatedAt-desc">Last modified</SelectItem>
                  <SelectItem value="title-asc">Title (A-Z)</SelectItem>
                  <SelectItem value="responses-desc">Most responses</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-0.5">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-md ${
                  viewMode === 'grid'
                    ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-600'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
                title="Grid view"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-md ${
                  viewMode === 'list'
                    ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-600'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
                title="List view"
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Forms Content */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 h-56 animate-pulse"
              >
                <div className="h-28 bg-gray-200 dark:bg-gray-800" />
                <div className="p-4 space-y-2">
                  <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-3/4" />
                  <div className="h-3 bg-gray-100 dark:bg-gray-850 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : sortedForms.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 my-8">
            <div className="h-16 w-16 rounded-2xl bg-purple-100 dark:bg-purple-950/60 text-purple-600 flex items-center justify-center mb-4">
              {activeFilter === 'trash' ? (
                <Trash2 className="h-8 w-8" />
              ) : (
                <FileText className="h-8 w-8" />
              )}
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {activeFilter === 'trash' ? 'Trash is empty' : 'No forms found'}
            </h3>
            <p className="text-sm text-gray-500 max-w-sm mt-1 mb-6">
              {activeFilter === 'trash'
                ? 'Deleted forms will appear here before permanent removal.'
                : searchQuery
                  ? `No forms match your search query "${searchQuery}".`
                  : 'Get started by creating your first form or picking one from our template gallery.'}
            </p>
            {activeFilter !== 'trash' && (
              <Button
                onClick={handleCreateBlank}
                className="bg-purple-600 hover:bg-purple-700 text-white shadow-md shadow-purple-600/20 rounded-full px-5"
              >
                <Plus className="h-4 w-4 mr-1.5" /> Create Blank Form
              </Button>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {sortedForms.map((form) => (
              <FormCard
                key={form.id}
                form={form}
                onDuplicate={handleDuplicate}
                onMoveToTrash={handleMoveToTrash}
                onRestore={handleRestore}
                onDeletePermanent={handleDeletePermanent}
                isTrashView={activeFilter === 'trash'}
              />
            ))}
          </div>
        ) : (
          /* List View */
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden divide-y divide-gray-100 dark:divide-gray-800 shadow-sm">
            {sortedForms.map((form) => (
              <div
                key={form.id}
                onClick={() => router.push(`/forms/${form.id}`)}
                className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-850 cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="h-9 w-9 rounded-lg flex items-center justify-center text-white"
                    style={{ backgroundColor: form.theme?.primaryColor || '#673ab7' }}
                  >
                    <FileText className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {form.title}
                    </h4>
                    <p className="text-xs text-gray-400 line-clamp-1">{form.description}</p>
                  </div>
                </div>

                <div className="flex items-center gap-6 text-xs text-gray-500">
                  <span>{form._count?.submissions || 0} responses</span>
                  <span>{new Date(form.updatedAt).toLocaleDateString()}</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      form.status === 'PUBLISHED'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {form.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
