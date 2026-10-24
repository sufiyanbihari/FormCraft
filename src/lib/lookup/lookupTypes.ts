import { z } from 'zod';

export type LookupType = 'DROPDOWN' | 'TEXT_KEY';

export interface FieldMapping {
  column: string;
  targetQuestionId: string;
  isReadOnly: boolean;
}

export interface LookupMappingConfig {
  id?: string;
  formId: string;
  datasetId: string;
  triggerQuestionId: string;
  lookupType: LookupType;
  keyColumn: string;
  noMatchMessage?: string;
  mappings: FieldMapping[];
}

export interface ParsedSpreadsheet {
  fileName: string;
  fileSize: number;
  rowCount: number;
  columns: string[];
  rows: Record<string, any>[];
  sampleRows: Record<string, any>[];
}

export interface LookupDatasetSummary {
  id: string;
  formId: string;
  fileName: string;
  fileSize: number;
  rowCount: number;
  columns: string[];
  version: number;
  isActive: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
  sampleRows?: Record<string, any>[];
  mappingsCount?: number;
}

export const FieldMappingSchema = z.object({
  column: z.string().min(1, 'Spreadsheet column is required'),
  targetQuestionId: z.string().min(1, 'Target form question is required'),
  isReadOnly: z.boolean().default(false),
});

export const LookupMappingSchema = z.object({
  id: z.string().optional(),
  datasetId: z.string().min(1, 'Dataset ID is required'),
  triggerQuestionId: z.string().min(1, 'Trigger question ID is required'),
  lookupType: z.enum(['DROPDOWN', 'TEXT_KEY']).default('DROPDOWN'),
  keyColumn: z.string().min(1, 'Key column is required'),
  noMatchMessage: z.string().optional().default('No matching record found.'),
  mappings: z.array(FieldMappingSchema).min(1, 'At least one field mapping is required'),
});

export const LookupMappingListSchema = z.array(LookupMappingSchema);
