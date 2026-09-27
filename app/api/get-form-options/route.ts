import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { withApiLogging } from '@/lib/api-logger';
import { logError } from '@/lib/logger';

async function handlePost(request: NextRequest) {
  try {
    const { cookies, courseIndex } = await request.json();

    if (!cookies || courseIndex === undefined) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Helper function to follow redirects
    async function followRedirects(url: string, cookieStr: string, maxRedirects = 5) {
      let currentUrl = url;
      let redirectCount = 0;
      const cookiesObj: { [key: string]: string } = {};

      cookieStr.split('; ').forEach(cookie => {
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
        newCookies.forEach(cookie => {
          const [key, value] = cookie.split(';')[0].split('=');
          if (key && value && value !== 'deleted') {
            cookiesObj[key] = value;
          }
        });

        if (response.status === 200) {
          return { response, cookies: cookiesObj };
        }

        if (response.status === 301 || response.status === 302 || response.status === 307) {
          const location = response.headers.get('location');
          if (!location) return { response, cookies: cookiesObj };
          currentUrl = location.startsWith('http')
            ? location
            : `https://ciltapp.wu.ac.th${location}`;
          redirectCount++;
        } else {
          return { response, cookies: cookiesObj };
        }
      }

      throw new Error('Too many redirects');
    }

    // Step 1: Select course
    const { response: courseResponse } = await followRedirects(
      `https://ciltapp.wu.ac.th/stdapp/select-course?key=${courseIndex}`,
      cookies
    );

    const html = await courseResponse.text();
    if (!courseResponse.ok) {
      throw new Error(`CILT course form failed (HTTP ${courseResponse.status})`);
    }
    const $ = cheerio.load(html);

    console.log('🔍 Form markup received:', courseResponse.status);

    // Parse form options from HTML
    // Format: <select name="RegisterType[type1]">...<option value="1">Label</option>...</select>

    const formOptions: any = {
      attendance: [],
      studyHours: [],
      listening: [],
      speaking: [],
      englishUsage: [],
      platform: []
    };

    // Helper function to parse radio buttons
    function parseRadio(radioName: string, keyId: number) {
      const options: { id: number; label: string }[] = [];
      $(`input[type="radio"][name="${radioName}"]`).each((_, element) => {
        const onclick = $(element).attr('onclick') || '';
        const match = onclick.match(new RegExp(`chkRegiserType\\(${keyId},\\s*(\\d+)\\)`));
        if (!match) return;
        const id = Number($(element).attr('value'));
        const inputId = $(element).attr('id');
        const label = inputId ? $(`label[for="${inputId}"]`).text().trim() : '';
        if (Number.isFinite(id)) options.push({ id, label });
      });
      return options;
    }

    // Parse each field (using radio buttons)
    formOptions.attendance = parseRadio('rg1', 1);
    formOptions.listening = parseRadio('rg3', 3);
    formOptions.speaking = parseRadio('rg4', 4);
    formOptions.englishUsage = parseRadio('rg5', 5);

    // Study hours is a number input - create simple options
    formOptions.studyHours = [
      { id: 0, label: '0 ชม.' },
      { id: 1, label: '1 ชม.' },
      { id: 2, label: '2 ชม.' },
      { id: 3, label: '3 ชม.' },
      { id: 4, label: '4 ชม.' },
      { id: 5, label: '5 ชม.' },
      { id: 6, label: '6 ชม.' },
      { id: 7, label: '7 ชม.' },
      { id: 8, label: '8 ชม.' },
      { id: 9, label: '9+ ชม.' },
    ];

    // Platform - parse checkboxes
    formOptions.platform = [];
    $('input[type="checkbox"][id^="plt"]').each((_, element) => {
      const match = ($(element).attr('id') || '').match(/^plt(\d+)$/);
      if (!match) return;
      const inputId = $(element).attr('id') || '';
      formOptions.platform.push({
        id: Number(match[1]),
        label: $(`label[for="${inputId}"]`).text().trim(),
      });
    });

    console.log('📋 Form options loaded:', { // DEBUG_LOG - ลบก่อน production
      attendance: formOptions.attendance.length,
      studyHours: formOptions.studyHours.length,
      listening: formOptions.listening.length,
      speaking: formOptions.speaking.length,
      englishUsage: formOptions.englishUsage.length,
      platform: formOptions.platform.length,
    });

    return NextResponse.json({
      success: true,
      data: formOptions
    });

  } catch (error) {
    const errorId = logError('get-form-options.failed', error);
    return NextResponse.json(
      {
        success: false,
        error: 'ไม่สามารถดึงตัวเลือกแบบฟอร์มได้',
        errorId
      },
      { status: 500 }
    );
  }
}

export const POST = withApiLogging('get-form-options', handlePost);
