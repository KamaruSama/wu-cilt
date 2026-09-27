import { NextResponse } from 'next/server';
import { withApiLogging } from '@/lib/api-logger';

async function handlePost() {
  return NextResponse.json(
    { success: false, error: 'เส้นทาง Puppeteer ถูกปิดเพื่อป้องกันการรายงานผลผิดพลาด กรุณาใช้ submit-rating-v2' },
    { status: 410 }
  );
}

export const POST = withApiLogging('submit-rating-puppeteer', handlePost);
