'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Palette,
  Type,
  Image as ImageIcon,
  Upload,
  Loader2,
  Check,
  RotateCcw,
  Sparkles,
  Sliders,
  Eye,
} from 'lucide-react';
import { uploadFile } from '@/lib/storage/clientUpload';

export interface ThemeConfig {
  primaryColor: string;
  backgroundColor: string;
  cardColor: string;
  fontFamily: string;
  borderRadius: string;
  headerImageUrl?: string | null;
}

interface ThemeDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  theme: ThemeConfig;
  onChange: (updated: Partial<ThemeConfig>) => void;
}

const PRESET_PALETTES = [
  {
    name: 'Corporate Navy',
    hex: '#004B6E',
    bg: '#004B6E',
    desc: 'Deep Navy',
  },
  {
    name: 'Sky Blue',
    hex: '#004B6E',
    bg: '#f0f9ff',
    desc: 'Clean Ice',
  },
  {
    name: 'Royal Indigo',
    hex: '#4f46e5',
    bg: '#eef2ff',
    desc: 'Crisp Indigo',
  },
  {
    name: 'Emerald Mint',
    hex: '#059669',
    bg: '#ecfdf5',
    desc: 'Fresh Mint',
  },
  {
    name: 'Sunset Amber',
    hex: '#d97706',
    bg: '#fffbeb',
    desc: 'Warm Gold',
  },
  {
    name: 'Crimson Rose',
    hex: '#e11d48',
    bg: '#fff1f2',
    desc: 'Vibrant Rose',
  },
  {
    name: 'Modern Slate',
    hex: '#334155',
    bg: '#f8fafc',
    desc: 'Minimal Gray',
  },
  {
    name: 'Midnight Sky',
    hex: '#38bdf8',
    bg: '#0f172a',
    desc: 'Sleek Dark',
  },
];

const QUICK_ACCENTS = [
  '#004B6E',
  '#0284c7',
  '#4f46e5',
  '#059669',
  '#d97706',
  '#e11d48',
  '#7c3aed',
  '#0f172a',
];

const QUICK_BACKGROUNDS = [
  '#004B6E',
  '#ffffff',
  '#f0f9ff',
  '#ecfdf5',
  '#fffbeb',
  '#fff1f2',
  '#f8fafc',
  '#0f172a',
];

const FONTS = [
  { id: 'Inter', name: 'Inter', sample: 'Modern & Balanced' },
  { id: 'Roboto', name: 'Roboto', sample: 'Geometric & Crisp' },
  { id: 'Outfit', name: 'Outfit', sample: 'Friendly & Rounded' },
  { id: 'Plus Jakarta Sans', name: 'Plus Jakarta Sans', sample: 'Contemporary Pro' },
  { id: 'Playfair Display', name: 'Playfair Display', sample: 'Editorial & Elegant' },
];

const RADIUS_OPTIONS = [
  { label: 'Sharp', val: 'rounded-none', preview: 'rounded-none' },
  { label: 'Subtle', val: 'rounded-md', preview: 'rounded-md' },
  { label: 'Medium', val: 'rounded-xl', preview: 'rounded-xl' },
  { label: 'Rounded', val: 'rounded-2xl', preview: 'rounded-2xl' },
  { label: 'Pill', val: 'rounded-3xl', preview: 'rounded-3xl' },
];

const DEFAULT_THEME: ThemeConfig = {
  primaryColor: '#004B6E',
  backgroundColor: '#004B6E',
  cardColor: '#ffffff',
  fontFamily: 'Inter',
  borderRadius: 'rounded-xl',
  headerImageUrl: '/default-banner.jpg',
};

export default function ThemeDrawer({ isOpen, onClose, theme, onChange }: ThemeDrawerProps) {
  const [isUploadingBanner, setIsUploadingBanner] = React.useState(false);
  const [bannerError, setBannerError] = React.useState<string | null>(null);

  const handleBannerUpload = async (file: File) => {
    setIsUploadingBanner(true);
    setBannerError(null);
    try {
      const data = await uploadFile(file);
      if (data?.publicUrl) {
        onChange({ headerImageUrl: data.publicUrl });
      } else {
        setBannerError('Failed to upload banner');
      }
    } catch (err: any) {
      setBannerError(err?.message || 'Failed to upload banner');
    } finally {
      setIsUploadingBanner(false);
    }
  };

  const handleResetDefaults = () => {
    onChange(DEFAULT_THEME);
  };

  const activeBg = theme.backgroundColor || '#004B6E';
  const activePrimary = theme.primaryColor || '#004B6E';
  const activeFont = theme.fontFamily || 'Inter';
  const activeRadius = theme.borderRadius || 'rounded-xl';

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-xl w-[95vw] sm:w-full h-[86vh] max-h-[700px] flex flex-col p-0 overflow-hidden shadow-2xl rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        {/* FIXED / STICKY HEADER */}
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between pr-14 shrink-0 bg-white dark:bg-gray-900 z-10">
          <div className="flex items-center gap-2.5 text-[#004B6E] dark:text-sky-400">
            <div className="h-8 w-8 rounded-lg bg-sky-50 dark:bg-sky-950/60 flex items-center justify-center text-[#004B6E] dark:text-sky-400 shadow-sm border border-sky-100 dark:border-sky-800 shrink-0">
              <Palette className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100 leading-tight">
                Theme &amp; Appearance
              </DialogTitle>
              <DialogDescription className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Customize colors, backdrop, typography, and banner.
              </DialogDescription>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleResetDefaults}
            className="text-xs h-7 px-2.5 gap-1.5 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:text-[#004B6E] hover:border-sky-300 shrink-0"
            title="Reset all settings to default theme"
          >
            <RotateCcw className="h-3 w-3" />
            <span className="hidden sm:inline">Reset Defaults</span>
          </Button>
        </div>

        {/* SCROLLABLE BODY CONTENT */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 custom-scrollbar overscroll-contain">
          {/* SECTION 1: Curated Theme Palettes */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-sky-600" /> Curated Theme Palettes
              </label>
              <span className="text-[11px] text-gray-400">Primary + Page Backdrop</span>
            </div>

            <div
              className="grid grid-cols-2 sm:grid-cols-4 gap-2.5"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(115px, 1fr))',
                gap: '0.625rem',
              }}
            >
              {PRESET_PALETTES.map((preset) => {
                const isSelected =
                  activePrimary.toLowerCase() === preset.hex.toLowerCase() &&
                  activeBg.toLowerCase() === preset.bg.toLowerCase();

                return (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() =>
                      onChange({
                        primaryColor: preset.hex,
                        backgroundColor: preset.bg,
                      })
                    }
                    className={`relative p-2.5 rounded-xl border text-left transition-all group flex flex-col justify-between ${
                      isSelected
                        ? 'border-[#004B6E] ring-2 ring-[#004B6E]/30 bg-sky-50/50 dark:bg-sky-950/30 shadow-sm'
                        : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 bg-white dark:bg-gray-900/60'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-2">
                      {/* Dual-color swatch preview */}
                      <div
                        className="h-6 w-11 rounded-full border border-gray-300/60 dark:border-gray-700 p-0.5 flex items-center shadow-inner"
                        style={{ backgroundColor: preset.bg }}
                      >
                        <span
                          className="h-4 w-4 rounded-full shadow-sm"
                          style={{ backgroundColor: preset.hex }}
                        />
                      </div>
                      {isSelected && (
                        <div className="h-4 w-4 rounded-full bg-[#004B6E] text-white flex items-center justify-center">
                          <Check className="h-3 w-3 stroke-[3]" />
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="text-xs font-bold text-gray-900 dark:text-gray-100">
                        {preset.name}
                      </div>
                      <div className="text-[10px] text-gray-400 dark:text-gray-500">
                        {preset.desc}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* SECTION 2: Custom Accent & Background Color */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1 border-t border-gray-100 dark:border-gray-800">
            {/* Primary Accent Color */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 block">
                Primary Accent Color
              </label>
              <div className="flex items-center gap-1.5 flex-wrap">
                {QUICK_ACCENTS.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => onChange({ primaryColor: hex })}
                    className={`h-6 w-6 rounded-full border transition-transform shadow-sm flex items-center justify-center ${
                      activePrimary.toLowerCase() === hex.toLowerCase()
                        ? 'ring-2 ring-offset-2 ring-[#004B6E] scale-110'
                        : 'border-gray-200 dark:border-gray-700 hover:scale-105'
                    }`}
                    style={{ backgroundColor: hex }}
                    title={hex}
                  >
                    {activePrimary.toLowerCase() === hex.toLowerCase() && (
                      <Check className="h-3 w-3 text-white drop-shadow stroke-[3]" />
                    )}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="color"
                  value={activePrimary}
                  onChange={(e) => onChange({ primaryColor: e.target.value })}
                  className="h-8 w-9 cursor-pointer rounded-lg border border-gray-200 dark:border-gray-700 p-0.5 bg-white shadow-sm"
                />
                <Input
                  type="text"
                  value={activePrimary}
                  onChange={(e) => onChange({ primaryColor: e.target.value })}
                  placeholder="#004B6E"
                  className="h-8 text-xs font-mono w-28 uppercase"
                />
                <span className="text-[11px] text-gray-400">Custom Accent</span>
              </div>
            </div>

            {/* Page Background Color */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 block">
                Page Background Color
              </label>
              <div className="flex items-center gap-1.5 flex-wrap">
                {QUICK_BACKGROUNDS.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => onChange({ backgroundColor: hex })}
                    className={`h-6 w-6 rounded-full border transition-transform shadow-sm flex items-center justify-center ${
                      activeBg.toLowerCase() === hex.toLowerCase()
                        ? 'ring-2 ring-offset-2 ring-[#004B6E] scale-110'
                        : 'border-gray-300 dark:border-gray-700 hover:scale-105'
                    }`}
                    style={{ backgroundColor: hex }}
                    title={hex}
                  >
                    {activeBg.toLowerCase() === hex.toLowerCase() && (
                      <Check
                        className={`h-3 w-3 stroke-[3] ${
                          hex.toLowerCase() === '#ffffff' || hex.toLowerCase() === '#f0f9ff'
                            ? 'text-gray-800'
                            : 'text-white'
                        }`}
                      />
                    )}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="color"
                  value={activeBg}
                  onChange={(e) => onChange({ backgroundColor: e.target.value })}
                  className="h-8 w-9 cursor-pointer rounded-lg border border-gray-200 dark:border-gray-700 p-0.5 bg-white shadow-sm"
                />
                <Input
                  type="text"
                  value={activeBg}
                  onChange={(e) => onChange({ backgroundColor: e.target.value })}
                  placeholder="#004B6E"
                  className="h-8 text-xs font-mono w-28 uppercase"
                />
                <span className="text-[11px] text-gray-400">Custom Backdrop</span>
              </div>
            </div>
          </div>

          {/* SECTION 3: Typography / Font Family */}
          <div className="pt-1 border-t border-gray-100 dark:border-gray-800">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                <Type className="h-3.5 w-3.5 text-sky-600" /> Typography (Font Family)
              </label>
              <span className="text-[11px] text-gray-400">Applies to all questions &amp; text</span>
            </div>

            <div
              className="grid grid-cols-2 sm:grid-cols-3 gap-2"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: '0.5rem',
              }}
            >
              {FONTS.map((font) => {
                const isSelected = activeFont === font.id;
                return (
                  <button
                    key={font.id}
                    type="button"
                    onClick={() => onChange({ fontFamily: font.id })}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      isSelected
                        ? 'border-[#004B6E] bg-sky-50/60 dark:bg-sky-950/30 ring-1 ring-[#004B6E]'
                        : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className="text-sm font-bold text-gray-900 dark:text-gray-100"
                        style={{ fontFamily: font.id }}
                      >
                        {font.name}
                      </span>
                      {isSelected && <Check className="h-3.5 w-3.5 text-[#004B6E] stroke-[3]" />}
                    </div>
                    <span
                      className="text-[11px] text-gray-500 dark:text-gray-400 block truncate"
                      style={{ fontFamily: font.id }}
                    >
                      {font.sample}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* SECTION 4: Corner Radius - FIXED HORIZONTAL ROW */}
          <div className="pt-1 border-t border-gray-100 dark:border-gray-800">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                <Sliders className="h-3.5 w-3.5 text-sky-600" /> Card Corner Radius
              </label>
              <span className="text-[11px] text-gray-400">For cards &amp; containers</span>
            </div>

            {/* Robust horizontal flex row so buttons never collapse vertically */}
            <div className="flex flex-row items-center gap-2 w-full">
              {RADIUS_OPTIONS.map((r) => {
                const isSelected = activeRadius === r.val;
                return (
                  <button
                    key={r.val}
                    type="button"
                    onClick={() => onChange({ borderRadius: r.val })}
                    className={`flex-1 min-w-0 flex flex-col items-center justify-center py-2 px-1 border transition-all ${
                      r.preview
                    } ${
                      isSelected
                        ? 'border-[#004B6E] bg-[#004B6E] text-white shadow-sm ring-2 ring-[#004B6E]/30 font-bold'
                        : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900'
                    }`}
                  >
                    <div
                      className={`h-2.5 w-4 border-2 mb-1 shrink-0 ${
                        isSelected ? 'border-white' : 'border-gray-400'
                      } ${r.preview}`}
                    />
                    <span className="text-[11px] truncate w-full text-center leading-none">
                      {r.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* SECTION 5: Header Banner Image */}
          <div className="space-y-3 pt-1 border-t border-gray-100 dark:border-gray-800">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                <ImageIcon className="h-3.5 w-3.5 text-sky-600" /> Header Banner Image
              </label>
              <span className="text-[11px] text-gray-400">Recommended: 1600 x 400 px</span>
            </div>

            {theme.headerImageUrl ? (
              <div className="relative rounded-xl overflow-hidden border border-gray-200 dark:border-gray-800 group shadow-sm bg-gray-50 dark:bg-gray-900">
                <img
                  src={theme.headerImageUrl}
                  alt="Banner preview"
                  className="w-full h-24 sm:h-28 object-cover"
                />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2.5 transition-opacity">
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      className="sr-only"
                      accept="image/*"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleBannerUpload(f);
                        e.target.value = '';
                      }}
                    />
                    <span className="px-3 py-1.5 bg-white text-gray-800 text-xs font-bold rounded-lg shadow-sm hover:bg-gray-100 flex items-center gap-1.5">
                      <Upload className="h-3.5 w-3.5" /> Change
                    </span>
                  </label>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => onChange({ headerImageUrl: null })}
                    className="h-8 text-xs px-3 font-semibold"
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ) : (
              <label className="border-2 border-dashed border-gray-300 dark:border-gray-700 hover:border-[#004B6E] rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer transition-all bg-gray-50/50 dark:bg-gray-800/20 group">
                <input
                  type="file"
                  className="sr-only"
                  accept="image/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleBannerUpload(f);
                    e.target.value = '';
                  }}
                />
                {isUploadingBanner ? (
                  <div className="flex items-center gap-2 text-[#004B6E] py-2">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span className="text-xs font-semibold">Uploading banner...</span>
                  </div>
                ) : (
                  <>
                    <Upload className="h-5 w-5 text-gray-400 group-hover:scale-110 group-hover:text-[#004B6E] mb-1 transition-all" />
                    <span className="text-xs font-bold text-gray-800 dark:text-gray-200">
                      Upload banner image from computer
                    </span>
                    <span className="text-[11px] text-gray-400 mt-0.5">
                      PNG, JPG, WebP or SVG up to 10MB
                    </span>
                  </>
                )}
              </label>
            )}

            {bannerError && <p className="text-xs text-red-500 font-medium">{bannerError}</p>}

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onChange({ headerImageUrl: '/default-banner.jpg' })}
                className="text-xs h-7 px-2.5 border-sky-300 text-[#004B6E] hover:bg-sky-50 dark:hover:bg-sky-950/40 font-semibold"
              >
                Use Default Banner
              </Button>
              <div className="flex items-center gap-1.5 flex-1 max-w-sm">
                <Input
                  type="url"
                  placeholder="Or paste image URL (https://...)"
                  value={theme.headerImageUrl || ''}
                  onChange={(e) =>
                    onChange({
                      headerImageUrl: e.target.value.trim() ? e.target.value : null,
                    })
                  }
                  className="text-xs h-7 flex-1"
                />
              </div>
            </div>
          </div>

          {/* SECTION 6: Live Interactive Mini-Preview */}
          <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                <Eye className="h-3.5 w-3.5 text-sky-600" /> Live Preview
              </label>
              <span className="text-[11px] text-gray-400 font-mono">
                {activeFont} &bull; {activeRadius}
              </span>
            </div>

            <div
              className="p-3.5 rounded-2xl border border-gray-200 dark:border-gray-800 transition-colors shadow-inner space-y-2.5"
              style={{
                backgroundColor: activeBg,
                fontFamily: activeFont,
              }}
            >
              {/* Mini card */}
              <div
                className={`bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 overflow-hidden shadow-md ${activeRadius}`}
              >
                {theme.headerImageUrl ? (
                  <img
                    src={theme.headerImageUrl}
                    alt="Preview"
                    className="w-full h-10 object-cover border-b border-gray-100 dark:border-gray-800"
                  />
                ) : (
                  <div
                    className="h-1.5 w-full"
                    style={{ backgroundColor: activePrimary }}
                  />
                )}
                <div className="p-3 space-y-1.5">
                  <div className="text-xs sm:text-sm font-extrabold text-gray-900 dark:text-gray-100">
                    FormCraft Form Title
                  </div>
                  <div className="text-[10px] sm:text-[11px] text-gray-500 dark:text-gray-400">
                    Sample question description in selected theme typography.
                  </div>

                  <div className="pt-1.5 flex items-center justify-between">
                    <span className="text-[10px] text-gray-400">1 of 3 questions</span>
                    <button
                      type="button"
                      className={`px-3 py-1 text-xs font-bold text-white shadow-sm transition-transform ${activeRadius}`}
                      style={{ backgroundColor: activePrimary }}
                    >
                      Submit
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* FIXED / STICKY FOOTER */}
        <div className="px-6 py-3.5 border-t border-gray-100 dark:border-gray-800 bg-gray-50/90 dark:bg-gray-900/90 backdrop-blur-sm flex items-center justify-between shrink-0 z-10">
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <span
              className="h-2.5 w-2.5 rounded-full shrink-0 shadow-sm"
              style={{ backgroundColor: activePrimary }}
            />
            <span className="font-medium text-gray-700 dark:text-gray-300 truncate max-w-[140px] sm:max-w-none">
              {activeFont} &bull;{' '}
              {RADIUS_OPTIONS.find((r) => r.val === activeRadius)?.label || activeRadius}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-xs h-8 text-gray-500 hover:text-gray-700"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={onClose}
              className="bg-[#004B6E] hover:bg-[#003852] text-white text-xs h-8 px-5 font-bold shadow-md shadow-[#004B6E]/20 flex items-center gap-1.5"
            >
              <Check className="h-3.5 w-3.5 stroke-[2.5]" />
              Apply Theme
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
