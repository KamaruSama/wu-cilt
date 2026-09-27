import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { withApiLogging } from '@/lib/api-logger';
import { cookieHeader, mergeSetCookies, parseCookieHeader } from '@/lib/cookie-jar';
import { getCiltSession, updateCiltSession } from '@/lib/cilt-session';
import { logError } from '@/lib/logger';

async function handlePost(request: NextRequest) {
  try {
    const { assessmentUrl } = await request.json();
    const session = await getCiltSession(request);

    if (!assessmentUrl || !session) {
      return NextResponse.json(
        { error: 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่' },
        { status: 401 }
      );
    }
    if (typeof assessmentUrl !== 'string' || !/^\/stdapp\/select-assessment\?/.test(assessmentUrl)) {
      return NextResponse.json({ error: 'URL แบบประเมินไม่ถูกต้อง' }, { status: 400 });
    }

    console.log('🔍 Fetching courses from assessment endpoint');

    // เข้าหน้า select-assessment ก่อน
    const selectResponse = await fetch(`https://ciltapp.wu.ac.th${assessmentUrl}`, {
      method: 'GET',
      headers: {
        'Cookie': session.cookies,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      redirect: 'manual',
    });

    // DEBUG_LOG - ลบก่อน production
    console.log('📍 Select page status:', selectResponse.status);
    console.log('📍 Select page redirect:', Boolean(selectResponse.headers.get('location')));

    // เช็คว่า redirect กลับไปหน้า login หรือไม่ (session หมดอายุ)
    if (selectResponse.status === 302 || selectResponse.status === 301) {
      const location = selectResponse.headers.get('location');
      if (location && location.includes('/site/login')) {
        return NextResponse.json(
          { error: 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่' },
          { status: 401 }
        );
      }
    }

    // เอา cookies ใหม่และรวมกับของเดิม
    const newCookiesArray = selectResponse.headers.getSetCookie();
    const finalCookies = cookieHeader(mergeSetCookies(parseCookieHeader(session.cookies), newCookiesArray));
    await updateCiltSession(session.id, finalCookies);

    console.log('🍪 Session cookies refreshed');

    // เข้าหน้า render-course-list
    const courseListResponse = await fetch('https://ciltapp.wu.ac.th/stdapp/render-course-list', {
      method: 'GET',
      headers: {
        'Cookie': finalCookies,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    // DEBUG_LOG - ลบก่อน production
    console.log('📍 Course list page status:', courseListResponse.status);

    if (!courseListResponse.ok) {
      await courseListResponse.text();
      console.error('❌ Course list request failed:', courseListResponse.status);
      return NextResponse.json(
        { error: 'ไม่สามารถดึงรายการวิชาได้' },
        { status: 500 }
      );
    }

    const html = await courseListResponse.text();
    const $ = cheerio.load(html);

    // หา div.row.gx-2
    const rowGx2 = $('.row.gx-2');

    // หา div.col-md-3.mb-3 ทั้งหมด
    const courses = rowGx2.find('.col-md-3.mb-3');
    const courseCount = courses.length;

    // DEBUG_LOG - ลบก่อน production
    console.log('📚 Found courses:', courseCount);

    console.log('🔍 Course markup parsed');

    // ดึงข้อมูลแต่ละวิชา
    const courseList: Array<{
      id: number;
      courseKey: number;
      name: string;
      code: string;
      url: string;
      isCompleted: boolean;
      html: string;
    }> = [];

    courses.each(function(index) {
      const element = $(this);
      const text = element.text().trim();
      const html = element.html() || '';

      // ดึงรหัสวิชาจาก span.course-code
      const codeElement = element.find('.course-code').first();
      const codeText = codeElement.text().trim();
      // Extract just the course code (e.g., "CME66-345" from "CME66-345 ( กลุ่ม 1 )")
      const codeMatch = codeText.match(/^([A-Z0-9-]+)/);
      const code = codeMatch ? codeMatch[1] : codeText;

      // The CILT fa-circle-check icon is present even on a course whose form is
      // still editable (including immediately after reset-answer). It is not a
      // completion signal. Only an explicit status message may block a course.
      const statusElement = element.find('.card-menu-status').first();
      const statusText = statusElement.text().trim();
      const isCompleted = /ประเมินแล้ว|เสร็จ|completed/i.test(statusText);

      // ดึงชื่อวิชาจาก p.mini-size หรือ lines
      const nameElement = element.find('.mini-size span').first();
      let name = nameElement.text().trim();
      if (!name) {
        const lines = text.split('\n').map(l => l.trim()).filter(l => l);
        name = lines[1] || lines[0] || 'ไม่ระบุ';
      }

      // CILT's current card key is data-value; fall back to an explicit URL key.
      const dataValue = element.attr('data-value') || element.find('[data-value]').first().attr('data-value') || '';
      const dataValueKey = /^\d+$/.test(dataValue) ? Number(dataValue) : null;
      // หาลิงก์จาก <a href="..."> หรือ onclick
      let url = '';
      const link = element.find('a[href]').first();
      if (link.length > 0) {
        url = link.attr('href') || '';
      } else {
        // ลองหาจาก onclick
        const onclickAttr = element.attr('onclick') || element.find('[onclick]').first().attr('onclick') || '';
        const urlMatch = onclickAttr.match(/location\.href='([^']+)'/);
        if (urlMatch) {
          url = urlMatch[1];
        }
      }

      courseList.push({
        id: index,
        courseKey: dataValueKey ?? Number(url.match(/[?&]key=(\d+)/)?.[1] ?? index),
        name: name,
        code: code,
        url: url,
        isCompleted: isCompleted,
        html: html.substring(0, 500),
      });
    });

    console.log('📋 Course list normalized:', courseList.length);

    return NextResponse.json({
      success: true,
      message: 'ดึงรายการวิชาสำเร็จ',
      data: {
        courseCount,
        courseList,
      },
    });

  } catch (error) {
    const errorId = logError('get-courses.failed', error);
    return NextResponse.json(
      { error: 'เกิดข้อผิดพลาดในการดึงรายการวิชา', errorId },
      { status: 500 }
    );
  }
}

export const POST = withApiLogging('get-courses', handlePost);
