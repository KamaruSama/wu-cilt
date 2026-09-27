import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { withApiLogging } from '@/lib/api-logger';
import { getCiltSession, updateCiltSession } from '@/lib/cilt-session';
import { logError } from '@/lib/logger';

function parseTeacherTypeLinks(html: string) {
  const links = new Set<string>();
  const pattern = /location\.href\s*=\s*['"]([^'"]*\/stdapp\/select-teacher-type\?[^'"]+)['"]/gi;
  for (const match of html.matchAll(pattern)) links.add(match[1]);
  return [...links];
}

function hasQuestionMarkup(html: string) {
  return /getOfficer\(\s*\d+\s*\)/.test(html) && /sendOut\(\)/.test(html);
}

async function followRedirects(url: string, cookies: string, maxRedirects = 5) {
  let currentUrl = url;
  let redirectCount = 0;
  const cookiesObj: Record<string, string> = {};

  cookies.split('; ').forEach((cookie: string) => {
    const [key, value] = cookie.split('=');
    if (key && value) cookiesObj[key] = value;
  });

  while (redirectCount < maxRedirects) {
    const response = await fetch(currentUrl, {
      method: 'GET',
      headers: {
        'Cookie': Object.entries(cookiesObj).map(([k, v]) => `${k}=${v}`).join('; '),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      redirect: 'manual',
    });

    const newCookies = response.headers.getSetCookie();
    newCookies.forEach((cookie: string) => {
      const [keyVal] = cookie.split(';');
      const [key, value] = keyVal.split('=');
      if (key && value && value !== 'deleted') {
        cookiesObj[key] = value;
      }
    });

    if (response.status === 200) {
      return { response, cookies: cookiesObj, url: currentUrl };
    }

    if (response.status === 301 || response.status === 302 || response.status === 307) {
      const location = response.headers.get('location');
      if (!location) return { response, cookies: cookiesObj, url: currentUrl };
      const nextUrl = new URL(location, 'https://ciltapp.wu.ac.th');
      if (nextUrl.hostname !== 'ciltapp.wu.ac.th' || !['http:', 'https:'].includes(nextUrl.protocol)) throw new Error('CILT redirected to an untrusted origin');
      nextUrl.protocol = 'https:';
      currentUrl = nextUrl.toString();
      redirectCount++;
    } else {
      return { response, cookies: cookiesObj, url: currentUrl };
    }
  }

  throw new Error('Too many redirects');
}

async function handlePost(request: NextRequest) {
  try {
    const { courseKey } = await request.json();
    const session = await getCiltSession(request);

    if (!session || !Number.isInteger(courseKey) || courseKey < 0) {
      return NextResponse.json(
        { success: false, error: 'Session หมดอายุหรือข้อมูลรายวิชาไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่' },
        { status: 401 }
      );
    }

    // Select the course first
    const { response: courseResponse, cookies: cookies2 } = await followRedirects(
      `https://ciltapp.wu.ac.th/stdapp/select-course?key=${courseKey}`,
      session.cookies
    );

    const updatedCookies = Object.entries(cookies2).map(([k, v]) => `${k}=${v}`).join('; ');

    // CILT only exposes all-officer after the course form is completed and a
    // real teacher type (select-teacher-type token) has been selected.
    for (const [key, value] of [[1, 6], [2, 6], [3, 11], [4, 15], [5, 19], [6, '-']]) {
      const response = await fetch(`https://ciltapp.wu.ac.th/stdapp/select-register-type?key=${key}&param=${encodeURIComponent(String(value))}`, {
        headers: { Cookie: updatedCookies, 'User-Agent': 'Mozilla/5.0' },
      });
      if (!response.ok) throw new Error(`CILT rejected register type ${key}`);
    }
    const platformResponse = await fetch('https://ciltapp.wu.ac.th/stdapp/check-platform?key=1', {
      headers: { Cookie: updatedCookies, 'User-Agent': 'Mozilla/5.0' },
    });
    if (!platformResponse.ok) throw new Error('CILT rejected platform selection');

    const { response: validationResponse, cookies: cookies3 } = await followRedirects(
      'https://ciltapp.wu.ac.th/stdapp/validate-course-info',
      updatedCookies,
    );
    let currentHtml = await validationResponse.text();
    const questionCookies = Object.entries(cookies3).map(([k, v]) => `${k}=${v}`).join('; ');
    const teacherTypeLinks = parseTeacherTypeLinks(currentHtml);
    let questionHtml = hasQuestionMarkup(currentHtml) ? currentHtml : '';
    for (const relativeUrl of teacherTypeLinks) {
      const teacherTypeUrl = new URL(relativeUrl, 'https://ciltapp.wu.ac.th');
      if (teacherTypeUrl.hostname !== 'ciltapp.wu.ac.th' || !['http:', 'https:'].includes(teacherTypeUrl.protocol)) throw new Error('CILT teacher type URL has an untrusted origin');
      teacherTypeUrl.protocol = 'https:';
      const response = await fetch(teacherTypeUrl, {
        headers: { Cookie: questionCookies, 'User-Agent': 'Mozilla/5.0' },
        redirect: 'follow',
      });
      const candidateHtml = await response.text();
      if (response.ok && hasQuestionMarkup(candidateHtml)) {
        questionHtml = candidateHtml;
        break;
      }
    }
    if (!questionHtml) throw new Error('CILT has no teacher type with available questions');

    // Fetch the first question's officer page to get teachers
    const officerResponse = await fetch('https://ciltapp.wu.ac.th/stdapp/all-officer?key=1', {
      method: 'GET',
      headers: {
        'Cookie': questionCookies,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    const officerHtml = await officerResponse.text();
    if (!officerResponse.ok) throw new Error(`CILT teacher list failed (HTTP ${officerResponse.status})`);
    const $ = cheerio.load(officerHtml);

    // Extract teachers from the HTML
    // Looking for patterns like: onclick="selectOpt(11, 123)" where 123 is teacherId
    // And the teacher name is nearby
    const teachers: { id: string; name: string }[] = [];
    const seenIds = new Set<string>();

    // Find all elements with selectOpt onclick handlers
    $('[onclick*="selectOpt"]').each((_, el) => {
      const onclick = $(el).attr('onclick') || '';
      const match = onclick.match(/selectOpt\(\d+,\s*(\d+)\)/);
      if (match) {
        const teacherId = match[1];
        if (!seenIds.has(teacherId)) {
          seenIds.add(teacherId);

          // Try to find teacher name - look for nearby text or parent elements
          const row = $(el).closest('tr, .row, div');
          let teacherName = '';

          // Try different selectors to find the name
          const nameEl = row.find('.officer-name, .name, td:first-child, span:first-child').first();
          if (nameEl.length) {
            teacherName = nameEl.text().trim();
          }

          // If still no name, try to get text from the row
          if (!teacherName) {
            teacherName = row.text().trim().split('\n')[0].trim();
          }

          // Clean up the name
          teacherName = teacherName.replace(/\s+/g, ' ').trim();
          if (teacherName.length > 100) {
            teacherName = teacherName.substring(0, 100);
          }

          teachers.push({
            id: teacherId,
            name: teacherName || `อาจารย์ ${teacherId}`,
          });
        }
      }
    });

    // If cheerio parsing didn't work, try regex fallback
    if (teachers.length === 0) {
      const optMatches = officerHtml.matchAll(/selectOpt\(\d+,\s*(\d+)\)/g);
      for (const match of optMatches) {
        const teacherId = match[1];
        if (!seenIds.has(teacherId)) {
          seenIds.add(teacherId);
          teachers.push({
            id: teacherId,
            name: `อาจารย์ ${teacherId}`,
          });
        }
      }
    }

    await updateCiltSession(session.id, updatedCookies);
    return NextResponse.json({
      success: true,
      teachers,
    });

  } catch (error) {
    const errorId = logError('get-teachers.failed', error);
    return NextResponse.json(
      {
        success: false,
        error: 'ไม่สามารถดึงรายชื่อผู้สอนได้',
        errorId,
      },
      { status: 500 }
    );
  }
}

export const POST = withApiLogging('get-teachers', handlePost);
