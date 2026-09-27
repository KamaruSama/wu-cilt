import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { withApiLogging } from '@/lib/api-logger';
import { cookieHeader, mergeSetCookies } from '@/lib/cookie-jar';
import { CILT_SESSION_COOKIE, createCiltSession } from '@/lib/cilt-session';
import { logError } from '@/lib/logger';
import { isSameOriginRequest, withinRateLimit } from '@/lib/request-guard';

async function handlePost(request: NextRequest) {
  try {
    if (!isSameOriginRequest(request)) {
      return NextResponse.json({ error: 'Origin ของคำขอไม่ถูกต้อง' }, { status: 403 });
    }
    if (!await withinRateLimit(request, 'login', 30, 10 * 60 * 1000)) {
      return NextResponse.json({ error: 'ลองเข้าสู่ระบบบ่อยเกินไป กรุณารอ 10 นาที' }, { status: 429 });
    }
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: 'กรุณากรอกรหัสนักศึกษาและรหัสผ่าน' },
        { status: 400 }
      );
    }

    // ขั้นตอนที่ 1: ดึงหน้า login เพื่อเอา CSRF token
    const loginPageResponse = await fetch('https://ciltapp.wu.ac.th/site/login', {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    const loginPageHtml = await loginPageResponse.text();

    // เอา cookies ทั้งหมดจากหน้า login
    const cookies = mergeSetCookies({}, loginPageResponse.headers.getSetCookie());

    // Parse HTML ด้วย cheerio
    const $ = cheerio.load(loginPageHtml);

    // หา CSRF token
    const csrfToken = $('input[name="_csrf"]').val() as string;

    if (!csrfToken) {
      return NextResponse.json(
        { error: 'ไม่พบ CSRF token' },
        { status: 500 }
      );
    }

    // เช็ค role select
    const roleSelect = $('select[name="LoginForm[role]"]');
    const studentOption = roleSelect.find('option').filter(function() {
      return $(this).text().trim() === 'Student' || $(this).val() === 'Student';
    });

    if (studentOption.length === 0) {
      return NextResponse.json(
        { error: 'ไม่พบตัวเลือก Student ในระบบ' },
        { status: 500 }
      );
    }

    // ขั้นตอนที่ 2: ส่ง POST request เพื่อ login
    const formData = new URLSearchParams({
      '_csrf': csrfToken,
      'LoginForm[role]': 'S',
      'LoginForm[username]': username,
      'LoginForm[password]': password,
      'LoginForm[rememberMe]': '0',
    });

    const loginResponse = await fetch('https://ciltapp.wu.ac.th/site/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookieHeader(cookies),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Origin': 'https://ciltapp.wu.ac.th',
        'Referer': 'https://ciltapp.wu.ac.th/site/login',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      body: formData.toString(),
      redirect: 'manual',
    });

    // DEBUG_LOG - ลบก่อน production
    console.log('📍 Login response status:', loginResponse.status);
    console.log('📍 Login response redirect:', Boolean(loginResponse.headers.get('location')));

    // เอา cookies หลัง login และรวมกับ cookies เดิม
    const loginCookies = mergeSetCookies(cookies, loginResponse.headers.getSetCookie());

    // ขั้นตอนที่ 3: เข้าหน้า stdapp/index
    const indexPageResponse = await fetch('https://ciltapp.wu.ac.th/stdapp/index', {
      method: 'GET',
      headers: {
        'Cookie': cookieHeader(loginCookies),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      redirect: 'manual',
    });

    // DEBUG_LOG - ลบก่อน production
    console.log('📍 Index page status:', indexPageResponse.status);
    console.log('📍 Index page redirect:', Boolean(indexPageResponse.headers.get('location')));

    // เช็คว่า redirect กลับไปหน้า login หรือไม่ (login ผิด)
    if (indexPageResponse.status === 302 || indexPageResponse.status === 301) {
      const location = indexPageResponse.headers.get('location');
      // DEBUG_LOG - ลบก่อน production
      console.log('⚠️ Login redirected to upstream login:', Boolean(location));
      if (location && location.includes('/site/login')) {
        return NextResponse.json(
          { error: 'CILT ปฏิเสธการเข้าสู่ระบบ กรุณาตรวจสอบรหัสนักศึกษาและรหัสผ่าน' },
          { status: 401 }
        );
      }
    }

    if (!indexPageResponse.ok && indexPageResponse.status !== 200) {
      // DEBUG_LOG - ลบก่อน production
      console.log('❌ Index page not OK:', indexPageResponse.status);
      return NextResponse.json(
        { error: 'CILT ไม่ตอบกลับหลังเข้าสู่ระบบ กรุณาลองใหม่อีกครั้ง' },
        { status: 401 }
      );
    }

    const indexPageHtml = await indexPageResponse.text();
    const $index = cheerio.load(indexPageHtml);

    // เช็คว่ามี login form อยู่ในหน้านี้หรือไม่ (แปลว่า login ผิด)
    const hasLoginForm = $index('form.login100-form').length > 0 || $index('input[name="LoginForm[username]"]').length > 0;
    // DEBUG_LOG - ลบก่อน production
    console.log('🔍 Has login form:', hasLoginForm);

    if (hasLoginForm) {
      return NextResponse.json(
          { error: 'CILT ปฏิเสธการเข้าสู่ระบบ กรุณาตรวจสอบรหัสนักศึกษาและรหัสผ่าน' },
        { status: 401 }
      );
    }

    // หาจำนวน div.col-md-3 ที่มี div.ass-menu ภายใน
    const rowGFlex = $index('.row.g-flex.justify-content-center.gx-row');
    const colMd3WithAssMenu = rowGFlex.find('.col-md-3').filter(function() {
      return $index(this).find('.ass-menu').length > 0;
    });
    const colMd3Count = colMd3WithAssMenu.length;

    // เตือนถ้าไม่เจอ div.ass-menu
    if (colMd3Count === 0) {
      return NextResponse.json(
        { error: 'เข้าสู่ CILT สำเร็จ แต่ไม่มีแบบประเมินที่เปิดให้ทำในขณะนี้' },
        { status: 409 }
      );
    }

    // ดึงข้อมูลการประเมินแต่ละรายการ
    const assessmentList: Array<{
      id: number;
      title: string;
      department: string;
      semester: string;
      url: string;
    }> = [];

    colMd3WithAssMenu.each(function(index) {
      const element = $index(this);
      const assMenu = element.find('.ass-menu');

      // ดึงข้อมูลจาก HTML
      const textContent = assMenu.text();
      const lines = textContent.split('\n').map(l => l.trim()).filter(l => l);

      // ข้อความแรกคือชื่อการประเมิน เช่น "ระหว่างภาคเรียน 2/68"
      const title = lines[0] || 'ไม่ระบุ';

      // หาคณะ/หน่วยงาน จาก <p>
      const department = assMenu.find('p').contents().filter(function() {
        return this.type === 'text';
      }).text().trim() || 'ไม่ระบุ';

      // หาภาคการศึกษา จาก span.ag-courses-item_date
      const semester = assMenu.find('.ag-courses-item_date').text().trim() || '';

      // ดึง URL จาก onclick
      const onclickAttr = assMenu.attr('onclick') || '';
      const urlMatch = onclickAttr.match(/location\.href='([^']+)'/);
      const url = urlMatch ? urlMatch[1] : '';

      assessmentList.push({
        id: index,
        title: title,
        department: department,
        semester: semester,
        url: url,
      });
    });

    console.log('📋 Assessment list loaded:', assessmentList.length);

    const session = await createCiltSession(cookieHeader(loginCookies));
    const response = NextResponse.json({
      success: true,
      message: 'เข้าสู่ระบบสำเร็จ',
      data: {
        username,
        assessmentCount: colMd3Count,
        assessmentList,
      },
    });
    response.cookies.set(CILT_SESSION_COOKIE, session.id, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
      maxAge: session.maxAge,
    });
    return response;

  } catch (error) {
    const errorId = logError('login.failed', error);
    return NextResponse.json(
      { error: 'เกิดข้อผิดพลาดในการเชื่อมต่อ', errorId },
      { status: 500 }
    );
  }
}

export const POST = withApiLogging('login', handlePost);
