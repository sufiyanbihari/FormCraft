import * as XLSX from 'xlsx';

export interface ParsedOption {
  key: string; // e.g. "A", "B", "C", "D"
  label: string;
  value: string;
  isCorrect: boolean;
}

export interface ParsedQuestion {
  rowIndex: number; // 1-based row index in worksheet (data row)
  title: string;
  type: 'MULTIPLE_CHOICE';
  options: ParsedOption[];
  correctAnswerKey?: string; // "A", "B", etc.
  correctAnswerText?: string;
  marks: number;
  isValid: boolean;
  errors: string[];
}

export interface ParseExcelResult {
  sheetNames: string[];
  activeSheet: string;
  totalQuestions: number;
  validQuestions: number;
  invalidQuestions: number;
  totalMarks: number;
  questions: ParsedQuestion[];
  errors: string[];
}

const MAX_ROWS = 500;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

/**
 * Normalizes header string for robust matching
 */
function normalizeHeader(header: string): string {
  return String(header || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Parses an Excel or CSV buffer into structured FormCraft questions
 */
export function parseExcelQuestions(
  fileBuffer: Buffer,
  options?: { sheetName?: string }
): ParseExcelResult {
  if (!fileBuffer || fileBuffer.length === 0) {
    return {
      sheetNames: [],
      activeSheet: '',
      totalQuestions: 0,
      validQuestions: 0,
      invalidQuestions: 0,
      totalMarks: 0,
      questions: [],
      errors: ['Uploaded file is empty.'],
    };
  }

  if (fileBuffer.length > MAX_FILE_SIZE_BYTES) {
    return {
      sheetNames: [],
      activeSheet: '',
      totalQuestions: 0,
      validQuestions: 0,
      invalidQuestions: 0,
      totalMarks: 0,
      questions: [],
      errors: ['File size exceeds maximum allowed limit of 10MB.'],
    };
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(fileBuffer, {
      type: 'buffer',
      cellFormula: false, // Security: do NOT execute or evaluate spreadsheet formulas
      cellHTML: false,
      raw: false, // Formats values as strings to avoid numeric distortion
    });
  } catch (err: any) {
    return {
      sheetNames: [],
      activeSheet: '',
      totalQuestions: 0,
      validQuestions: 0,
      invalidQuestions: 0,
      totalMarks: 0,
      questions: [],
      errors: [`Unable to parse spreadsheet file: ${err?.message || 'Unsupported or corrupt format'}`],
    };
  }

  const sheetNames = workbook.SheetNames || [];
  if (sheetNames.length === 0) {
    return {
      sheetNames: [],
      activeSheet: '',
      totalQuestions: 0,
      validQuestions: 0,
      invalidQuestions: 0,
      totalMarks: 0,
      questions: [],
      errors: ['Spreadsheet contains no worksheets.'],
    };
  }

  // Determine active sheet:
  // 1. Specified sheet if valid
  // 2. First sheet containing "question" or "quiz" or options in header
  // 3. Fallback to first sheet
  let activeSheet = sheetNames[0];
  if (options?.sheetName && sheetNames.includes(options.sheetName)) {
    activeSheet = options.sheetName;
  } else {
    for (const name of sheetNames) {
      const ws = workbook.Sheets[name];
      if (!ws) continue;
      const rawRows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
      if (rawRows.length > 0) {
        const headerRow = rawRows[0].map((h) => normalizeHeader(String(h)));
        if (
          headerRow.some((h) => h.includes('question')) ||
          headerRow.some((h) => h.includes('optiona')) ||
          name.toLowerCase().includes('quiz')
        ) {
          activeSheet = name;
          break;
        }
      }
    }
  }

  const worksheet = workbook.Sheets[activeSheet];
  if (!worksheet) {
    return {
      sheetNames,
      activeSheet,
      totalQuestions: 0,
      validQuestions: 0,
      invalidQuestions: 0,
      totalMarks: 0,
      questions: [],
      errors: [`Worksheet "${activeSheet}" not found.`],
    };
  }

  const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
    blankrows: false,
  });

  if (rawRows.length === 0) {
    return {
      sheetNames,
      activeSheet,
      totalQuestions: 0,
      validQuestions: 0,
      invalidQuestions: 0,
      totalMarks: 0,
      questions: [],
      errors: [`Worksheet "${activeSheet}" is empty.`],
    };
  }

  // Locate the header row (first row with at least 2 non-empty cells)
  let headerRowIndex = -1;
  for (let r = 0; r < Math.min(rawRows.length, 10); r++) {
    const row = rawRows[r];
    const nonEmpty = row.filter((c) => String(c).trim().length > 0);
    if (nonEmpty.length >= 3) {
      headerRowIndex = r;
      break;
    }
  }

  if (headerRowIndex === -1) {
    return {
      sheetNames,
      activeSheet,
      totalQuestions: 0,
      validQuestions: 0,
      invalidQuestions: 0,
      totalMarks: 0,
      questions: [],
      errors: ['Could not detect a valid question header row in the worksheet.'],
    };
  }

  const rawHeaderRow = rawRows[headerRowIndex].map((h) => String(h || '').trim());

  // Check for duplicate headers
  const seenHeaders = new Set<string>();
  const duplicateHeaders: string[] = [];
  for (const h of rawHeaderRow) {
    const norm = normalizeHeader(h);
    if (!norm) continue;
    if (seenHeaders.has(norm)) {
      duplicateHeaders.push(h);
    }
    seenHeaders.add(norm);
  }

  if (duplicateHeaders.length > 0) {
    return {
      sheetNames,
      activeSheet,
      totalQuestions: 0,
      validQuestions: 0,
      invalidQuestions: 0,
      totalMarks: 0,
      questions: [],
      errors: [`Duplicate columns detected: ${duplicateHeaders.join(', ')}. Each column header must be unique.`],
    };
  }

  // Column mapping
  let questionColIdx = -1;
  let correctColIdx = -1;
  let marksColIdx = -1;
  const optionColIndices: { key: string; index: number; label: string }[] = [];

  rawHeaderRow.forEach((h, idx) => {
    const norm = normalizeHeader(h);
    if (norm === 'questiontext' || norm === 'question' || norm === 'questions') {
      questionColIdx = idx;
    } else if (norm === 'correctanswer' || norm === 'answer' || norm === 'correct' || norm === 'answerkey') {
      correctColIdx = idx;
    } else if (norm === 'marks' || norm === 'points' || norm === 'score' || norm === 'mark') {
      marksColIdx = idx;
    } else if (norm.startsWith('option')) {
      const suffix = norm.replace('option', '').toUpperCase(); // e.g. "A", "B", "1", "2"
      optionColIndices.push({
        key: suffix || String(optionColIndices.length + 1),
        index: idx,
        label: h,
      });
    }
  });

  if (questionColIdx === -1) {
    return {
      sheetNames,
      activeSheet,
      totalQuestions: 0,
      validQuestions: 0,
      invalidQuestions: 0,
      totalMarks: 0,
      questions: [],
      errors: ['Missing required column: "Question Text" (or "Question").'],
    };
  }

  if (optionColIndices.length < 2) {
    return {
      sheetNames,
      activeSheet,
      totalQuestions: 0,
      validQuestions: 0,
      invalidQuestions: 0,
      totalMarks: 0,
      questions: [],
      errors: ['The spreadsheet must define at least two option columns (e.g. "Option A", "Option B").'],
    };
  }

  // Sort option columns by column index
  optionColIndices.sort((a, b) => a.index - b.index);

  // Parse questions
  const parsedQuestions: ParsedQuestion[] = [];
  const dataRows = rawRows.slice(headerRowIndex + 1);

  for (let r = 0; r < dataRows.length; r++) {
    if (parsedQuestions.length >= MAX_ROWS) {
      break;
    }

    const row = dataRows[r];
    // Check if entire row is empty
    const hasAnyContent = row.some((c) => String(c || '').trim().length > 0);
    if (!hasAnyContent) {
      continue; // Skip blank rows
    }

    const rowNumber = headerRowIndex + 2 + r;
    const errors: string[] = [];

    // 1. Question Text
    const rawQuestionText = String(row[questionColIdx] || '').trim();
    if (!rawQuestionText) {
      errors.push('Question text cannot be empty.');
    }

    // 2. Options
    const options: ParsedOption[] = [];
    for (const optCol of optionColIndices) {
      const val = String(row[optCol.index] || '').trim();
      if (val.length > 0) {
        options.push({
          key: optCol.key, // "A", "B", "C", "D"
          label: val,
          value: val,
          isCorrect: false,
        });
      }
    }

    if (options.length < 2) {
      errors.push(`Multiple-choice question requires at least 2 non-empty options (found ${options.length}).`);
    }

    // 3. Correct Answer
    let rawCorrect = correctColIdx !== -1 ? String(row[correctColIdx] || '').trim() : '';
    let matchedOption: ParsedOption | undefined;

    if (!rawCorrect) {
      errors.push('Correct answer is required.');
    } else {
      // Clean up answer string: e.g. "Option B" -> "B", "B." -> "B"
      let cleanKey = rawCorrect.toUpperCase();
      if (cleanKey.startsWith('OPTION')) {
        cleanKey = cleanKey.replace('OPTION', '').trim();
      }
      cleanKey = cleanKey.replace(/[^A-Z0-9]/g, '');

      // 3a. Try matching by option key ("A", "B", "C", "D")
      matchedOption = options.find((o) => o.key.toUpperCase() === cleanKey);

      // 3b. Try matching by 1-based index (e.g. "1" -> first option, "2" -> second option)
      if (!matchedOption && /^\d+$/.test(cleanKey)) {
        const idx = parseInt(cleanKey, 10) - 1;
        if (idx >= 0 && idx < options.length) {
          matchedOption = options[idx];
        }
      }

      // 3c. Try matching by exact option text
      if (!matchedOption) {
        matchedOption = options.find(
          (o) => o.label.trim().toLowerCase() === rawCorrect.toLowerCase()
        );
      }

      if (matchedOption) {
        matchedOption.isCorrect = true;
      } else {
        const availableKeys = options.map((o) => o.key).join(', ');
        errors.push(
          `Correct answer "${rawCorrect}" does not match any valid option (${availableKeys || 'none'}).`
        );
      }
    }

    // 4. Marks / Points
    let marks = 1;
    if (marksColIdx !== -1) {
      const rawMarks = String(row[marksColIdx] || '').trim();
      if (rawMarks.length > 0) {
        const parsedMarks = Number(rawMarks);
        if (isNaN(parsedMarks) || parsedMarks < 0) {
          errors.push(`Marks "${rawMarks}" must be a valid non-negative number.`);
        } else {
          marks = Math.round(parsedMarks * 100) / 100; // Keep up to 2 decimal places if fractional
        }
      }
    }

    const isValid = errors.length === 0;

    parsedQuestions.push({
      rowIndex: rowNumber,
      title: rawQuestionText,
      type: 'MULTIPLE_CHOICE',
      options,
      correctAnswerKey: matchedOption?.key,
      correctAnswerText: matchedOption?.label,
      marks,
      isValid,
      errors,
    });
  }

  const validQuestions = parsedQuestions.filter((q) => q.isValid).length;
  const invalidQuestions = parsedQuestions.filter((q) => !q.isValid).length;
  const totalMarks = parsedQuestions
    .filter((q) => q.isValid)
    .reduce((sum, q) => sum + (q.marks || 0), 0);

  return {
    sheetNames,
    activeSheet,
    totalQuestions: parsedQuestions.length,
    validQuestions,
    invalidQuestions,
    totalMarks,
    questions: parsedQuestions,
    errors: parsedQuestions.length === 0 ? ['No questions found in worksheet.'] : [],
  };
}

/**
 * Standard 7 headers matching sample_format.xlsx
 */
export const QUIZ_TEMPLATE_HEADERS = [
  'Question Text',
  'Option A',
  'Option B',
  'Option C',
  'Option D',
  'Correct Answer',
  'Marks',
] as const;

/**
 * Generates a blank Excel workbook buffer with the 7 reference headers
 * on worksheet "Quiz Template".
 */
export function generateQuizTemplateBuffer(): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([[...QUIZ_TEMPLATE_HEADERS]]);

  // Set friendly column widths for comfortable editing in Excel
  ws['!cols'] = [
    { wch: 45 }, // Question Text
    { wch: 25 }, // Option A
    { wch: 25 }, // Option B
    { wch: 25 }, // Option C
    { wch: 25 }, // Option D
    { wch: 16 }, // Correct Answer
    { wch: 10 }, // Marks
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Quiz Template');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

