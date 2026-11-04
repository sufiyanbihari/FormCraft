/**
 * FormCraft - Cattle Owner Helper Utilities
 * Helpers for matching question titles to Registered Cattle Owner fields
 * and extracting typed owner values consistently across Individual and Summary views.
 */

export type CattleOwnerField =
  | 'ownerName'
  | 'ownerMobile'
  | 'largeCattleCount'
  | 'smallCattleCount'
  | 'flooringType'
  | 'supplyDung';

export const isOwnerNameQ = (q: any): boolean => {
  if (!q?.title) return false;
  return (
    q.title.includes('Cattle Owner Full Name') ||
    q.title.includes('પશુ માલિકનું પૂરું નામ') ||
    (q.title.includes('Cattle Owner') && !q.title.includes('Mobile'))
  );
};

export const isOwnerMobileQ = (q: any): boolean => {
  if (!q?.title) return false;
  return (
    (q.title.includes('Owner Mobile') || q.title.includes('માલિકનો મોબાઇલ')) &&
    !q.title.includes('Surveyor')
  );
};

export const isLargeCattleQ = (q: any): boolean => {
  if (!q?.title) return false;
  return q.title.includes('Large Cattle') || q.title.includes('મોટા પશુ');
};

export const isSmallCattleQ = (q: any): boolean => {
  if (!q?.title) return false;
  return q.title.includes('Small Cattle') || q.title.includes('નાના પશુ');
};

export const isFlooringQ = (q: any): boolean => {
  if (!q?.title) return false;
  return q.title.includes('Flooring') || q.title.includes('ભોંયતળિયું');
};

export const isSupplyDungQ = (q: any): boolean => {
  if (!q?.title) return false;
  return q.title.includes('Supply Dung') || q.title.includes('છાણ આપવા');
};

/**
 * Returns the matching CattleOwnerEntry field name if the question corresponds to an owner-level field,
 * or null if it is a general/ordinary question.
 */
export function getCattleOwnerFieldForQuestion(q: any): CattleOwnerField | null {
  if (!q?.title) return null;
  if (isOwnerNameQ(q)) return 'ownerName';
  if (isOwnerMobileQ(q)) return 'ownerMobile';
  if (isLargeCattleQ(q)) return 'largeCattleCount';
  if (isSmallCattleQ(q)) return 'smallCattleCount';
  if (isFlooringQ(q)) return 'flooringType';
  if (isSupplyDungQ(q)) return 'supplyDung';
  return null;
}

/**
 * Safely extracts the value of an owner field with appropriate fallbacks.
 */
export function getOwnerFieldValue(owner: any, field: CattleOwnerField): any {
  if (!owner) return null;
  const val = owner[field];
  if (field === 'largeCattleCount' || field === 'smallCattleCount') {
    if (val === undefined || val === null || val === '') return 0;
    const num = Number(val);
    return isNaN(num) ? 0 : Math.max(0, Math.floor(num));
  }
  if (val === undefined || val === null) return '';
  return String(val).trim();
}

