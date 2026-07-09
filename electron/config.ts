import * as fs from 'fs';
import * as path from 'path';

const envPath = path.join(__dirname, '../.env');
const envPathAlt = path.join(process.cwd(), '.env');
const finalEnvPath = fs.existsSync(envPath) ? envPath : (fs.existsSync(envPathAlt) ? envPathAlt : '');

let googleSheetsWebappUrl = '';

if (finalEnvPath) {
  try {
    const envContent = fs.readFileSync(finalEnvPath, 'utf-8');
    const match = envContent.match(/GOOGLE_SHEETS_WEBAPP_URL\s*=\s*["']?([^"'\r\n]+)["']?/);
    if (match && match[1]) {
      googleSheetsWebappUrl = match[1].trim();
    }
  } catch (err) {
    console.error('Failed to parse .env file:', err);
  }
}

console.log('[CONFIG LOG] 로드된 구글 웹앱 URL:', googleSheetsWebappUrl ? (googleSheetsWebappUrl.slice(0, 45) + '...') : '없음');

export const CONFIG = {
  GOOGLE_SHEETS_WEBAPP_URL: googleSheetsWebappUrl || 'https://script.google.com/macros/s/dummy/exec'
};
