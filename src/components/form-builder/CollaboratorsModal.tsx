'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UserPlus, Trash2, Shield, Loader2, Check, AlertCircle } from 'lucide-react';

interface Collaborator {
  id: string;
  role: 'OWNER' | 'EDITOR' | 'VIEWER' | 'ANALYST';
  user: {
    id: string;
    name: string | null;
    email: string;
    avatarUrl: string | null;
  };
}

interface CollaboratorsModalProps {
  formId: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function CollaboratorsModal({
  formId,
  isOpen,
  onClose,
}: CollaboratorsModalProps) {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [owner, setOwner] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'EDITOR' | 'VIEWER' | 'ANALYST'>('EDITOR');
  const [isLoading, setIsLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchCollaborators = async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/forms/${formId}/collaborators`);
      if (res.ok) {
        const data = await res.json();
        setOwner(data.owner);
        setCollaborators(data.collaborators || []);
      }
    } catch {
      setError('Failed to load collaborators');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchCollaborators();
      setError('');
      setSuccess('');
    }
  }, [isOpen, formId]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsAdding(true);

    try {
      const res = await fetch(`/api/forms/${formId}/collaborators`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to add collaborator');
      } else {
        setSuccess(`Collaborator added successfully`);
        setEmail('');
        fetchCollaborators();
      }
    } catch {
      setError('Network error');
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemove = async (collaboratorId: string) => {
    try {
      const res = await fetch(`/api/forms/${formId}/collaborators/${collaboratorId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        fetchCollaborators();
      }
    } catch {
      setError('Failed to remove collaborator');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 text-purple-600">
            <Shield className="h-5 w-5" />
            <DialogTitle>Form Collaborators & Permissions</DialogTitle>
          </div>
          <DialogDescription>
            Grant access to team members to edit questions, view responses, or analyze data.
          </DialogDescription>
        </DialogHeader>

        {/* Invite Form */}
        <form onSubmit={handleAdd} className="space-y-3 pt-2">
          {error && (
            <div className="p-2.5 text-xs text-red-600 bg-red-50 dark:bg-red-950/40 rounded-lg flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="p-2.5 text-xs text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 rounded-lg flex items-center gap-2">
              <Check className="h-4 w-4 shrink-0" />
              <span>{success}</span>
            </div>
          )}

          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="colleague@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="text-xs h-9 flex-1"
            />
            <div className="w-28">
              <Select value={role} onValueChange={(v: any) => setRole(v)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EDITOR">Editor</SelectItem>
                  <SelectItem value="VIEWER">Viewer</SelectItem>
                  <SelectItem value="ANALYST">Analyst</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              type="submit"
              size="sm"
              className="h-9 bg-purple-600 hover:bg-purple-700 text-white"
              disabled={isAdding}
            >
              {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            </Button>
          </div>
        </form>

        {/* Collaborators List */}
        <div className="divide-y divide-gray-100 dark:divide-gray-800 mt-4 max-h-60 overflow-y-auto">
          {/* Owner */}
          {owner && (
            <div className="py-2.5 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-full bg-purple-100 text-purple-700 font-bold flex items-center justify-center text-xs">
                  {owner.name?.[0] || owner.email[0].toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">
                    {owner.name || 'Owner'}
                  </p>
                  <p className="text-gray-500 text-[11px]">{owner.email}</p>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                OWNER
              </span>
            </div>
          )}

          {/* Invited Collaborators */}
          {collaborators.map((c) => (
            <div key={c.id} className="py-2.5 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-full bg-gray-100 text-gray-700 font-bold flex items-center justify-center text-xs">
                  {c.user.name?.[0] || c.user.email[0].toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">
                    {c.user.name || 'Collaborator'}
                  </p>
                  <p className="text-gray-500 text-[11px]">{c.user.email}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                  {c.role}
                </span>
                <button
                  onClick={() => handleRemove(c.id)}
                  className="text-gray-400 hover:text-red-600 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
