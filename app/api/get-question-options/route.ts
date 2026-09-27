import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { withApiLogging } from '@/lib/api-logger';
import { logError } from '@/lib/logger';

async function handlePost(request: NextRequest) {
  try {
    const { cookies, questionKey, courseIndex } = await request.json();

    if (!cookies || questionKey === undefined) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Note: The session must already be in the right state (after validate-course-info)
    // This should be called only after the course flow is complete

    // Fetch the question options from the server
    const response = await fetch(`https://ciltapp.wu.ac.th/stdapp/all-officer?key=${questionKey}`, {
      method: 'GET',
      headers: {
        'Cookie': cookies,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    const html = await response.text();
    if (!response.ok) {
      throw new Error(`CILT question request failed (HTTP ${response.status})`);
    }

    console.log('🔍 Question markup received:', response.status);

    // Parse options from HTML
    // Format: <input ... onclick="selectOpt(1, 1)"> <label for="o11">Label text</label>
    // Note: There might be line breaks between input and label
    const $ = cheerio.load(html);
    const inputMatches: Array<{ optionId: number; inputId: string }> = [];
    $('[onclick*="selectOpt"]').each((_, element) => {
      const onclick = $(element).attr('onclick') || '';
      const match = onclick.match(/selectOpt\((\d+),\s*\d+\)/);
      const inputId = $(element).attr('id');
      if (match && inputId) inputMatches.push({ optionId: Number(match[1]), inputId });
    });

    const optionsMap = new Map<number, string>();
    for (const match of inputMatches) {
      const label = $(`label[for="${match.inputId}"]`).text().trim();
      if (label && !optionsMap.has(match.optionId)) {
        optionsMap.set(match.optionId, label);
      }
    }

    // Convert to array and sort by option ID
    const options = Array.from(optionsMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([id, label]) => ({ id, label }));

    console.log(`📋 Question options parsed: ${options.length}`);

    return NextResponse.json({
      success: true,
      data: { options }
    });

  } catch (error) {
    const errorId = logError('get-question-options.failed', error);
    return NextResponse.json(
      {
        success: false,
        error: 'ไม่สามารถดึงตัวเลือกคำถามได้',
        errorId
      },
      { status: 500 }
    );
  }
}

export const POST = withApiLogging('get-question-options', handlePost);
