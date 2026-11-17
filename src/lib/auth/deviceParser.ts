/**
 * Device, Browser, and OS parser for FormCraft session tracking and audit logs.
 */

export interface ClientDeviceInfo {
  ipAddress: string;
  userAgent: string;
  deviceType: 'Desktop' | 'Laptop' | 'Mobile' | 'Tablet';
  browser: string;
  os: string;
}

export function parseClientInfo(req?: Request | null): ClientDeviceInfo {
  if (!req) {
    return {
      ipAddress: '127.0.0.1',
      userAgent: 'Direct / System',
      deviceType: 'Desktop',
      browser: 'System',
      os: 'Server',
    };
  }

  const headers = req.headers;
  const forwarded = headers.get('x-forwarded-for');
  const realIp = headers.get('x-real-ip');
  let ip = (forwarded ? forwarded.split(',')[0].trim() : realIp) || '127.0.0.1';
  if (ip === '::1' || ip === '::ffff:127.0.0.1') {
    ip = '127.0.0.1';
  }

  const ua = headers.get('user-agent') || 'Unknown Device';

  // 1. Device Type
  let deviceType: 'Desktop' | 'Laptop' | 'Mobile' | 'Tablet' = 'Desktop';
  const uaLower = ua.toLowerCase();

  if (/ipad|tablet|(android(?!.*mobile))/i.test(ua)) {
    deviceType = 'Tablet';
  } else if (/mobile|iphone|ipod|android.*mobile|blackberry|iemobile|opera mini/i.test(ua)) {
    deviceType = 'Mobile';
  } else {
    // Distinguish Laptop vs Desktop where possible (MacBook, laptop hints) or default Desktop/Laptop
    if (/macintosh|mac os x/i.test(ua) && !/ipad|iphone/i.test(ua)) {
      deviceType = 'Laptop';
    } else if (/windows nt/i.test(ua)) {
      deviceType = 'Desktop';
    } else {
      deviceType = 'Desktop';
    }
  }

  // 2. Browser detection
  let browser = 'Unknown Browser';
  const edgeMatch = ua.match(/edg(?:e|a|ios)?\/(\d+(\.\d+)?)/i);
  const chromeMatch = ua.match(/chrome\/(\d+(\.\d+)?)/i);
  const firefoxMatch = ua.match(/firefox\/(\d+(\.\d+)?)/i);
  const safariMatch = ua.match(/version\/(\d+(\.\d+)?).*safari/i);
  const operaMatch = ua.match(/(?:opera|opr)\/(\d+(\.\d+)?)/i);

  if (edgeMatch) {
    browser = `Edge ${edgeMatch[1].split('.')[0]}`;
  } else if (operaMatch) {
    browser = `Opera ${operaMatch[1].split('.')[0]}`;
  } else if (chromeMatch) {
    browser = `Chrome ${chromeMatch[1].split('.')[0]}`;
  } else if (firefoxMatch) {
    browser = `Firefox ${firefoxMatch[1].split('.')[0]}`;
  } else if (safariMatch) {
    browser = `Safari ${safariMatch[1].split('.')[0]}`;
  } else if (/curl/i.test(ua)) {
    browser = 'cURL';
  } else if (/postman/i.test(ua)) {
    browser = 'Postman';
  }

  // 3. Operating System detection
  let os = 'Unknown OS';
  if (/windows nt 10\.0/i.test(ua)) {
    os = 'Windows 10/11';
  } else if (/windows nt 6\.3/i.test(ua)) {
    os = 'Windows 8.1';
  } else if (/windows nt 6\.1/i.test(ua)) {
    os = 'Windows 7';
  } else if (/macintosh|mac os x/i.test(ua)) {
    const macMatch = ua.match(/mac os x (\d+[._\d]+)/i);
    os = macMatch ? `macOS ${macMatch[1].replace(/_/g, '.')}` : 'macOS';
  } else if (/android/i.test(ua)) {
    const androidMatch = ua.match(/android (\d+(\.\d+)?)/i);
    os = androidMatch ? `Android ${androidMatch[1]}` : 'Android';
  } else if (/iphone|ipad|ipod/i.test(ua)) {
    const iosMatch = ua.match(/os (\d+[._\d]+)/i);
    os = iosMatch ? `iOS ${iosMatch[1].replace(/_/g, '.')}` : 'iOS';
  } else if (/linux/i.test(ua)) {
    os = 'Linux';
  } else if (/crkey/i.test(ua)) {
    os = 'ChromeOS';
  }

  return {
    ipAddress: ip,
    userAgent: ua,
    deviceType,
    browser,
    os,
  };
}
